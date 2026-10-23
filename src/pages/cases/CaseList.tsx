import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canViewAllLocations } from '@/lib/permissions'
import { Card, SectionHeading, CaseStatusBadge, CustodyChip } from '@/components/ui/Primitives'
import { Search, Upload, Phone } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import type { CaseStatus } from '@/types'
import { FilePlus2, Copy } from 'lucide-react'
import { findDuplicateGroups } from '@/lib/duplicates'
import { shortLocationName } from '@/lib/company'
import { useWorkflowFor } from '@/lib/useWorkflow'
import { MiniTrack } from '@/components/workflow/WorkflowTrack'

const statusFilters: { value: CaseStatus | 'all' | 'pre_need'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pre_need', label: 'Pre-Need' },
  { value: 'first_call', label: 'First Call' },
  { value: 'arrangement_pending', label: 'Arrangement Pending' },
  { value: 'arrangement_scheduled', label: 'Arrangement Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'service_scheduled', label: 'Service Scheduled' },
  { value: 'completed', label: 'Completed' },
]

export default function CaseList() {
  const { activeLocationId, accessibleLocations, currentUser } = useSession()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all' | 'pre_need'>('all')
  const [search, setSearch] = useState('')
  const [needsOnly, setNeedsOnly] = useState(false)
  const workflowFor = useWorkflowFor()
  // Everyone sees the cases of every location of their company — each one labelled with its location.
  const isAllLocations = true
  const [locFilter, setLocFilter] = useState<string>('all')
  const [showDupes, setShowDupes] = useState(false)

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['cases', 'all'],
    queryFn: () => api.getCases(),
  })

  if (!currentUser) return null

  const locationName = (id: string) => accessibleLocations.find((l) => l.id === id)?.name ?? id

  const companyLocIds = new Set(accessibleLocations.map((l) => l.id))
  const LOC_COLORS = ['bg-emerald-50 text-emerald-800 border-emerald-200', 'bg-amber-50 text-amber-800 border-amber-200', 'bg-sky-50 text-sky-800 border-sky-200', 'bg-violet-50 text-violet-800 border-violet-200']
  const locColor = (id: string) => LOC_COLORS[Math.max(0, accessibleLocations.findIndex((l) => l.id === id)) % LOC_COLORS.length]
  const inCompany = cases.filter((c) => companyLocIds.has(c.locationId))

  const dupGroups = findDuplicateGroups(inCompany)
  const filtered = inCompany.filter((c) => {
    if (locFilter !== 'all' && c.locationId !== locFilter) return false
    if (statusFilter === 'pre_need') { if (c.type !== 'pre_need') return false }
    else if (statusFilter !== 'all' && (c.status !== statusFilter || c.type === 'pre_need')) return false
    if (needsOnly && (c.status === 'completed' || workflowFor(c).allDone)) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${c.decedent.firstName} ${c.decedent.lastName}`.toLowerCase()
      if (!name.includes(q) && !c.caseNumber.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    // Open cases first (new first calls with no dates, then soonest service); completed cases last, most recent first.
    const done = (c: typeof a) => (c.status === 'completed' ? 1 : 0)
    if (done(a) !== done(b)) return done(a) - done(b)
    const when = (c: typeof a) => {
      const d = c.serviceDate ?? c.visitationDate
      return d ? new Date(d).getTime() : null
    }
    const created = (c: typeof a) => new Date(c.createdAt ?? 0).getTime()
    const wa = when(a), wb = when(b)
    if (done(a) === 1) return (wb ?? created(b)) - (wa ?? created(a))
    if (wa === null && wb === null) return created(b) - created(a)
    if (wa === null) return -1
    if (wb === null) return 1
    return wa - wb
  })

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
    <div className="min-w-0">
      <SectionHeading
        title="Cases"
        subtitle={`${filtered.length} case${filtered.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/cases/upload')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-3.5 py-2 hover:bg-[#3b4a35]/5 transition"
            >
              <Upload size={16} /> Upload Document
            </button>
            <button
              onClick={() => navigate('/cases/new?type=pre_need&quote=1')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 border border-amber-300 bg-amber-50 rounded-md px-3.5 py-2 hover:bg-amber-100 transition"
            >
              <FilePlus2 size={16} /> New Quote
            </button>
            <button
              onClick={() => navigate('/cases/new?type=pre_need')}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-800 border border-violet-300 bg-violet-50 rounded-md px-3.5 py-2 hover:bg-violet-100 transition"
            >
              <FilePlus2 size={16} /> New Pre-Need
            </button>
            <button
              onClick={() => navigate('/cases/first-call')}
              className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition"
            >
              <Phone size={16} /> First Call
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or case #"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
          />
        </div>
        <button onClick={() => setShowDupes((v) => !v)} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border ${showDupes ? 'bg-amber-100 border-amber-300 text-amber-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Copy size={12} /> Check for duplicates{dupGroups.length ? ` (${dupGroups.length})` : ''}</button>
        {accessibleLocations.length > 1 && (
          <div className="flex gap-1 flex-wrap" aria-label="Location">
            <button onClick={() => setLocFilter('all')} className={`text-xs px-2.5 py-1.5 rounded-md border transition ${locFilter === 'all' ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>All locations ({inCompany.length})</button>
            {accessibleLocations.map((l) => (
              <button key={l.id} onClick={() => setLocFilter(l.id)} className={`text-xs px-2.5 py-1.5 rounded-md border transition ${locFilter === l.id ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{shortLocationName(l.name)} ({inCompany.filter((c) => c.locationId === l.id).length})</button>
            ))}
          </div>
        )}
        <div className="flex gap-1 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition ${
                statusFilter === f.value
                  ? 'bg-[#3b4a35] text-white border-[#3b4a35]'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button onClick={() => setNeedsOnly((v) => !v)} className={`text-xs px-2.5 py-1.5 rounded-md border transition ${needsOnly ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-700 hover:bg-red-50'}`}>Needs attention</button>
        </div>
      </div>

      {showDupes && (
        <Card className="p-4 mb-4 border-amber-200 bg-amber-50/50">
          <div className="text-sm font-semibold text-slate-800">Possible duplicates</div>
          {dupGroups.length === 0 ? <p className="text-sm text-slate-600 mt-1">None found — no two cases share a name (in either order).</p> : (
            <div className="mt-2 space-y-2.5">
              {dupGroups.map((g) => (
                <div key={g.cases[0].id} className="text-sm">
                  <div className="text-xs text-amber-800">{g.reasons.join(', ')}</div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {g.cases.map((c) => (
                      <Link key={c.id} to={`/cases/${c.id}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50">
                        <span className="font-medium">{c.decedent.firstName} {c.decedent.lastName}</span>
                        <span className="text-slate-500"> · {c.caseNumber} · {c.status.replace(/_/g, ' ')}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">Open the copy you don't want, then use Delete (admins only). It asks three times.</p>
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="px-3 py-3 font-medium">Decedent</th>
              <th className="px-3 py-3 font-medium">Case #{isAllLocations ? ' / Location' : ''}</th>
              <th className="px-3 py-3 font-medium">Disposition</th>
              <th className="px-3 py-3 font-medium">Service Date</th>
              <th className="px-3 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-3 py-3">
                  <Link to={`/cases/${c.id}`} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="font-medium text-slate-900">{c.decedent.firstName} {c.decedent.lastName}</span>
                    {c.familyUnseen && <span title="The family added something in their portal" className="ml-1.5 text-[11px] font-semibold text-white bg-emerald-600 rounded-full px-2 py-0.5">Family updated</span>}
                    {c.obituaryCompleted && <span title="Obituary completed" className="ml-1.5 text-emerald-600 text-xs">✓ obit</span>}
                  </Link>
                  <Link to={`/cases/${c.id}`} className="block mt-1.5 ml-4"><MiniTrack wf={workflowFor(c)} /></Link>
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{c.caseNumber}<div className={`mt-1 inline-block text-[11px] font-medium border rounded-full px-2 py-0.5 ${locColor(c.locationId)}`}>{shortLocationName(locationName(c.locationId))}</div></td>
                <td className="px-3 py-3 text-slate-500 capitalize">{c.disposition}</td>
                <td className="px-3 py-3 text-slate-500">
                  {c.serviceDate ? new Date(c.serviceDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-3"><span className="inline-flex flex-wrap items-center gap-1.5"><CaseStatusBadge status={c.status} /><CustodyChip stage={c.custodyStage} preNeed={c.type === 'pre_need'} /></span></td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No cases match your filters.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
    <ActivityPanel entityType="case" title="Recent Case Activity" />
    </div>
  )
}
