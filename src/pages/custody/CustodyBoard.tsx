import { useEffect, useRef, useState, type ReactNode } from 'react'
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

// Big screens (2xl): six equal columns, two rows. Funeral Home takes two columns and both rows; the other eight stages fill around it.
const BIG_SCREEN_SPOT: Record<CustodyStage, string> = {
  scene_first_call: '2xl:col-start-1 2xl:row-start-1',
  in_transit: '2xl:col-start-2 2xl:row-start-1',
  funeral_home: '2xl:col-start-3 2xl:col-span-2 2xl:row-start-1 2xl:row-span-2',
  chapel_service: '2xl:col-start-5 2xl:row-start-1',
  crematory: '2xl:col-start-6 2xl:row-start-1',
  ashes_received: '2xl:col-start-1 2xl:row-start-2',
  cemetery_burial: '2xl:col-start-2 2xl:row-start-2',
  shipped_released: '2xl:col-start-5 2xl:row-start-2',
  completed: '2xl:col-start-6 2xl:row-start-2',
}
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


/** A column body that scrolls on its own. When there is more below, a slim bar under the list says so (it never covers a card). */
function ScrollColumn({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const check = () => {
    const el = ref.current
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 12)
  }
  useEffect(() => { check() })
  useEffect(() => { window.addEventListener('resize', check); return () => window.removeEventListener('resize', check) }, [])
  return (
    <div className="md:flex md:flex-col md:flex-1 md:min-h-0">
      <div ref={ref} onScroll={check} className={`${className} ${more ? 'md:rounded-b-none' : ''} md:flex-1 md:min-h-0 md:overflow-y-auto`}>{children}</div>
      {more && (
        <button
          type="button"
          onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.8, behavior: 'smooth' })}
          className="hidden md:flex shrink-0 items-center justify-center gap-1 rounded-b-md border border-t-0 border-slate-300 bg-slate-200 py-1 text-xs font-semibold text-slate-700 animate-pulse hover:bg-slate-300"
        >
          <ChevronDown size={14} /> More below
        </button>
      )}
    </div>
  )
}

export default function CustodyBoard() {
  const { activeLocationId, currentUser } = useSession()
  const isAllLocations = currentUser ? canViewAllLocations(currentUser.role) : false
  const queryClient = useQueryClient()
  const [dragCaseId, setDragCaseId] = useState<string | null>(null)
  const [selectedCase, setSelectedCase] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [search, setSearch] = useState('')
  const [phoneStage, setPhoneStage] = useState<CustodyStage>('scene_first_call') // phone: one column at a time
  // Each stage keeps its own open/closed folders. The current year and month start open; anything a person clicks flips only that stage's folder.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set())
  const defaultOpen = (k: string) => k === format(new Date(), 'yyyy') || k === format(new Date(), 'yyyy-MM')
  const isOpen = (stage: string, k: string) => defaultOpen(k) !== flipped.has(`${stage}:${k}`)
  const toggle = (stage: string, k: string) => setFlipped((prev) => { const n = new Set(prev); const key = `${stage}:${k}`; n.has(key) ? n.delete(key) : n.add(key); return n })
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
                  className={`bg-white rounded-md border border-slate-200 shadow-sm px-2.5 py-1.5 md:py-1 text-sm hover:shadow-md transition ${
                    canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } ${dragCaseId === c.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-start gap-1.5">
                    {canEdit && <GripVertical size={14} className="text-slate-300 mt-1 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{c.decedent.firstName} {c.decedent.lastName}</div>
                      <div className="text-xs text-slate-500 truncate">{c.caseNumber} <span className="text-slate-400 capitalize">· {c.disposition}</span></div>
                      {canEdit && (
                        <select
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { const to = e.target.value as CustodyStage; if (to) moveMutation.mutate({ caseId: c.id, toStage: to }) }}
                          className="md:hidden mt-2 w-full border border-slate-200 rounded-md px-2 py-2 text-sm bg-white text-slate-600"
                        >
                          <option value="">Move to…</option>
                          {CUSTODY_STAGES.filter((st) => st !== c.custodyStage).map((st) => <option key={st} value={st}>{CUSTODY_STAGE_LABELS[st]}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 gap-6 items-start ${showActivity ? 'lg:grid-cols-[1fr_280px]' : ''}`}>
    <div>
      <SectionHeading
        title="Chain of Custody"
        subtitle={canEdit ? 'Drag a case card to update its custody location' : 'Custody tracking (view only for your role)'}
        action={
          <div className="flex items-center gap-2 text-sm">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a name or case number…" className="w-56 sm:w-72 border border-slate-200 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
            </div>
            <button onClick={() => setShowActivity((v) => !v)} className={`hidden lg:inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${showActivity ? 'border-[#b3925a] bg-[#b3925a]/15 text-[#5b4524]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><History size={14} /> Activity</button>
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

      <div className="grid gap-3 md:h-[calc(100dvh-11rem)] md:min-h-[26rem] md:grid-cols-[repeat(auto-fit,minmax(11.5rem,1fr))] md:auto-rows-fr 2xl:grid-cols-6 2xl:grid-rows-2 pb-1">
        {CUSTODY_STAGES.map((stage, stageIdx) => (
          <div
            key={stage}
            onDragOver={(e) => canEdit && e.preventDefault()}
            onDrop={() => handleDrop(stage)}
            className={`w-full min-w-0 md:min-h-0 md:flex md:flex-col ${BIG_SCREEN_SPOT[stage]} ${phoneStage === stage ? 'block' : 'hidden md:flex'}`}
          >
            <div
              className="flex items-center gap-2 rounded-t-md px-3 py-2 text-white text-xs font-semibold uppercase tracking-wide"
              style={{ backgroundColor: stageAccent[stage] }}
            >
              <span className="hidden md:flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-[11px]">{stageIdx + 1}</span>
              {CUSTODY_STAGE_LABELS[stage]}
              <span className="ml-auto bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">{casesByStage(stage).length}</span>
            </div>
            <ScrollColumn className="bg-slate-100 rounded-b-md p-2 min-h-[120px] md:min-h-0 space-y-1.5 border border-t-0 border-slate-200">
              {(() => {
                const rows = casesByStage(stage)
                // Funeral Home gets a double-wide spot on big screens, so its people are listed in two columns.
                const cards = (list: FuneralCase[]) => stage === 'funeral_home'
                  ? <div className="space-y-1.5 2xl:space-y-0 2xl:grid 2xl:grid-cols-2 2xl:gap-1.5">{list.map(renderCard)}</div>
                  : list.map(renderCard)
                if (rows.length <= GROUP_THRESHOLD && !search) return cards(rows)
                if (stage === 'completed' || rows.length > GROUP_THRESHOLD) {
                  const groups = groupByYearMonth(rows)
                  // Only one month in this stage? No folders at all — just the list.
                  if (!search && groups.length === 1 && groups[0].months.length === 1) return cards(groups[0].months[0].rows)
                  const oneYear = groups.length === 1
                  const renderMonths = (g: typeof groups[number]) => g.months.map((m) => {
                    const mOpen = isOpen(stage, m.key) || !!search
                    return (
                      <div key={m.key} className={oneYear ? '' : 'ml-2'}>
                        <button onClick={() => toggle(stage, m.key)} className="w-full flex items-center gap-1.5 text-xs font-medium text-slate-600 py-0.5">
                          {mOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {m.label}
                          <span className="ml-auto text-[10px] text-slate-500">{m.rows.length}</span>
                        </button>
                        {mOpen && <div className="space-y-1.5 pb-1">{cards(m.rows)}</div>}
                      </div>
                    )
                  })
                  return groups.map((g) => {
                    // One year only: skip the year row and show months directly.
                    if (oneYear) return <div key={g.year}>{renderMonths(g)}</div>
                    const yOpen = isOpen(stage, g.year) || !!search
                    return (
                      <div key={g.year}>
                        <button onClick={() => toggle(stage, g.year)} className="w-full flex items-center gap-1.5 text-xs font-semibold text-slate-700 py-0.5">
                          {yOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {g.year}
                          <span className="ml-auto text-[10px] font-normal text-slate-500">{g.total}</span>
                        </button>
                        {yOpen && renderMonths(g)}
                      </div>
                    )
                  })
                }
                return cards(rows)
              })()}
              {casesByStage(stage).length === 0 && (
                <div className="text-xs text-slate-400 text-center py-6">No cases here</div>
              )}
            </ScrollColumn>
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
    {showActivity && <ActivityPanel entityType="custody" title="Custody Activity" />}
    </div>
  )
}
