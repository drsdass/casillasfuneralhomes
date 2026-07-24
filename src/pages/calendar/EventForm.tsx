import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canAssignStaff } from '@/lib/permissions'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, AlertTriangle, Lock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { EventType, SchedulingConflict } from '@/types'

const typeOptions: { value: EventType; label: string }[] = [
  { value: 'first_call', label: 'First Call' },
  { value: 'meeting', label: 'Arrangement Meeting' },
  { value: 'visitation', label: 'Visitation' },
  { value: 'service', label: 'Service' },
  { value: 'burial', label: 'Burial' },
  { value: 'cremation', label: 'Cremation' },
  { value: 'other', label: 'Other' },
]

const inputClass = 'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

function toLocalInput(iso: string): string {
  // datetime-local expects "YYYY-MM-DDTHH:mm" in local time
  const d = parseISO(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EventForm() {
  const { eventId } = useParams<{ eventId: string }>()
  const isEdit = !!eventId
  const navigate = useNavigate()
  const { activeLocationId, currentUser } = useSession()
  const queryClient = useQueryClient()

  const { data: events = [] } = useQuery({ queryKey: ['events', 'all'], queryFn: () => api.getCalendarEvents() })
  const { data: staffList = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles', activeLocationId], queryFn: () => api.getVehicles(activeLocationId) })
  const { data: cases = [] } = useQuery({ queryKey: ['cases', activeLocationId], queryFn: () => api.getCases(activeLocationId) })
  const { data: timeOff = [] } = useQuery({ queryKey: ['time-off'], queryFn: api.getTimeOff })

  const existing = events.find((e) => e.id === eventId)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<EventType>('meeting')
  const [caseId, setCaseId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [location, setLocation] = useState('')
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [vehicleId, setVehicleId] = useState('')
  const [notes, setNotes] = useState('')
  const [conflicts, setConflicts] = useState<SchedulingConflict[]>([])
  const [overrideConflicts, setOverrideConflicts] = useState(false)

  useEffect(() => {
    if (!existing) return
    setTitle(existing.title)
    setType(existing.type)
    setCaseId(existing.caseId ?? '')
    setStart(toLocalInput(existing.start))
    setEnd(toLocalInput(existing.end))
    setLocation(existing.location ?? '')
    setParticipantIds(existing.participantIds)
    setVehicleId(existing.vehicleId ?? '')
    setNotes(existing.notes ?? '')
  }, [existing])

  // Re-check conflicts whenever timing/participants/vehicle change
  useEffect(() => {
    if (!start || !end) { setConflicts([]); return }
    const startIso = new Date(start).toISOString()
    const endIso = new Date(end).toISOString()
    if (startIso >= endIso) { setConflicts([]); return }
    api.findSchedulingConflicts(startIso, endIso, participantIds, vehicleId || undefined, eventId).then(setConflicts)
  }, [start, end, participantIds, vehicleId, eventId])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const startIso = new Date(start).toISOString()
      const endIso = new Date(end).toISOString()
      const payload = {
        orgId: currentUser!.orgId, locationId: activeLocationId, caseId: caseId || undefined,
        title, type, start: startIso, end: endIso, location: location || undefined,
        participantIds, vehicleId: vehicleId || undefined, notes: notes || undefined,
      }
      if (isEdit && eventId) return api.updateEvent(eventId, payload, currentUser!)
      return api.createEvent(payload, currentUser!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate('/calendar')
    },
  })

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!currentUser) return
    if (hasBlockingConflicts) return
    saveMutation.mutate()
  }

  const canAssign = currentUser ? canAssignStaff(currentUser.role) : false
  // Staff double-booking is a hard rule — a person genuinely can't be in two
  // places at once, so this can never be overridden. Vehicle conflicts stay
  // soft (a second vehicle might be arranged), so those keep the override.
  const staffConflicts = conflicts.filter((c) => c.kind === 'staff')
  const vehicleConflicts = conflicts.filter((c) => c.kind === 'vehicle')
  const hasBlockingConflicts = staffConflicts.length > 0 || (vehicleConflicts.length > 0 && !overrideConflicts)

  // Time off is advisory, not a hard block — someone might genuinely need
  // to be called in. This is the same check Calendar's drag-and-drop
  // already does; it was missing here on the full form.
  const eventDateKey = start ? start.slice(0, 10) : ''
  const staffOnTimeOff = participantIds
    .map((id) => {
      const entry = timeOff.find((t) => t.staffId === id && eventDateKey && t.startDate <= eventDateKey && eventDateKey <= t.endDate)
      return entry ? { staff: staffList.find((s) => s.id === id), entry } : null
    })
    .filter((x): x is { staff: typeof staffList[number] | undefined; entry: typeof timeOff[number] } => x !== null)

  return (
    <div>
      <Link to="/calendar" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to calendar
      </Link>

      <SectionHeading title={isEdit ? 'Edit Event' : 'New Event'} subtitle="Staff conflicts are blocked automatically; vehicle conflicts can be overridden" />

      <form onSubmit={handleSubmit} className="max-w-2xl">
        <Card className="p-5 mb-5">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Title</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Bennett — Visitation" />
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={inputClass}>
                {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Start</label>
              <input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>End</label>
              <input required type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Linked Case (optional)</label>
              <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={inputClass}>
                <option value="">None</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>{c.decedent.firstName} {c.decedent.lastName} — {c.caseNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Main Chapel, etc." />
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass + ' resize-none'} />
          </div>
        </Card>

        <Card className="p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-medium text-slate-800">Staff Assignment</h3>
            {!canAssign && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Lock size={10} /> Manager and above only
              </span>
            )}
          </div>
          {canAssign ? (
            <div className="grid grid-cols-2 gap-2 mb-5">
              {staffList.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={participantIds.includes(s.id)} onChange={() => toggleParticipant(s.id)} className="accent-[#3b4a35]" />
                  {s.name} <span className="text-xs text-slate-400">— {s.title}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-600 mb-5">
              {participantIds.length === 0
                ? <span className="text-slate-400">No staff assigned yet.</span>
                : participantIds.map((id) => staffList.find((s) => s.id === id)?.name).filter(Boolean).join(', ')}
            </div>
          )}

          <h3 className="text-sm font-medium text-slate-800 mb-2">Vehicle (optional)</h3>
          {canAssign ? (
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
            </select>
          ) : (
            <div className="text-sm text-slate-600">
              {vehicleId ? vehicles.find((v) => v.id === vehicleId)?.name ?? '—' : <span className="text-slate-400">None assigned.</span>}
            </div>
          )}
        </Card>

        {conflicts.length > 0 && (
          <Card className="p-4 mb-5 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm font-medium text-amber-800">Scheduling conflict{conflicts.length > 1 ? 's' : ''} detected</div>
            </div>
            {staffConflicts.length > 0 && (
              <>
                <ul className="text-sm text-amber-900 space-y-1 mb-2 ml-6 list-disc font-medium">
                  {staffConflicts.map((c, i) => (
                    <li key={i}>
                      {c.resourceName} is already booked for "{c.conflictingEvent.title}" ({format(parseISO(c.conflictingEvent.start), 'MMM d, h:mm a')}–{format(parseISO(c.conflictingEvent.end), 'h:mm a')}) — this can't be overridden.
                    </li>
                  ))}
                </ul>
              </>
            )}
            {vehicleConflicts.length > 0 && (
              <ul className="text-sm text-amber-800 space-y-1 mb-3 ml-6 list-disc">
                {vehicleConflicts.map((c, i) => (
                  <li key={i}>
                    {c.resourceName} is already booked for "{c.conflictingEvent.title}" ({format(parseISO(c.conflictingEvent.start), 'MMM d, h:mm a')}–{format(parseISO(c.conflictingEvent.end), 'h:mm a')})
                  </li>
                ))}
              </ul>
            )}
            {vehicleConflicts.length > 0 && staffConflicts.length === 0 && (
              <label className="flex items-center gap-2 text-sm text-amber-900">
                <input type="checkbox" checked={overrideConflicts} onChange={(e) => setOverrideConflicts(e.target.checked)} className="accent-amber-600" />
                Schedule anyway
              </label>
            )}
          </Card>
        )}

        {staffOnTimeOff.length > 0 && (
          <Card className="p-4 mb-5 border-amber-300 bg-amber-50">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-800 mb-1">Heads up — marked as off</div>
                <ul className="text-sm text-amber-900 space-y-0.5 ml-4 list-disc">
                  {staffOnTimeOff.map(({ staff, entry }) => (
                    <li key={entry.id}>
                      {staff?.name ?? 'This person'} is marked as {entry.type === 'other_off' ? 'off' : entry.type} on this date — assigning them anyway still works, this is just a heads up.
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        )}

        {saveMutation.isError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mb-3">
            Couldn't save this event: {saveMutation.error instanceof Error ? saveMutation.error.message : 'Unknown error'}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link to="/calendar" className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-4 py-2 hover:bg-slate-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={hasBlockingConflicts || saveMutation.isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-4 py-2 hover:bg-[#4d5f45] transition disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </form>
    </div>
  )
}
