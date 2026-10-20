// The name and look of the company this tab is working in ("Casillas Funeral Home", "Sanders Funeral Home"...), used on
// messages, forms and screens so one company never shows up under the other's name. Set by the session.
export interface Brand {
  key: 'casillas' | 'sanders'
  website: string | null
  /** Logo that reads on a white page (forms, invoices, family portal). */
  logoOnWhite: string
  /** Logo for the dark sidebar / TV board; `invert` means the source is dark and must be flipped to white. */
  logoOnDark: string
  invert: boolean
  /** Short text shown with the logo where a name is needed. */
  displayName: string
}

const CASILLAS: Brand = {
  key: 'casillas', website: 'www.CasillasFuneralHome.com', logoOnWhite: '/casillas-logo.png', logoOnDark: '/casillas-logo.png',
  invert: true, displayName: 'Casillas Funeral Home',
}
const SANDERS: Brand = {
  key: 'sanders', website: 'www.sanderseureka.com', logoOnWhite: '/sanders-logo-dark.png', logoOnDark: '/sanders-logo-light.png',
  invert: false, displayName: 'Sanders Funeral Home',
}

export function brandFor(name?: string | null): Brand {
  return /^sanders/i.test(name ?? '') ? SANDERS : CASILLAS
}

let current = 'Casillas Funeral Home'
export function setCompany(name: string | undefined) {
  if (name) current = name
}
export const getCompanyName = () => current
export const getCompanyWebsite = () => brandFor(current).website
export const getBrand = () => brandFor(current)
/** Strips the company name off the front of a location name: "Casillas Funeral Home — Coachella" -> "Coachella". */
export function shortLocationName(name: string): string {
  return name.replace(/^(Casillas|Sanders) Funeral Home\s*[—-]\s*/, '')
}
