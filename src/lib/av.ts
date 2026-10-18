// Service AV (music + live stream) data layer. Real mode only: the chapel hardware is reached through
// the on-site bridge, so without Supabase there is nothing to control and pages say so.
import { USE_MOCK, supabase, supabaseUrl, supabaseAnonKey } from './supabase'

export type Scene = 'speaker' | 'front' | 'audience' | 'slate'
export const SCENE_LABELS: Record<Scene, string> = {
  speaker: 'Speaker', front: 'Front (casket & altar)', audience: 'Audience', slate: 'Blank screen',
}

export interface ServiceAv {
  caseId: string
  streamAllowed: boolean
  showCasket: boolean
  showAudience: boolean
  recordService: boolean
  pin: string
  linkExpiresAt: string | null
  watchToken: string
  remoteToken: string
  remoteEnabled: boolean
  remoteMusic: boolean
  remoteCameras: boolean
  live: boolean
  liveStartedAt: string | null
  currentScene: Scene | null
  musicState: 'playing' | 'paused' | 'stopped'
  nowPlaying: string | null
  volume: number
  musicRoom: string
  replayUrl: string
}

export interface AvStatus { bridgeOnline: boolean; playerConfigured: boolean; bridgeInfo: { rooms?: string[]; obs?: boolean } }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAv(r: any): ServiceAv {
  return {
    caseId: r.case_id, streamAllowed: r.stream_allowed, showCasket: r.show_casket, showAudience: r.show_audience,
    recordService: r.record_service, pin: r.pin ?? '', linkExpiresAt: r.link_expires_at, watchToken: r.watch_token,
    remoteToken: r.remote_token, remoteEnabled: r.remote_enabled, remoteMusic: r.remote_music,
    remoteCameras: r.remote_cameras, live: r.live, liveStartedAt: r.live_started_at, currentScene: r.current_scene,
    musicState: r.music_state, nowPlaying: r.now_playing, volume: r.volume, musicRoom: r.music_room ?? '',
    replayUrl: r.replay_url ?? '',
  }
}

const SETTING_COLUMNS: Record<string, string> = {
  streamAllowed: 'stream_allowed', showCasket: 'show_casket', showAudience: 'show_audience', recordService: 'record_service',
  pin: 'pin', linkExpiresAt: 'link_expires_at', remoteEnabled: 'remote_enabled', remoteMusic: 'remote_music',
  remoteCameras: 'remote_cameras', musicRoom: 'music_room', replayUrl: 'replay_url',
}

export const av = {
  available: !USE_MOCK,

  /** Gets the case's service row, creating it (with fresh private links) the first time. */
  async getService(caseId: string): Promise<ServiceAv> {
    if (USE_MOCK) throw new Error('Service AV needs the live database.')
    const { data } = await supabase!.from('service_av').select('*').eq('case_id', caseId).maybeSingle()
    if (data) return rowToAv(data)
    const { data: made, error } = await supabase!.from('service_av').insert({ case_id: caseId }).select().single()
    if (error) throw error
    return rowToAv(made)
  },

  async updateSettings(caseId: string, patch: Partial<ServiceAv>): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const [k, v] of Object.entries(patch)) {
      const col = SETTING_COLUMNS[k]
      if (!col) continue
      row[col] = (k === 'pin' || k === 'replayUrl' || k === 'musicRoom' || k === 'linkExpiresAt') && v === '' ? null : v
    }
    const { error } = await supabase!.from('service_av').update(row).eq('case_id', caseId)
    if (error) throw error
  },

  /** Fresh private links (old ones stop working). */
  async resetLinks(caseId: string): Promise<void> {
    const rnd = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
    const { error } = await supabase!.from('service_av').update({ watch_token: rnd(), remote_token: rnd() }).eq('case_id', caseId)
    if (error) throw error
  },

  async send(caseId: string, locationId: string, kind: string, payload: Record<string, unknown> = {}, who = 'staff'): Promise<void> {
    const { error } = await supabase!.from('av_commands').insert({ case_id: caseId, location_id: locationId, kind, payload, requested_by: who })
    if (error) throw new Error(error.message)
  },

  async recentCommands(caseId: string) {
    const { data, error } = await supabase!.from('av_commands').select('*').eq('case_id', caseId).order('id', { ascending: false }).limit(8)
    if (error) throw error
    return data ?? []
  },

  async locationStatus(locationId: string): Promise<AvStatus> {
    const { data, error } = await supabase!.rpc('av_location_status', { loc: locationId })
    if (error) throw error
    const r = Array.isArray(data) ? data[0] : data
    return { bridgeOnline: !!r?.bridge_online, playerConfigured: !!r?.player_configured, bridgeInfo: r?.bridge_info ?? {} }
  },

  /** Admin-only: the live player address and the bridge's sign-in key. */
  async getLocationSetup(locationId: string): Promise<{ playerEmbedUrl: string; bridgeKey: string } | null> {
    const { data } = await supabase!.from('av_locations').select('player_embed_url, bridge_key').eq('location_id', locationId).maybeSingle()
    return data ? { playerEmbedUrl: data.player_embed_url ?? '', bridgeKey: data.bridge_key } : null
  },
  async saveLocationSetup(locationId: string, playerEmbedUrl: string): Promise<void> {
    const { error } = await supabase!.from('av_locations').upsert({ location_id: locationId, player_embed_url: playerEmbedUrl || null })
    if (error) throw error
  },

  /** The family's links call this (no login). */
  async publicCall(body: Record<string, unknown>) {
    if (USE_MOCK) throw new Error('This link needs the live database.')
    const res = await fetch(`${supabaseUrl}/functions/v1/av-public`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: supabaseAnonKey as string, authorization: `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error ?? 'Something went wrong.')
    return data
  },
}
