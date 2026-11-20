import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { loadBook, caseDefaults } from '@/components/statement/StatementTabs'
import { StatementSheet } from '@/components/statement/StatementSheet'
import { pickSheet, resolveSheets, stamp } from '@/lib/statementSheets'
import { withTaxRate, repKey, DEFAULT_TAX_RATE } from '@/lib/statementItems'
import { useSession } from '@/context/SessionContext'
import type { StaffMember } from '@/types'
import type { QuoteFormsData } from '@/lib/quoteForms'
import type { Raw } from '@/lib/sheetEngine'
import type { FuneralCase } from '@/types'

const NONE: Record<string, Raw> = {}
const noop = () => {}

/** The real Statement of Funeral Goods and Services Selected, one page per package — the same form, wording and layout that is signed. */
export function StatementForms({ forms, order, taxRate }: { forms: QuoteFormsData; order?: string[]; taxRate?: number }) {
  const { data: book } = useQuery({ queryKey: ['statement-book'], queryFn: loadBook, staleTime: Infinity })
  if (!book) return <div className="py-10 text-center text-sm text-slate-400">Loading the form…</div>
  // A quote keeps the edition of the form it was made on.
  const names = (order && order.length ? order : Object.keys(forms)).filter((n) => forms[n] && pickSheet(book, n, forms[n]))
  return (
    <div>
      {names.map((n, i) => {
        const sh = pickSheet(book, n, forms[n])!
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
  const { currentUser } = useSession()
  const { data: book } = useQuery({ queryKey: ['statement-book'], queryFn: loadBook, staleTime: Infinity })
  const { data: saved } = useQuery({ queryKey: ['case-statements', caseObj.id], queryFn: () => api.getCaseStatements(caseObj.id) })
  if (!book || !saved) return <>{fallback}</>
  const sheets = resolveSheets(book, saved)
  const inv = saved['_invoice']
  const raw = typeof inv?.sources === 'string' ? inv.sources : ''
  const order = raw.split('|').filter((n) => sheets.some((s) => s.name === n))
  if (order.length === 0) return <>{fallback}</>
  const forms: QuoteFormsData = {}
  for (const n of order) forms[n] = { ...caseDefaults(sheets.find((s) => s.name === n)!, caseObj, currentUser?.name), ...(saved[n] ?? {}) }
  const rate = Number(inv?.taxRate)
  return <StatementForms forms={forms} order={order} taxRate={inv?.taxRate !== undefined && inv.taxRate !== '' && isFinite(rate) ? rate : undefined} />
}

/** Printing or sending the invoice locks in the representative's name on every form on it, so a later viewer's name never replaces it. */
export async function lockInvoiceRep(caseId: string, user: StaffMember): Promise<void> {
  const [book, saved] = await Promise.all([loadBook(), api.getCaseStatements(caseId)])
  const sheets = resolveSheets(book, saved)
  const inv = saved['_invoice']
  const order = (typeof inv?.sources === 'string' ? inv.sources : '').split('|')
  for (const n of order) {
    const sh = sheets.find((s) => s.name === n); const rk = sh && repKey(sh)
    if (sh && rk && !(rk in (saved[n] ?? {}))) await api.saveCaseStatement(caseId, n, stamp(sh, { ...(saved[n] ?? {}), [rk]: user.name.toUpperCase() }), user)
  }
}
