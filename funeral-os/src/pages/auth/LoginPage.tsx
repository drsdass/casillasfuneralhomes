import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { landingRouteFor } from '@/lib/permissions'
import { Lock } from 'lucide-react'

export default function LoginPage() {
  const { login } = useSession()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
          <div className="mb-5">
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

        <p className="text-center text-xs text-[#5a5942] mt-4">
          Demo credentials — Super Admin: casillasjoel@live.com / qwerty
        </p>
      </div>
    </div>
  )
}
