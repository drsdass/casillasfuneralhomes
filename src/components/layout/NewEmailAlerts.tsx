import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Mail, FolderCheck, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { playMessageChime } from '@/lib/notificationSound'
import { useNotificationPrefs } from '@/components/presence/NotificationSettings'
import { isPushOn } from '@/lib/push'
import type { InboundEmail } from '@/types'

type Alert = { id: string; orgId: string; email: InboundEmail; caseName?: string; handledBy?: string }
type Org = { id: string; name: string }

// Outline colour per company (only shown to people who can work in more than one company).
const COMPANY_LOOK = {
  casillas: { border: 'border-[#b8862f]', bg: 'bg-[#f8efdc]', text: 'text-[#8a5f12]', chip: 'bg-[#b8862f] text-white' },
  sanders: { border: 'border-[#3f87a6]', bg: 'bg-[#e3f0f5]', text: 'text-[#2a6580]', chip: 'bg-[#3f87a6] text-white' },
} as const
const lookFor = (name: string) => (/^sanders/i.test(name) ? COMPANY_LOOK.sanders : COMPANY_LOOK.casillas)

/**
 * Pop-up for the shared mailbox: whenever a new email lands it says who it was from and where it went —
 * "filed to John Doe's case" or "not filed yet". Filed ones fade after a while; ones that need a person
 * stay until someone clicks or closes them. Checks every 30 seconds while the app is open.
 */
export function NewEmailAlerts({ userId, orgs, activeOrgId, onSwitchOrg }: { userId: string; orgs: Org[]; activeOrgId?: string; onSwitchOrg: (orgId: string, path?: string) => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const multi = orgs.length > 1
  const { prefs } = useNotificationPrefs()
  const quiet = !prefs.onDuty || !prefs.notifyEmail // off duty (or email un-ticked): no pop-ups, no sounds
  const quietRef = useRef(quiet)
  quietRef.current = quiet
  const key = `casillas_email_alert_since_v2_${userId}`
  const [alerts, setAlerts] = useState<Alert[]>([])
  // "Newest mail already seen", kept separately per company so one company's hiccup never hides the other's mail.
  const since = useRef<Record<string, string> | null>(null)
  if (since.current === null) {
    try { since.current = JSON.parse(localStorage.getItem(key) ?? '{}') } catch { since.current = {} }
  }
  const saveSince = () => { try { localStorage.setItem(key, JSON.stringify(since.current)) } catch { /* private window */ } }
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? ''

  const { data } = useQuery({
    queryKey: ['new-email-alerts', userId, orgs.map((o) => o.id).join(',')],
    queryFn: async () => {
      const out: { orgId: string; emails: InboundEmail[] }[] = []
      for (const o of orgs) {
        // First time on this computer: start from "now" so old mail doesn't pop up.
        if (!since.current![o.id]) {
          since.current![o.id] = new Date().toISOString()
          saveSince()
          continue
        }
        try {
          const emails = await api.getNewInbound(since.current![o.id], multi ? o.id : undefined)
          if (emails.length) out.push({ orgId: o.id, emails })
        } catch { /* try again next round */ }
      }
      return out
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (!data || data.length === 0) return
    let cancelled = false
    ;(async () => {
      const fresh: Alert[] = []
      for (const { orgId, emails } of data) {
        for (const e of emails) {
          const caseName = e.caseId ? await api.getCaseName(e.caseId, multi ? orgId : undefined).catch(() => undefined) : undefined
          fresh.push({ id: e.id, orgId, email: e, caseName })
        }
      }
      if (cancelled) return
      for (const { orgId, emails } of data) {
        since.current![orgId] = emails.reduce((m, e) => (e.receivedAt > m ? e.receivedAt : m), since.current![orgId] ?? '')
      }
      saveSince()
      qc.invalidateQueries({ queryKey: ['emails'] })
      if (quietRef.current) return
      setAlerts((old) => [...old, ...fresh.filter((f) => !old.some((o) => o.id === f.id))].slice(-4))
      qc.invalidateQueries({ queryKey: ['emails'] })
      playMessageChime()
      if (!isPushOn() && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        const f = fresh[fresh.length - 1]
        const co = multi ? ` (${orgName(f.orgId).replace(/\s*Funeral Home$/i, '')})` : ''
        new Notification(`New email${fresh.length > 1 ? 's' : ''} for the funeral home${co}`, { body: `${f.email.fromName || f.email.from}: ${f.email.subject}`, icon: '/casillas-logo.png' })
      }
      // Filed mail fades on its own; mail that needs a person stays.
      for (const f of fresh) {
        if (f.caseName) setTimeout(() => setAlerts((old) => old.filter((o) => o.id !== f.id)), 15000)
      }
    })()
    return () => { cancelled = true }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  // While a pop-up is showing, keep checking whether someone else has dealt with that email.
  const { data: allStaff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  const ids = alerts.map((a) => a.id)
  const { data: statuses } = useQuery({
    queryKey: ['email-alert-status', ids.join(',')],
    queryFn: async () => {
      const out: InboundEmail[] = []
      for (const orgId of [...new Set(alerts.map((a) => a.orgId))]) {
        const rows = await api.getEmailStatuses(alerts.filter((a) => a.orgId === orgId).map((a) => a.id), multi ? orgId : undefined).catch(() => [])
        out.push(...rows)
      }
      return out
    },
    enabled: ids.length > 0,
    refetchInterval: 10_000,
  })
  useEffect(() => {
    if (!statuses) return
    let cancelled = false
    ;(async () => {
      const next: Alert[] = []
      let changed = false
      for (const a of alerts) {
        const st = statuses.find((x) => x.id === a.id)
        if (!st) { next.push(a); continue } // not found: leave as is
        if (st.matchStatus === 'ignored') { changed = true; continue } // someone marked it not case-related: drop it
        const handledBy = st.matchStatus === 'confirmed' ? (allStaff.find((x) => x.id === st.confirmedBy)?.name ?? 'a staff member') : undefined
        let caseName = a.caseName
        if (st.caseId !== a.email.caseId) {
          caseName = st.caseId ? await api.getCaseName(st.caseId, multi ? a.orgId : undefined).catch(() => undefined) : undefined
        }
        if (st.matchStatus !== a.email.matchStatus || st.caseId !== a.email.caseId || handledBy !== a.handledBy) {
          changed = true
          const justHandled = !!handledBy && !a.handledBy
          next.push({ ...a, email: { ...a.email, matchStatus: st.matchStatus, caseId: st.caseId }, caseName, handledBy })
          if (justHandled) setTimeout(() => setAlerts((old) => old.filter((o) => o.id !== a.id)), 12000) // fade shortly after
        } else next.push(a)
      }
      if (!cancelled && changed) setAlerts(next)
    })()
    return () => { cancelled = true }
  }, [statuses]) // eslint-disable-line react-hooks/exhaustive-deps

  if (alerts.length === 0) return null
  const close = (id: string) => setAlerts((old) => old.filter((o) => o.id !== id))

  return (
    <div className="fixed bottom-24 right-3 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] space-y-2">
      {alerts.map(({ id, orgId, email, caseName, handledBy }) => {
        const filed = !!caseName
        const handled = !!handledBy
        const needs = !handled && (email.matchStatus === 'suggested' || email.matchStatus === 'unmatched' || !filed)
        const co = multi ? lookFor(orgName(orgId)) : null
        const open = () => {
          const path = filed && !needs ? `/cases/${email.caseId}?tab=Emails` : '/inbox'
          if (orgId !== activeOrgId) { onSwitchOrg(orgId, path); return } // jump into that company first (the page reloads there)
          navigate(path); close(id)
        }
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => { if (e.key === 'Enter') open() }}
            className={`cursor-pointer rounded-lg bg-white shadow-lg px-4 py-3 flex items-start gap-3 hover:shadow-xl transition ${co ? `border-2 ${co.border}` : `border ${needs ? 'border-amber-300' : handled ? 'border-sky-300' : 'border-emerald-300'}`}`}
          >
            <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${co ? `${co.bg} ${co.text}` : needs ? 'bg-amber-100 text-amber-700' : handled ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {needs ? <AlertCircle size={17} /> : handled ? <CheckCircle2 size={17} /> : <FolderCheck size={17} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><Mail size={12} /> New email{co && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] tracking-wide normal-case ${co.chip}`}>{orgName(orgId).replace(/\s*Funeral Home$/i, '')}</span>}</div>
              <div className="text-sm font-medium text-slate-800 truncate">{email.fromName || email.from}</div>
              <div className="text-sm text-slate-600 truncate">{email.subject}</div>
              <div className={`mt-1 text-sm font-medium ${needs ? 'text-amber-700' : handled ? 'text-sky-700' : 'text-emerald-700'}`}>
                {handled ? `Handled by ${handledBy} \u2014 filed to ${caseName ?? 'a case'}` : filed && !needs ? `Filed to ${caseName}\u2019s case` : filed ? `Possibly ${caseName}\u2019s case \u2014 please confirm` : 'Not filed to a case \u2014 needs review'}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); close(id) }} className="text-slate-300 hover:text-slate-500 shrink-0" aria-label="Close"><X size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}
