import { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canAssignStaff } from '@/lib/permissions'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import type { TimeOffType } from '@/types'

const typeStyles: Record<TimeOffType, string> = {
  vacation: 'bg-blue-100 text-blue-800 border-blue-200',
  sick: 'bg-red-100 text-red-700 border-red-200',
  other_off: 'bg-slate-100 text-slate-600 border-slate-200',
}
const typeLabels: Record<TimeOffType, string> = { vacation: 'Vacation', sick: 'Sick', other_off: 'Off' }
const typeAbbrev: Record<TimeOffType, string> = { vacation: 'VAC', sick: 'SICK', other_off: 'OFF' }

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface DragState {
  staffId: string
  anchorDate: string
  currentDate: string
}

export default function StaffSchedule() {
  const { currentUser } = useSession()
  const queryClient = useQueryClient()
  const canEdit = currentUser ? canAssignStaff(currentUser.role) : false

  const [granularity, setGranularity] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(new Date())
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pendingRange, setPendingRange] = useState<{ staffId: string; startDate: string; endDate: string } | null>(null)

  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const { data: timeOff = [] } = useQuery({ queryKey: ['time-off'], queryFn: api.getTimeOff })

  const addMutation = useMutation({
    mutationFn: (input: { staffId: string; startDate: string; endDate: string; type: TimeOffType; notes?: string }) =>
      api.addTimeOff({ ...input, createdBy: currentUser!.id }, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off'] })
      setPendingRange(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteTimeOff(id, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-off'] }),
  })

  const days = useMemo(() => {
    const start = new Date(anchor)
    const count = granularity === 'week' ? 7 : 30
    if (granularity === 'week') {
      start.setDate(start.getDate() - start.getDay())
    } else {
      start.setDate(1)
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [anchor, granularity])

  function shift(dir: -1 | 1) {
    const next = new Date(anchor)
    if (granularity === 'week') next.setDate(next.getDate() + dir * 7)
    else next.setMonth(next.getMonth() + dir)
    setAnchor(next)
  }

  function entryFor(staffId: string, dateKey: string) {
    return timeOff.find((t) => t.staffId === staffId && t.startDate <= dateKey && dateKey <= t.endDate)
  }

  // Click-and-drag across a row's day cells to select a date range in one
  // motion, instead of opening a form and typing dates by hand. Dragging
  // is only meaningful across empty cells — starting or crossing an
  // existing entry cancels the drag, since that cell already has its own
  // click-to-remove behavior.
  const finishDrag = useCallback(() => {
    if (!drag) return
    const startDate = drag.anchorDate < drag.currentDate ? drag.anchorDate : drag.currentDate
    const endDate = drag.anchorDate < drag.currentDate ? drag.currentDate : drag.anchorDate
    setDrag(null)
    setPendingRange({ staffId: drag.staffId, startDate, endDate })
  }, [drag])

  useEffect(() => {
    if (!drag) return
    window.addEventListener('mouseup', finishDrag)
    return () => window.removeEventListener('mouseup', finishDrag)
  }, [drag, finishDrag])

  function inDragRange(staffId: string, dateKey: string): boolean {
    if (!drag || drag.staffId !== staffId) return false
    const lo = drag.anchorDate < drag.currentDate ? drag.anchorDate : drag.currentDate
    const hi = drag.anchorDate < drag.currentDate ? drag.currentDate : drag.anchorDate
    return dateKey >= lo && dateKey <= hi
  }

  if (!currentUser) return null

  return (
    <>
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title="Staff Schedule"
        subtitle={canEdit ? 'Click and drag across days to mark someone off — vacation, sick, or other' : "Who's on and who's off — vacation, sick days, and other time away"}
        action={
          <div className="flex items-center gap-2">
            <div className="flex border border-slate-200 rounded-md overflow-hidden">
              {(['week', 'month'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize ${granularity === g ? 'bg-[#3b4a35] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <button onClick={() => shift(-1)} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"><ChevronLeft size={15} /></button>
            <button onClick={() => setAnchor(new Date())} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50">Today</button>
            <button onClick={() => shift(1)} className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50"><ChevronRight size={15} /></button>
          </div>
        }
      />

      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
        {(['vacation', 'sick', 'other_off'] as TimeOffType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${typeStyles[t]}`} /> {typeLabels[t]}
          </span>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="border-collapse select-none">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white text-left text-xs font-medium text-slate-500 px-3 py-2 border-b border-slate-100 min-w-[140px]">Staff</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="text-center text-xs font-medium text-slate-500 px-1.5 py-2 border-b border-slate-100 min-w-[52px]">
                  <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-slate-400">{d.getDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allStaff.filter((s) => s.active).map((s) => (
              <tr key={s.id} className="border-b border-slate-50 last:border-0">
                <td className="sticky left-0 bg-white px-3 py-2 text-sm text-slate-800 whitespace-nowrap">{s.name}</td>
                {days.map((d) => {
                  const dateKey = toDateKey(d)
                  const entry = entryFor(s.id, dateKey)
                  return (
                    <td
                      key={dateKey}
                      className={`text-center px-1 py-1.5 ${inDragRange(s.id, dateKey) ? 'bg-[#b3925a]/15' : ''}`}
                      onMouseEnter={() => drag && drag.staffId === s.id && setDrag({ ...drag, currentDate: dateKey })}
                    >
                      {entry ? (
                        <button
                          disabled={!canEdit}
                          onClick={() => canEdit && deleteMutation.mutate(entry.id)}
                          title={canEdit ? 'Click to remove' : typeLabels[entry.type]}
                          className={`text-[9px] font-semibold px-1.5 py-1 rounded border w-full ${typeStyles[entry.type]} ${canEdit ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                        >
                          {typeAbbrev[entry.type]}
                        </button>
                      ) : canEdit ? (
                        <button
                          onMouseDown={() => setDrag({ staffId: s.id, anchorDate: dateKey, currentDate: dateKey })}
                          className="w-full h-6 rounded hover:bg-slate-50 text-slate-300 hover:text-slate-400 flex items-center justify-center cursor-pointer"
                        >
                          +
                        </button>
                      ) : (
                        <span className="block h-6" />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
    <ActivityPanel entityType="staff" title="Schedule Activity" />
    </div>

      {pendingRange && (
        <AddTimeOffModal
          staffName={allStaff.find((s) => s.id === pendingRange.staffId)?.name ?? ''}
          startDate={pendingRange.startDate}
          endDate={pendingRange.endDate}
          onCancel={() => setPendingRange(null)}
          onSave={(startDate, endDate, type, notes) =>
            addMutation.mutate({ staffId: pendingRange.staffId, startDate, endDate, type, notes })
          }
          isPending={addMutation.isPending}
        />
      )}
    </>
  )
}

function AddTimeOffModal({
  staffName, startDate, endDate, onCancel, onSave, isPending,
}: {
  staffName: string
  startDate: string
  endDate: string
  onCancel: () => void
  onSave: (startDate: string, endDate: string, type: TimeOffType, notes: string | undefined) => void
  isPending: boolean
}) {
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)
  const [type, setType] = useState<TimeOffType>('vacation')
  const [notes, setNotes] = useState('')
  const dayCount = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800">Add time off — {staffName}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="text-xs text-slate-400 mb-4">{dayCount} day{dayCount !== 1 ? 's' : ''} selected — adjust below if needed</div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Through</label>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <div className="flex gap-2">
              {(['vacation', 'sick', 'other_off'] as TimeOffType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 text-xs font-medium px-2.5 py-2 rounded-md border ${
                    type === t ? typeStyles[t] : 'text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {typeLabels[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => onSave(start, end, type, notes || undefined)}
            disabled={isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Card>
    </div>
  )
}
