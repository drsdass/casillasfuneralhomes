import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading, formatCurrency } from '@/components/ui/Primitives'
import { canEditFinancials, canEditPriceList } from '@/lib/permissions'
import { Plus, CheckCircle2, Circle, ArrowRight, Pencil, X } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import type { GplCategory, GplItem } from '@/types'

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
  const canEditPrices = currentUser ? canEditPriceList(currentUser.role) : false
  const qc = useQueryClient()
  // null = closed, 'new' = adding, otherwise the item being edited
  const [editing, setEditing] = useState<GplItem | 'new' | null>(null)
  const [form, setForm] = useState({ sku: '', name: '', category: 'service' as GplCategory, price: '', taxable: true, active: true })
  const [formError, setFormError] = useState('')
  function openForm(item: GplItem | 'new') {
    setFormError('')
    setForm(item === 'new' ? { sku: '', name: '', category: 'service', price: '', taxable: true, active: true }
      : { sku: item.sku ?? '', name: item.name, category: item.category, price: String(item.price), taxable: item.taxable, active: item.active !== false })
    setEditing(item)
  }
  const saveMutation = useMutation({
    mutationFn: async () => {
      const price = Number(form.price)
      if (!form.name.trim()) throw new Error('Please type a name.')
      if (form.price.trim() === '' || Number.isNaN(price) || price < 0) throw new Error('Please type a price, like 1250 or 89.50.')
      if (editing === 'new') {
        await api.createGplItem({ locationId: activeLocationId, sku: form.sku.trim(), name: form.name.trim(), category: form.category, price, taxable: form.taxable }, currentUser!)
      } else if (editing) {
        await api.updateGplItem(editing.id, editing, { sku: form.sku.trim(), name: form.name.trim(), category: form.category, price, taxable: form.taxable, active: form.active }, currentUser!)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gpl'] }); setEditing(null) },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Could not save.'),
  })

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
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title="Financials"
        subtitle="General price list and invoices"
        action={
          subTab === 'gpl' ? (canEditPrices ? (
            <button onClick={() => openForm('new')} className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition">
              <Plus size={16} /> New GPL Item
            </button>
          ) : undefined) : canEdit ? (
            <button className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition">
              <Plus size={16} /> New Invoice
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
                      <td className={`py-2 ${item.active === false ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{item.name}{item.active === false && <span className="ml-2 text-xs no-underline text-amber-700">(hidden from quotes)</span>}</td>
                      <td className="py-2 text-slate-400 text-xs w-20">{item.taxable ? 'Taxable' : 'Non-tax'}</td>
                      <td className="py-2 text-right font-medium text-slate-900 w-28">{formatCurrency(item.price)}</td>
                      {canEditPrices && (
                        <td className="py-2 w-20 text-right">
                          <button onClick={() => openForm(item)} className="inline-flex items-center gap-1 text-xs font-medium text-[#3b4a35] border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"><Pencil size={11} /> Edit</button>
                        </td>
                      )}
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
    {editing && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">{editing === 'new' ? 'New price list item' : 'Edit price list item'}</h3>
            <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <label className="block text-sm text-slate-600">Name (what the family sees)
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-slate-600">Price ($)
              <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm text-slate-600">Code (optional)
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-sm text-slate-600">Section
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as GplCategory })} className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
              {(Object.keys(categoryLabels) as GplCategory[]).map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.taxable} onChange={(e) => setForm({ ...form, taxable: e.target.checked })} /> Taxable</label>
          {editing !== 'new' && (
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Show on quotes (untick to hide it)</label>
          )}
          {formError && <div className="text-sm text-red-600">{formError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="text-sm px-3 py-2 rounded-md border border-slate-200 text-slate-600">Cancel</button>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="text-sm font-medium px-4 py-2 rounded-md bg-[#3b4a35] text-white disabled:opacity-60">{saveMutation.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    )}
    <ActivityPanel entityType="contract" title="Financial Activity" />
    </div>
  )
}
