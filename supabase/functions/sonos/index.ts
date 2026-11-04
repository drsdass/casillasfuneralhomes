// supabase/functions/sonos/index.ts
//
// The OS's "Music" page talks to this function; this function talks to Sonos' cloud (Sonos Control API).
// Body: { action, ...args }.  Needs a logged-in staff member (leave "Verify JWT" ON).
//
// Secrets to set (Edge Functions -> Secrets):  SONOS_CLIENT_ID, SONOS_CLIENT_SECRET, APP_URL (e.g. https://casillasfuneralhomes-lzdc.vercel.app)
// Deploy with the name exactly "sonos".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const API = 'https://api.ws.sonos.com/control/api/v1'
const TOKEN_URL = 'https://api.sonos.com/login/v3/oauth/access'
const LOGIN_URL = 'https://api.sonos.com/login/v3/oauth'
const clientId = () => Deno.env.get('SONOS_CLIENT_ID') ?? ''
const clientSecret = () => Deno.env.get('SONOS_CLIENT_SECRET') ?? ''
const basic = () => 'Basic ' + btoa(`${clientId()}:${clientSecret()}`)
const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/sonos-callback`

class Fail extends Error { constructor(public status: number, msg: string) { super(msg) } }

/** A valid access token for this company, refreshed when it is about to expire. */
async function tokenFor(orgId: string): Promise<{ token: string; household?: string; locked: string[] }> {
  const { data: link } = await db.from('sonos_links').select('*').eq('org_id', orgId).maybeSingle()
  if (!link) throw new Fail(409, 'not_connected')
  if (new Date(link.expires_at).getTime() - Date.now() > 5 * 60 * 1000) return { token: link.access_token, household: link.household_id ?? undefined, locked: link.locked_players ?? [] }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { authorization: basic(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: link.refresh_token }),
  })
  const t = await res.json().catch(() => ({}))
  if (!res.ok || !t.access_token) {
    await db.from('sonos_links').delete().eq('org_id', orgId) // permission was withdrawn: ask to connect again
    throw new Fail(409, 'not_connected')
  }
  await db.from('sonos_links').update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? link.refresh_token,
    expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq('org_id', orgId)
  return { token: t.access_token, household: link.household_id ?? undefined, locked: link.locked_players ?? [] }
}

async function sonos(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any = {}
  try { data = text ? JSON.parse(text) : {} } catch { /* empty */ }
  if (!res.ok) throw new Fail(res.status === 401 ? 409 : 502, data?.errorCode ? `${data.errorCode}${data.reason ? ': ' + data.reason : ''}` : `Sonos said ${res.status}`)
  return data
}

async function household(orgId: string, token: string, known?: string): Promise<string> {
  if (known) return known
  const h = await sonos(token, 'GET', '/households')
  const id = h.households?.[0]?.id
  if (!id) throw new Fail(404, 'No Sonos system found on this Sonos account.')
  await db.from('sonos_links').update({ household_id: id }).eq('org_id', orgId)
  return id
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
      if (!isAdmin) return json({ error: 'Only an Admin can connect Sonos.' }, 403)
      if (!clientId() || !clientSecret()) return json({ error: 'The Sonos keys have not been added to the cloud function yet (see the setup steps).', redirectUri: redirectUri() }, 400)
      const state = crypto.randomUUID().replace(/-/g, '')
      await db.from('sonos_oauth_states').insert({ state, org_id: orgId, created_by: me.name })
      const url = `${LOGIN_URL}?` + new URLSearchParams({ client_id: clientId(), response_type: 'code', state, scope: 'playback-control-all', redirect_uri: redirectUri() })
      return json({ url, redirectUri: redirectUri() })
    }
    if (action === 'redirectUri') return json({ redirectUri: redirectUri(), keysAdded: !!clientId() && !!clientSecret() })
    if (action === 'disconnect') {
      if (!isAdmin) return json({ error: 'Only an Admin can disconnect Sonos.' }, 403)
      await db.from('sonos_links').delete().eq('org_id', orgId)
      return json({ ok: true })
    }

    // everything below needs a connection
    let tk: { token: string; household?: string; locked: string[] }
    try { tk = await tokenFor(orgId) } catch (e) { if (e instanceof Fail && e.message === 'not_connected') return json({ connected: false }); throw e }
    const hh = await household(orgId, tk.token, tk.household)
    const t = tk.token
    const locked = tk.locked
    const canLock = isAdmin || me.role === 'manager'

    // A locked room can't be paused, skipped, re-volumed, given other music or pulled into a group by anyone but through Lock / Unlock.
    const LOCKED = 'That room is locked. A manager can unlock it on the Music page.'
    const guardGroup = async (groupId: string) => {
      if (!locked.length) return
      const g = await sonos(t, 'GET', `/households/${hh}/groups`)
      const grp = (g.groups ?? []).find((x: any) => x.id === groupId)
      if (grp && (grp.playerIds ?? []).some((id: string) => locked.includes(id))) throw new Fail(403, LOCKED)
    }
    const guardPlayers = (ids: string[]) => { if (ids.some((id) => locked.includes(id))) throw new Fail(403, LOCKED) }

    switch (action) {
      case 'lock': {
        if (!canLock) throw new Fail(403, 'Only a manager or admin can lock or unlock a room.')
        const id = String(b.playerId)
        if (b.locked) {
          const g = await sonos(t, 'GET', `/households/${hh}/groups`)
          const grp = (g.groups ?? []).find((x: any) => (x.playerIds ?? []).includes(id))
          if (grp && grp.playerIds.length > 1) throw new Fail(400, 'Separate this room from the others first, then lock it.')
        }
        const next = b.locked ? Array.from(new Set([...locked, id])) : locked.filter((x) => x !== id)
        await db.from('sonos_links').update({ locked_players: next }).eq('org_id', orgId)
        return json({ ok: true })
      }
      case 'state': {
        const g = await sonos(t, 'GET', `/households/${hh}/groups`)
        const groups = await Promise.all((g.groups ?? []).map(async (grp: any) => {
          const [vol, meta] = await Promise.all([
            sonos(t, 'GET', `/groups/${grp.id}/groupVolume`).catch(() => ({})),
            sonos(t, 'GET', `/groups/${grp.id}/playbackMetadata`).catch(() => ({})),
          ])
          const tr = meta?.currentItem?.track
          return {
            id: grp.id, name: grp.name, playbackState: grp.playbackState, playerIds: grp.playerIds,
            volume: typeof vol.volume === 'number' ? vol.volume : null, muted: !!vol.muted,
            track: tr ? { name: tr.name, artist: tr.artist?.name, album: tr.album?.name, image: tr.imageUrl } : null,
          }
        }))
        const players = await Promise.all((g.players ?? []).map(async (p: any) => {
          const v = await sonos(t, 'GET', `/players/${p.id}/playerVolume`).catch(() => ({}))
          return { id: p.id, name: p.name, volume: typeof v.volume === 'number' ? v.volume : null }
        }))
        return json({ connected: true, groups, players, locked, canLock })
      }
      case 'favorites': {
        const f = await sonos(t, 'GET', `/households/${hh}/favorites`)
        return json({ connected: true, favorites: (f.items ?? []).map((i: any) => ({ id: i.id, name: i.name, description: i.description, image: i.imageUrl, service: i.service?.name })) })
      }
      case 'play': await guardGroup(b.groupId); await sonos(t, 'POST', `/groups/${b.groupId}/playback/play`); return json({ ok: true })
      case 'pause': await guardGroup(b.groupId); await sonos(t, 'POST', `/groups/${b.groupId}/playback/pause`); return json({ ok: true })
      case 'next': await guardGroup(b.groupId); await sonos(t, 'POST', `/groups/${b.groupId}/playback/skipToNextTrack`); return json({ ok: true })
      case 'previous': await guardGroup(b.groupId); await sonos(t, 'POST', `/groups/${b.groupId}/playback/skipToPreviousTrack`); return json({ ok: true })
      case 'groupVolume': await guardGroup(b.groupId); await sonos(t, 'POST', `/groups/${b.groupId}/groupVolume`, { volume: Math.max(0, Math.min(100, Math.round(b.volume))) }); return json({ ok: true })
      case 'playerVolume': guardPlayers([String(b.playerId)]); await sonos(t, 'POST', `/players/${b.playerId}/playerVolume`, { volume: Math.max(0, Math.min(100, Math.round(b.volume))) }); return json({ ok: true })
      case 'loadFavorite': await guardGroup(b.groupId); await sonos(t, 'POST', `/groups/${b.groupId}/favorites`, { favoriteId: b.favoriteId, playOnCompletion: true, action: 'REPLACE' }); return json({ ok: true })
      // Put exactly these speakers together as one group.
      case 'setGroup': {
        const ids: string[] = b.playerIds ?? []
        if (!ids.length) throw new Fail(400, 'No speakers chosen.')
        guardPlayers(ids); await guardGroup(b.groupId)
        await sonos(t, 'POST', `/groups/${b.groupId}/groups/setGroupMembers`, { playerIds: ids })
        return json({ ok: true })
      }
      // Take one speaker out of its group so it plays on its own.
      case 'createGroup': guardPlayers(b.playerIds ?? []); await sonos(t, 'POST', `/households/${hh}/groups/createGroup`, { playerIds: b.playerIds ?? [] }); return json({ ok: true })
      default: return json({ error: 'Unknown action.' }, 400)
    }
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status === 409 ? 200 : e.status)
    return json({ error: 'Something went wrong talking to Sonos.' }, 500)
  }
})
