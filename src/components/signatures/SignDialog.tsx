import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, FileSignature, Mail, Tablet, Copy, Check } from 'lucide-react'
import { ComposeEmail } from '@/components/ui/ComposeEmail'
import { getCompanyName } from '@/lib/company'
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
  const [emailing, setEmailing] = useState(false)
  const [copied, setCopied] = useState(false)
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
        {sent ? (() => {
          const link = `${window.location.origin}/sign/${sent.token}`
          return (
            <div className="space-y-3">
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Ready. {sent.mode === 'inperson' ? 'Hand the device to the family and open the signing screen.' : 'Email the signing link to the family, or open it here.'} We mark it signed on the case as soon as they sign.
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}</button>
                <button type="button" onClick={() => setEmailing(true)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold ${sent.mode === 'inperson' ? 'border border-slate-300 text-slate-700' : 'bg-[#3b4a35] text-white'}`}><Mail size={14} /> Email the link</button>
                <a href={link} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold ${sent.mode === 'inperson' ? 'bg-[#3b4a35] text-white' : 'border border-slate-300 text-slate-700'}`}><Tablet size={14} /> Open signing screen</a>
              </div>
              <div className="text-right"><button type="button" onClick={onClose} className="text-sm text-slate-500 underline">Done</button></div>
              {emailing && (
                <ComposeEmail caseId={c.id} to={sent.signerEmail} subject={`Please sign: ${sent.documentName}`}
                  body={`Hello ${sent.signerName},\n\n${getCompanyName()} has sent you "${sent.documentName}" to review and sign. You can do it from your phone or computer; it takes about a minute:\n\n${link}\n\nThis link is private to you and works for 14 days. Please call us if you have any questions.\n\nThank you.`}
                  onClose={() => setEmailing(false)} />
              )}
            </div>
          )
        })() : (
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
              <button type="button" disabled={send.isPending || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={() => send.mutate()} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FileSignature size={15} /> {send.isPending ? 'Preparing…' : 'Continue'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
