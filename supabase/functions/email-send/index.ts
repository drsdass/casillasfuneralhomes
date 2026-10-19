// supabase/functions/email-send/index.ts
//
// Sends an email FROM the funeral home's shared Outlook mailbox on behalf of a signed-in staff member,
// and records exactly who sent it (name, time, case) in the email list and the audit log.
// Every message ends with the sender's name, so the family can see who wrote to them too.
// Replies to an email stay in the same Outlook conversation; the message also appears in Outlook's Sent Items.
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "email-send", leave "Verify JWT" ON
// (the staff member's own login is how we know who is sending).
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (see docs/outlook-setup.md)

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
    throw new Error('The email connection needs to be renewed by an admin (Email Inbox, Connect Outlook mailbox).')
  }
  const d = await res.json()
  const patch: Record<string, unknown> = {}
  if (d.refresh_token && d.refresh_token !== conn.refresh_token) patch.refresh_token = d.refresh_token
  if (conn.status !== 'ok') { patch.status = 'ok'; patch.last_error = null }
  if (Object.keys(patch).length) await supabase.from('mail_connection').update(patch).eq('id', 1)
  return { token: d.access_token, address: String(conn.address ?? '').toLowerCase() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await supabase.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'Please sign in again.' }, 401)
    const { data: staff } = await supabase.from('staff_members').select('id, name, role, active').eq('id', u.user.id).maybeSingle()
    if (!staff || !staff.active || !CAN_SEND.includes(staff.role)) return json({ error: 'Your account is not allowed to send email.' }, 403)

    const b = await req.json()
    const to = String(b.to ?? '').replace(/[\r\n]+/g, ' ').trim().toLowerCase()
    const subject = String(b.subject ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300)
    const text = String(b.body ?? '').trim().slice(0, 20000)
    if (!EMAIL.test(to)) return json({ error: 'Please enter a valid email address.' }, 400)
    if (!subject || !text) return json({ error: 'Please add a subject and a message.' }, 400)

    const { token, address } = await accessToken()
    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const fullText = `${text}\n\n— ${staff.name}\nCasillas Funeral Home`

    let threadId: string | null = null
    let caseId: string | null = b.caseId ?? null
    let sentAsReply = false
    if (b.replyToEmailId) {
      const { data: orig } = await supabase.from('inbound_emails').select('graph_message_id, thread_id, case_id, from_address, direction').eq('id', b.replyToEmailId).maybeSingle()
      if (orig) {
        threadId = orig.thread_id ?? null
        caseId = caseId ?? orig.case_id ?? null
        // A true reply (keeps the conversation and quoted message) when it goes back to the person who wrote.
        if (orig.direction === 'in' && orig.from_address?.toLowerCase() === to) {
          const r = await fetch(`${GRAPH}/me/messages/${orig.graph_message_id}/reply`, {
            method: 'POST', headers: { ...auth, Prefer: 'IdType="ImmutableId"' }, body: JSON.stringify({ comment: fullText }),
          })
          sentAsReply = r.ok
        }
      }
    }
    if (!sentAsReply) {
      const r = await fetch(`${GRAPH}/me/sendMail`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ message: { subject, body: { contentType: 'Text', content: fullText }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }),
      })
      if (!r.ok) throw new Error(`Outlook could not send it: ${(await r.text()).slice(0, 300)}`)
    }

    const row = {
      graph_message_id: `sent-${crypto.randomUUID()}`, thread_id: threadId, direction: 'out',
      from_address: address, from_name: 'Casillas Funeral Home', to_address: to,
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
