import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Copy, Check } from 'lucide-react'
import { api, type HelpReport } from '@/lib/api'

const LABEL: Record<HelpReport['status'], string> = { new: 'New', looking: 'Looking into it', fixed: 'Fixed' }

/** Everything staff sent through the Help button. "Copy for Claude" packs one report so it can be pasted into a chat to get a fix built. */
export function HelpReportsPanel() {
  const qc = useQueryClient()
  const { data: reports = [], isLoading } = useQuery({ queryKey: ['help-reports'], queryFn: () => api.getHelpReports() })
  const [copied, setCopied] = useState('')
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: HelpReport['status'] }) => api.setHelpReportStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['help-reports'] }),
  })
  const copy = async (r: HelpReport) => {
    const text = `Casillas OS problem reported by ${r.staff_name} on ${format(parseISO(r.created_at), 'MMM d, yyyy h:mm a')}\n\nWhat they said:\n${r.message}\n\nTechnical details:\n${r.details}\n\nPlease work out what is wrong and give me the options to fix it.`
    try { await navigator.clipboard.writeText(text); setCopied(r.id); setTimeout(() => setCopied(''), 2000) } catch { /* clipboard blocked */ }
  }
  if (isLoading) return <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
  if (reports.length === 0) return <div className="py-10 text-center text-sm text-slate-500">No help reports yet. When someone presses Help at the top of a page, it shows up here.</div>
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className={`rounded-md border p-3 ${r.status === 'new' ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{r.staff_name || 'Someone'}</span>
            <span>{format(parseISO(r.created_at), 'MMM d, h:mm a')}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{r.page}</span>
            <select value={r.status} onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as HelpReport['status'] })} className="ml-auto rounded border border-slate-300 bg-white px-2 py-1 text-xs">
              {(['new', 'looking', 'fixed'] as const).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
            </select>
            <button type="button" onClick={() => copy(r)} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50">
              {copied === r.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy for Claude</>}
            </button>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{r.message}</p>
          <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">Technical details</summary><pre className="mt-1 whitespace-pre-wrap">{r.details}</pre></details>
        </div>
      ))}
    </div>
  )
}
