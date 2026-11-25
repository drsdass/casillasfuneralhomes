import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Primitives'
import type { AuditLogEntry } from '@/types'

const TZ = 'America/Los_Angeles'
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const timeOf = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const prettyDay = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

/** Plain-language bucket for one log entry. */
function kind(e: AuditLogEntry): 'invoice' | 'schedule' | 'note' | 'custody' | 'document' | 'case' | 'other' {
  if (e.entityType === 'contract' || e.entityType === 'payment') return 'invoice'
  if (e.entityType === 'event') return /^Scheduled/i.test(e.summary) ? 'schedule' : 'case'
  if (e.entityType === 'note') return 'note'
  if (e.entityType === 'custody') return 'custody'
  if (e.entityType === 'document' || e.entityType === 'signature_request') return 'document'
  if (e.entityType === 'case') return 'case'
  return 'other'
}
const WORDS: Record<string, [string, string]> = {
  invoice: ['invoice save', 'invoice saves'], schedule: ['event scheduled', 'events scheduled'], note: ['note', 'notes'],
  custody: ['custody move', 'custody moves'], document: ['document action', 'document actions'], case: ['case update', 'case updates'], other: ['other change', 'other changes'],
}

/** One day, one card per person: which cases they touched and what they did there. */
export function StaffDaySummary({ entries }: { entries: AuditLogEntry[] }) {
  const today = dayKey(new Date().toISOString())
  const [day, setDay] = useState(today)
  const people = useMemo(() => {
    const dayEntries = entries.filter((e) => e.changedBy && dayKey(e.timestamp) === day)
    const by = new Map<string, AuditLogEntry[]>()
    for (const e of dayEntries) by.set(e.changedByName, [...(by.get(e.changedByName) ?? []), e])
    return [...by.entries()].map(([name, list]) => {
      const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      const cases = new Map<string, { label: string; items: AuditLogEntry[] }>()
      for (const e of sorted) {
        const k = e.caseId ?? 'none'
        const label = e.caseName ?? 'Not tied to a case'
        const cur = cases.get(k) ?? { label, items: [] }
        cur.items.push(e); cases.set(k, cur)
      }
      const rows = [...cases.values()].map((c) => {
        const counts: Record<string, number> = {}
        c.items.forEach((e) => { const k = kind(e); counts[k] = (counts[k] ?? 0) + 1 })
        const what = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${WORDS[k][n === 1 ? 0 : 1]}`)
        const scheduled = c.items.filter((e) => kind(e) === 'schedule').map((e) => e.summary.replace(/^Scheduled\s*/i, '').replace(/"/g, ''))
        return { label: c.label, n: c.items.length, from: timeOf(c.items[0].timestamp), to: timeOf(c.items[c.items.length - 1].timestamp), what, scheduled }
      })
      return { name, total: sorted.length, first: timeOf(sorted[0].timestamp), last: timeOf(sorted[sorted.length - 1].timestamp), rows, devices: [...new Set(sorted.map((e) => e.device).filter(Boolean))] as string[] }
    }).sort((a, b) => b.total - a.total)
  }, [entries, day])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="text-slate-600">Day <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="ml-2 border border-slate-200 rounded-md px-2 py-1" /></label>
        <span className="text-slate-500">{prettyDay(day)} · Pacific time</span>
      </div>
      {people.length === 0 && <Card><div className="p-8 text-center text-slate-400 text-sm">Nothing recorded for this day.</div></Card>}
      {people.map((p) => {
        const max = Math.max(...p.rows.map((r) => r.n))
        return (
          <Card key={p.name}>
            <div className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{p.name}</h3>
                <div className="text-xs text-slate-500">{p.rows.filter((r) => r.label !== 'Not tied to a case').length} cases · {p.total} entries · {p.first} – {p.last}{p.devices.length > 0 && ` · ${p.devices.join(', ')}`}</div>
              </div>
              <div className="mt-3 space-y-2.5">
                {p.rows.map((r) => (
                  <div key={r.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">{r.label}</span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{r.from}{r.from !== r.to ? ` – ${r.to}` : ''}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#b3925a]" style={{ width: `${Math.max(6, (r.n / max) * 100)}%` }} /></div>
                    <div className="mt-1 text-xs text-slate-500">{r.what.join(' · ')}{r.scheduled.length > 0 && <span className="text-slate-700"> — scheduled {r.scheduled.join(', ')}</span>}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )
      })}
      <p className="text-xs text-slate-400">Counts are saves, not separate changes — every time an invoice line is changed and saved it adds an entry.</p>
    </div>
  )
}
