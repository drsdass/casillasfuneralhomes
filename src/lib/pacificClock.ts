/**
 * Pacific business clock.
 *
 * Casillas runs on Pacific time. Without this, every screen shows times in whatever zone the DEVICE is set to, and a form
 * reads the time you type as a time on that device's clock — so a staff member in New York who types "10:00 AM" for a
 * Pacific service saves 7:00 AM Pacific, and the office TV shows the wrong hour.
 *
 * This makes the browser's "local time" be Pacific for this app (display, typing in forms, "today", the TV board).
 * Stored times are untouched: they are real moments in time, so nothing already saved shifts.
 * If the device is already on Pacific time it does nothing.
 */
export const BUSINESS_TZ = 'America/Los_Angeles'

const NativeDate = Date
const NativeDTF = Intl.DateTimeFormat

// Built once, from the real Intl, before anything is patched.
const parts = new NativeDTF('en-US', {
  timeZone: BUSINESS_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
})
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

interface P { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: number }
let lastT = NaN
let lastP: P | null = null
function pacificParts(t: number): P {
  if (t === lastT && lastP) return lastP
  const o: Record<string, string> = {}
  for (const x of parts.formatToParts(t)) o[x.type] = x.value
  const p = { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WEEKDAY[o.weekday] ?? 0 }
  lastT = t; lastP = p
  return p
}
/** Pacific offset from UTC in milliseconds (negative) at instant t. */
function offsetMs(t: number): number {
  const p = pacificParts(t)
  return NativeDate.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
}
/** A Pacific wall-clock time (month 0-based, any overflow allowed) → the real instant. */
function pacificToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number {
  const guess = NativeDate.UTC(y, mo, d, h, mi, s, ms)
  if (Number.isNaN(guess)) return NaN
  const first = guess - offsetMs(guess)
  return guess - offsetMs(first)          // once more, in case the first guess crossed a clock change
}

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/   // date + time with no zone → a wall-clock time
function parseNaive(s: string): number | null {
  const m = NAIVE.exec(s.trim())
  if (!m) return null
  return pacificToUtc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0, m[7] ? +m[7].padEnd(3, '0') : 0)
}

function deviceAlreadyPacific(): boolean {
  try {
    if (new NativeDTF().resolvedOptions().timeZone === BUSINESS_TZ) return true
    // Same offsets all year (e.g. an alias for Pacific) → also fine.
    const year = new NativeDate().getFullYear()
    for (let m = 0; m < 12; m++) {
      const t = NativeDate.UTC(year, m, 15, 12)
      if (new NativeDate(t).getTimezoneOffset() !== -offsetMs(t) / 60000) return false
    }
    return true
  } catch { return false }
}

export function installPacificClock(): void {
  if ((globalThis as any).__pacificClock || deviceAlreadyPacific()) return
  ;(globalThis as any).__pacificClock = true
  const proto = NativeDate.prototype as any
  const tv = (d: Date) => NativeDate.prototype.getTime.call(d) as number

  // --- local-time readers
  const readers: Record<string, (p: P) => number> = {
    getFullYear: (p) => p.y, getMonth: (p) => p.mo - 1, getDate: (p) => p.d, getDay: (p) => p.wd,
    getHours: (p) => p.h, getMinutes: (p) => p.mi, getSeconds: (p) => p.s,
  }
  for (const [name, fn] of Object.entries(readers)) {
    proto[name] = function (this: Date) { const t = tv(this); return Number.isNaN(t) ? NaN : fn(pacificParts(t)) }
  }
  proto.getTimezoneOffset = function (this: Date) { const t = tv(this); return Number.isNaN(t) ? NaN : -offsetMs(t) / 60000 }

  // --- local-time writers
  const writer = (apply: (c: number[], a: number[]) => void, canFixNaN = false) => function (this: Date, ...args: number[]) {
    let t = tv(this)
    if (args.length === 0) { this.setTime(NaN); return NaN }
    if (Number.isNaN(t)) { if (!canFixNaN) return NaN; t = 0 }
    const p = pacificParts(t)
    const c = [p.y, p.mo - 1, p.d, p.h, p.mi, p.s, ((t % 1000) + 1000) % 1000]
    apply(c, args)
    const out = pacificToUtc(c[0], c[1], c[2], c[3], c[4], c[5], c[6])
    this.setTime(out)
    return out
  }
  proto.setFullYear = writer((c, a) => { c[0] = a[0]; if (a[1] !== undefined) c[1] = a[1]; if (a[2] !== undefined) c[2] = a[2] }, true)
  proto.setMonth = writer((c, a) => { c[1] = a[0]; if (a[1] !== undefined) c[2] = a[1] })
  proto.setDate = writer((c, a) => { c[2] = a[0] })
  proto.setHours = writer((c, a) => { c[3] = a[0]; if (a[1] !== undefined) c[4] = a[1]; if (a[2] !== undefined) c[5] = a[2]; if (a[3] !== undefined) c[6] = a[3] })
  proto.setMinutes = writer((c, a) => { c[4] = a[0]; if (a[1] !== undefined) c[5] = a[1]; if (a[2] !== undefined) c[6] = a[2] })
  proto.setSeconds = writer((c, a) => { c[5] = a[0]; if (a[1] !== undefined) c[6] = a[1] })

  // --- text forms
  const wrapLocale = (name: 'toLocaleString' | 'toLocaleDateString' | 'toLocaleTimeString') => {
    const orig = proto[name]
    proto[name] = function (this: Date, loc?: any, opts?: any) { return orig.call(this, loc, opts && opts.timeZone ? opts : { ...(opts ?? {}), timeZone: BUSINESS_TZ }) }
  }
  wrapLocale('toLocaleString'); wrapLocale('toLocaleDateString'); wrapLocale('toLocaleTimeString')
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  proto.toDateString = function (this: Date) {
    const t = tv(this); if (Number.isNaN(t)) return 'Invalid Date'
    const p = pacificParts(t)
    return `${DAYS[p.wd]} ${MONTHS[p.mo - 1]} ${String(p.d).padStart(2, '0')} ${String(p.y).padStart(4, '0')}`
  }

  // --- constructors / parsing
  const parseOrig = NativeDate.parse
  const patchedParse = (s: string) => { const n = typeof s === 'string' ? parseNaive(s) : null; return n ?? parseOrig(s) }
  const P = new Proxy(NativeDate, {
    construct(target, args, nt) {
      let a = args as any[]
      if (a.length === 1 && typeof a[0] === 'string') {
        const n = parseNaive(a[0]); if (n !== null) a = [n]
      } else if (a.length >= 2) {
        const [y, mo, d = 1, h = 0, mi = 0, s = 0, ms = 0] = a.map((x) => Number(x))
        const yy = y >= 0 && y <= 99 ? 1900 + y : y
        a = [pacificToUtc(yy, mo, d, h, mi, s, ms)]
      }
      return Reflect.construct(target, a, nt)
    },
    apply(target) { return (target as any)() },
    get(target, key, recv) { return key === 'parse' ? patchedParse : Reflect.get(target, key, recv) },
  })
  ;(globalThis as any).Date = P
  proto.constructor = P

  // --- Intl formatting (date-fns' format() uses the getters above; this covers direct Intl users)
  ;(Intl as any).DateTimeFormat = new Proxy(NativeDTF, {
    construct(target, args, nt) { const [l, o] = args; return Reflect.construct(target, [l, o && o.timeZone ? o : { ...(o ?? {}), timeZone: BUSINESS_TZ }], nt) },
    apply(target, _t, args) { const [l, o] = args as any[]; return (target as any)(l, o && o.timeZone ? o : { ...(o ?? {}), timeZone: BUSINESS_TZ }) },
  })
}
