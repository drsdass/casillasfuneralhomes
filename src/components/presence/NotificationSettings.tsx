import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, X, Share, Smartphone } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import { DEFAULT_PREFS, type NotificationPrefs } from '@/lib/presence'
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported, type EnableResult } from '@/lib/push'

/** This person's On duty switch and notification choices. Saved the moment something changes. */
export function useNotificationPrefs() {
  const { currentUser } = useSession()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['notif-prefs', currentUser?.id], queryFn: () => api.getNotificationPrefs(currentUser!.id), enabled: !!currentUser })
  const prefs = data ?? DEFAULT_PREFS
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => api.saveNotificationPrefs(currentUser!.id, p),
    onMutate: async (p) => { qc.setQueryData(['notif-prefs', currentUser?.id], p) },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['notif-prefs'] }); qc.invalidateQueries({ queryKey: ['off-duty'] }) },
  })
  return { prefs, save: (patch: Partial<NotificationPrefs>) => save.mutate({ ...prefs, ...patch }), saving: save.isPending }
}

const KINDS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'notifyEmail', label: 'New emails', hint: 'Mail arriving in the shared inbox' },
  { key: 'notifyMessage', label: 'Messages', hint: 'Messages from other staff' },
  { key: 'notifyCase', label: 'New cases and first calls', hint: 'Including cases you are assigned to' },
  { key: 'notifyDriver', label: 'Pickups', hint: 'A first call at the scene that needs someone to go' },
]

export function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const { currentUser } = useSession()
  const { prefs, save } = useNotificationPrefs()
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [result, setResult] = useState<EnableResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  useEffect(() => { currentSubscription().then((s) => setSubscribed(!!s && perm === 'granted')) }, [perm])

  async function turnOn() {
    if (!currentUser) return
    setBusy(true)
    const r = await enablePush(currentUser.id)
    setResult(r); setSubscribed(r.ok); setBusy(false)
  }
  async function sendTest() {
    setBusy(true); setTestMsg(null)
    try {
      const r = await api.sendTestPush()
      setTestMsg(r.offDuty ? 'You are Off duty, so nothing was sent. Switch to On duty and try again.'
        : r.noDevice ? 'No device is signed up yet. Turn on notifications first.'
        : r.sent > 0 ? 'Sent! Lock your phone now. You should hear and feel it within a few seconds.'
        : 'Nothing could be delivered. Try turning notifications off and on again.')
    } catch { setTestMsg('Could not send the test. Please try again.') }
    setBusy(false)
  }
  async function turnOff() { setBusy(true); await disablePush(); setSubscribed(false); setResult(null); setBusy(false) }

  const needsInstall = isIos() && !isStandalone()
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Bell size={17} /> My notifications</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">My status</div>
        <div className="grid grid-cols-2 gap-2 mb-1">
          <button onClick={() => save({ onDuty: true })} className={`rounded-lg border-2 px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${prefs.onDuty ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <span className="h-3 w-3 rounded-full bg-blue-500" /> On duty
          </button>
          <button onClick={() => save({ onDuty: false })} className={`rounded-lg border-2 px-3 py-3 text-sm font-semibold flex items-center justify-center gap-2 ${!prefs.onDuty ? 'border-slate-500 bg-slate-100 text-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <span className="h-3 w-3 rounded-full border-2 border-slate-400" /> Off duty
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-5">{prefs.onDuty ? 'Your light is on. You get the notifications ticked below.' : 'Your light is off. You will not get any notifications, pop-ups or sounds until you switch back to On duty.'}</p>

        <div className={prefs.onDuty ? '' : 'opacity-50'}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Tell me about</div>
          <div className="space-y-1 mb-5">
            {KINDS.map((k) => (
              <label key={k.key} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[#3b4a35]" checked={!!prefs[k.key]} onChange={(e) => save({ [k.key]: e.target.checked })} />
                <span><span className="block text-sm font-medium text-slate-800">{k.label}</span><span className="block text-xs text-slate-500">{k.hint}</span></span>
              </label>
            ))}
          </div>
        </div>

        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">This phone or computer</div>
        {needsInstall ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold mb-1 flex items-center gap-1.5"><Smartphone size={15} /> First, put the app on your Home Screen</div>
            <ol className="list-decimal ml-5 space-y-0.5 text-[13px]">
              <li>In Safari, tap the <Share size={13} className="inline -mt-0.5" /> Share button.</li>
              <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              <li>Open it from the new icon on your Home Screen, log in, and come back here to turn notifications on.</li>
            </ol>
          </div>
        ) : !pushSupported() ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">This browser can't show notifications when it's closed. Try Chrome, Edge, or Safari on a recent phone.</div>
        ) : subscribed ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="text-sm text-blue-900 mb-2"><span className="font-semibold">Notifications are on</span> for this device.</div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={sendTest} className="inline-flex items-center gap-1.5 rounded-md bg-[#3b4a35] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4d5f45]"><Bell size={14} /> Send me a test</button>
              <button disabled={busy} onClick={turnOff} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"><BellOff size={14} /> Turn off</button>
            </div>
            {testMsg && <p className="mt-2 text-xs text-slate-700">{testMsg}</p>}
            <p className="mt-2 text-[11px] text-slate-500">No sound? Your phone controls it: Settings → Apps → this app (or Chrome) → Notifications → make sure sound is on and it is not set to Silent.</p>
          </div>
        ) : (
          <div>
            <button disabled={busy} onClick={turnOn} className="w-full rounded-lg bg-[#3b4a35] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4d5f45] disabled:opacity-60">{busy ? 'One moment…' : 'Turn on notifications on this device'}</button>
            {perm === 'denied' && <p className="mt-2 text-xs text-red-600">Notifications are blocked for this site. Open your browser or phone settings for this site and allow notifications, then try again.</p>}
          </div>
        )}
        {result && !result.ok && result.reason === 'denied' && <p className="mt-2 text-xs text-red-600">You tapped Don't Allow. Open your phone or browser settings for this site, allow notifications, then try again.</p>}
        {result && !result.ok && result.reason === 'error' && <p className="mt-2 text-xs text-red-600">That didn't work{result.message ? `: ${result.message}` : ''}. Please try again.</p>}
        <p className="mt-4 text-[11px] text-slate-400">Each phone or computer you use needs to be turned on once. Your On duty switch and ticks apply to all of them.</p>
      </div>
    </div>
  )
}
