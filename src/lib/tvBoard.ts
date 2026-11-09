import { USE_MOCK, supabase, supabaseUrl, supabaseAnonKey } from './supabase'
import { api } from './api'
import { isCaseDone, isPreNeed } from './caseDone'

export type OrderState = 'confirmed' | 'ordered' | 'pending' | 'delivered' | null
export interface BoardEvent { start: string; end: string; staff: string[]; label?: string; place?: string }
export interface BoardRowData {
  id: string; locationId: string; caseNumber: string; firstName: string; lastName: string; color?: string
  disposition: string; visitationLocation?: string; serviceLocation?: string; boardDisp?: string; boardPlace?: string; boardFlowers?: string; boardBirds?: string; boardEscort?: string; serviceDate?: string; visitationDate?: string; visitationEnd?: string
  /** Every visitation and every service on the case, soonest first. */
  visits: BoardEvent[]; services: BoardEvent[]
  flowers: OrderState; birds: OrderState; escort: OrderState
  casket?: string; casketLines?: string[]; specials: string[]
  custodyStage?: string
}
export interface BoardData {
  screen?: { name: string; locationId?: string | null }
  locations: { id: string; name: string }[]
  rows: BoardRowData[]
}

/** The board as the logged-in app builds it (also used for the demo data). Same shape the public tv-board function returns. */
export async function loadBoardData(): Promise<BoardData> {
  const [cases, events, contracts, staff, locations] = await Promise.all([api.getCases(), api.getCalendarEvents(), api.getContracts(), api.getStaff(), api.getLocations()])
  const active = cases.filter((c) => !isCaseDone(c) && !isPreNeed(c)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const rows: BoardRowData[] = await Promise.all(active.map(async (c) => {
    const [orders, notes] = await Promise.all([api.getOrders(c.id), api.getCaseNotes(c.id)])
    // Burial / committal times sit in the Service column with the other services.
    const evs = (type: string): BoardEvent[] => events.filter((x) => x.caseId === c.id && (x.type === type || (type === 'service' && x.type === 'burial'))).sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({ start: e.start, end: e.end, label: e.label, place: e.location, staff: e.participantIds.map((id) => names.get(id)).filter(Boolean) as string[] }))
    const st = (re: RegExp) => (orders.find((o) => re.test(o.item))?.status ?? null) as OrderState
    const casketLines = contracts.filter((k) => k.caseId === c.id).flatMap((k) => k.lineItems.map((li) => li.name))
    return {
      id: c.id, locationId: c.locationId, caseNumber: c.caseNumber, firstName: c.decedent.firstName, lastName: c.decedent.lastName, color: c.color,
      disposition: c.disposition, boardDisp: c.boardDisp, boardPlace: c.boardPlace, boardFlowers: c.boardFlowers, boardBirds: c.boardBirds, boardEscort: c.boardEscort, serviceDate: c.serviceDate, serviceLocation: c.serviceLocation, visitationLocation: c.visitationLocation, visitationDate: c.visitationDate, visitationEnd: c.visitationEnd, visits: evs('visitation'), services: evs('service'),
      custodyStage: c.custodyStage,
      flowers: st(/flower/i), birds: st(/dove|bird/i), escort: st(/escort|carriage/i), casketLines,
      specials: notes.filter((n) => n.isSpecialRequest).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n) => n.body),
    }
  }))
  return { locations: locations.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name })), rows }
}

/** The wall monitor's link calls this (no login). */
export async function loadBoardByToken(token: string): Promise<BoardData> {
  if (USE_MOCK) {
    const d = await loadBoardData()
    return { ...d, screen: { name: 'Demo screen', locationId: d.locations[0]?.id } }
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/tv-board`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: supabaseAnonKey as string, authorization: `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ token }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data?.error ?? 'Something went wrong.'), { status: res.status })
  return data as BoardData
}

// ---------------------------------------------------------------------------
// Admin: the list of screens
// ---------------------------------------------------------------------------
export interface TvScreen { id: string; orgId: string; locationId?: string; name: string; token: string; active: boolean; lastSeenAt?: string }
const rowToScreen = (r: any): TvScreen => ({ id: r.id, orgId: r.org_id, locationId: r.location_id ?? undefined, name: r.name, token: r.token, active: r.active, lastSeenAt: r.last_seen_at ?? undefined })
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('')
let mockScreens: TvScreen[] = []

export const tvScreens = {
  async list(): Promise<TvScreen[]> {
    if (USE_MOCK) return [...mockScreens]
    const { data, error } = await supabase!.from('tv_screens').select('*').order('created_at')
    if (error) throw error
    return (data ?? []).map(rowToScreen)
  },
  async create(orgId: string, name: string, locationId?: string): Promise<void> {
    if (USE_MOCK) { mockScreens.push({ id: `tv-${Date.now()}`, orgId, locationId, name, token: rand(), active: true }); return }
    const { error } = await supabase!.from('tv_screens').insert({ org_id: orgId, name, location_id: locationId ?? null })
    if (error) throw error
  },
  async setActive(id: string, active: boolean): Promise<void> {
    if (USE_MOCK) { mockScreens = mockScreens.map((s) => (s.id === id ? { ...s, active } : s)); return }
    const { error } = await supabase!.from('tv_screens').update({ active }).eq('id', id)
    if (error) throw error
  },
  /** A new link: the old address stops working at once. */
  async newLink(id: string): Promise<void> {
    if (USE_MOCK) { mockScreens = mockScreens.map((s) => (s.id === id ? { ...s, token: rand() } : s)); return }
    const { error } = await supabase!.from('tv_screens').update({ token: rand() + rand().slice(0, 8) }).eq('id', id)
    if (error) throw error
  },
  async remove(id: string): Promise<void> {
    if (USE_MOCK) { mockScreens = mockScreens.filter((s) => s.id !== id); return }
    const { error } = await supabase!.from('tv_screens').delete().eq('id', id)
    if (error) throw error
  },
}
