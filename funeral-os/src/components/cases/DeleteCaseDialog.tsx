import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import type { FuneralCase } from '@/types'

/** Permanent delete with three separate confirmations: read what goes, type the case number, then confirm again after a short wait. */
export function DeleteCaseDialog({ c, onClose, onDeleted }: { c: FuneralCase; onClose: () => void; onDeleted: () => void }) {
  const { currentUser } = useSession()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [typed, setTyped] = useState('')
  const [wait, setWait] = useState(3)
  const { data: notes = [] } = useQuery({ queryKey: ['case-notes', c.id], queryFn: () => api.getCaseNotes(c.id) })
  const { data: docs = [] } = useQuery({ queryKey: ['case-docs', c.id], queryFn: () => api.getCaseDocuments(c.id) })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: () => api.getContracts() })
  const contract = contracts.find((k) => k.caseId === c.id)
  const del = useMutation({
    mutationFn: () => api.deleteCase(c.id, currentUser!),
    onSuccess: () => { queryClient.invalidateQueries(); onDeleted() },
  })
  useEffect(() => {
    if (step !== 3) return
    setWait(3)
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [step])

  const name = `${c.decedent.firstName} ${c.decedent.lastName}`
  const label = 'text-sm text-slate-700'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2 text-red-700 font-semibold"><AlertTriangle size={18} /> Delete this case — step {step} of 3</div>
        <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 p-3 text-sm">
          <div className="font-medium text-slate-900">{name}</div>
          <div className="text-slate-500">{c.caseNumber} · {c.status.replace(/_/g, ' ')}</div>
        </div>

        {step === 1 && (
          <div className="mt-3 space-y-3">
            <p className={label}>This <b>permanently</b> removes the case and everything on it. It cannot be undone.</p>
            <ul className="text-sm text-slate-600 list-disc ml-5">
              <li>{notes.length} note{notes.length === 1 ? '' : 's'}</li>
              <li>{docs.length} document{docs.length === 1 ? '' : 's'}</li>
              <li>{contract ? `A contract / invoice ($${contract.total.toFixed(2)})` : 'No contract'}</li>
              <li>Its calendar entries, tasks and statements</li>
            </ul>
            <p className="text-xs text-slate-500">Is this a duplicate? Make sure the copy you are keeping has the information first.</p>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="text-sm rounded-md border border-slate-300 px-3.5 py-2">Cancel — keep it</button>
              <button onClick={() => setStep(2)} className="text-sm rounded-md bg-red-600 text-white px-3.5 py-2">Continue</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-3 space-y-3">
            <p className={label}>Type the case number <b>{c.caseNumber}</b> to show this is the right one.</p>
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder={c.caseNumber} />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="text-sm rounded-md border border-slate-300 px-3.5 py-2">Cancel — keep it</button>
              <button disabled={typed.trim().toLowerCase() !== c.caseNumber.toLowerCase()} onClick={() => setStep(3)} className="text-sm rounded-md bg-red-600 text-white px-3.5 py-2 disabled:opacity-40">Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-3 space-y-3">
            <p className={label}>Last chance. Delete <b>{name}</b> ({c.caseNumber}) forever?</p>
            {del.isError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">Couldn't delete: {(del.error as Error)?.message ?? 'only an admin can delete a case'}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="text-sm rounded-md border border-slate-300 px-3.5 py-2">No, cancel</button>
              <button disabled={wait > 0 || del.isPending} onClick={() => del.mutate()} className="inline-flex items-center gap-1.5 text-sm rounded-md bg-red-700 text-white px-3.5 py-2 disabled:opacity-40">
                <Trash2 size={14} /> {del.isPending ? 'Deleting…' : wait > 0 ? `Wait ${wait}…` : 'Yes, delete permanently'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
