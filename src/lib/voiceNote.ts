import type { CustodyStage, FuneralCase } from '@/types'

/** What a spoken note suggests about where the decedent is now. Only ever a suggestion — the driver taps to confirm. */
export function suggestStage(text: string): CustodyStage | null {
  const has = (words: string) => new RegExp(`(?<!\\p{L})(${words})(?!\\p{L})`, 'iu').test(text)
  if (has('arrived|back at|got back|delivered|dropped off|drop off|llegu[eé]|llegamos|ya llegamos|entregu[eé]')) return 'funeral_home'
  if (has('on (the|my) way|en route|heading (back|to)|transporting|en camino|voy para|llevando')) return 'in_transit'
  // "moving John Doe to the funeral home" — said as a plain move into our care
  if (has('mov(e|ed|ing)|brought|bringing|took|taking') && has('funeral home|mortuary|casillas|coachella|cathedral city|desert hot springs|indio')) return 'funeral_home'
  if (has('picked up|pick up|recog[ií]|recogimos')) return 'scene_first_call'
  return null
}

/** Cases whose decedent name (first and last) is spoken in the text. */
export function casesNamedIn(text: string, cases: FuneralCase[]): FuneralCase[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9áéíóúñü ]+/g, ' ')} `
  return cases.filter((c) => {
    const f = c.decedent.firstName.toLowerCase().trim(), l = c.decedent.lastName.toLowerCase().trim()
    return f.length > 1 && l.length > 1 && f !== 'unknown' && t.includes(` ${f} `) && t.includes(` ${l} `)
  })
}

