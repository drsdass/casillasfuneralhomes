import type { FuneralCase } from '@/types'

/** The places Casillas picks up from most often. Choosing one on the First Call fills the address, and it carries over to the Vital Sheet and EDRS. */
export interface KnownPlace { label: string; name: string; street: string; city: string; zip: string; county: string }

export const KNOWN_PLACES = {
  jfk: { label: 'JFK', name: 'JOHN F KENNEDY MEMORIAL HOSPITAL', street: '47111 Monroe St', city: 'Indio', zip: '92201', county: 'Riverside' },
  drmc: { label: 'DRMC', name: 'DESERT REGIONAL MEDICAL CENTER', street: '1150 N Indian Canyon Dr', city: 'Palm Springs', zip: '92262', county: 'Riverside' },
  emc: { label: 'EMC', name: 'EISENHOWER MEDICAL CENTER', street: '39000 Bob Hope Dr', city: 'Rancho Mirage', zip: '92270', county: 'Riverside' },
  // Riverside County Coroner's Office — Indio facility. A coroner pickup says where the body came FROM; where death happened is still entered separately.
  rcco: { label: 'RCCO', name: "RIVERSIDE COUNTY CORONER'S OFFICE", street: '47-225 Oasis St', city: 'Indio', zip: '92201', county: 'Riverside' },
} as const satisfies Record<string, KnownPlace>

export type KnownPlaceKey = keyof typeof KNOWN_PLACES
export const isKnownPlace = (t: string | undefined): t is KnownPlaceKey => !!t && t in KNOWN_PLACES
export const knownAddress = (t: KnownPlaceKey): string => {
  const k = KNOWN_PLACES[t]
  return `${k.street}, ${k.city}, CA ${k.zip}`
}
/** True when the text in the address box is one of the built-in addresses (so picking another place may replace it without losing anything typed). */
export const isBuiltInAddress = (s: string): boolean => !s.trim() || (Object.keys(KNOWN_PLACES) as KnownPlaceKey[]).some((k) => knownAddress(k) === s.trim())

/** "123 Main St, City, CA 92234" → street / city / zip; falls back to the whole text as the street. */
function parseAddress(raw: string): { street: string; city: string; zip: string } {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  const last = parts[parts.length - 1]?.match(/^[A-Za-z .]{2,}\s+(\d{5})(?:-\d{4})?$/)
  if (parts.length >= 3 && last) return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], zip: last[1] }
  return { street: raw.trim(), city: '', zip: '' }
}

/**
 * The First Call sheet already says where the body was picked up. Fill the place-of-death items from it —
 * only where the Vital Sheet is still empty, so anything typed there always wins.
 */
export function withFirstCallDefaults(c: FuneralCase): FuneralCase {
  const fc = c.firstCall
  const t = fc?.locationType
  if (!fc || !t) return c
  const vs = { ...(c.vitalSheet ?? {}) }
  let place = c.decedent.placeOfDeath

  if (isKnownPlace(t)) {
    const k = KNOWN_PLACES[t]
    if (t !== 'rcco') {
      place ||= k.name
      vs.facilityAddressOrAddressFound ||= k.street
      vs.deathCity ||= k.city
      vs.deathZip ||= k.zip
      vs.deathCounty ||= k.county
    }
  } else if (fc.locationAddress) {
    const a = parseAddress(fc.locationAddress)
    vs.facilityAddressOrAddressFound ||= a.street
    vs.deathCity ||= a.city
    vs.deathZip ||= a.zip
    if (t === 'residence') vs.placeOfDeathType ||= 'home'
  } else if (t === 'residence') {
    vs.placeOfDeathType ||= 'home'
  }
  return { ...c, decedent: { ...c.decedent, placeOfDeath: place }, vitalSheet: vs }
}
