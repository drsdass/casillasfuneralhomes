import type { Raw, SheetDef } from './sheetEngine'

/**
 * The order forms come in two editions. "Current" is the QUOTES 2026 workbook (12 tabs). "Legacy" is the earlier
 * 7-tab workbook. Anything a case or quote already saved on a legacy tab keeps showing on that legacy form, so
 * nothing already typed is re-laid-out or lost. New work uses the current forms and is stamped with TPL_KEY.
 */
export interface SheetBook { current: SheetDef[]; legacy: SheetDef[] }
export const TPL_KEY = '_tpl'
export const TPL_VALUE = '2'

type Saved = Record<string, Record<string, Raw> | undefined> | undefined

const hasInk = (d?: Record<string, Raw>) => !!d && Object.keys(d).some((k) => k !== TPL_KEY && !k.startsWith('_') && d[k] !== '' && d[k] !== undefined)
/** True when this saved tab was typed on the old form. */
export const isLegacyData = (d?: Record<string, Raw>) => hasInk(d) && d![TPL_KEY] !== TPL_VALUE

/** The form to draw for one tab name, given what is saved on it. */
export function pickSheet(book: SheetBook, name: string, data?: Record<string, Raw>): SheetDef | undefined {
  const cur = book.current.find((s) => s.name === name)
  if (isLegacyData(data)) return book.legacy.find((s) => s.name === name) ?? cur
  return cur
}

/** The tabs a case or quote shows: every current tab (old form where old data exists) plus old-only tabs that hold data or are on the invoice. */
export function resolveSheets(book: SheetBook, saved: Saved): SheetDef[] {
  const onInvoice = new Set(String((saved?.['_invoice'] as Record<string, Raw> | undefined)?.sources ?? '').split('|').filter(Boolean))
  const out = book.current.map((c) => pickSheet(book, c.name, saved?.[c.name]) ?? c)
  for (const l of book.legacy) if (!out.some((o) => o.name === l.name) && (isLegacyData(saved?.[l.name]) || onInvoice.has(l.name))) out.push(l)
  return out
}

/** Marks newly typed data as belonging to the current forms. Old-form data is left exactly as it was. */
export function stamp<T extends Record<string, Raw>>(sheet: SheetDef | undefined, data: T): T {
  return sheet?.tpl ? { ...data, [TPL_KEY]: TPL_VALUE } : data
}
