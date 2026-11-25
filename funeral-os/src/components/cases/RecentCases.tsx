import { Link } from 'react-router-dom'
import { Clock, Star } from 'lucide-react'
import { useCaseShortcuts } from '@/lib/caseShortcuts'
import type { FuneralCase } from '@/types'

/** The last five cases this person opened, one click away. Starred cases stay here until unstarred. */
export function RecentCases({ cases, userId }: { cases: FuneralCase[]; userId: string }) {
  const { recent, pinned } = useCaseShortcuts(userId)
  const byId = new Map(cases.map((c) => [c.id, c]))
  const starred = pinned.map((id) => byId.get(id)).filter((c): c is FuneralCase => !!c)
  const lately = recent.map((r) => byId.get(r.id)).filter((c): c is FuneralCase => !!c && !pinned.includes(c.id)).slice(0, 5)
  if (starred.length === 0 && lately.length === 0) return null
  const chip = (c: FuneralCase, star: boolean) => (
    <Link key={c.id} to={`/cases/${c.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50">
      {star ? <Star size={13} className="fill-amber-400 text-amber-500" /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />}
      <span className="font-medium text-slate-900">{c.decedent.firstName} {c.decedent.lastName}</span>
      <span className="text-xs text-slate-400">{c.caseNumber}</span>
    </Link>
  )
  return (
    <div className="mb-4 space-y-2 rounded-md border border-slate-200 bg-slate-50/60 p-3">
      {starred.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-700"><Star size={12} /> Starred</span>{starred.map((c) => chip(c, true))}</div>}
      {lately.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock size={12} /> Recently opened</span>{lately.map((c) => chip(c, false))}</div>}
    </div>
  )
}
