// supabase/functions/spotify/index.ts
//
// The OS "Music" page talks to this function; this function talks to Spotify's cloud (Spotify Web API).
// One shared Spotify Premium account is connected once by an Admin; staff then pick a playlist and a room (a Sonos speaker that
// shows up as a Spotify Connect device). Leave "Verify JWT" ON. Deploy with the name exactly "spotify".
// Secrets (Edge Functions -> Secrets): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, APP_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const API = 'https://api.spotify.com/v1'
const clientId = () => Deno.env.get('SPOTIFY_CLIENT_ID') ?? ''
const clientSecret = () => Deno.env.get('SPOTIFY_CLIENT_SECRET') ?? ''
const basic = () => 'Basic ' + btoa(`${clientId()}:${clientSecret()}`)
const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-callback`
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative'

class Fail extends Error { constructor(public status: number, msg: string) { super(msg) } }

async function tokenFor(orgId: string): Promise<string> {
  const { data: link } = await db.from('spotify_links').select('*').eq('org_id', orgId).maybeSingle()
  if (!link) throw new Fail(409, 'not_connected')
  if (new Date(link.expires_at).getTime() - Date.now() > 2 * 60 * 1000) return link.access_token
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: link.refresh_token }),
  })
  const t = await res.json().catch(() => ({}))
  if (!res.ok || !t.access_token) { await db.from('spotify_links').delete().eq('org_id', orgId); throw new Fail(409, 'not_connected') }
  await db.from('spotify_links').update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? link.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq('org_id', orgId)
  return t.access_token
}

async function sp(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = {}
  try { data = text ? JSON.parse(text) : {} } catch { /* empty */ }
  if (res.status === 401) throw new Fail(409, 'not_connected')
  if (!res.ok) {
    const m = String(data?.error?.message ?? '')
    if (res.status === 404 && /device/i.test(m)) throw new Fail(404, 'Spotify can’t see that speaker right now. Open the Sonos app once, or play any song on it, then try again.')
    if (res.status === 403 && /premium/i.test(m + (data?.error?.reason ?? ''))) throw new Fail(403, 'This Spotify account needs Premium to be controlled from here.')
    if (res.status === 403) throw new Fail(403, 'Spotify said no (' + (m || 'forbidden') + '). If this keeps happening, the account may not be on the app’s allowed-users list.')
    if (res.status === 429) throw new Fail(429, 'Spotify is busy — try again in a few seconds.')
    throw new Fail(502, m || `Spotify said ${res.status}`)
  }
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await db.auth.getUser(jwt)
    if (!user) return json({ error: 'Not signed in.' }, 401)
    const { data: me } = await db.from('staff_members').select('id, name, role, org_id').eq('id', user.id).maybeSingle()
    if (!me) return json({ error: 'No staff profile.' }, 403)
    const orgId = me.org_id as string
    const isAdmin = me.role === 'super_admin' || me.role === 'admin'
    const b = await req.json().catch(() => ({}))
    const action = String(b.action ?? '')

    if (action === 'connectUrl') {
      if (!isAdmin) return json({ error: 'Only an Admin can connect Spotify.' }, 403)
      if (!clientId() || !clientSecret()) return json({ error: 'The Spotify keys have not been added to the cloud function yet (see the setup steps).', redirectUri: redirectUri() }, 400)
      const state = crypto.randomUUID().replace(/-/g, '')
      await db.from('spotify_oauth_states').insert({ state, org_id: orgId, created_by: me.name })
      const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES, state, show_dialog: 'true' })
      return json({ url, redirectUri: redirectUri() })
    }
    if (action === 'redirectUri') return json({ redirectUri: redirectUri(), keysAdded: !!clientId() && !!clientSecret() })
    if (action === 'disconnect') {
      if (!isAdmin) return json({ error: 'Only an Admin can disconnect Spotify.' }, 403)
      await db.from('spotify_links').delete().eq('org_id', orgId)
      return json({ ok: true })
    }

    let t: string
    try { t = await tokenFor(orgId) } catch (e) { if (e instanceof Fail && e.message === 'not_connected') return json({ connected: false }); throw e }

    // Rooms locked on the Music page (Sonos lock) stay locked here too — matched by room name.
    const { data: lk } = await db.from('sonos_links').select('locked_names').eq('org_id', orgId).maybeSingle()
    const lockedNames: string[] = ((lk as any)?.locked_names ?? []).map((n: string) => n.toLowerCase())
    const LOCKED = 'That room is locked. A manager can unlock it on the Music page.'
    const guard = async (deviceId?: string) => {
      if (!lockedNames.length) return
      const d = await sp(t, 'GET', '/me/player/devices')
      const dev = (d.devices ?? []).find((x: any) => x.id === deviceId) ?? (d.devices ?? []).find((x: any) => x.is_active)
      if (dev && lockedNames.includes(String(dev.name).toLowerCase())) throw new Fail(403, LOCKED)
    }
    const dq = (id?: string) => (id ? `?device_id=${encodeURIComponent(id)}` : '')

    switch (action) {
      case 'state': {
        const [dev, now, prof] = await Promise.all([
          sp(t, 'GET', '/me/player/devices'),
          sp(t, 'GET', '/me/player').catch(() => ({})),
          sp(t, 'GET', '/me').catch(() => ({})),
        ])
        const it = now?.item
        return json({
          connected: true, user: prof?.display_name ?? null, lockedNames,
          devices: (dev.devices ?? []).map((d: any) => ({ id: d.id, name: d.name, type: d.type, active: !!d.is_active, volume: d.volume_percent ?? null, restricted: !!d.is_restricted })),
          playing: !!now?.is_playing, deviceId: now?.device?.id ?? null,
          track: it ? { name: it.name, artist: (it.artists ?? []).map((a: any) => a.name).join(', ') || it.show?.name, image: it.album?.images?.[1]?.url ?? it.album?.images?.[0]?.url ?? it.images?.[0]?.url } : null,
        })
      }
      case 'playlists': {
        const p = await sp(t, 'GET', '/me/playlists?limit=50')
        return json({ playlists: (p.items ?? []).filter(Boolean).map((i: any) => ({ uri: i.uri, name: i.name, owner: i.owner?.display_name, image: i.images?.[0]?.url, tracks: i.tracks?.total ?? null })) })
      }
      case 'search': {
        const q = String(b.q ?? '').trim()
        if (!q) return json({ playlists: [] })
        const r = await sp(t, 'GET', `/search?type=playlist&limit=10&q=${encodeURIComponent(q)}`)
        return json({ playlists: (r.playlists?.items ?? []).filter(Boolean).map((i: any) => ({ uri: i.uri, name: i.name, owner: i.owner?.display_name, image: i.images?.[0]?.url, tracks: i.tracks?.total ?? null })) })
      }
      case 'play': {
        await guard(b.deviceId)
        // wake the speaker (transfer) first so Spotify has somewhere to play, then start the playlist
        if (b.deviceId) await sp(t, 'PUT', '/me/player', { device_ids: [b.deviceId], play: false }).catch(() => undefined)
        await sp(t, 'PUT', '/me/player/play' + dq(b.deviceId), b.contextUri ? { context_uri: String(b.contextUri) } : undefined)
        return json({ ok: true })
      }
      case 'pause': await guard(b.deviceId); await sp(t, 'PUT', '/me/player/pause' + dq(b.deviceId)); return json({ ok: true })
      case 'next': await guard(b.deviceId); await sp(t, 'POST', '/me/player/next' + dq(b.deviceId)); return json({ ok: true })
      case 'previous': await guard(b.deviceId); await sp(t, 'POST', '/me/player/previous' + dq(b.deviceId)); return json({ ok: true })
      case 'volume': {
        await guard(b.deviceId)
        const v = Math.max(0, Math.min(100, Math.round(Number(b.volume))))
        await sp(t, 'PUT', `/me/player/volume?volume_percent=${v}${b.deviceId ? '&device_id=' + encodeURIComponent(b.deviceId) : ''}`)
        return json({ ok: true })
      }
      default: return json({ error: 'Unknown action.' }, 400)
    }
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, 200)
    return json({ error: 'Something went wrong talking to Spotify: ' + (e instanceof Error ? e.message : 'unknown') }, 200)
  }
})
