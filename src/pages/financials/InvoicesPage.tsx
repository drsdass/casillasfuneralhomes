import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card, SectionHeading, formatCurrency } from '@/components/ui/Primitives'
import { Printer, CheckCircle2, Circle, ArrowLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'

export default function InvoicesPage() {
  const { currentUser, accessibleLocations } = useSession()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const { data: allCases = [] } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => api.getCases() })
  const { data: allLocations = [] } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations })

  const toggleMutation = useMutation({
    mutationFn: (contractId: string) => api.toggleContractPaid(contractId, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  })

  const accessibleLocationIds = new Set(accessibleLocations.map((l) => l.id))
  const visibleContracts = contracts.filter((ct) => accessibleLocationIds.has(ct.locationId))
  const selected = visibleContracts.find((ct) => ct.id === selectedId)
  const selectedCase = selected ? allCases.find((c) => c.id === selected.caseId) : undefined
  const selectedLocation = selected ? allLocations.find((l) => l.id === selected.locationId) : undefined

  if (selected && selectedCase) {
    return (
      <div>
        <button
          onClick={() => setSelectedId(null)}
          className="no-print inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
        >
          <ArrowLeft size={15} /> Back to invoices
        </button>

        <div className="no-print flex items-center justify-between mb-4">
          <SectionHeading title="Invoice" subtitle={selectedCase ? `${selectedCase.decedent.firstName} ${selectedCase.decedent.lastName}` : ''} />
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition"
            >
              <Printer size={15} /> Print Invoice
            </button>
            <button
              onClick={() => toggleMutation.mutate(selected.id)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-md border transition ${
                selected.paid
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              {selected.paid ? <CheckCircle2 size={15} /> : <Circle size={15} />}
              {selected.paid ? 'Paid' : 'Mark as Paid'}
            </button>
          </div>
        </div>

        <div id="invoice-print-area" className="print-target">
          <Card className="p-8 max-w-2xl">
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-12 w-auto shrink-0" />
                <div>
                  <div className="font-display text-lg font-semibold text-[#3b4a35]">Casillas Funeral Home</div>
                  {selectedLocation && (
                    <div className="text-xs text-slate-500 mt-1">
                      {selectedLocation.address}, {selectedLocation.city}, {selectedLocation.state} {selectedLocation.zip}
                      <br />{selectedLocation.phone} · {selectedLocation.licenseNumber}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wide">Invoice</div>
                <div className="text-sm font-medium text-slate-800">{selected.id.toUpperCase()}</div>
                <div className="text-xs text-slate-400 mt-1">{format(parseISO(selected.createdAt), 'MMM d, yyyy')}</div>
                <div className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${selected.paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {selected.paid ? 'PAID' : 'NOT PAID'}
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Decedent / Case</div>
              <div className="text-sm text-slate-800">{selectedCase.decedent.firstName} {selectedCase.decedent.lastName} — {selectedCase.caseNumber}</div>
              {selectedCase.contacts[0] && (
                <div className="text-xs text-slate-500 mt-1">
                  Billed to: {selectedCase.contacts[0].name} ({selectedCase.contacts[0].relationship})
                </div>
              )}
            </div>

            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium text-right">Unit Price</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {selected.lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 text-slate-700">{li.name}</td>
                    <td className="py-2 text-slate-500 text-right">{li.quantity}</td>
                    <td className="py-2 text-slate-500 text-right">{formatCurrency(li.unitPrice)}</td>
                    <td className="py-2 text-slate-900 text-right">{formatCurrency(li.unitPrice * li.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-56 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Tax</span><span>{formatCurrency(selected.taxTotal)}</span></div>
                <div className="flex justify-between font-semibold text-slate-900 text-base pt-1.5 border-t border-slate-100"><span>Total</span><span>{formatCurrency(selected.total)}</span></div>
                <div className="flex justify-between text-emerald-600"><span>Amount Paid</span><span>{formatCurrency(selected.amountPaid)}</span></div>
                <div className="flex justify-between text-red-500 font-medium"><span>Balance Due</span><span>{formatCurrency(selected.total - selected.amountPaid)}</span></div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionHeading
        title="Invoices"
        subtitle={currentUser ? `Signed in as ${currentUser.name}` : undefined}
      />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-medium">Case</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleContracts.map((ct) => {
              const c = allCases.find((mc) => mc.id === ct.caseId)
              return (
                <tr key={ct.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c ? `${c.decedent.firstName} ${c.decedent.lastName}` : ct.caseId}</div>
                    <div className="text-xs text-slate-400">{c?.caseNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(ct.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ct.paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {ct.paid ? <CheckCircle2 size={11} /> : <Circle size={11} />} {ct.paid ? 'Paid' : 'Not Paid'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setSelectedId(ct.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                      >
                        <Printer size={12} /> Print
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(ct.id)}
                        className={`inline-flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1.5 border transition ${
                          ct.paid
                            ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                            : 'text-amber-700 border-amber-200 hover:bg-amber-50'
                        }`}
                      >
                        {ct.paid ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                        {ct.paid ? 'Paid' : 'Mark Paid'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {visibleContracts.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No invoices for your assigned location(s).</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
