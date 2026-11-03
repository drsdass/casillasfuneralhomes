import { format, parseISO } from 'date-fns'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { getBrand, getCompanyName } from '@/lib/company'
import { money, type CaseQuote } from '@/lib/quotes'
import type { FuneralCase, Location } from '@/types'

/** The quote as a page the family sees: the same layout on screen, on paper, and (as text) in the email. */
type DocQuote = Pick<CaseQuote, 'lines' | 'subtotal' | 'tax' | 'credit' | 'total' | 'name' | 'note' | 'validUntil' | 'createdAt'>
export function QuoteDocument({ quote: q, label, caseObj: c, prepared, location }: { quote: DocQuote; label: string; caseObj?: FuneralCase; prepared?: { name?: string; phone?: string; email?: string }; location?: Location }) {
  const cc = c?.contacts.find((x) => x.isPrimary) ?? c?.contacts[0]
  const contact = c ? cc : prepared
  const groups: { pkg?: string; lines: CaseQuote['lines'] }[] = []
  for (const l of q.lines) {
    const g = groups[groups.length - 1]
    if (g && g.pkg === l.pkg) g.lines.push(l); else groups.push({ pkg: l.pkg, lines: [l] })
  }
  const showHeads = groups.length > 1
  const website = getBrand().website
  return (
    <div className="bg-white text-slate-900 p-8 text-[13px] leading-snug" style={{ width: '100%', maxWidth: 780, margin: '0 auto' }}>
      <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-14 w-auto shrink-0" />
          <div>
            <div className="text-lg font-semibold">{getCompanyName()}</div>
            {location && <div className="text-slate-600">{location.address}, {location.city}, {location.state} {location.zip}{location.phone ? ` · ${location.phone}` : ''}</div>}
            {website && <div className="text-slate-600">{website}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">QUOTE</div>
          <div className="text-slate-600">{label}</div>
          <div className="text-slate-600">{format(parseISO(q.createdAt), 'MMMM d, yyyy')}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Prepared for</div>
          <div className="font-medium">{contact?.name || (c ? 'The family' : 'Your family')}</div>
          {contact?.phone && <div className="text-slate-600">{contact.phone}</div>}
          {contact?.email && <div className="text-slate-600">{contact.email}</div>}
        </div>
        <div>
          {c ? <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">In loving memory of</div>
            <div className="font-medium">{c.decedent.firstName} {c.decedent.middleName ? c.decedent.middleName + ' ' : ''}{c.decedent.lastName}</div>
          </> : q.name ? <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Quote for</div>
            <div className="font-medium">{q.name}</div>
          </> : null}
          {c && q.name && <div className="text-slate-600">{q.name}</div>}
        </div>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          {groups.map((g, gi) => (
            <>
              {showHeads && <tr key={`h${gi}`}><td colSpan={2} className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-300">{(g.pkg ?? 'Other').trim()}</td></tr>}
              {g.lines.map((l, i) => (
                <tr key={`${gi}-${i}`} className="border-b border-slate-100">
                  <td className="py-1.5 pr-4">{l.name}</td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{money(l.amount)}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-72 space-y-1">
        <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="tabular-nums">{money(q.subtotal)}</span></div>
        {q.tax !== 0 && <div className="flex justify-between"><span className="text-slate-600">Sales tax</span><span className="tabular-nums">{money(q.tax)}</span></div>}
        {q.credit !== 0 && <div className="flex justify-between"><span className="text-slate-600">Credit</span><span className="tabular-nums">-{money(q.credit)}</span></div>}
        <div className="flex justify-between border-t-2 border-slate-800 pt-1.5 text-base font-bold"><span>Total</span><span className="tabular-nums">{money(q.total)}</span></div>
      </div>

      {q.note && <div className="mt-5 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3">{q.note}</div>}
      <div className="mt-6 text-[11px] text-slate-500 leading-relaxed">
        {q.validUntil ? `This quote is good through ${format(parseISO(q.validUntil), 'MMMM d, yyyy')}. ` : ''}
        It is an estimate based on the goods and services listed above. The final charges are those actually selected and provided, as shown on the Statement of Funeral Goods and Services Selected given to you at the time of arrangements.{c ? '' : ' This quote is for information only; no arrangements have been made.'}
      </div>
    </div>
  )
}
