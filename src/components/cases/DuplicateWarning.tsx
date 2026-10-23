import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { findDuplicates, type DuplicateQuery } from '@/lib/duplicates'

/** Shown while a case is being typed in: lists cases that look like the same person (name in either order, same family phone). */
export function useDuplicates(q: DuplicateQuery) {
  const { data: all = [] } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => api.getCases() })
  return useMemo(() => ((q.firstName ?? '').trim().length >= 2 || (q.lastName ?? '').trim().length >= 2 ? findDuplicates(all, q) : []), [all, q.id, q.firstName, q.lastName, q.phone, q.address]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function DuplicateWarning({ hits, ack, onAck }: { hits: ReturnType<typeof useDuplicates>; ack: boolean; onAck: (v: boolean) => void }) {
  if (!hits.length) return null
  return (
    <div className="mt-3 rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex items-center gap-1.5 font-semibold text-amber-900"><AlertTriangle size={15} /> This may already be entered</div>
      <ul className="mt-1.5 space-y-1">
        {hits.slice(0, 4).map((h) => (
          <li key={h.c.id} className="text-amber-950">
            <Link to={`/cases/${h.c.id}`} target="_blank" className="font-medium underline">{h.c.decedent.firstName} {h.c.decedent.lastName}</Link>
            <span className="text-amber-900/80"> — {h.c.caseNumber} · {h.c.status.replace(/_/g, ' ')} · {h.reasons.join(', ')}</span>
          </li>
        ))}
      </ul>
      <label className="mt-2 flex items-center gap-2 text-amber-950"><input type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} /> I checked — this is a different person</label>
    </div>
  )
}
