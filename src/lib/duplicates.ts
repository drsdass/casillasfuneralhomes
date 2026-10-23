import type { FuneralCase } from '@/types'

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = (first: string, last: string) => [...new Set(fold(`${first} ${last}`).split(' ').filter((t) => t && !SUFFIXES.has(t)))].sort()
const digits = (s?: string) => (s ?? '').replace(/\D/g, '').slice(-10)

export interface DuplicateHit { c: FuneralCase; reasons: string[]; strong: boolean }

/** Names compare in either order ("ARCHULETA RONALD" = "RONALD ARCHULETA") and ignore Jr/Sr, accents and punctuation. */
function sameName(a: string[], b: string[]): 'same' | 'similar' | null {
  if (!a.length || !b.length) return null
  if (a.join(' ') === b.join(' ')) return 'same'
  const [small, big] = a.length <= b.length ? [a, b] : [b, a]
  if (small.length >= 2 && small.every((t) => big.includes(t))) return 'similar'
  return null
}

export interface DuplicateQuery { id?: string; firstName?: string; lastName?: string; phone?: string; address?: string }

export function findDuplicates(all: FuneralCase[], q: DuplicateQuery): DuplicateHit[] {
  const qt = tokens(q.firstName ?? '', q.lastName ?? '')
  const qPhone = digits(q.phone)
  const qAddr = fold(q.address ?? '')
  const out: DuplicateHit[] = []
  for (const c of all) {
    if (q.id && c.id === q.id) continue
    const reasons: string[] = []
    let strong = false
    const n = sameName(qt, tokens(c.decedent.firstName, c.decedent.lastName))
    if (n === 'same') { reasons.push('same name'); strong = true } else if (n === 'similar') reasons.push('similar name')
    if (qPhone.length === 10 && c.contacts.some((x) => digits(x.phone) === qPhone)) reasons.push('same family phone')
    const addr = fold(c.vitalSheet?.residenceAddress ?? '')
    if (qAddr.length > 8 && addr === qAddr) reasons.push('same home address')
    // A phone or address match alone is only worth a look when the name is also related.
    if (!n && reasons.length && !qt.length) { out.push({ c, reasons, strong: false }); continue }
    if (!n) continue
    out.push({ c, reasons, strong })
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong))
}

/** Every pair of cases in the list that look like the same person — for the "Check for duplicates" panel. */
export function findDuplicateGroups(all: FuneralCase[]): { cases: FuneralCase[]; reasons: string[] }[] {
  const seen = new Set<string>()
  const groups: { cases: FuneralCase[]; reasons: string[] }[] = []
  for (const c of all) {
    if (seen.has(c.id)) continue
    const hits = findDuplicates(all, { id: c.id, firstName: c.decedent.firstName, lastName: c.decedent.lastName, phone: c.contacts[0]?.phone, address: c.vitalSheet?.residenceAddress })
      .filter((h) => !seen.has(h.c.id) && h.reasons.some((r) => r.includes('name')))
    if (!hits.length) continue
    const members = [c, ...hits.map((h) => h.c)]
    members.forEach((m) => seen.add(m.id))
    groups.push({ cases: members.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), reasons: [...new Set(hits.flatMap((h) => h.reasons))] })
  }
  return groups
}
