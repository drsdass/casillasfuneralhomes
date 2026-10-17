import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import { canEditCases, canViewAllLocations } from '@/lib/permissions'
import { CUSTODY_STAGES, CUSTODY_STAGE_LABELS, type CustodyStage, type FuneralCase } from '@/types'
import { format, parseISO } from 'date-fns'
import { History, GripVertical, X, ArrowDownUp, Search, ChevronRight, ChevronDown } from 'lucide-react'

const stageAccent: Record<CustodyStage, string> = {
  scene_first_call: '#b04545',
  in_transit: '#b3925a',
  funeral_home: '#3b4a35',
  chapel_service: '#5f6f4f',
  crematory: '#8b5e34',
  ashes_received: '#6b5a3f',
  cemetery_burial: '#4a5568',
  shipped_released: '#2f4a3f',
  completed: '#1f2a1c',
}

type SortMode = 'newest' | 'oldest' | 'name'

// A long column (every finished case, for example) is filed under Year > Month so it can be folded away.
const GROUP_THRESHOLD = 12
const monthKey = (c: FuneralCase): string => (c.decedent.dateOfDeath || c.createdAt || c.updatedAt || '').slice(0, 7) || 'undated'
function groupByYearMonth(rows: FuneralCase[]): { year: string; months: { key: string; label: string; rows: FuneralCase[] }[]; total: number }[] {
  const byYear = new Map<string, Map<string, FuneralCase[]>>()
  for (const c of rows) {
    const k = monthKey(c)
    const year = k === 'undated' ? 'Undated' : k.slice(0, 4)
    if (!byYear.has(year)) byYear.set(year, new Map())
    const m = byYear.get(year)!
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(c)
  }
  return Array.from(byYear.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => ({
      year,
      total: Array.from(months.values()).reduce((n, r) => n + r.length, 0),
      months: Array.from(months.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([key, r]) => ({
        key, rows: r,
        label: key === 'undated' ? 'No date' : format(parseISO(`${key}-01`), 'MMMM'),
      })),
    }))
}

const sortLabels: Record<SortMode, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name A–Z',
}

export default function CustodyBoard() {
  const { activeLocationId, currentUser } = useSession()
  const isAllLocations = currentUser ? canViewAllLocations(currentUser.role) : false
  const queryClient = useQueryClient()
  const [dragCaseId, setDragCaseId] = useState<string | null>(null)
  const [selectedCase, setSelectedCase] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [search, setSearch] = useState('')
  const [phoneStage, setPhoneStage] = useState<CustodyStage>('scene_first_call') // phone: one column at a time
  const [open, setOpen] = useState<Set<string>>(() => new Set([format(new Date(), 'yyyy'), format(new Date(), 'yyyy-MM')])) // current year and month start unfolded
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  const canEdit = currentUser ? canEditCases(currentUser.role) : false

  const { data: cases = [] } = useQuery({
    queryKey: ['cases', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCases(isAllLocations ? undefined : activeLocationId),
  })

  const { data: log = [] } = useQuery({
    queryKey: ['custody-log', selectedCase],
    queryFn: () => api.getCustodyLog(selectedCase ?? undefined),
    enabled: !!selectedCase,
  })

  const moveMutation = useMutation({
    mutationFn: ({ caseId, toStage }: { caseId: string; toStage: CustodyStage }) =>
      api.moveCustody(caseId, toStage, currentUser!, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
      queryClient.invalidateQueries({ queryKey: ['custody-log'] })
    },
  })

  function handleDrop(stage: CustodyStage) {
    if (!dragCaseId || !canEdit) return
    const c = cases.find((c) => c.id === dragCaseId)
    if (c && c.custodyStage !== stage) {
      moveMutation.mutate({ caseId: dragCaseId, toStage: stage })
    }
    setDragCaseId(null)
  }

  // `updatedAt` is bumped by moveCustody on every stage change, so sorting
  // by it means a card just dropped into a column jumps straight to the
  // top of that column — not just the top of the whole board.
  function casesByStage(stage: CustodyStage): FuneralCase[] {
    const q = search.trim().toLowerCase()
    const rows = cases.filter((c) => c.custodyStage === stage && (!q || `${c.decedent.firstName} ${c.decedent.lastName} ${c.caseNumber}`.toLowerCase().includes(q)))
    return rows.slice().sort((a, b) => {
      if (sortMode === 'name') return `${a.decedent.lastName}${a.decedent.firstName}`.localeCompare(`${b.decedent.lastName}${b.decedent.firstName}`)
      if (sortMode === 'oldest') return a.updatedAt.localeCompare(b.updatedAt)
      return b.updatedAt.localeCompare(a.updatedAt) // newest
    })
  }

  function renderCard(c: FuneralCase) {
    return (
                <div
                  key={c.id}
                  draggable={canEdit}
                  onDragStart={() => setDragCaseId(c.id)}
                  onDragEnd={() => setDragCaseId(null)}
                  onClick={() => setSelectedCase(c.id)}
                  className={`bg-white rounded-md border border-slate-200 shadow-sm p-3 text-sm hover:shadow-md transition ${
                    canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } ${dragCaseId === c.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-start gap-1.5">
                    {canEdit && <GripVertical size={14} className="text-slate-300 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{c.decedent.firstName} {c.decedent.lastName}</div>
                      <div className="text-xs text-slate-500">{c.caseNumber}</div>
                      <div className="text-xs text-slate-400 capitalize mt-1">{c.disposition}</div>
                    </div>
                  </div>
                </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title="Chain of Custody"
        subtitle={canEdit ? 'Drag a case card to update its custody location' : 'Custody tracking (view only for your role)'}
        action={
          <div className="flex items-center gap-1.5 text-sm">
            <ArrowDownUp size={14} className="text-slate-400" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
            >
              {(['newest', 'oldest', 'name'] as SortMode[]).map((m) => (
                <option key={m} value={m}>{sortLabels[m]}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a name or case number…" className="w-full border border-slate-200 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
      </div>

      {/* Phone: pick a stage, see just that list */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
        {CUSTODY_STAGES.map((st) => (
          <button key={st} onClick={() => setPhoneStage(st)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border ${phoneStage === st ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200'}`}
            style={phoneStage === st ? { backgroundColor: stageAccent[st] } : undefined}>
            {CUSTODY_STAGE_LABELS[st]} <span className="opacity-70">{casesByStage(st).length}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-4 md:overflow-x-auto pb-4">
        {CUSTODY_STAGES.map((stage) => (
          <div
            key={stage}
            onDragOver={(e) => canEdit && e.preventDefault()}
            onDrop={() => handleDrop(stage)}
            className={`w-full md:w-64 md:shrink-0 ${phoneStage === stage ? 'block' : 'hidden md:block'}`}
          >
            <div
              className="flex items-center gap-2 rounded-t-md px-3 py-2 text-white text-xs font-semibold uppercase tracking-wide"
              style={{ backgroundColor: stageAccent[stage] }}
            >
              <span className="h-2 w-2 rounded-full bg-white/60" />
              {CUSTODY_STAGE_LABELS[stage]}
              <span className="ml-auto bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">{casesByStage(stage).length}</span>
            </div>
            <div className="bg-slate-100 rounded-b-md p-2 md:min-h-[420px] min-h-[120px] space-y-2 border border-t-0 border-slate-200">
              {(() => {
                const rows = casesByStage(stage)
                if (rows.length <= GROUP_THRESHOLD && !search) return rows.map(renderCard)
                if (stage === 'completed' || rows.length > GROUP_THRESHOLD) {
                  return groupByYearMonth(rows).map((g) => {
                    const yOpen = open.has(g.year) || !!search
                    return (
                      <div key={g.year}>
                        <button onClick={() => toggle(g.year)} className="w-full flex items-center gap-1.5 text-xs font-semibold text-slate-600 py-1.5">
                          {yOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {g.year}
                          <span className="ml-auto text-[10px] font-normal text-slate-400">{g.total}</span>
                        </button>
                        {yOpen && g.months.map((m) => {
                          const mOpen = open.has(m.key) || !!search
                          return (
                            <div key={m.key} className="ml-2">
                              <button onClick={() => toggle(m.key)} className="w-full flex items-center gap-1.5 text-xs text-slate-500 py-1">
                                {mOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {m.label}
                                <span className="ml-auto text-[10px] text-slate-400">{m.rows.length}</span>
                              </button>
                              {mOpen && <div className="space-y-2 pb-2">{m.rows.map(renderCard)}</div>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                }
                return rows.map(renderCard)
              })()}
              {casesByStage(stage).length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">No cases here</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Custody log panel */}
      {selectedCase && (
        <Card className="mt-6 p-5 max-w-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-800 flex items-center gap-2">
              <History size={15} /> Custody History
            </h3>
            <button onClick={() => setSelectedCase(null)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-3">
            {log
              .slice()
              .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
              .map((entry) => (
                <div key={entry.id} className="flex gap-3 text-sm border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                  <div className="w-32 shrink-0 text-slate-400 text-xs pt-0.5">
                    {format(parseISO(entry.timestamp), 'MMM d, h:mm a')}
                  </div>
                  <div>
                    <div className="text-slate-800">
                      {entry.fromStage ? (
                        <>
                          <span className="text-slate-500">{CUSTODY_STAGE_LABELS[entry.fromStage]}</span>
                          {' → '}
                          <span className="font-medium">{CUSTODY_STAGE_LABELS[entry.toStage]}</span>
                        </>
                      ) : (
                        <span className="font-medium">Received — {CUSTODY_STAGE_LABELS[entry.toStage]}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {entry.movedByName}{entry.note && ` · ${entry.note}`}
                    </div>
                  </div>
                </div>
              ))}
            {log.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No custody events recorded.</div>}
          </div>
        </Card>
      )}
    </div>
    <ActivityPanel entityType="custody" title="Custody Activity" />
    </div>
  )
}
