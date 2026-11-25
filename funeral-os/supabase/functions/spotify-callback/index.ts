// supabase/functions/spotify-callback/index.ts
//
// Where Spotify sends the browser back after "Agree". Swaps the code for a token, stores it, returns to the OS Music page.
// Deploy with the name exactly "spotify-callback" and turn "Verify JWT" OFF. Its address is the Redirect URI you give Spotify.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const app = () => (Deno.env.get('APP_URL') || 'https://casillasfuneralhomes-lzdc.vercel.app').replace(/\/$/, '')
const back = (q: string, why?: string) => new Response(null, { status: 302, headers: { Location: `${app()}/music?${q}${why ? '&why=' + encodeURIComponent(why.slice(0, 160)) : ''}` } })

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const code = u.searchParams.get('code'), state = u.searchParams.get('state')
  if (u.searchParams.get('error')) return back('spotify=denied')
  if (!code || !state) return back('spotify=failed', 'Spotify did not send back a code.')
  const id = Deno.env.get('SPOTIFY_CLIENT_ID'), secret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
  if (!id || !secret) return back('spotify=failed', 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set in Supabase secrets.')
  try {
    const { data: st, error: stErr } = await db.from('spotify_oauth_states').select('*').eq('state', state).maybeSingle()
    if (stErr) return back('spotify=failed', `Database: ${stErr.message} (was spotify.sql run?)`)
    if (!st || Date.now() - new Date(st.created_at).getTime() > 30 * 60 * 1000) return back('spotify=expired')
    await db.from('spotify_oauth_states').delete().eq('state', state)
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(`${id}:${secret}`), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-callback` }),
    })
    const t = await res.json().catch(() => ({}))
    if (!res.ok || !t.access_token) return back('spotify=failed', `Spotify refused the code (${res.status}): ${t.error_description ?? t.error ?? 'check the Client ID, Secret and Redirect URI'}`)
    const me = await fetch('https://api.spotify.com/v1/me', { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}))
    const { error: upErr } = await db.from('spotify_links').upsert({
      org_id: st.org_id, access_token: t.access_token, refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
      spotify_user: me?.display_name ?? me?.id ?? null, connected_by: st.created_by,
      connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    if (upErr) return back('spotify=failed', `Database: ${upErr.message}`)
    return back('spotify=connected')
  } catch (e) {
    return back('spotify=failed', e instanceof Error ? e.message : 'unexpected error')
  }
})
