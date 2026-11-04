import { format, parseISO } from 'date-fns'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { getCompanyName } from '@/lib/company'
import { money } from '@/lib/quotes'
import type { CalendarEvent, Contract, FuneralCase, Location, Payment, PaymentMethod } from '@/types'

const safe = (f: () => string) => { try { return f() } catch { return '' } }
const LONG = (iso?: string) => (iso ? safe(() => format(parseISO(iso), 'MMMM d, yyyy')) : '')
const when = (iso: string) => safe(() => format(parseISO(iso), 'EEEE, MMMM d · h:mm a'))

export interface ProgramText { obituary: string; officiant: string; music: string; pallbearers: string; interment: string; closing: string }

/** The memorial program: a clean one-page keepsake (name, dates, order of service, obituary, pallbearers). */
export function ServiceProgram({ c, events, text, location }: { c: FuneralCase; events: CalendarEvent[]; text: ProgramText; location?: Location }) {
  const d = c.decedent
  const evs = events.filter((e) => ['visitation', 'service', 'burial'].includes(e.type)).sort((a, b) => a.start.localeCompare(b.start))
  const yrs = `${d.dateOfBirth ? LONG(d.dateOfBirth) : ''}${d.dateOfBirth && d.dateOfDeath ? '  —  ' : ''}${d.dateOfDeath ? LONG(d.dateOfDeath) : ''}`
  const Block = ({ title, body }: { title: string; body: string }) => body.trim() ? (
    <div className="mt-5"><div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div><div className="mt-1 whitespace-pre-line">{body}</div></div>
  ) : null
  return (
    <div className="bg-white text-slate-900 px-12 py-10 text-[14px] leading-relaxed text-center" style={{ width: '100%', maxWidth: 700, margin: '0 auto' }}>
      <BrandLogo className="mx-auto h-14 w-auto" />
      <div className="mt-6 text-[12px] uppercase tracking-[0.3em] text-slate-500">In loving memory of</div>
      <div className="mt-2 font-display text-[34px] font-semibold leading-tight">{d.firstName} {d.middleName ? d.middleName + ' ' : ''}{d.lastName}</div>
      {yrs && <div className="mt-2 text-slate-600">{yrs}</div>}
      <div className="mx-auto mt-5 h-px w-24 bg-slate-400" />
      {evs.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Order of service</div>
          <div className="mt-2 space-y-2">
            {evs.map((e) => <div key={e.id}><b>{e.label || e.title}</b><div className="text-slate-600">{when(e.start)}{e.location ? ` · ${e.location}` : ''}</div></div>)}
          </div>
        </div>
      )}
      <Block title="Officiant" body={text.officiant} />
      <Block title="Music" body={text.music} />
      <Block title="Obituary" body={text.obituary} />
      <Block title="Pallbearers" body={text.pallbearers} />
      <Block title="Interment" body={text.interment} />
      {text.closing.trim() && <div className="mt-6 italic text-slate-700 whitespace-pre-line">{text.closing}</div>}
      <div className="mt-8 text-[11px] text-slate-500">{getCompanyName()}{location ? ` · ${location.address}, ${location.city}, ${location.state} ${location.zip}${location.phone ? ' · ' + location.phone : ''}` : ''}</div>
    </div>
  )
}

const METHOD: Record<PaymentMethod, string> = { cash: 'Cash', check: 'Check', credit_card: 'Credit card', ach: 'ACH / bank transfer', insurance_assignment: 'Insurance assignment', financing: 'Financing' }

/** Payment receipt: every payment taken on the case, what the contract totals, and what is still owed. */
export function PaymentReceipt({ c, contract, payments, location, preparedBy }: { c: FuneralCase; contract?: Contract; payments: Payment[]; location?: Location; preparedBy: string }) {
  const sorted = [...payments].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  const paid = sorted.reduce((s, p) => s + p.amount, 0)
  const total = contract?.total
  const cell = 'border border-slate-400 px-2 py-1.5 align-top'
  const payer = c.contacts.find((x) => x.isAuthorizingAgent) ?? c.contacts.find((x) => x.isPrimary) ?? c.contacts[0]
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
        <div className="text-right"><div className="text-xl font-bold tracking-wide">PAYMENT RECEIPT</div><div className="text-slate-600">Case {c.caseNumber}</div></div>
      </div>
      <table className="mt-4 w-full border-collapse"><tbody><tr>
        <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Services for</div><b>{c.decedent.firstName} {c.decedent.lastName}</b></td>
        <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Received from</div>{payer ? `${payer.name} (${payer.relationship})` : '—'}</td>
        <td className={cell}><div className="text-[10px] font-semibold uppercase text-slate-500">Date</div>{format(new Date(), 'M/d/yyyy')}</td>
      </tr></tbody></table>
      <div className="mt-4 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Payments received</div>
      <table className="w-full border-collapse">
        <thead><tr className="bg-slate-100 text-left text-[11px] uppercase"><th className={cell}>Date</th><th className={cell}>Method</th><th className={cell}>Reference</th><th className={cell + ' text-right'}>Amount</th></tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={4} className={cell + ' text-slate-500'}>No payments recorded yet.</td></tr>}
          {sorted.map((p) => <tr key={p.id}><td className={cell + ' whitespace-nowrap'}>{safe(() => format(parseISO(p.receivedAt), 'M/d/yyyy'))}</td><td className={cell}>{METHOD[p.method] ?? p.method}</td><td className={cell}>{p.reference ?? ''}</td><td className={cell + ' text-right tabular-nums'}>{money(p.amount)}</td></tr>)}
        </tbody>
      </table>
      <table className="mt-3 ml-auto w-64 border-collapse text-sm"><tbody>
        {total !== undefined && <tr><td className="py-0.5 text-slate-600">Contract total</td><td className="py-0.5 text-right tabular-nums">{money(total)}</td></tr>}
        <tr><td className="py-0.5 text-slate-600">Total paid</td><td className="py-0.5 text-right tabular-nums">{money(paid)}</td></tr>
        {total !== undefined && <tr className="border-t border-slate-700 font-bold"><td className="pt-1">Balance due</td><td className="pt-1 text-right tabular-nums">{money(Math.max(0, total - paid))}</td></tr>}
      </tbody></table>
      <div className="mt-10 grid grid-cols-2 gap-10">
        <div><div className="border-b border-slate-700 h-8" /><div className="mt-1 text-[11px] text-slate-600">Received by (signature)</div></div>
        <div><div className="border-b border-slate-700 h-8" /><div className="mt-1 text-[11px] text-slate-600">Date</div></div>
      </div>
      <div className="mt-6 text-[10px] text-slate-500">Printed {format(new Date(), 'M/d/yyyy h:mm a')} by {preparedBy}</div>
    </div>
  )
}
