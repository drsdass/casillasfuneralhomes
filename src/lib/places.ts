// Birth places: EDRS asks for a TYPE (US State, Mexican State, Canadian Province…) and then a name from that type's list.
// Spelled the way EDRS lists them (no accents).
export const MEXICAN_STATES = ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Coahuila', 'Colima', 'Distrito Federal', 'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Mexico', 'Michoacan', 'Morelos', 'Nayarit', 'Nuevo Leon', 'Oaxaca', 'Puebla', 'Queretaro', 'Quintana Roo', 'San Luis Potosi', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatan', 'Zacatecas'] as const
export const CANADIAN_PROVINCES = ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'] as const

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** Matches a typed name against a list, forgiving accents and small typos ("SAN LUIS POSTOSI" → "San Luis Potosi"). */
export function matchPlace(raw: string, list: readonly string[]): { name: string; exact: boolean } | null {
  const t = fold(raw)
  if (!t) return null
  const exact = list.find((n) => fold(n) === t)
  if (exact) return { name: exact, exact: true }
  if (t.length < 5) return null
  let best: { name: string; d: number } | null = null
  for (const n of list) { const d = distance(t, fold(n)); if (!best || d < best.d) best = { name: n, d } }
  return best && best.d <= (t.length > 9 ? 2 : 1) ? { name: best.name, exact: false } : null
}
