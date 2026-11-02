import { format, parseISO } from 'date-fns'

/** "Mon 11/2" */
export const boardDay = (iso: string) => format(parseISO(iso), 'EEE M/d')

/** "2:00 PM" (normal time, never 14:00) */
export const boardClock = (iso: string) => format(parseISO(iso), 'h:mm a')

/** "2:00–3:00 PM" when both ends are PM (or AM); "11:00 AM–1:00 PM" when they straddle noon. */
export function boardRange(startIso: string, endIso?: string): string {
  if (!endIso || endIso === startIso) return boardClock(startIso)
  const a = parseISO(startIso), b = parseISO(endIso)
  const sameHalf = format(a, 'a') === format(b, 'a')
  return sameHalf ? `${format(a, 'h:mm')}–${format(b, 'h:mm a')}` : `${format(a, 'h:mm a')}–${format(b, 'h:mm a')}`
}

/**
 * The kind of casket, taken from the contract line ("Casket — Monarch Bronze" -> "Monarch Bronze",
 * "Adult Casket — Economy" -> "Economy", "Rental Casket" -> "Rental").
 */
export function casketType(name?: string | null): string | undefined {
  if (!name) return undefined
  const s = name.trim()
  const after = s.split(/\s[—–-]\s/).slice(1).join(' — ').trim()
  // Price-list wording like "Casket or other Receptacle MONTGOMERY SELECT" -> "MONTGOMERY SELECT"
  const t = (after || s)
    .replace(/\b(or|and|,)?\s*(other|alternative|alternate)\s+(container|receptacle)s?\b/gi, ' ')
    .replace(/\bcaskets?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '')
    .trim()
  return t || s
}

// Lines on a contract that mention "casket" but are services or packages, not the casket itself
// (for example "Dressing, Cosmetics, Hair Styling and Casketing of Remains").
const NOT_THE_CASKET = /dressing|cosmet|casketing|embalm|hair|viewing|visitation|shipping|outer burial|vault|urn\b|package|direct cremation|immediate|purchaser|transfer|service|equipment|staff/i

/** Looks through every line of a case's contract and returns the type of casket (or "Cremation container"). */
export function casketTypeFromLines(names: string[] | undefined): string | undefined {
  const ok = (names ?? []).filter((n) => !NOT_THE_CASKET.test(n))
  const casket = ok.find((n) => /casket/i.test(n))
  if (casket) return casketType(casket)
  if (ok.some((n) => /container|receptacle/i.test(n))) return 'Cremation container'
  return undefined
}
