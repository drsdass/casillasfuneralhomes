import { format, addDays, parseISO } from 'date-fns'
import { USE_MOCK, supabase } from './supabase'
import type { FuneralCase, Location, StaffMember } from '@/types'
import type { QuoteFormsData } from './quoteForms'

export interface QuoteLine { name: string; amount: number; pkg?: string }
export type QuoteStatus = 'draft' | 'sent' | 'void'
export interface CaseQuote {
  id: string; caseId: string; number: number; name: string; status: QuoteStatus
  packages: string[]; lines: QuoteLine[]
  subtotal: number; tax: number; credit: number; total: number
  validUntil?: string; note?: string
  createdBy?: string; createdByName?: string; createdAt: string
  sentAt?: string; sentTo?: string
  /** The statement form(s) exactly as filled in when the quote was saved. */
  forms?: QuoteFormsData; taxRate?: number
}
export type NewQuote = Pick<CaseQuote, 'name' | 'packages' | 'lines' | 'tax' | 'credit' | 'validUntil' | 'note' | 'forms' | 'taxRate'>

const round = (n: number) => Math.round(n * 100) / 100
const rowToQuote = (r: any): CaseQuote => ({
  id: r.id, caseId: r.case_id, number: r.number, name: r.name ?? '', status: r.status, packages: r.packages ?? [], lines: r.lines ?? [],
  subtotal: Number(r.subtotal), tax: Number(r.tax), credit: Number(r.credit), total: Number(r.total),
  validUntil: r.valid_until ?? undefined, note: r.note ?? undefined, createdBy: r.created_by ?? undefined, createdByName: r.created_by_name ?? undefined,
  createdAt: r.created_at, sentAt: r.sent_at ?? undefined, sentTo: r.sent_to ?? undefined, forms: r.forms ?? undefined, taxRate: r.tax_rate != null ? Number(r.tax_rate) : undefined,
})

let mockQuotes: CaseQuote[] = []

export const quotes = {
  async list(caseId: string): Promise<CaseQuote[]> {
    if (USE_MOCK) return mockQuotes.filter((q) => q.caseId === caseId).sort((a, b) => b.number - a.number)
    const { data, error } = await supabase!.from('case_quotes').select('*').eq('case_id', caseId).order('number', { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToQuote)
  },

  /** Saves a copy of the prices as they are right now. Each quote gets the next number for this case. */
  async create(caseId: string, input: NewQuote, by: StaffMember): Promise<CaseQuote> {
    const subtotal = round(input.lines.reduce((s, l) => s + l.amount, 0))
    const total = round(subtotal + input.tax - input.credit)
    if (USE_MOCK) {
      const q: CaseQuote = { id: `qt-${Date.now()}`, caseId, number: Math.max(0, ...mockQuotes.filter((x) => x.caseId === caseId).map((x) => x.number)) + 1, status: 'draft',
        ...input, subtotal, total, createdBy: by.id, createdByName: by.name, createdAt: new Date().toISOString() }
      mockQuotes = [...mockQuotes, q]
      return q
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: last } = await supabase!.from('case_quotes').select('number').eq('case_id', caseId).order('number', { ascending: false }).limit(1)
      const number = ((last?.[0]?.number as number | undefined) ?? 0) + 1
      const { data, error } = await supabase!.from('case_quotes').insert({
        case_id: caseId, number, name: input.name, status: 'draft', packages: input.packages, lines: input.lines,
        subtotal, tax: input.tax, credit: input.credit, total, valid_until: input.validUntil ?? null, note: input.note ?? null,
        created_by: by.id, created_by_name: by.name, forms: input.forms ?? null, tax_rate: input.taxRate ?? null,
      }).select().single()
      if (!error) return rowToQuote(data)
      if (!/duplicate|unique/i.test(error.message)) throw error // two people saving at the same moment: try the next number
    }
    throw new Error('Could not save the quote. Please try again.')
  },

  async update(id: string, patch: Partial<Pick<CaseQuote, 'name' | 'note' | 'validUntil' | 'status' | 'sentAt' | 'sentTo'>>): Promise<void> {
    if (USE_MOCK) { mockQuotes = mockQuotes.map((q) => (q.id === id ? { ...q, ...patch } : q)); return }
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.note !== undefined) row.note = patch.note
    if (patch.validUntil !== undefined) row.valid_until = patch.validUntil || null
    if (patch.status !== undefined) row.status = patch.status
    if (patch.sentAt !== undefined) row.sent_at = patch.sentAt
    if (patch.sentTo !== undefined) row.sent_to = patch.sentTo
    const { error } = await supabase!.from('case_quotes').update(row).eq('id', id)
    if (error) throw error
  },
}

export const quoteLabel = (c: Pick<FuneralCase, 'caseNumber'>, q: Pick<CaseQuote, 'number'>) => `${c.caseNumber}-Q${q.number}`
export const defaultValidUntil = (days = 30) => format(addDays(new Date(), days), 'yyyy-MM-dd')
export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The quote written out as plain text, for the email (the same wording as the printed page). */
export function quoteEmailText(q: CaseQuote, c: FuneralCase, loc?: Location): string {
  const contact = c.contacts.find((x) => x.isPrimary) ?? c.contacts[0]
  const first = (contact?.name ?? '').trim().split(/\s+/)[0]
  const multi = new Set(q.lines.map((l) => l.pkg).filter(Boolean)).size > 1
  const out: string[] = []
  out.push(first ? `Dear ${first},` : 'Hello,', '')
  out.push(`Thank you for the opportunity to serve your family. Here is your quote ${quoteLabel(c, q)} for ${c.decedent.firstName} ${c.decedent.lastName}${q.name ? ` — ${q.name}` : ''}.`, '')
  let lastPkg: string | undefined
  for (const l of q.lines) {
    if (multi && l.pkg !== lastPkg) { out.push('', `${(l.pkg ?? '').trim()}`); lastPkg = l.pkg }
    out.push(`  ${l.name}: ${money(l.amount)}`)
  }
  out.push('', `Subtotal: ${money(q.subtotal)}`)
  if (q.tax) out.push(`Sales tax: ${money(q.tax)}`)
  if (q.credit) out.push(`Credit: -${money(q.credit)}`)
  out.push(`TOTAL: ${money(q.total)}`, '')
  if (q.validUntil) out.push(`This quote is good through ${format(parseISO(q.validUntil), 'MMMM d, yyyy')}.`)
  out.push('It is an estimate based on the goods and services listed; the final charges are those actually selected and provided.')
  if (q.note) out.push('', q.note)
  out.push('', loc?.phone ? `Please call us at ${loc.phone} with any questions.` : 'Please call us with any questions.')
  return out.join('\n')
}
