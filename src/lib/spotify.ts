import { USE_MOCK, supabase } from './supabase'

export interface SpotifyDevice { id: string; name: string; type: string; active: boolean; volume: number | null; restricted?: boolean }
export interface SpotifyPlaylist { uri: string; name: string; owner?: string; image?: string; tracks?: number | null }
export interface SpotifyState {
  connected: boolean; user: string | null; devices: SpotifyDevice[]; playing: boolean; deviceId: string | null
  track: { name?: string; artist?: string; image?: string } | null; lockedNames: string[]
}

const mock = {
  connected: true, playing: false, deviceId: 'd-chapel' as string | null, track: null as SpotifyState['track'],
  devices: [
    { id: 'd-chapel', name: 'Chapel', type: 'Speaker', active: true, volume: 30 },
    { id: 'd-hall', name: 'Chapel Hall', type: 'Speaker', active: false, volume: 25 },
    { id: 'd-casket', name: 'Casket Room', type: 'Speaker', active: false, volume: 20 },
  ] as SpotifyDevice[],
  playlists: [
    { uri: 'spotify:playlist:1', name: 'Peaceful Piano', owner: 'Spotify', tracks: 188 },
    { uri: 'spotify:playlist:2', name: 'Ave Maria & Sacred Classics', owner: 'Casillas', tracks: 42 },
    { uri: 'spotify:playlist:3', name: 'Amazing Grace — Hymns', owner: 'Casillas', tracks: 36 },
    { uri: 'spotify:playlist:4', name: 'Soft Spanish Guitar', owner: 'Spotify', tracks: 120 },
    { uri: 'spotify:playlist:5', name: 'Cantos para Misa', owner: 'Casillas', tracks: 58 },
  ] as SpotifyPlaylist[],
}
const tick = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 120))

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('spotify', { body })
  if (error) throw new Error(error.message || 'Could not reach the Spotify service.')
  if (data?.error) throw Object.assign(new Error(data.error), { redirectUri: data.redirectUri })
  return data as T
}

export const spotify = {
  async state(): Promise<SpotifyState> {
    if (USE_MOCK) return tick({ connected: mock.connected, user: 'Casillas Funeral Home', devices: mock.devices, playing: mock.playing, deviceId: mock.deviceId, track: mock.track, lockedNames: ['Casket Room'] })
    const d = await call<Partial<SpotifyState>>({ action: 'state' })
    return { connected: d.connected !== false, user: d.user ?? null, devices: [...(d.devices ?? [])].sort((a, b) => a.name.localeCompare(b.name)), playing: !!d.playing, deviceId: d.deviceId ?? null, track: d.track ?? null, lockedNames: d.lockedNames ?? [] }
  },
  async playlists(): Promise<SpotifyPlaylist[]> {
    if (USE_MOCK) return tick(mock.playlists)
    return (await call<{ playlists?: SpotifyPlaylist[] }>({ action: 'playlists' })).playlists ?? []
  },
  async search(q: string): Promise<SpotifyPlaylist[]> {
    if (USE_MOCK) return tick(mock.playlists.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())))
    return (await call<{ playlists?: SpotifyPlaylist[] }>({ action: 'search', q })).playlists ?? []
  },
  async connectUrl(): Promise<{ url: string; redirectUri: string }> {
    if (USE_MOCK) return { url: '#', redirectUri: 'https://YOUR-PROJECT.supabase.co/functions/v1/spotify-callback' }
    return call({ action: 'connectUrl' })
  },
  async redirectUri(): Promise<{ redirectUri: string; keysAdded: boolean }> {
    if (USE_MOCK) return { redirectUri: 'https://YOUR-PROJECT.supabase.co/functions/v1/spotify-callback', keysAdded: false }
    return call({ action: 'redirectUri' })
  },
  async disconnect() { if (USE_MOCK) { mock.connected = false; return } await call({ action: 'disconnect' }) },
  async play(deviceId: string, contextUri: string, name?: string) {
    if (USE_MOCK) { mock.playing = true; mock.deviceId = deviceId; mock.devices.forEach((d) => { d.active = d.id === deviceId }); mock.track = { name: name ?? 'Playlist', artist: 'Spotify' }; return }
    await call({ action: 'play', deviceId, contextUri })
  },
  async pause(deviceId: string) { if (USE_MOCK) { mock.playing = false; return } await call({ action: 'pause', deviceId }) },
  async next(deviceId: string) { if (!USE_MOCK) await call({ action: 'next', deviceId }) },
  async previous(deviceId: string) { if (!USE_MOCK) await call({ action: 'previous', deviceId }) },
  async volume(deviceId: string, volume: number) {
    if (USE_MOCK) { const d = mock.devices.find((x) => x.id === deviceId); if (d) d.volume = volume; return }
    await call({ action: 'volume', deviceId, volume })
  },
}
