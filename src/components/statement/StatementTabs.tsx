import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, RotateCcw, Check, FileText, X } from 'lucide-react'
import { api } from '@/lib/api'
import { dateToSerial, type Raw, type SheetDef } from '@/lib/sheetEngine'
import { summarize, withTaxRate, DEFAULT_TAX_RATE, type StatementSummary } from '@/lib/statementItems'
import type { FuneralCase, StaffMember } from '@/types'
import { StatementSheet } from './StatementSheet'
import { PaymentsPanel } from './PaymentsPanel'
import { freezeDates } from '@/lib/quoteForms'
import { quotes, defaultValidUntil, money as fmt, type QuoteLine } from '@/lib/quotes'

let sheetsPromise: Promise<SheetDef[]> | null = null
export const loadSheets = () => (sheetsPromise ??= import('@/data/statementSheets.json').then((m) => m.default as unknown as SheetDef[]))

export const ORDERS_VIEW = 'Orders & Price List'
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The person, decedent and date-of-death boxes come from the case until someone types over them. */
export function caseDefaults(sheet: SheetDef, caseObj: FuneralCase): Record<string, Raw> {
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
export function StatementWorkspace({ caseObj, view, onView, canEdit, currentUser, onQuoteSaved }: { caseObj: FuneralCase; view: string; onView: (v: string) => void; canEdit: boolean; currentUser: StaffMember; onQuoteSaved?: () => void }) {
  const qc = useQueryClient()
  const [quoting, setQuoting] = useState(false)
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
  const invRaw = savedAll?.['_invoice']
  const taxRate = (() => { const n = Number(invRaw?.taxRate); return invRaw?.taxRate !== undefined && invRaw?.taxRate !== '' && isFinite(n) && n >= 0 ? n : DEFAULT_TAX_RATE })()
  const perSheet = useMemo(() => {
    const out = new Map<string, { defaults: Record<string, Raw>; saved: Record<string, Raw>; summary: StatementSummary }>()
    for (const sh of sheets ?? []) {
      const defaults = caseDefaults(sh, caseObj)
      const saved = { ...(savedAll?.[sh.name] ?? {}), ...(local[sh.name] ?? {}) }
      out.set(sh.name, { defaults, saved, summary: summarize(withTaxRate(sh, taxRate), { ...defaults, ...saved }).summary })
    }
    return out
  }, [sheets, savedAll, local, caseObj, taxRate])

  // ---- which tabs are on the invoice ----
  const inv = savedAll?.['_invoice']
  const ticked = useMemo(() => {
    const raw = typeof inv?.sources === 'string' ? inv.sources : typeof inv?.source === 'string' ? inv.source : ''
    return raw.split('|').filter((n) => perSheet.has(n))
  }, [inv, perSheet])
  const setTicked = useMutation({
    mutationFn: (names: string[]) => api.saveCaseStatement(caseObj.id, '_invoice', { sources: names.join('|'), ...(invRaw?.taxRate !== undefined ? { taxRate: invRaw.taxRate as string | number } : {}) }, currentUser),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-statements', caseObj.id] }),
  })
  const toggleTab = (name: string) => setTicked.mutate(ticked.includes(name) ? ticked.filter((n) => n !== name) : [...(sheets ?? []).map((s) => s.name).filter((n) => n === name || ticked.includes(n))])

  const saveRate = useMutation({
    mutationFn: (r: string) => api.saveCaseStatement(caseObj.id, '_invoice', { sources: ticked.join('|'), taxRate: r }, currentUser),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-statements', caseObj.id] }),
  })
  const [rateDraft, setRateDraft] = useState<string | null>(null)
  const commitRate = () => { if (rateDraft === null) return; const n = Number(rateDraft.replace('%', '').trim()); if (rateDraft.trim() !== '' && isFinite(n) && n >= 0 && n < 30) saveRate.mutate(String(n)); setRateDraft(null) }
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
  useEffect(() => { if (sync.isError) sync.reset() }, [wanted, tax, credit]) // eslint-disable-line react-hooks/exhaustive-deps
  const syncRef = useRef(sync); syncRef.current = sync
  useEffect(() => {
    if (!canEdit || savedAll === undefined || !sheets || inSync || sync.isPending || sync.isError) return
    if (!contract && lines.length === 0) return // nothing ordered and no invoice yet
    const t = window.setTimeout(() => syncRef.current.mutate(), 1200)
    return () => window.clearTimeout(t)
  }, [canEdit, savedAll, sheets, inSync, sync.isPending, sync.isError, contract, lines.length, wanted, tax, credit])

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
            {canEdit && <button type="button" onClick={() => setQuoting(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#3b4a35] rounded-md px-3 py-1.5 hover:bg-[#4d5f45]"><FileText size={15} /> Save as quote</button>}
            {canEdit && Object.keys(cur.saved).length > 0 && (
              <button type="button" onClick={() => { if (confirm('Clear everything typed on this tab for this case and go back to the blank form?')) { setLocal((l) => ({ ...l, [view]: {} })); save.mutate({ sheet: view, data: {} }) } }}
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50"><RotateCcw size={14} /> Start this tab over</button>
            )}
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 ml-2" title="Sales tax differs by city. Set the rate for this case; every form on this case uses it.">
              Sales tax
              <input value={rateDraft ?? String(taxRate)} disabled={!canEdit} inputMode="decimal" aria-label="Sales tax percent"
                onFocus={(e) => { setRateDraft(String(taxRate)); e.currentTarget.select() }} onChange={(e) => setRateDraft(e.target.value)} onBlur={commitRate} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className="w-16 text-right border border-slate-300 rounded-md px-2 py-1 text-sm" />%
            </label>
            <span className="text-xs text-slate-400 ml-auto">{savedFlash ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check size={13} /> Saved</span> : canEdit ? 'Tick the box on a tab to add that package to the invoice. Tick or untick single items inside it.' : 'View only.'}</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <StatementSheet sheet={withTaxRate(sheet, taxRate)} saved={cur.saved} defaults={cur.defaults} canEdit={canEdit} onChange={(k, v) => onChange(view, k, v)} />
          </div>
          <div className="no-print rounded-md border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-slate-800">Invoice for this family</h3>
              <span className="ml-auto text-xs">{ticked.length === 0 && !contract ? <span className="text-slate-500">Nothing on the invoice yet</span> : inSync ? <span className="text-emerald-700">✓ Invoice is up to date</span> : <span className="text-amber-700">Updating the invoice…</span>}</span>
            </div>
            {sync.isError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                The invoice could not be saved, so Financials is still empty. {/source/i.test(String((sync.error as { message?: string })?.message)) ? 'The one-time database step "statement-invoice.sql" has not been run yet.' : 'Technical detail:'} <span className="text-xs text-red-500">{String((sync.error as { message?: string })?.message ?? sync.error)}</span>
                <button type="button" onClick={() => sync.mutate()} className="ml-3 underline">Try again</button>
              </div>
            )}
            {!ticked.includes(view) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <span>The form you are looking at (<strong>{view.trim()}</strong>, {money(cur.summary.total)}) is <strong>not on the invoice</strong>{ticked.length > 0 ? ' — the invoice below only adds up the ticked tabs.' : '.'}</span>
                {canEdit && <button type="button" disabled={setTicked.isPending} onClick={() => toggleTab(view)} className="ml-auto text-sm font-semibold text-white bg-[#3b4a35] rounded-md px-3 py-1 hover:bg-[#4d5f45]">Add {view.trim()} to the invoice</button>}
              </div>
            )}
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
      {quoting && (
        <SaveQuoteDialog
          names={names} current={view} perSheet={perSheet} sheets={sheets ?? []} taxRate={taxRate} caseObj={caseObj} currentUser={currentUser}
          onClose={() => setQuoting(false)}
          onSaved={() => { setQuoting(false); qc.invalidateQueries({ queryKey: ['case-quotes', caseObj.id] }); onQuoteSaved?.() }}
        />
      )}
    </div>
  )
}

/** Saves what is priced on one or more tabs as a numbered quote for this family. */
function SaveQuoteDialog({ names, current, perSheet, sheets, taxRate, caseObj, currentUser, onClose, onSaved }: {
  names: string[]; current: string
  perSheet: Map<string, { summary: StatementSummary; defaults: Record<string, Raw>; saved: Record<string, Raw> }>
  sheets: SheetDef[]; taxRate: number
  caseObj: FuneralCase; currentUser: StaffMember; onClose: () => void; onSaved: () => void
}) {
  const [picked, setPicked] = useState<string[]>([current])
  const [name, setName] = useState('')
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const chosen = names.filter((n) => picked.includes(n))
  const lines: QuoteLine[] = chosen.flatMap((n) => (perSheet.get(n)?.summary.lines ?? []).filter((l) => l.checked && l.amount !== 0).map((l) => ({ name: l.label || 'Other charge', amount: l.amount, pkg: n })))
  const tax = Math.round(chosen.reduce((s, n) => s + (perSheet.get(n)?.summary.tax ?? 0), 0) * 100) / 100
  const credit = Math.round(chosen.reduce((s, n) => s + (perSheet.get(n)?.summary.credit ?? 0), 0) * 100) / 100
  const total = Math.round((lines.reduce((s, l) => s + l.amount, 0) + tax - credit) * 100) / 100
  const toggle = (n: string) => {
    const next = picked.includes(n) ? picked.filter((x) => x !== n) : [...picked, n]
    setPicked(next)
  }
  const save = useMutation({
    mutationFn: () => quotes.create(caseObj.id, { name: name.trim(), packages: chosen, lines, tax, credit, taxRate, forms: Object.fromEntries(chosen.map((n) => [n, freezeDates(sheets.find((x) => x.name === n)!, { ...perSheet.get(n)!.defaults, ...perSheet.get(n)!.saved })])), validUntil: days > 0 ? defaultValidUntil(days) : undefined, note: note.trim() || undefined }, currentUser),
    onSuccess: onSaved,
  })
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Save as a quote</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <p className="mb-3 text-sm text-slate-600">This saves a copy of the prices as they are right now. Changing the order form later will not change a quote that is already saved.</p>
        <div className="mb-3">
          <div className="mb-1 text-sm font-medium text-slate-700">Include these packages</div>
          <div className="space-y-1">
            {names.map((n) => (
              <label key={n} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(n)} onChange={() => toggle(n)} style={{ accentColor: '#3b4a35' }} />{n.trim()}</span>
                <span className="text-slate-500 tabular-nums">{fmt(perSheet.get(n)?.summary.total ?? 0)}</span>
              </label>
            ))}
          </div>
          {chosen.length > 1 && <p className="mt-1 text-xs text-amber-700">More than one package is combined, so anything in both is added twice. Untick the doubled lines on each tab first.</p>}
        </div>
        <label className="mb-3 block text-sm font-medium text-slate-700">Name for the family to see
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Service with Cremation" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
          <span className="mt-0.5 block text-xs font-normal text-slate-500">Use words the family will understand. Names like "DIR CRE" are office shorthand and are not shown on the quote unless you type them here.</span>
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">Good for (days)
            <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
          </label>
          <div className="self-end pb-2 text-right text-sm text-slate-600">{lines.length} items<div className="text-lg font-semibold text-slate-900 tabular-nums">{fmt(total)}</div></div>
        </div>
        <label className="mb-3 block text-sm font-medium text-slate-700">Note to the family (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
        </label>
        {lines.length === 0 && <p className="mb-2 text-sm text-amber-700">Nothing is priced on the chosen package yet. Enter prices on the form first.</p>}
        {save.isError && <p className="mb-2 text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
          <button type="button" disabled={lines.length === 0 || save.isPending} onClick={() => save.mutate()} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save quote'}</button>
        </div>
      </div>
    </div>
  )
}
