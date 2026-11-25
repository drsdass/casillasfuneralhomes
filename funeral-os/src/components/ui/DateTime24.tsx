import { useEffect, useState } from 'react'

const sel = 'border border-slate-200 rounded-md px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#b3925a]'
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
const MINS_FINE = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

/** Hour (00–23) and minute pair — always 24-hour, whatever the computer's own setting is. value / onChange use "HH:mm" ('' when empty). */
export function Time24({ value, onChange, required, label, fine }: { value: string; onChange: (v: string) => void; required?: boolean; label?: string; fine?: boolean }) {
  const [h, m] = value ? value.split(':') : ['', '']
  const base = fine ? MINS_FINE : MINS
  const mins = m && !base.includes(m) ? [...base, m].sort() : base
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <select aria-label={`${label ?? 'Time'} hour`} required={required} value={h} onChange={(e) => onChange(e.target.value ? `${e.target.value}:${m || '00'}` : '')} className={sel}>
        <option value="">--</option>
        {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="text-slate-400">:</span>
      <select aria-label={`${label ?? 'Time'} minutes`} value={m} disabled={!h} onChange={(e) => onChange(`${h}:${e.target.value}`)} className={sel}>
        {!h && <option value="">--</option>}
        {mins.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  )
}

/** Date plus a 24-hour time. value / onChange use "YYYY-MM-DDTHH:mm" — the same string a datetime-local box uses. */
export function DateTime24({ value, onChange, required, label, inputClass }: { value: string; onChange: (v: string) => void; required?: boolean; label?: string; inputClass: string }) {
  const [date, setDate] = useState(value.slice(0, 10))
  const [time, setTime] = useState(value.slice(11, 16))
  useEffect(() => { setDate(value.slice(0, 10)); setTime(value.slice(11, 16)) }, [value])
  const emit = (d: string, t: string) => onChange(d ? `${d}T${t || '00:00'}` : '')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" required={required} value={date} onChange={(e) => { setDate(e.target.value); emit(e.target.value, time) }} className={inputClass + ' !w-auto flex-1 min-w-[9rem]'} aria-label={`${label ?? 'Date'} date`} />
      <Time24 value={time} label={label} required={required} onChange={(t) => { setTime(t); emit(date, t) }} />
    </div>
  )
}
