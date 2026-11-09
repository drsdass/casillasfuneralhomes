import { format, parseISO } from 'date-fns'
import { USE_MOCK, supabase } from './supabase'
import { shortLocationName } from './company'
import { money, type QuoteLine, type QuoteStatus, type NewQuote } from './quotes'
import type { Location, StaffMember } from '@/types'
import type { QuoteFormsData } from './quoteForms'

/** An informational quote made without a case. Nothing about the person who passed is kept. */
export interface QuickQuote {
  id: string; locationId: string; year: number; seq: number; label: string
  forName: string; contactPhone?: string; contactEmail?: string; name: string; status: QuoteStatus
  taxRate: number; packages: string[]; lines: QuoteLine[]
  subtotal: number; tax: number; credit: number; total: number
  validUntil?: string; note?: string
  createdBy?: string; createdByName?: string; createdAt: string
  sentAt?: string; sentTo?: string; convertedCaseId?: string
  forms?: QuoteFormsData
}
export interface NewQuickQuote extends NewQuote { locationId: string; locationName: string; forName: string; contactPhone?: string; contactEmail?: string; taxRate: number }

const round = (n: number) => Math.round(n * 100) / 100
const rowTo = (r: any): QuickQuote => ({
  id: r.id, locationId: r.location_id, year: r.year, seq: r.seq, label: r.label, forName: r.for_name ?? '', contactPhone: r.contact_phone ?? undefined, contactEmail: r.contact_email ?? undefined,
  name: r.name ?? '', status: r.status, taxRate: Number(r.tax_rate), packages: r.packages ?? [], lines: r.lines ?? [],
  subtotal: Number(r.subtotal), tax: Number(r.tax), credit: Number(r.credit), total: Number(r.total), validUntil: r.valid_until ?? undefined, note: r.note ?? undefined,
  createdBy: r.created_by ?? undefined, createdByName: r.created_by_name ?? undefined, createdAt: r.created_at,
  sentAt: r.sent_at ?? undefined, sentTo: r.sent_to ?? undefined, convertedCaseId: r.converted_case_id ?? undefined, forms: r.forms ?? undefined,
})

/** "Cathedral City" -> CC, "Desert Hot Springs" -> DHS, "Coachella" -> COA */
export function locationCode(name: string): string {
  const words = shortLocationName(name).split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? 'Q').slice(0, 3)).toUpperCase()
}
const makeLabel = (locName: string, year: number, seq: number) => `${locationCode(locName)}-Q-${year}-${String(seq).padStart(3, '0')}`

let mock: QuickQuote[] = []

export const quickQuotes = {
  async list(): Promise<QuickQuote[]> {
    if (USE_MOCK) return [...mock].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const { data, error } = await supabase!.from('quick_quotes').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    return (data ?? []).map(rowTo)
  },
  async get(id: string): Promise<QuickQuote | undefined> {
    if (USE_MOCK) return mock.find((q) => q.id === id)
    const { data, error } = await supabase!.from('quick_quotes').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? rowTo(data) : undefined
  },
  async create(input: NewQuickQuote, by: StaffMember): Promise<QuickQuote> {
    const subtotal = round(input.lines.reduce((s, l) => s + l.amount, 0))
    const total = round(subtotal + input.tax - input.credit)
    const year = new Date().getFullYear()
    if (USE_MOCK) {
      const seq = Math.max(0, ...mock.filter((q) => q.locationId === input.locationId && q.year === year).map((q) => q.seq)) + 1
      const q: QuickQuote = { id: `qq-${Date.now()}`, locationId: input.locationId, year, seq, label: makeLabel(input.locationName, year, seq), forName: input.forName, contactPhone: input.contactPhone, contactEmail: input.contactEmail,
        name: input.name, status: 'draft', taxRate: input.taxRate, packages: input.packages, lines: input.lines, subtotal, tax: input.tax, credit: input.credit, total, validUntil: input.validUntil, note: input.note,
        forms: input.forms, createdBy: by.id, createdByName: by.name, createdAt: new Date().toISOString() }
      mock = [...mock, q]
      return q
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: last } = await supabase!.from('quick_quotes').select('seq').eq('location_id', input.locationId).eq('year', year).order('seq', { ascending: false }).limit(1)
      const seq = ((last?.[0]?.seq as number | undefined) ?? 0) + 1
      const { data, error } = await supabase!.from('quick_quotes').insert({
        location_id: input.locationId, year, seq, label: makeLabel(input.locationName, year, seq), for_name: input.forName, contact_phone: input.contactPhone ?? null, contact_email: input.contactEmail ?? null,
        name: input.name, status: 'draft', tax_rate: input.taxRate, packages: input.packages, lines: input.lines, subtotal, tax: input.tax, credit: input.credit, total,
        valid_until: input.validUntil ?? null, note: input.note ?? null, created_by: by.id, created_by_name: by.name, forms: input.forms ?? null,
      }).select().single()
      if (!error) return rowTo(data)
      if (!/duplicate|unique/i.test(error.message)) throw error
    }
    throw new Error('Could not save the quote. Please try again.')
  },
  /** Replaces what a saved quote contains (its prices, packages, who it is for) — the "edit this quote" button. The number, status and sent history stay. */
  async replace(id: string, input: NewQuickQuote): Promise<void> {
    const subtotal = round(input.lines.reduce((s, l) => s + l.amount, 0))
    const total = round(subtotal + input.tax - input.credit)
    if (USE_MOCK) {
      mock = mock.map((q) => (q.id === id ? { ...q, forName: input.forName, contactPhone: input.contactPhone, contactEmail: input.contactEmail, name: input.name, taxRate: input.taxRate, packages: input.packages, lines: input.lines, subtotal, tax: input.tax, credit: input.credit, total, validUntil: input.validUntil, note: input.note, forms: input.forms } : q))
      return
    }
    const { error } = await supabase!.from('quick_quotes').update({
      for_name: input.forName, contact_phone: input.contactPhone ?? null, contact_email: input.contactEmail ?? null, name: input.name, tax_rate: input.taxRate, packages: input.packages,
      lines: input.lines, subtotal, tax: input.tax, credit: input.credit, total, valid_until: input.validUntil ?? null, note: input.note ?? null, forms: input.forms ?? null,
    }).eq('id', id)
    if (error) throw error
  },
  /** Permanently removes a quote (used to tidy up quotes that already became a case). */
  async remove(id: string): Promise<void> {
    if (USE_MOCK) { mock = mock.filter((q) => q.id !== id); return }
    const { error } = await supabase!.from('quick_quotes').delete().eq('id', id)
    if (error) throw error
  },
  async update(id: string, patch: Partial<Pick<QuickQuote, 'status' | 'sentAt' | 'sentTo' | 'convertedCaseId'>>): Promise<void> {
    if (USE_MOCK) { mock = mock.map((q) => (q.id === id ? { ...q, ...patch } : q)); return }
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.sentAt !== undefined) row.sent_at = patch.sentAt
    if (patch.sentTo !== undefined) row.sent_to = patch.sentTo
    if (patch.convertedCaseId !== undefined) row.converted_case_id = patch.convertedCaseId
    const { error } = await supabase!.from('quick_quotes').update(row).eq('id', id)
    if (error) throw error
  },
}

/** The quote as plain text for the email. */
export function quickQuoteEmailText(q: QuickQuote, loc?: Location): string {
  const multi = new Set(q.lines.map((l) => l.pkg).filter(Boolean)).size > 1
  const out: string[] = ['Hello,', '', `Thank you for contacting us. Here is the quote ${q.label}${q.name ? ` — ${q.name}` : ''} you asked about.`, '']
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
  out.push('It is an estimate for information only; the final charges are those actually selected and provided.')
  if (q.note) out.push('', q.note)
  out.push('', loc?.phone ? `Please call us at ${loc.phone} with any questions.` : 'Please call us with any questions.')
  return out.join('\n')
}
