import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import { useSession } from '@/context/SessionContext'
import { VITAL_SECTION_LABELS, VITAL_SECTION_ORDER } from '@/lib/vitalFields'
import { buildEdrsRows, readiness, type EdrsNote, type EdrsRow } from '@/lib/edrsFormat'
import { Card, SectionHeading } from '@/components/ui/Primitives'
import { ArrowLeft, Copy, Check, Eye, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react'

const noteClass: Record<EdrsNote['level'], string> = {
  error: 'text-red-600',
  warn: 'text-amber-600',
  info: 'text-slate-400',
}

/**
 * Everything that gets keyed into EDRS, already in the form EDRS wants it
 * (four-digit time, no accents, dashes where it asks for them, its own
 * dropdown wording), each with the item number from the state's numbering
 * and a one-click copy. Not an integration — it makes the retyping fast and
 * catches what would otherwise come back as a rejected certificate.
 */
export default function EdrsEntry() {
  const { caseId } = useParams<{ caseId: string }>()
  const { accessibleLocations } = useSession()
  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [onlyIssues, setOnlyIssues] = useState(false)
  // undefined = not fetched yet; null = fetched, none on file
  const [ssn, setSsn] = useState<string | null | undefined>(undefined)
  const [ssnLoading, setSsnLoading] = useState(false)
  const [ssnError, setSsnError] = useState<string | null>(null)

  if (!c) return null

  const location = accessibleLocations.find((l) => l.id === c.locationId)
  const rows = buildEdrsRows(c, { ssn, location: location && { name: location.name, licenseNumber: location.licenseNumber } })
  const { blockers, toCheck, ready } = readiness(rows)
  const needsAttention = (r: EdrsRow) => r.notes.some((n) => n.level === 'error' || n.level === 'warn')

  async function copy(key: string, value: string) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500)
  }

  async function loadSsn(thenCopy: boolean) {
    setSsnLoading(true)
    setSsnError(null)
    try {
      const value = await api.getDecedentSsn(caseId!)
      setSsn(value)
      if (thenCopy && value) await copy('ssn', value.replace(/\D/g, ''))
    } catch (err) {
      setSsnError(getErrorMessage(err))
    } finally {
      setSsnLoading(false)
    }
  }

  function jumpTo(key: string) {
    document.getElementById(`row-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="max-w-3xl">
      <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to case
      </Link>
      <SectionHeading
        title={`EDRS Entry — ${c.decedent.firstName} ${c.decedent.lastName}`}
        subtitle="Each value is already in the form EDRS wants it, with the item number from the state's numbering. Click any row to copy it."
      />

      {ready ? (
        <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg px-4 py-3 mb-4 text-sm">
          <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Nothing blocking — everything EDRS requires is filled in.</div>
            {toCheck.length > 0 && <div className="text-emerald-700/80 text-xs mt-0.5">{toCheck.length} item{toCheck.length === 1 ? '' : 's'} worth a second look (marked in amber below).</div>}
            {ssn === undefined && <div className="text-emerald-700/80 text-xs mt-0.5">The Social Security number hasn't been checked yet — use "Show & copy" on item 10.</div>}
          </div>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-red-700 mb-2">
            <AlertTriangle size={16} /> {blockers.length} thing{blockers.length === 1 ? '' : 's'} to fix before this can be filed
          </div>
          <ul className="space-y-1">
            {blockers.map((r) => (
              <li key={r.key}>
                <button onClick={() => jumpTo(r.key)} className="text-left text-red-700 hover:underline">
                  <span className="font-bold tabular-nums">{r.number || '—'}</span> {r.label}
                  {r.hint && <span className="opacity-70"> — {r.hint}</span>}
                  <span className="opacity-80"> · {r.notes.find((n) => n.level === 'error')?.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <Link to={`/cases/${caseId}/vital-sheet`} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-200 bg-white rounded-md px-2.5 py-1.5 mt-3 hover:bg-red-50">
            <Pencil size={12} /> Fix on the Vital Sheet
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 text-sm">
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-[#3b4a35]" /> Show only items needing attention
        </label>
        <Link to={`/cases/${caseId}/vital-sheet`} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3b4a35] border border-slate-200 rounded-md px-2.5 py-1.5 hover:bg-slate-50">
          <Pencil size={12} /> Edit Vital Sheet
        </Link>
      </div>

      <div className="space-y-4">
        {VITAL_SECTION_ORDER.map((section) => {
          const list = rows.filter((r) => r.section === section).filter((r) => !onlyIssues || needsAttention(r) || (r.sensitive && ssn === undefined))
          if (list.length === 0) return null
          return (
            <Card key={section} className="overflow-hidden">
              <div className="bg-slate-600 text-white text-xs font-semibold px-2.5 py-1.5 uppercase tracking-wide">{VITAL_SECTION_LABELS[section]}</div>
              <div className="divide-y divide-slate-100">
                {list.map((r) => {
                  const isSsn = r.sensitive
                  const empty = !r.value
                  const hasError = r.notes.some((n) => n.level === 'error')
                  return (
                    <div
                      key={r.key}
                      id={`row-${r.key}`}
                      onClick={() => !isSsn && copy(r.key, r.value)}
                      className={`flex gap-3 px-3 py-2 text-sm ${!isSsn && !empty ? 'cursor-pointer hover:bg-slate-50' : ''} ${hasError ? 'bg-red-50/40' : ''}`}
                    >
                      <div className="w-12 shrink-0 text-right font-bold text-[#b3925a] tabular-nums pt-0.5">{r.number}</div>
                      <div className="w-56 shrink-0 text-xs text-slate-500 uppercase tracking-wide leading-tight pt-1">
                        {r.label}{r.hint && <span className="normal-case text-slate-400"> — {r.hint}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-slate-900 break-words">
                          {isSsn ? (
                            ssn === undefined ? <span className="text-slate-400 font-sans text-xs">Hidden — viewing is logged</span>
                              : ssn === null || !r.value ? <span className="text-slate-300">—</span>
                              : r.value
                          ) : empty ? <span className="text-slate-300">—</span> : r.value}
                        </div>
                        {r.notes.map((n, i) => (
                          <div key={i} className={`text-[11px] leading-snug mt-0.5 ${noteClass[n.level]}`}>{n.text}</div>
                        ))}
                      </div>
                      <div className="shrink-0 w-24 text-right pt-0.5">
                        {isSsn ? (
                          ssn === undefined || ssnError ? (
                            <button onClick={(e) => { e.stopPropagation(); loadSsn(true) }} disabled={ssnLoading} className="inline-flex items-center gap-1 text-xs font-medium text-[#3b4a35] hover:underline disabled:opacity-50">
                              <Eye size={12} /> {ssnLoading ? 'Loading…' : 'Show & copy'}
                            </button>
                          ) : r.value ? (
                            <button onClick={(e) => { e.stopPropagation(); copy('ssn', r.value) }} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                              {copiedKey === 'ssn' ? <><Check size={12} className="text-emerald-600" /> Copied</> : <><Copy size={12} /> Copy</>}
                            </button>
                          ) : null
                        ) : !empty ? (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            {copiedKey === r.key ? <><Check size={12} className="text-emerald-600" /> <span className="text-emerald-600">Copied</span></> : <><Copy size={12} /> Copy</>}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>

      {ssnError && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">Couldn't load the Social Security number: {ssnError}</div>}
      <p className="text-[11px] text-slate-400 mt-4">
        Formats and rules follow the state's Birth and Death Registration Handbook (death section, revised July 2021). Confirm anything unusual against the live EDRS.
      </p>
    </div>
  )
}
