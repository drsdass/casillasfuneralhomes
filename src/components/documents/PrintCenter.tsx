import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Printer, FileText, Receipt, Route, ClipboardList, ScrollText, FilePlus2, BookOpen, Wallet, X, FileSignature } from 'lucide-react'
import { api } from '@/lib/api'
import { quotes, quoteLabel, money } from '@/lib/quotes'
import { CaseInvoiceForms, lockInvoiceRep } from '@/components/quote/StatementForms'
import { QuoteView } from '@/components/quote/QuoteView'
import { CustodyRecord } from '@/components/cases/CustodyTimeline'
import { CaseSummarySheet } from './CaseSummarySheet'
import { ReleaseAuthorizationForm, EmbalmingAuthorizationForm, PreneedDisclosureForm, FirstCallForm } from './FormTemplates'
import { SignDialog } from '@/components/signatures/SignDialog'
import { ServiceProgram, PaymentReceipt, type ProgramText } from './ProgramAndReceipt'
import type { FuneralCase, StaffMember } from '@/types'

type Job = { kind: 'program' } | { kind: 'receipt' } | { kind: 'contract' } | { kind: 'custody' } | { kind: 'summary' } | { kind: 'quote'; id: string }
export type FormKey = 'release' | 'embalming' | 'preneed' | 'first_call' | 'vital_sheet'

const FORMS: { key: FormKey; title: string; note: string }[] = [
  { key: 'first_call', title: 'First Call Sheet', note: 'Everything taken on the first call' },
  { key: 'vital_sheet', title: 'Vital Sheet', note: 'Vital statistics for the death certificate' },
  { key: 'release', title: 'Authorization for Release of Human Remains', note: 'Family signs to release the decedent' },
  { key: 'embalming', title: 'Authorization to Accept or Decline Embalming', note: 'Family signs their choice' },
  { key: 'preneed', title: 'Disclosure of Preneed Funeral Agreement', note: 'Preneed disclosure' },
]

/**
 * One place for every document that can be printed for this case. Each button builds the document from what is on the case right now
 * and sends it to the printer — nothing to open first.
 */
export function PrintCenter({ caseObj: c, canEdit, currentUser, onOpenForm, onGoTo }: {
  caseObj: FuneralCase; canEdit: boolean; currentUser: StaffMember
  onOpenForm: (k: FormKey) => void; onGoTo: (tab: 'Orders' | 'Quotes') => void
}) {
  const qc = useQueryClient()
  const [job, setJob] = useState<Job | null>(null)
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => api.getLocations() })
  const { data: list = [] } = useQuery({ queryKey: ['case-quotes', c.id], queryFn: () => quotes.list(c.id) })
  const { data: log = [] } = useQuery({ queryKey: ['custody-log', 'case', c.id], queryFn: () => api.getCustodyLog(c.id) })
  const { data: saved } = useQuery({ queryKey: ['case-statements', c.id], queryFn: () => api.getCaseStatements(c.id) })
  const { data: events = [] } = useQuery({ queryKey: ['events'], queryFn: () => api.getCalendarEvents() })
  const { data: orders = [] } = useQuery({ queryKey: ['orders', c.id], queryFn: () => api.getOrders(c.id) })
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => api.getStaff() })
  const { data: payments = [] } = useQuery({ queryKey: ['payments', c.id], queryFn: () => api.getPayments(c.id) })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: () => api.getContracts() })
  const { data: family } = useQuery({ queryKey: ['family-activity', c.id], queryFn: () => api.getFamilyActivity(c.id) })
  const [progOpen, setProgOpen] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [signItems, setSignItems] = useState<{ id: string; label: string; node: ReactNode }[] | null>(null)
  const capRef = useRef<HTMLDivElement>(null)
  const [prog, setProg] = useState<ProgramText>({ obituary: '', officiant: '', music: '', pallbearers: '', interment: '', closing: 'Thank you for celebrating the life of our loved one.' })
  useEffect(() => { if (family?.obituary?.body) setProg((p) => (p.obituary ? p : { ...p, obituary: family.obituary!.body })) }, [family])
  const contract = contracts.find((k) => k.caseId === c.id)
  const location = locations.find((l) => l.id === c.locationId)
  const hasContract = typeof saved?.['_invoice']?.sources === 'string' && String(saved['_invoice'].sources).length > 0

  // Give the printout a moment to draw (the forms load their layout first), then open the printer.
  useEffect(() => {
    if (!job) return
    const t = window.setTimeout(() => { window.print(); setJob(null) }, job.kind === 'contract' || job.kind === 'quote' ? 700 : 250)
    return () => window.clearTimeout(t)
  }, [job])

  const print = (j: Job) => {
    if (j.kind === 'contract') lockInvoiceRep(c.id, currentUser).catch(() => {}).finally(() => qc.invalidateQueries({ queryKey: ['case-statements', c.id] }))
    setJob(j)
  }

  let doc: ReactNode = null
  if (job?.kind === 'custody') doc = <CustodyRecord c={c} log={log} location={location} preparedBy={currentUser.name} />
  else if (job?.kind === 'summary') doc = <CaseSummarySheet c={c} location={location} events={events.filter((e) => e.caseId === c.id)} orders={orders} staff={staff} preparedBy={currentUser.name} />
  else if (job?.kind === 'program') doc = <ServiceProgram c={c} events={events.filter((e) => e.caseId === c.id)} text={prog} location={location} />
  else if (job?.kind === 'receipt') doc = <PaymentReceipt c={c} contract={contract} payments={payments} location={location} preparedBy={currentUser.name} />
  else if (job?.kind === 'contract') doc = <CaseInvoiceForms caseObj={c} fallback={null} />
  else if (job?.kind === 'quote') { const q = list.find((x) => x.id === job.id); if (q) doc = <QuoteView quote={q} label={quoteLabel(c, q)} caseObj={c} location={location} /> }

  // Everything that can be sent for signature — one document or several together, as one signing link and one signed PDF.
  const signables: { id: string; label: string; group: string; node: ReactNode }[] = [
    ...(hasContract ? [{ id: 'contract', label: 'Statement of Funeral Goods & Services', group: 'Contract & prices', node: <CaseInvoiceForms caseObj={c} fallback={null} /> }] : []),
    ...list.filter((q) => q.status !== 'void').map((q) => ({ id: `quote-${q.id}`, label: `Quote ${quoteLabel(c, q)}${q.name ? ` — ${q.name}` : ''}`, group: 'Contract & prices', node: <QuoteView quote={q} label={quoteLabel(c, q)} caseObj={c} location={location} /> })),
    { id: 'release', label: 'Authorization for Release of Human Remains', group: 'Forms & authorizations', node: <ReleaseAuthorizationForm c={c} /> },
    { id: 'embalming', label: 'Authorization to Accept or Decline Embalming', group: 'Forms & authorizations', node: <EmbalmingAuthorizationForm c={c} /> },
    { id: 'preneed', label: 'Disclosure of Preneed Funeral Agreement', group: 'Forms & authorizations', node: <PreneedDisclosureForm c={c} locationLicense={location?.licenseNumber ?? ''} /> },
    { id: 'first_call', label: 'First Call Sheet', group: 'Records', node: <FirstCallForm c={c} /> },
    { id: 'receipt', label: 'Payment receipt', group: 'Records', node: <PaymentReceipt c={c} contract={contract} payments={payments} location={location} preparedBy={currentUser.name} /> },
    { id: 'custody', label: 'Chain of Custody record', group: 'Records', node: <CustodyRecord c={c} log={log} location={location} preparedBy={currentUser.name} /> },
    { id: 'summary', label: 'Case summary sheet', group: 'Records', node: <CaseSummarySheet c={c} location={location} events={events.filter((e) => e.caseId === c.id)} orders={orders} staff={staff} preparedBy={currentUser.name} /> },
  ]
  const groups = [...new Set(signables.map((x) => x.group))]
  const signName = (items: { label: string }[]) => (items.length === 1 ? items[0].label : `${items.length} documents: ${items.map((i) => i.label).join(', ')}`.slice(0, 140))

  const tile = 'flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-[#3b4a35]/50 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition'
  const Tile = ({ icon, title, note, onClick, disabled, action = 'Print' }: { icon: ReactNode; title: string; note: string; onClick: () => void; disabled?: boolean; action?: string }) => (
    <button type="button" onClick={onClick} disabled={disabled} className={tile}>
      <span className="mt-0.5 rounded-md bg-[#3b4a35]/10 p-2 text-[#3b4a35]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{note}</span>
      </span>
      <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#3b4a35]">{action === 'Print' && <Printer size={13} />}{action}</span>
    </button>
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Print center</h3>
        <p className="text-xs text-slate-500">Every printable document for this case in one place. Each one is built from what is on the case right now.</p>
        {canEdit && <button type="button" onClick={() => setPickOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#3b4a35]/40 bg-[#3b4a35]/5 px-3 py-2 text-sm font-semibold text-[#3b4a35] hover:bg-[#3b4a35]/10"><FileSignature size={15} /> Send documents for signature</button>}
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contract &amp; prices</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Tile icon={<ScrollText size={16} />} title="Statement of Funeral Goods & Services" note={hasContract ? 'The contract the family signs — every package on the invoice' : 'Not built yet — fill in the Orders tab first'} onClick={() => hasContract ? print({ kind: 'contract' }) : onGoTo('Orders')} action={hasContract ? 'Print' : 'Go to Orders'} />
          <Tile icon={<Receipt size={16} />} title="Quotes" note={list.length ? `${list.length} saved — pick one below` : 'None saved yet — make one from the Orders tab'} onClick={() => onGoTo(list.length ? 'Quotes' : 'Orders')} action={list.length ? 'Open' : 'Go to Orders'} />
        </div>
        {list.length > 0 && (
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {list.map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileText size={14} className="shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1 truncate"><span className="font-medium text-slate-800">{q.name || `Quote ${q.number}`}</span> <span className="text-xs text-slate-500">· {quoteLabel(c, q)}{q.status === 'void' ? ' · voided' : ''}</span></div>
                <span className="tabular-nums text-slate-700">{money(q.total)}</span>
                <button type="button" onClick={() => print({ kind: 'quote', id: q.id })} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"><Printer size={12} /> Print</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Records</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Tile icon={<Route size={16} />} title="Chain of Custody" note={`${log.length} move${log.length === 1 ? '' : 's'} with date, time and who recorded them · signature lines`} onClick={() => print({ kind: 'custody' })} />
          <Tile icon={<Wallet size={16} />} title="Payment receipt" note={`${payments.length} payment${payments.length === 1 ? '' : 's'} · total, paid and balance due`} onClick={() => print({ kind: 'receipt' })} />
          <Tile icon={<BookOpen size={16} />} title="Service program / obituary" note="Memorial keepsake — fill in the obituary, music and pallbearers first" onClick={() => setProgOpen(true)} action="Prepare" />
          <Tile icon={<ClipboardList size={16} />} title="Case summary sheet" note="Decedent, family contacts, services and orders on one page" onClick={() => print({ kind: 'summary' })} />
        </div>
      </div>

      {canEdit && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Forms &amp; authorizations <span className="font-normal normal-case text-slate-400">— opens the form so you can print, save, send or e-sign it</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMS.map((f) => <Tile key={f.key} icon={<FilePlus2 size={16} />} title={f.title} note={f.note} onClick={() => onOpenForm(f.key)} action="Open" />)}
          </div>
        </div>
      )}

      {pickOpen && (
        <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={() => setPickOpen(false)}>
          <div className="my-4 w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between"><h3 className="font-semibold text-slate-800">Send for signature</h3><button type="button" aria-label="Close" onClick={() => setPickOpen(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <p className="mb-3 text-xs text-slate-500">Tick one or more. Everything you tick goes in one signing link: the family reads each document, signs once, and gets one signed PDF.</p>
            {groups.map((g) => (
              <div key={g} className="mb-3">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g}</div>
                {signables.filter((x) => x.group === g).map((x) => (
                  <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
                    <input type="checkbox" checked={picked.includes(x.id)} onChange={() => setPicked((p) => (p.includes(x.id) ? p.filter((i) => i !== x.id) : [...p, x.id]))} style={{ width: 17, height: 17, accentColor: '#3d5a80' }} /> {x.label}
                  </label>
                ))}
              </div>
            ))}
            {!hasContract && <p className="mb-3 text-xs text-slate-400">The Statement of Funeral Goods &amp; Services appears here once it's built on the Orders tab.</p>}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPickOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
              <button type="button" disabled={picked.length === 0} onClick={() => { setSignItems(signables.filter((x) => picked.includes(x.id))); setPickOpen(false) }} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Continue with {picked.length || ''} {picked.length === 1 ? 'document' : 'documents'}</button>
            </div>
          </div>
        </div>
      )}

      {signItems && (
        <>
          {/* Drawn off-screen so each document can be turned into the PDF that is sent. */}
          <div ref={capRef} aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 816 }}>
            {signItems.map((x) => <div key={x.id} data-sign-item className="bg-white p-6">{x.node}</div>)}
          </div>
          <SignDialog caseObj={c} documentName={signName(signItems)} currentUser={currentUser} onClose={() => { setSignItems(null); setPicked([]) }}
            getPdf={async () => { await new Promise((r) => setTimeout(r, 1200)); const { pdfFromElements } = await import('@/lib/pdfGenerator'); const els = [...(capRef.current?.querySelectorAll<HTMLElement>('[data-sign-item]') ?? [])]; if (!els.length) throw new Error('Could not prepare the documents.'); return pdfFromElements(els) }} />
        </>
      )}

      {progOpen && (
        <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6" onClick={() => setProgOpen(false)}>
          <div className="my-4 w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-800">Service program</h3><button type="button" aria-label="Close" onClick={() => setProgOpen(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <p className="mb-3 text-xs text-slate-500">The name, dates and the visitation / service times come from the case. Fill in what you want printed; leave a box empty to leave it off. (The family's obituary is filled in if they wrote one.)</p>
            {([['obituary', 'Obituary', 6], ['officiant', 'Officiant', 1], ['music', 'Music / readings', 3], ['pallbearers', 'Pallbearers', 2], ['interment', 'Interment', 1], ['closing', 'Closing line', 2]] as const).map(([k, label, rows]) => (
              <label key={k} className="mb-2 block text-sm font-medium text-slate-700">{label}
                <textarea rows={rows} value={prog[k]} onChange={(e) => setProg({ ...prog, [k]: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
            ))}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setProgOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => { setProgOpen(false); print({ kind: 'program' }) }} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Printer size={14} /> Print program</button>
            </div>
          </div>
        </div>
      )}

      {job && doc && createPortal(<div className="print-only print-target doc-fit">{doc}</div>, document.body)}
    </div>
  )
}
