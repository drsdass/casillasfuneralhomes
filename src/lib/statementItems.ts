import { makeEvaluator, type Raw, type SheetDef } from './sheetEngine'

/** One priced line on a statement form that can be ticked as "ordered". */
export interface StatementItem { key: string; row: number; col: number; label: string }

export interface StatementLayout { items: StatementItem[]; taxKey?: string; creditKeys: string[] }

const letterCol = (l: string): number => l.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0)
const isMoney = (sheet: SheetDef, key: string): boolean => !!sheet.styles[sheet.cells[key]?.s ?? -1]?.nf?.includes('"$"')
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : 0)

const layoutCache = new WeakMap<SheetDef, StatementLayout>()

/**
 * Works out, from the form's own formulas, which cells are the choosable lines:
 * the money cells that the "TOTAL OF SERVICES / MERCHANDISE / CASH ADVANCES" sums add up.
 * Also finds the State Sales Tax and CREDIT lines.
 */
export function statementLayout(sheet: SheetDef): StatementLayout {
  const hit = layoutCache.get(sheet); if (hit) return hit
  const seen = new Set<string>(); const items: StatementItem[] = []
  const textOf = (key: string): string => { const c = sheet.cells[key]; return c && c.f === undefined && typeof c.v === 'string' ? c.v.trim() : '' }
  const rowText = (r: number, pred: (t: string) => boolean): { c: number; t: string } | null => {
    for (let c = 1; c <= sheet.cols.length; c++) { const t = textOf(`${r},${c}`); if (t && pred(t)) return { c, t } }
    return null
  }
  const multiRow = new Set<string>()
  for (const [r1, c1, r2, c2] of sheet.merges) if (r2 > r1 || c2 > c1) multiRow.add(`${r1},${c1}:${r2 - r1}`)

  for (const [key, cell] of Object.entries(sheet.cells)) {
    const m = cell.f && /^SUM\(([A-Z]+)(\d+):[A-Z]+(\d+)\)$/.exec(cell.f)
    if (!m) continue
    const r = Number(key.split(',')[0])
    if (!rowText(r, (t) => /^total (of|for)\b/i.test(t))) continue // only the three section totals, not the grand total
    const col = letterCol(m[1])
    for (let rr = Number(m[2]); rr <= Number(m[3]); rr++) {
      const k = `${rr},${col}`
      const c = sheet.cells[k]
      if (!c || seen.has(k) || !isMoney(sheet, k)) continue
      if (c.f && (/^SUM\(/.test(c.f) || /^\$?[A-Z]+\$?\d+$/.test(c.f))) continue
      seen.add(k)
      const parts: string[] = []
      for (let cc = 1; cc < col; cc++) {
        const ck = `${rr},${cc}`; const cl = sheet.cells[ck]; const st = sheet.styles[cl?.s ?? -1]
        if (!cl || st?.rot === 90 || st?.rot === 255) continue
        if (sheet.merges.some(([a, b, a2]) => a === rr && b === cc && a2 > a)) continue
        parts.push(ck)
      }
      items.push({ key: k, row: rr, col, label: parts.join('|') })
    }
  }

  const moneyRight = (r: number, afterCol: number): string | undefined => {
    for (let c = afterCol + 1; c <= sheet.cols.length; c++) { const k = `${r},${c}`; if (sheet.cells[k] && isMoney(sheet, k)) return k }
    return undefined
  }
  let taxKey: string | undefined; const creditKeys: string[] = []
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (cell.f !== undefined || typeof cell.v !== 'string') continue
    const [r, c] = key.split(',').map(Number)
    if (/sales tax/i.test(cell.v)) taxKey ??= moneyRight(r, c)
    else if (/^credit\s*\d*\s*$/i.test(cell.v.trim())) { const k = moneyRight(r, c); if (k) creditKeys.push(k) }
  }
  const out = { items, taxKey, creditKeys }
  layoutCache.set(sheet, out)
  return out
}

export interface StatementLine { key: string; label: string; natural: number; amount: number; checked: boolean }
export interface StatementSummary {
  lines: StatementLine[]
  tax: number
  credit: number
  subtotal: number
  total: number
}

/** Prefix for the "ticked / not ticked" flag saved next to the cell values. */
export const FLAG = 'x:'

/** Evaluates a form twice: first as typed (to learn each line's price), then with un-ticked lines counted as zero. */
export function summarize(sheet: SheetDef, over: Record<string, Raw>) {
  const layout = statementLayout(sheet)
  const ev0 = makeEvaluator(sheet, over)
  const lines: StatementLine[] = []
  const zeroed: Record<string, Raw> = { ...over }
  for (const it of layout.items) {
    const natural = num(ev0.get(it.key))
    const flag = over[FLAG + it.key]
    const checked = flag === undefined || flag === '' ? natural !== 0 : Number(flag) === 1
    const label = it.label.split('|').map((k) => ev0.get(k)).filter((v) => v !== '' && v !== undefined).map((v) => String(v).trim().replace(/:$/, '')).join(' ').replace(/\s+/g, ' ').trim()
    if (!checked) zeroed[it.key] = 0
    lines.push({ key: it.key, label, natural, amount: checked ? natural : 0, checked })
  }
  const ev = makeEvaluator(sheet, zeroed)
  const tax = layout.taxKey ? num(ev.get(layout.taxKey)) : 0
  const credit = layout.creditKeys.reduce((s, k) => s + num(ev.get(k)), 0)
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const round = (n: number) => Math.round(n * 100) / 100
  const summary: StatementSummary = { lines, tax: round(tax), credit: round(credit), subtotal: round(subtotal), total: round(subtotal + tax - credit) }
  return { ev, ev0, summary }
}
