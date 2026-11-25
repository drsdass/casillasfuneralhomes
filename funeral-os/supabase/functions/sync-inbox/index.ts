// supabase/functions/sync-inbox/index.ts
//
// Checks the funeral home's shared mailbox (Outlook / Microsoft 365, or Gmail) for new messages and matches each to a case:
//   1. Same conversation as an email already filed to a case  -> auto-matched
//   2. Sender is a known case contact                         -> auto-matched
//   3. Otherwise ask Claude (Haiku, cheap) to suggest a case  -> "suggested" for staff to confirm
//   4. Nothing fits                                           -> "unmatched"
// Nothing is filed to a family's case without a known sender/thread or a person confirming.
//
// Each company (Casillas, Sanders...) has its own mailbox connection and only ever files to its own cases.
//
// Looks in every folder except Sent, Drafts, Deleted and Junk, so mail staff file into Outlook folders is still seen.
// Uses the sign-in saved by the "Connect Outlook mailbox" button (table mail_connection).
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "sync-inbox", and turn OFF "Verify JWT"
// (it is protected by SYNC_SECRET instead). Run it every 3 minutes with the cron block in src/db/mail.sql.
// Secrets: SYNC_SECRET, ANTHROPIC_API_KEY, plus MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET (Outlook) and/or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Gmail).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const GRAPH = 'https://graph.microsoft.com/v1.0'
// Immutable ids stay the same when staff move a message between Outlook folders; text bodies are easier to store.
const _fetch = globalThis.fetch.bind(globalThis)
const fetchT = (u: string | URL | Request, o: RequestInit = {}) => _fetch(u, { ...o, signal: AbortSignal.timeout(20000) })
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text"'

async function accessToken(orgId: string): Promise<{ token: string; address: string; provider: 'microsoft' | 'google' }> {
  const { data: conn } = await supabase.from('mail_connection').select('*').eq('org_id', orgId).maybeSingle()
  if (!conn?.refresh_token) throw new Error('Email is not connected yet. An admin needs to press "Connect" in Email Inbox.')
  const provider: 'microsoft' | 'google' = conn.provider === 'google' ? 'google' : 'microsoft'
  const res = provider === 'google'
    ? await fetchT('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
      })
    : await fetchT(`https://login.microsoftonline.com/${conn.tenant || env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), grant_type: 'refresh_token',
          refresh_token: conn.refresh_token, scope: 'offline_access Mail.Read Mail.Send User.Read',
        }),
      })
  if (!res.ok) {
    const text = await res.text()
    await supabase.from('mail_connection').update({ status: 'needs_reconnect', last_error: text.slice(0, 300) }).eq('org_id', orgId)
    throw new Error(`The email sign-in needs to be renewed: ${text.slice(0, 200)}`)
  }
  const d = await res.json()
  const patch: Record<string, unknown> = {}
  if (d.refresh_token && d.refresh_token !== conn.refresh_token) patch.refresh_token = d.refresh_token
  if (conn.status !== 'ok') { patch.status = 'ok'; patch.last_error = null }
  if (Object.keys(patch).length) await supabase.from('mail_connection').update(patch).eq('org_id', orgId)
  return { token: d.access_token, address: String(conn.address ?? '').toLowerCase(), provider }
}

/** One received email in a shape both Outlook and Gmail are turned into. */
interface Norm {
  id: string; threadId: string; rfcId: string | null; subject: string; text: string; preview: string
  fromAddr: string; fromName: string | null; receivedAt: string
  attachments: { id: string; filename: string; contentType: string; sizeBytes: number }[]
}

// ---------- Gmail helpers ----------
function b64urlToBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0))
}
const b64urlToText = (s: string) => new TextDecoder().decode(b64urlToBytes(s))
function htmlToText(h: string): string {
  return h.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim()
}
// deno-lint-ignore no-explicit-any
function gmailWalk(part: any, out: { plain: string[]; html: string[]; files: any[] }) {
  if (!part) return
  const mime = String(part.mimeType ?? '')
  const hdr = (n: string) => String((part.headers ?? []).find((h: { name: string }) => h.name.toLowerCase() === n)?.value ?? '')
  if (part.filename && part.body?.attachmentId) {
    const inlineImage = hdr('content-id') && /^inline/i.test(hdr('content-disposition'))
    if (!inlineImage) out.files.push({ id: part.body.attachmentId, filename: part.filename, contentType: mime, sizeBytes: Number(part.body.size ?? 0) })
  } else if (mime === 'text/plain' && part.body?.data) out.plain.push(b64urlToText(part.body.data))
  else if (mime === 'text/html' && part.body?.data) out.html.push(b64urlToText(part.body.data))
  for (const p of part.parts ?? []) gmailWalk(p, out)
}
async function gmailNormalize(headers: Record<string, string>, id: string): Promise<Norm | null> {
  const r = await fetchT(`${GMAIL}/messages/${id}?format=full`, { headers })
  if (!r.ok) throw new Error(`Gmail could not open a message: ${(await r.text()).slice(0, 200)}`)
  const m = await r.json()
  const labels: string[] = m.labelIds ?? []
  if (labels.includes('SENT') || labels.includes('DRAFT') || labels.includes('TRASH') || labels.includes('SPAM')) return null
  const h = (n: string) => String((m.payload?.headers ?? []).find((x: { name: string }) => x.name.toLowerCase() === n)?.value ?? '')
  const from = h('from')
  const mm = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  const fromAddr = (mm ? mm[2] : from).trim().toLowerCase()
  const fromName = mm ? (mm[1].trim() || null) : null
  const parts = { plain: [] as string[], html: [] as string[], files: [] as Norm['attachments'] }
  gmailWalk(m.payload, parts)
  const text = (parts.plain.join('\n').trim() || htmlToText(parts.html.join('\n'))).trim()
  return {
    id: m.id, threadId: m.threadId, rfcId: h('message-id') || null, subject: h('subject'), text, preview: String(m.snippet ?? ''),
    fromAddr, fromName, receivedAt: new Date(Number(m.internalDate)).toISOString(), attachments: parts.files,
  }
}

/** Cheap, fast classification — Haiku is plenty for "does this email relate to case X". */
async function suggestCaseMatch(subject: string, text: string, openCases: { id: string; label: string }[]) {
  if (openCases.length === 0) return null
  const res = await fetchT('https://api.anthropic.com/v1/messages', {
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

async function syncOrg(orgId: string, backfillDays: number) {
    const { token, address: myAddress, provider } = await accessToken(orgId)
    const headers: Record<string, string> = provider === 'google' ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}`, Prefer: PREFER }

    const syncKey = `inbox_last_synced:${orgId}`
    const { data: st } = await supabase.from('sync_state').select('value').eq('key', syncKey).maybeSingle()
    const lastMs = st?.value ? new Date(st.value).getTime() : Date.now() - 3 * 24 * 3600 * 1000
    const sinceMs = backfillDays ? Date.now() - backfillDays * 24 * 3600 * 1000 : lastMs - 10 * 60 * 1000 // 10 minutes of overlap; duplicates are skipped below

    // Step 1: find the ids of candidate messages (Outlook: the whole message; Gmail: just the id, opened later only if new).
    // deno-lint-ignore no-explicit-any
    let items: { id: string; raw?: any }[] = []
    if (provider === 'google') {
      const q = `after:${Math.floor(sinceMs / 1000)} -in:sent -in:drafts`
      let pageToken = ''
      for (let i = 0; i < (backfillDays ? 20 : 4); i++) {
        console.log('gmail listing page', i)
        const r: Response = await fetchT(`${GMAIL}/messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers })
        if (!r.ok) throw new Error(`Gmail list failed: ${(await r.text()).slice(0, 300)}`)
        const d = await r.json()
        items.push(...(d.messages ?? []).map((x: { id: string }) => ({ id: x.id })))
        pageToken = d.nextPageToken ?? ''
        if (!pageToken) break
      }
    } else {
      const skipFolders = new Set<string>() // Sent, Drafts, Deleted and Junk are ignored
      for (const name of ['sentitems', 'drafts', 'deleteditems', 'junkemail']) {
        const r = await fetchT(`${GRAPH}/me/mailFolders/${name}?$select=id`, { headers })
        if (r.ok) skipFolders.add((await r.json()).id)
      }
      const since = new Date(sinceMs).toISOString()
      // deno-lint-ignore no-explicit-any
      const msgs: any[] = []
      let url: string | null = `${GRAPH}/me/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since} and isDraft eq false`)}&$orderby=receivedDateTime desc&$top=50&$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,receivedDateTime,hasAttachments,parentFolderId`
      for (let i = 0; i < (backfillDays ? 20 : 4) && url; i++) {
        console.log('listing page', i)
        const r: Response = await fetchT(url, { headers })
        if (!r.ok) throw new Error(`Outlook list failed: ${await r.text()}`)
        const d = await r.json()
        msgs.push(...(d.value ?? []))
        url = d['@odata.nextLink'] ?? null
      }
      items = msgs.filter((m) => !skipFolders.has(m.parentFolderId)).map((m) => ({ id: m.id, raw: m }))
    }
    if (items.length === 0) return { synced: 0, skippedOwn: 0, problems: [] as string[], more: false }

    // Step 2: drop what is already saved, oldest first.
    const { data: have } = await supabase.from('inbound_emails').select('graph_message_id').in('graph_message_id', items.map((m) => m.id))
    const known = new Set((have ?? []).map((r) => r.graph_message_id))
    let fresh = items.filter((m) => !known.has(m.id)).reverse()
    const more = backfillDays && fresh.length > 15
    if (backfillDays) fresh = fresh.slice(0, 15) // small batches so the run never times out

    const { data: contacts } = await supabase.from('case_contacts').select('email, case_id, name, cases!inner(org_id)').eq('cases.org_id', orgId)
    const contactByEmail = new Map((contacts ?? []).filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]))
    const { data: openCases } = await supabase.from('cases').select('id, case_number, decedent_first_name, decedent_last_name').eq('org_id', orgId).neq('status', 'completed')
    const caseOptions = (openCases ?? []).map((c) => ({ id: c.id, label: `${c.decedent_first_name} ${c.decedent_last_name} (${c.case_number})` }))

    let latest = lastMs
    let saved = 0
    let pushCount = 0
    let skippedOwn = 0
    let lastFrom = ''
    let lastSubject = ''
    const problems: string[] = []
    let stuck = false
    for (const it of fresh) {
      // Step 3: turn it into one common shape.
      let n: Norm | null
      if (provider === 'google') {
        n = await gmailNormalize(headers, it.id)
      } else {
        const m = it.raw
        let attachments: Norm['attachments'] = []
        if (m.hasAttachments) {
          const ar = await fetchT(`${GRAPH}/me/messages/${m.id}/attachments?$select=id,name,contentType,size,isInline`, { headers })
          if (ar.ok) {
            // deno-lint-ignore no-explicit-any
            attachments = ((await ar.json()).value ?? []).filter((a: any) => !a.isInline && String(a['@odata.type'] ?? '').includes('fileAttachment'))
              // deno-lint-ignore no-explicit-any
              .map((a: any) => ({ id: a.id, filename: a.name, contentType: a.contentType, sizeBytes: a.size }))
          }
        }
        n = {
          id: m.id, threadId: m.conversationId, rfcId: m.internetMessageId ?? null, subject: m.subject || '', text: String(m.body?.content ?? '').trim(),
          preview: String(m.bodyPreview ?? ''), fromAddr: String(m.from?.emailAddress?.address ?? '').toLowerCase(),
          fromName: m.from?.emailAddress?.name ?? null, receivedAt: m.receivedDateTime, attachments,
        }
      }
      if (!n) { skippedOwn++; continue } // sent / draft / trash: not ours to file
      if (!n.fromAddr || n.fromAddr === myAddress) { // our own mail
        skippedOwn++
        if (!stuck) latest = Math.max(latest, new Date(n.receivedAt).getTime())
        continue
      }

      // Step 4: file it to a case.
      const subject = n.subject || '(no subject)'
      let row: Record<string, unknown> = {
        org_id: orgId, graph_message_id: n.id, thread_id: n.threadId, rfc_message_id: n.rfcId,
        direction: 'in', from_address: n.fromAddr, from_name: n.fromName, to_address: myAddress || null,
        subject, preview: n.preview.slice(0, 300), body: n.text.slice(0, 20000),
        received_at: n.receivedAt, attachments: n.attachments,
      }
      const { data: sameThread } = await supabase.from('inbound_emails').select('case_id')
        .eq('org_id', orgId).eq('thread_id', n.threadId).not('case_id', 'is', null).neq('match_status', 'ignored').limit(1)
      const contact = contactByEmail.get(n.fromAddr)
      if (sameThread && sameThread.length) {
        row = { ...row, case_id: sameThread[0].case_id, match_status: 'auto_matched', match_reason: 'Part of a conversation already filed to this case' }
      } else if (contact) {
        row = { ...row, case_id: contact.case_id, match_status: 'auto_matched', match_reason: `Sender matches contact ${contact.name}` }
      } else if (looksLikeJunk(subject, n.preview, n.text)) {
        row = { ...row, match_status: 'unmatched', match_reason: 'Looks like marketing or phishing', junk: true }
      } else {
        const sg = await suggestCaseMatch(subject, n.text || n.preview, caseOptions)
        row = sg && sg.confidence >= 0.6
          ? { ...row, case_id: sg.caseId, match_status: 'suggested', match_confidence: sg.confidence, match_reason: sg.reason }
          : { ...row, match_status: 'unmatched' }
      }
      const { error } = await supabase.from('inbound_emails').upsert(row, { onConflict: 'graph_message_id' })
      if (error) { stuck = true; problems.push(error.message) } else {
        saved++
        if (!row.junk) pushCount++
        if (!row.junk) { lastFrom = n.fromName || n.fromAddr; lastSubject = subject }
        if (!stuck) latest = Math.max(latest, new Date(n.receivedAt).getTime()) // never move past a mail that failed to save
      }
    }
    if (!backfillDays && latest > lastMs) await supabase.from('sync_state').upsert({ key: syncKey, value: new Date(latest).toISOString() })
    // Tell on-duty staff's phones (never during a catch-up, so old mail doesn't buzz anyone).
    if (pushCount > 0 && !backfillDays) await pingPush(orgId, pushCount, lastFrom, lastSubject)
    return { synced: saved, skippedOwn, problems: problems.slice(0, 3), more: !!more }
}

// Obvious marketing / phishing goes to the "Junk & Marketing" tab and never buzzes phones. Nothing is deleted.
// (Same word lists as src/lib/emailJunk.ts. Mail from a known contact or part of a filed conversation is never junk.)
const JUNK_WORDS = [
  'verify your account', 'verify your email', 'verify your identity', 'confirm your identity', 'confirm your password',
  'account will be suspended', 'account has been suspended', 'account will be closed', 'account will be deactivated', 'account has been locked',
  'password will expire', 'password expires', 'unusual sign-in', 'unusual activity', 'security alert', 'mailbox is full', 'storage is full',
  'gift card', 'wire transfer', 'dear customer', 'dear user', 'dear account holder', 'dear valued customer', 'click the link below to', 'update your payment',
  'unsubscribe', 'view in browser', 'view this email in your browser', 'manage your preferences', 'email preferences', 'newsletter',
  '% off', 'save thousands', 'lowest price', 'limited time', 'act now', 'free shipping', 'special offer', 'exclusive deal', 'buy now', 'order now',
  'best price', 'clearance', 'flash sale', 'webinar', 'free trial', 'promo code', 'this is an advertisement',
]
function looksLikeJunk(subject: string, preview: string, text: string): boolean {
  const hay = `${subject} ${preview} ${text.slice(0, 4000)}`.toLowerCase()
  return JUNK_WORDS.some((w) => hay.includes(w))
}

async function pingPush(orgId: string, count: number, from: string, subject: string) {
  try {
    await fetchT(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-secret': env('SYNC_SECRET') },
      body: JSON.stringify({ type: 'email', orgId, count, from, subject }),
    })
  } catch { /* notifications are a bonus; never let them break the mail check */ }
}

Deno.serve(async (req) => {
  try {
    const secret = env('SYNC_SECRET')
    if (!secret || req.headers.get('x-sync-secret') !== secret) return json({ error: 'Not allowed' }, 401)

    // Optional one-time catch-up: POST {"days":60} to also pull older mail. Safe to repeat; known messages are skipped.
    let backfillDays = 0
    try { backfillDays = Math.min(120, Math.max(0, Number((await req.json())?.days) || 0)) } catch { /* normal scheduled run has no body */ }

    // One check covers every connected company mailbox; a problem with one never blocks the other.
    const { data: conns } = await supabase.from('mail_connection').select('org_id').not('refresh_token', 'is', null).not('org_id', 'is', null)
    const out = { synced: 0, skippedOwn: 0, problems: [] as string[], more: false }
    for (const c of conns ?? []) {
      try {
        const r = await syncOrg(c.org_id, backfillDays)
        out.synced += r.synced; out.skippedOwn += r.skippedOwn; out.problems.push(...r.problems); out.more = out.more || r.more
      } catch (err) {
        console.error(c.org_id, err)
        out.problems.push(String(err instanceof Error ? err.message : err).slice(0, 200))
      }
    }
    return json({ ...out, problems: out.problems.slice(0, 5) })
  } catch (err) {
    console.error(err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
