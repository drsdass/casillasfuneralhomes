import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { canEditCases, canViewAuditLog } from '@/lib/permissions'
import { Card } from '@/components/ui/Primitives'
import { History } from 'lucide-react'
import { parseISO, formatDistanceToNow } from 'date-fns'
import { Link } from 'react-router-dom'
import type { AuditLogEntry } from '@/types'

interface ActivityPanelProps {
  /** Scope the trail to one case (Case Detail, and anything else tied to a specific case). */
  caseId?: string
  /** Scope to one entity type (e.g. 'family', 'event') — optionally combined with entityId for one specific record. */
  entityType?: AuditLogEntry['entityType']
  entityId?: string
  title?: string
  limit?: number
}

/**
 * Recent activity, filtered however the calling page needs. Visible to
 * Supervisor tier and up — the same bar as case-editing access — since
 * this is operational context, not a restricted admin tool. The full,
 * unfiltered Audit Log (Admin tab) stays Admin+ only, same as before;
 * this panel just links there for anyone who can see it.
 */
export function ActivityPanel({ caseId, entityType, entityId, title = 'Activity', limit = 8 }: ActivityPanelProps) {
  const { currentUser } = useSession()
  const canSeeFullLog = currentUser ? canViewAuditLog(currentUser.role) : false
  const canSeePanel = currentUser ? canEditCases(currentUser.role) : false

  const { data: entries = [] } = useQuery({
    queryKey: ['activity-panel', caseId, entityType, entityId],
    queryFn: () => api.getAuditLog({ caseId, entityType }),
    enabled: canSeePanel,
  })

  if (!canSeePanel) return null

  const filtered = (entityId ? entries.filter((e) => e.entityId === entityId) : entries).slice(0, limit)

  return (
    <Card className="p-4 sticky top-6">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        <History size={13} /> {title}
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-6">Nothing recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <div key={entry.id} className="text-sm">
              <div className="text-slate-700">{entry.summary}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {entry.changedByName} · {formatDistanceToNow(parseISO(entry.timestamp), { addSuffix: true })}
              </div>
            </div>
          ))}
        </div>
      )}
      {canSeeFullLog && (
        <Link to="/admin" className="inline-block mt-3 text-xs font-medium text-[#3b4a35] hover:underline">
          View full Audit Log →
        </Link>
      )}
    </Card>
  )
}
