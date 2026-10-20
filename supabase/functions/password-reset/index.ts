// supabase/functions/password-reset/index.ts
//
// "Forgot password?" for staff. Takes an email address and, if it belongs to an active staff member, emails them a
// one-time link (valid about an hour) that opens the "choose a new password" page.
//
// The email is sent from the company's own connected mailbox (Outlook or Gmail), so no extra email service is needed.
// Whatever the address, the answer is always "ok" so nobody can use this to find out who works here.
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "password-reset", and turn OFF "Verify JWT"
// (people asking for a reset are, by definition, not signed in).
// Secrets: the same mail secrets as email-send (MS_* and/or GOOGLE_*). Optional: APP_URL (defaults to the live site).
// Also needed once: Supabase -> Authentication -> URL Configuration -> add <your site>/reset-password to Redirect URLs.

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
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
const APP_URL = (env('APP_URL') || 'https://casillasfuneralhomes-lzdc.vercel.app').replace(/\/$/, '')

async function accessToken(orgId: string | null): Promise<{ token: string; address: string; provider: 'microsoft' | 'google' } | null> {
  // The person's own company mailbox if it is connected, otherwise any connected mailbox.
  let { data: conn } = orgId ? await supabase.from('mail_connection').select('*').eq('org_id', orgId).maybeSingle() : { data: null }
  if (!conn?.refresh_token) ({ data: conn } = await supabase.from('mail_connection').select('*').not('refresh_token', 'is', null).limit(1).maybeSingle())
  if (!conn?.refresh_token) return null
  const provider: 'microsoft' | 'google' = conn.provider === 'google' ? 'google' : 'microsoft'
  const res = provider === 'google'
    ? await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
      })
    : await fetch(`https://login.microsoftonline.com/${conn.tenant || env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), grant_type: 'refresh_token',
          refresh_token: conn.refresh_token, scope: 'offline_access Mail.Read Mail.Send User.Read',
        }),
      })
  if (!res.ok) return null
  const d = await res.json()
  if (d.refresh_token && d.refresh_token !== conn.refresh_token) await supabase.from('mail_connection').update({ refresh_token: d.refresh_token }).eq('id', conn.id)
  return { token: d.access_token, address: String(conn.address ?? '').toLowerCase(), provider }
}

const toB64 = (bytes: Uint8Array) => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin) }
const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const utf8 = (t: string) => new TextEncoder().encode(t)
function gmailRaw(from: string, to: string, subject: string, text: string): string {
  const b64body = toB64(utf8(text)).replace(/(.{76})/g, '$1\r\n')
  return toB64Url(utf8([`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64body].join('\r\n')))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) return json({ ok: true })

    const { data: staff } = await supabase.from('staff_members').select('id, name, org_id, active').ilike('email', email).maybeSingle()
    if (!staff || !staff.active) return json({ ok: true })

    // At most one email every two minutes per address.
    const key = `pwreset:${email}`
    const { data: last } = await supabase.from('sync_state').select('value').eq('key', key).maybeSingle()
    if (last?.value && Date.now() - new Date(last.value).getTime() < 120000) return json({ ok: true })
    await supabase.from('sync_state').upsert({ key, value: new Date().toISOString() })

    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${APP_URL}/reset-password` } })
    const actionLink = link?.properties?.action_link
    if (linkErr || !actionLink) { console.error('generateLink failed', linkErr?.message); return json({ ok: true }) }

    const mail = await accessToken(staff.org_id)
    if (!mail) { console.error('No connected mailbox to send the reset email from'); return json({ ok: true }) }
    const { data: org } = await supabase.from('organizations').select('name').eq('id', staff.org_id).maybeSingle()
    const company = org?.name ?? 'Casillas Funeral Home'
    const first = String(staff.name ?? '').trim().split(/\s+/)[0]
    const subject = `Reset your ${company} password`
    const text = [
      first ? `Hello ${first},` : 'Hello,',
      '',
      `Someone asked to reset the password for your ${company} staff login. To choose a new password, open this link:`,
      '',
      actionLink,
      '',
      'The link works once and expires in about an hour.',
      'If you did not ask for this, you can ignore this email. Your password has not changed.',
      '',
      company,
    ].join('\n')

    const auth = { Authorization: `Bearer ${mail.token}`, 'Content-Type': 'application/json' }
    const r = mail.provider === 'google'
      ? await fetch(`${GMAIL}/messages/send`, { method: 'POST', headers: auth, body: JSON.stringify({ raw: gmailRaw(`${company} <${mail.address}>`, email, subject, text) }) })
      : await fetch(`${GRAPH}/me/sendMail`, { method: 'POST', headers: auth, body: JSON.stringify({ message: { subject, body: { contentType: 'Text', content: text }, toRecipients: [{ emailAddress: { address: email } }] }, saveToSentItems: false }) })
    if (!r.ok) console.error('Reset email failed', r.status, (await r.text()).slice(0, 200))
    return json({ ok: true })
  } catch (err) {
    console.error(err)
    return json({ ok: true }) // never reveal anything
  }
})
