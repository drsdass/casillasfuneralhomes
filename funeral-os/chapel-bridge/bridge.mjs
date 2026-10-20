#!/usr/bin/env node
// Casillas OS chapel bridge. Start with: node bridge.mjs   (settings in config.json — see README.md)
import fs from 'node:fs'
import { createBridge, DEFAULT_SCENES } from './core.mjs'
import { cloudDriver, obsDriver, sonosDriver } from './drivers.mjs'

const cfg = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'))
const log = (m) => console.log(`${new Date().toLocaleTimeString()}  ${m}`)

const cloud = cloudDriver({ url: cfg.supabaseUrl, key: cfg.bridgeKey, anonKey: cfg.anonKey })

let obs = null, speakers = null
async function connectObs() {
  try { obs = await obsDriver({ url: cfg.obsUrl ?? 'ws://127.0.0.1:4455', password: cfg.obsPassword }); log('OBS connected') }
  catch (e) { obs = null; log(`OBS not reachable: ${e.message}`) }
}
await connectObs()
try { speakers = await sonosDriver({ cacheDir: cfg.cacheDir ?? './music-cache' }); log(`Speakers found: ${speakers.rooms().join(', ') || 'none'}`) }
catch (e) { log(`Speakers not available: ${e.message}`) }

const missing = (what) => async () => { throw new Error(`${what} is not connected on the chapel computer.`) }
const obsProxy = new Proxy({}, { get: (_, k) => (...a) => (obs ? obs[k](...a) : missing('OBS')()) })
const spkProxy = new Proxy({}, { get: (_, k) => (...a) => (speakers ? speakers[k](...a) : (k === 'state' ? Promise.resolve('stopped') : missing('The speakers')())) })

const bridge = createBridge({ cloud, obs: obsProxy, speakers: spkProxy, scenes: { ...DEFAULT_SCENES, ...(cfg.scenes ?? {}) }, log })
const info = () => ({ obs: !!obs, rooms: speakers?.rooms() ?? [] })

log('Chapel bridge running. Leave this window open.')
let n = 0
for (;;) {
  try { await bridge.tick(info()) } catch (e) { log(`cloud: ${e.message}`) }
  if (!obs && ++n % 15 === 0) await connectObs()
  await new Promise((r) => setTimeout(r, 2000))
}
