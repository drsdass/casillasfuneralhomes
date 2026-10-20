// supabase/functions/email-send/index.ts
//
// Sends an email FROM the funeral home's shared Outlook mailbox on behalf of a signed-in staff member,
// and records exactly who sent it (name, time, case) in the email list and the audit log.
// Every message ends with the sender's name, so the family can see who wrote to them too.
// Replies to an email stay in the same Outlook conversation; the message also appears in Outlook's Sent Items.
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "email-send", leave "Verify JWT" ON
// (the staff member's own login is how we know who is sending).
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (Outlook) and/or GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Gmail)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } })
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const GRAPH = 'https://graph.microsoft.com/v1.0'
const CAN_SEND = ['super_admin', 'admin', 'manager', 'supervisor'] // same people who can manage the inbox
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

async function accessToken(orgId: string): Promise<{ token: string; address: string; provider: 'microsoft' | 'google' }> {
  const { data: conn } = await supabase.from('mail_connection').select('*').eq('org_id', orgId).maybeSingle()
  if (!conn?.refresh_token) throw new Error('Email is not connected yet. An admin needs to press "Connect" in Email Inbox.')
  const provider: 'microsoft' | 'google' = conn.provider === 'google' ? 'google' : 'microsoft'
  const res = provider === 'google'
    ? await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
      })
    : await fetch(`https://login.microsoftonline.com/${conn.tenant || env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
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
    throw new Error('The email connection needs to be renewed by an admin (Email Inbox, Reconnect).')
  }
  const d = await res.json()
  const patch: Record<string, unknown> = {}
  if (d.refresh_token && d.refresh_token !== conn.refresh_token) patch.refresh_token = d.refresh_token
  if (conn.status !== 'ok') { patch.status = 'ok'; patch.last_error = null }
  if (Object.keys(patch).length) await supabase.from('mail_connection').update(patch).eq('org_id', orgId)
  return { token: d.access_token, address: String(conn.address ?? '').toLowerCase(), provider }
}

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const toB64 = (bytes: Uint8Array) => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin) }
const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const utf8 = (t: string) => new TextEncoder().encode(t)
const mimeWord = (t: string) => (/^[\x20-\x7e]*$/.test(t) ? t : `=?UTF-8?B?${btoa(String.fromCharCode(...utf8(t)))}?=`)
/** A plain-text email in Gmail's format. Replies carry In-Reply-To/References so they stay in the same Gmail conversation. */
function gmailRaw(from: string, to: string, subject: string, text: string, replyToRfcId?: string | null): string {
  const b64body = toB64(utf8(text)).replace(/(.{76})/g, '$1\r\n')
  const lines = [
    `From: ${from}`, `To: ${to}`, `Subject: ${mimeWord(subject)}`, 'MIME-Version: 1.0',
    ...(replyToRfcId ? [`In-Reply-To: ${replyToRfcId}`, `References: ${replyToRfcId}`] : []),
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64body,
  ]
  return toB64Url(utf8(lines.join('\r\n')))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await supabase.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'Please sign in again.' }, 401)
    const { data: staff } = await supabase.from('staff_members').select('id, name, role, active, org_id, all_companies').eq('id', u.user.id).maybeSingle()
    if (!staff || !staff.active || !CAN_SEND.includes(staff.role)) return json({ error: 'Your account is not allowed to send email.' }, 403)

    const b = await req.json()
    const to = String(b.to ?? '').replace(/[\r\n]+/g, ' ').trim().toLowerCase()
    const subject = String(b.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300)
    const text = String(b.body ?? '').trim().slice(0, 20000)
    if (!EMAIL.test(to)) return json({ error: 'Please enter a valid email address.' }, 400)
    if (!subject || !text) return json({ error: 'Please add a subject and a message.' }, 400)

    // Which company's mailbox? The one the email or case belongs to; otherwise the company being worked in.
    let orgId: string | null = null
    if (b.replyToEmailId) orgId = (await supabase.from('inbound_emails').select('org_id').eq('id', b.replyToEmailId).maybeSingle()).data?.org_id ?? null
    if (!orgId && b.caseId) orgId = (await supabase.from('cases').select('org_id').eq('id', b.caseId).maybeSingle()).data?.org_id ?? null
    if (!orgId) orgId = b.orgId ?? staff.org_id
    const mayUse = orgId === staff.org_id || (staff.all_companies && ['super_admin', 'admin'].includes(staff.role))
    if (!mayUse) return json({ error: 'Your account is not allowed to send from that company.' }, 403)
    const { data: org } = await supabase.from('organizations').select('name').eq('id', orgId).maybeSingle()
    const companyName = org?.name ?? 'Casillas Funeral Home'

    const { token, address, provider } = await accessToken(orgId)
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const fullText = `${text}\n\n— ${staff.name}\n${companyName}`

    let threadId: string | null = null
    let caseId: string | null = b.caseId ?? null
    let replyRfc: string | null = null
    let sentAsReply = false
    if (b.replyToEmailId) {
      const { data: orig } = await supabase.from('inbound_emails').select('graph_message_id, thread_id, case_id, from_address, direction, rfc_message_id').eq('id', b.replyToEmailId).maybeSingle()
      if (orig) {
        threadId = orig.thread_id ?? null
        caseId = caseId ?? orig.case_id ?? null
        // A true reply (keeps the conversation and quoted message) when it goes back to the person who wrote.
        if (orig.direction === 'in' && orig.from_address?.toLowerCase() === to) {
          replyRfc = orig.rfc_message_id ?? null
          if (provider === 'microsoft') {
            const r = await fetch(`${GRAPH}/me/messages/${orig.graph_message_id}/reply`, {
              method: 'POST', headers: { ...auth, Prefer: 'IdType="ImmutableId"' }, body: JSON.stringify({ comment: fullText }),
            })
            sentAsReply = r.ok
          }
        }
      }
    }
    if (provider === 'google') {
      // Gmail: one send call; with the thread id and the original Message-ID it joins the same conversation.
      const r = await fetch(`${GMAIL}/messages/send`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ raw: gmailRaw(`${companyName} <${address}>`, to, subject, fullText, replyRfc), ...(threadId && replyRfc ? { threadId } : {}) }),
      })
      if (!r.ok) throw new Error(`Gmail could not send it: ${(await r.text()).slice(0, 300)}`)
      const sent = await r.json()
      if (!threadId) threadId = sent.threadId ?? null
    } else if (!sentAsReply) {
      const r = await fetch(`${GRAPH}/me/sendMail`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ message: { subject, body: { contentType: 'Text', content: fullText }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
      })
      if (!r.ok) throw new Error(`Outlook could not send it: ${(await r.text()).slice(0, 300)}`)
    }

    const row = {
      graph_message_id: `sent-${crypto.randomUUID()}`, thread_id: threadId, direction: 'out',
      from_address: address, from_name: companyName, to_address: to, org_id: orgId,
      subject, preview: text.slice(0, 300), body: fullText, received_at: new Date().toISOString(),
      case_id: caseId, match_status: 'confirmed', attachments: [], sent_by: staff.id, sent_by_name: staff.name,
    }
    const { data: saved, error } = await supabase.from('inbound_emails').insert(row).select().single()
    if (error) throw error
    return json({ ok: true, email: saved })
  } catch (err) {
    console.error(err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
