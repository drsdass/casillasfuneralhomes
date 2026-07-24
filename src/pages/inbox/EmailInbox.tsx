import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canEditCases } from '@/lib/permissions'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { format, parseISO } from 'date-fns'
import { Mail, Paperclip, CheckCircle2, X, Sparkles, Check, FileSearch, Save, Loader2 } from 'lucide-react'
import { ActivityPanel } from '@/components/activity/ActivityPanel'
import { Link } from 'react-router-dom'
import type { EmailAttachment, ExtractedCaseData } from '@/types'

const statusStyles: Record<string, string> = {
  auto_matched: 'bg-emerald-100 text-emerald-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  suggested: 'bg-amber-100 text-amber-800',
  unmatched: 'bg-slate-100 text-slate-600',
  ignored: 'bg-slate-100 text-slate-400',
}
const statusLabels: Record<string, string> = {
  auto_matched: 'Matched', confirmed: 'Matched', suggested: 'Needs review',
  unmatched: 'Unmatched', ignored: 'Ignored',
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EmailInbox() {
  const { currentUser } = useSession()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'needs_review' | 'all'>('needs_review')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const canManage = currentUser ? canEditCases(currentUser.role) : false

  const { data: emails = [] } = useQuery({
    queryKey: ['emails', filter],
    queryFn: () => api.getEmails(filter === 'needs_review' ? { needsReview: true } : undefined),
  })
  const { data: allCases = [] } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => api.getCases() })

  const confirmMutation = useMutation({
    mutationFn: ({ emailId, caseId }: { emailId: string; caseId: string }) => api.confirmEmailMatch(emailId, caseId, currentUser!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] })
      setAssigningId(null)
    },
  })

  const ignoreMutation = useMutation({
    mutationFn: (emailId: string) => api.ignoreEmail(emailId, currentUser!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['emails'] }),
  })

  const [extractionResults, setExtractionResults] = useState<Record<string, ExtractedCaseData>>({})
  const [savedAttachments, setSavedAttachments] = useState<Set<string>>(new Set())
  const [pendingAttachmentId, setPendingAttachmentId] = useState<string | null>(null)

  const attachmentMutation = useMutation({
    mutationFn: (params: { graphMessageId: string; attachment: EmailAttachment; action: 'extract' | 'save'; caseId: string }) => {
      setPendingAttachmentId(params.attachment.id)
      return api.actOnEmailAttachment({
        graphMessageId: params.graphMessageId,
        attachmentId: params.attachment.id,
        filename: params.attachment.filename,
        contentType: params.attachment.contentType,
        action: params.action,
        caseId: params.caseId,
        changedBy: currentUser!,
      })
    },
    onSuccess: (result, variables) => {
      setPendingAttachmentId(null)
      if (result.action === 'extract') {
        setExtractionResults((prev) => ({ ...prev, [variables.attachment.id]: result.extracted }))
      } else {
        setSavedAttachments((prev) => new Set(prev).add(variables.attachment.id))
        queryClient.invalidateQueries({ queryKey: ['case-documents', variables.caseId] })
      }
    },
    onError: () => setPendingAttachmentId(null),
  })

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
    <div>
      <SectionHeading
        title="Email Inbox"
        subtitle="Messages from info@casillasfuneralhome.com, matched to cases automatically or held for review"
      />

      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {(['needs_review', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              filter === f ? 'border-[#b3925a] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {f === 'needs_review' ? 'Needs Review' : 'All Messages'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {emails.map((email) => {
          const linkedCase = email.caseId ? allCases.find((c) => c.id === email.caseId) : undefined
          return (
            <Card key={email.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                  <Mail size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900 text-sm">{email.fromName ?? email.from}</span>
                    <span className="text-xs text-slate-400">{email.from}</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${statusStyles[email.matchStatus]}`}>
                      {statusLabels[email.matchStatus]}
                    </span>
                    {email.attachments.length > 0 && <Paperclip size={12} className="text-slate-400" />}
                  </div>
                  <div className="text-sm text-slate-800 font-medium mt-1">{email.subject}</div>
                  <div className="text-sm text-slate-500 truncate">{email.preview}</div>
                  <div className="text-xs text-slate-400 mt-1">{format(parseISO(email.receivedAt), 'MMM d, h:mm a')}</div>

                  {email.matchReason && (
                    <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5 bg-slate-50 rounded-md px-2.5 py-1.5 w-fit">
                      {email.matchStatus === 'suggested' && <Sparkles size={12} className="text-amber-500 shrink-0" />}
                      {email.matchReason}
                      {email.matchConfidence && <span className="text-slate-400">({Math.round(email.matchConfidence * 100)}% confidence)</span>}
                    </div>
                  )}

                  {linkedCase && (
                    <Link to={`/cases/${linkedCase.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#3b4a35] hover:underline mt-2">
                      <CheckCircle2 size={12} /> {linkedCase.decedent.firstName} {linkedCase.decedent.lastName} — {linkedCase.caseNumber}
                    </Link>
                  )}

                  {linkedCase && email.attachments.length > 0 && canManage && (
                    <div className="mt-3 space-y-2">
                      {email.attachments.map((att) => {
                        const isPending = pendingAttachmentId === att.id
                        const extracted = extractionResults[att.id]
                        const saved = savedAttachments.has(att.id)
                        return (
                          <div key={att.id} className="border border-slate-100 rounded-md px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Paperclip size={13} className="text-slate-400 shrink-0" />
                                <span className="text-sm text-slate-700 truncate">{att.filename}</span>
                                <span className="text-xs text-slate-400 shrink-0">{formatSize(att.sizeBytes)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isPending ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                    <Loader2 size={12} className="animate-spin" /> Working…
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => attachmentMutation.mutate({ graphMessageId: email.graphMessageId, attachment: att, action: 'extract', caseId: linkedCase.id })}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-[#b3925a] border border-[#b3925a]/40 rounded-md px-2 py-1 hover:bg-[#b3925a]/5"
                                    >
                                      <FileSearch size={11} /> Extract Info
                                    </button>
                                    <button
                                      onClick={() => attachmentMutation.mutate({ graphMessageId: email.graphMessageId, attachment: att, action: 'save', caseId: linkedCase.id })}
                                      disabled={saved}
                                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      {saved ? <Check size={11} /> : <Save size={11} />} {saved ? 'Saved' : 'Save to Case'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {extracted && (
                              <div className="mt-2 text-xs bg-[#b3925a]/5 border border-[#b3925a]/20 rounded-md px-2.5 py-2">
                                <div className="font-medium text-slate-700 mb-1">
                                  Extracted ({extracted.confidence} confidence) — review and update the case manually if relevant:
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600">
                                  {extracted.decedentFirstName && <div>Name: {extracted.decedentFirstName} {extracted.decedentLastName}</div>}
                                  {extracted.dateOfDeath && <div>Date of Death: {extracted.dateOfDeath}</div>}
                                  {extracted.placeOfDeath && <div>Place: {extracted.placeOfDeath}</div>}
                                  {extracted.disposition && <div>Disposition: {extracted.disposition}</div>}
                                </div>
                                {extracted.notes && <div className="text-amber-700 mt-1">{extracted.notes}</div>}
                                <Link to={`/cases/${linkedCase.id}/edit`} className="inline-block mt-1.5 text-[#3b4a35] font-medium hover:underline">
                                  Open case to apply changes →
                                </Link>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {canManage && (email.matchStatus === 'suggested' || email.matchStatus === 'unmatched') && (
                    <div className="mt-3">
                      {assigningId === email.id ? (
                        <CasePicker
                          cases={allCases}
                          onSelect={(caseId) => confirmMutation.mutate({ emailId: email.id, caseId })}
                          onCancel={() => setAssigningId(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          {email.matchStatus === 'suggested' && email.caseId && (
                            <button
                              onClick={() => confirmMutation.mutate({ emailId: email.id, caseId: email.caseId! })}
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md px-2.5 py-1.5 hover:bg-emerald-50"
                            >
                              <Check size={12} /> Confirm Match
                            </button>
                          )}
                          <button
                            onClick={() => setAssigningId(email.id)}
                            className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50"
                          >
                            {email.matchStatus === 'suggested' ? 'Assign Different Case' : 'Assign to Case'}
                          </button>
                          <button
                            onClick={() => ignoreMutation.mutate(email.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600"
                          >
                            <X size={12} /> Not Case-Related
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
        {emails.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-16">
            {filter === 'needs_review' ? 'Nothing needs review right now.' : 'No messages yet.'}
          </div>
        )}
      </div>
    </div>
    <ActivityPanel entityType="email" title="Inbox Activity" />
    </div>
  )
}

function CasePicker({
  cases, onSelect, onCancel,
}: {
  cases: { id: string; caseNumber: string; decedent: { firstName: string; lastName: string } }[]
  onSelect: (caseId: string) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q
    ? cases.filter((c) => `${c.decedent.firstName} ${c.decedent.lastName} ${c.caseNumber}`.toLowerCase().includes(q)).slice(0, 8)
    : []

  return (
    <div className="max-w-xs">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or case number…"
          className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
        />
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Cancel</button>
      </div>
      {q && (
        <div className="mt-1 border border-slate-100 rounded-md overflow-hidden">
          {matches.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0"
            >
              {c.decedent.firstName} {c.decedent.lastName} <span className="text-slate-400">— {c.caseNumber}</span>
            </button>
          ))}
          {matches.length === 0 && <div className="px-2.5 py-2 text-xs text-slate-400">No matches.</div>}
        </div>
      )}
    </div>
  )
}
