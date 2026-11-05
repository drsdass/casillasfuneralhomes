import { USE_MOCK, supabase, supabaseUrl, supabaseAnonKey } from './supabase'
import { api } from './api'
import type { FuneralCase } from '@/types'

export interface Obituary {
  id: string; orgId: string; locationId?: string; caseId?: string; slug: string; name: string
  birthDate?: string; deathDate?: string; photoUrl?: string; body: string; serviceInfo: string
  status: 'draft' | 'published'; pinned: boolean; publishedAt?: string; createdAt: string; updatedAt: string
}
export interface Tribute { id: string; obituaryId: string; kind: 'guestbook' | 'candle'; name: string; message: string; approved: boolean; createdAt: string }
export interface PublicObit { id: string; slug: string; name: string; birthDate?: string; deathDate?: string; photoUrl?: string; publishedAt?: string; locationId?: string; pinned?: boolean }
export interface PublicList { items: PublicObit[]; total: number; page: number; per: number; locations: { id: string; name: string }[]; orgName: string | null }
export interface PublicDetail { obituary: PublicObit & { body: string; serviceInfo: string; orgId: string }; tributes: { id: string; kind: 'guestbook' | 'candle'; name: string; message: string; createdAt: string }[]; orgName: string | null; location: { name: string; address?: string; city?: string; state?: string; phone?: string } | null }

export const PER_PAGE = 20

const row = (r: any): Obituary => ({
  id: r.id, orgId: r.org_id, locationId: r.location_id ?? undefined, caseId: r.case_id ?? undefined, slug: r.slug, name: r.name,
  birthDate: r.birth_date ?? undefined, deathDate: r.death_date ?? undefined, photoUrl: r.photo_url ?? undefined, body: r.body ?? '', serviceInfo: r.service_info ?? '',
  status: r.status, pinned: !!r.pinned, publishedAt: r.published_at ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at,
})
const pubRow = (r: any): PublicObit => ({ id: r.id, slug: r.slug, name: r.name, birthDate: r.birth_date ?? undefined, deathDate: r.death_date ?? undefined, photoUrl: r.photo_url ?? undefined, publishedAt: r.published_at ?? undefined, locationId: r.location_id ?? undefined, pinned: !!r.pinned })

export const slugify = (name: string) => `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'obituary'}-${Math.random().toString(36).slice(2, 7)}`

/** "Nov 4, 2026" — dates arrive as yyyy-mm-dd and must not shift with the time zone. */
export function fmtDate(d?: string, long = false): string {
  if (!d) return ''
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  if (!y || !m || !day) return ''
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: long ? 'long' : 'short', day: 'numeric', year: 'numeric' })
}
export const lifeSpan = (o: { birthDate?: string; deathDate?: string }) => (o.birthDate && o.deathDate ? `${fmtDate(o.birthDate, true)} – ${fmtDate(o.deathDate, true)}` : o.deathDate ? fmtDate(o.deathDate, true) : '')

// ---------------- demo store (no Supabase) ----------------
const KEY = 'casillas-obituaries'
const TKEY = 'casillas-obituary-tributes'
const seed = (): Obituary[] => {
  const mk = (i: number, name: string, d: string, status: Obituary['status'] = 'published'): Obituary => ({
    id: `demo-${i}`, orgId: 'demo', slug: slugify(name), name, birthDate: `19${40 + i}-0${(i % 9) + 1}-1${i % 9}`, deathDate: d,
    body: `${name.split(' ')[0]} was loved by all who knew them. They will be remembered for their kindness, their laughter and the way they gathered the family around the table.\n\nThey are survived by their children, grandchildren and many friends.`,
    serviceInfo: 'Visitation: Friday 5:00–8:00 PM\nService: Saturday 10:00 AM', status, pinned: false, publishedAt: `${d}T09:00:00Z`, createdAt: `${d}T09:00:00Z`, updatedAt: `${d}T09:00:00Z`,
  })
  return [mk(1, 'Diego Andres Torres-Oliveros', '2026-11-04'), mk(2, 'Raul Meneses', '2026-10-31'), mk(3, 'Emma "Violeta" Auchard', '2026-10-26'), mk(4, 'Marcelino R. Maldonado', '2026-10-24'), mk(5, 'Roberto Rodriguez Mariscal', '2026-10-24'), mk(6, 'Monica Peralta Garcia', '2026-10-22'), mk(7, 'Rafael Diaz', '2026-10-21', 'draft')]
}
const loadMock = (): Obituary[] => { try { const j = localStorage.getItem(KEY); if (j) return JSON.parse(j) } catch { /* ignore */ } const s = seed(); saveMock(s); return s }
const saveMock = (o: Obituary[]) => { try { localStorage.setItem(KEY, JSON.stringify(o)) } catch { /* ignore */ } }
const loadT = (): Tribute[] => { try { return JSON.parse(localStorage.getItem(TKEY) ?? '[]') } catch { return [] } }
const saveT = (t: Tribute[]) => { try { localStorage.setItem(TKEY, JSON.stringify(t)) } catch { /* ignore */ } }

// ---------------- staff side (signed in) ----------------
export interface ObitQuery { orgId: string; q?: string; locationId?: string; status?: 'published' | 'draft'; page?: number }
export const obituaries = {
  async list(o: ObitQuery): Promise<{ items: Obituary[]; total: number }> {
    const page = o.page ?? 1
    if (USE_MOCK) {
      let all = loadMock().filter((x) => (!o.status || x.status === o.status) && (!o.locationId || x.locationId === o.locationId) && (!o.q || x.name.toLowerCase().includes(o.q.toLowerCase())))
      all = all.sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
      return { items: all.slice((page - 1) * PER_PAGE, page * PER_PAGE), total: all.length }
    }
    let q = supabase!.from('obituaries').select('*', { count: 'exact' }).eq('org_id', o.orgId)
    if (o.status) q = q.eq('status', o.status)
    if (o.locationId) q = q.eq('location_id', o.locationId)
    if (o.q?.trim()) q = q.ilike('name', `%${o.q.trim().replace(/[%_,()]/g, ' ')}%`)
    const { data, count, error } = await q.order('pinned', { ascending: false }).order('published_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
    if (error) throw error
    return { items: (data ?? []).map(row), total: count ?? 0 }
  },
  async counts(orgId: string): Promise<{ published: number; draft: number; pending: number }> {
    if (USE_MOCK) { const a = loadMock(); return { published: a.filter((x) => x.status === 'published').length, draft: a.filter((x) => x.status === 'draft').length, pending: loadT().filter((t) => !t.approved).length } }
    const c = (s: string) => supabase!.from('obituaries').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', s)
    const [p, d, t] = await Promise.all([c('published'), c('draft'), supabase!.from('obituary_tributes').select('id, obituaries!inner(org_id)', { count: 'exact', head: true }).eq('approved', false).eq('obituaries.org_id', orgId)])
    return { published: p.count ?? 0, draft: d.count ?? 0, pending: t.count ?? 0 }
  },
  async forCase(caseId: string): Promise<Obituary | null> {
    if (USE_MOCK) return loadMock().find((x) => x.caseId === caseId) ?? null
    const { data, error } = await supabase!.from('obituaries').select('*').eq('case_id', caseId).maybeSingle()
    if (error) throw error
    return data ? row(data) : null
  },
  /** Make the obituary for a case (or open the one that exists), filled in from the case: name, dates, family's draft, service times. */
  async startFromCase(c: FuneralCase, by: string): Promise<Obituary> {
    const have = await this.forCase(c.id)
    if (have) return have
    const fam = await api.getFamilyActivity(c.id).catch(() => ({ obituary: undefined as { body: string } | undefined }))
    const fmt = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '')
    const lines: string[] = []
    if (c.visitationDate) lines.push(`Visitation: ${fmt(c.visitationDate)}${c.visitationLocation ? ` — ${c.visitationLocation}` : ''}`)
    if (c.serviceDate) lines.push(`Service: ${fmt(c.serviceDate)}${c.serviceLocation ? ` — ${c.serviceLocation}` : ''}`)
    const name = [c.decedent.firstName, c.decedent.middleName, c.decedent.lastName].filter(Boolean).join(' ')
    return this.save({ orgId: c.orgId, locationId: c.locationId, caseId: c.id, name, birthDate: c.decedent.dateOfBirth?.slice(0, 10), deathDate: c.decedent.dateOfDeath?.slice(0, 10), body: fam.obituary?.body ?? '', serviceInfo: lines.join('\n'), status: 'draft', pinned: false }, by)
  },
  async save(o: Partial<Obituary> & { orgId: string; name: string }, by?: string): Promise<Obituary> {
    const now = new Date().toISOString()
    const publishing = o.status === 'published'
    if (USE_MOCK) {
      const all = loadMock(); const i = all.findIndex((x) => x.id === o.id)
      const base: Obituary = i >= 0 ? all[i] : { id: crypto.randomUUID(), orgId: o.orgId, slug: slugify(o.name), name: o.name, body: '', serviceInfo: '', status: 'draft', pinned: false, createdAt: now, updatedAt: now }
      const next: Obituary = { ...base, ...o, publishedAt: publishing ? (base.publishedAt ?? now) : base.publishedAt, updatedAt: now } as Obituary
      if (i >= 0) all[i] = next; else all.unshift(next)
      saveMock(all); return next
    }
    const rec: Record<string, unknown> = { org_id: o.orgId, name: o.name, location_id: o.locationId ?? null, case_id: o.caseId ?? null, birth_date: o.birthDate || null, death_date: o.deathDate || null, photo_url: o.photoUrl ?? null, body: o.body ?? '', service_info: o.serviceInfo ?? '', status: o.status ?? 'draft', pinned: !!o.pinned, updated_at: now }
    if (publishing && !o.publishedAt) rec.published_at = now
    if (o.id) {
      const { data, error } = await supabase!.from('obituaries').update(rec).eq('id', o.id).select().single()
      if (error) throw error
      return row(data)
    }
    const { data, error } = await supabase!.from('obituaries').insert({ ...rec, slug: slugify(o.name), created_by: by ?? null }).select().single()
    if (error) throw error
    return row(data)
  },
  async remove(o: Obituary) {
    if (USE_MOCK) { saveMock(loadMock().filter((x) => x.id !== o.id)); return }
    const { error } = await supabase!.from('obituaries').delete().eq('id', o.id)
    if (error) throw error
  },
  async uploadPhoto(orgId: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Please choose a picture (JPG or PNG).')
    if (USE_MOCK) return URL.createObjectURL(file)
    const path = `${orgId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '-')}`
    const { error } = await supabase!.storage.from('obituary-photos').upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)
    return supabase!.storage.from('obituary-photos').getPublicUrl(path).data.publicUrl
  },
  async tributes(obituaryId: string): Promise<Tribute[]> {
    if (USE_MOCK) return loadT().filter((t) => t.obituaryId === obituaryId)
    const { data, error } = await supabase!.from('obituary_tributes').select('*').eq('obituary_id', obituaryId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((t: any) => ({ id: t.id, obituaryId: t.obituary_id, kind: t.kind, name: t.name, message: t.message, approved: t.approved, createdAt: t.created_at }))
  },
  async approve(t: Tribute, approved: boolean) {
    if (USE_MOCK) { saveT(loadT().map((x) => (x.id === t.id ? { ...x, approved } : x))); return }
    const { error } = await supabase!.from('obituary_tributes').update({ approved }).eq('id', t.id)
    if (error) throw error
  },
  async removeTribute(t: Tribute) {
    if (USE_MOCK) { saveT(loadT().filter((x) => x.id !== t.id)); return }
    const { error } = await supabase!.from('obituary_tributes').delete().eq('id', t.id)
    if (error) throw error
  },
  publicLink: (o: { slug: string }) => `${window.location.origin}/obituaries/${o.slug}`,
}

// ---------------- public side (no sign-in) ----------------
async function callPublic<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${supabaseUrl}/functions/v1/public-obituary`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: supabaseAnonKey!, authorization: `Bearer ${supabaseAnonKey}` }, body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.error ?? 'Something went wrong.'), { status: res.status })
  return j as T
}

export const publicObits = {
  async list(p: { org?: string; location?: string; q?: string; page?: number }): Promise<PublicList> {
    if (USE_MOCK) {
      const page = p.page ?? 1
      const all = loadMock().filter((x) => x.status === 'published' && (!p.q || x.name.toLowerCase().includes(p.q.toLowerCase()))).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      return { items: all.slice((page - 1) * PER_PAGE, page * PER_PAGE), total: all.length, page, per: PER_PAGE, locations: [], orgName: 'Casillas Funeral Home' }
    }
    const r = await callPublic<{ items: any[]; total: number; page: number; per: number; locations: { id: string; name: string }[]; orgName: string | null }>({ action: 'list', ...p })
    return { ...r, items: r.items.map(pubRow) }
  },
  async get(slug: string): Promise<PublicDetail> {
    if (USE_MOCK) {
      const o = loadMock().find((x) => x.slug === slug && x.status === 'published')
      if (!o) throw Object.assign(new Error('This obituary was not found.'), { status: 404 })
      return { obituary: { ...o, orgId: o.orgId }, tributes: loadT().filter((t) => t.obituaryId === o.id && t.approved).map(({ id, kind, name, message, createdAt }) => ({ id, kind, name, message, createdAt })), orgName: 'Casillas Funeral Home', location: { name: 'Casillas Funeral Home — Coachella', city: 'Coachella', state: 'CA' } }
    }
    const r = await callPublic<{ obituary: any; tributes: any[]; orgName: string | null; location: PublicDetail['location'] }>({ action: 'get', slug })
    return { obituary: { ...pubRow(r.obituary), body: r.obituary.body ?? '', serviceInfo: r.obituary.service_info ?? '', orgId: r.obituary.org_id }, tributes: r.tributes.map((t) => ({ id: t.id, kind: t.kind, name: t.name, message: t.message, createdAt: t.created_at })), orgName: r.orgName, location: r.location }
  },
  async tribute(slug: string, t: { kind: 'guestbook' | 'candle'; name: string; message: string; hp?: string }): Promise<{ pending: boolean }> {
    if (USE_MOCK) {
      const o = loadMock().find((x) => x.slug === slug); if (!o) throw new Error('This obituary was not found.')
      saveT([{ id: crypto.randomUUID(), obituaryId: o.id, kind: t.kind, name: t.name, message: t.message, approved: t.kind === 'candle', createdAt: new Date().toISOString() }, ...loadT()])
      return { pending: t.kind === 'guestbook' }
    }
    const r = await callPublic<{ pending?: boolean }>({ action: 'tribute', slug, ...t })
    return { pending: !!r.pending }
  },
}
