// supabase/functions/mail-connect/index.ts
//
// The "Connect Outlook mailbox" button. An admin signs in ONCE with the funeral home email account on
// Microsoft's own sign-in page; this function keeps the resulting long-lived sign-in (never the password)
// in the mail_connection table, where only the server can read it. After that, the mail check and the
// reply button run from the cloud with no one signed in and no authenticator prompts.
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "mail-connect", leave "Verify JWT" ON.
// Secrets: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI (see docs/outlook-setup.md)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } })
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const SCOPE = 'offline_access Mail.Read Mail.Send User.Read'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await supabase.auth.getUser(jwt)
    if (!u?.user) return json({ error: 'Please sign in again.' }, 401)
    const { data: staff } = await supabase.from('staff_members').select('id, role, active').eq('id', u.user.id).maybeSingle()
    if (!staff || !staff.active || !['super_admin', 'admin'].includes(staff.role)) return json({ error: 'Only an admin can change the email connection.' }, 403)

    const configured = !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET') && env('MS_REDIRECT_URI'))
    const b = await req.json()

    if (b.action === 'status') {
      const { data: c } = await supabase.from('mail_connection').select('address, status, last_error, connected_at, refresh_token').eq('id', 1).maybeSingle()
      return json({ configured, connected: !!c?.refresh_token, address: c?.address ?? null, status: c?.status ?? null, lastError: c?.last_error ?? null, connectedAt: c?.connected_at ?? null })
    }
    if (!configured) return json({ error: 'The Microsoft keys are not in Supabase yet. See docs/outlook-setup.md, step 6.' }, 400)

    if (b.action === 'start') {
      const state = String(b.state ?? '').slice(0, 100)
      const url = `https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/authorize?` + new URLSearchParams({
        client_id: env('MS_CLIENT_ID'), response_type: 'code', redirect_uri: env('MS_REDIRECT_URI'),
        response_mode: 'query', scope: SCOPE, state, prompt: 'select_account',
      })
      return json({ url })
    }

    if (b.action === 'finish') {
      const res = await fetch(`https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'), grant_type: 'authorization_code',
          code: String(b.code ?? ''), redirect_uri: env('MS_REDIRECT_URI'), scope: SCOPE,
        }),
      })
      if (!res.ok) return json({ error: `Microsoft sign-in failed: ${(await res.text()).slice(0, 300)}` }, 400)
      const t = await res.json()
      if (!t.refresh_token) return json({ error: 'Microsoft did not return a lasting sign-in. Check that offline_access is allowed on the app.' }, 400)
      const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { Authorization: `Bearer ${t.access_token}` } })
      const meJson = me.ok ? await me.json() : {}
      const address = String(meJson.mail ?? meJson.userPrincipalName ?? '').toLowerCase()
      const { error } = await supabase.from('mail_connection').upsert({
        id: 1, address, refresh_token: t.refresh_token, status: 'ok', last_error: null, connected_by: staff.id, connected_at: new Date().toISOString(),
      })
      if (error) throw error
      return json({ ok: true, address })
    }

    if (b.action === 'disconnect') {
      await supabase.from('mail_connection').delete().eq('id', 1)
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: String(err instanceof Error ? err.message : err) }, 500)
  }
})
