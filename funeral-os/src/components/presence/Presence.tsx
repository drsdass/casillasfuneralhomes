import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Monitor, Users, Bell } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { api } from '@/lib/api'
import { deviceKind, type PresenceRow } from '@/lib/presence'
import { useSession } from '@/context/SessionContext'
import { NotificationSettingsModal, useNotificationPrefs } from '@/components/presence/NotificationSettings'

export interface PresenceInfo { online: boolean; phone: boolean; computer: boolean; offDuty?: boolean; lastSeen?: string }

/** Everyone's current status, refreshed every 30 seconds. */
export function usePresence() {
  const { data = [] } = useQuery({ queryKey: ['presence'], queryFn: api.getPresence, refetchInterval: 30_000 })
  const { currentUser } = useSession()
  const { data: offDuty = [] } = useQuery({ queryKey: ['off-duty'], queryFn: api.getOffDuty, refetchInterval: 30_000 })
  const { prefs } = useNotificationPrefs()
  const map = new Map<string, PresenceInfo>()
  for (const r of data as PresenceRow[]) {
    const cur = map.get(r.staffId) ?? { online: false, phone: false, computer: false }
    if (r.online) { cur.online = true; if (r.device === 'phone') cur.phone = true; else cur.computer = true }
    if (!cur.lastSeen || r.lastSeen > cur.lastSeen) cur.lastSeen = r.lastSeen
    map.set(r.staffId, cur)
  }
  // Whoever is looking at the screen is online by definition (covers the first moments before the first check-in).
  if (currentUser && !map.get(currentUser.id)?.online) {
    const cur = map.get(currentUser.id) ?? { online: false, phone: false, computer: false }
    cur.online = true
    if (deviceKind() === 'phone') cur.phone = true; else cur.computer = true
    map.set(currentUser.id, cur)
  }
  for (const id of offDuty) { const cur = map.get(id) ?? { online: false, phone: false, computer: false }; cur.offDuty = true; map.set(id, cur) }
  if (currentUser) { const cur = map.get(currentUser.id)!; cur.offDuty = !prefs.onDuty } // my own switch shows instantly
  return map
}

export function presenceText(p?: PresenceInfo): string {
  if (p?.offDuty) return 'Off duty — not receiving notifications'
  if (p?.online) return p.phone && p.computer ? 'Online — computer and phone' : p.phone ? 'Online — phone only' : 'Online — computer'
  return p?.lastSeen ? `Offline — last seen ${formatDistanceToNow(parseISO(p.lastSeen), { addSuffix: true })}` : 'Offline'
}

/** Blue dot = online now, red dot = offline. A phone icon shows when they are on a phone. */
export function PresenceDot({ info, showText = false }: { info?: PresenceInfo; showText?: boolean }) {
  if (info?.offDuty) {
    return (
      <span className="inline-flex items-center gap-1 align-middle" title={presenceText(info)}>
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-400" aria-label="Off duty" />
        {showText && <span className="text-xs text-slate-400">Off duty</span>}
      </span>
    )
  }
  const on = !!info?.online
  return (
    <span className="inline-flex items-center gap-1 align-middle" title={presenceText(info)}>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${on ? 'bg-blue-500' : 'bg-red-500'}`} aria-label={on ? 'Online' : 'Offline'} />
      {on && info!.phone && <Smartphone size={12} className="text-blue-600" />}
      {on && info!.computer && !info!.phone && showText && <Monitor size={12} className="text-blue-600" />}
      {showText && <span className={`text-xs ${on ? 'text-blue-700' : 'text-slate-400'}`}>{on ? (info!.phone && !info!.computer ? 'Phone only' : info!.phone ? 'Computer + phone' : 'Online') : 'Offline'}</span>}
    </span>
  )
}

/** Tells the database "I'm here" about once a minute while the app is open and visible. */
export function PresenceHeartbeat() {
  const { currentUser } = useSession()
  const qc = useQueryClient()
  const id = currentUser?.id
  useEffect(() => {
    if (!id) return
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      api.touchPresence(id, deviceKind()).then(() => setTimeout(() => qc.invalidateQueries({ queryKey: ['presence'] }), 400)).catch(() => { /* try again next minute */ })
    }
    beat()
    const t = setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat) }
  }, [id, qc])
  return null
}

/** Top-bar button: how many are online, and a list of who and on what. */
export function WhoIsOnline() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const presence = usePresence()
  const { prefs, save } = useNotificationPrefs()
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: api.getStaff })
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const active = staff.filter((s) => s.active)
  const live = (id: string) => !!presence.get(id)?.online && !presence.get(id)?.offDuty
  const onlineCount = active.filter((s) => live(s.id)).length
  const sorted = [...active].sort((a, b) => Number(live(b.id)) - Number(live(a.id)) || Number(!!presence.get(a.id)?.offDuty) - Number(!!presence.get(b.id)?.offDuty) || a.name.localeCompare(b.name))
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Who is online"
        className="inline-flex items-center gap-1.5 h-10 sm:h-9 px-2.5 rounded-md border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
      >
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${prefs.onDuty ? 'bg-blue-500' : 'border-2 border-slate-400'}`} />
        <span className="font-medium">{onlineCount}</span>
        <Users size={15} className="hidden sm:block" />
      </button>
      {open && (
        <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl z-50 py-1">
          <div className="px-3 pt-2 pb-2 border-b border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">My status</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => save({ onDuty: true })} className={`rounded-md border-2 px-2 py-1.5 text-sm font-semibold flex items-center justify-center gap-1.5 ${prefs.onDuty ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'}`}><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> On duty</button>
              <button onClick={() => save({ onDuty: false })} className={`rounded-md border-2 px-2 py-1.5 text-sm font-semibold flex items-center justify-center gap-1.5 ${!prefs.onDuty ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-500'}`}><span className="h-2.5 w-2.5 rounded-full border-2 border-slate-400" /> Off duty</button>
            </div>
            <button onClick={() => { setOpen(false); setSettings(true) }} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#3b4a35] hover:underline"><Bell size={12} /> Notification settings</button>
          </div>
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Who is online <span className="font-normal normal-case">(blue = online, red = offline, grey = off duty)</span></div>
          {sorted.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="truncate text-slate-800">{s.name}</span>
              <PresenceDot info={presence.get(s.id)} showText />
            </div>
          ))}
          {sorted.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">No staff to show.</div>}
        </div>
      )}
      {settings && <NotificationSettingsModal onClose={() => setSettings(false)} />}
    </div>
  )
}
