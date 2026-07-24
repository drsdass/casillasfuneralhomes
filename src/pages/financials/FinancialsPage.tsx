import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading, formatCurrency } from '@/components/ui/Primitives'
import { canEditFinancials } from '@/lib/permissions'
import { Plus, CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import type { GplCategory } from '@/types'

const categoryLabels: Record<GplCategory, string> = {
  service: 'Services',
  merchandise: 'Merchandise',
  facility: 'Facilities',
  cash_advance: 'Cash Advances',
}

export default function FinancialsPage() {
  const { activeLocationId, currentUser } = useSession()
  const [subTab, setSubTab] = useState<'gpl' | 'invoices'>('invoices')
  const canEdit = currentUser ? canEditFinancials(currentUser.role) : false

  const { data: gplItems = [] } = useQuery({
    queryKey: ['gpl', activeLocationId],
    queryFn: () => api.getGplItems(activeLocationId),
  })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const { data: allCases = [] } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => api.getCases() })

  const grouped = gplItems.reduce<Record<string, typeof gplItems>>((acc, item) => {
    acc[item.category] = acc[item.category] ? [...acc[item.category], item] : [item]
    return acc
  }, {})

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title="Financials"
        subtitle="General price list and invoices"
        action={
          canEdit ? (
            <button className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition">
              <Plus size={16} /> {subTab === 'gpl' ? 'New GPL Item' : 'New Invoice'}
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {(['invoices', 'gpl'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              subTab === t ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'gpl' ? 'General Price List' : 'Invoices'}
          </button>
        ))}
      </div>

      {subTab === 'invoices' && (
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-xs text-slate-500">Full print + payment workflow lives on the Invoices screen</span>
            <Link to="/invoices" className="inline-flex items-center gap-1 text-xs font-medium text-[#3b4a35] hover:underline">
              Open Invoices <ArrowRight size={12} />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((ct) => {
                const c = allCases.find((mc) => mc.id === ct.caseId)
                return (
                  <tr key={ct.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c ? `${c.decedent.firstName} ${c.decedent.lastName}` : ct.caseId}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">{formatCurrency(ct.total)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(ct.amountPaid)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{formatCurrency(ct.total - ct.amountPaid)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ct.paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {ct.paid ? <CheckCircle2 size={11} /> : <Circle size={11} />} {ct.paid ? 'Paid' : 'Not Paid'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {contracts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {subTab === 'gpl' && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, items]) => (
            <Card key={category} className="p-4">
              <h3 className="text-sm font-medium text-slate-800 mb-3">{categoryLabels[category as GplCategory]}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 text-slate-500 w-24">{item.sku}</td>
                      <td className="py-2 text-slate-800">{item.name}</td>
                      <td className="py-2 text-slate-400 text-xs w-20">{item.taxable ? 'Taxable' : 'Non-tax'}</td>
                      <td className="py-2 text-right font-medium text-slate-900 w-28">{formatCurrency(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {gplItems.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-10">No GPL items configured for this location.</div>
          )}
        </div>
      )}
    </div>
    <ActivityPanel entityType="contract" title="Financial Activity" />
    </div>
  )
}
