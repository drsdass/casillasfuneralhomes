import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canViewAllLocations } from '@/lib/permissions'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Check, Clock } from 'lucide-react'
import type { FuneralCase, CalendarEvent, Contract, StaffMember } from '@/types'

export default function TvBoard() {
  const { activeLocationId, currentUser } = useSession()
  const isAllLocations = currentUser ? canViewAllLocations(currentUser.role) : false
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Auto-refresh every 20s so a TV/monitor stays current without anyone touching it.
  const { data: cases = [] } = useQuery({
    queryKey: ['cases', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCases(isAllLocations ? undefined : activeLocationId),
    refetchInterval: 20_000,
  })
  const { data: events = [] } = useQuery({
    queryKey: ['events', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCalendarEvents(isAllLocations ? undefined : activeLocationId),
    refetchInterval: 20_000,
  })
  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: api.getContracts,
    refetchInterval: 20_000,
  })
  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff, refetchInterval: 20_000 })

  if (!currentUser) return null

  const activeCases = cases
    .filter((c) => c.status !== 'completed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <div className="min-h-screen bg-[#1f2a1c] text-white flex flex-col">
      <div className="no-print flex items-center justify-between px-6 py-3 bg-black/20">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
          <ArrowLeft size={15} /> Back
        </Link>
        <div className="flex items-center gap-3">
          <img src="/casillas-logo.png" alt="" className="h-8 w-auto brightness-0 invert opacity-90" />
          <span className="font-display text-lg font-semibold tracking-wide">Casillas Funeral Home</span>
        </div>
        <div className="text-sm text-slate-300 tabular-nums">
          {format(now, 'EEEE, MMMM d')} · {format(now, 'h:mm a')}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-sm uppercase tracking-wide text-[#d9c78f] border-b-2 border-[#4d5f45]">
              <th className="py-3 px-3">Name</th>
              <th className="py-3 px-3">Visitation</th>
              <th className="py-3 px-3">Service</th>
              <th className="py-3 px-3">Disp.</th>
              <th className="py-3 px-3">Flowers</th>
              <th className="py-3 px-3">Birds</th>
              <th className="py-3 px-3">Escort</th>
              <th className="py-3 px-3">Casket</th>
              <th className="py-3 px-3">Notes</th>
            </tr>
          </thead>
          <tbody className="text-base">
            {activeCases.map((c) => (
              <BoardRow key={c.id} c={c} events={events} contracts={contracts} allStaff={allStaff} />
            ))}
          </tbody>
        </table>
        {activeCases.length === 0 && (
          <div className="text-center text-slate-400 py-20">No active cases right now.</div>
        )}
      </div>
    </div>
  )
}

function OrderCell({ status }: { status: 'confirmed' | 'ordered' | 'pending' | null }) {
  if (status === 'confirmed') return <Check size={16} className="text-emerald-400" />
  if (status === 'ordered') return <Clock size={16} className="text-amber-400" />
  if (status === 'pending') return <span className="text-slate-400 text-xs">pending</span>
  return <span className="text-slate-500">—</span>
}

function BoardRow({ c, events, contracts, allStaff }: { c: FuneralCase; events: CalendarEvent[]; contracts: Contract[]; allStaff: StaffMember[] }) {
  const { data: orders = [] } = useQuery({
    queryKey: ['case-orders', c.id],
    queryFn: () => api.getOrders(c.id),
    refetchInterval: 20_000,
  })
  const { data: notes = [] } = useQuery({
    queryKey: ['case-notes', c.id],
    queryFn: () => api.getCaseNotes(c.id),
    refetchInterval: 20_000,
  })

  const visitation = events.find((e) => e.caseId === c.id && e.type === 'visitation')
  const service = events.find((e) => e.caseId === c.id && e.type === 'service')
  const contract = contracts.find((ct) => ct.caseId === c.id)
  const casketLine = contract?.lineItems.find((li) => /casket/i.test(li.name))

  const flowers = orders.find((o) => /flower/i.test(o.item))?.status ?? null
  const birds = orders.find((o) => /dove|bird/i.test(o.item))?.status ?? null
  const escort = orders.find((o) => /escort|carriage/i.test(o.item))?.status ?? null

  // Kept separate per event on purpose — the visitation team and service
  // team are often genuinely different people, and staff glancing at the
  // board want to know who's on which, not a merged list.
  const visitationStaff = (visitation?.participantIds ?? []).map((id) => allStaff.find((s) => s.id === id)?.name).filter(Boolean) as string[]
  const serviceStaff = (service?.participantIds ?? []).map((id) => allStaff.find((s) => s.id === id)?.name).filter(Boolean) as string[]

  const latestNote = notes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <tr className="border-b border-white/10 hover:bg-white/5">
      <td className="py-3 px-3 font-semibold whitespace-nowrap">
        <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: c.color }} />
        {c.decedent.lastName}, {c.decedent.firstName}
      </td>
      <td className="py-3 px-3 text-slate-200">
        {visitation ? (
          <>
            <div>{format(parseISO(visitation.start), 'M/d')} {format(parseISO(visitation.start), 'h:mma')}–{format(parseISO(visitation.end), 'h:mma')}</div>
            {visitationStaff.length > 0 && <div className="text-xs text-slate-400 font-normal mt-0.5">{visitationStaff.join(', ')}</div>}
          </>
        ) : '—'}
      </td>
      <td className="py-3 px-3 text-slate-200">
        {c.serviceDate || service ? (
          <>
            <div>{c.serviceDate ? format(parseISO(c.serviceDate), 'M/d h:mm a') : format(parseISO(service!.start), 'M/d h:mm a')}</div>
            {serviceStaff.length > 0 && <div className="text-xs text-slate-400 font-normal mt-0.5">{serviceStaff.join(', ')}</div>}
          </>
        ) : '—'}
      </td>
      <td className="py-3 px-3 text-slate-200 capitalize">{c.disposition.replace('_', ' ')}</td>
      <td className="py-3 px-3"><OrderCell status={flowers as 'confirmed' | 'ordered' | 'pending' | null} /></td>
      <td className="py-3 px-3"><OrderCell status={birds as 'confirmed' | 'ordered' | 'pending' | null} /></td>
      <td className="py-3 px-3"><OrderCell status={escort as 'confirmed' | 'ordered' | 'pending' | null} /></td>
      <td className="py-3 px-3 text-slate-200">{casketLine?.name.replace(/^Adult Casket\s*—\s*/i, '') ?? '—'}</td>
      <td className="py-3 px-3 text-slate-300 text-sm max-w-[220px] truncate" title={latestNote?.body}>
        {latestNote ? latestNote.body : <span className="text-slate-500">—</span>}
      </td>
    </tr>
  )
}
