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
export function boardOrder<T extends { visitation?: { start: string }; visitationDate?: string; serviceDate?: string; service?: { start: string }; lastName: string }>(rows: T[]): T[] {
  const when = (r: T) => r.visitation?.start ?? r.visitationDate ?? r.serviceDate ?? r.service?.start
  return [...rows].sort((a, b) => {
    const x = when(a), y = when(b)
    if (x && y) return x.localeCompare(y) || a.lastName.localeCompare(b.lastName)
    if (x) return -1
    if (y) return 1
    return a.lastName.localeCompare(b.lastName)
  })
}
