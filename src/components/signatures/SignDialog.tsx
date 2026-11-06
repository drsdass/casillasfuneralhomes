import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, FileSignature, Mail, Tablet } from 'lucide-react'
import { api } from '@/lib/api'
import type { FuneralCase, SignatureRequest, StaffMember } from '@/types'

const inputCls = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base bg-white'

/** "Send for signature": who signs, and whether they get an email link or sign right here on a tablet. Used for forms, quotes and uploaded PDFs. */
export function SignDialog({ caseObj: c, documentName, getPdf, currentUser, onClose }: { caseObj: FuneralCase; documentName: string; getPdf: () => Promise<Blob>; currentUser: StaffMember; onClose: () => void }) {
  const qc = useQueryClient()
  const first = c.contacts[0]
  const [name, setName] = useState(first?.name ?? '')
  const [email, setEmail] = useState(first?.email ?? '')
  const [mode, setMode] = useState<'email' | 'inperson'>('email')
  const [sent, setSent] = useState<SignatureRequest | null>(null)
  const send = useMutation({
    mutationFn: async () => api.createSignatureRequest({ caseId: c.id, documentName, signerName: name.trim() || 'Family Contact', signerEmail: email.trim(), sentBy: currentUser.id, mode }, currentUser, await getPdf()),
    onSuccess: (r) => { setSent(r); qc.invalidateQueries({ queryKey: ['signature-requests', c.id] }) },
  })
  const msg = send.error instanceof Error ? send.error.message : send.error ? String(send.error) : ''
  const pick = (id: string) => { const p = c.contacts.find((x) => x.id === id); if (p) { setName(p.name); setEmail(p.email ?? '') } }
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Send for signature</h2><p className="text-sm text-slate-500">{documentName}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        {sent ? (
          <div className="space-y-3">
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {sent.mode === 'inperson' && sent.embedUrl ? 'Ready. Hand the tablet to the family and open the signing screen.' : `Sent to ${sent.signerName} (${sent.signerEmail}). We will mark it signed here as soon as they sign.`}
            </div>
            <div className="flex justify-end gap-2">
              {sent.mode === 'inperson' && sent.embedUrl && <a href={sent.embedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white"><Tablet size={15} /> Open signing screen</a>}
              <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Done</button>
            </div>
          </div>
        ) : (
          <>
            {c.contacts.length > 1 && (
              <label className="mb-3 block text-sm font-medium text-slate-700">Who signs
                <select onChange={(e) => pick(e.target.value)} defaultValue={first?.id} className={inputCls}>{c.contacts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
            )}
            <div className="mb-3 grid grid-cols-1 gap-3">
              <label className="block text-sm font-medium text-slate-700">Name<input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
              <label className="block text-sm font-medium text-slate-700">Email <span className="font-normal text-slate-400">(they get the signed copy here)</span><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" className={inputCls} /></label>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode('email')} className={`rounded-md border p-3 text-left text-sm ${mode === 'email' ? 'border-[#3b4a35] bg-[#3b4a35]/10' : 'border-slate-300'}`}><Mail size={16} className="mb-1" /><b>Email a link</b><span className="block text-xs text-slate-500">They sign on their own phone</span></button>
              <button type="button" onClick={() => setMode('inperson')} className={`rounded-md border p-3 text-left text-sm ${mode === 'inperson' ? 'border-[#3b4a35] bg-[#3b4a35]/10' : 'border-slate-300'}`}><Tablet size={16} className="mb-1" /><b>Sign here</b><span className="block text-xs text-slate-500">They sign on this device now</span></button>
            </div>
            {msg && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700">Cancel</button>
              <button type="button" disabled={send.isPending || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={() => send.mutate()} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileSignature size={15} /> {send.isPending ? 'Sending…' : mode === 'inperson' ? 'Get signing screen' : 'Send'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
