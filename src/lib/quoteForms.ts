import { format } from 'date-fns'
import { dateToSerial, type Raw, type SheetDef } from './sheetEngine'

export type FormData = Record<string, Raw>
/** What a saved quote keeps of each package: every value on the form as it was, so it prints exactly like the statement form. */
export type QuoteFormsData = Record<string, FormData>

/** The date boxes on the forms follow today's date; a saved quote keeps the date it was made. */
export function freezeDates(sheet: SheetDef, data: FormData, when = new Date()): FormData {
  const serial = dateToSerial(new Date(format(when, 'yyyy-MM-dd') + 'T00:00:00Z'))
  const out = { ...data }
  for (const [key, c] of Object.entries(sheet.cells)) if (c.f && /^\s*=?\s*TODAY\(\)\s*$/i.test(c.f) && !(key in out)) out[key] = serial
  return out
}
