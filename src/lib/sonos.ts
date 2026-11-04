import { USE_MOCK, supabase } from './supabase'

export interface SonosPlayer { id: string; name: string; volume: number | null }
export interface SonosTrack { name?: string; artist?: string; album?: string; image?: string }
export interface SonosGroup { id: string; name: string; playbackState: string; playerIds: string[]; volume: number | null; muted: boolean; track: SonosTrack | null }
export interface SonosState { connected: boolean; groups: SonosGroup[]; players: SonosPlayer[]; locked: string[]; canLock: boolean }
export interface SonosFavorite { id: string; name: string; description?: string; image?: string; service?: string }

export const isPlaying = (g: SonosGroup) => g.playbackState === 'PLAYBACK_STATE_PLAYING' || g.playbackState === 'PLAYBACK_STATE_BUFFERING'

// ---- demo (no Supabase): three speakers that behave like the real ones ----------------------------------------------------
const mock = {
  connected: true,
  locked: ['p-casket'] as string[],
  players: [
    { id: 'p-chapel', name: 'Chapel', volume: 30 },
    { id: 'p-hall', name: 'Chapel Hall', volume: 25 },
    { id: 'p-casket', name: 'Casket Room', volume: 20 },
  ] as SonosPlayer[],
  groups: [
    { id: 'g-chapel', name: 'Chapel', playbackState: 'PLAYBACK_STATE_PAUSED', playerIds: ['p-chapel'], volume: 30, muted: false, track: { name: 'Ave Maria', artist: 'Schubert — Sunday Choir' } },
    { id: 'g-hall', name: 'Chapel Hall', playbackState: 'PLAYBACK_STATE_IDLE', playerIds: ['p-hall'], volume: 25, muted: false, track: null },
    { id: 'g-casket', name: 'Casket Room', playbackState: 'PLAYBACK_STATE_IDLE', playerIds: ['p-casket'], volume: 20, muted: false, track: null },
  ] as SonosGroup[],
  favorites: [
    { id: 'f1', name: 'Peaceful Piano', description: 'Playlist', service: 'Spotify' },
    { id: 'f2', name: 'Ave Maria & Sacred Classics', description: 'Playlist', service: 'Spotify' },
    { id: 'f3', name: 'Amazing Grace — Hymns', description: 'Playlist', service: 'Spotify' },
    { id: 'f4', name: 'Soft Spanish Guitar', description: 'Playlist', service: 'Spotify' },
    { id: 'f5', name: 'Quiet Waiting-Room Background', description: 'Station', service: 'Soundtrack Your Brand' },
  ] as SonosFavorite[],
}
const tick = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 120))
const regroup = () => {
  mock.groups = mock.groups.filter((g) => g.playerIds.length > 0)
  for (const g of mock.groups) g.name = g.playerIds.map((id) => mock.players.find((p) => p.id === id)!.name).join(' + ')
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('sonos', { body })
  if (error) {
    // the function answered with an error status: its message is in the response body, not in error.message
    let why = ''
    try { const j = await (error as { context?: Response }).context?.json(); why = j?.error ?? '' } catch { /* no body */ }
    throw new Error(why || error.message || 'Could not reach the music service.')
  }
  if (data?.error) throw Object.assign(new Error(data.error), { redirectUri: data.redirectUri })
  return data as T
}

export const sonos = {
  async state(): Promise<SonosState> {
    if (USE_MOCK) return tick({ connected: mock.connected, groups: mock.groups, players: mock.players, locked: mock.locked, canLock: true })
    const d = await call<Partial<SonosState>>({ action: 'state' })
    // Sonos returns rooms in a different order from one refresh to the next, which made the cards jump around. Keep a fixed order.
    const players = [...(d.players ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    const nm = (id: string) => players.find((p) => p.id === id)?.name ?? ''
    const key = (g: SonosGroup) => g.playerIds.map(nm).sort()[0] ?? g.name
    const groups = [...(d.groups ?? [])].sort((a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id))
    return { connected: d.connected !== false, groups, players, locked: d.locked ?? [], canLock: !!d.canLock }
  },
  async favorites(): Promise<SonosFavorite[]> {
    if (USE_MOCK) return tick(mock.favorites)
    return (await call<{ favorites?: SonosFavorite[] }>({ action: 'favorites' })).favorites ?? []
  },
  async connectUrl(): Promise<{ url: string; redirectUri: string }> {
    if (USE_MOCK) return { url: '#', redirectUri: 'https://YOUR-PROJECT.supabase.co/functions/v1/sonos-callback' }
    return call({ action: 'connectUrl' })
  },
  async redirectUri(): Promise<{ redirectUri: string; keysAdded: boolean }> {
    if (USE_MOCK) return { redirectUri: 'https://YOUR-PROJECT.supabase.co/functions/v1/sonos-callback', keysAdded: false }
    return call({ action: 'redirectUri' })
  },
  async disconnect(): Promise<void> {
    if (USE_MOCK) { mock.connected = false; return }
    await call({ action: 'disconnect' })
  },
  async lock(playerId: string, locked: boolean) {
    if (USE_MOCK) { mock.locked = locked ? [...mock.locked, playerId] : mock.locked.filter((x) => x !== playerId); return }
    await call({ action: 'lock', playerId, locked })
  },
  async play(groupId: string) { if (USE_MOCK) { const g = mock.groups.find((x) => x.id === groupId)!; g.playbackState = 'PLAYBACK_STATE_PLAYING'; return } await call({ action: 'play', groupId }) },
  async pause(groupId: string) { if (USE_MOCK) { mock.groups.find((x) => x.id === groupId)!.playbackState = 'PLAYBACK_STATE_PAUSED'; return } await call({ action: 'pause', groupId }) },
  async next(groupId: string) { if (!USE_MOCK) await call({ action: 'next', groupId }) },
  async previous(groupId: string) { if (!USE_MOCK) await call({ action: 'previous', groupId }) },
  async groupVolume(groupId: string, volume: number) {
    if (USE_MOCK) { const g = mock.groups.find((x) => x.id === groupId)!; g.volume = volume; g.playerIds.forEach((id) => { mock.players.find((p) => p.id === id)!.volume = volume }); return }
    await call({ action: 'groupVolume', groupId, volume })
  },
  async playerVolume(playerId: string, volume: number) { if (USE_MOCK) { mock.players.find((p) => p.id === playerId)!.volume = volume; return } await call({ action: 'playerVolume', playerId, volume }) },
  async loadFavorite(groupId: string, favoriteId: string) {
    if (USE_MOCK) { const g = mock.groups.find((x) => x.id === groupId)!; const f = mock.favorites.find((x) => x.id === favoriteId)!; g.playbackState = 'PLAYBACK_STATE_PLAYING'; g.track = { name: f.name, artist: f.service }; return }
    await call({ action: 'loadFavorite', groupId, favoriteId })
  },
  /** Make these speakers one group (they all play what `groupId` is playing). */
  async setGroup(groupId: string, playerIds: string[]) {
    if (USE_MOCK) {
      const g = mock.groups.find((x) => x.id === groupId)!
      for (const o of mock.groups) if (o !== g) o.playerIds = o.playerIds.filter((id) => !playerIds.includes(id))
      g.playerIds = playerIds; regroup(); return
    }
    await call({ action: 'setGroup', groupId, playerIds })
  },
  /** Let one speaker play on its own. */
  async separate(playerId: string) {
    if (USE_MOCK) {
      for (const g of mock.groups) g.playerIds = g.playerIds.filter((id) => id !== playerId)
      const p = mock.players.find((x) => x.id === playerId)!
      mock.groups.push({ id: 'g-' + playerId, name: p.name, playbackState: 'PLAYBACK_STATE_IDLE', playerIds: [playerId], volume: p.volume, muted: false, track: null }); regroup(); return
    }
    await call({ action: 'createGroup', playerIds: [playerId] })
  },
}
