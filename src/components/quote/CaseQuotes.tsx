import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Printer, Mail, Eye, X, Ban, Undo2, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { quotes, quoteEmailText, quoteLabel, money, type CaseQuote } from '@/lib/quotes'
import { ComposeEmail } from '@/components/ui/ComposeEmail'
import { getCompanyName } from '@/lib/company'
import { QuoteDocument } from './QuoteDocument'
import type { FuneralCase, StaffMember } from '@/types'

const badge: Record<CaseQuote['status'], string> = {
  draft: 'bg-slate-100 text-slate-700', sent: 'bg-emerald-100 text-emerald-800', void: 'bg-red-50 text-red-700',
}

/** Every quote saved for this case. Each one is a copy of the prices as they were, so several can go to the family. */
export function CaseQuotes({ caseObj: c, canEdit, onGoToOrders }: { caseObj: FuneralCase; canEdit: boolean; currentUser: StaffMember; onGoToOrders: () => void }) {
  const qc = useQueryClient()
  const { data: list = [] } = useQuery({ queryKey: ['case-quotes', c.id], queryFn: () => quotes.list(c.id) })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => api.getLocations() })
  const location = locations.find((l) => l.id === c.locationId)
  const [viewId, setViewId] = useState<string | null>(null)
  const [autoPrint, setAutoPrint] = useState(false)
  const [emailing, setEmailing] = useState<CaseQuote | null>(null)
  const viewing = list.find((q) => q.id === viewId)
  const refresh = () => qc.invalidateQueries({ queryKey: ['case-quotes', c.id] })
  const patch = useMutation({ mutationFn: ({ id, p }: { id: string; p: Parameters<typeof quotes.update>[1] }) => quotes.update(id, p), onSuccess: refresh })

  // "Print" from the list opens the quote and sends it to the printer once it is on screen.
  useEffect(() => {
    if (!viewing || !autoPrint) return
    const t = window.setTimeout(() => { window.print(); setAutoPrint(false) }, 350)
    return () => window.clearTimeout(t)
  }, [viewing, autoPrint])

  const contactEmail = (c.contacts.find((x) => x.isPrimary) ?? c.contacts[0])?.email ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Quotes for this family</h3>
          <p className="text-xs text-slate-500">A quote is a saved copy of the prices on the Orders tab. Save as many as the family needs; each one stays exactly as it was when it was sent.</p>
        </div>
        {canEdit && <button type="button" onClick={onGoToOrders} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4d5f45]"><FileText size={15} /> New quote from Orders</button>}
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No quotes yet. Open a package on the <button type="button" onClick={onGoToOrders} className="font-medium text-[#3b4a35] underline">Orders tab</button>, fill in the prices, and press <b>Save as quote</b>.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((q) => (
            <div key={q.id} className={`rounded-md border border-slate-200 bg-white p-4 ${q.status === 'void' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{q.name || `Quote ${q.number}`}</span>
                    <span className="text-xs text-slate-500">{quoteLabel(c, q)}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge[q.status]}`}>{q.status === 'sent' ? 'Sent' : q.status === 'void' ? 'Voided' : 'Not sent yet'}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Made {format(parseISO(q.createdAt), 'MMM d, yyyy h:mm a')}{q.createdByName ? ` by ${q.createdByName}` : ''}
                    {q.packages.length > 0 && <> · from {q.packages.map((p) => p.trim()).join(' + ')}</>}
                    {q.validUntil && <> · good through {format(parseISO(q.validUntil), 'MMM d, yyyy')}</>}
                  </div>
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
                {canEdit && q.status !== 'void' && <button type="button" onClick={() => setEmailing(q)} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Mail size={14} /> Email to family</button>}
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
                <div className="font-semibold text-slate-800">{quoteLabel(c, viewing)}{viewing.status === 'void' && <span className="ml-2 text-xs font-medium text-red-600">VOIDED</span>}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Printer size={14} /> Print</button>
                  {canEdit && viewing.status !== 'void' && <button type="button" onClick={() => setEmailing(viewing)} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Mail size={14} /> Email</button>}
                  <button type="button" onClick={() => { setViewId(null); setAutoPrint(false) }} aria-label="Close" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
                </div>
              </div>
              <div className="p-3"><QuoteDocument quote={viewing} caseObj={c} location={location} /></div>
            </div>
          </div>
          {/* The copy that goes to the printer: hidden on screen, the only thing shown when printing. */}
          {createPortal(<div className="print-only print-target"><QuoteDocument quote={viewing} caseObj={c} location={location} /></div>, document.body)}
        </>
      )}

      {emailing && (
        <ComposeEmail
          to={contactEmail}
          subject={`${emailing.name ? emailing.name + ' — ' : ''}Quote ${quoteLabel(c, emailing)} from ${getCompanyName()}`}
          body={quoteEmailText(emailing, c, location)}
          caseId={c.id}
          onSent={(to) => patch.mutate({ id: emailing.id, p: { status: 'sent', sentAt: new Date().toISOString(), sentTo: to } })}
          onClose={() => setEmailing(null)}
        />
      )}
    </div>
  )
}
