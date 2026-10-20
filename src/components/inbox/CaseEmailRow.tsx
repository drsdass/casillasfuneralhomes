import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Mail, Paperclip, ChevronDown, ChevronRight, Save, Check, FileSearch, Loader2, Send, Reply, Forward } from 'lucide-react'
import { ComposeEmail } from '@/components/ui/ComposeEmail'
import { quotedOriginal, replySubject, forwardSubject } from '@/lib/emailJunk'
import { api } from '@/lib/api'
import type { CaseDocument, ExtractedCaseData, InboundEmail, StaffMember } from '@/types'

// Quick labels for the paperwork a funeral home sees most. Tap one, or type your own.
const QUICK_LABELS: { label: string; category: CaseDocument['category'] }[] = [
  { label: 'Death Certificate', category: 'permit' },
  { label: 'Medical Certificate / Cause of Death', category: 'permit' },
  { label: 'Burial Permit', category: 'permit' },
  { label: 'Cremation Permit', category: 'permit' },
  { label: 'Cremation Authorization', category: 'authorization' },
  { label: 'Embalming Authorization', category: 'authorization' },
  { label: 'Release of Remains', category: 'authorization' },
  { label: 'Vital Statistics Worksheet', category: 'other' },
  { label: 'Statement of Goods & Services', category: 'contract' },
  { label: 'Pre-Need Contract', category: 'contract' },
  { label: 'Cemetery / Plot Paperwork', category: 'contract' },
  { label: 'Insurance Policy', category: 'contract' },
  { label: 'Veteran DD-214', category: 'other' },
  { label: 'Photo ID / Driver License', category: 'other' },
  { label: 'Social Security Info', category: 'other' },
  { label: 'Obituary', category: 'obituary' },
  { label: 'Service Program', category: 'other' },
  { label: 'Family Photo', category: 'photo' },
  { label: 'Music', category: 'music' },
  { label: 'Video', category: 'video' },
  { label: 'Payment / Receipt', category: 'other' },
  { label: 'Medical Records', category: 'other' },
]
const extOf = (f: string) => (f.includes('.') ? f.slice(f.lastIndexOf('.')) : '')

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** One email on a case's Emails tab: tap to read the whole message, and save or read its attachments right here. */
export function CaseEmailRow({ email, caseId, canEdit, currentUser }: { email: InboundEmail; caseId: string; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [extracted, setExtracted] = useState<Record<string, ExtractedCaseData>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [compose, setCompose] = useState<{ to: string; subject: string; body: string; forward?: boolean; replyTo?: InboundEmail } | null>(null)
  // Which attachment is being labelled right now, and what the person has chosen/typed.
  const [labelling, setLabelling] = useState<string | null>(null)
  const [labelText, setLabelText] = useState('')
  const [labelCat, setLabelCat] = useState<CaseDocument['category']>('other')

  const attachmentMutation = useMutation({
    mutationFn: async (p: { att: InboundEmail['attachments'][number]; action: 'extract' | 'save'; label?: string; category?: CaseDocument['category'] }) => {
      setPending(p.att.id); setError('')
      const res = await api.actOnEmailAttachment({
        graphMessageId: email.graphMessageId, attachmentId: p.att.id, filename: p.att.filename,
        contentType: p.att.contentType, action: p.action, caseId, changedBy: currentUser,
      })
      if (res.action === 'save' && p.label?.trim()) {
        const name = p.label.trim() + (extOf(p.att.filename) && !p.label.trim().toLowerCase().endsWith(extOf(p.att.filename).toLowerCase()) ? extOf(p.att.filename) : '')
        await api.labelCaseDocument(res.document.id, caseId, name, p.category ?? 'other', currentUser)
      }
      return res
    },
    onSuccess: (result, v) => {
      setPending(null)
      if (result.action === 'extract') setExtracted((prev) => ({ ...prev, [v.att.id]: result.extracted }))
      else { setLabelling(null); setSaved((prev) => new Set(prev).add(v.att.id)); qc.invalidateQueries({ queryKey: ['case-documents', caseId] }) }
    },
    onError: (e) => { setPending(null); setError(e instanceof Error ? e.message : 'Could not do that. Please try again.') },
  })

  const out = email.direction === 'out'
  return (
    <div className="rounded-md hover:bg-slate-50 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left flex items-start gap-3 px-2 py-2.5">
        {out ? <Send size={16} className="text-[#3b4a35] shrink-0 mt-0.5" /> : <Mail size={16} className="text-slate-400 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900">{out ? `Sent to ${email.to}` : (email.fromName ?? email.from)}</span>
            {out && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#3b4a35]/10 text-[#3b4a35]">Sent by {email.sentByName ?? 'staff'}</span>}
            {email.attachments.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800"><Paperclip size={11} /> {email.attachments.length} attached</span>
            )}
          </div>
          <div className="text-slate-800">{email.subject}</div>
          {!open && <div className="text-slate-500 text-xs truncate">{email.preview}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-400 whitespace-nowrap">{format(parseISO(email.receivedAt), 'MMM d, h:mm a')}</div>
          <div className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-slate-600">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {open ? 'Hide' : 'Open'}</div>
        </div>
      </button>

      {compose && <ComposeEmail {...compose} caseId={caseId} onClose={() => setCompose(null)} />}
      {open && (
        <div className="px-2 pb-3 pl-9 space-y-3">
          <div className="whitespace-pre-wrap rounded-md bg-slate-50 border border-slate-100 p-3 text-sm text-slate-700 max-h-96 overflow-y-auto">
            {email.body?.trim() || email.preview || '(This email has no text.)'}
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              {!out && (
                <button onClick={() => setCompose({ to: email.from, subject: replySubject(email.subject), body: quotedOriginal(email), replyTo: email })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#3b4a35] rounded-md px-3 py-1.5 hover:bg-[#4d5f45]"><Reply size={13} /> Reply</button>
              )}
              <button onClick={() => setCompose({ to: '', subject: forwardSubject(email.subject), body: quotedOriginal(email), forward: true })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3b4a35] border border-[#3b4a35]/40 rounded-md px-3 py-1.5 hover:bg-[#3b4a35]/5"><Forward size={13} /> Forward</button>
              {email.attachments.length > 0 && <span className="text-[11px] text-slate-400">Attachments are not included when forwarding. Save them to the case first if needed.</span>}
            </div>
          )}
          {email.attachments.map((att) => {
            const isPending = pending === att.id
            const isSaved = saved.has(att.id)
            const ex = extracted[att.id]
            return (
              <div key={att.id} className="border border-slate-200 rounded-md px-3 py-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip size={13} className="text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{att.filename}</span>
                    <span className="text-xs text-slate-400 shrink-0">{formatSize(att.sizeBytes)}</span>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Loader2 size={12} className="animate-spin" /> Working…</span>
                      ) : (
                        <>
                          <button onClick={() => { setLabelling(att.id); setLabelText(att.filename.replace(/\.[^.]+$/, '')); setLabelCat('other') }} disabled={isSaved}
                            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#3b4a35] rounded-md px-2.5 py-1.5 hover:bg-[#4d5f45] disabled:opacity-60">
                            {isSaved ? <Check size={12} /> : <Save size={12} />} {isSaved ? 'Saved to Documents' : 'Save to Case'}
                          </button>
                          <button onClick={() => attachmentMutation.mutate({ att, action: 'extract' })}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#8a6d3b] border border-[#b3925a]/40 rounded-md px-2 py-1.5 hover:bg-[#b3925a]/5">
                            <FileSearch size={12} /> Read it for me
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {labelling === att.id && !isSaved && (
                  <div className="mt-2 rounded-md border border-[#3b4a35]/30 bg-[#3b4a35]/5 p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-700">What is this document? Tap one, or type your own name:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_LABELS.map((q) => (
                        <button key={q.label} onClick={() => { setLabelText(q.label); setLabelCat(q.category) }}
                          className={`text-xs rounded-full border px-2.5 py-1 ${labelText === q.label ? 'bg-[#3b4a35] text-white border-[#3b4a35]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{q.label}</button>
                      ))}
                    </div>
                    <input value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Or type a name, e.g. Mom's insurance policy"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setLabelling(null)} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 bg-white">Cancel</button>
                      <button onClick={() => attachmentMutation.mutate({ att, action: 'save', label: labelText, category: labelCat })} disabled={!labelText.trim()}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#3b4a35] text-white disabled:opacity-50">Save as “{labelText.trim() || '…'}”</button>
                    </div>
                  </div>
                )}
                {ex && (
                  <div className="mt-2 text-xs bg-[#b3925a]/5 border border-[#b3925a]/20 rounded-md px-2.5 py-2 text-slate-600">
                    <div className="font-medium text-slate-700 mb-1">What I found ({ex.confidence} confidence) — please check before using:</div>
                    {ex.decedentFirstName && <div>Name: {ex.decedentFirstName} {ex.decedentLastName}</div>}
                    {ex.dateOfDeath && <div>Date of death: {ex.dateOfDeath}</div>}
                    {ex.placeOfDeath && <div>Place: {ex.placeOfDeath}</div>}
                    {ex.disposition && <div>Disposition: {ex.disposition}</div>}
                    {ex.notes && <div className="text-amber-700 mt-1">{ex.notes}</div>}
                    <Link to={`/cases/${caseId}/edit`} className="inline-block mt-1 text-[#3b4a35] font-medium hover:underline">Open case to apply changes →</Link>
                  </div>
                )}
              </div>
            )
          })}
          {isErr(error) && <div className="text-xs text-red-600">{error}</div>}
        </div>
      )}
    </div>
  )
}
const isErr = (s: string) => s.length > 0
