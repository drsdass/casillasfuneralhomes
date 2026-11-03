import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { loadSheets, caseDefaults } from '@/components/statement/StatementTabs'
import { StatementSheet } from '@/components/statement/StatementSheet'
import { withTaxRate, DEFAULT_TAX_RATE } from '@/lib/statementItems'
import type { QuoteFormsData } from '@/lib/quoteForms'
import type { Raw } from '@/lib/sheetEngine'
import type { FuneralCase } from '@/types'

const NONE: Record<string, Raw> = {}
const noop = () => {}

/** The real Statement of Funeral Goods and Services Selected, one page per package — the same form, wording and layout that is signed. */
export function StatementForms({ forms, order, taxRate }: { forms: QuoteFormsData; order?: string[]; taxRate?: number }) {
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  if (!sheets) return <div className="py-10 text-center text-sm text-slate-400">Loading the form…</div>
  const names = (order && order.length ? order : Object.keys(forms)).filter((n) => forms[n] && sheets.some((s) => s.name === n))
  return (
    <div>
      {names.map((n, i) => {
        const sh = sheets.find((s) => s.name === n)!
        return (
          <div key={n} className={i < names.length - 1 ? 'stmt-page' : undefined} style={i < names.length - 1 ? { marginBottom: 16 } : undefined}>
            <StatementSheet sheet={withTaxRate(sh, taxRate ?? DEFAULT_TAX_RATE)} saved={forms[n]} defaults={NONE} canEdit={false} onChange={noop} />
          </div>
        )
      })}
    </div>
  )
}

/** A case's invoice as the signed statement form(s): every ticked package, filled in as it stands now. Falls back to `fallback` when no forms are on the invoice. */
export function CaseInvoiceForms({ caseObj, fallback }: { caseObj: FuneralCase; fallback: React.ReactNode }) {
  const { data: sheets } = useQuery({ queryKey: ['statement-sheets'], queryFn: loadSheets, staleTime: Infinity })
  const { data: saved } = useQuery({ queryKey: ['case-statements', caseObj.id], queryFn: () => api.getCaseStatements(caseObj.id) })
  if (!sheets || !saved) return <>{fallback}</>
  const inv = saved['_invoice']
  const raw = typeof inv?.sources === 'string' ? inv.sources : ''
  const order = raw.split('|').filter((n) => sheets.some((s) => s.name === n))
  if (order.length === 0) return <>{fallback}</>
  const forms: QuoteFormsData = {}
  for (const n of order) forms[n] = { ...caseDefaults(sheets.find((s) => s.name === n)!, caseObj), ...(saved[n] ?? {}) }
  const rate = Number(inv?.taxRate)
  return <StatementForms forms={forms} order={order} taxRate={inv?.taxRate !== undefined && inv.taxRate !== '' && isFinite(rate) ? rate : undefined} />
}
