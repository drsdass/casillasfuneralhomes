import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Printer, Mail, Eye, X, Ban, Undo2, Plus, FolderPlus, FileText, ArrowLeft, Pencil, Columns3, Copy } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { shortLocationName, getCompanyName } from '@/lib/company'
import { money, defaultValidUntil, type QuoteLine } from '@/lib/quotes'
import { quickQuotes, quickQuoteEmailText, type QuickQuote } from '@/lib/quickQuotes'
import { summarize, withTaxRate, repKey, DEFAULT_TAX_RATE, type StatementSummary } from '@/lib/statementItems'
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
  const [building, setBuilding] = useState<{ from?: QuickQuote } | null>(null)
  const [compare, setCompare] = useState<{ ids: string[]; print: boolean } | null>(null)
  return building
    ? <QuoteBuilder from={building.from} onDone={(saved) => { setBuilding(null); setCompare(saved && saved.length > 1 ? { ids: saved, print: true } : null) }} />
    : <QuoteList onNew={() => setBuilding({})} onReuse={(q) => setBuilding({ from: q })} compare={compare} setCompare={setCompare} />
}

function QuoteList({ onNew, onReuse, compare, setCompare }: { onNew: () => void; onReuse: (q: QuickQuote) => void; compare: { ids: string[]; print: boolean } | null; setCompare: (c: { ids: string[]; print: boolean } | null) => void }) {
  const [picked, setPicked] = useState<string[]>([])
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
  const locOf = (q: QuickQuote) => locations.find((l) => l.id === q?.locationId)
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
        <label className="inline-flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} style={{ accentColor: '#3d5a80' }} /> Show voided</label>
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
                    <input type="checkbox" checked={picked.includes(q.id)} onChange={() => setPicked((p) => (p.includes(q.id) ? p.filter((x) => x !== q.id) : [...p, q.id]))} title="Tick two or more quotes to print them side by side" aria-label="Pick for side by side" style={{ width: 17, height: 17, accentColor: '#3d5a80' }} />
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
                {canEdit && q.status !== 'void' && <button type="button" onClick={() => onReuse(q)} title="Open this quote's prices again to change them, add the family's details, or make another version" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Edit / use this quote</button>}
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

      {picked.length >= 2 && (
        <div className="no-print sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-white p-3 shadow-lg">
          <span className="text-sm text-slate-700">{picked.length} quotes picked</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPicked([])} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600">Clear</button>
            <button type="button" onClick={() => setCompare({ ids: picked, print: false })} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white"><Columns3 size={15} /> Show side by side</button>
          </div>
        </div>
      )}

      {compare && <CompareOverlay quotes={compare.ids.map((id) => list.find((q) => q.id === id)).filter(Boolean) as QuickQuote[]} loc={locOf(list.find((q) => q.id === compare.ids[0]) ?? list[0])} autoPrint={compare.print} onClose={() => setCompare(null)} />}

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

/** Several quotes in columns, one row per item, so a family can see what each choice changes. Prints sideways. */
function CompareSheet({ quotes, loc }: { quotes: QuickQuote[]; loc?: Parameters<typeof QuoteView>[0]['location'] }) {
  const keyOf = (l: QuoteLine) => `${l.pkg ?? ''}|${l.name}`
  const rows: { key: string; name: string }[] = []
  for (const q of quotes) for (const l of q.lines) if (!rows.some((r) => r.key === keyOf(l))) rows.push({ key: keyOf(l), name: l.name })
  const forName = quotes.find((q) => q.forName)?.forName
  const th = 'border border-slate-300 bg-slate-100 px-2 py-1.5 text-right text-sm font-semibold align-bottom'
  const td = 'border border-slate-200 px-2 py-1 text-right text-sm tabular-nums'
  return (
    <div className="bg-white p-4 text-slate-900">
      <style>{'@media print { @page { size: landscape; margin: 12mm; } }'}</style>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div><div className="text-xl font-semibold">{getCompanyName()}</div><div className="text-sm text-slate-600">Your choices side by side{forName ? ` — ${forName}` : ''}</div></div>
        <div className="text-right text-xs text-slate-500">{format(new Date(), 'MMMM d, yyyy')}{loc?.phone ? <><br />{loc.phone}</> : null}</div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${th} text-left`}>&nbsp;</th>
            {quotes.map((q) => <th key={q.id} className={th}>{q.name || q.label}<div className="text-[11px] font-normal text-slate-500">{q.name ? q.label : ''}</div></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="border border-slate-200 px-2 py-1 text-left text-sm">{r.name}</td>
              {quotes.map((q) => { const l = q.lines.find((x) => keyOf(x) === r.key); return <td key={q.id} className={td}>{l ? money(l.amount) : <span className="text-slate-300">—</span>}</td> })}
            </tr>
          ))}
          <tr><td className="border border-slate-200 px-2 py-1 text-left text-sm font-medium">Subtotal</td>{quotes.map((q) => <td key={q.id} className={td}>{money(q.subtotal)}</td>)}</tr>
          {quotes.some((q) => q.tax) && <tr><td className="border border-slate-200 px-2 py-1 text-left text-sm">Sales tax</td>{quotes.map((q) => <td key={q.id} className={td}>{money(q.tax)}</td>)}</tr>}
          {quotes.some((q) => q.credit) && <tr><td className="border border-slate-200 px-2 py-1 text-left text-sm">Credit</td>{quotes.map((q) => <td key={q.id} className={td}>{q.credit ? `-${money(q.credit)}` : '—'}</td>)}</tr>}
          <tr><td className="border border-slate-300 bg-slate-100 px-2 py-2 text-left text-base font-semibold">TOTAL</td>{quotes.map((q) => <td key={q.id} className="border border-slate-300 bg-slate-100 px-2 py-2 text-right text-base font-semibold tabular-nums">{money(q.total)}</td>)}</tr>
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-slate-500">These are estimates for information only; the final charges are those actually selected and provided.{quotes.some((q) => q.validUntil) ? ` Good through ${format(parseISO(quotes.find((q) => q.validUntil)!.validUntil!), 'MMMM d, yyyy')}.` : ''}</p>
    </div>
  )
}

function CompareOverlay({ quotes, loc, autoPrint, onClose }: { quotes: QuickQuote[]; loc?: Parameters<typeof QuoteView>[0]['location']; autoPrint: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!autoPrint) return
    const t = window.setTimeout(() => window.print(), 450)
    return () => window.clearTimeout(t)
  }, [autoPrint])
  if (quotes.length < 2) return null
  return (
    <>
      <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={onClose}>
        <div className="my-4 w-full max-w-6xl rounded-xl bg-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 rounded-t-xl">
            <div className="font-semibold text-slate-800">Side by side</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white"><Printer size={14} /> Print</button>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>
          </div>
          <div className="overflow-x-auto p-3"><CompareSheet quotes={quotes} loc={loc} /></div>
        </div>
      </div>
      {createPortal(<div className="print-only print-target"><CompareSheet quotes={quotes} loc={loc} /></div>, document.body)}
    </>
  )
}

type Opt = { id: string; title: string; local: Record<string, Record<string, Raw>>; included: string[] }
let optSeq = 1
const newOpt = (o?: Partial<Opt>): Opt => ({ id: `o${optSeq++}`, title: '', local: {}, included: [], ...o })

/** The order forms with no case behind them: type prices, tick the packages, save. Several options can be priced for the same family; the details are typed once. */
function QuoteBuilder({ from, onDone }: { from?: QuickQuote; onDone: (savedIds?: string[]) => void }) {
  const qc = useQueryClient()
  const { currentUser, activeLocationId, accessibleLocations } = useSession()
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  const [locationId, setLocationId] = useState(from?.locationId || activeLocationId || accessibleLocations[0]?.id || '')
  const [rate, setRate] = useState(String(from?.taxRate ?? DEFAULT_TAX_RATE))
  const [forName, setForName] = useState(from?.forName ?? '')
  const [phone, setPhone] = useState(from?.contactPhone ?? '')
  const [email, setEmail] = useState(from?.contactEmail ?? '')
  const [opts, setOpts] = useState<Opt[]>(() => [newOpt(from ? { title: from.name, local: (from.forms ?? {}) as Record<string, Record<string, Raw>>, included: from.packages } : {})])
  const [active, setActive] = useState(0)
  const [view, setView] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (sheets && !view) setView(from?.packages[0] ?? sheets[0]?.name ?? '') }, [sheets, view, from])
  const taxRate = (() => { const n = Number(rate.replace('%', '')); return rate.trim() !== '' && isFinite(n) && n >= 0 && n < 30 ? n : DEFAULT_TAX_RATE })()
  const cur = opts[Math.min(active, opts.length - 1)]
  const setCur = (f: (o: Opt) => Opt) => setOpts((all) => all.map((o) => (o.id === cur.id ? f(o) : o)))

  const defaultsFor = (sh: SheetDef): Record<string, Raw> => ({ ...(sh.fields.name && forName.trim() ? { [sh.fields.name]: forName.trim().toUpperCase() } : {}), ...(repKey(sh) && currentUser ? { [repKey(sh)!]: currentUser.name.toUpperCase() } : {}) })
  // Every option is priced from the same forms; the dollar amounts are what differ.
  const priced = useMemo(() => opts.map((o) => {
    const per = new Map<string, StatementSummary>()
    for (const sh of sheets ?? []) per.set(sh.name, summarize(withTaxRate(sh, taxRate), { ...defaultsFor(sh), ...(o.local[sh.name] ?? {}) }).summary)
    const chosen = (sheets ?? []).map((s) => s.name).filter((n) => o.included.includes(n))
    const lines: QuoteLine[] = chosen.flatMap((n) => (per.get(n)?.lines ?? []).filter((l) => l.checked && l.amount !== 0).map((l) => ({ name: l.label || 'Other charge', amount: l.amount, pkg: n })))
    const tax = Math.round(chosen.reduce((s, n) => s + (per.get(n)?.tax ?? 0), 0) * 100) / 100
    const credit = Math.round(chosen.reduce((s, n) => s + (per.get(n)?.credit ?? 0), 0) * 100) / 100
    const total = Math.round((lines.reduce((s, l) => s + l.amount, 0) + tax - credit) * 100) / 100
    return { per, chosen, lines, tax, credit, total }
  }), [sheets, opts, taxRate, forName]) // eslint-disable-line react-hooks/exhaustive-deps
  const now = priced[Math.min(active, priced.length - 1)]
  const perSheet = now.per
  const sheet: SheetDef | undefined = sheets?.find((s) => s.name === view)
  const locName = accessibleLocations.find((l) => l.id === locationId)?.name ?? ''
  const usable = opts.map((o, i) => ({ o, p: priced[i] })).filter((x) => x.p.lines.length > 0)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={() => onDone()} className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14} /> All quick quotes</button>
          <h1 className="text-2xl font-semibold text-slate-900">{from ? `Using ${from.label}` : 'New quote'}</h1>
          {from && <p className="text-sm text-slate-500">Change anything, then save the changes to this quote or save it as a new one.</p>}
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

      <div className="no-print rounded-md border border-slate-200 bg-white p-3">
        <div className="mb-2 text-xs text-slate-500">Each option is its own quote for the same family. Price one, press <b>Add another option</b> to copy it, then change only the numbers.</div>
        <div className="flex flex-wrap items-center gap-2">
          {opts.map((o, i) => (
            <button key={o.id} type="button" onClick={() => setActive(i)} className={`rounded-md border px-3 py-1.5 text-left text-sm ${i === active ? 'border-[#3b4a35] bg-[#3b4a35]/10 font-semibold text-[#3b4a35]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {o.title.trim() || `Option ${i + 1}`}<span className="block text-xs font-normal tabular-nums text-slate-500">{money(priced[i]?.total ?? 0)}</span>
            </button>
          ))}
          <button type="button" onClick={() => { const c = newOpt({ title: '', local: JSON.parse(JSON.stringify(cur.local)), included: [...cur.included] }); setOpts((all) => [...all, c]); setActive(opts.length) }} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-400 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Copy size={14} /> Add another option</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={cur.title} onChange={(e) => setCur((o) => ({ ...o, title: e.target.value }))} placeholder={`Name for option ${active + 1} (e.g. Cremation with chapel service)`} className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          {opts.length > 1 && <button type="button" onClick={() => { setOpts((all) => all.filter((o) => o.id !== cur.id)); setActive(0) }} className="text-sm text-red-600 hover:underline">Remove this option</button>}
        </div>
      </div>

      {!sheets ? <div className="py-10 text-center text-sm text-slate-400">Loading the forms…</div> : (
        <>
          <div className="no-print flex flex-wrap items-end gap-1 border-b border-slate-200">
            {sheets.map((s) => {
              const on = cur.included.includes(s.name)
              return (
                <div key={s.name} className={`flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-t-md border border-b-0 -mb-px ${view === s.name ? 'bg-white border-slate-200' : 'bg-slate-50 border-transparent hover:bg-white'} ${on ? 'ring-1 ring-inset ring-[#3b4a35]/40' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => setCur((o) => ({ ...o, included: o.included.includes(s.name) ? o.included.filter((x) => x !== s.name) : [...o.included, s.name] }))} title={on ? 'This package is in the quote — click to take it out' : 'Click to put this package in the quote'} style={{ width: 17, height: 17, accentColor: '#3d5a80' }} />
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
              <StatementSheet key={`${cur.id}-${view}`} sheet={withTaxRate(sheet, taxRate)} saved={cur.local[view] ?? {}} defaults={defaultsFor(sheet)} canEdit onChange={(k, v) => setCur((o) => ({ ...o, local: { ...o.local, [view]: { ...(o.local[view] ?? {}), [k]: v } } }))} />
            </div>
          )}
          <div className="no-print sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-white p-4 shadow-lg">
            <div className="text-sm text-slate-600">
              {now.chosen.length === 0 ? 'Tick the box on a package to put it in the quote.' : <>{now.chosen.map((n) => n.trim()).join(' + ')} · {now.lines.length} items{now.tax ? <> · tax {money(now.tax)}</> : null}</>}
              {now.chosen.length > 1 && <div className="text-xs text-amber-700">More than one package is ticked, so anything in both is added twice. Untick the doubled lines on each tab.</div>}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{money(now.total)}</div>
              <button type="button" disabled={usable.length === 0} onClick={() => setSaving(true)} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><FileText size={15} /> {usable.length > 1 ? `Save ${usable.length} quotes` : 'Save quote'}</button>
            </div>
          </div>
        </>
      )}

      {saving && currentUser && (
        <SaveDialog options={usable.map(({ o, p }, i) => ({ id: o.id, title: o.title || (usable.length > 1 ? `Option ${i + 1}` : ''), lines: p.lines.length, total: p.total }))} canUpdate={!!from && !from.convertedCaseId && usable.length === 1} onClose={() => setSaving(false)}
          onSave={async (extra, mode) => {
            const made: string[] = []
            for (const { o, p } of usable) {
              const input = { locationId, locationName: locName, forName: forName.trim(), contactPhone: phone.trim() || undefined, contactEmail: email.trim() || undefined, taxRate, packages: p.chosen, lines: p.lines, tax: p.tax, credit: p.credit,
                name: extra.names[o.id] ?? '', validUntil: extra.validUntil, note: extra.note,
                forms: Object.fromEntries(p.chosen.map((n) => { const sh = sheets!.find((x) => x.name === n)!; return [n, freezeDates(sh, { ...defaultsFor(sh), ...(o.local[n] ?? {}) })] })) }
              if (mode === 'update' && from) { await quickQuotes.replace(from.id, input); made.push(from.id) }
              else made.push((await quickQuotes.create(input, currentUser)).id)
            }
            qc.invalidateQueries({ queryKey: ['quick-quotes'] })
            onDone(made)
          }} />
      )}
    </div>
  )
}

function SaveDialog({ options, canUpdate, onClose, onSave }: { options: { id: string; title: string; lines: number; total: number }[]; canUpdate: boolean; onClose: () => void; onSave: (x: { names: Record<string, string>; validUntil?: string; note?: string }, mode: 'new' | 'update') => Promise<void> }) {
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(options.map((o) => [o.id, o.title])))
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const save = useMutation({ mutationFn: (mode: 'new' | 'update') => onSave({ names: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.trim()])), validUntil: days > 0 ? defaultValidUntil(days) : undefined, note: note.trim() || undefined }, mode) })
  const many = options.length > 1
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{many ? `Save these ${options.length} quotes` : 'Save this quote'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="mb-3 space-y-2">
          {options.map((o) => (
            <label key={o.id} className="block text-sm font-medium text-slate-700">
              <span className="flex items-center justify-between">Name to show on the quote (optional)<span className="tabular-nums text-slate-900">{money(o.total)} · {o.lines} items</span></span>
              <input value={names[o.id] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [o.id]: e.target.value }))} placeholder="e.g. Full Service with Cremation" className={inputCls} />
            </label>
          ))}
          <span className="block text-xs text-slate-500">Use words a family understands. Codes like "DIR CRE" are office shorthand.</span>
        </div>
        <label className="mb-3 block text-sm font-medium text-slate-700">Good for (days)
          <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} className={inputCls} />
        </label>
        <label className="mb-3 block text-sm font-medium text-slate-700">Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
        </label>
        {save.isError && <p className="mb-2 text-sm text-red-600">{(save.error as Error).message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
          {canUpdate && <button type="button" disabled={save.isPending} onClick={() => save.mutate('update')} className="rounded-md border border-[#3b4a35] px-4 py-2 text-sm font-semibold text-[#3b4a35] disabled:opacity-50">Save changes to this quote</button>}
          <button type="button" disabled={save.isPending} onClick={() => save.mutate('new')} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? 'Saving…' : many ? 'Save & print side by side' : canUpdate ? 'Save as a new quote' : 'Save quote'}</button>
        </div>
      </div>
    </div>
  )
}
