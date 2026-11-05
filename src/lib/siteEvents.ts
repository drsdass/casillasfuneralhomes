import { USE_MOCK, supabase } from './supabase'
import { callPublic } from './obituaries'

export interface SiteEvent { id: string; orgId: string; locationId?: string; title: string; description: string; startsAt: string; endsAt?: string; place: string; photoUrl?: string; capacity?: number; rsvpOpen: boolean; status: 'draft' | 'published'; attending?: number }
export interface Rsvp { id: string; eventId: string; name: string; email?: string; phone?: string; guests: number; createdAt: string }

const TZ = 'America/Los_Angeles'
export const fmtWhen = (iso: string, end?: string) => {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })
  const t = (x: Date) => x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
  return `${day} · ${t(d)}${end ? ` – ${t(new Date(end))}` : ''}`
}
export const dayParts = (iso: string) => { const d = new Date(iso); return { mon: d.toLocaleDateString('en-US', { month: 'short', timeZone: TZ }).toUpperCase(), day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: TZ }) } }
/** For <input type="datetime-local">: the Pacific wall-clock time of a stored instant, and back. */
export const toLocalInput = (iso?: string) => {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a }, {})
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
export const fromLocalInput = (v: string): string => {
  if (!v) return ''
  const guess = Date.parse(`${v}:00Z`)
  const off = (t: number) => Date.parse(`${toLocalInput(new Date(t).toISOString())}:00Z`) - t   // Pacific offset (negative) at that instant
  let t = guess - off(guess)
  t = guess - off(t)                                                                           // once more, in case the first guess crossed a clock change
  return new Date(t).toISOString()
}

const row = (r: any): SiteEvent => ({ id: r.id, orgId: r.org_id, locationId: r.location_id ?? undefined, title: r.title, description: r.description ?? '', startsAt: r.starts_at, endsAt: r.ends_at ?? undefined, place: r.place ?? '', photoUrl: r.photo_url ?? undefined, capacity: r.capacity ?? undefined, rsvpOpen: !!r.rsvp_open, status: r.status ?? 'published', attending: r.attending })

// ---- demo store ----
const KEY = 'casillas-site-events'; const RKEY = 'casillas-site-rsvps'
const seed = (): SiteEvent[] => {
  const d = (n: number, h: number) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x.toISOString() }
  return [
    { id: 'e1', orgId: 'demo', title: 'Grief Support Circle', description: 'A gentle, open conversation for anyone grieving the loss of a loved one. Coffee and pastries provided.', startsAt: d(6, 18), endsAt: d(6, 19), place: 'Casillas Funeral Home — Chapel Hall', capacity: 25, rsvpOpen: true, status: 'published' },
    { id: 'e2', orgId: 'demo', title: 'Pre-Planning Seminar', description: 'Learn how planning ahead protects your family, and what it costs. No obligation.', startsAt: d(20, 11), endsAt: d(20, 12), place: 'Casillas Funeral Home', rsvpOpen: true, status: 'published' },
    { id: 'e3', orgId: 'demo', title: 'Candlelight Remembrance (draft)', description: 'Annual evening of remembrance.', startsAt: d(45, 18), place: 'Chapel', rsvpOpen: true, status: 'draft' },
  ]
}
const loadE = (): SiteEvent[] => { try { const j = localStorage.getItem(KEY); if (j) return JSON.parse(j) } catch { /* ignore */ } const s = seed(); saveE(s); return s }
const saveE = (e: SiteEvent[]) => { try { localStorage.setItem(KEY, JSON.stringify(e)) } catch { /* ignore */ } }
const loadR = (): Rsvp[] => { try { return JSON.parse(localStorage.getItem(RKEY) ?? '[]') } catch { return [] } }
const saveR = (r: Rsvp[]) => { try { localStorage.setItem(RKEY, JSON.stringify(r)) } catch { /* ignore */ } }

export const siteEvents = {
  async list(orgId: string): Promise<SiteEvent[]> {
    if (USE_MOCK) return loadE().sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    const { data, error } = await supabase!.from('site_events').select('*').eq('org_id', orgId).order('starts_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map(row)
  },
  async save(e: Partial<SiteEvent> & { orgId: string; title: string; startsAt: string }, by?: string): Promise<SiteEvent> {
    const now = new Date().toISOString()
    if (USE_MOCK) {
      const all = loadE(); const i = all.findIndex((x) => x.id === e.id)
      const next = { rsvpOpen: true, status: 'draft', description: '', place: '', ...(i >= 0 ? all[i] : { id: crypto.randomUUID() }), ...e } as SiteEvent
      if (i >= 0) all[i] = next; else all.push(next); saveE(all); return next
    }
    const rec = { org_id: e.orgId, location_id: e.locationId ?? null, title: e.title, description: e.description ?? '', starts_at: e.startsAt, ends_at: e.endsAt ?? null, place: e.place ?? '', photo_url: e.photoUrl ?? null, capacity: e.capacity ?? null, rsvp_open: e.rsvpOpen ?? true, status: e.status ?? 'draft', updated_at: now }
    if (e.id) { const { data, error } = await supabase!.from('site_events').update(rec).eq('id', e.id).select().single(); if (error) throw error; return row(data) }
    const { data, error } = await supabase!.from('site_events').insert({ ...rec, created_by: by ?? null }).select().single()
    if (error) throw error
    return row(data)
  },
  async remove(e: SiteEvent) {
    if (USE_MOCK) { saveE(loadE().filter((x) => x.id !== e.id)); return }
    const { error } = await supabase!.from('site_events').delete().eq('id', e.id); if (error) throw error
  },
  async rsvps(eventId: string): Promise<Rsvp[]> {
    if (USE_MOCK) return loadR().filter((r) => r.eventId === eventId)
    const { data, error } = await supabase!.from('site_event_rsvps').select('*').eq('event_id', eventId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r: any) => ({ id: r.id, eventId: r.event_id, name: r.name, email: r.email ?? undefined, phone: r.phone ?? undefined, guests: r.guests ?? 1, createdAt: r.created_at }))
  },
  async removeRsvp(r: Rsvp) {
    if (USE_MOCK) { saveR(loadR().filter((x) => x.id !== r.id)); return }
    const { error } = await supabase!.from('site_event_rsvps').delete().eq('id', r.id); if (error) throw error
  },
  /** A spreadsheet-ready list of who signed up. */
  csv(e: SiteEvent, rs: Rsvp[]): string {
    const q = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
    return [['Name', 'Email', 'Phone', 'Guests', 'Signed up'].map(q).join(','), ...rs.map((r) => [r.name, r.email, r.phone, r.guests, r.createdAt].map(q).join(','))].join('\n')
  },
  async uploadPhoto(orgId: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Please choose a picture (JPG or PNG).')
    if (USE_MOCK) return URL.createObjectURL(file)
    const path = `events/${orgId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '-')}`
    const { error } = await supabase!.storage.from('obituary-photos').upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)
    return supabase!.storage.from('obituary-photos').getPublicUrl(path).data.publicUrl
  },
}

export const publicEvents = {
  async list(org?: string): Promise<{ items: SiteEvent[]; orgName: string | null }> {
    if (USE_MOCK) return { items: loadE().filter((e) => e.status === 'published').map((e) => ({ ...e, attending: loadR().filter((r) => r.eventId === e.id).reduce((n, r) => n + r.guests, 0) })).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), orgName: 'Casillas Funeral Home' }
    const r = await callPublic<{ items: any[]; orgName: string | null }>({ action: 'events', org })
    return { items: r.items.map(row), orgName: r.orgName }
  },
  async rsvp(eventId: string, v: { name: string; email: string; phone: string; guests: number; hp?: string }): Promise<void> {
    if (USE_MOCK) {
      const e = loadE().find((x) => x.id === eventId); if (!e) throw new Error('This event was not found.')
      const taken = loadR().filter((r) => r.eventId === eventId).reduce((n, r) => n + r.guests, 0)
      if (e.capacity && taken + v.guests > e.capacity) throw new Error('This event is full.')
      saveR([{ id: crypto.randomUUID(), eventId, name: v.name, email: v.email, phone: v.phone, guests: v.guests, createdAt: new Date().toISOString() }, ...loadR()]); return
    }
    await callPublic({ action: 'rsvp', eventId, ...v })
  },
}
