import type { FuneralCase } from '@/types'
import { withFirstCallDefaults } from './firstCallPlace'
import { VITAL_FIELDS, resolveName, splitName, computeAge, type VitalContext, type VitalSection } from './vitalFields'

/**
 * Turns a case into what California's EDRS actually wants typed or selected.
 *
 * The rules come from the state's Birth and Death Registration Handbook
 * (death section, rev. July 2021): time as HHMM with no colon, SSN without
 * dashes, English letters only in names, fixed dropdown vocabularies for
 * marital status / education / race / disposition type, spouse fields locked
 * for anyone not currently married, addresses split into subfields, and so
 * on. The handbook is a few years old — confirm against the live system.
 *
 * Nothing here talks to EDRS. It exists so that whatever a person copies
 * (today) or an autofill tool types (later) is already correct, and so
 * problems surface here instead of as a rejected certificate.
 */

export type NoteLevel = 'error' | 'warn' | 'info'
export interface EdrsNote { level: NoteLevel; text: string }

export interface EdrsRow {
  key: string
  number: string
  label: string
  hint?: string
  section: VitalSection
  value: string
  notes: EdrsNote[]
  sensitive?: boolean
  /** Optional sub-items (e.g. "if under 24 hrs") are left out of the list entirely when empty. */
  hideWhenEmpty?: boolean
}

export interface EdrsContext extends VitalContext {
  location?: { name: string; licenseNumber?: string }
}

// ---------------------------------------------------------------------------
// EDRS vocabularies (the dropdown choices)
// ---------------------------------------------------------------------------

export const EDRS_MARITAL = ['Never married', 'Married', 'Widowed', 'Divorced', 'Married/WID', 'SRDP', 'SRDP SURV', 'SRDP/SURV', 'Unknown'] as const

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th']
export const EDRS_EDUCATION = [
  '0 (zero)', ...ORDINALS.slice(1).map((o) => `${o} Grade`), '12th Grade with no diploma', 'High School diploma', 'GED',
  'Some College but no degree', "Associate's degree", "Bachelor's degree", "Master's degree", 'Doctorate degree', 'Professional degree', 'Unknown',
] as const

export const EDRS_RACES = [
  'White', 'Caucasian', 'Black', 'African American', 'Mexican', 'Mexican American', 'Other Hispanic', 'Alaskan Native', 'Eskimo', 'Aleut',
  'Native American', 'American Indian', 'Chinese', 'Japanese', 'Filipino', 'Korean', 'Vietnamese', 'Asian Indian', 'Cambodian', 'Thai', 'Laotian',
  'Hmong', 'Other Asian', 'Native Hawaiian', 'Guamanian', 'Samoan', 'Other Pacific Islander', 'Other', 'Unknown',
] as const

export const EDRS_RELATIONSHIPS = [
  'Husband', 'SRDP', 'Spouse', 'Wife', 'Father', 'Mother', 'Brother', 'Daughter', 'Friend', 'Granddaughter', 'Grandson', 'Neighbor', 'Sister', 'Son', 'Other',
] as const

export const EDRS_DISPOSITIONS = [
  'Alkaline Hydrolysis', 'Burial', 'Burial at Sea', 'Cremated in California/Transit/Scatter', 'Cremation', 'Cremation/Burial',
  'Cremation/Religious Shrine', 'Cremation/Residence', 'Cremation/Scattering Ashes Over Land', 'Cremation/Scattering at Sea',
  'Cremation/Transit/Burial', 'Cremation/Transit/Religious Shrine', 'Cremation/Transit/Residence', "Pending Coroner's Investigation",
  'Religious Shrine', 'Scientific Use', 'Temporary Envaultment', 'Transit', 'Transit/Burial', 'Transit/Cremated outside of California/Scattered at Sea',
  'Transit/Cremation/Burial', 'Transit/Cremation/Religious Shrine', 'Transit/Cremation/Residence', 'Transit/Religious Shrine', 'Transit/Scientific',
] as const

export const EDRS_SEX = ['Male', 'Female', 'Unknown/Undetermined', 'Nonbinary'] as const

export const PLACE_OF_DEATH_TYPES: Record<NonNullable<NonNullable<FuneralCase['vitalSheet']>['placeOfDeathType']>, string> = {
  doa: 'DOA — dead on arrival (hospital)',
  er_op: 'ER/OP — emergency room or outpatient (hospital)',
  ip: 'IP — inpatient (hospital)',
  home: "DECEDENT'S HOME",
  hospice: 'HOSPICE FACILITY',
  nursing: 'NURSING HOME/LTC',
  other: 'OTHER',
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
  NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}
const US_TERRITORIES: Record<string, string> = { PR: 'Puerto Rico', GU: 'Guam', VI: 'Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' }

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const note = (level: NoteLevel, text: string): EdrsNote => ({ level, text })
const norm = (s: string) => s.toLowerCase().replace(/['’`.]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim()

function matchOption(raw: string | undefined, options: readonly string[], aliases: Record<string, string> = {}): { value?: string; viaAlias?: boolean } {
  const n = norm(raw ?? '')
  if (!n) return {}
  const exact = options.find((o) => norm(o) === n)
  if (exact) return { value: exact }
  const a = aliases[n]
  return a ? { value: a, viaAlias: true } : {}
}

const MARITAL_ALIASES: Record<string, string> = {
  single: 'Never married', unmarried: 'Never married', widow: 'Widowed', widower: 'Widowed', divorce: 'Divorced',
  separated: 'Married', 'domestic partner': 'SRDP', partner: 'SRDP',
}
export const normalizeMarital = (raw?: string) => matchOption(raw, EDRS_MARITAL, MARITAL_ALIASES)

const EDUCATION_ALIASES: Record<string, string> = {
  'high school': 'High School diploma', 'high school graduate': 'High School diploma', highschool: 'High School diploma', hs: 'High School diploma',
  college: 'Some College but no degree', 'some college': 'Some College but no degree',
  associate: "Associate's degree", associates: "Associate's degree", 'associate degree': "Associate's degree",
  bachelor: "Bachelor's degree", bachelors: "Bachelor's degree", 'bachelor degree': "Bachelor's degree",
  master: "Master's degree", masters: "Master's degree", 'master degree': "Master's degree",
  doctorate: 'Doctorate degree', phd: 'Doctorate degree', professional: 'Professional degree',
  none: '0 (zero)', 'no schooling': '0 (zero)',
}
export function normalizeEducation(raw?: string): { value?: string; viaAlias?: boolean } {
  const m = matchOption(raw, EDRS_EDUCATION, EDUCATION_ALIASES)
  if (m.value) return m
  const g = norm(raw ?? '').match(/^(\d{1,2})(?:st|nd|rd|th)?(?: grade)?$/)
  if (g) {
    const n = Number(g[1])
    if (n === 0) return { value: '0 (zero)', viaAlias: true }
    if (n >= 1 && n <= 11) return { value: `${ORDINALS[n]} Grade`, viaAlias: true }
  }
  return {}
}

const RACE_ALIASES: Record<string, string> = {
  hispanic: 'Other Hispanic', latino: 'Other Hispanic', latina: 'Other Hispanic', asian: 'Other Asian', 'pacific islander': 'Other Pacific Islander',
}
export const normalizeRace = (raw?: string) => matchOption(raw, EDRS_RACES, RACE_ALIASES)

const RELATIONSHIP_ALIASES: Record<string, string> = { dad: 'Father', mom: 'Mother', 'domestic partner': 'SRDP' }
export const normalizeRelationship = (raw?: string) => matchOption(raw, EDRS_RELATIONSHIPS, RELATIONSHIP_ALIASES)

const DISPOSITION_ALIASES: Record<string, string> = {
  entombment: 'Burial', interment: 'Burial', cremated: 'Cremation', cremate: 'Cremation', donation: 'Scientific Use', donated: 'Scientific Use',
}
export const normalizeDisposition = (raw?: string) => matchOption(raw, EDRS_DISPOSITIONS, DISPOSITION_ALIASES)

/** English letters, hyphen, period, apostrophe only — accents are stripped (Muñoz → Munoz). */
export function edrsName(raw: string | undefined): { value: string; note?: EdrsNote } {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return { value: '' }
  const folded = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const cleaned = folded.replace(/[^A-Za-z\-.' ]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned === s) return { value: s }
  const lostOther = cleaned !== folded.replace(/\s+/g, ' ').trim()
  return {
    value: cleaned,
    note: note(lostOther ? 'warn' : 'info', lostOther
      ? `Removed characters EDRS doesn't allow (typed "${s}")`
      : `Entered without accents — typed "${s}"; EDRS allows English letters only`),
  }
}

export function edrsTime(raw: string | undefined): { value: string; note?: EdrsNote } {
  const s = (raw ?? '').trim()
  if (!s) return { value: '' }
  const m = s.match(/^(\d{1,2}):?(\d{2})$/)
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return { value: `${m[1].padStart(2, '0')}${m[2]}` }
  if (/^(unk|est|fnd)$/i.test(s)) return { value: s.toUpperCase() }
  return { value: s, note: note('warn', 'EDRS wants 24-hour time as four digits, like 1405') }
}

export function edrsSsn(raw: string | undefined): { value: string; note?: EdrsNote } {
  const s = (raw ?? '').trim()
  if (!s) return { value: '' }
  if (/^(unk|none)$/i.test(s)) return { value: s.toUpperCase() }
  const digits = s.replace(/\D/g, '')
  if (digits.length === 9) return { value: digits }
  return { value: digits, note: note('error', 'Needs exactly 9 digits — enter UNK if unknown, or NONE if they never had one') }
}

export function edrsLicense(raw: string | undefined, prefix: 'FD' | 'EMB'): { value: string; note?: EdrsNote } {
  const s = (raw ?? '').trim()
  if (!s) return { value: '' }
  const compact = s.replace(/[\s-]+/g, '').toUpperCase()
  if (new RegExp(`^${prefix}\\d+$`).test(compact)) return { value: compact, note: compact !== s ? note('info', `Typed "${s}" — EDRS wants no spaces or hyphens`) : undefined }
  if (/^\d+$/.test(compact)) return { value: `${prefix}${compact}`, note: note('info', `EDRS wants the ${prefix} prefix`) }
  return { value: compact, note: note('warn', `Should be ${prefix} followed by a number`) }
}

/** EDRS's Suffix list. */
export const EDRS_SUFFIXES = ['JR', 'SR', 'II', 'III', 'IV', 'V'] as const

/** "Jr." / "jr" / "2nd" → "JR" / "II"; '' if it isn't a suffix. */
export function normalizeSuffix(raw: string | undefined): string {
  const t = (raw ?? '').trim().replace(/\./g, '').toUpperCase()
  const map: Record<string, string> = { JR: 'JR', SR: 'SR', II: 'II', '2ND': 'II', III: 'III', '3RD': 'III', IV: 'IV', '4TH': 'IV', V: 'V' }
  return map[t] ?? ''
}

/**
 * Pulls a suffix out of a name. Uses the Suffix box when it is filled in; otherwise looks for one typed on the end of the name
 * ("CRUZ JR." → CRUZ + JR) so older cases come out right — flagged as a guess so someone confirms it. A lone "V" is never guessed (could be an initial).
 */
export function splitSuffix(raw: string | undefined, explicit?: string): { rest: string; suffix: string; inferred: boolean } {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ')
  const m = text.match(/(?:^|[\s,])(jr|sr|ii|iii|iv|2nd|3rd|4th)\.?$/i)
  const stripped = m && m.index !== undefined ? text.slice(0, m.index).trim().replace(/,$/, '') : text
  const ex = normalizeSuffix(explicit)
  if (ex) return { rest: m && stripped && normalizeSuffix(m[1]) === ex ? stripped : text, suffix: ex, inferred: false }
  if (m && stripped) return { rest: stripped, suffix: normalizeSuffix(m[1]), inferred: true }
  return { rest: text, suffix: '', inferred: false }
}

/** "123B Main St Apt 4" → { number: '123B', name: 'Main St', unit: '4' }. A best guess — always shown with a "check" note. */
export function splitStreet(raw: string | undefined): { number: string; name: string; unit: string } {
  let s = (raw ?? '').trim().replace(/\s+/g, ' ')
  let unit = ''
  const u = s.match(/[,\s]+(?:apt\.?|apartment|unit|ste\.?|suite|#)\s*#?\s*([A-Za-z0-9-]+)\s*$/i)
  if (u) { unit = u[1]; s = s.slice(0, u.index).trim().replace(/,$/, '') }
  const n = s.match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/)
  return n ? { number: n[1], name: n[2], unit } : { number: '', name: s, unit }
}

/** "123 Main St, Cathedral City, CA 92234" → pieces; null if it doesn't look like that. */
export function splitMailing(raw: string | undefined): { street: string; city: string; state: string; zip: string } | null {
  const parts = (raw ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 3) return null
  const last = parts[parts.length - 1].match(/^([A-Za-z]{2}|[A-Za-z .]+?)\s+(\d{5})(?:-\d{4})?$/)
  if (!last) return null
  return { street: parts.slice(0, parts.length - 2).join(', '), city: parts[parts.length - 2], state: last[1], zip: last[2] }
}

function placeFrom(stateRaw?: string, countryRaw?: string): { type: string; value: string; notes: EdrsNote[] } {
  let state = (stateRaw ?? '').trim()
  let country = (countryRaw ?? '').trim()
  // "SAN LUIS POTOSI, Mexico" typed into the one box → state + country
  const combo = !country && state.match(/^(.+?),\s*(mexico|m[eé]xico|canada)\s*$/i)
  if (combo) { state = combo[1].trim(); country = combo[2] }
  const us = !country || /^(us|usa|u\.?s\.?a?\.?|united states( of america)?)$/i.test(country)
  if (us) {
    if (!state) return { type: '', value: '', notes: [note('warn', 'Missing — type UNK if it truly is not known')] }
    if (/^(unk|unknown|unk\.)$/i.test(state)) return { type: 'US State', value: 'Unknown', notes: [] }
    const abbr = state.toUpperCase().replace(/\./g, '')
    const byAbbr = US_STATES[abbr]
    const byName = Object.values(US_STATES).find((n) => n.toLowerCase() === state.toLowerCase())
    if (byAbbr || byName) return { type: 'US State', value: byAbbr ?? byName!, notes: [] }
    const terr = US_TERRITORIES[abbr] ?? Object.values(US_TERRITORIES).find((n) => n.toLowerCase() === state.toLowerCase())
    if (terr) return { type: 'US Territory', value: terr, notes: [] }
    if (/^mexico$/i.test(state)) return { type: 'Mexican State', value: 'Unknown', notes: [] }
    return { type: 'US State', value: state, notes: [note('warn', `"${state}" isn't a recognised US state — check the type and spelling`)] }
  }
  if (/^m[eé]xico$/i.test(country)) return { type: 'Mexican State', value: state || 'Unknown', notes: [] }
  if (/^canada$/i.test(country)) return { type: 'Canadian Province', value: state || 'Unknown', notes: [] }
  return { type: 'Other Country', value: country, notes: [note('info', 'Pick the country with the magnifying-glass browser in EDRS')] }
}

// ---------------------------------------------------------------------------
// Building the rows
// ---------------------------------------------------------------------------

const SPOUSE_LOCKED = new Set(['Never married', 'Widowed', 'Divorced', 'Unknown', 'SRDP SURV'])

export function buildEdrsRows(caseIn: FuneralCase, ctx: EdrsContext = {}): EdrsRow[] {
  const c = withFirstCallDefaults(caseIn) // pickup place from the First Call fills the place-of-death items when the Vital Sheet is empty
  const vs = c.vitalSheet ?? {}
  const rows: EdrsRow[] = []
  const marital = normalizeMarital(c.decedent.maritalStatus)

  const add = (key: string, number: string, label: string, section: VitalSection, value: string, notes: (EdrsNote | undefined)[] = [], extra: Partial<EdrsRow> = {}) =>
    rows.push({ key, number, label, section, value, notes: notes.filter((n): n is EdrsNote => !!n), ...extra })

  /** A name part: dash when empty (if EDRS wants one), accents stripped, and a flag when required but missing. */
  const namePart = (key: string, number: string, label: string, hint: string | undefined, section: VitalSection, raw: string | undefined, o: { dash?: boolean; need?: NoteLevel; unk?: boolean } = {}) => {
    const r = edrsName(raw)
    const notes: (EdrsNote | undefined)[] = [r.note]
    let value = r.value
    if (!value && o.dash) { value = '-'; notes.push(note('info', 'Nothing entered — EDRS wants a dash here')) }
    else if (!value && o.need) notes.push(note(o.need, o.unk ? 'Required — enter UNK if unknown' : 'Required'))
    add(key, number, label, section, value, notes, { hint })
  }

  const placeRows = (key: string, number: string, label: string, hint: string | undefined, section: VitalSection, state?: string, country?: string) => {
    const p = placeFrom(state, country)
    add(`${key}-type`, number, label, section, p.type, [], { hint: `${hint ? hint + ' — ' : ''}type` })
    add(`${key}-value`, number, label, section, p.value, p.notes, { hint: `${hint ? hint + ' — ' : ''}state / country` })
  }

  const ssnRaw = ctx.ssn
  const home = vs.placeOfDeathType === 'home'

  for (const f of VITAL_FIELDS.filter((x) => x.edrs)) {
    const plain = f.get(c, ctx)
    switch (f.id) {
      case 'firstName':
        namePart('firstName', '1', 'DECEDENT FIRST NAME', undefined, 'decedent', /^unknown$/i.test(c.decedent.firstName) ? '' : c.decedent.firstName, { dash: false, need: 'error' })
        if (/^unknown$/i.test(c.decedent.firstName)) rows[rows.length - 1].notes.push(note('error', 'Placeholder name from First Call — enter the legal first name (only the coroner uses John/Jane Doe)'))
        break
      case 'middleName':
        namePart('middleName', '2', 'MIDDLE', 'decedent', 'decedent', c.decedent.middleName, { dash: true })
        break
      case 'lastName':
        namePart('lastName', '3', 'LAST NAME', undefined, 'decedent', /^unknown$/i.test(c.decedent.lastName) ? '' : splitSuffix(c.decedent.lastName, vs.decedentSuffix).rest, { need: 'error' })
        if (/^unknown$/i.test(c.decedent.lastName)) rows[rows.length - 1].notes.push(note('error', 'Placeholder name from First Call — enter the legal last name'))
        break
      case 'suffix': {
        const s = splitSuffix(c.decedent.lastName, vs.decedentSuffix)
        add('suffix', '3', 'SUFFIX', 'decedent', s.suffix, s.inferred ? [note('warn', `Read "${s.suffix}" from the end of the last name ("${c.decedent.lastName}") — confirm, or pick it in the Suffix box on the Vital Sheet`)] : [], { hint: 'beside the last name', hideWhenEmpty: true })
        break
      }
      case 'aka': {
        const a = splitName(vs.alsoKnownAs)
        for (const [part, label] of [['first', 'AKA FIRST NAME'], ['middle', 'AKA MIDDLE NAME'], ['last', 'AKA LAST NAME']] as const) {
          const r = edrsName(a[part])
          add(`aka-${part}`, '', label, 'decedent', r.value, [r.note, part === 'first' && vs.alsoKnownAs ? note('info', 'Only one AKA fits on the certificate; more need an amendment later') : undefined], { hideWhenEmpty: true })
        }
        break
      }
      case 'dob':
        add('dob', '4', 'DATE OF BIRTH', 'decedent', plain, plain ? [] : [note('error', 'Required — use -- for an unknown day or month, UNK if nothing is known')])
        break
      case 'age':
        add('age', '5', 'AGE', 'decedent', computeAge(c), [note('info', 'EDRS works this out from items 4 and 7 — only type it if the age is under a day or the birth date is partial')])
        break
      case 'ageHours':
      case 'ageDays':
        add(f.id, '', f.label, 'decedent', plain, [], { hint: f.hint, hideWhenEmpty: true })
        break
      case 'sex': {
        const map: Record<string, string> = { male: 'Male', female: 'Female', unknown: 'Unknown/Undetermined', nonbinary: 'Nonbinary' }
        add('sex', '6', 'SEX', 'decedent', c.decedent.sex ? map[c.decedent.sex] : '', c.decedent.sex ? [] : [note('error', 'Required')])
        break
      }
      case 'birthCity':
        break // EDRS asks only for the birth state or country (item 9), not the city
      case 'birthState':
        placeRows('birth', '9', 'BIRTH STATE/FOREIGN COUNTRY', undefined, 'decedent', vs.birthState, vs.birthCountry)
        break
      case 'birthCountry':
        break
      case 'ssn': {
        const r = edrsSsn(ssnRaw ?? undefined)
        add('ssn', '10', 'SOCIAL SECURITY NUMBER', 'decedent', r.value,
          [r.note, ctx.ssn === null ? note('info', 'EDRS requires this, but it can be added later — come back when the family has it (UNK if unknown, NONE if they never had one)') : undefined, note('info', 'After entering it, request SSN verification (Certificate menu) at least once')], { sensitive: true })
        break
      }
      case 'armedForces':
        add('armedForces', '11', 'EVER IN ARMED FORCES?', 'decedent', c.decedent.veteran ? 'Yes' : 'No', [])
        break
      case 'maritalStatus': {
        const raw = c.decedent.maritalStatus
        add('maritalStatus', '12', 'MARITAL STATUS', 'decedent', marital.value ?? '',
          !raw ? [note('error', 'Required — it also decides whether the spouse fields are used')]
            : !marital.value ? [note('error', `"${raw}" isn't an EDRS choice — pick one on the Vital Sheet`)]
            : [raw.trim().toLowerCase() === 'separated' ? note('info', 'Legally separated is entered as Married') : undefined])
        break
      }
      case 'dod':
        add('dod', '7', 'DATE OF DEATH', 'decedent', plain, plain ? [note('info', "Can't be amended — if the year is wrong the certificate has to be sealed and replaced")] : [note('error', 'Required')])
        break
      case 'timeOfDeath': {
        const r = edrsTime(c.firstCall?.timeOfDeath)
        add('timeOfDeath', '8', 'HOUR', 'decedent', r.value, r.value ? [r.note] : [note('warn', 'Not recorded — enter UNK if unknown')])
        break
      }
      case 'education': {
        const m = normalizeEducation(vs.education)
        add('education', '13', 'EDUCATION', 'background', m.value ?? '',
          !vs.education ? [note('warn', 'Not recorded — choose Unknown if it is')]
            : !m.value ? [note('error', `"${vs.education}" isn't an EDRS choice — pick one on the Vital Sheet`)]
            : [m.viaAlias ? note('info', `Read "${vs.education}" as "${m.value}" — confirm`) : undefined])
        break
      }
      case 'hispanic':
        add('hispanic', '14', 'WAS DECEDENT SPANISH/HISPANIC/LATINO?', 'background', vs.hispanicLatino ? 'Yes' : 'No', [])
        break
      case 'hispanicSpecify': {
        if (!vs.hispanicLatino) break
        const t = (vs.hispanicSpecify ?? '').trim()
        const boxes = [/mexic/i.test(t) ? 'Mexican' : '', /cuba/i.test(t) ? 'Cuban' : '', /puerto|boricua/i.test(t) ? 'Puerto Rican' : ''].filter(Boolean)
        const value = boxes.length ? boxes.join(', ') : `Other — ${t || 'UNKNOWN'}`
        add('hispanicSpecify', '14', 'WAS DECEDENT SPANISH/HISPANIC/LATINO?', 'background', value, !t ? [note('info', 'No origin recorded — EDRS wants Other with UNKNOWN')] : [], { hint: 'origin to check' })
        break
      }
      case 'race': {
        const m = normalizeRace(vs.race)
        add('race', '16', "DECEDENT'S RACE", 'background', m.value ?? '',
          !vs.race ? [note('error', 'Required — informant-designated; choose Unknown if not known')]
            : !m.value ? [note('warn', `"${vs.race}" isn't an EDRS choice — pick the closest one, or Other and specify`)]
            : [m.viaAlias ? note('info', `Read "${vs.race}" as "${m.value}" — confirm with the informant`) : undefined])
        break
      }
      case 'occupation': {
        const t = (vs.occupation ?? '').trim()
        add('occupation', '17', 'USUAL OCCUPATION', 'background', t,
          !t ? [note('warn', 'Not recorded — enter UNK if unknown')]
            : /^(retired|unemployed)$/i.test(t) ? [note('error', `EDRS doesn't accept "${t}" — enter the work they did longest (or Homemaker, Never Worked, UNK)`)] : [])
        break
      }
      case 'kindOfBusiness':
        add('kindOfBusiness', '18', 'KIND OF BUSINESS OR INDUSTRY', 'background', plain, plain ? [] : [note('warn', 'Not recorded — a dash for a child or infant, UNK if unknown')])
        break
      case 'yearsInOccupation':
        add('yearsInOccupation', '19', 'YEARS IN OCCUPATION', 'background', plain,
          !plain ? [note('warn', 'Not recorded — a dash if no information, UNK if unknown')]
            : /^(\d+|unk|-)$/i.test(plain.trim()) ? [] : [note('warn', 'Must be a number, UNK, or a dash')])
        break
      case 'residence': {
        const a = splitStreet(plain)
        const check = plain ? note('info', `Split from "${plain}" — check`) : undefined
        add('res-number', '20', "DECEDENT'S RESIDENCE", 'residence', a.number, [check], { hint: 'street number', hideWhenEmpty: true })
        add('res-name', '20', "DECEDENT'S RESIDENCE", 'residence', a.name, a.name ? [] : [note('error', 'Street name is required — enter UNK if unknown')], { hint: 'street name' })
        add('res-unit', '20', "DECEDENT'S RESIDENCE", 'residence', a.unit, [], { hint: 'apt / suite / unit', hideWhenEmpty: true })
        break
      }
      case 'residenceCity': {
        const r = edrsName(plain)
        add('res-city', '21', 'CITY', 'residence', r.value, r.value ? [r.note] : [note('error', 'Required — UNK if unknown')])
        break
      }
      case 'residenceCounty':
        add('res-county', '22', 'COUNTY/PROVINCE', 'residence', plain, plain ? [] : [note('error', 'Required — choose from the county list, UNK if unknown')])
        break
      case 'residenceZip':
        add('res-zip', '23', 'ZIP CODE', 'residence', plain, !plain ? [note('error', 'Required — a dash if there is none')] : /^\d{5}(-\d{4})?$/.test(plain.trim()) ? [] : [note('warn', 'US zip codes are 5 digits, optionally +4')])
        break
      case 'yearsInCounty':
        add('res-years', '24', 'YEARS IN COUNTY', 'residence', plain,
          !plain ? [note('warn', 'Not recorded — 0 if under a year, UNK if unknown')]
            : /^(\d+|unk|-)$/i.test(plain.trim()) ? [] : [note('warn', 'Must be a number, UNK, or a dash')])
        break
      case 'residenceState':
        placeRows('res-state', '25', 'STATE/FOREIGN COUNTRY', undefined, 'residence', vs.residenceState, undefined)
        {
          // EDRS's residence "address type" list is different from the birth-place one: California is its own choice, other states are "Other US State".
          const rp = placeFrom(vs.residenceState, undefined)
          const kindAlt = rp.type === 'US State' ? (rp.value === 'California' ? 'California' : rp.value ? 'Other US State' : '') : rp.type
          add('res-kindAlt', '25', 'STATE/FOREIGN COUNTRY', 'residence', kindAlt, [], { hint: 'address type' })
        }
        // Items EDRS asks that the paper form doesn't: homeless status
        if (vs.homeless) {
          add('homeless', '25A', 'HOMELESS?', 'residence', vs.homeless === 'yes' ? 'Yes' : vs.homeless === 'no' ? 'No' : 'Unknown', [])
          if (vs.homeless === 'yes') add('homeless-kind', '25A', 'HOMELESS?', 'residence', vs.homelessKind ? { unsheltered: 'Unsheltered', sheltered: 'Sheltered', in_institution: 'In Institution' }[vs.homelessKind] : '', vs.homelessKind ? [] : [note('error', 'Choose Unsheltered, Sheltered or In Institution')], { hint: 'which' })
        } else {
          add('homeless', '25A', 'HOMELESS?', 'residence', '', [note('warn', 'Not recorded — EDRS asks this on every certificate')])
        }
        break
      case 'informantName': {
        const infSfx = splitSuffix(vs.informantName, vs.informantSuffix)
        const n = splitName(infSfx.rest)
        const single = !!vs.informantName && !n.last
        const [first, middle, last] = single ? ['-', '-', n.first] : [n.first, n.middle, n.last]
        const empty = !vs.informantName
        for (const [part, label, raw, dash] of [['first', 'INFORMANT FIRST NAME', first, false], ['middle', 'INFORMANT MIDDLE NAME', middle, true], ['last', 'INFORMANT LAST NAME', last, false]] as const) {
          const r = raw === '-' ? { value: '-', note: undefined } : edrsName(raw)
          add(`inf-${part}`, '26', label, 'family', r.value || (empty || !dash ? '' : '-'),
            [r.note, !r.value && empty && part !== 'middle' ? note('error', 'Required — the person giving the information') : undefined, single && part !== 'last' ? note('info', 'One name only — EDRS wants it in Last, with dashes before it') : undefined])
        }
        break
      }
      case 'informantSuffix': {
        const s = splitSuffix(vs.informantName, vs.informantSuffix)
        add('inf-suffix', '26', 'SUFFIX', 'family', s.suffix, s.inferred ? [note('warn', `Read "${s.suffix}" from the end of the informant's name — confirm`)] : [], { hint: 'informant', hideWhenEmpty: true })
        break
      }
      case 'informantRelationship': {
        const m = normalizeRelationship(vs.informantRelationship)
        const t = (vs.informantRelationship ?? '').trim()
        add('inf-rel', '26', 'INFORMANT RELATIONSHIP', 'family', m.value ?? (t ? 'Other' : ''), !t ? [note('error', 'Required')] : [])
        if (!m.value && t) add('inf-rel-other', '26', 'INFORMANT RELATIONSHIP', 'family', t.charAt(0).toUpperCase() + t.slice(1), [], { hint: 'if Other, specify' })
        break
      }
      case 'informantAddress': {
        const raw = vs.informantMailingAddress
        const m = splitMailing(raw)
        if (!raw) { add('inf-addr', '27', 'INFORMANT MAILING ADDRESS', 'family', '', [note('error', 'Required — a dash if not available')]); break }
        if (!m) { add('inf-addr', '27', 'INFORMANT MAILING ADDRESS', 'family', raw, [note('warn', 'Couldn\'t split this into street, city, state and zip — write it as "123 Main St, City, ST 12345"')]); break }
        const p = placeFrom(m.state)
        const a = splitStreet(m.street)
        const check = note('info', `Split from "${raw}" — check`)
        add('inf-type', '27', 'INFORMANT MAILING ADDRESS', 'family', p.type, [], { hint: 'type' })
        add('inf-state', '27', 'INFORMANT MAILING ADDRESS', 'family', p.value, p.notes, { hint: 'state' })
        add('inf-num', '27', 'INFORMANT MAILING ADDRESS', 'family', a.number, [check], { hint: 'street number', hideWhenEmpty: true })
        add('inf-street', '27', 'INFORMANT MAILING ADDRESS', 'family', a.name, [], { hint: 'street name' })
        add('inf-unit', '27', 'INFORMANT MAILING ADDRESS', 'family', a.unit, [], { hint: 'apt / suite / unit', hideWhenEmpty: true })
        add('inf-city', '27', 'INFORMANT MAILING ADDRESS', 'family', edrsName(m.city).value, [], { hint: 'city' })
        add('inf-zip', '27', 'INFORMANT MAILING ADDRESS', 'family', m.zip, [], { hint: 'zip' })
        break
      }
      case 'spouseFirst':
      case 'spouseMiddle':
      case 'spouseLast': {
        const s = resolveName(vs, 'spouse')
        const part = f.id === 'spouseFirst' ? 'first' : f.id === 'spouseMiddle' ? 'middle' : 'last'
        const number = f.number
        const label = part === 'first' ? 'NAME OF SURVIVING SPOUSE' : part === 'middle' ? 'MIDDLE' : 'LAST (BIRTH) NAME'
        if (marital.value && SPOUSE_LOCKED.has(marital.value)) {
          add(f.id, number, label, 'family', '-', [note('info', `EDRS fills this with a dash and locks it for "${marital.value}"`)], { hint: part === 'first' ? undefined : 'spouse' })
        } else {
          namePart(f.id, number, label, part === 'first' ? undefined : 'spouse', 'family', part === 'last' ? splitSuffix(s.last, vs.spouseSuffix).rest : s[part], part === 'middle' ? { dash: true } : marital.value ? { need: 'warn' } : {})
          if (part === 'last' && s.last) rows[rows.length - 1].notes.push(note('info', "Spouse's birth name — the name before marriage"))
        }
        break
      }
      case 'spouseSuffix':
      case 'fatherSuffix':
      case 'motherSuffix': {
        const who = f.id.replace('Suffix', '') as 'spouse' | 'father' | 'mother'
        if (who === 'spouse' && marital.value && SPOUSE_LOCKED.has(marital.value)) break
        const s = splitSuffix(resolveName(vs, who).last, vs[`${who}Suffix` as 'spouseSuffix' | 'fatherSuffix' | 'motherSuffix'])
        add(f.id, f.number || ({ spouse: '30', father: '33', mother: '37' })[who], 'SUFFIX', 'family', s.suffix, s.inferred ? [note('warn', `Read "${s.suffix}" from the end of the ${who}'s last name — confirm`)] : [], { hint: who, hideWhenEmpty: true })
        break
      }
      case 'fatherFirst':
      case 'fatherMiddle':
      case 'fatherLast':
      case 'motherFirst':
      case 'motherMiddle':
      case 'motherLast': {
        const who = f.id.startsWith('father') ? 'father' : 'mother'
        const n = resolveName(vs, who)
        const part = f.id.endsWith('First') ? 'first' : f.id.endsWith('Middle') ? 'middle' : 'last'
        const label = part === 'first' ? (who === 'father' ? 'NAME OF FATHER/PARENT' : 'NAME OF MOTHER/PARENT') : part === 'middle' ? 'MIDDLE' : who === 'mother' ? 'LAST (BIRTH) NAME' : 'LAST'
        namePart(f.id, f.number, label, part === 'first' ? undefined : who, 'family', part === 'last' ? splitSuffix(n.last, vs[`${who}Suffix` as 'fatherSuffix' | 'motherSuffix']).rest : n[part], part === 'middle' ? { dash: true } : { need: 'warn', unk: true })
        if (who === 'mother' && part === 'last' && n.last) rows[rows.length - 1].notes.push(note('info', "Her birth name — the name before any marriage"))
        break
      }
      case 'fatherBirthState':
        placeRows('father-birth', '34', "FATHER/PARENT'S BIRTH STATE/COUNTRY", undefined, 'family', vs.fatherBirthState, undefined)
        break
      case 'motherBirthState':
        placeRows('mother-birth', '38', "MOTHER/PARENT'S BIRTH STATE/COUNTRY", undefined, 'family', vs.motherBirthState, undefined)
        break
      case 'dispositionDate':
        add('dispositionDate', '39', 'DATE OF DISPOSITION', 'office', plain, plain ? [] : [note('error', 'Required — a dash only if it is a pending coroner case')])
        break
      case 'finalDisposition':
        add('finalDisposition', '40', 'PLACE OF FINAL DISPOSITION', 'office', plain, plain ? [] : [note('error', 'Required — a name or a complete address; a dash only for a pending coroner case')], { hint: 'name' })
        break
      case 'dispositionAddress': {
        // EDRS splits the place's street into number / name / unit, like the residence.
        const a = splitStreet(plain)
        const check = plain ? note('info', `Split from "${plain}" — check`) : undefined
        const missing = !plain && !!vs.placeOfFinalDisposition && vs.placeOfFinalDisposition.trim() !== '-'
        add('disp-number', '40', 'PLACE OF FINAL DISPOSITION', 'office', a.number, [check], { hint: 'street number', hideWhenEmpty: true })
        add('disp-name', '40', 'PLACE OF FINAL DISPOSITION', 'office', a.name, missing ? [note('warn', 'No street address yet — EDRS has boxes for the street, city and zip of this place')] : [], { hint: 'street name', hideWhenEmpty: !missing })
        add('disp-unit', '40', 'PLACE OF FINAL DISPOSITION', 'office', a.unit, [], { hint: 'apt / suite / unit', hideWhenEmpty: true })
        break
      }
      case 'dispositionCity': {
        const r = edrsName(plain)
        add('disp-city', '40', 'PLACE OF FINAL DISPOSITION', 'office', r.value, [r.note], { hint: 'city', hideWhenEmpty: true })
        break
      }
      case 'dispositionZip': {
        const digits = (plain ?? '').replace(/\D/g, '')
        add('disp-zip5', '40', 'PLACE OF FINAL DISPOSITION', 'office', digits.slice(0, 5), digits && digits.length < 5 ? [note('warn', 'US zip codes are 5 digits')] : [], { hint: 'zip code', hideWhenEmpty: true })
        if (digits.length > 5) add('disp-zip4', '40', 'PLACE OF FINAL DISPOSITION', 'office', digits.slice(5, 9), [], { hint: 'zip +4' })
        break
      }
      case 'dispositionState':
        // EDRS asks for the state/country of the place of final disposition as an "Address Type" beside item 40.
        placeRows('disp', '40', 'PLACE OF FINAL DISPOSITION — ADDRESS TYPE', 'state / country', 'office', vs.dispositionState, undefined)
        break
      case 'typeOfDisposition': {
        const m = normalizeDisposition(vs.typeOfDisposition)
        // Only fall back to the case's disposition when nothing was entered — a typed value that isn't an EDRS choice must be flagged, never swapped out.
        const derived = !m.value && !(vs.typeOfDisposition ?? '').trim()
          ? ({ burial: 'Burial', entombment: 'Burial', cremation: 'Cremation', donation: 'Scientific Use' } as Record<string, string | undefined>)[c.disposition]
          : undefined
        const value = m.value ?? derived ?? ''
        add('typeOfDisposition', '41', 'TYPE OF DISPOSITION', 'office', value,
          value
            ? [derived ? note('info', `Taken from the case's disposition (${c.disposition}) — confirm, and use a combined choice like Cremation/Burial if it applies`)
              : vs.typeOfDisposition && m.viaAlias ? note('info', `Read "${vs.typeOfDisposition}" as "${m.value}" — confirm`) : undefined]
            : [vs.typeOfDisposition ? note('error', `"${vs.typeOfDisposition}" isn't an EDRS choice — pick one on the Vital Sheet`) : note('error', 'Required')])
        // Items 42-45: embalmer and funeral establishment
        const emb = vs.embalmed
        add('embalmed', '42', 'EMBALMED?', 'office', emb === 'yes' ? 'Yes' : emb === 'no' ? 'No' : '', emb ? [emb === 'no' ? note('info', 'EDRS fills in NOT EMBALMED and a dash for item 43') : undefined] : [note('error', 'Required')])
        if (emb === 'yes') {
          add('embalmer-name', '42', 'EMBALMER', 'office', vs.embalmerName ?? '', vs.embalmerName ? [] : [note('error', 'Required — search the embalmer in EDRS by name or license')], { hint: 'name' })
          const lic = edrsLicense(vs.embalmerLicense, 'EMB')
          add('embalmer-license', '43', "EMBALMER'S LICENSE NUMBER", 'office', lic.value, lic.value ? [lic.note] : [note('error', 'Required')])
        }
        add('fd-name', '44', 'NAME OF FUNERAL ESTABLISHMENT', 'office', ctx.location?.name ?? '', ctx.location?.name ? [note('info', 'Search it in EDRS with the magnifying glass — it fills 44 and 45')] : [note('warn', 'Location not found')])
        const fd = edrsLicense(ctx.location?.licenseNumber, 'FD')
        add('fd-license', '45', 'FUNERAL ESTABLISHMENT LICENSE NUMBER', 'office', fd.value, fd.value ? [fd.note] : [note('error', 'No license number is set for this location — add it in Supabase (Table Editor → locations → license_number)')])
        break
      }
      case 'placeOfDeath': {
        const t = vs.placeOfDeathType
        add('pod-type', '102/103', 'WHERE DEATH OCCURRED', 'office', t ? PLACE_OF_DEATH_TYPES[t].split(' — ')[0] : '', t ? [] : [note('error', 'Required — hospital (DOA / ER-OP / IP), home, hospice, nursing home, or other')])
        add('placeOfDeath', '101', 'PLACE OF DEATH', 'office', home ? 'RESIDENCE' : plain, home ? [note('info', "EDRS fills this in when you choose Decedent's Home")] : plain ? [] : [note('error', 'Required')])
        break
      }
      case 'deathCounty': {
        // Filled from the Vital Sheet if entered; otherwise worked out from where death happened — only for Coachella Valley / Riverside County places, never guessed elsewhere (104 can't be amended).
        const where = [vs.deathCity, c.decedent.placeOfDeath, c.firstCall?.locationAddress, vs.facilityAddressOrAddressFound].filter(Boolean).join(' ')
        const riverside = /\b(coachella|cathedral city|palm springs|indio|palm desert|rancho mirage|desert hot springs|la quinta|thousand palms|thermal|mecca|bermuda dunes|riverside)\b/i.test(where)
        const county = plain || (riverside ? 'Riverside' : '')
        add('deathCounty', '104', 'COUNTY/JURISDICTION OF DEATH', 'office', county, county
          ? [note('info', plain ? "Can't be amended — if it is wrong the certificate has to be sealed and replaced. Long Beach, Pasadena and Berkeley have their own choices." : "Worked out from where death occurred (Riverside County) — it can't be amended later, so check it")]
          : [note('error', 'Required — and it cannot be amended later')])
        break
      }
      case 'facilityAddress': {
        const derived = home && !plain ? [c.firstCall?.locationAddress ?? vs.residenceAddress].filter(Boolean)[0] : undefined
        add('facilityAddress', '105', 'FACILITY ADDRESS OR LOCATION WHERE FOUND', 'office', plain || derived || '', plain ? [] : derived ? [note('info', "Taken from the residence address — EDRS fills this in for Decedent's Home")] : [note('error', 'Required')])

        {
          // EDRS wants the street split into number / name / unit (the rest of the line — city, state, zip — has its own boxes).
          const full = (plain || derived || '').trim()
          if (full) {
            const a = splitStreet(full.split(',')[0].trim())
            if (a.number) add('fac-number', '105', 'FACILITY ADDRESS', 'office', a.number, [], { hint: 'street number' })
            add('fac-name', '105', 'FACILITY ADDRESS', 'office', a.name, [], { hint: 'street name' })
            if (a.unit) add('fac-unit', '105', 'FACILITY ADDRESS', 'office', a.unit, [], { hint: 'apt / suite / unit' })
          }
        }
        break
      }
      case 'deathZip': {
        const digits = (vs.deathZip ?? '').replace(/\D/g, '')
        const zip5 = digits.slice(0, 5), zip4 = digits.slice(5, 9)
        add('fac-zip5', '106', 'ZIP CODE', 'office', zip5, zip5.length === 5 ? [] : [note('warn', 'Not recorded (5 digits) — EDRS asks for the zip of where death occurred')])
        if (zip4) add('fac-zip4', '106', 'ZIP CODE', 'office', zip4, [], { hint: '+4' })
        break
      }
      case 'deathCity': {
        const derived = home && !plain ? vs.residenceCity : undefined
        add('deathCity', '106', 'CITY', 'office', plain || derived || '', plain ? [] : derived ? [note('info', 'Taken from the residence city')] : [note('error', 'Required')])
        break
      }
      default:
        add(f.id, f.number, f.label, f.section, plain, [], { hint: f.hint })
    }
  }
  return rows.filter((r) => !(r.hideWhenEmpty && !r.value))
}

export interface Readiness {
  blockers: EdrsRow[]
  toCheck: EdrsRow[]
  ready: boolean
}

export function readiness(rows: EdrsRow[]): Readiness {
  const blockers = rows.filter((r) => r.notes.some((n) => n.level === 'error'))
  const toCheck = rows.filter((r) => !blockers.includes(r) && r.notes.some((n) => n.level === 'warn'))
  return { blockers, toCheck, ready: blockers.length === 0 }
}
