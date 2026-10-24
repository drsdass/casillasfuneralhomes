import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Contract, FuneralCase, PaymentMethod, StaffMember } from '@/types'

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const METHODS: { v: PaymentMethod; label: string }[] = [
  { v: 'cash', label: 'Cash' }, { v: 'check', label: 'Check' }, { v: 'credit_card', label: 'Credit / debit card' },
  { v: 'ach', label: 'Bank transfer' }, { v: 'insurance_assignment', label: 'Insurance' }, { v: 'financing', label: 'Financing' },
]
const methodLabel = (m: string) => METHODS.find((x) => x.v === m)?.label ?? m

/** What the family owes, what they have paid so far (one payment or many), what is left — and a way to record the next payment. */
export function PaymentsPanel({ caseObj, contract, canEdit, currentUser, autoOpen = 0 }: { caseObj: FuneralCase; contract?: Contract; canEdit: boolean; currentUser: StaffMember; autoOpen?: number }) {
  const qc = useQueryClient()
  const { data: payments = [] } = useQuery({ queryKey: ['payments', caseObj.id], queryFn: () => api.getPayments(caseObj.id), enabled: !!contract })
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [err, setErr] = useState('')

  const total = contract?.total ?? 0
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100)
  useEffect(() => { if (autoOpen > 0 && canEdit) { setAmount(balance > 0 ? balance.toFixed(2) : ''); setOpen(true) } }, [autoOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useMutation({
    mutationFn: (v: { amount: number; method: PaymentMethod; reference?: string }) => api.recordPayment({ contractId: contract!.id, caseId: caseObj.id, ...v }, currentUser),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments', caseObj.id] }); qc.invalidateQueries({ queryKey: ['contracts'] }); setOpen(false); setAmount(''); setReference('') },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Could not save that payment.'),
  })

  function submit() {
    const n = Number(amount.replace(/[$,\s]/g, ''))
    if (!n || n <= 0) { setErr('Type the amount that was paid.'); return }
    setErr(''); pay.mutate({ amount: Math.round(n * 100) / 100, method, reference: reference.trim() || undefined })
  }

  if (!contract) return <div className="text-sm text-slate-500">Nothing is on the invoice yet. Tick the items the family is ordering and they will appear here.</div>
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 items-baseline">
        <span className="text-slate-500">Invoice total <b className="text-slate-900">{money(total)}</b></span>
        <span className="text-slate-500">Paid so far <b className="text-emerald-700">{money(paid)}</b></span>
        <span className="text-slate-500">Still owed <b className={balance > 0 ? 'text-red-600' : 'text-emerald-700'}>{balance > 0 ? money(balance) : 'Paid in full'}</b></span>
        {canEdit && !open && <button type="button" onClick={() => { setAmount(balance > 0 ? balance.toFixed(2) : ''); setOpen(true) }} className="ml-auto text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3 py-1.5 hover:bg-[#4d5f45]">Record a payment</button>}
      </div>
      {open && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-500">Amount paid<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="block mt-1 w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 bg-white" /></label>
          <label className="text-xs text-slate-500">How<select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="block mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 bg-white">{METHODS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}</select></label>
          <label className="text-xs text-slate-500 flex-1 min-w-40">Check # / note<input value={reference} onChange={(e) => setReference(e.target.value)} className="block mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 bg-white" /></label>
          <button type="button" onClick={submit} disabled={pay.isPending} className="text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 hover:bg-[#4d5f45] disabled:opacity-50">{pay.isPending ? 'Saving…' : 'Save payment'}</button>
          <button type="button" onClick={() => { setOpen(false); setErr('') }} className="text-sm text-slate-500 px-2 py-2">Cancel</button>
          {err && <div className="w-full text-xs text-red-600">{err}</div>}
        </div>
      )}
      {payments.length > 0 && (
        <table className="w-full">
          <tbody>
            {[...payments].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 text-slate-500 w-28">{new Date(p.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="py-1.5 text-slate-700">{methodLabel(p.method)}{p.reference ? <span className="text-slate-400"> · {p.reference}</span> : null}</td>
                <td className="py-1.5 text-right text-slate-900 w-28">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
