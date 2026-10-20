import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { landingRouteFor } from '@/lib/permissions'
import { Lock, ArrowLeft, MailCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { USE_MOCK } from '@/lib/supabase'

export default function LoginPage() {
  const { login } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await login(email, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(landingRouteFor(result.role), { replace: true })
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await api.requestPasswordReset(email)
    setSubmitting(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-[#cbb98c] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-16 w-16 flex items-center justify-center mb-3">
            <img src="/casillas-logo.png" alt="Casillas Funeral Home" className="h-full w-auto" />
          </div>
          <div className="font-display text-xl font-semibold text-[#2b3327] tracking-wide">CASILLAS FUNERAL HOME</div>
          <div className="text-xs text-[#5a5942] mt-1">Staff Portal</div>
        </div>

        {forgot ? (
        <form onSubmit={handleForgot} className="bg-white rounded-md shadow-md border border-[#b3925a]/30 p-6">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto mb-3 text-[#3b4a35]" size={30} />
              <div className="text-sm font-semibold text-slate-800 mb-1">Check your email</div>
              <p className="text-sm text-slate-600 mb-4">If <span className="font-medium">{email}</span> is a staff login, we have sent a link to choose a new password. It can take a few minutes, and may land in Junk.</p>
              <button type="button" onClick={() => { setForgot(false); setSent(false) }} className="text-sm font-medium text-[#3b4a35] hover:underline">Back to sign in</button>
            </div>
          ) : (
            <>
              <div className="text-sm font-semibold text-slate-800 mb-1">Forgot your password?</div>
              <p className="text-xs text-slate-500 mb-4">Type your login email and we will send you a link to choose a new one.</p>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@casillasfuneralhome.com"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
              />
              <button type="submit" disabled={submitting} className="w-full bg-[#3b4a35] text-white text-sm font-medium py-2.5 rounded-md hover:bg-[#4d5f45] transition disabled:opacity-60">{submitting ? 'Sending…' : 'Send me a link'}</button>
              <button type="button" onClick={() => setForgot(false)} className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><ArrowLeft size={12} /> Back to sign in</button>
            </>
          )}
        </form>
        ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-md shadow-md border border-[#b3925a]/30 p-6">
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@casillasfuneralhome.com"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
            />
          </div>
          <div className="mb-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
            />
          </div>

          <div className="mb-5 text-right">
            <button type="button" onClick={() => { setForgot(true); setSent(false); setError(null) }} className="text-xs font-medium text-[#3b4a35] hover:underline">Forgot password?</button>
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#3b4a35] text-white text-sm font-medium py-2.5 rounded-md hover:bg-[#4d5f45] transition disabled:opacity-60"
          >
            <Lock size={14} /> {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        )}

        {USE_MOCK && (
          <p className="text-center text-xs text-[#5a5942] mt-4">
            Demo credentials — Super Admin: casillasjoel@live.com / qwerty
          </p>
        )}
      </div>
    </div>
  )
}
