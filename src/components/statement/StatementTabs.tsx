import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, RotateCcw, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { dateToSerial, type Raw, type SheetDef } from '@/lib/sheetEngine'
import { summarize, type StatementSummary } from '@/lib/statementItems'
import type { FuneralCase, StaffMember } from '@/types'
import { StatementSheet } from './StatementSheet'
import { PaymentsPanel } from './PaymentsPanel'

let sheetsPromise: Promise<SheetDef[]> | null = null
const loadSheets = () => (sheetsPromise ??= import('@/data/statementSheets.json').then((m) => m.default as unknown as SheetDef[]))

export const ORDERS_VIEW = 'Orders & Price List'
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The person, decedent and date-of-death boxes come from the case until someone types over them. */
function caseDefaults(sheet: SheetDef, caseObj: FuneralCase): Record<string, Raw> {
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
}

/**
 * Ashlie's statement tabs for one case. Each tab is a package. Ticking the box on a tab adds that package to the
 * case's invoice; the invoice is every ticked tab added up (staff untick any line that is doubled). Payments follow.
 */
export function StatementWorkspace({ caseObj, view, onView, canEdit, currentUser }: { caseObj: FuneralCase; view: string; onView: (v: string) => void; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  const { data: savedAll } = useQuery({ queryKey: ['case-statements', caseObj.id], queryFn: () => api.getCaseStatements(caseObj.id) })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const contract = contracts.find((c) => c.caseId === caseObj.id)

  // ---- typing: saved per tab, a moment after the last keystroke ----
  const [local, setLocal] = useState<Record<string, Record<string, Raw>>>({})
  const timers = useRef<Record<string, number>>({})
  const [savedFlash, setSavedFlash] = useState(false)
  const save = useMutation({
    mutationFn: ({ sheet, data }: { sheet: string; data: Record<string, string | number> }) => api.saveCaseStatement(caseObj.id, sheet, data, currentUser),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['case-statements', caseObj.id] }); setSavedFlash(true); window.setTimeout(() => setSavedFlash(false), 1500) },
  })
  const onChange = useCallback((sheetName: string, key: string, value: Raw) => {
    setLocal((l) => {
      const next = { ...(l[sheetName] ?? {}), [key]: value }
      window.clearTimeout(timers.current[sheetName])
      const base = { ...(savedAll?.[sheetName] ?? {}), ...next }
      timers.current[sheetName] = window.setTimeout(() => save.mutate({ sheet: sheetName, data: base as Record<string, string | number> }), 500)
      return { ...l, [sheetName]: next }
    })
  }, [savedAll, save])
  useEffect(() => () => { Object.values(timers.current).forEach((t) => window.clearTimeout(t)) }, [])

  // ---- every tab worked out, so each can show its own total and the invoice can add them up ----
  const perSheet = useMemo(() => {
    const out = new Map<string, { defaults: Record<string, Raw>; saved: Record<string, Raw>; summary: StatementSummary }>()
    for (const sh of sheets ?? []) {
      const defaults = caseDefaults(sh, caseObj)
      const saved = { ...(savedAll?.[sh.name] ?? {}), ...(local[sh.name] ?? {}) }
      out.set(sh.name, { defaults, saved, summary: summarize(sh, { ...defaults, ...saved }).summary })
    }
    return out
  }, [sheets, savedAll, local, caseObj])

  // ---- which tabs are on the invoice ----
  const inv = savedAll?.['_invoice']
  const ticked = useMemo(() => {
    const raw = typeof inv?.sources === 'string' ? inv.sources : typeof inv?.source === 'string' ? inv.source : ''
    return raw.split('|').filter((n) => perSheet.has(n))
  }, [inv, perSheet])
  const setTicked = useMutation({
    mutationFn: (names: string[]) => api.saveCaseStatement(caseObj.id, '_invoice', { sources: names.join('|') }, currentUser),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-statements', caseObj.id] }),
  })
  const toggleTab = (name: string) => setTicked.mutate(ticked.includes(name) ? ticked.filter((n) => n !== name) : [...(sheets ?? []).map((s) => s.name).filter((n) => n === name || ticked.includes(n))])

  const several = ticked.length > 1
  const lines = useMemo(() => ticked.flatMap((n) => (perSheet.get(n)?.summary.lines ?? []).filter((l) => l.checked && l.amount !== 0).map((l) => ({ name: several ? `${l.label || 'Other charge'} (${n.trim()})` : (l.label || 'Other charge'), amount: l.amount }))), [ticked, perSheet, several])
  const tax = Math.round(ticked.reduce((s, n) => s + (perSheet.get(n)?.summary.tax ?? 0), 0) * 100) / 100
  const credit = Math.round(ticked.reduce((s, n) => s + (perSheet.get(n)?.summary.credit ?? 0), 0) * 100) / 100
  const grand = Math.round((lines.reduce((s, l) => s + l.amount, 0) + tax - credit) * 100) / 100

  // ---- keep the case's invoice equal to the ticked tabs ----
  const sync = useMutation({
    mutationFn: () => api.syncStatementInvoice({ caseId: caseObj.id, locationId: caseObj.locationId, sheetName: ticked.map((n) => n.trim()).join(' + ') || 'no tabs', lines, tax, credit }, currentUser),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  })
  const wanted = lines.map((l) => `${l.name}|${l.amount.toFixed(2)}`).sort().join('~')
  const onInvoice = (contract?.lineItems ?? []).filter((i) => i.source === 'statement').map((i) => `${i.name}|${(i.unitPrice * i.quantity).toFixed(2)}`).sort().join('~')
  const inSync = wanted === onInvoice && Math.abs((contract?.taxTotal ?? 0) - tax) < 0.005 && (onInvoice === '' && wanted === '' ? true : Math.abs((contract?.discount ?? 0) - credit) < 0.005)
  const syncRef = useRef(sync); syncRef.current = sync
  useEffect(() => {
    if (!canEdit || savedAll === undefined || !sheets || inSync || sync.isPending) return
    if (!contract && lines.length === 0) return // nothing ordered and no invoice yet
    const t = window.setTimeout(() => syncRef.current.mutate(), 1200)
    return () => window.clearTimeout(t)
  }, [canEdit, savedAll, sheets, inSync, sync.isPending, contract, lines.length, wanted, tax, credit])

  const names = (sheets ?? []).map((s) => s.name)
  const sheet = sheets?.find((s) => s.name === view)
  const cur = perSheet.get(view)

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-end gap-1 border-b border-slate-200">
        {names.map((n) => {
          const on = ticked.includes(n); const t = perSheet.get(n)?.summary.total ?? 0
          return (
            <div key={n} className={`flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-t-md border border-b-0 -mb-px transition ${view === n ? 'bg-white border-slate-200' : 'bg-slate-50 border-transparent hover:bg-white'} ${on ? 'ring-1 ring-inset ring-[#3b4a35]/40' : ''}`}>
              <input type="checkbox" checked={on} disabled={!canEdit || setTicked.isPending} onChange={() => toggleTab(n)} title={on ? 'This package is on the invoice — click to take it off' : 'Click to add this package to the invoice'} style={{ width: 17, height: 17, accentColor: '#3b4a35', cursor: canEdit ? 'pointer' : 'default' }} />
              <button type="button" onClick={() => onView(n)} className={`text-left text-sm font-medium ${view === n ? 'text-[#3b4a35]' : 'text-slate-500 hover:text-slate-800'}`}>
                {n.trim()}<span className="block text-[11px] font-normal text-slate-400">{money(t)}</span>
              </button>
            </div>
          )
        })}
        <button type="button" onClick={() => onView(ORDERS_VIEW)}
          className={`ml-3 px-3.5 py-2 text-sm font-medium rounded-t-md border border-b-0 -mb-px transition ${view === ORDERS_VIEW ? 'bg-white text-[#3b4a35] border-slate-200' : 'bg-slate-50 text-slate-500 border-transparent hover:text-slate-800'}`}>{ORDERS_VIEW}</button>
      </div>

      {view !== ORDERS_VIEW && (!sheet || !cur) && <div className="text-sm text-slate-400 py-10 text-center">Loading the form…</div>}
      {view !== ORDERS_VIEW && sheet && cur && (
        <>
          <div className="no-print flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-3 py-1.5 hover:bg-[#3b4a35]/5"><Printer size={15} /> Print this form</button>
            {canEdit && Object.keys(cur.saved).length > 0 && (
              <button type="button" onClick={() => { if (confirm('Clear everything typed on this tab for this case and go back to the blank form?')) { setLocal((l) => ({ ...l, [view]: {} })); save.mutate({ sheet: view, data: {} }) } }}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"><RotateCcw size={14} /> Start this tab over</button>
            )}
            <span className="text-xs text-slate-400 ml-auto">{savedFlash ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} /> Saved</span> : canEdit ? 'Tick the box on a tab to add that package to the invoice. Tick or untick single items inside it.' : 'View only.'}</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <StatementSheet sheet={sheet} saved={cur.saved} defaults={cur.defaults} canEdit={canEdit} onChange={(k, v) => onChange(view, k, v)} />
          </div>
          <div className="no-print rounded-md border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-slate-800">Invoice for this family</h3>
              <span className="ml-auto text-xs">{ticked.length === 0 && !contract ? <span className="text-slate-500">Nothing on the invoice yet</span> : inSync ? <span className="text-emerald-700">✓ Invoice is up to date</span> : <span className="text-amber-700">Updating the invoice…</span>}</span>
            </div>
            {ticked.length === 0 ? (
              <p className="text-sm text-slate-500">Tick the box on one or more tabs above to put those packages on the invoice. They are added together.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <tbody>
                    {ticked.map((n) => { const s = perSheet.get(n)!.summary; return (
                      <tr key={n} className="border-b border-slate-100">
                        <td className="py-1.5"><button type="button" onClick={() => onView(n)} className="text-[#3b4a35] font-medium hover:underline">{n.trim()}</button><span className="text-slate-400 text-xs ml-2">{s.lines.filter((l) => l.checked && l.amount !== 0).length} items</span></td>
                        <td className="py-1.5 text-right w-32">{money(s.total)}</td>
                      </tr>) })}
                    <tr><td className="py-2 font-semibold text-slate-900">{several ? 'All packages together' : 'Total'}</td><td className="py-2 text-right font-semibold text-slate-900">{money(grand)}</td></tr>
                  </tbody>
                </table>
                {several && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">More than one package is ticked, so anything in both is charged twice. Open each tab and untick the lines that are doubled. On the invoice, each line shows which package it came from.</p>}
              </>
            )}
            <PaymentsPanel caseObj={caseObj} contract={contract} canEdit={canEdit} currentUser={currentUser} />
          </div>
        </>
      )}
    </div>
  )
}
