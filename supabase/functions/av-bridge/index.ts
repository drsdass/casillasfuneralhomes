// supabase/functions/av-bridge/index.ts
//
// The chapel computer's ("bridge") only door into the OS. It signs in with the per-location
// bridge_key (Settings > Service AV), asks for pending button presses, and reports back what
// actually happened (stream live, which camera view, what music is playing).
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it exactly "av-bridge".
// IMPORTANT: turn OFF "Verify JWT" in this function's settings — the bridge has no Supabase login,
// it authenticates with its bridge_key instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const MAX_BATCH = 20

// The only fields a bridge may write back into service_av.
function cleanState(s: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {}
  if (!s) return out
  if (typeof s.live === 'boolean') out.live = s.live
  if (s.live === true) out.live_started_at = new Date().toISOString()
  if (typeof s.current_scene === 'string' || s.current_scene === null) out.current_scene = s.current_scene
  if (['playing', 'paused', 'stopped'].includes(String(s.music_state))) out.music_state = s.music_state
  if (typeof s.now_playing === 'string' || s.now_playing === null) out.now_playing = s.now_playing
  if (typeof s.volume === 'number') out.volume = Math.max(0, Math.min(100, Math.round(s.volume)))
  if (typeof s.music_room === 'string') out.music_room = s.music_room
  if (Object.keys(out).length) out.updated_at = new Date().toISOString()
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const body = await req.json()
    const key = String(body.key ?? '')
    if (key.length < 32) return json({ error: 'Bad key' }, 401)

    const { data: loc } = await supabase.from('av_locations').select('location_id').eq('bridge_key', key).maybeSingle()
    if (!loc) return json({ error: 'Bad key' }, 401)
    const locationId = loc.location_id as string

    // Every call is also a heartbeat.
    await supabase.from('av_locations').update({
      bridge_last_seen: new Date().toISOString(),
      ...(body.info && typeof body.info === 'object' ? { bridge_info: body.info } : {}),
    }).eq('location_id', locationId)

    if (body.action === 'ack') {
      const id = Number(body.id)
      if (!Number.isFinite(id)) return json({ error: 'Missing id' }, 400)
      const { data: cmd } = await supabase.from('av_commands').select('id, case_id, location_id').eq('id', id).maybeSingle()
      if (!cmd || cmd.location_id !== locationId) return json({ error: 'Unknown command' }, 404)
      await supabase.from('av_commands').update({
        status: body.ok ? 'done' : 'failed',
        error: body.ok ? null : String(body.error ?? 'Failed').slice(0, 500),
        done_at: new Date().toISOString(),
      }).eq('id', id)
      const patch = cleanState(body.state)
      if (Object.keys(patch).length) await supabase.from('service_av').update(patch).eq('case_id', cmd.case_id)
      return json({ ok: true })
    }

    if (body.action === 'state') {
      // Bridge reports state that did not come from a command (e.g. a song ended, OBS switched scene).
      const caseId = String(body.caseId ?? '')
      const { data: c } = await supabase.from('cases').select('location_id').eq('id', caseId).maybeSingle()
      if (!c || c.location_id !== locationId) return json({ error: 'Unknown case' }, 404)
      const patch = cleanState(body.state)
      if (Object.keys(patch).length) await supabase.from('service_av').update(patch).eq('case_id', caseId)
      return json({ ok: true })
    }

    // Default action: poll.
    const { data: pending } = await supabase
      .from('av_commands').select('*')
      .eq('location_id', locationId).eq('status', 'pending')
      .order('id', { ascending: true }).limit(MAX_BATCH)

    const commands: Record<string, unknown>[] = []
    for (const cmd of pending ?? []) {
      // Claim it so a second poll never runs it twice.
      const { data: claimed } = await supabase.from('av_commands')
        .update({ status: 'sent' }).eq('id', cmd.id).eq('status', 'pending').select('id')
      if (!claimed || claimed.length === 0) continue

      const out: Record<string, unknown> = { ...cmd }
      if (cmd.kind === 'stream_start') {
        const { data: s } = await supabase.from('service_av').select('record_service').eq('case_id', cmd.case_id).maybeSingle()
        out.record = s?.record_service ?? true
      }
      if (cmd.kind === 'music_play') {
        const { data: docs } = await supabase.from('case_documents')
          .select('name, storage_path').eq('case_id', cmd.case_id).eq('category', 'music').order('uploaded_at', { ascending: true })
        const tracks: { name: string; url: string }[] = []
        for (const d of docs ?? []) {
          const { data: signed } = await supabase.storage.from('case-documents').createSignedUrl(d.storage_path, 60 * 60 * 6)
          if (signed?.signedUrl) tracks.push({ name: d.name, url: signed.signedUrl })
        }
        out.tracks = tracks
      }
      commands.push(out)
    }

    // What each live service here is allowed to show — lets the bridge force a blank "slate"
    // view even if someone switches cameras directly in OBS.
    const { data: live } = await supabase.from('service_av')
      .select('case_id, show_casket, show_audience, stream_allowed, live, cases!inner(location_id)')
      .eq('cases.location_id', locationId).eq('live', true)

    return json({
      commands,
      live: (live ?? []).map((r) => ({
        caseId: r.case_id, showCasket: r.show_casket, showAudience: r.show_audience, streamAllowed: r.stream_allowed,
      })),
    })
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
