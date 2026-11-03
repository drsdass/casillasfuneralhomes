import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Time24 } from '@/components/ui/DateTime24'
import type { CalendarEvent, FuneralCase, StaffMember } from '@/types'

const LABELS = ['Private', 'Public', 'Rosary', 'Vigil', 'Mass', 'Funeral service', 'Graveside', 'Memorial', 'Committal', 'Disinterment']
const KIND = { visitation: 'Visitation', service: 'Service', burial: 'Burial' } as const
const input = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base bg-white'
const isMain = (e: CalendarEvent) => !e.source || e.source === 'case'
const localDate = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd')
const localTime = (iso: string) => format(parseISO(iso), 'HH:mm')
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString()

interface Draft { id?: string; type: 'visitation' | 'service' | 'burial'; label: string; date: string; start: string; end: string; place: string; staff: string[]; main: boolean }

/** Every visitation and service for this case. Several can be added (private + public, rosary, mass, graveside ...); all of them show on the Calendar and the TV Board. */
export function CaseEventsPanel({ caseObj: c, canEdit, currentUser }: { caseObj: FuneralCase; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const { data: all = [] } = useQuery({ queryKey: ['events'], queryFn: () => api.getCalendarEvents() })
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const events = all.filter((e) => e.caseId === c.id && (e.type === 'visitation' || e.type === 'service' || e.type === 'burial')).sort((a, b) => a.start.localeCompare(b.start))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState('')
  const names = new Map(staff.map((s) => [s.id, s.name]))
  const people = staff.filter((s) => s.locationIds.includes(c.locationId))
  const refresh = () => { for (const k of ['events', 'case', 'cases', 'board-data']) qc.invalidateQueries({ queryKey: [k] }) }

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!d.date || !d.start) throw new Error('Pick the date and the start time.')
      const start = toIso(d.date, d.start)
      const end = d.end && new Date(toIso(d.date, d.end)) > new Date(start) ? toIso(d.date, d.end) : new Date(new Date(start).getTime() + (d.type === 'visitation' ? 2 : 1) * 3600_000).toISOString()
      const who = `${c.decedent.firstName} ${c.decedent.lastName}`
      const title = `${who} — ${d.label.trim() || KIND[d.type]}`
      const place = d.place.trim() || undefined
      if (d.id) {
        await api.updateEvent(d.id, { type: d.type, title, start, end, location: place ?? '', label: d.label.trim(), participantIds: d.staff }, currentUser)
        // The case's main visitation / service also lives on the case itself; keep the two the same.
        if (d.main) await api.updateCase(c.id, d.type === 'visitation' ? { visitationDate: start, visitationEnd: end, visitationLocation: place } : { serviceDate: start, serviceLocation: place }, currentUser)
      } else {
        await api.createEvent({ orgId: c.orgId, locationId: c.locationId, caseId: c.id, title, type: d.type, start, end, location: place, label: d.label.trim() || (d.type === 'burial' ? 'Burial' : undefined), source: 'extra', participantIds: d.staff }, currentUser)
      }
    },
    onSuccess: () => { setDraft(null); setErr(''); refresh() },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not save.'),
  })
  const remove = useMutation({
    mutationFn: async (e: CalendarEvent) => {
      await api.deleteEvent(e.id, currentUser)
      if (isMain(e)) await api.updateCase(c.id, (e.type === 'visitation' ? { visitationDate: null, visitationEnd: null, visitationLocation: null } : { serviceDate: null, serviceLocation: null }) as never, currentUser)
    },
    onSuccess: refresh,
  })

  const open = (e?: CalendarEvent) => {
    setErr('')
    setDraft(e
      ? { id: e.id, type: e.type as 'visitation' | 'service' | 'burial', label: e.label ?? '', date: localDate(e.start), start: localTime(e.start), end: localTime(e.end), place: e.location ?? '', staff: e.participantIds, main: isMain(e) }
      : { type: 'visitation', label: '', date: '', start: '', end: '', place: '', staff: [], main: false })
  }

  return (
    <div className="no-print mb-4 rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Visitations, services &amp; burial</div>
          <div className="text-xs text-slate-500">Everything listed here is on the Calendar and the TV Board. Add as many as the family has.</div>
        </div>
        {canEdit && <button type="button" onClick={() => open()} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Plus size={14} /> Add one</button>}
      </div>
      {events.length === 0 ? <p className="text-sm text-slate-500">None yet. Press <b>Add one</b>, or fill in the Vital Sheet and they appear here.</p> : (
        <ul className="divide-y divide-slate-100">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className={`w-20 shrink-0 text-xs font-semibold uppercase tracking-wide ${e.type === 'visitation' ? 'text-sky-700' : e.type === 'burial' ? 'text-emerald-700' : 'text-amber-700'}`}>{KIND[e.type as keyof typeof KIND]}</span>
              <span className="font-medium text-slate-900">{e.label || (isMain(e) ? 'Main' : '')}</span>
              <span className="text-slate-700">{format(parseISO(e.start), 'EEE M/d · h:mm a')}{e.type === 'visitation' || new Date(e.end) > new Date(e.start) ? ` – ${format(parseISO(e.end), 'h:mm a')}` : ''}</span>
              {e.location && <span className="text-slate-500">{e.location}</span>}
              <span className="text-xs text-slate-400">{e.participantIds.length ? e.participantIds.map((id) => names.get(id)).filter(Boolean).join(', ') : 'no attendant yet'}</span>
              {canEdit && (
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={() => open(e)} aria-label="Edit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={14} /></button>
                  <button type="button" onClick={() => { if (confirm(`Remove this ${e.type}${e.label ? ` (${e.label})` : ''} from the Calendar and TV Board?`)) remove.mutate(e) }} aria-label="Remove" className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{draft.id ? 'Edit' : 'Add a visitation, service or burial'}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="mb-3 flex gap-2">
              {(['visitation', 'service', 'burial'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setDraft({ ...draft, type: t })} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${draft.type === t ? 'border-[#3b4a35] bg-[#3b4a35] text-white' : 'border-slate-300 text-slate-700'}`}>{KIND[t]}</button>
              ))}
            </div>
            <label className="mb-3 block text-sm font-medium text-slate-700">What is it? <span className="font-normal text-slate-400">(shows on the TV Board)</span>
              <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} list="event-labels" placeholder="e.g. Private, Public, Rosary, Mass, Graveside, Burial" className={input} />
              <datalist id="event-labels">{LABELS.map((l) => <option key={l} value={l} />)}</datalist>
            </label>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700">Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={input} /></label>
              <div className="text-sm font-medium text-slate-700">Starts<div className="mt-1"><Time24 label="Start" value={draft.start} onChange={(v) => setDraft({ ...draft, start: v })} /></div></div>
              <div className="text-sm font-medium text-slate-700">Ends <span className="font-normal text-slate-400">(optional)</span><div className="mt-1"><Time24 label="End" value={draft.end} onChange={(v) => setDraft({ ...draft, end: v })} /></div></div>
            </div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Place<input value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} placeholder="e.g. DHS, Our Lady of Soledad, Coachella Cemetery" className={input} /></label>
            <div className="mb-3">
              <div className="text-sm font-medium text-slate-700">Funeral attendants</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {people.length === 0 && <span className="text-xs text-slate-400">No staff at this location.</span>}
                {people.map((s) => {
                  const on = draft.staff.includes(s.id)
                  return <button key={s.id} type="button" onClick={() => setDraft({ ...draft, staff: on ? draft.staff.filter((x) => x !== s.id) : [...draft.staff, s.id] })} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? 'border-[#3b4a35] bg-[#3b4a35] text-white' : 'border-slate-300 text-slate-600'}`}>{s.name}</button>
                })}
              </div>
            </div>
            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
              <button type="button" disabled={save.isPending} onClick={() => save.mutate(draft)} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
