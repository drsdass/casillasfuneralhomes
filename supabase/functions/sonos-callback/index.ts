// supabase/functions/sonos-callback/index.ts
//
// Where Sonos sends the person's browser back after they press "Allow". Swaps the one-time code for a token, stores it, and
// returns them to the OS Music page. Deploy with the name exactly "sonos-callback" and turn "Verify JWT" OFF
// (Sonos' redirect carries no login). The address of this function is the "Redirect URI" you give Sonos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const app = () => (Deno.env.get('APP_URL') || 'https://casillasfuneralhomes-lzdc.vercel.app').replace(/\/$/, '')
const back = (q: string, why?: string) => new Response(null, { status: 302, headers: { Location: `${app()}/music?${q}${why ? '&why=' + encodeURIComponent(why.slice(0, 160)) : ''}` } })

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const code = u.searchParams.get('code'), state = u.searchParams.get('state')
  if (u.searchParams.get('error')) return back('sonos=denied')
  if (!code || !state) return back('sonos=failed', 'Sonos did not send back a code.')
  if (!Deno.env.get('SONOS_CLIENT_ID') || !Deno.env.get('SONOS_CLIENT_SECRET')) return back('sonos=failed', 'SONOS_CLIENT_ID / SONOS_CLIENT_SECRET are not set in Supabase secrets.')
  try {
    const { data: st, error: stErr } = await db.from('sonos_oauth_states').select('*').eq('state', state).maybeSingle()
    if (stErr) return back('sonos=failed', `Database: ${stErr.message} (was sonos.sql run?)`)
    if (!st || Date.now() - new Date(st.created_at).getTime() > 30 * 60 * 1000) return back('sonos=expired')
    await db.from('sonos_oauth_states').delete().eq('state', state)
    const basic = 'Basic ' + btoa(`${Deno.env.get('SONOS_CLIENT_ID')}:${Deno.env.get('SONOS_CLIENT_SECRET')}`)
    const res = await fetch('https://api.sonos.com/login/v3/oauth/access', {
      method: 'POST',
      headers: { authorization: basic, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/sonos-callback` }),
    })
    const t = await res.json().catch(() => ({}))
    if (!res.ok || !t.access_token) return back('sonos=failed', `Sonos refused the code (${res.status}): ${t.error_description ?? t.error ?? t.fault?.faultstring ?? 'check the Key, Secret and Redirect URI'}`)
    const { error: upErr } = await db.from('sonos_links').upsert({
      org_id: st.org_id, access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(),
      connected_by: st.created_by, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), household_id: null,
    })
    if (upErr) return back('sonos=failed', `Database: ${upErr.message}`)
    return back('sonos=connected')
  } catch (e) {
    return back('sonos=failed', e instanceof Error ? e.message : 'unexpected error')
  }
})
