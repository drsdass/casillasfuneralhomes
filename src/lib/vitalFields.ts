import type { FuneralCase, VitalSheetInfo } from '@/types'

/**
 * The Vital Sheet's fields, in the order they appear on the paper form,
 * each carrying the item number printed on that form. The staff form, the
 * Overview, the printout and the EDRS entry screen all read from this one
 * list so a number can never drift between screens.
 *
 * Numbers follow the state's own item numbering (California Birth and
 * Death Registration Handbook): 28-30 spouse, 31-33 father + 34 his birth
 * state, 35-37 mother + 38 her birth state. The paper master used to print
 * the mother's middle name as "34" and her last name as "36" — corrected
 * here to 36 and 37 so a number means the same thing on paper, on screen
 * and in EDRS.
 */

export type VitalSection = 'decedent' | 'background' | 'residence' | 'family' | 'office'

export const VITAL_SECTION_LABELS: Record<VitalSection, string> = {
  decedent: 'Decedent',
  background: 'Background',
  residence: 'Residence',
  family: 'Informant & Family',
  office: 'Office Use Only',
}

/** Values that don't live on the case row itself and have to be fetched separately. */
export interface VitalContext {
  ssn?: string | null
}

export interface VitalField {
  id: string
  /** Exactly as printed on the form; '' where the form prints no number. */
  number: string
  /** As printed. */
  label: string
  /** Clarifies a row that shares a printed number or reads ambiguously on its own (e.g. "mother"). */
  hint?: string
  section: VitalSection
  /** True for the items that get keyed into EDRS. */
  edrs: boolean
  /** Never shown in full on general screens (Overview). */
  sensitive?: boolean
  get: (c: FuneralCase, ctx?: VitalContext) => string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

export function computeAge(c: FuneralCase): string {
  const { dateOfBirth, dateOfDeath } = c.decedent
  if (!dateOfBirth || !dateOfDeath) return ''
  const dob = new Date(dateOfBirth)
  const dod = new Date(dateOfDeath)
  let years = dod.getFullYear() - dob.getFullYear()
  const m = dod.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && dod.getDate() < dob.getDate())) years--
  return years >= 0 ? String(years) : ''
}

const yesNo = (v: boolean | undefined) => (v ? 'Yes' : 'No')
const triState = (v: boolean | undefined) => (v === undefined ? '' : v ? 'Yes' : 'No')
const cap = (s: string | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export function maskSsn(ssn: string): string {
  const digits = ssn.replace(/\D/g, '')
  return digits.length >= 4 ? `•••-••-${digits.slice(-4)}` : '••••••'
}

export type PersonKey = 'spouse' | 'father' | 'mother'

const NAME_KEYS = {
  spouse: { first: 'spouseFirstName', middle: 'spouseMiddleName', last: 'spouseLastName', legacy: 'spouseName' },
  father: { first: 'fatherFirstName', middle: 'fatherMiddleName', last: 'fatherLastName', legacy: 'fatherName' },
  mother: { first: 'motherFirstName', middle: 'motherMiddleName', last: 'motherLastName', legacy: 'motherName' },
} as const

/** Best-effort split of an old single-box name into first / middle / last. */
export function splitName(full: string | undefined): { first: string; middle: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', middle: '', last: '' }
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' }
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] }
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] }
}

/**
 * Spouse / father / mother as first-middle-last. Uses the separate fields
 * when any are filled in; otherwise falls back to splitting the old
 * single-box name so cases entered before the split still show something.
 */
export function resolveName(vs: VitalSheetInfo | undefined, who: PersonKey): { first: string; middle: string; last: string } {
  const keys = NAME_KEYS[who]
  const v = vs ?? {}
  const first = v[keys.first] ?? ''
  const middle = v[keys.middle] ?? ''
  const last = v[keys.last] ?? ''
  if (first || middle || last) return { first, middle, last }
  return splitName(v[keys.legacy])
}

/** The Vital Sheet with spouse/father/mother always in the separate first-middle-last fields (older single-box names split out). */
export function withSplitNames(vs: VitalSheetInfo | undefined): VitalSheetInfo {
  const out: VitalSheetInfo = { ...(vs ?? {}) }
  const sp = resolveName(vs, 'spouse')
  const fa = resolveName(vs, 'father')
  const mo = resolveName(vs, 'mother')
  out.spouseFirstName = sp.first || undefined; out.spouseMiddleName = sp.middle || undefined; out.spouseLastName = sp.last || undefined
  out.fatherFirstName = fa.first || undefined; out.fatherMiddleName = fa.middle || undefined; out.fatherLastName = fa.last || undefined
  out.motherFirstName = mo.first || undefined; out.motherMiddleName = mo.middle || undefined; out.motherLastName = mo.last || undefined
  return out
}

// ---------------------------------------------------------------------------
// The fields, in paper-form order
// ---------------------------------------------------------------------------

export const VITAL_FIELDS: VitalField[] = [
  // --- Decedent ----------------------------------------------------------
  { id: 'firstName', number: '1', label: 'DECEDENT FIRST NAME', section: 'decedent', edrs: true, get: (c) => c.decedent.firstName },
  { id: 'middleName', number: '2', label: 'MIDDLE', section: 'decedent', edrs: true, get: (c) => c.decedent.middleName ?? '' },
  { id: 'lastName', number: '3', label: 'LAST NAME', section: 'decedent', edrs: true, get: (c) => c.decedent.lastName },
  { id: 'aka', number: '', label: 'ALSO KNOWN AS', section: 'decedent', edrs: true, get: (c) => c.vitalSheet?.alsoKnownAs ?? '' },
  { id: 'dob', number: '4', label: 'DATE OF BIRTH', section: 'decedent', edrs: true, get: (c) => formatDate(c.decedent.dateOfBirth) },
  { id: 'age', number: '5', label: 'AGE', section: 'decedent', edrs: true, get: (c) => computeAge(c) },
  { id: 'ageHours', number: '', label: 'IF UNDER 24 HRS', hint: 'hours', section: 'decedent', edrs: true, get: (c) => c.vitalSheet?.ageUnderHours ?? '' },
  { id: 'ageDays', number: '', label: 'IF UNDER 24 HRS', hint: 'days', section: 'decedent', edrs: true, get: (c) => c.vitalSheet?.ageUnderDays ?? '' },
  { id: 'sex', number: '6', label: 'SEX', section: 'decedent', edrs: true, get: (c) => cap(c.decedent.sex) },
  { id: 'birthCity', number: '9', label: 'BIRTH CITY/ STATE/ COUNTRY', hint: 'city', section: 'decedent', edrs: true, get: (c) => c.vitalSheet?.birthCity ?? '' },
  { id: 'birthState', number: '9', label: 'BIRTH CITY/ STATE/ COUNTRY', hint: 'state', section: 'decedent', edrs: true, get: (c) => c.vitalSheet?.birthState ?? '' },
  { id: 'birthCountry', number: '9', label: 'BIRTH CITY/ STATE/ COUNTRY', hint: 'country', section: 'decedent', edrs: true, get: (c) => c.vitalSheet?.birthCountry ?? '' },
  { id: 'ssn', number: '10', label: 'SOCIAL SECURITY NUMBER', section: 'decedent', edrs: true, sensitive: true, get: (_c, ctx) => ctx?.ssn ?? '' },
  { id: 'armedForces', number: '11', label: 'EVER IN ARMED FORCES?', section: 'decedent', edrs: true, get: (c) => yesNo(c.decedent.veteran) },
  { id: 'maritalStatus', number: '12', label: 'MARITAL STATUS', section: 'decedent', edrs: true, get: (c) => c.decedent.maritalStatus ?? '' },
  { id: 'dod', number: '7', label: 'DATE OF DEATH', section: 'decedent', edrs: true, get: (c) => formatDate(c.decedent.dateOfDeath) },
  { id: 'timeOfDeath', number: '8', label: 'TIME', section: 'decedent', edrs: true, get: (c) => c.firstCall?.timeOfDeath ?? '' },

  // --- Background --------------------------------------------------------
  { id: 'education', number: '13', label: 'EDUCATION', section: 'background', edrs: true, get: (c) => c.vitalSheet?.education ?? '' },
  { id: 'hispanic', number: '14', label: 'WAS DECEDENT HISPANIC/ LATINO /SPANISH?', section: 'background', edrs: true, get: (c) => yesNo(c.vitalSheet?.hispanicLatino) },
  { id: 'hispanicSpecify', number: '14', label: 'WAS DECEDENT HISPANIC/ LATINO /SPANISH?', hint: 'if yes, specify', section: 'background', edrs: true, get: (c) => c.vitalSheet?.hispanicSpecify ?? '' },
  { id: 'race', number: '16', label: 'RACE', section: 'background', edrs: true, get: (c) => c.vitalSheet?.race ?? '' },
  { id: 'occupation', number: '17', label: 'OCCUPATION', section: 'background', edrs: true, get: (c) => c.vitalSheet?.occupation ?? '' },
  { id: 'kindOfBusiness', number: '18', label: 'KIND OF BUSINESS', section: 'background', edrs: true, get: (c) => c.vitalSheet?.kindOfBusiness ?? '' },
  { id: 'yearsInOccupation', number: '19', label: 'YRS IN OCCUPATION', section: 'background', edrs: true, get: (c) => c.vitalSheet?.yearsInOccupation ?? '' },

  // --- Residence ---------------------------------------------------------
  { id: 'residence', number: '20', label: "DECEDENT'S RESIDENCE", section: 'residence', edrs: true, get: (c) => c.vitalSheet?.residenceAddress ?? '' },
  { id: 'residenceCity', number: '21', label: 'CITY', section: 'residence', edrs: true, get: (c) => c.vitalSheet?.residenceCity ?? '' },
  { id: 'residenceCounty', number: '22', label: 'COUNTY', section: 'residence', edrs: true, get: (c) => c.vitalSheet?.residenceCounty ?? '' },
  { id: 'residenceZip', number: '23', label: 'ZIP CODE', section: 'residence', edrs: true, get: (c) => c.vitalSheet?.residenceZip ?? '' },
  { id: 'yearsInCounty', number: '24', label: 'YRS IN COUNTY', section: 'residence', edrs: true, get: (c) => c.vitalSheet?.yearsInCounty ?? '' },
  { id: 'residenceState', number: '25', label: 'STATE', section: 'residence', edrs: true, get: (c) => c.vitalSheet?.residenceState ?? '' },

  // --- Informant & family ------------------------------------------------
  { id: 'informantName', number: '26', label: 'NAME OF INFORMANT AND RELATIONSHIP', hint: 'name', section: 'family', edrs: true, get: (c) => c.vitalSheet?.informantName ?? '' },
  { id: 'informantRelationship', number: '26', label: 'NAME OF INFORMANT AND RELATIONSHIP', hint: 'relationship', section: 'family', edrs: true, get: (c) => c.vitalSheet?.informantRelationship ?? '' },
  { id: 'informantAddress', number: '27', label: 'MAILING ADDRESS', section: 'family', edrs: true, get: (c) => c.vitalSheet?.informantMailingAddress ?? '' },
  { id: 'spouseFirst', number: '28', label: 'NAME OF SPOUSE', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'spouse').first },
  { id: 'spouseMiddle', number: '29', label: 'MIDDLE', hint: 'spouse', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'spouse').middle },
  { id: 'spouseLast', number: '30', label: 'LAST - MAIDEN', hint: 'spouse', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'spouse').last },
  { id: 'fatherFirst', number: '31', label: 'NAME OF FATHER', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'father').first },
  { id: 'fatherMiddle', number: '32', label: 'MIDDLE', hint: 'father', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'father').middle },
  { id: 'fatherLast', number: '33', label: 'LAST', hint: 'father', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'father').last },
  { id: 'fatherBirthState', number: '34', label: 'BIRTH STATE', hint: 'father', section: 'family', edrs: true, get: (c) => c.vitalSheet?.fatherBirthState ?? '' },
  { id: 'motherFirst', number: '35', label: 'NAME OF MOTHER', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'mother').first },
  { id: 'motherMiddle', number: '36', label: 'MIDDLE', hint: 'mother', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'mother').middle },
  { id: 'motherLast', number: '37', label: 'LAST - MAIDEN', hint: 'mother', section: 'family', edrs: true, get: (c) => resolveName(c.vitalSheet, 'mother').last },
  { id: 'motherBirthState', number: '38', label: 'BIRTH STATE', hint: 'mother', section: 'family', edrs: true, get: (c) => c.vitalSheet?.motherBirthState ?? '' },

  // --- Office use only ---------------------------------------------------
  { id: 'dispositionDate', number: '39', label: 'DISPOSITION DATE', section: 'office', edrs: true, get: (c) => formatDate(c.vitalSheet?.dispositionDate) },
  { id: 'finalDisposition', number: '40', label: 'PLACE OF FINAL DISPOSITION', section: 'office', edrs: true, get: (c) => c.vitalSheet?.placeOfFinalDisposition ?? '' },
  { id: 'cvcDmpOther', number: '', label: 'CVC / DMP / OTHER', section: 'office', edrs: false, get: (c) => c.vitalSheet?.dispositionTypeOther ?? '' },
  { id: 'typeOfDisposition', number: '41', label: 'TYPE OF DISPOSITION', section: 'office', edrs: true, get: (c) => c.vitalSheet?.typeOfDisposition ?? '' },
  { id: 'accVc', number: '', label: 'ACC / VC', section: 'office', edrs: false, get: (c) => triState(c.vitalSheet?.accidentOrViolentCause) },
  { id: 'placeOfDeath', number: '101', label: 'PLACE OF DEATH', section: 'office', edrs: true, get: (c) => c.decedent.placeOfDeath ?? '' },
  { id: 'deathCounty', number: '104', label: 'COUNTY', section: 'office', edrs: true, get: (c) => c.vitalSheet?.deathCounty ?? '' },
  { id: 'facilityAddress', number: '105', label: 'FACILITY ADDRESS OR ADDRESS FOUND', section: 'office', edrs: true, get: (c) => c.vitalSheet?.facilityAddressOrAddressFound ?? '' },
  { id: 'deathCity', number: '106', label: 'CITY', section: 'office', edrs: true, get: (c) => c.vitalSheet?.deathCity ?? '' },
  { id: 'weight', number: '', label: 'WEIGHT', section: 'office', edrs: false, get: (c) => c.firstCall?.weight ?? '' },
  { id: 'pacemaker', number: '', label: 'PACEMAKER', section: 'office', edrs: false, get: (c) => yesNo(c.vitalSheet?.pacemaker) },
  { id: 'language', number: '', label: 'LENGUAGE', section: 'office', edrs: false, get: (c) => (c.vitalSheet?.documentLanguage === 'spanish' ? 'SPN' : c.vitalSheet?.documentLanguage === 'english' ? 'ENG' : '') },
  { id: 'coronerCase', number: '', label: "CORONER'S CASE #", section: 'office', edrs: false, get: (c) => c.firstCall?.coronerCaseNumber ?? '' },
  { id: 'obituary', number: '', label: 'OBITUARY', section: 'office', edrs: false, get: (c) => yesNo(c.vitalSheet?.obituary) },
]

export const VITAL_SECTION_ORDER: VitalSection[] = ['decedent', 'background', 'residence', 'family', 'office']

/** "34" or "" → the badge text shown before a label. */
export function numberBadge(f: Pick<VitalField, 'number'>): string {
  return f.number ? `${f.number}.` : ''
}
