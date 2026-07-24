import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, formatCurrency } from '@/components/ui/Primitives'
import { Plus, Printer, Mail, X, Trash2, Tag, DollarSign, PenTool } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { FuneralCase, Contract, GplItem, GplCategory, PaymentMethod, StaffMember } from '@/types'

const categoryLabels: Record<GplCategory, string> = {
  service: 'Services',
  merchandise: 'Merchandise',
  facility: 'Facilities',
  cash_advance: 'Cash Advances',
}
const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash', check: 'Check', credit_card: 'Credit Card', ach: 'ACH', insurance_assignment: 'Insurance Assignment', financing: 'Financing',
}

interface QuoteBuilderProps {
  caseObj: FuneralCase
  contract: Contract | undefined
  gplItems: GplItem[]
  canEdit: boolean
  currentUser: StaffMember
  onAddGplItem: (item: { id: string; name: string; price: number }) => void
  onAdjustLine: (lineItemId: string, amount: number) => void
  onRemoveLine: (lineItemId: string) => void
}

export function QuoteBuilder({ caseObj, contract, gplItems, canEdit, currentUser, onAddGplItem, onAdjustLine, onRemoveLine }: QuoteBuilderProps) {
  const [showPriceList, setShowPriceList] = useState(false)
  const [showPrintView, setShowPrintView] = useState(false)
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', caseObj.id],
    queryFn: () => api.getPayments(caseObj.id),
    enabled: !!contract,
  })
  const paymentMutation = useMutation({
    mutationFn: (input: { amount: number; method: PaymentMethod; reference?: string }) =>
      api.recordPayment({ contractId: contract!.id, caseId: caseObj.id, ...input }, currentUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', caseObj.id] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setShowRecordPayment(false)
    },
  })

  const lineItems = contract?.lineItems ?? []
  const grandTotal = lineItems.reduce((sum, li) => sum + li.quantity * (li.unitPrice + (li.adjustmentAmount ?? 0)), 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const balanceDue = grandTotal - totalPaid

  const grouped = gplItems.reduce<Record<GplCategory, GplItem[]>>((acc, item) => {
    acc[item.category] = acc[item.category] ? [...acc[item.category], item] : [item]
    return acc
  }, {} as Record<GplCategory, GplItem[]>)

  function handlePrint() {
    setShowPrintView(true)
    // Let the print-target render before invoking the browser's print dialog.
    setTimeout(() => window.print(), 50)
  }

  function handleEmail() {
    const lines = lineItems.map((li) => {
      const effective = li.unitPrice + (li.adjustmentAmount ?? 0)
      return `${li.name} — ${formatCurrency(effective)}`
    })
    const body = [
      `Quote for ${caseObj.decedent.firstName} ${caseObj.decedent.lastName}`,
      '',
      ...lines,
      '',
      `Total: ${formatCurrency(grandTotal)}`,
    ].join('\n')
    window.location.href = `mailto:?subject=${encodeURIComponent(`Quote — ${caseObj.decedent.firstName} ${caseObj.decedent.lastName}`)}&body=${encodeURIComponent(body)}`
  }

  return (
    <Card className="p-5 no-print">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-slate-800">Quote</h3>
        {canEdit && (
          <button
            onClick={() => setShowPriceList((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#3b4a35] border border-[#3b4a35]/30 rounded-md px-2.5 py-1.5 hover:bg-[#3b4a35]/5"
          >
            <Tag size={12} /> Add from Price List
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Every priced order above appears here too — this is the same invoice shown on the Financials tab.
      </p>

      {showPriceList && (
        <div className="border border-slate-100 rounded-md p-3 mb-4 max-h-64 overflow-y-auto space-y-3">
          {(Object.keys(categoryLabels) as GplCategory[]).map((cat) => (
            grouped[cat]?.length ? (
              <div key={cat}>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{categoryLabels[cat]}</div>
                <div className="space-y-0.5">
                  {grouped[cat].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onAddGplItem({ id: item.id, name: item.name, price: item.price })}
                      className="w-full flex items-center justify-between text-left text-sm px-2 py-1.5 rounded hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-1.5 text-slate-700"><Plus size={11} className="text-slate-400" /> {item.name}</span>
                      <span className="text-slate-500">{formatCurrency(item.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          ))}
        </div>
      )}

      {lineItems.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-8">Nothing on the quote yet — add items from the price list, or price an order above.</div>
      ) : (
        <div className="space-y-1">
          {lineItems.map((li) => {
            const effective = li.unitPrice + (li.adjustmentAmount ?? 0)
            const isOrderLine = !!li.serviceOrderId
            return (
              <div key={li.id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-slate-50 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-slate-800">{li.name}</div>
                  <div className="text-xs text-slate-400">List price {formatCurrency(li.unitPrice)}</div>
                </div>
                {canEdit && (
                  <div className="relative shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={li.adjustmentAmount ?? ''}
                      placeholder="0.00"
                      title="Negative = discount, positive = increase"
                      onBlur={(e) => {
                        const val = e.target.value.trim()
                        const amount = val ? Number(val) : 0
                        if (amount !== (li.adjustmentAmount ?? 0)) onAdjustLine(li.id, amount)
                      }}
                      className="w-24 pl-5 pr-2 py-1 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
                    />
                  </div>
                )}
                <span className="text-sm font-medium text-slate-900 w-20 text-right shrink-0">{formatCurrency(effective)}</span>
                {canEdit && (
                  isOrderLine ? (
                    <span className="w-6 shrink-0" title="Remove this from the Orders section above — it stays in sync automatically" />
                  ) : (
                    <button
                      onClick={() => { if (confirm(`Remove "${li.name}" from the quote?`)) onRemoveLine(li.id) }}
                      className="text-slate-400 hover:text-red-600 shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-3 px-2">
            <span className="text-sm font-medium text-slate-700">Grand Total</span>
            <span className="text-lg font-semibold text-slate-900">{formatCurrency(grandTotal)}</span>
          </div>

          {contract && (
            <div className="px-2 pt-2 pb-1">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-500">Paid</span>
                <span className="text-emerald-700 font-medium">{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Balance Due</span>
                <span className={`font-medium ${balanceDue > 0 ? 'text-slate-900' : 'text-emerald-700'}`}>{formatCurrency(Math.max(balanceDue, 0))}</span>
              </div>
              {payments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {payments.map((p) => (
                    <div key={p.id} className="text-xs text-slate-400 flex items-center justify-between">
                      <span>{format(parseISO(p.receivedAt), 'MMM d, yyyy')} · {paymentMethodLabels[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span>
                      <span className="text-slate-600 font-medium">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {canEdit && balanceDue > 0 && (
                <button
                  onClick={() => setShowRecordPayment(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md px-2.5 py-1.5 hover:bg-emerald-50"
                >
                  <DollarSign size={12} /> Record Payment
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-3">
            <button
              onClick={() => setShowSignaturePad(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50"
            >
              <PenTool size={14} /> Sign in Person
            </button>
            <button
              onClick={handleEmail}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50"
            >
              <Mail size={14} /> Email Quote
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 bg-[#3b4a35] text-white text-sm font-medium px-3.5 py-2 rounded-md hover:bg-[#4d5f45] transition"
            >
              <Printer size={14} /> Print Quote
            </button>
          </div>
        </div>
      )}

      {/* Printable version — hidden on screen, the only thing visible when window.print() fires (see the .print-target CSS rule). */}
      {showPrintView && (
        <div className="print-target" ref={printRef}>
          <button onClick={() => setShowPrintView(false)} className="no-print fixed top-4 right-4 bg-white border border-slate-200 rounded-full p-2 shadow-md">
            <X size={16} />
          </button>
          <div className="max-w-2xl mx-auto p-10">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 border-slate-800">
              <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-14 w-auto" />
              <div>
                <div className="font-display font-bold text-lg">CASILLAS FUNERAL HOME</div>
                <div className="text-xs text-slate-500">Service Quote</div>
              </div>
            </div>
            <div className="mb-6">
              <div className="text-sm text-slate-500">Prepared for</div>
              <div className="text-xl font-semibold">{caseObj.decedent.firstName} {caseObj.decedent.lastName}</div>
              <div className="text-xs text-slate-400 mt-1">{caseObj.caseNumber} · {new Date().toLocaleDateString()}</div>
            </div>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-500">
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-slate-100">
                    <td className="py-2">{li.name}</td>
                    <td className="py-2 text-right">{formatCurrency(li.unitPrice + (li.adjustmentAmount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="flex items-center gap-6 text-lg font-semibold border-t-2 border-slate-800 pt-3">
                <span>Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-10">This is a quote, not a final invoice. Prices are subject to change until arrangements are finalized.</div>
          </div>
        </div>
      )}

      {showRecordPayment && contract && (
        <RecordPaymentModal
          maxAmount={Math.max(balanceDue, 0)}
          onCancel={() => setShowRecordPayment(false)}
          onSave={(amount, method, reference) => paymentMutation.mutate({ amount, method, reference })}
          isPending={paymentMutation.isPending}
        />
      )}

      {showSignaturePad && contract && (
        <SignaturePad
          caseId={caseObj.id}
          contractId={contract.id}
          decedentName={`${caseObj.decedent.firstName} ${caseObj.decedent.lastName}`}
          currentUser={currentUser}
          onCancel={() => setShowSignaturePad(false)}
          onSigned={() => {
            setShowSignaturePad(false)
            queryClient.invalidateQueries({ queryKey: ['contracts'] })
          }}
        />
      )}
    </Card>
  )
}

function RecordPaymentModal({
  maxAmount, onCancel, onSave, isPending,
}: {
  maxAmount: number
  onCancel: () => void
  onSave: (amount: number, method: PaymentMethod, reference?: string) => void
  isPending: boolean
}) {
  const [amount, setAmount] = useState(maxAmount.toFixed(2))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Record Payment</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-slate-200 rounded-md pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
              />
            </div>
            <div className="text-xs text-slate-400 mt-1">Balance due: {formatCurrency(maxAmount)} — enter less for a partial payment</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm">
              {Object.entries(paymentMethodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reference (optional)</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, last 4 of card, etc." className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => Number(amount) > 0 && onSave(Number(amount), method, reference.trim() || undefined)}
            disabled={!Number(amount) || Number(amount) <= 0 || isPending}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      </Card>
    </div>
  )
}

/**
 * A drawn signature captured right on this device — the "hand a tablet to
 * the family while they're in the office" method, as an alternative to
 * emailing a SignRequest link for when they're not physically present.
 * Saves the signature as a real document on the case and marks the
 * contract signed.
 */
function SignaturePad({
  caseId, contractId, decedentName, currentUser, onCancel, onSigned,
}: {
  caseId: string
  contractId: string
  decedentName: string
  currentUser: StaffMember
  onCancel: () => void
  onSigned: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const point = 'touches' in e ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setDrawing(true)
    setHasSignature(true)
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e, canvas)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function clearPad() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function handleConfirm() {
    const canvas = canvasRef.current
    if (!canvas || !hasSignature) return
    setSaving(true)
    setError(null)
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture signature'))), 'image/png')
      })
      const path = await api.uploadCaseFile(caseId, blob, `Quote Signature — ${signerName || 'signed in person'}.png`)
      await api.addDocument({
        caseId, name: `Quote Signature${signerName ? ` — ${signerName}` : ''} (in-person)`, category: 'contract', url: path, uploadedBy: currentUser.id,
      }, currentUser)
      await api.markContractSigned(contractId, currentUser)
      onSigned()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the signature.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="p-5 w-full max-w-lg">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800">Sign Quote — {decedentName}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-3">Hand this device to the family member signing. Draw below with a finger or mouse.</p>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Signer's name"
          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
        />
        <canvas
          ref={canvasRef}
          width={460}
          height={180}
          className="w-full border border-slate-300 rounded-md bg-white touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={() => setDrawing(false)}
          onMouseLeave={() => setDrawing(false)}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={() => setDrawing(false)}
        />
        <button onClick={clearPad} className="text-xs text-slate-400 hover:text-slate-600 mt-1">Clear</button>
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="text-sm font-medium text-slate-600 border border-slate-200 rounded-md px-3.5 py-2 hover:bg-slate-50">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!hasSignature || saving}
            className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm Signature'}
          </button>
        </div>
      </Card>
    </div>
  )
}
