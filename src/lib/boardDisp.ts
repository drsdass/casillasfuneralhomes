/** The disposition codes shown in the DISP column of the TV Board. */
export const BOARD_DISP_OPTIONS = ['CVC', 'DMP', 'RNC', 'SHIP-OUT', 'CR/RES', 'CR/BUR', 'CR/SHIP-OUT', 'SHIP-IN', 'MEMORIAL'] as const
export type BoardDisp = (typeof BOARD_DISP_OPTIONS)[number]

export type BoardExtra = 'no' | 'yes' | 'confirmed'
export const BOARD_EXTRA_OPTIONS: { v: BoardExtra; label: string }[] = [{ v: 'no', label: 'No' }, { v: 'yes', label: 'Yes' }, { v: 'confirmed', label: 'Yes — confirmed' }]

/** What the board shows for flowers / birds / escort: what staff chose, else worked out from the case's orders and invoice lines. */
export function extraState(chosen: string | undefined, orderStatus: string | null | undefined, lineNames: string[] | undefined, re: RegExp): BoardExtra {
  if (chosen === 'no' || chosen === 'yes' || chosen === 'confirmed') return chosen
  if (orderStatus === 'confirmed' || orderStatus === 'delivered') return 'confirmed'
  if (orderStatus === 'ordered' || orderStatus === 'pending') return 'yes'
  return (lineNames ?? []).some((n) => re.test(n)) ? 'yes' : 'no'
}
export const FLOWERS_RE = /flower|spray|wreath|casket (cover|blanket)/i
export const BIRDS_RE = /dove|bird/i
export const ESCORT_RE = /escort|carriage|motorcycle|procession/i

/** Soonest visitation first (then service); cases with no date yet go last. */
export function boardOrder<T extends { visits: { start: string }[]; services: { start: string }[]; visitationDate?: string; serviceDate?: string; lastName: string }>(rows: T[]): T[] {
  const first = (xs: { start: string }[]) => xs.map((e) => e.start).sort()[0]
  const when = (r: T) => first(r.visits) ?? r.visitationDate ?? first(r.services) ?? r.serviceDate
  return [...rows].sort((a, b) => {
    const x = when(a), y = when(b)
    if (x && y) return x.localeCompare(y) || a.lastName.localeCompare(b.lastName)
    if (x) return -1
    if (y) return 1
    return a.lastName.localeCompare(b.lastName)
  })
}

type Ev = { start: string; end: string; staff: string[]; label?: string; place?: string }
interface EvRow { visits: Ev[]; services: Ev[]; visitationDate?: string; visitationEnd?: string; visitationLocation?: string; serviceDate?: string; serviceLocation?: string }

/** The visitations and services to show: the calendar events when there are any, otherwise the date saved on the case itself. */
export function boardEventsOf(r: EvRow): { visits: Ev[]; services: Ev[] } {
  return {
    visits: r.visits.length > 0 ? r.visits : r.visitationDate ? [{ start: r.visitationDate, end: r.visitationEnd ?? r.visitationDate, staff: [], place: r.visitationLocation }] : [],
    services: r.services.length > 0 ? r.services : r.serviceDate ? [{ start: r.serviceDate, end: r.serviceDate, staff: [], place: r.serviceLocation }] : [],
  }
}

/**
 * Splits the board in two: cases that still have a visitation or service ahead of them (or nothing scheduled yet),
 * and cases whose services are all over but which are still open — waiting on cremation, shipping, burial, ashes ...
 * The second group is shown at the bottom, longest-waiting first.
 */
export function boardSplit<T extends EvRow & { lastName: string }>(rows: T[], now: Date): { current: T[]; waiting: T[]; doneAt: Map<T, string> } {
  const current: T[] = [], waiting: T[] = []
  const doneAt = new Map<T, string>()
  for (const r of rows) {
    const { visits, services } = boardEventsOf(r)
    const all = [...visits, ...services]
    const lastEnd = all.map((e) => (new Date(e.end) > new Date(e.start) ? e.end : e.start)).sort().pop()
    // "done" = at least one service (or burial) happened and nothing is still ahead
    if (services.length > 0 && lastEnd && new Date(lastEnd) <= now) { waiting.push(r); doneAt.set(r, lastEnd) } else current.push(r)
  }
  waiting.sort((a, b) => (doneAt.get(a) as string).localeCompare(doneAt.get(b) as string))
  return { current: boardOrder(current), waiting, doneAt }
}
