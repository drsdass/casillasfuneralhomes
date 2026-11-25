import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { FileSignature, Upload, Tablet, Download, RefreshCw, Copy } from 'lucide-react'
import { api } from '@/lib/api'
import { USE_MOCK } from '@/lib/supabase'
import { Card } from '@/components/ui/Primitives'
import { SignDialog } from './SignDialog'
import type { FuneralCase, StaffMember } from '@/types'

/** Every document sent for signature on this case, and a way to send any PDF. */
export function SignaturesCard({ caseObj: c, canEdit, currentUser }: { caseObj: FuneralCase; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const { data: list = [], isFetching } = useQuery({
    queryKey: ['signature-requests', c.id], queryFn: () => api.getSignatureRequests(c.id),
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => s.status === 'sent' || s.status === 'viewed') ? 15000 : false),
  })
  const demoSign = useMutation({ mutationFn: (id: string) => api.simulateSignatureComplete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['signature-requests', c.id] }) })
  const openCopy = async (path: string) => { const w = window.open('', '_blank'); try { const u = await api.getSignedCopyUrl(path); if (w) w.location.href = u } catch { w?.close() } }
  if (!canEdit && list.length === 0) return null
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-800">Signatures</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => qc.invalidateQueries({ queryKey: ['signature-requests', c.id] })} title="Check for new signatures" className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /></button>
          {canEdit && <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><Upload size={13} /> Send a PDF for signature</button>}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPdf(f); e.target.value = '' }} />
        </div>
      </div>
      {list.length === 0 ? <p className="text-xs text-slate-400">Nothing sent yet. Open a form in the Print center, a quote, or use the button above for any PDF.</p> : (
        <div className="space-y-2">
          {[...list].sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')).map((sig) => (
            <div key={sig.id} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
              <FileSignature size={15} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="text-slate-800">{sig.documentName}</div>
                <div className="text-xs text-slate-400">To {sig.signerName} · {sig.mode === 'inperson' ? 'signing in the office' : 'link sent'}{sig.sentAt && ` · Sent ${format(parseISO(sig.sentAt), 'MMM d, h:mm a')}`}{sig.signedAt && ` · Signed ${format(parseISO(sig.signedAt), 'MMM d, h:mm a')}`}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${sig.status === 'signed' ? 'bg-emerald-100 text-emerald-800' : sig.status === 'declined' || sig.status === 'expired' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{sig.status === 'sent' ? 'Waiting to be signed' : sig.status}</span>
              {sig.status === 'signed' && sig.signedDocumentUrl && <button type="button" onClick={() => openCopy(sig.signedDocumentUrl!)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><Download size={12} /> Signed copy</button>}
              {canEdit && sig.token && (sig.status === 'sent' || sig.status === 'viewed') && (<>
                <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/sign/${sig.token}`)} title="Copy the signing link" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><Copy size={12} /> Copy link</button>
                <a href={`/sign/${sig.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#3b4a35] px-2 py-1 text-xs font-semibold text-white"><Tablet size={12} /> Open signing screen</a>
              </>)}
              {USE_MOCK && canEdit && sig.status === 'sent' && <button type="button" onClick={() => demoSign.mutate(sig.id)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">Simulate signed (demo)</button>}
            </div>
          ))}
        </div>
      )}
      {pdf && <SignDialog caseObj={c} documentName={pdf.name.replace(/\.pdf$/i, '')} getPdf={async () => pdf} currentUser={currentUser} onClose={() => setPdf(null)} />}
    </Card>
  )
}
