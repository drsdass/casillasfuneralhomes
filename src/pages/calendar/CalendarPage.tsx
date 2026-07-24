import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canViewAllLocations, canEditCases, canAssignStaff } from '@/lib/permissions'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { format, parseISO } from 'date-fns'
import { Plus, Car, X, GripVertical, AlertTriangle, ChevronLeft, ChevronRight, List, CalendarDays } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import type { CalendarEvent, StaffMember, StaffTimeOff, FuneralCase } from '@/types'

const typeColors: Record<string, string> = {
  visitation: 'bg-purple-100 text-purple-800',
  service: 'bg-blue-100 text-blue-800',
  burial: 'bg-slate-100 text-slate-800',
  cremation: 'bg-orange-100 text-orange-800',
  first_call: 'bg-red-100 text-red-800',
  meeting: 'bg-emerald-100 text-emerald-800',
  other: 'bg-slate-100 text-slate-700',
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Lazily fetches a linked case's orders + latest note — only while actually hovering, so this never fires for every event in a long list up front. */
function useCaseHoverInfo(caseId: string | undefined, enabled: boolean) {
  const { data: orders = [] } = useQuery({
    queryKey: ['case-orders', caseId],
    queryFn: () => api.getOrders(caseId!),
    enabled: enabled && !!caseId,
  })
  const { data: notes = [] } = useQuery({
    queryKey: ['case-notes', caseId],
    queryFn: () => api.getCaseNotes(caseId!),
    enabled: enabled && !!caseId,
  })
  const flowers = orders.find((o) => /flower/i.test(o.item))?.status
  const birds = orders.find((o) => /dove|bird/i.test(o.item))?.status
  const escort = orders.find((o) => /escort|carriage/i.test(o.item))?.status
  const latestNote = notes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return { flowers, birds, escort, latestNote }
}

function EventHoverPopover({
  e, linkedCase, staffNames, flowers, birds, escort, latestNote,
}: {
  e: CalendarEvent
  linkedCase: FuneralCase | undefined
  staffNames: string[]
  flowers?: string
  birds?: string
  escort?: string
  latestNote?: { body: string }
}) {
  return (
    <div className="absolute z-20 left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-md shadow-lg p-3 text-xs pointer-events-none">
      <div className="font-medium text-slate-800 mb-1">{e.title}</div>
      <div className="text-slate-500 mb-1.5">{format(parseISO(e.start), 'MMM d, h:mm a')} – {format(parseISO(e.end), 'h:mm a')}</div>
      <div className="mb-1"><span className="text-slate-400">Staff:</span> {staffNames.length > 0 ? staffNames.join(', ') : '—'}</div>
      {linkedCase && (
        <>
          <div className="mb-1.5 capitalize"><span className="text-slate-400">Disposition:</span> {linkedCase.disposition.replace('_', ' ')}</div>
          <div className="flex gap-3 text-[11px]">
            <span><span className="text-slate-400">Flowers:</span> {flowers ?? '—'}</span>
            <span><span className="text-slate-400">Birds:</span> {birds ?? '—'}</span>
            <span><span className="text-slate-400">Escort:</span> {escort ?? '—'}</span>
          </div>
          {latestNote && <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-slate-600">{latestNote.body}</div>}
        </>
      )}
    </div>
  )
}

export default function CalendarPage() {
  const { activeLocationId, currentUser } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAllLocations = currentUser ? canViewAllLocations(currentUser.role) : false
  const canEdit = currentUser ? canEditCases(currentUser.role) : false
  const canDragAssign = currentUser ? canAssignStaff(currentUser.role) : false

  const [viewMode, setViewMode] = useState<'list' | 'month'>('list')
  const [anchor, setAnchor] = useState(new Date())
  const [draggedStaffId, setDraggedStaffId] = useState<string | null>(null)
  const [dragOverEventId, setDragOverEventId] = useState<string | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  const [dropWarning, setDropWarning] = useState<string | null>(null)

  const { data: events = [] } = useQuery({
    queryKey: ['events', isAllLocations ? 'all' : activeLocationId],
    queryFn: () => api.getCalendarEvents(isAllLocations ? undefined : activeLocationId),
  })
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', activeLocationId],
    queryFn: () => api.getVehicles(activeLocationId),
  })
  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const { data: timeOff = [] } = useQuery({ queryKey: ['time-off'], queryFn: api.getTimeOff })
  const { data: allCases = [] } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => api.getCases() })

  const updateParticipantsMutation = useMutation({
    mutationFn: ({ event, participantIds }: { event: CalendarEvent; participantIds: string[] }) =>
      api.updateEvent(event.id, { participantIds }, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
    onError: (err) => {
      setDropError(`Couldn't save that assignment: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setTimeout(() => setDropError(null), 8000)
    },
  })

  // Month currently in view — used to filter both List and Month modes, and
  // to navigate forward for services scheduled out weeks or months ahead.
  const monthStart = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1), [anchor])
  const monthEnd = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59), [anchor])
  const eventsInMonth = useMemo(
    () => events.filter((e) => { const s = parseISO(e.start); return s >= monthStart && s <= monthEnd }),
    [events, monthStart, monthEnd]
  )

  function shiftMonth(dir: -1 | 1) {
    setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
  }

  function timeOffFor(staffId: string, dateKey: string): StaffTimeOff | undefined {
    return timeOff.find((t) => t.staffId === staffId && t.startDate <= dateKey && dateKey <= t.endDate)
  }

  if (!currentUser) return null

  async function handleDrop(event: CalendarEvent) {
    setDragOverEventId(null)
    if (!draggedStaffId || event.participantIds.includes(draggedStaffId)) {
      setDraggedStaffId(null)
      return
    }
    // Hard rule: a staff double-booking can never be overridden, since they
    // genuinely can't be in two places.
    const conflicts = await api.findSchedulingConflicts(event.start, event.end, [draggedStaffId], undefined, event.id)
    if (conflicts.length > 0) {
      setDropError(`${conflicts[0].resourceName} is already booked for "${conflicts[0].conflictingEvent.title}" at this time.`)
      setTimeout(() => setDropError(null), 5000)
      setDraggedStaffId(null)
      return
    }
    // Soft rule: time off is advisory, not a hard block — someone might
    // genuinely need to be called in. Warn, but still complete the drop.
    const offEntry = timeOffFor(draggedStaffId, toDateKey(parseISO(event.start)))
    if (offEntry) {
      const person = allStaff.find((s) => s.id === draggedStaffId)
      setDropWarning(`Heads up: ${person?.name ?? 'This person'} is marked as ${offEntry.type === 'other_off' ? 'off' : offEntry.type} on this date — assigned anyway.`)
      setTimeout(() => setDropWarning(null), 8000)
    }
    updateParticipantsMutation.mutate({ event, participantIds: [...event.participantIds, draggedStaffId] })
    setDraggedStaffId(null)
  }

  function handleRemove(event: CalendarEvent, staffId: string) {
    updateParticipantsMutation.mutate({ event, participantIds: event.participantIds.filter((id) => id !== staffId) })
  }

  const grouped = eventsInMonth
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .reduce<Record<string, typeof events>>((acc, e) => {
      const day = format(parseISO(e.start), 'yyyy-MM-dd')
      acc[day] = acc[day] ? [...acc[day], e] : [e]
      return acc
    }, {})

  return (
    <div>
      <SectionHeading
        title="Calendar"
        subtitle={canDragAssign ? 'Drag a name from the right onto an event to assign them' : 'Visitations, services, staff and vehicle assignments'}
        action={
          <div className="flex items-center gap-2">
            <div className="flex border border-slate-200 rounded-md overflow-hidden">
              <button onClick={() => setViewMode('list')} className={`px-2.5 py-1.5 ${viewMode === 'list' ? 'bg-[#3b4a35] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <List size={14} />
              </button>
              <button onClick={() => setViewMode('month')} className={`px-2.5 py-1.5 ${viewMode === 'month' ? 'bg-[#3b4a35] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <CalendarDays size={14} />
              </button>
            </div>
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"><ChevronLeft size={15} /></button>
            <span className="text-sm font-medium text-slate-700 min-w-[110px] text-center">{format(anchor, 'MMMM yyyy')}</span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"><ChevronRight size={15} /></button>
            <button onClick={() => setAnchor(new Date())} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50">Today</button>
            {canEdit && (
              <button
                onClick={() => navigate('/calendar/new')}
                className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition"
              >
                <Plus size={16} /> New Event
              </button>
            )}
          </div>
        }
      />

      {dropError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-4">
          <AlertTriangle size={14} className="shrink-0" /> {dropError}
        </div>
      )}
      {dropWarning && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mb-4">
          <AlertTriangle size={14} className="shrink-0" /> {dropWarning}
        </div>
      )}

      <div className={canEdit ? 'grid grid-cols-[1fr_220px] gap-6 items-start' : ''}>
        <div>
          {viewMode === 'list' ? (
            <div className="space-y-6">
              {Object.entries(grouped).map(([day, dayEvents]) => (
                <div key={day}>
                  <div className="text-sm font-medium text-slate-500 mb-2">
                    {format(parseISO(day), 'EEEE, MMMM d, yyyy')}
                  </div>
                  <Card className="divide-y divide-slate-50">
                    {dayEvents.map((e) => (
                      <EventRow
                        key={e.id} e={e} vehicles={vehicles} allStaff={allStaff} allCases={allCases} canEdit={canEdit} canDragAssign={canDragAssign}
                        isDragOver={dragOverEventId === e.id}
                        onDragOver={() => setDragOverEventId(e.id)}
                        onDragLeave={() => setDragOverEventId((prev) => (prev === e.id ? null : prev))}
                        onDrop={() => handleDrop(e)}
                        onRemove={(staffId) => handleRemove(e, staffId)}
                        onClick={() => canEdit && navigate(`/calendar/${e.id}/edit`)}
                      />
                    ))}
                  </Card>
                </div>
              ))}
              {eventsInMonth.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-16">No events scheduled in {format(anchor, 'MMMM yyyy')}.</div>
              )}
            </div>
          ) : (
            <MonthGrid
              anchor={anchor} events={eventsInMonth} allCases={allCases} allStaff={allStaff}
              onDayEventClick={(id) => canEdit && navigate(`/calendar/${id}/edit`)}
            />
          )}
        </div>

        {canEdit && (
          <div className="space-y-5">
            {canDragAssign && (
              <StaffPanel
                staff={allStaff} timeOff={timeOff} anchor={anchor}
                draggedStaffId={draggedStaffId} onDragStart={setDraggedStaffId} onDragEnd={() => setDraggedStaffId(null)}
              />
            )}
            <ActivityPanel entityType="event" title="Calendar Activity" />
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({
  e, vehicles, allStaff, allCases, canEdit, canDragAssign, isDragOver, onDragOver, onDragLeave, onDrop, onRemove, onClick,
}: {
  e: CalendarEvent
  vehicles: { id: string; name: string }[]
  allStaff: StaffMember[]
  allCases: FuneralCase[]
  canEdit: boolean
  canDragAssign: boolean
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onRemove: (staffId: string) => void
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const vehicle = vehicles.find((v) => v.id === e.vehicleId)
  const linkedCase = e.caseId ? allCases.find((c) => c.id === e.caseId) : undefined
  const staffNames = e.participantIds.map((id) => allStaff.find((s) => s.id === id)?.name).filter(Boolean) as string[]
  const { flowers, birds, escort, latestNote } = useCaseHoverInfo(linkedCase?.id, hovered)

  return (
    <div
      onClick={onClick}
      onDragOver={(ev) => { if (canDragAssign) { ev.preventDefault(); onDragOver() } }}
      onDragLeave={onDragLeave}
      onDrop={(ev) => { ev.preventDefault(); ev.stopPropagation(); onDrop() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative flex items-center gap-4 px-4 py-3 transition ${canEdit ? 'cursor-pointer hover:bg-slate-50' : ''} ${
        isDragOver ? 'bg-[#b3925a]/10 ring-2 ring-inset ring-[#b3925a]/40' : ''
      }`}
    >
      <div className="w-32 shrink-0 text-sm text-slate-600">
        {format(parseISO(e.start), 'h:mm a')} – {format(parseISO(e.end), 'h:mm a')}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${typeColors[e.type]}`}>
        {e.type.replace('_', ' ')}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">{e.title}</div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          {e.location && <span>{e.location}</span>}
          {vehicle && <span className="flex items-center gap-1"><Car size={11} /> {vehicle.name}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {e.participantIds.map((pid) => {
          const p = allStaff.find((s) => s.id === pid)
          if (!p) return null
          return (
            <div key={pid} className="group relative">
              <div
                title={p.name}
                className="h-6 w-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-semibold text-white"
                style={{ backgroundColor: p.avatarColor }}
              >
                {p.name.split(' ').map((n) => n[0]).join('')}
              </div>
              {canDragAssign && (
                <button
                  onClick={(ev) => { ev.stopPropagation(); onRemove(pid) }}
                  className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 items-center justify-center hidden group-hover:flex"
                >
                  <X size={9} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {hovered && (
        <EventHoverPopover e={e} linkedCase={linkedCase} staffNames={staffNames} flowers={flowers} birds={birds} escort={escort} latestNote={latestNote} />
      )}
    </div>
  )
}

function MonthGrid({ anchor, events, allCases, allStaff, onDayEventClick }: { anchor: Date; events: CalendarEvent[]; allCases: FuneralCase[]; allStaff: StaffMember[]; onDayEventClick: (id: string) => void }) {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startOffset = firstOfMonth.getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const todayKey = toDateKey(new Date())

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {}
    for (const e of events) {
      const d = parseISO(e.start)
      map[d.getDate()] = map[d.getDate()] ? [...map[d.getDate()], e] : [e]
    }
    return map
  }, [events])

  return (
    <Card className="p-3">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="min-h-[90px]" />
          const dayEvents = eventsByDay[day] ?? []
          const isToday = toDateKey(new Date(year, month, day)) === todayKey
          return (
            <div key={day} className={`min-h-[90px] border border-slate-100 rounded-md p-1.5 ${isToday ? 'bg-[#b3925a]/5 border-[#b3925a]/30' : ''}`}>
              <div className={`text-xs mb-1 ${isToday ? 'font-semibold text-[#b3925a]' : 'text-slate-400'}`}>{day}</div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <MonthEventChip key={e.id} e={e} allCases={allCases} allStaff={allStaff} onClick={() => onDayEventClick(e.id)} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-slate-400 px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function MonthEventChip({ e, allCases, allStaff, onClick }: { e: CalendarEvent; allCases: FuneralCase[]; allStaff: StaffMember[]; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const linkedCase = e.caseId ? allCases.find((c) => c.id === e.caseId) : undefined
  const staffNames = e.participantIds.map((id) => allStaff.find((s) => s.id === id)?.name).filter(Boolean) as string[]
  const { flowers, birds, escort, latestNote } = useCaseHoverInfo(linkedCase?.id, hovered)

  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        onClick={onClick}
        className={`block w-full text-left text-[10px] px-1 py-0.5 rounded truncate ${typeColors[e.type]}`}
      >
        {format(parseISO(e.start), 'h:mma')} {e.title}
      </button>
      {hovered && (
        <EventHoverPopover e={e} linkedCase={linkedCase} staffNames={staffNames} flowers={flowers} birds={birds} escort={escort} latestNote={latestNote} />
      )}
    </div>
  )
}

function StaffPanel({
  staff, timeOff, anchor, draggedStaffId, onDragStart, onDragEnd,
}: {
  staff: StaffMember[]
  timeOff: StaffTimeOff[]
  anchor: Date
  draggedStaffId: string | null
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const todayKey = toDateKey(new Date())
  // Prefer "off today" if viewing the current month, otherwise just flag
  // anyone with any time off overlapping the month currently in view.
  const monthKey = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
  function isOff(staffId: string): boolean {
    return timeOff.some((t) => t.staffId === staffId && (
      (t.startDate <= todayKey && todayKey <= t.endDate) || t.startDate.startsWith(monthKey) || t.endDate.startsWith(monthKey)
    ))
  }

  return (
    <Card className="p-3 sticky top-6">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2">Staff</div>
      <div className="space-y-1">
        {staff.filter((s) => s.active).map((s) => {
          const off = isOff(s.id)
          return (
            <div
              key={s.id}
              draggable
              onDragStart={() => onDragStart(s.id)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-slate-50 transition ${
                draggedStaffId === s.id ? 'opacity-40' : ''
              }`}
            >
              <GripVertical size={12} className="text-slate-300 shrink-0" />
              <div className="relative shrink-0">
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                  style={{ backgroundColor: s.avatarColor }}
                >
                  {s.name.split(' ').map((n) => n[0]).join('')}
                </div>
                {off && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 border border-white" />}
              </div>
              <span className="text-sm text-slate-700 truncate">{s.name}</span>
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-slate-400 px-1 mt-2 flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-amber-400" /> has time off this month
      </div>
    </Card>
  )
}
