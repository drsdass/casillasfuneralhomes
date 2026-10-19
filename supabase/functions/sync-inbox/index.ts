// supabase/functions/sync-inbox/index.ts
//
// Checks the funeral home's shared Outlook (Microsoft 365) mailbox for new messages and matches each to a case:
//   1. Same conversation as an email already filed to a case  -> auto-matched
//   2. Sender is a known case contact                         -> auto-matched
//   3. Otherwise ask Claude (Haiku, cheap) to suggest a case  -> "suggested" for staff to confirm
//   4. Nothing fits                                           -> "unmatched"
// Nothing is filed to a family's case without a known sender/thread or a person confirming.
//
// Looks in every folder except Sent, Drafts, Deleted and Junk, so mail staff file into Outlook folders is still seen.
// Uses the sign-in saved by the "Connect Outlook mailbox" button (table mail_connection).
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "sync-inbox", and turn OFF "Verify JWT"
// (it is protected by SYNC_SECRET instead). Run it every 5 minutes with the cron block in src/db/mail.sql.
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, SYNC_SECRET, ANTHROPIC_API_KEY. See docs/outlook-setup.md.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const GRAPH = 'https://graph.microsoft.com/v1.0'
// Immutable ids stay the same when staff move a message between Outlook folders; text bodies are easier to store.
const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text"'

async function accessToken(): Promise<{ token: string; address: string }> {
  const { data: conn } = await supabase.from('mail_connection').select('*').eq('id', 1).maybeSingle()
  if (!conn?.refresh_token) throw new Error('Email is not connected yet. An admin needs to press "Connect Outlook mailbox" in Email Inbox.')
  const res = await fetch(`https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), grant_type: 'refresh_token',
      refresh_token: conn.refresh_token, scope: 'offline_access Mail.Read Mail.Send User.Read',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    await supabase.from('mail_connection').update({ status: 'needs_reconnect', last_error: text.slice(0, 300) }).eq('id', 1)
    throw new Error(`Microsoft sign-in needs to be renewed: ${text.slice(0, 200)}`)
  }
  const d = await res.json()
  const patch: Record<string, unknown> = {}
  if (d.refresh_token && d.refresh_token !== conn.refresh_token) patch.refresh_token = d.refresh_token
  if (conn.status !== 'ok') { patch.status = 'ok'; patch.last_error = null }
  if (Object.keys(patch).length) await supabase.from('mail_connection').update(patch).eq('id', 1)
  return { token: d.access_token, address: String(conn.address ?? '').toLowerCase() }
}

/** Cheap, fast classification — Haiku is plenty for "does this email relate to case X". */
async function suggestCaseMatch(subject: string, text: string, openCases: { id: string; label: string }[]) {
  if (openCases.length === 0) return null
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      system: 'You match an inbound email to a funeral home case by decedent name or context. Respond ONLY with JSON: {"caseId": "<id or null>", "confidence": 0-1, "reason": "short explanation"}. If no case plausibly matches, return {"caseId": null, "confidence": 0, "reason": "no match"}.',
      messages: [{ role: 'user', content: `Open cases:\n${openCases.map((c) => `- ${c.id}: ${c.label}`).join('\n')}\n\nEmail subject: ${subject}\nEmail text: ${text.slice(0, 600)}` }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  try {
    const p = JSON.parse((data.content[0].text as string).replace(/```json\s*|```\s*/g, '').trim())
    return p.caseId ? { caseId: p.caseId as string, confidence: Number(p.confidence), reason: String(p.reason) } : null
  } catch { return null }
}

Deno.serve(async (req) => {
  try {
    const secret = env('SYNC_SECRET')
    if (!secret || req.headers.get('x-sync-secret') !== secret) return json({ error: 'Not allowed' }, 401)

    const { token, address: myAddress } = await accessToken()
    const headers = { Authorization: `Bearer ${token}`, Prefer: PREFER }

    const { data: st } = await supabase.from('sync_state').select('value').eq('key', 'inbox_last_synced').maybeSingle()
    const lastMs = st?.value ? new Date(st.value).getTime() : Date.now() - 3 * 24 * 3600 * 1000
    const since = new Date(lastMs - 10 * 60 * 1000).toISOString() // 10 minutes of overlap; duplicates are skipped below

    // Folders we ignore.
    const skipFolders = new Set<string>()
    for (const name of ['sentitems', 'drafts', 'deleteditems', 'junkemail']) {
      const r = await fetch(`${GRAPH}/me/mailFolders/${name}?$select=id`, { headers })
      if (r.ok) skipFolders.add((await r.json()).id)
    }

    // deno-lint-ignore no-explicit-any
    const msgs: any[] = []
    let url: string | null = `${GRAPH}/me/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since} and isDraft eq false`)}&$orderby=receivedDateTime desc&$top=50&$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,receivedDateTime,hasAttachments,parentFolderId`
    for (let i = 0; i < 4 && url; i++) {
      const r: Response = await fetch(url, { headers })
      if (!r.ok) throw new Error(`Outlook list failed: ${await r.text()}`)
      const d = await r.json()
      msgs.push(...(d.value ?? []))
      url = d['@odata.nextLink'] ?? null
    }
    const candidates = msgs.filter((m) => !skipFolders.has(m.parentFolderId))
    if (candidates.length === 0) return json({ synced: 0 })

    const { data: have } = await supabase.from('inbound_emails').select('graph_message_id').in('graph_message_id', candidates.map((m) => m.id))
    const known = new Set((have ?? []).map((r) => r.graph_message_id))
    const fresh = candidates.filter((m) => !known.has(m.id)).reverse() // oldest first

    const { data: contacts } = await supabase.from('case_contacts').select('email, case_id, name')
    const contactByEmail = new Map((contacts ?? []).filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]))
    const { data: openCases } = await supabase.from('cases').select('id, case_number, decedent_first_name, decedent_last_name').neq('status', 'completed')
    const caseOptions = (openCases ?? []).map((c) => ({ id: c.id, label: `${c.decedent_first_name} ${c.decedent_last_name} (${c.case_number})` }))

    let latest = lastMs
    let saved = 0
    for (const m of fresh) {
      latest = Math.max(latest, new Date(m.receivedDateTime).getTime())
      const fromAddr = String(m.from?.emailAddress?.address ?? '').toLowerCase()
      if (!fromAddr || fromAddr === myAddress) continue // our own mail

      let attachments: { id: string; filename: string; contentType: string; sizeBytes: number }[] = []
      if (m.hasAttachments) {
        const ar = await fetch(`${GRAPH}/me/messages/${m.id}/attachments?$select=id,name,contentType,size,isInline`, { headers })
        if (ar.ok) {
          // deno-lint-ignore no-explicit-any
          attachments = ((await ar.json()).value ?? []).filter((a: any) => !a.isInline && String(a['@odata.type'] ?? '').includes('fileAttachment'))
            // deno-lint-ignore no-explicit-any
            .map((a: any) => ({ id: a.id, filename: a.name, contentType: a.contentType, sizeBytes: a.size }))
        }
      }
      const text = String(m.body?.content ?? '').trim()
      const subject = m.subject || '(no subject)'
      let row: Record<string, unknown> = {
        graph_message_id: m.id, thread_id: m.conversationId, rfc_message_id: m.internetMessageId ?? null,
        direction: 'in', from_address: fromAddr, from_name: m.from?.emailAddress?.name ?? null, to_address: myAddress || null,
        subject, preview: String(m.bodyPreview ?? '').slice(0, 300), body: text.slice(0, 20000),
        received_at: m.receivedDateTime, attachments,
      }

      const { data: sameThread } = await supabase.from('inbound_emails').select('case_id')
        .eq('thread_id', m.conversationId).not('case_id', 'is', null).neq('match_status', 'ignored').limit(1)
      const contact = contactByEmail.get(fromAddr)
      if (sameThread && sameThread.length) {
        row = { ...row, case_id: sameThread[0].case_id, match_status: 'auto_matched', match_reason: 'Part of a conversation already filed to this case' }
      } else if (contact) {
        row = { ...row, case_id: contact.case_id, match_status: 'auto_matched', match_reason: `Sender matches contact ${contact.name}` }
      } else {
        const s = await suggestCaseMatch(subject, text || String(m.bodyPreview ?? ''), caseOptions)
        row = s && s.confidence >= 0.6
          ? { ...row, case_id: s.caseId, match_status: 'suggested', match_confidence: s.confidence, match_reason: s.reason }
          : { ...row, match_status: 'unmatched' }
      }
      const { error } = await supabase.from('inbound_emails').upsert(row, { onConflict: 'graph_message_id' })
      if (!error) saved++
    }
    if (latest > lastMs) await supabase.from('sync_state').upsert({ key: 'inbox_last_synced', value: new Date(latest).toISOString() })
    return json({ synced: saved })
  } catch (err) {
    console.error(err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
