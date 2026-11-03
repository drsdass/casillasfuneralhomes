import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Printer, Mail, Eye, X, Ban, Undo2, Plus, FolderPlus, FileText, ArrowLeft } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { shortLocationName, getCompanyName } from '@/lib/company'
import { money, defaultValidUntil, type QuoteLine } from '@/lib/quotes'
import { quickQuotes, quickQuoteEmailText, type QuickQuote } from '@/lib/quickQuotes'
import { summarize, withTaxRate, DEFAULT_TAX_RATE, type StatementSummary } from '@/lib/statementItems'
import type { Raw, SheetDef } from '@/lib/sheetEngine'
import { StatementSheet } from '@/components/statement/StatementSheet'
import { loadSheets } from '@/components/statement/StatementTabs'
import { QuoteView } from '@/components/quote/QuoteView'
import { freezeDates } from '@/lib/quoteForms'
import { ComposeEmail } from '@/components/ui/ComposeEmail'

const badge: Record<QuickQuote['status'], string> = { draft: 'bg-slate-100 text-slate-700', sent: 'bg-emerald-100 text-emerald-800', void: 'bg-red-50 text-red-700' }
const inputCls = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base bg-white'

/** Quotes made without a case — phone calls and walk-ins. Informational only: nothing about the person who passed is entered. */
export default function QuickQuotes() {
  const [building, setBuilding] = useState(false)
  return building ? <QuoteBuilder onDone={() => setBuilding(false)} /> : <QuoteList onNew={() => setBuilding(true)} />
}

function QuoteList({ onNew }: { onNew: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { currentUser } = useSession()
  const { data: list = [] } = useQuery({ queryKey: ['quick-quotes'], queryFn: quickQuotes.list })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => api.getLocations() })
  const [showVoid, setShowVoid] = useState(false)
  const [search, setSearch] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)
  const [autoPrint, setAutoPrint] = useState(false)
  const [emailing, setEmailing] = useState<QuickQuote | null>(null)
  const viewing = list.find((q) => q.id === viewId)
  const locOf = (q: QuickQuote) => locations.find((l) => l.id === q.locationId)
  const refresh = () => qc.invalidateQueries({ queryKey: ['quick-quotes'] })
  const patch = useMutation({ mutationFn: ({ id, p }: { id: string; p: Parameters<typeof quickQuotes.update>[1] }) => quickQuotes.update(id, p), onSuccess: refresh })

  useEffect(() => {
    if (!viewing || !autoPrint) return
    const t = window.setTimeout(() => { window.print(); setAutoPrint(false) }, 350)
    return () => window.clearTimeout(t)
  }, [viewing, autoPrint])

  const shown = list.filter((q) => (showVoid || q.status !== 'void') && (!search.trim() || `${q.label} ${q.forName} ${q.name} ${q.contactPhone ?? ''} ${q.contactEmail ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())))
  const canEdit = !!currentUser

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quick Quotes</h1>
          <p className="text-sm text-slate-500">Price an arrangement for someone who is just asking — no case needed, and nothing about the person who passed is entered. If the family comes back, turn the quote into a case in one click.</p>
        </div>
        <button type="button" onClick={onNew} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Plus size={16} /> New quote</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by number, name or phone" className="w-full sm:w-72 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} style={{ accentColor: '#3b4a35' }} /> Show voided</label>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {list.length === 0 ? <>No quick quotes yet. Press <b>New quote</b> to make the first one.</> : 'Nothing matches.'}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((q) => (
            <div key={q.id} className={`rounded-md border border-slate-200 bg-white p-4 ${q.status === 'void' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{q.forName || q.name || 'Quote'}</span>
                    <span className="text-xs text-slate-500">{q.label}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge[q.status]}`}>{q.status === 'sent' ? 'Sent' : q.status === 'void' ? 'Voided' : 'Not sent'}</span>
                    {q.convertedCaseId && <button type="button" onClick={() => navigate(`/cases/${q.convertedCaseId}`)} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200">Became a case →</button>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {shortLocationName(locOf(q)?.name ?? '')} · made {format(parseISO(q.createdAt), 'MMM d, yyyy h:mm a')}{q.createdByName ? ` by ${q.createdByName}` : ''}
                    {q.packages.length > 0 && <> · {q.packages.map((p) => p.trim()).join(' + ')}</>}
                    {q.validUntil && <> · good through {format(parseISO(q.validUntil), 'MMM d, yyyy')}</>}
                  </div>
                  {(q.contactPhone || q.contactEmail) && <div className="mt-0.5 text-xs text-slate-500">{[q.contactPhone, q.contactEmail].filter(Boolean).join(' · ')}</div>}
                  {q.sentAt && <div className="mt-0.5 text-xs text-emerald-700">Emailed to {q.sentTo} on {format(parseISO(q.sentAt), 'MMM d, yyyy h:mm a')}</div>}
                </div>
                <div className={`text-right ${q.status === 'void' ? 'line-through' : ''}`}>
                  <div className="text-lg font-semibold text-slate-900 tabular-nums">{money(q.total)}</div>
                  <div className="text-xs text-slate-500">{q.lines.length} items</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setViewId(q.id)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Eye size={14} /> View</button>
                <button type="button" onClick={() => { setViewId(q.id); setAutoPrint(true) }} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print</button>
                {canEdit && q.status !== 'void' && <button type="button" onClick={() => setEmailing(q)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Mail size={14} /> Email</button>}
                {canEdit && q.status !== 'void' && !q.convertedCaseId && <button type="button" onClick={() => navigate(`/cases/new?fromQuote=${q.id}`)} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><FolderPlus size={14} /> Make this a case</button>}
                {canEdit && (q.status === 'void'
                  ? <button type="button" onClick={() => patch.mutate({ id: q.id, p: { status: q.sentAt ? 'sent' : 'draft' } })} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Undo2 size={14} /> Restore</button>
                  : <button type="button" onClick={() => { if (confirm('Void this quote? It stays on the list, marked as voided, so there is still a record of it.')) patch.mutate({ id: q.id, p: { status: 'void' } }) }} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"><Ban size={14} /> Void</button>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <>
          <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={() => { setViewId(null); setAutoPrint(false) }}>
            <div className="my-4 w-full max-w-3xl rounded-xl bg-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 rounded-t-xl">
                <div className="font-semibold text-slate-800">{viewing.label}{viewing.status === 'void' && <span className="ml-2 text-xs font-medium text-red-600">VOIDED</span>}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print</button>
                  {canEdit && viewing.status !== 'void' && <button type="button" onClick={() => setEmailing(viewing)} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Mail size={14} /> Email</button>}
                  <button type="button" onClick={() => { setViewId(null); setAutoPrint(false) }} aria-label="Close" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
                </div>
              </div>
              <div className="p-3"><Doc q={viewing} loc={locOf(viewing)} /></div>
            </div>
          </div>
          {createPortal(<div className="print-only print-target"><Doc q={viewing} loc={locOf(viewing)} /></div>, document.body)}
        </>
      )}

      {emailing && (
        <ComposeEmail
          to={emailing.contactEmail ?? ''}
          subject={`${emailing.name ? emailing.name + ' — ' : ''}Quote ${emailing.label} from ${getCompanyName()}`}
          body={quickQuoteEmailText(emailing, locOf(emailing))}
          onSent={(to) => patch.mutate({ id: emailing.id, p: { status: 'sent', sentAt: new Date().toISOString(), sentTo: to } })}
          onClose={() => setEmailing(null)}
        />
      )}
    </div>
  )
}

function Doc({ q, loc }: { q: QuickQuote; loc?: Parameters<typeof QuoteView>[0]['location'] }) {
  return <QuoteView quote={q} label={q.label} prepared={{ name: q.forName, phone: q.contactPhone, email: q.contactEmail }} location={loc} />
}

/** The order forms with no case behind them: type prices, tick the packages, save. */
function QuoteBuilder({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const { currentUser, activeLocationId, accessibleLocations } = useSession()
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  const [locationId, setLocationId] = useState(activeLocationId || accessibleLocations[0]?.id || '')
  const [rate, setRate] = useState(String(DEFAULT_TAX_RATE))
  const [forName, setForName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [local, setLocal] = useState<Record<string, Record<string, Raw>>>({})
  const [included, setIncluded] = useState<string[]>([])
  const [view, setView] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (sheets && !view) setView(sheets[0]?.name ?? '') }, [sheets, view])
  const taxRate = (() => { const n = Number(rate.replace('%', '')); return rate.trim() !== '' && isFinite(n) && n >= 0 && n < 30 ? n : DEFAULT_TAX_RATE })()

  const defaultsFor = (sh: SheetDef): Record<string, Raw> => (sh.fields.name && forName.trim() ? { [sh.fields.name]: forName.trim().toUpperCase() } : {})
  const perSheet = useMemo(() => {
    const out = new Map<string, StatementSummary>()
    for (const sh of sheets ?? []) out.set(sh.name, summarize(withTaxRate(sh, taxRate), { ...defaultsFor(sh), ...(local[sh.name] ?? {}) }).summary)
    return out
  }, [sheets, local, taxRate, forName]) // eslint-disable-line react-hooks/exhaustive-deps
  const sheet: SheetDef | undefined = sheets?.find((s) => s.name === view)
  const chosen = (sheets ?? []).map((s) => s.name).filter((n) => included.includes(n))
  const lines: QuoteLine[] = chosen.flatMap((n) => (perSheet.get(n)?.lines ?? []).filter((l) => l.checked && l.amount !== 0).map((l) => ({ name: l.label || 'Other charge', amount: l.amount, pkg: n })))
  const tax = Math.round(chosen.reduce((s, n) => s + (perSheet.get(n)?.tax ?? 0), 0) * 100) / 100
  const credit = Math.round(chosen.reduce((s, n) => s + (perSheet.get(n)?.credit ?? 0), 0) * 100) / 100
  const total = Math.round((lines.reduce((s, l) => s + l.amount, 0) + tax - credit) * 100) / 100
  const locName = accessibleLocations.find((l) => l.id === locationId)?.name ?? ''

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onDone} className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> All quick quotes</button>
          <h1 className="text-2xl font-semibold text-slate-900">New quote</h1>
        </div>
      </div>

      <div className="no-print grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm font-medium text-slate-700">Location
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
            {accessibleLocations.map((l) => <option key={l.id} value={l.id}>{shortLocationName(l.name)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">Sales tax %
          <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" aria-label="Sales tax percent" className={inputCls} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Who it's for <span className="font-normal text-slate-400">(optional)</span>
          <input value={forName} onChange={(e) => setForName(e.target.value)} placeholder="e.g. Phone inquiry" className={inputCls} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputCls} />
        </label>
        <label className="block text-sm font-medium text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={inputCls} />
        </label>
      </div>

      {!sheets ? <div className="py-10 text-center text-sm text-slate-400">Loading the forms…</div> : (
        <>
          <div className="no-print flex flex-wrap items-end gap-1 border-b border-slate-200">
            {sheets.map((s) => {
              const on = included.includes(s.name)
              return (
                <div key={s.name} className={`flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-t-md border border-b-0 -mb-px ${view === s.name ? 'bg-white border-slate-200' : 'bg-slate-50 border-transparent hover:bg-white'} ${on ? 'ring-1 ring-inset ring-[#3b4a35]/40' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => setIncluded((i) => (i.includes(s.name) ? i.filter((x) => x !== s.name) : [...i, s.name]))} title={on ? 'This package is in the quote — click to take it out' : 'Click to put this package in the quote'} style={{ width: 17, height: 17, accentColor: '#3b4a35' }} />
                  <button type="button" onClick={() => setView(s.name)} className={`text-left text-sm font-medium ${view === s.name ? 'text-[#3b4a35]' : 'text-slate-500 hover:text-slate-800'}`}>
                    {s.name.trim()}<span className="block text-[11px] font-normal text-slate-400">{money(perSheet.get(s.name)?.total ?? 0)}</span>
                  </button>
                </div>
              )
            })}
          </div>
          <p className="no-print text-xs text-slate-500">Open a package, type the prices, and tick the box on its tab to put it in the quote. Tick or untick single items inside it.</p>
          {sheet && (
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <StatementSheet sheet={withTaxRate(sheet, taxRate)} saved={local[view] ?? {}} defaults={defaultsFor(sheet)} canEdit onChange={(k, v) => setLocal((l) => ({ ...l, [view]: { ...(l[view] ?? {}), [k]: v } }))} />
            </div>
          )}
          <div className="no-print sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-white p-4 shadow-lg">
            <div className="text-sm text-slate-600">
              {chosen.length === 0 ? 'Tick the box on a package to put it in the quote.' : <>{chosen.map((n) => n.trim()).join(' + ')} · {lines.length} items{tax ? <> · tax {money(tax)}</> : null}</>}
              {chosen.length > 1 && <div className="text-xs text-amber-700">More than one package is ticked, so anything in both is added twice. Untick the doubled lines on each tab.</div>}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{money(total)}</div>
              <button type="button" disabled={lines.length === 0} onClick={() => setSaving(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><FileText size={15} /> Save quote</button>
            </div>
          </div>
        </>
      )}

      {saving && currentUser && (
        <SaveDialog lines={lines} total={total} onClose={() => setSaving(false)}
          onSave={async (extra) => {
            await quickQuotes.create({ locationId, locationName: locName, forName: forName.trim(), contactPhone: phone.trim() || undefined, contactEmail: email.trim() || undefined, taxRate, packages: chosen, lines, tax, credit, ...extra, forms: Object.fromEntries(chosen.map((n) => { const sh = sheets!.find((x) => x.name === n)!; return [n, freezeDates(sh, { ...defaultsFor(sh), ...(local[n] ?? {}) })] })) }, currentUser)
            qc.invalidateQueries({ queryKey: ['quick-quotes'] })
            onDone()
          }} />
      )}
    </div>
  )
}

function SaveDialog({ lines, total, onClose, onSave }: { lines: QuoteLine[]; total: number; onClose: () => void; onSave: (x: { name: string; validUntil?: string; note?: string }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const save = useMutation({ mutationFn: () => onSave({ name: name.trim(), validUntil: days > 0 ? defaultValidUntil(days) : undefined, note: note.trim() || undefined }) })
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Save this quote</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <label className="mb-3 block text-sm font-medium text-slate-700">Name to show on the quote (optional)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full Service with Cremation" className={inputCls} />
          <span className="mt-0.5 block text-xs font-normal text-slate-500">Use words a family understands. Codes like "DIR CRE" are office shorthand.</span>
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-700">Good for (days)
            <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} className={inputCls} />
          </label>
          <div className="self-end pb-2 text-right text-sm text-slate-600">{lines.length} items<div className="text-lg font-semibold text-slate-900 tabular-nums">{money(total)}</div></div>
        </div>
        <label className="mb-3 block text-sm font-medium text-slate-700">Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
        </label>
        {save.isError && <p className="mb-2 text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
          <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Saving…' : 'Save quote'}</button>
        </div>
      </div>
    </div>
  )
}
