import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { supabase, USE_MOCK } from '@/lib/supabase'
import { api } from '@/lib/api'

/** Opened from the emailed "reset your password" link. The link signs the person in just long enough to choose a new password. */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<'checking' | 'ready' | 'expired' | 'done'>('checking')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (USE_MOCK) { setState('ready'); return }
    let cancelled = false
    const check = async () => { const { data } = await supabase!.auth.getSession(); if (!cancelled && data.session) setState('ready') }
    const { data: sub } = supabase!.auth.onAuthStateChange((event, session) => { if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setState('ready') })
    check()
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'expired' : s)), 4000) // no usable link after a few seconds
    return () => { cancelled = true; clearTimeout(t); sub.subscription.unsubscribe() }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Please use at least 8 characters.'); return }
    if (password !== again) { setError('The two passwords do not match.'); return }
    setSaving(true)
    try { await api.setNewPassword(password); setState('done'); setTimeout(() => navigate('/', { replace: true }), 1800) }
    catch (err) { setError((err as Error)?.message?.includes('same') ? 'Please choose a password you have not used before.' : 'We could not save that. Please try again, or ask for a new link.') }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[#cbb98c] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/casillas-logo.png" alt="" className="h-16 w-auto mb-3" />
          <div className="font-display text-xl font-semibold text-[#2b3327] tracking-wide">Choose a new password</div>
        </div>
        <div className="bg-white rounded-md shadow-md border border-[#b3925a]/30 p-6">
          {state === 'checking' && <p className="text-sm text-slate-500 text-center">One moment…</p>}
          {state === 'expired' && (
            <div className="text-center">
              <p className="text-sm text-slate-700 mb-4">This link has expired or was already used. Please ask for a new one.</p>
              <button onClick={() => navigate('/login', { replace: true })} className="w-full bg-[#3b4a35] text-white text-sm font-medium py-2.5 rounded-md hover:bg-[#4d5f45]">Back to sign in</button>
            </div>
          )}
          {state === 'done' && <p className="text-sm text-emerald-700 text-center font-medium">Your password is changed. Taking you in…</p>}
          {state === 'ready' && (
            <form onSubmit={submit}>
              <label className="block text-xs font-medium text-slate-600 mb-1">New password</label>
              <input type="password" required autoFocus minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              <label className="block text-xs font-medium text-slate-600 mb-1">Type it again</label>
              <input type="password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
              {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}
              <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-[#3b4a35] text-white text-sm font-medium py-2.5 rounded-md hover:bg-[#4d5f45] disabled:opacity-60"><KeyRound size={14} /> {saving ? 'Saving…' : 'Save new password'}</button>
              <p className="mt-3 text-[11px] text-slate-400 text-center">At least 8 characters.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
