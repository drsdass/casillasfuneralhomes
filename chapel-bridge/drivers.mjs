// Real hardware drivers: the cloud, OBS (cameras/stream) and Sonos (speakers).
import { createRequire } from 'node:module'
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const require = createRequire(import.meta.url)

export function cloudDriver({ url, key, anonKey }) {
  async function call(body) {
    const res = await fetch(`${url}/functions/v1/av-bridge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(anonKey ? { apikey: anonKey, authorization: `Bearer ${anonKey}` } : {}) },
      body: JSON.stringify({ key, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return data
  }
  return {
    poll: (info) => call({ action: 'poll', info }),
    ack: (id, ok, error, state) => call({ action: 'ack', id, ok, error, state }),
    state: (caseId, state) => call({ action: 'state', caseId, state }),
  }
}

export async function obsDriver({ url, password }) {
  const { OBSWebSocket } = await import('obs-websocket-js')
  const obs = new OBSWebSocket()
  await obs.connect(url, password || undefined)
  return {
    setScene: (sceneName) => obs.call('SetCurrentProgramScene', { sceneName }),
    getScene: async () => (await obs.call('GetCurrentProgramScene')).currentProgramSceneName,
    startStream: async () => { if (!(await obs.call('GetStreamStatus')).outputActive) await obs.call('StartStream') },
    stopStream: async () => { if ((await obs.call('GetStreamStatus')).outputActive) await obs.call('StopStream') },
    isStreaming: async () => (await obs.call('GetStreamStatus')).outputActive,
    startRecord: async () => { if (!(await obs.call('GetRecordStatus')).outputActive) await obs.call('StartRecord') },
    stopRecord: async () => { if ((await obs.call('GetRecordStatus')).outputActive) await obs.call('StopRecord') },
  }
}

/** Sonos. Songs are downloaded here and served over the chapel's own network — Sonos plays plain local files far more reliably than long https links. */
export async function sonosDriver({ cacheDir, port = 8765, discoverMs = 6000 }) {
  const { DeviceDiscovery } = require('sonos')
  fs.mkdirSync(cacheDir, { recursive: true })

  const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
  if (!lanIp) throw new Error('No network address found on this computer.')
  http.createServer((req, res) => {
    const file = path.join(cacheDir, path.basename(decodeURIComponent(req.url.split('?')[0])))
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': fs.statSync(file).size })
    fs.createReadStream(file).pipe(res)
  }).listen(port)

  const rooms = new Map() // room name -> Sonos device
  await new Promise((resolve) => {
    const d = DeviceDiscovery({ timeout: discoverMs })
    d.on('DeviceAvailable', async (device) => {
      try { const desc = await device.deviceDescription(); rooms.set(desc.roomName, device) } catch { /* skip */ }
    })
    d.on('timeout', resolve)
    setTimeout(resolve, discoverMs + 500)
  })

  const pick = (room) => {
    if (room && rooms.has(room)) return [rooms.get(room)]
    return [...rooms.values()]
  }
  const each = (room, fn) => Promise.all(pick(room).map(fn))

  async function localUrl(track) {
    const name = crypto.createHash('sha1').update(track.name).digest('hex') + '.mp3'
    const file = path.join(cacheDir, name)
    if (!fs.existsSync(file)) {
      const res = await fetch(track.url)
      if (!res.ok) throw new Error(`Could not download "${track.name}"`)
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    }
    return `http://${lanIp}:${port}/${name}`
  }

  return {
    rooms: () => [...rooms.keys()],
    play: async (room, track) => { const uri = await localUrl(track); await each(room, (d) => d.play(uri)) },
    pause: (room) => each(room, (d) => d.pause()),
    resume: (room) => each(room, (d) => d.play()),
    stop: (room) => each(room, (d) => d.stop()),
    setVolume: (room, v) => each(room, (d) => d.setVolume(v)),
    state: async (room) => (await pick(room)[0]?.getCurrentState()) ?? 'stopped',
  }
}
