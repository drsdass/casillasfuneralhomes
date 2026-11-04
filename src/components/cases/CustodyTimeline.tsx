import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Plus, X, ArrowRight, Pencil, Trash2, Printer } from 'lucide-react'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { getCompanyName } from '@/lib/company'
import { api } from '@/lib/api'
import { Time24 } from '@/components/ui/DateTime24'
import { CUSTODY_STAGES, CUSTODY_STAGE_LABELS, type CustodyLogEntry, type CustodyStage, type FuneralCase, type Location, type StaffMember } from '@/types'

const input = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base bg-white'

/** Where the decedent has been and when: every move with its date and time, who recorded it, and a note — plus a way to record one (even after the fact). */
export function CustodyTimeline({ caseObj: c, canEdit, canFix, currentUser }: { caseObj: FuneralCase; canEdit: boolean; canFix: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const { data: log = [] } = useQuery({ queryKey: ['custody-log', 'case', c.id], queryFn: () => api.getCustodyLog(c.id) })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => api.getLocations() })
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  useEffect(() => { if (!printing) return; const t = window.setTimeout(() => { window.print(); setPrinting(false) }, 120); return () => window.clearTimeout(t) }, [printing])
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
      if (editId) await api.updateCustodyEntry(editId, { timestamp: at.toISOString(), toStage: stage, note: note.trim() }, currentUser)
      else await api.moveCustody(c.id, stage, currentUser, note.trim() || undefined, at.toISOString())
    },
    onSuccess: () => { setOpen(false); setEditId(null); setNote(''); setErr(''); for (const k of ['custody-log', 'case', 'cases']) qc.invalidateQueries({ queryKey: [k] }) },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not save.'),
  })

  const fc = c.firstCall
  const dod = c.decedent.dateOfDeath ? format(parseISO(c.decedent.dateOfDeath), 'EEE M/d/yyyy') : ''
  const firstCallBits = [
    fc?.timeOfDeath && `Time of death ${fc.timeOfDeath}`,
    fc?.callReceivedAt && `Call received ${fc.callReceivedAt}`,
    fc?.timeOfRemoval && `Removal ${fc.timeOfRemoval}`,
  ].filter(Boolean) as string[]

  const remove = useMutation({
    mutationFn: (e: CustodyLogEntry) => api.deleteCustodyEntry(e.id, currentUser),
    onSuccess: () => { for (const k of ['custody-log', 'case', 'cases']) qc.invalidateQueries({ queryKey: [k] }) },
  })
  const openEdit = (e: CustodyLogEntry) => { setEditId(e.id); setStage(e.toStage); setDate(format(parseISO(e.timestamp), 'yyyy-MM-dd')); setTime(format(parseISO(e.timestamp), 'HH:mm')); setNote(e.note ?? ''); setErr(''); setOpen(true) }
  const openForm = () => { setEditId(null); setStage(c.custodyStage); setDate(format(new Date(), 'yyyy-MM-dd')); setTime(format(new Date(), 'HH:mm')); setNote(''); setErr(''); setOpen(true) }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-slate-800">Chain of Custody — moves &amp; pickups</h3>
          <p className="text-xs text-slate-500">Now: <b>{CUSTODY_STAGE_LABELS[c.custodyStage]}</b>. Every move is kept here with the date and time.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPrinting(true)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print custody sheet</button>
          {canEdit && <button type="button" onClick={openForm} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Plus size={14} /> Record a move</button>}
        </div>
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
              {e.editedAt && <span className="text-[11px] text-amber-700" title={`Corrected by ${e.editedByName ?? 'staff'} on ${format(parseISO(e.editedAt), 'M/d/yyyy h:mm a')}`}>edited</span>}
              {canFix && (
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={() => openEdit(e)} aria-label="Edit date and time" title="Edit date, time or note" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={14} /></button>
                  <button type="button" onClick={() => { if (confirm(`Remove this entry (${CUSTODY_STAGE_LABELS[e.toStage]} on ${format(parseISO(e.timestamp), 'M/d/yyyy h:mm a')})? This is recorded in the Activity log.`)) remove.mutate(e) }} aria-label="Remove entry" className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </span>
              )}
              {e.note && <span className="basis-full pl-52 text-slate-700 max-sm:pl-0">“{e.note}”</span>}
            </li>
          ))}
        </ol>
      )}

      {printing && createPortal(<div className="print-only print-target"><CustodyRecord c={c} log={log} location={locations.find((l) => l.id === c.locationId)} preparedBy={currentUser.name} /></div>, document.body)}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{editId ? 'Correct this entry' : 'Record a move or pickup'}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <label className="mb-3 block text-sm font-medium text-slate-700">{editId ? 'Moved to' : `Where is ${c.decedent.firstName} now?`}
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
            <p className="mb-3 text-xs text-slate-500">{editId ? 'The entry is marked "edited" and the change is saved in the Activity log. If it is the latest move, the case location follows it.' : 'If the time is in the past, it is added to the history. The case only changes location if this is the latest move.'}</p>
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


/** The printed Chain of Custody record: who and where, the First Call details, and every move with date, time, who recorded it and notes. */
function CustodyRecord({ c, log, location, preparedBy }: { c: FuneralCase; log: CustodyLogEntry[]; location?: Location; preparedBy: string }) {
  const fc = c.firstCall
  const d = c.decedent
  const when = (iso: string) => format(parseISO(iso), 'EEE M/d/yyyy · h:mm a')
  const cell = 'border border-slate-400 px-2 py-1.5 align-top'
  return (
    <div className="bg-white text-slate-900 p-8 text-[12.5px] leading-snug" style={{ width: '100%', maxWidth: 780, margin: '0 auto' }}>
      <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-14 w-auto shrink-0" />
          <div>
            <div className="text-lg font-semibold">{getCompanyName()}</div>
            {location && <div className="text-slate-600">{location.address}, {location.city}, {location.state} {location.zip}{location.phone ? ` · ${location.phone}` : ''}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">CHAIN OF CUSTODY</div>
          <div className="text-slate-600">Case {c.caseNumber}</div>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse">
        <tbody>
          <tr>
            <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Name</div><b>{d.firstName} {d.middleName ? d.middleName + ' ' : ''}{d.lastName}</b></td>
            <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Date of birth</div>{d.dateOfBirth ? format(parseISO(d.dateOfBirth), 'M/d/yyyy') : '—'}</td>
            <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Date of death</div>{d.dateOfDeath ? format(parseISO(d.dateOfDeath), 'M/d/yyyy') : '—'}{fc?.timeOfDeath ? ` · ${fc.timeOfDeath}` : ''}</td>
          </tr>
          <tr>
            <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Place of death / pickup from</div>{fc?.locationAddress || d.placeOfDeath || '—'}</td>
            <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Call received</div>{fc?.callReceivedAt || '—'}{fc?.personCalling ? ` · ${fc.personCalling}` : ''}</td>
            <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Removal time</div>{fc?.timeOfRemoval || '—'}{fc?.callTakenBy ? ` · call taken by ${fc.callTakenBy}` : ''}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Movements</div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 text-left text-[11px] uppercase">
            <th className={cell}>Date &amp; time</th><th className={cell}>Moved</th><th className={cell}>Recorded by</th><th className={cell}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {log.length === 0 && <tr><td colSpan={4} className={cell + ' text-slate-500'}>No movements recorded.</td></tr>}
          {log.map((e) => (
            <tr key={e.id}>
              <td className={cell + ' whitespace-nowrap'}>{when(e.timestamp)}</td>
              <td className={cell}>{e.fromStage && e.fromStage !== e.toStage ? `${CUSTODY_STAGE_LABELS[e.fromStage]} → ` : ''}<b>{CUSTODY_STAGE_LABELS[e.toStage]}</b></td>
              <td className={cell}>{e.movedByName}{e.editedAt ? ' (corrected)' : ''}</td>
              <td className={cell}>{e.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 text-slate-700">Current location: <b>{CUSTODY_STAGE_LABELS[c.custodyStage]}</b></div>

      <div className="mt-10 grid grid-cols-2 gap-10">
        <div><div className="border-b border-slate-700 h-8" /><div className="mt-1 text-[11px] text-slate-600">Released by (signature, date)</div></div>
        <div><div className="border-b border-slate-700 h-8" /><div className="mt-1 text-[11px] text-slate-600">Received by (signature, date)</div></div>
      </div>
      <div className="mt-6 text-[10px] text-slate-500">Printed {format(new Date(), 'M/d/yyyy h:mm a')} by {preparedBy}</div>
    </div>
  )
}
