// The bridge's brain. No hardware in here — OBS, speakers and the cloud are passed in, so it can be tested.

export const DEFAULT_SCENES = { speaker: 'Speaker', front: 'Front', audience: 'Audience', slate: 'Slate' }

export function createBridge({ cloud, obs, speakers, scenes = DEFAULT_SCENES, log = () => {} }) {
  const queues = new Map() // caseId -> { tracks, index, room }
  let lastLiveReport = ''

  const sceneName = (key) => scenes[key]
  const keyFromName = (name) => Object.keys(scenes).find((k) => scenes[k] === name)

  async function playTrack(caseId) {
    const q = queues.get(caseId)
    const t = q.tracks[q.index]
    await speakers.play(q.room, t)
    return { music_state: 'playing', now_playing: t.name }
  }

  async function run(cmd) {
    const caseId = cmd.case_id
    switch (cmd.kind) {
      case 'stream_start': {
        await obs.setScene(sceneName('speaker'))
        await obs.startStream()
        if (cmd.record) await obs.startRecord().catch(() => {})
        return { live: true, current_scene: 'speaker' }
      }
      case 'stream_stop': {
        await obs.stopStream()
        await obs.stopRecord().catch(() => {})
        return { live: false, current_scene: null }
      }
      case 'scene': {
        const key = cmd.payload?.scene
        if (!scenes[key]) throw new Error(`Unknown view "${key}"`)
        await obs.setScene(sceneName(key))
        return { current_scene: key }
      }
      case 'music_play': {
        const tracks = cmd.tracks ?? []
        if (!tracks.length) throw new Error('No songs uploaded for this service yet.')
        queues.set(caseId, { tracks, index: 0, room: cmd.payload?.room ?? null })
        return playTrack(caseId)
      }
      case 'music_pause': {
        await speakers.pause(queues.get(caseId)?.room ?? null)
        return { music_state: 'paused' }
      }
      case 'music_resume': {
        await speakers.resume(queues.get(caseId)?.room ?? null)
        return { music_state: 'playing' }
      }
      case 'music_next': {
        const q = queues.get(caseId)
        if (!q) throw new Error('Nothing is playing.')
        q.index = (q.index + 1) % q.tracks.length
        return playTrack(caseId)
      }
      case 'music_stop': {
        const q = queues.get(caseId)
        await speakers.stop(q?.room ?? null)
        queues.delete(caseId)
        return { music_state: 'stopped', now_playing: null }
      }
      case 'volume': {
        const room = queues.get(caseId)?.room ?? cmd.payload?.room ?? null
        await speakers.setVolume(room, cmd.payload.volume)
        return { volume: cmd.payload.volume }
      }
      default:
        throw new Error(`Unknown command ${cmd.kind}`)
    }
  }

  /** The safety net: if a hidden view is ever on air (someone switched cameras in OBS directly), cut to the blank screen. */
  async function enforcePrivacy(live) {
    for (const svc of live) {
      if (!svc.streamAllowed && (await obs.isStreaming())) {
        await obs.setScene(sceneName('slate'))
        await obs.stopStream()
        await cloud.state(svc.caseId, { live: false, current_scene: null })
        log(`Stream stopped: family turned streaming off (${svc.caseId})`)
        continue
      }
      const current = keyFromName(await obs.getScene())
      const bad = (current === 'front' && !svc.showCasket) || (current === 'audience' && !svc.showAudience)
      if (bad) {
        await obs.setScene(sceneName('slate'))
        await cloud.state(svc.caseId, { current_scene: 'slate' })
        log(`Forced blank screen: ${current} view is not allowed (${svc.caseId})`)
      } else if (current && lastLiveReport !== `${svc.caseId}:${current}`) {
        lastLiveReport = `${svc.caseId}:${current}`
        await cloud.state(svc.caseId, { current_scene: current })
      }
    }
  }

  /** Plays the next song when one ends. */
  async function advanceMusic() {
    for (const [caseId, q] of queues) {
      if (q.tracks.length < 1) continue
      const st = await speakers.state(q.room)
      if (st === 'stopped' && q.playing) {
        q.index = (q.index + 1) % q.tracks.length
        if (q.index === 0 && !q.loop) { queues.delete(caseId); await cloud.state(caseId, { music_state: 'stopped', now_playing: null }); continue }
        const patch = await playTrack(caseId)
        await cloud.state(caseId, patch)
      }
      q.playing = st === 'playing' || st === 'transitioning' || q.playing
    }
  }

  async function tick(info) {
    const { commands, live } = await cloud.poll(info)
    for (const cmd of commands) {
      try {
        const state = await run(cmd)
        await cloud.ack(cmd.id, true, null, state)
        log(`ok   ${cmd.kind}`)
      } catch (e) {
        await cloud.ack(cmd.id, false, e.message, null)
        log(`FAIL ${cmd.kind}: ${e.message}`)
      }
    }
    try { await enforcePrivacy(live) } catch (e) { log(`privacy check error: ${e.message}`) }
    try { await advanceMusic() } catch (e) { log(`music check error: ${e.message}`) }
  }

  return { tick, run, enforcePrivacy, queues }
}
