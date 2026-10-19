import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Mail, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { mail } from '@/lib/mail'

const STATE_KEY = 'casillas_ms_state'

/** Admin-only: connect (or reconnect) the funeral home's Outlook mailbox. Handles Microsoft's return trip too. */
export function MailConnectionPanel() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const { data: status, error: statusError } = useQuery({ queryKey: ['mail-status'], queryFn: mail.status, retry: false })

  // Coming back from Microsoft's sign-in page: ?code=...&state=...
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const code = p.get('code'); const err = p.get('error_description') ?? p.get('error')
    if (!code && !err) return
    window.history.replaceState({}, '', window.location.pathname)
    if (err) { setMsg(`Microsoft said: ${err}`); return }
    let saved: string | null = null
    try { saved = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY) } catch { /* ignore */ }
    if (!saved || saved !== p.get('state')) { setMsg('That sign-in did not match this browser, so it was ignored. Please press Connect again.'); return }
    setBusy(true)
    mail.finish(code!)
      .then((r) => { setMsg(`Connected to ${r.address}.`); qc.invalidateQueries({ queryKey: ['mail-status'] }) })
      .catch((e) => setMsg((e as Error).message))
      .finally(() => setBusy(false))
  }, [qc])

  async function connect() {
    setBusy(true); setMsg(null)
    try {
      const state = crypto.randomUUID()
      try { sessionStorage.setItem(STATE_KEY, state) } catch { /* ignore */ }
      const { url } = await mail.start(state)
      window.location.href = url
    } catch (e) { setMsg((e as Error).message); setBusy(false) }
  }
  async function disconnect() {
    if (!confirm('Disconnect the mailbox? New email will stop arriving until it is connected again.')) return
    setBusy(true)
    try { await mail.disconnect(); qc.invalidateQueries({ queryKey: ['mail-status'] }) } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }

  const needsReconnect = status?.connected && status.status === 'needs_reconnect'
  const tone = needsReconnect ? 'border-red-200 bg-red-50' : status?.connected ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'

  return (
    <div className={`mb-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${tone}`}>
      {needsReconnect ? <AlertTriangle size={20} className="text-red-600" /> : status?.connected ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Mail size={20} className="text-amber-600" />}
      <div className="min-w-0 flex-1 text-sm">
        {statusError ? <span className="text-slate-700">Could not check the email connection: {(statusError as Error).message}</span>
          : !status ? <span className="text-slate-500">Checking the email connection…</span>
          : needsReconnect ? <span className="text-slate-800"><b>The email connection needs to be renewed.</b> New mail has stopped arriving. Press Reconnect and sign in with the funeral home email.</span>
          : status.connected ? <span className="text-slate-800">Connected to <b>{status.address}</b>{status.connectedAt && <> since {format(parseISO(status.connectedAt), 'MMM d, yyyy')}</>}. New mail is checked every 5 minutes.</span>
          : !status.configured ? <span className="text-slate-800">Email is not set up yet. The Microsoft keys still need to be added in Supabase (see docs/outlook-setup.md, steps 1 to 6).</span>
          : <span className="text-slate-800"><b>Email is not connected.</b> Press Connect and sign in once with the funeral home email (info@casillasfuneralhome.com).</span>}
        {msg && <div className="mt-1 text-slate-700">{msg}</div>}
      </div>
      {status && (status.configured || status.connected) && (
        <div className="flex gap-2">
          <button onClick={connect} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4d5f45] disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />} {status.connected ? 'Reconnect' : 'Connect Outlook mailbox'}
          </button>
          {status.connected && <button onClick={disconnect} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Disconnect</button>}
        </div>
      )}
    </div>
  )
}
