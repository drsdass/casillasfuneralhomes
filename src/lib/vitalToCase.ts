import type { FuneralCase, VitalSheetInfo } from '@/types'

/**
 * The Vital Sheet has boxes for the visitation hours, rosary, mass and graveside. The Calendar and the TV Board read the
 * case's own Visitation / Service fields. This turns what is on the Vital Sheet into those case fields.
 */
export interface ServicePatch {
  visitationDate?: string; visitationEnd?: string; visitationLocation?: string
  serviceDate?: string; serviceLocation?: string
}
export interface ServiceDerivation {
  patch: ServicePatch
  /** Plain-words list of what would be added, for the button on the case. */
  summary: string[]
  /** Visitation hours are on the sheet but there is no visitation date, so the visitation cannot be placed. */
  needsVisitationDate: boolean
}

const hhmm = (t?: string): string | undefined => {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? '').trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined
}
const toIso = (date: string, time: string): string | undefined => {
  const d = new Date(`${date.slice(0, 10)}T${time}:00`)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}
const mins = (h: number, m: number, ap: string) => {
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 0
  return h * 60 + m
}
const hm = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

/** "12:00PM-5:00PM - DHS" -> { start: "12:00", end: "17:00", rest: "DHS" }. Also reads "14:00–16:00" and "10-12". */
export function parseHours(text?: string): { start: string; end: string; rest: string } | undefined {
  if (!text) return undefined
  const re = /(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*(?:m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*(?:m\.?)?/i
  const mt = re.exec(text)
  if (!mt) return undefined
  const h1 = +mt[1], m1 = +(mt[2] ?? 0), h2 = +mt[4], m2 = +(mt[5] ?? 0)
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return undefined
  const x1 = (mt[3] ?? '').toLowerCase(), x2 = (mt[6] ?? '').toLowerCase()
  let a1 = x1 || x2, a2 = x2 || x1
  let s: number, e: number
  if (!a1 && !a2) {
    // No am/pm at all: 13-24 is a 24-hour time; otherwise funeral hours are mornings 8-11 and afternoons 12-7.
    const guess = (h: number) => (h >= 13 || h === 0 ? '' : h >= 8 && h <= 11 ? 'a' : 'p')
    a1 = guess(h1); a2 = guess(h2)
  }
  s = mins(h1, m1, a1); e = mins(h2, m2, a2)
  if (s >= e && !x1 && a1 === 'p') s = mins(h1, m1, 'a') // "10-2PM" starts at 10 in the morning
  if (s >= e) return undefined
  const rest = text.replace(mt[0], ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,;:@\-–—]+|[\s,;:@\-–—]+$/g, '').trim()
  return { start: hm(s), end: hm(e), rest }
}

const same = (a?: string, b?: string) => (a ?? '') === (b ?? '') || (!!a && !!b && new Date(a).getTime() === new Date(b).getTime())
const SERVICE_KEYS: (keyof VitalSheetInfo)[] = ['massDate', 'massTime', 'massPlace', 'gravesideDate', 'gravesideTime', 'gravesidePlace', 'churchName']
const VISIT_KEYS: (keyof VitalSheetInfo)[] = ['visitationDate', 'visitationHours']

/**
 * What the Vital Sheet says the case's Visitation and Service should be.
 * force = true: everything that differs (the "Add them now" button).
 * force = false (saving the sheet): a part is applied only if its boxes were changed in this save, or the case has nothing there yet,
 * so a time someone set on the case is never overwritten by an old Vital Sheet value.
 */
export function deriveServicePatch(c: FuneralCase, vs: VitalSheetInfo, force = false): ServiceDerivation {
  const prev = c.vitalSheet ?? {}
  const touched = (keys: (keyof VitalSheetInfo)[]) => keys.some((k) => (prev[k] ?? '') !== (vs[k] ?? ''))
  const patch: ServicePatch = {}
  const summary: string[] = []

  // Service = the mass / funeral service (or the graveside when that is all there is).
  const sDate = vs.massDate || vs.gravesideDate
  const sTime = hhmm(vs.massDate ? vs.massTime : vs.gravesideTime)
  const sPlace = (vs.massDate ? vs.massPlace : vs.gravesidePlace) || vs.churchName || undefined
  if (sDate && sTime && (force || !c.serviceDate || touched(SERVICE_KEYS))) {
    const iso = toIso(sDate, sTime)
    if (iso && (!same(iso, c.serviceDate) || (sPlace && sPlace !== c.serviceLocation))) {
      patch.serviceDate = iso
      patch.serviceLocation = sPlace ?? c.serviceLocation
      summary.push(`Service ${sDate} ${sTime}${sPlace ? ` · ${sPlace}` : ''}`)
    }
  }

  // Visitation = the hours box plus the visitation date.
  const hours = parseHours(vs.visitationHours)
  const needsVisitationDate = !!hours && !vs.visitationDate && !c.visitationDate
  const vDate = vs.visitationDate || (c.visitationDate ? c.visitationDate.slice(0, 10) : undefined)
  if (hours && vDate && (force || !c.visitationDate || touched(VISIT_KEYS))) {
    const start = toIso(vDate, hours.start), end = toIso(vDate, hours.end)
    const place = hours.rest || c.visitationLocation
    if (start && end && (!same(start, c.visitationDate) || !same(end, c.visitationEnd) || (place && place !== c.visitationLocation))) {
      patch.visitationDate = start
      patch.visitationEnd = end
      patch.visitationLocation = place
      summary.push(`Visitation ${vDate} ${hours.start}–${hours.end}${place ? ` · ${place}` : ''}`)
    }
  }
  return { patch, summary, needsVisitationDate }
}

/** An extra visitation or service that comes from the Vital Sheet (it becomes its own event on the Calendar and TV Board). */
export interface VitalEventItem { label: string; type: 'visitation' | 'service'; start: string; end: string; place?: string }

const addHour = (iso: string) => new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString()

/**
 * The rosary and (when there is also a mass) the graveside, as events of their own. The case's main visitation and service
 * are handled by deriveServicePatch; these are the "also" ones that sit under them on the board.
 */
export function deriveVitalEvents(vs: VitalSheetInfo): VitalEventItem[] {
  const out: VitalEventItem[] = []
  const rt = hhmm(vs.rosaryTime)
  if (vs.rosaryDate && rt) {
    const start = toIso(vs.rosaryDate, rt)
    if (start) out.push({ label: 'Rosary', type: 'visitation', start, end: addHour(start), place: vs.rosaryPlace || undefined })
  }
  const gt = hhmm(vs.gravesideTime)
  if (vs.massDate && vs.gravesideDate && gt) {
    const start = toIso(vs.gravesideDate, gt)
    if (start) out.push({ label: 'Graveside', type: 'service', start, end: addHour(start), place: vs.gravesidePlace || undefined })
  }
  return out
}
export const VITAL_EVENT_KEYS: (keyof VitalSheetInfo)[] = ['rosaryDate', 'rosaryTime', 'rosaryPlace', 'massDate', 'gravesideDate', 'gravesideTime', 'gravesidePlace']
