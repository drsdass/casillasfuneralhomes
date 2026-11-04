import { USE_MOCK, supabase } from './supabase'
import { mediaKind } from './caseMedia'

export interface PlayerItem { id: string; title: string; kind: 'video' | 'audio' | 'image'; source: 'youtube' | 'file'; youtubeId?: string; path?: string; url?: string }
export interface PlayerStatus { pos?: number; dur?: number; state?: string; error?: string; title?: string }
export interface PlayerCmd { n: number; type: 'seek'; by: number }
export interface PlayerState { queue: PlayerItem[]; idx: number; playing: boolean; seq: number; cmd: PlayerCmd | null; status: PlayerStatus | null; heartbeat: string | null }
export interface HouseItem { id: string; title: string; kind: PlayerItem['kind']; source: PlayerItem['source']; youtubeId?: string; path?: string; size: number; createdAt: string }

const EMPTY: PlayerState = { queue: [], idx: 0, playing: false, seq: 0, cmd: null, status: null, heartbeat: null }
const KEY = 'casillas-chapel-player'
const HKEY = 'casillas-house-media'

const readMock = (): PlayerState => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { ...EMPTY } } }
const writeMock = (p: Partial<PlayerState>) => { const s = { ...readMock(), ...p }; try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }

const rowOf = (r: any): PlayerState => ({ queue: r?.queue ?? [], idx: r?.idx ?? 0, playing: !!r?.playing, seq: r?.seq ?? 0, cmd: r?.cmd ?? null, status: r?.status ?? null, heartbeat: r?.heartbeat ?? null })

/** Plays one YouTube link: accepts watch, youtu.be, shorts and embed addresses, or a bare 11-character id. */
export function youtubeId(input: string): string | null {
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null
    if (!/youtube(-nocookie)?\.com$/.test(u.hostname.replace(/^(www|m|music)\./, ''))) return null
    const v = u.searchParams.get('v'); if (v) return v.slice(0, 11)
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/); return m ? m[1] : null
  } catch { return null }
}

export const chapelPlayer = {
  async state(orgId: string): Promise<PlayerState> {
    if (USE_MOCK) return readMock()
    const { data, error } = await supabase!.from('chapel_player').select('*').eq('org_id', orgId).maybeSingle()
    if (error) throw error
    return data ? rowOf(data) : { ...EMPTY }
  },
  /** Change the remote-control row. Remote controls call this; the player page follows. */
  async patch(orgId: string, p: Partial<Pick<PlayerState, 'queue' | 'idx' | 'playing' | 'seq' | 'cmd'>>, by?: string): Promise<void> {
    if (USE_MOCK) { writeMock(p); return }
    const { error } = await supabase!.from('chapel_player').upsert({ org_id: orgId, ...p, updated_by: by ?? null, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
    if (error) throw error
  },
  /** Written by the Chapel Player page only (so the tablet can see it is alive and how far along it is). */
  async report(orgId: string, status: PlayerStatus): Promise<void> {
    if (USE_MOCK) { writeMock({ status, heartbeat: new Date().toISOString() }); return }
    await supabase!.from('chapel_player').upsert({ org_id: orgId, status, heartbeat: new Date().toISOString() }, { onConflict: 'org_id' })
  },
  /** The player finished an item: move on, but only if the tablet has not already changed it. Returns nothing. */
  async advance(orgId: string, fromIdx: number, queueLen: number): Promise<void> {
    const next = fromIdx + 1 < queueLen ? { idx: fromIdx + 1, playing: true } : { idx: queueLen, playing: false }
    if (USE_MOCK) { if (readMock().idx === fromIdx) writeMock(next); return }
    await supabase!.from('chapel_player').update({ ...next, updated_at: new Date().toISOString() }).eq('org_id', orgId).eq('idx', fromIdx)
  },
  subscribe(orgId: string, onChange: () => void): () => void {
    if (USE_MOCK) { const h = (e: StorageEvent) => { if (e.key === KEY) onChange() }; window.addEventListener('storage', h); return () => window.removeEventListener('storage', h) }
    const ch = supabase!.channel(`chapel-player-${orgId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'chapel_player', filter: `org_id=eq.${orgId}` }, onChange).subscribe()
    return () => { void supabase!.removeChannel(ch) }
  },

  // ---- remote-control helpers (each reads the freshest state first) ----
  async playNow(orgId: string, items: PlayerItem[], by?: string) {
    await this.patch(orgId, { queue: items, idx: 0, playing: true, seq: (await this.state(orgId)).seq + 1, cmd: null }, by)
  },
  async add(orgId: string, items: PlayerItem[], by?: string) {
    const s = await this.state(orgId)
    const atEnd = s.idx >= s.queue.length
    await this.patch(orgId, { queue: [...s.queue, ...items], idx: atEnd ? s.queue.length : s.idx, playing: atEnd ? true : s.playing, seq: atEnd ? s.seq + 1 : s.seq }, by)
  },
  async jump(orgId: string, i: number, by?: string) { const s = await this.state(orgId); await this.patch(orgId, { idx: i, playing: true, seq: s.seq + 1 }, by) },
  async setPlaying(orgId: string, playing: boolean, by?: string) {
    const s = await this.state(orgId)
    if (playing && s.idx >= s.queue.length && s.queue.length) return this.patch(orgId, { idx: 0, playing: true, seq: s.seq + 1 }, by)
    await this.patch(orgId, { playing }, by)
  },
  async step(orgId: string, d: 1 | -1, by?: string) {
    const s = await this.state(orgId); const i = Math.min(Math.max(s.idx + d, 0), s.queue.length)
    await this.patch(orgId, { idx: i, playing: i < s.queue.length, seq: s.seq + 1 }, by)
  },
  async seek(orgId: string, by: number) { await this.patch(orgId, { cmd: { n: Date.now(), type: 'seek', by } }) },
  async removeAt(orgId: string, i: number, by?: string) {
    const s = await this.state(orgId); const queue = s.queue.filter((_, k) => k !== i)
    const idx = i < s.idx ? s.idx - 1 : s.idx
    await this.patch(orgId, { queue, idx, seq: i === s.idx ? s.seq + 1 : s.seq, playing: i === s.idx && idx >= queue.length ? false : s.playing }, by)
  },
  async clear(orgId: string, by?: string) { const s = await this.state(orgId); await this.patch(orgId, { queue: [], idx: 0, playing: false, seq: s.seq + 1, cmd: null }, by) },
}

// ---- House library --------------------------------------------------------------------------------------------------
const hrow = (r: any): HouseItem => ({ id: r.id, title: r.title, kind: r.kind, source: r.source, youtubeId: r.youtube_id ?? undefined, path: r.storage_path ?? undefined, size: Number(r.size ?? 0), createdAt: r.created_at })
const hmock: { items: HouseItem[] } = { items: [] }
try { const j = localStorage.getItem(HKEY); if (j) hmock.items = JSON.parse(j) } catch { /* ignore */ }
const hsave = () => { try { localStorage.setItem(HKEY, JSON.stringify(hmock.items)) } catch { /* ignore */ } }

export const toItem = (h: HouseItem): PlayerItem => ({ id: h.id, title: h.title, kind: h.kind, source: h.source, youtubeId: h.youtubeId, path: h.path })

export const houseMedia = {
  async list(orgId: string): Promise<HouseItem[]> {
    if (USE_MOCK) return [...hmock.items]
    const { data, error } = await supabase!.from('house_media').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(hrow)
  },
  /** A name for a YouTube link, asked from YouTube itself. Returns '' when it cannot be found (staff can type one). */
  async youtubeTitle(id: string): Promise<string> {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`)
      if (!r.ok) return ''
      return String((await r.json()).title ?? '')
    } catch { return '' }
  },
  async addYoutube(orgId: string, id: string, title: string, by: string): Promise<HouseItem> {
    if (USE_MOCK) { const h: HouseItem = { id: crypto.randomUUID(), title, kind: 'video', source: 'youtube', youtubeId: id, size: 0, createdAt: new Date().toISOString() }; hmock.items.unshift(h); hsave(); return h }
    const { data, error } = await supabase!.from('house_media').insert({ org_id: orgId, title, kind: 'video', source: 'youtube', youtube_id: id, created_by: by }).select().single()
    if (error) throw error
    return hrow(data)
  },
  async upload(orgId: string, file: File, by: string): Promise<HouseItem> {
    const kind = mediaKind(file)
    if (!kind) throw new Error(`“${file.name}” is not a music, video or picture file.`)
    const title = file.name.replace(/\.[^.]+$/, '')
    if (USE_MOCK) { const h: HouseItem = { id: crypto.randomUUID(), title, kind, source: 'file', path: `mock/${file.name}`, size: file.size, createdAt: new Date().toISOString() }; hmock.items.unshift(h); hsave(); return h }
    const path = `house/${orgId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '-')}`
    const { error } = await supabase!.storage.from('case-media').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (error) {
      if (/exceed|too large|maximum/i.test(error.message)) throw new Error(`“${file.name}” is bigger than the storage limit (${Math.round(file.size / 1048576)} MB). Ask Satish to raise the Supabase upload limit.`)
      throw new Error(error.message)
    }
    const { data, error: e2 } = await supabase!.from('house_media').insert({ org_id: orgId, title, kind, source: 'file', storage_path: path, mime: file.type, size: file.size, created_by: by }).select().single()
    if (e2) { await supabase!.storage.from('case-media').remove([path]); throw e2 }
    return hrow(data)
  },
  async rename(h: HouseItem, title: string) {
    if (USE_MOCK) { const x = hmock.items.find((i) => i.id === h.id); if (x) x.title = title; hsave(); return }
    const { error } = await supabase!.from('house_media').update({ title }).eq('id', h.id); if (error) throw error
  },
  async remove(h: HouseItem) {
    if (USE_MOCK) { hmock.items = hmock.items.filter((i) => i.id !== h.id); hsave(); return }
    if (h.path) await supabase!.storage.from('case-media').remove([h.path])
    const { error } = await supabase!.from('house_media').delete().eq('id', h.id); if (error) throw error
  },
}

/** A short-lived address the player can open for an uploaded file. */
export async function fileUrl(item: PlayerItem): Promise<string> {
  if (item.url) return item.url
  if (USE_MOCK || !item.path) return ''
  const { data, error } = await supabase!.storage.from('case-media').createSignedUrl(item.path, 60 * 60 * 6)
  if (error) throw error
  return data.signedUrl
}

/** Recent family files from every case (for the "Family files" tab on the tablet). */
export interface RecentFamilyFile { id: string; caseLabel: string; name: string; kind: PlayerItem['kind']; path: string }
export async function recentFamilyFiles(): Promise<RecentFamilyFile[]> {
  if (USE_MOCK) return []
  const { data, error } = await supabase!.from('case_media').select('id,name,kind,storage_path,created_at,cases(decedent_first_name,decedent_last_name)').order('created_at', { ascending: false }).limit(60)
  if (error) throw error
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, kind: r.kind, path: r.storage_path, caseLabel: [r.cases?.decedent_first_name, r.cases?.decedent_last_name].filter(Boolean).join(' ') || 'Case' }))
}
