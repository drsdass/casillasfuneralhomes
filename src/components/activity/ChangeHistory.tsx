import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { api, type ChangeLogEntry } from '@/lib/api'

const TABLES: Record<string, string> = {
  cases: 'Case', case_contacts: 'Contact', case_documents: 'Document', case_notes: 'Note', case_quotes: 'Quote',
  case_statements: 'Statement form', case_tasks: 'Task', calendar_events: 'Visitation / service', contracts: 'Contract',
  contract_line_items: 'Contract item', custody_log: 'Custody move', families: 'Family', gpl_items: 'Price list item',
  obituaries: 'Obituary', payments: 'Payment', quick_quotes: 'Quick quote', service_orders: 'Order',
  staff_members: 'Staff member', task_templates: 'Task template', vendors: 'Vendor',
}
const VERB = { insert: 'Added', update: 'Changed', delete: 'Deleted' } as const

const nice = (k: string) => k.split('.').map((p) => p.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')).join(' › ').replace(/^./, (c) => c.toUpperCase())
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(blank)'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Who changed what, field by field (old → new). Admin-only; the database enforces that. */
export function ChangeHistory({ caseId, limit = 1500, compact = false }: { caseId?: string; limit?: number; compact?: boolean }) {
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['change-log', caseId, limit], queryFn: () => api.getChangeLog({ caseId, limit }) })
  const [who, setWho] = useState('')
  const [what, setWhat] = useState('')
  const [q, setQ] = useState('')
  const people = useMemo(() => [...new Set(data.map((d) => d.who))].sort(), [data])
  const rows = useMemo(() => data.filter((d) =>
    (!who || d.who === who) && (!what || d.table === what) &&
    (!q || `${d.label} ${d.caseName ?? ''} ${JSON.stringify(d.changes)}`.toLowerCase().includes(q.toLowerCase()))
  ), [data, who, what, q])

  if (isLoading) return <div className="py-6 text-center text-sm text-slate-400">Loading…</div>
  if (isError) return <div className="py-6 text-center text-sm text-slate-500">Detailed history is only available to admins.</div>
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5"><option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={what} onChange={(e) => setWhat(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5"><option value="">Everything</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, field or value…" className="min-w-[14rem] flex-1 rounded border border-slate-300 px-2 py-1.5" />
      </div>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">No detailed changes recorded yet. Every edit from now on shows up here with the old and new value.</div>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, compact ? 40 : 400).map((r: ChangeLogEntry) => {
            const entries = Object.entries(r.changes).filter(([k]) => k !== '_more') as [string, { old: unknown; new: unknown }][]
            const more = typeof r.changes._more === 'number' ? r.changes._more : 0
            return (
              <div key={r.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">{r.who}</span>
                  <span>{format(parseISO(r.at), 'MMM d, yyyy h:mm:ss a')}</span>
                  {!caseId && r.caseName && <span className="text-slate-600">· {r.caseName}</span>}
                </div>
                <div className="mt-1 text-slate-900">
                  <span className={r.action === 'delete' ? 'font-semibold text-red-700' : 'font-semibold'}>{VERB[r.action]}</span>{' '}
                  {TABLES[r.table] ?? r.table}{r.label ? <> — <span className="font-medium">{r.label}</span></> : null}
                </div>
                {entries.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {entries.slice(0, r.action === 'update' ? 60 : 8).map(([k, v]) => (
                      <li key={k} className="text-slate-600">
                        <span className="font-medium text-slate-700">{nice(k)}:</span>{' '}
                        {r.action === 'update' && <><span className="text-red-700 line-through decoration-red-300">{show(v.old)}</span> → </>}
                        <span className={r.action === 'delete' ? 'text-red-700' : 'text-emerald-700'}>{show(r.action === 'delete' ? v.old : v.new)}</span>
                      </li>
                    ))}
                    {r.action !== 'update' && entries.length > 8 && <li className="text-slate-400">+ {entries.length - 8} more fields</li>}
                    {more > 0 && <li className="text-slate-400">+ {more} more changes not shown</li>}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
