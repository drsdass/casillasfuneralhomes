import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Printer, FileText, Receipt, Route, ClipboardList, ScrollText, FilePlus2 } from 'lucide-react'
import { api } from '@/lib/api'
import { quotes, quoteLabel, money } from '@/lib/quotes'
import { CaseInvoiceForms, lockInvoiceRep } from '@/components/quote/StatementForms'
import { QuoteView } from '@/components/quote/QuoteView'
import { CustodyRecord } from '@/components/cases/CustodyTimeline'
import { CaseSummarySheet } from './CaseSummarySheet'
import type { FuneralCase, StaffMember } from '@/types'

type Job = { kind: 'contract' } | { kind: 'custody' } | { kind: 'summary' } | { kind: 'quote'; id: string }
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
  else if (job?.kind === 'contract') doc = <CaseInvoiceForms caseObj={c} fallback={null} />
  else if (job?.kind === 'quote') { const q = list.find((x) => x.id === job.id); if (q) doc = <QuoteView quote={q} label={quoteLabel(c, q)} caseObj={c} location={location} /> }

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

      {job && doc && createPortal(<div className="print-only print-target">{doc}</div>, document.body)}
    </div>
  )
}
