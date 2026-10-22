import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, RotateCcw, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { dateToSerial, type Raw, type SheetDef } from '@/lib/sheetEngine'
import type { FuneralCase, StaffMember } from '@/types'
import { StatementSheet } from './StatementSheet'

let sheetsPromise: Promise<SheetDef[]> | null = null
const loadSheets = () => (sheetsPromise ??= import('@/data/statementSheets.json').then((m) => m.default as unknown as SheetDef[]))

export const ORDERS_VIEW = 'Orders & Price List'

/** The tab strip: every tab from Ashlie's quote workbook, in the same order, plus the original order tracking at the end. */
export function StatementTabBar({ view, onView }: { view: string; onView: (v: string) => void }) {
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  const names = [...(sheets ?? []).map((s) => s.name), ORDERS_VIEW]
  return (
    <div className="no-print flex flex-wrap items-end gap-1 border-b border-slate-200">
      {names.map((n) => (
        <button key={n} type="button" onClick={() => onView(n)}
          className={`px-3.5 py-2 text-sm font-medium rounded-t-md border border-b-0 -mb-px transition ${view === n ? 'bg-white text-[#3b4a35] border-slate-200' : 'bg-slate-50 text-slate-500 border-transparent hover:text-slate-800'} ${n === ORDERS_VIEW ? 'ml-3' : ''}`}>
          {n}
        </button>
      ))}
    </div>
  )
}

/** One statement form, filled from the case, calculating live and saved per case. */
export function StatementViewer({ caseObj, sheetName, canEdit, currentUser }: { caseObj: FuneralCase; sheetName: string; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  const { data: savedAll } = useQuery({ queryKey: ['case-statements', caseObj.id], queryFn: () => api.getCaseStatements(caseObj.id) })
  const sheet = sheets?.find((s) => s.name === sheetName)

  const [local, setLocal] = useState<Record<string, Record<string, Raw>>>({})
  const timers = useRef<Record<string, number>>({})
  const [savedFlash, setSavedFlash] = useState(false)
  const save = useMutation({
    mutationFn: ({ sheet, data }: { sheet: string; data: Record<string, string | number> }) => api.saveCaseStatement(caseObj.id, sheet, data, currentUser),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['case-statements', caseObj.id] }); setSavedFlash(true); window.setTimeout(() => setSavedFlash(false), 1500) },
  })

  // what is saved on the server, with anything just typed (not yet saved) on top
  const saved = useMemo(() => ({ ...(savedAll?.[sheetName] ?? {}), ...(local[sheetName] ?? {}) }), [savedAll, local, sheetName])

  const onChange = useCallback((key: string, value: Raw) => {
    setLocal((l) => {
      const next = { ...(l[sheetName] ?? {}), [key]: value }
      window.clearTimeout(timers.current[sheetName])
      const base = { ...(savedAll?.[sheetName] ?? {}), ...next }
      timers.current[sheetName] = window.setTimeout(() => save.mutate({ sheet: sheetName, data: base as Record<string, string | number> }), 500)
      return { ...l, [sheetName]: next }
    })
  }, [sheetName, savedAll, save])

  useEffect(() => () => { Object.values(timers.current).forEach((t) => window.clearTimeout(t)) }, [])

  // the person, decedent and date-of-death boxes come from the case until someone types over them
  const defaults = useMemo<Record<string, Raw>>(() => {
    if (!sheet) return {}
    const f = sheet.fields
    const contact = caseObj.contacts.find((c) => c.isPrimary) ?? caseObj.contacts[0]
    const d = caseObj.decedent
    const dec = [d.firstName, d.lastName].filter(Boolean).join(' ').toUpperCase()
    const phone = (contact?.phone ?? '').replace(/\D/g, '')
    const dod = d.dateOfDeath ? dateToSerial(new Date(d.dateOfDeath + 'T00:00:00Z')) : ''
    const out: Record<string, Raw> = {}
    if (f.name) out[f.name] = (contact?.name ?? '').toUpperCase()
    if (f.rel) out[f.rel] = (contact?.relationship ?? '').toUpperCase()
    if (f.addr) out[f.addr] = ''
    if (f.phone) out[f.phone] = phone.length === 10 ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : (contact?.phone ?? '')
    if (f.dec) out[f.dec] = dec
    if (f.dod) out[f.dod] = dod
    return out
  }, [sheet, caseObj])

  if (!sheet) return <div className="text-sm text-slate-400 py-10 text-center">Loading the form…</div>
  const hasEdits = Object.keys(savedAll?.[sheetName] ?? {}).length > 0 || Object.keys(local[sheetName] ?? {}).length > 0

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-3 py-1.5 hover:bg-[#3b4a35]/5"><Printer size={15} /> Print this form</button>
        {canEdit && hasEdits && (
          <button type="button" onClick={() => { if (confirm('Clear everything typed on this tab for this case and go back to the blank form?')) { setLocal((l) => ({ ...l, [sheetName]: {} })); save.mutate({ sheet: sheetName, data: {} }) } }}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"><RotateCcw size={14} /> Start this tab over</button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{savedFlash ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} /> Saved</span> : canEdit ? 'Tap any amount or line to type. Totals calculate by themselves and save automatically.' : 'View only.'}</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <StatementSheet sheet={sheet} saved={saved} defaults={defaults} canEdit={canEdit} onChange={onChange} />
      </div>
    </div>
  )
}
