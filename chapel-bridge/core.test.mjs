import test from 'node:test'
import assert from 'node:assert/strict'
import { createBridge } from './core.mjs'

function rig(opts = {}) {
  const calls = [], acks = [], states = []
  let scene = 'Speaker', streaming = false, spkState = 'stopped'
  const obs = {
    setScene: async (s) => { calls.push(['scene', s]); scene = s },
    getScene: async () => scene,
    startStream: async () => { streaming = true; calls.push(['startStream']) },
    stopStream: async () => { streaming = false; calls.push(['stopStream']) },
    isStreaming: async () => streaming,
    startRecord: async () => calls.push(['startRecord']),
    stopRecord: async () => calls.push(['stopRecord']),
  }
  const speakers = {
    play: async (room, t) => { calls.push(['play', room, t.name]); spkState = 'playing' },
    pause: async () => calls.push(['pause']), resume: async () => calls.push(['resume']),
    stop: async () => { calls.push(['stop']); spkState = 'stopped' },
    setVolume: async (r, v) => calls.push(['vol', v]),
    state: async () => spkState,
  }
  let pending = opts.commands ?? [], live = opts.live ?? []
  const cloud = {
    poll: async () => { const c = pending; pending = []; return { commands: c, live } },
    ack: async (id, ok, error, state) => acks.push({ id, ok, error, state }),
    state: async (caseId, s) => states.push({ caseId, ...s }),
  }
  const bridge = createBridge({ cloud, obs, speakers })
  return { bridge, calls, acks, states, setScene: (s) => (scene = s), endSong: () => (spkState = 'stopped'), push: (c) => (pending = c), setLive: (l) => (live = l) }
}
const cmd = (id, kind, extra = {}) => ({ id, case_id: 'c1', kind, payload: {}, ...extra })

test('go live starts on the speaker view and records when asked', async () => {
  const r = rig({ commands: [cmd(1, 'stream_start', { record: true })] })
  await r.bridge.tick({})
  assert.deepEqual(r.calls, [['scene', 'Speaker'], ['startStream'], ['startRecord']])
  assert.equal(r.acks[0].ok, true); assert.equal(r.acks[0].state.live, true)
})

test('scene command switches OBS and reports it', async () => {
  const r = rig({ commands: [cmd(1, 'scene', { payload: { scene: 'audience' } })] })
  await r.bridge.tick({})
  assert.deepEqual(r.calls, [['scene', 'Audience']]); assert.equal(r.acks[0].state.current_scene, 'audience')
})

test('unknown view fails cleanly instead of crashing', async () => {
  const r = rig({ commands: [cmd(1, 'scene', { payload: { scene: 'ceiling' } })] })
  await r.bridge.tick({})
  assert.equal(r.acks[0].ok, false); assert.match(r.acks[0].error, /Unknown view/)
})

test('safety net: a hidden view on air is cut to the blank screen', async () => {
  const r = rig({ live: [{ caseId: 'c1', showCasket: false, showAudience: true, streamAllowed: true }] })
  r.setScene('Front')
  await r.bridge.tick({})
  assert.deepEqual(r.calls, [['scene', 'Slate']]); assert.equal(r.states.at(-1).current_scene, 'slate')
})

test('safety net leaves allowed views alone', async () => {
  const r = rig({ live: [{ caseId: 'c1', showCasket: false, showAudience: true, streamAllowed: true }] })
  r.setScene('Audience')
  await r.bridge.tick({})
  assert.deepEqual(r.calls, [])
})

test('safety net stops the stream if the family turned it off', async () => {
  const r = rig({ live: [{ caseId: 'c1', showCasket: true, showAudience: true, streamAllowed: false }] })
  await r.bridge.tick({}) // not streaming: nothing to do
  assert.deepEqual(r.calls, [])
  r.push([cmd(1, 'stream_start')]); await r.bridge.tick({}) // even if it somehow got started, it is cut in the same pass
  assert.deepEqual(r.calls.slice(-2), [['scene', 'Slate'], ['stopStream']])
  assert.equal(r.states.at(-1).live, false)
})

test('music: plays first song, advances on next, and when a song ends', async () => {
  const tracks = [{ name: 'A', url: 'u1' }, { name: 'B', url: 'u2' }]
  const r = rig({ commands: [cmd(1, 'music_play', { tracks, payload: { room: 'Chapel' } })] })
  await r.bridge.tick({})
  assert.deepEqual(r.calls.at(-1), ['play', 'Chapel', 'A']); assert.equal(r.acks[0].state.now_playing, 'A')
  await r.bridge.tick({}) // marks as playing
  r.push([cmd(2, 'music_next')]); await r.bridge.tick({})
  assert.deepEqual(r.calls.at(-1), ['play', 'Chapel', 'B'])
  r.endSong(); await r.bridge.tick({})
  assert.equal(r.states.at(-1).music_state, 'stopped') // playlist finished
})

test('music play with no songs fails with a readable message', async () => {
  const r = rig({ commands: [cmd(1, 'music_play', { tracks: [] })] })
  await r.bridge.tick({})
  assert.equal(r.acks[0].ok, false); assert.match(r.acks[0].error, /No songs/)
})

test('pause, resume, stop, volume', async () => {
  const r = rig({ commands: [cmd(1, 'music_play', { tracks: [{ name: 'A', url: 'u' }] }), cmd(2, 'music_pause'), cmd(3, 'music_resume'), cmd(4, 'volume', { payload: { volume: 40 } }), cmd(5, 'music_stop')] })
  await r.bridge.tick({})
  assert.deepEqual(r.calls.map((c) => c[0]), ['play', 'pause', 'resume', 'vol', 'stop'])
  assert.ok(r.acks.every((a) => a.ok))
})
