import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, X, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Time24 } from '@/components/ui/DateTime24'
import { CUSTODY_STAGES, CUSTODY_STAGE_LABELS, type CustodyStage, type FuneralCase, type StaffMember } from '@/types'

const input = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base bg-white'

/** Where the decedent has been and when: every move with its date and time, who recorded it, and a note — plus a way to record one (even after the fact). */
export function CustodyTimeline({ caseObj: c, canEdit, currentUser }: { caseObj: FuneralCase; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const { data: log = [] } = useQuery({ queryKey: ['custody-log', 'case', c.id], queryFn: () => api.getCustodyLog(c.id) })
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<CustodyStage>(c.custodyStage)
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(new Date(), 'HH:mm'))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      if (!date || !time) throw new Error('Pick the date and the time it happened.')
      const at = new Date(`${date}T${time}:00`)
      if (at.getTime() > Date.now() + 5 * 60 * 1000) throw new Error('That time is in the future.')
      await api.moveCustody(c.id, stage, currentUser, note.trim() || undefined, at.toISOString())
    },
    onSuccess: () => { setOpen(false); setNote(''); setErr(''); for (const k of ['custody-log', 'case', 'cases']) qc.invalidateQueries({ queryKey: [k] }) },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not save.'),
  })

  const fc = c.firstCall
  const dod = c.decedent.dateOfDeath ? format(parseISO(c.decedent.dateOfDeath), 'EEE M/d/yyyy') : ''
  const firstCallBits = [
    fc?.timeOfDeath && `Time of death ${fc.timeOfDeath}`,
    fc?.callReceivedAt && `Call received ${fc.callReceivedAt}`,
    fc?.timeOfRemoval && `Removal ${fc.timeOfRemoval}`,
  ].filter(Boolean) as string[]

  const openForm = () => { setStage(c.custodyStage); setDate(format(new Date(), 'yyyy-MM-dd')); setTime(format(new Date(), 'HH:mm')); setNote(''); setErr(''); setOpen(true) }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-800">Chain of Custody — moves &amp; pickups</h3>
          <p className="text-xs text-slate-500">Now: <b>{CUSTODY_STAGE_LABELS[c.custodyStage]}</b>. Every move is kept here with the date and time.</p>
        </div>
        {canEdit && <button type="button" onClick={openForm} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Plus size={14} /> Record a move</button>}
      </div>

      {firstCallBits.length > 0 && (
        <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <b className="text-slate-700">First Call sheet:</b> {dod && `${dod} · `}{firstCallBits.join(' · ')}{fc?.locationAddress ? ` · from ${fc.locationAddress}` : ''}{fc?.callTakenBy ? ` · call taken by ${fc.callTakenBy}` : ''}
        </div>
      )}

      {log.length === 0 ? (
        <p className="text-sm text-slate-500">No moves recorded yet. Moving the case on the Chain of Custody board, or pressing <b>Record a move</b>, adds it here.</p>
      ) : (
        <ol className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {log.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
              <span className="w-52 shrink-0 font-medium tabular-nums text-slate-900">{format(parseISO(e.timestamp), 'EEE M/d/yyyy · h:mm a')}</span>
              <span className="inline-flex items-center gap-1.5 text-slate-800">
                {e.fromStage && e.fromStage !== e.toStage && <><span className="text-slate-500">{CUSTODY_STAGE_LABELS[e.fromStage]}</span><ArrowRight size={13} className="text-slate-400" /></>}
                <b>{CUSTODY_STAGE_LABELS[e.toStage]}</b>
              </span>
              <span className="text-xs text-slate-500">by {e.movedByName}</span>
              {e.note && <span className="basis-full pl-52 text-slate-700 max-sm:pl-0">“{e.note}”</span>}
            </li>
          ))}
        </ol>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Record a move or pickup</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Where is {c.decedent.firstName} now?
              <select value={stage} onChange={(e) => setStage(e.target.value as CustodyStage)} className={input}>
                {CUSTODY_STAGES.map((st) => <option key={st} value={st}>{CUSTODY_STAGE_LABELS[st]}</option>)}
              </select>
            </label>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">Date it happened<input type="date" max={format(new Date(), 'yyyy-MM-dd')} value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
              <div className="text-sm font-medium text-slate-700">Time (24-hour)<div className="mt-1"><Time24 fine label="Time" value={time} onChange={setTime} /></div></div>
            </div>
            <label className="mb-3 block text-sm font-medium text-slate-700">Note <span className="font-normal text-slate-400">(optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Picked up from Desert Regional by Joe and Hector" className={input} />
            </label>
            <p className="mb-3 text-xs text-slate-500">If the time is in the past, it is added to the history. The case only changes location if this is the latest move.</p>
            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
              <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
