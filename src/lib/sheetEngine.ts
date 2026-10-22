/** A tiny spreadsheet engine for the Statement of Funeral Goods and Services forms: numbers, text, + - * /, SUM(), TODAY(). */

export type Raw = string | number | undefined
export interface SheetCell { s: number; v?: string | number; f?: string }
export interface SheetStyle {
  ff?: string; fs?: number; b?: 1; i?: 1; u?: 1; fc?: string; bg?: string
  bt?: [string, string]; bl?: [string, string]; bb?: [string, string]; br?: [string, string]
  ha?: string; va?: string; wr?: 1; rot?: number; ind?: number; nf?: string
}
export interface SheetDef {
  name: string
  fields: Record<string, string>
  cols: number[]; rows: number[]
  merges: number[][]
  styles: SheetStyle[]
  cells: Record<string, SheetCell>
  image: { from: number[]; to: number[] } | null
}

export const colLetter = (c: number): string => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26) }; return s }
const letterCol = (l: string): number => l.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0)
const refToKey = (ref: string): string | null => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref); return m ? `${m[2]},${letterCol(m[1])}` : null }

export const todaySerial = (): number => { const n = new Date(); return Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(1899, 11, 30)) / 86400000) }
export const serialToDate = (n: number): Date => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
export function dateToSerial(d: Date): number { return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000) }

type Val = number | string
const asNum = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : 0)

/** Works out every cell of a sheet. `over` holds what staff typed on this case (cell key -> value) and wins over the template. */
export function makeEvaluator(sheet: SheetDef, over: Record<string, Raw>) {
  const memo = new Map<string, Val>()
  const busy = new Set<string>()

  function getRaw(key: string): { kind: 'val'; v: Val } | { kind: 'f'; f: string } | null {
    if (key in over) {
      const o = over[key]
      if (o === undefined || o === '') return { kind: 'val', v: '' }
      if (typeof o === 'string' && o.startsWith('=')) return { kind: 'f', f: o.slice(1) }
      return { kind: 'val', v: o }
    }
    const c = sheet.cells[key]
    if (!c) return null
    if (c.f !== undefined) return { kind: 'f', f: c.f }
    return c.v === undefined ? null : { kind: 'val', v: c.v }
  }

  function get(key: string): Val {
    if (memo.has(key)) return memo.get(key)!
    if (busy.has(key)) return 0
    const r = getRaw(key)
    let out: Val = ''
    if (r?.kind === 'val') out = r.v
    else if (r?.kind === 'f') { busy.add(key); try { out = evalFormula(r.f) } catch { out = '#ERR' } busy.delete(key) }
    memo.set(key, out)
    return out
  }

  function evalFormula(src: string): Val {
    let i = 0
    const peek = () => src[i]
    const ws = () => { while (src[i] === ' ') i++ }
    function range(a: string, b: string): Val[] {
      const ka = refToKey(a), kb = refToKey(b)
      if (!ka || !kb) return []
      const [r1, c1] = ka.split(',').map(Number), [r2, c2] = kb.split(',').map(Number)
      const out: Val[] = []
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(get(`${r},${c}`))
      return out
    }
    function expr(): Val | Val[] {
      let l = term()
      for (ws(); peek() === '+' || peek() === '-' || peek() === '&'; ws()) {
        const op = src[i++]; const r = term()
        l = op === '&' ? String(scalar(l)) + String(scalar(r)) : op === '+' ? asNum(scalar(l)) + asNum(scalar(r)) : asNum(scalar(l)) - asNum(scalar(r))
      }
      return l
    }
    function term(): Val | Val[] {
      let l = factor()
      for (ws(); peek() === '*' || peek() === '/'; ws()) {
        const op = src[i++]; const r = factor()
        l = op === '*' ? asNum(scalar(l)) * asNum(scalar(r)) : (asNum(scalar(r)) === 0 ? 0 : asNum(scalar(l)) / asNum(scalar(r)))
      }
      return l
    }
    const scalar = (v: Val | Val[]): Val => (Array.isArray(v) ? (v[0] ?? 0) : v)
    function factor(): Val | Val[] {
      let v = atom()
      while (src[i] === '%') { i++; v = asNum(scalar(v)) / 100 }
      return v
    }
    function atom(): Val | Val[] {
      ws()
      if (peek() === '-') { i++; return -asNum(scalar(factor())) }
      if (peek() === '+') { i++; return factor() }
      if (peek() === '(') { i++; const v = expr(); ws(); if (peek() === ')') i++; return v }
      if (peek() === '"') { let s = ''; i++; while (i < src.length && src[i] !== '"') s += src[i++]; i++; return s }
      const num = /^\d+(\.\d+)?/.exec(src.slice(i))
      if (num) { i += num[0].length; return parseFloat(num[0]) }
      const id = /^\$?[A-Za-z]+\$?\d*(?:\.[A-Za-z]+)?/.exec(src.slice(i))
      if (!id) throw new Error('bad')
      i += id[0].length
      const name = id[0].toUpperCase()
      if (peek() === '(') {   // a function
        i++; const args: (Val | Val[])[] = []
        ws()
        while (peek() !== ')' && i < src.length) { args.push(expr()); ws(); if (peek() === ',') { i++; ws() } }
        i++
        const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]))
        if (name === 'SUM') return flat.reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0)
        if (name === 'TODAY') return todaySerial()
        if (name === 'ROUND') return Math.round(asNum(flat[0]) * 10 ** asNum(flat[1])) / 10 ** asNum(flat[1])
        if (name === 'MAX') return Math.max(...flat.map(asNum))
        if (name === 'MIN') return Math.min(...flat.map(asNum))
        throw new Error('fn')
      }
      if (peek() === ':') {   // a range
        i++; const b = /^\$?[A-Z]+\$?\d+/.exec(src.slice(i)); if (!b) throw new Error('range'); i += b[0].length
        return range(name, b[0])
      }
      const key = refToKey(name)
      if (!key) throw new Error('ref')
      return get(key)
    }
    const r = expr()
    return Array.isArray(r) ? (r[0] ?? 0) : r
  }

  return { get, isFormula: (key: string) => getRaw(key)?.kind === 'f' && !(key in over && !String(over[key]).startsWith('=')) }
}

// ---- showing values the way Excel does ----
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export type Shown = { kind: 'text'; text: string } | { kind: 'acct'; text: string; neg: boolean }

export function show(v: Val, nf: string | undefined): Shown {
  const f = nf ?? 'General'
  if (v === '' || v === undefined || v === null) return { kind: 'text', text: '' }
  if (f.includes('"$"')) {
    const n = asNum(v)
    if (typeof v === 'string' && isNaN(Number(v))) return { kind: 'text', text: v }
    if (n === 0) return { kind: 'acct', text: '-', neg: false }
    const t = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return { kind: 'acct', text: n < 0 ? `(${t})` : t, neg: n < 0 }
  }
  if (typeof v === 'number') {
    if (f.includes('mmmm')) { const d = serialToDate(v); return { kind: 'text', text: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` } }
    if (f.startsWith('mmm\\.')) { const d = serialToDate(v); return { kind: 'text', text: `${MONTHS[d.getUTCMonth()].slice(0, 3)}. ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}` } }
    if (f === 'mm-dd-yy') { const d = serialToDate(v); return { kind: 'text', text: `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}` } }
    if (f.includes('###\\-####')) {
      const s = String(Math.round(v)).replace(/\D/g, '')
      return { kind: 'text', text: s.length === 10 ? `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}` : s.length === 7 ? `${s.slice(0, 3)}-${s.slice(3)}` : s }
    }
    return { kind: 'text', text: Number.isInteger(v) ? String(v) : String(Math.round(v * 1e8) / 1e8) }
  }
  return { kind: 'text', text: String(v) }
}

/** What a typed entry means for a given cell: numbers, dates (for date-formatted cells) or plain text. */
export function parseEntry(text: string, nf: string | undefined): Raw {
  const t = text.trim()
  if (t === '') return ''
  if (t.startsWith('=')) return t
  const f = nf ?? 'General'
  const isDate = f.includes('mmm') || f === 'mm-dd-yy'
  if (isDate) {
    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t)
    if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return dateToSerial(new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])))) }
    const d = new Date(t + ' UTC'); if (!isNaN(d.getTime())) return dateToSerial(d)
  }
  if (f.includes('"$"') || f.includes('###\\-####') || f === 'General') {
    const n = Number(t.replace(/[$,\s()-]/g, '').replace(/^$/, 'x'))
    if (!isNaN(n) && /^[\d$,.\s()-]+$/.test(t)) return f.includes('###\\-####') ? Number(t.replace(/\D/g, '')) : (t.startsWith('(') || t.startsWith('-')) ? -Math.abs(n) : n
  }
  return t
}
