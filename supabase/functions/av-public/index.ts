// supabase/functions/av-public/index.ts
//
// The only way a family member's browser touches the live stream or the music remote.
// Body: { kind: 'watch' | 'remote', token, pin?, command? }
//   watch  -> is it live, the player address, replay link.
//   remote -> current music/camera state + what this link may do; with `command`, sends a button press.
//
// The family never gets a login. Access = knowing the long random link (+ optional PIN, + optional expiry).
// The remote can never start/stop the stream; cameras only if staff turned that on for the case.
// The database trigger still refuses any camera view the family hid, whoever asks.
//
// Deploy via the Supabase Dashboard, name it exactly "av-public", and turn OFF "Verify JWT".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const MUSIC_KINDS = ['music_play', 'music_pause', 'music_resume', 'music_next', 'music_stop', 'volume']
const SCENES = ['speaker', 'front', 'audience', 'slate']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const { kind, token, pin, command } = await req.json()
    if ((kind !== 'watch' && kind !== 'remote') || typeof token !== 'string' || token.length < 32) {
      return json({ error: 'This link is invalid.' }, 404)
    }
    const column = kind === 'watch' ? 'watch_token' : 'remote_token'
    const { data: svc } = await supabase.from('service_av').select('*').eq(column, token).maybeSingle()
    if (!svc) return json({ error: 'This link is invalid.' }, 404)

    if (svc.link_expires_at && new Date(svc.link_expires_at) < new Date()) {
      return json({ error: 'This link has expired. Please contact the funeral home.' }, 410)
    }
    if (kind === 'remote' && !svc.remote_enabled) {
      return json({ error: 'This link is not turned on. Please ask the funeral home.' }, 403)
    }
    if (svc.pin) {
      if (!pin) return json({ needPin: true })
      if (String(pin) !== String(svc.pin)) {
        await sleep(1000) // slows guessing
        return json({ needPin: true, wrongPin: true })
      }
    }

    const { data: caseRow } = await supabase.from('cases')
      .select('id, location_id, decedent_first_name, decedent_last_name').eq('id', svc.case_id).single()
    if (!caseRow) return json({ error: 'This link is invalid.' }, 404)
    const [{ data: location }, { data: av }] = await Promise.all([
      supabase.from('locations').select('name').eq('id', caseRow.location_id).single(),
      supabase.from('av_locations').select('player_embed_url').eq('location_id', caseRow.location_id).maybeSingle(),
    ])
    const who = {
      name: `${caseRow.decedent_first_name} ${caseRow.decedent_last_name}`,
      location: location?.name ?? '',
    }

    if (kind === 'watch') {
      return json({
        ...who,
        streamAllowed: svc.stream_allowed,
        live: svc.stream_allowed && svc.live,
        playerUrl: svc.stream_allowed ? (av?.player_embed_url ?? null) : null,
        replayUrl: svc.replay_url ?? null,
      })
    }

    // ----- remote -----
    if (command) {
      const k = String(command.kind)
      const allowed = MUSIC_KINDS.includes(k) ? svc.remote_music : (k === 'scene' && svc.remote_cameras)
      if (!allowed) return json({ error: 'That control is not available on this link.' }, 403)
      let payload: Record<string, unknown> = {}
      if (k === 'volume') payload = { volume: Math.max(0, Math.min(100, Math.round(Number(command.payload?.volume) || 0))) }
      if (k === 'scene') {
        if (!SCENES.includes(String(command.payload?.scene))) return json({ error: 'Unknown camera view.' }, 400)
        payload = { scene: command.payload.scene }
      }
      const { error } = await supabase.from('av_commands').insert({
        case_id: svc.case_id, location_id: caseRow.location_id, kind: k, payload, requested_by: 'family remote',
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    const { data: docs } = await supabase.from('case_documents')
      .select('name').eq('case_id', svc.case_id).eq('category', 'music').order('uploaded_at', { ascending: true })

    return json({
      ...who,
      canMusic: svc.remote_music,
      canCameras: svc.remote_cameras,
      scenes: SCENES.filter((s) => s === 'speaker' || s === 'slate' || (s === 'front' && svc.show_casket) || (s === 'audience' && svc.show_audience)),
      state: {
        live: svc.live, currentScene: svc.current_scene, musicState: svc.music_state,
        nowPlaying: svc.now_playing, volume: svc.volume,
      },
      tracks: (docs ?? []).map((d) => d.name),
    })
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
