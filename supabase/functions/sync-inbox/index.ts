// supabase/functions/sync-inbox/index.ts
//
// Polls info@casillasfuneralhome.com via the Microsoft Graph API for new
// messages, then matches each one to a case:
//   1. Sender email matches a known case_contacts row → auto-matched
//   2. No match → ask Claude (Haiku, cheap) to suggest a case from the
//      subject/preview text → inserted as "suggested" for staff to confirm
//   3. Neither → inserted as "unmatched"
//
// Deploy: supabase functions deploy sync-inbox
// Schedule: supabase/functions/sync-inbox/cron — run every 5 minutes via
// Supabase's Scheduled Functions (Dashboard → Edge Functions → sync-inbox →
// Cron), or an external scheduler hitting this URL with the service role key.
//
// Required secrets (supabase secrets set):
//   MICROSOFT_TENANT_ID       — Azure AD tenant ID
//   MICROSOFT_CLIENT_ID       — App registration client ID
//   MICROSOFT_CLIENT_SECRET   — App registration client secret
//   MICROSOFT_MAILBOX         — info@casillasfuneralhome.com
//   ANTHROPIC_API_KEY         — for AI-assisted suggestion matching
//   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase, do not override
//
// Azure AD app registration needs the *application* permission
// `Mail.Read` (not delegated), admin-consented, and — critically — should
// be scoped to ONLY the info@ mailbox via an Exchange application access
// policy, not tenant-wide mail access. See README "Email inbox setup".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface GraphMessage {
  id: string
  subject: string
  bodyPreview: string
  from: { emailAddress: { address: string; name?: string } }
  receivedDateTime: string
  hasAttachments: boolean
}

async function fetchAttachmentMetadata(token: string, mailbox: string, messageId: string): Promise<Array<{ id: string; filename: string; contentType: string; sizeBytes: number }>> {
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments?$select=id,name,contentType,size`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return [] // don't fail the whole sync over one message's attachment list
  const data = await res.json()
  return (data.value ?? []).map((a: { id: string; name: string; contentType: string; size: number }) => ({
    id: a.id, filename: a.name, contentType: a.contentType, sizeBytes: a.size,
  }))
}


  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID')!
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Graph auth failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

async function fetchNewMessages(token: string, sinceIso: string): Promise<GraphMessage[]> {
  const mailbox = Deno.env.get('MICROSOFT_MAILBOX')!
  const filter = encodeURIComponent(`receivedDateTime gt ${sinceIso}`)
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph fetch failed: ${await res.text()}`)
  const data = await res.json()
  return data.value ?? []
}

/** Cheap, fast classification — Haiku is plenty for "does this email relate to case X" matching. */
async function suggestCaseMatch(
  subject: string,
  preview: string,
  openCases: { id: string; label: string }[]
): Promise<{ caseId: string; confidence: number; reason: string } | null> {
  if (openCases.length === 0) return null
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:
        'You match an inbound email to a funeral home case by decedent name or context. ' +
        'Respond ONLY with JSON: {"caseId": "<id or null>", "confidence": 0-1, "reason": "short explanation"}. ' +
        'If no case plausibly matches, return {"caseId": null, "confidence": 0, "reason": "no match"}.',
      messages: [{
        role: 'user',
        content:
          `Open cases:\n${openCases.map((c) => `- ${c.id}: ${c.label}`).join('\n')}\n\n` +
          `Email subject: ${subject}\nEmail preview: ${preview}`,
      }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  try {
    const parsed = JSON.parse(data.content[0].text)
    if (!parsed.caseId) return null
    return { caseId: parsed.caseId, confidence: parsed.confidence, reason: parsed.reason }
  } catch {
    return null
  }
}

Deno.serve(async () => {
  try {
    const token = await getGraphToken()

    // Track sync progress in a small key-value row rather than a full table.
    const { data: syncState } = await supabase.from('sync_state').select('value').eq('key', 'inbox_last_synced').single()
    const since = syncState?.value ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const messages = await fetchNewMessages(token, since)
    if (messages.length === 0) {
      return new Response(JSON.stringify({ synced: 0 }), { headers: { 'content-type': 'application/json' } })
    }

    // Known contacts: email -> case (for auto-matching)
    const { data: contacts } = await supabase.from('case_contacts').select('email, case_id, name')
    const contactByEmail = new Map((contacts ?? []).filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]))

    // Open cases for AI-assisted suggestion matching
    const { data: openCases } = await supabase
      .from('cases')
      .select('id, case_number, decedent_first_name, decedent_last_name')
      .neq('status', 'completed')
    const caseOptions = (openCases ?? []).map((c) => ({
      id: c.id,
      label: `${c.decedent_first_name} ${c.decedent_last_name} (${c.case_number})`,
    }))

    for (const msg of messages) {
      const senderEmail = msg.from?.emailAddress?.address?.toLowerCase() ?? ''
      const contact = contactByEmail.get(senderEmail)
      const attachments = msg.hasAttachments
        ? await fetchAttachmentMetadata(token, Deno.env.get('MICROSOFT_MAILBOX')!, msg.id)
        : []

      let row: Record<string, unknown> = {
        graph_message_id: msg.id,
        from_address: senderEmail,
        from_name: msg.from?.emailAddress?.name ?? null,
        subject: msg.subject,
        preview: msg.bodyPreview?.slice(0, 300) ?? '',
        received_at: msg.receivedDateTime,
        attachments,
      }

      if (contact) {
        row = { ...row, case_id: contact.case_id, match_status: 'auto_matched', match_reason: `Sender matches contact ${contact.name}` }
      } else {
        const suggestion = await suggestCaseMatch(msg.subject, msg.bodyPreview ?? '', caseOptions)
        if (suggestion && suggestion.confidence >= 0.6) {
          row = { ...row, case_id: suggestion.caseId, match_status: 'suggested', match_confidence: suggestion.confidence, match_reason: suggestion.reason }
        } else {
          row = { ...row, match_status: 'unmatched' }
        }
      }

      await supabase.from('inbound_emails').upsert(row, { onConflict: 'graph_message_id' })
    }

    const latest = messages[messages.length - 1].receivedDateTime
    await supabase.from('sync_state').upsert({ key: 'inbox_last_synced', value: latest })

    return new Response(JSON.stringify({ synced: messages.length }), { headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
})
