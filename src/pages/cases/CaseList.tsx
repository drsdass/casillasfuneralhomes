import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canViewAllLocations } from '@/lib/permissions'
import { Card, SectionHeading, CaseStatusBadge } from '@/components/ui/Primitives'
import { Search, Upload, Phone } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import type { CaseStatus } from '@/types'

const statusFilters: { value: CaseStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
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
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const isAllLocations = currentUser ? canViewAllLocations(currentUser.role) : false

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['cases', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCases(isAllLocations ? undefined : activeLocationId),
  })

  if (!currentUser) return null

  const locationName = (id: string) => accessibleLocations.find((l) => l.id === id)?.name ?? id

  const filtered = cases.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${c.decedent.firstName} ${c.decedent.lastName}`.toLowerCase()
      if (!name.includes(q) && !c.caseNumber.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
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
        </div>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-medium">Decedent</th>
              <th className="px-4 py-3 font-medium">Case #</th>
              {isAllLocations && <th className="px-4 py-3 font-medium">Location</th>}
              <th className="px-4 py-3 font-medium">Disposition</th>
              <th className="px-4 py-3 font-medium">Service Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-3">
                  <Link to={`/cases/${c.id}`} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="font-medium text-slate-900">{c.decedent.firstName} {c.decedent.lastName}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{c.caseNumber}</td>
                {isAllLocations && <td className="px-4 py-3 text-slate-500">{locationName(c.locationId)}</td>}
                <td className="px-4 py-3 text-slate-500 capitalize">{c.disposition}</td>
                <td className="px-4 py-3 text-slate-500">
                  {c.serviceDate ? new Date(c.serviceDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3"><CaseStatusBadge status={c.status} /></td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No cases match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
    <ActivityPanel entityType="case" title="Recent Case Activity" />
    </div>
  )
}
