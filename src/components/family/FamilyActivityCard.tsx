import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Bell, Check, PenLine, MessageSquare } from 'lucide-react'
import { api } from '@/lib/api'
import type { FuneralCase, StaffMember } from '@/types'

/** At the top of a case: tells staff when the family has filled something in on their portal link, and shows what they wrote. */
export function FamilyActivityCard({ c, currentUser }: { c: FuneralCase; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['family-activity', c.id, c.familyActivityAt], queryFn: () => api.getFamilyActivity(c.id) })
  const seen = useMutation({
    mutationFn: () => api.markFamilySeen(c.id, currentUser),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['case', c.id] }); qc.invalidateQueries({ queryKey: ['cases'] }) },
  })
  const hasWords = !!data?.obituary || (data?.messages.length ?? 0) > 0
  if (!c.familyUnseen && !hasWords) return null
  return (
    <div className={`no-print mb-4 rounded-lg border-2 p-4 ${c.familyUnseen ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      {c.familyUnseen && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <Bell size={18} className="text-emerald-700 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-emerald-900">The family updated their portal</div>
              <div className="text-sm text-emerald-800">{c.familyActivityNote?.replace(/^Family\s+/i, '') ?? 'Something new was added.'}
                {c.familyActivityAt && <span className="text-emerald-700/80"> · {format(parseISO(c.familyActivityAt), 'MMM d, h:mm a')}</span>}</div>
            </div>
          </div>
          <button onClick={() => seen.mutate()} disabled={seen.isPending} className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-emerald-700 rounded-md px-3 py-1.5 hover:bg-emerald-800 disabled:opacity-60">
            <Check size={14} /> Got it
          </button>
        </div>
      )}
      {data?.obituary && (
        <div className={c.familyUnseen ? 'mt-3 pt-3 border-t border-emerald-200' : ''}>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"><PenLine size={12} /> Obituary written by the family <span className="normal-case font-normal text-slate-400">· saved {format(parseISO(data.obituary.updatedAt), 'MMM d, h:mm a')}</span></div>
          <div className="whitespace-pre-wrap rounded-md bg-white border border-slate-200 p-3 text-sm text-slate-700 max-h-60 overflow-y-auto">{data.obituary.body}</div>
        </div>
      )}
      {data && data.messages.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1"><MessageSquare size={12} /> Messages from the family</div>
          <div className="space-y-1.5">
            {data.messages.map((m) => (
              <div key={m.id} className="rounded-md bg-white border border-slate-200 p-2.5 text-sm text-slate-700">
                {m.body}
                <div className="text-[11px] text-slate-400 mt-0.5">{format(parseISO(m.createdAt), 'MMM d, h:mm a')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
