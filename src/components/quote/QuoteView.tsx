import { QuoteDocument } from './QuoteDocument'
import { StatementForms } from './StatementForms'
import type { CaseQuote } from '@/lib/quotes'
import type { QuoteFormsData } from '@/lib/quoteForms'
import type { FuneralCase, Location } from '@/types'

type Shown = Pick<CaseQuote, 'lines' | 'subtotal' | 'tax' | 'credit' | 'total' | 'name' | 'note' | 'validUntil' | 'createdAt' | 'packages'> & { forms?: QuoteFormsData; taxRate?: number }

/** A saved quote as the family sees it: the statement form itself. Quotes saved before forms were kept fall back to the simple page. */
export function QuoteView({ quote, label, caseObj, prepared, location }: { quote: Shown; label: string; caseObj?: FuneralCase; prepared?: { name?: string; phone?: string; email?: string }; location?: Location }) {
  if (quote.forms && Object.keys(quote.forms).length > 0) return <StatementForms forms={quote.forms} order={quote.packages} taxRate={quote.taxRate} />
  return <QuoteDocument quote={quote} label={label} caseObj={caseObj} prepared={prepared} location={location} />
}
