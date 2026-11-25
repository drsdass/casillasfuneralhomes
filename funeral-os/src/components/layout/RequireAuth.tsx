import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { canOpenPath } from '@/lib/permissions'

export default function RequireAuth() {
  const { currentUser, loading } = useSession()
  const location = useLocation()

  // While Supabase is restoring a session on page load (real mode only —
  // mock mode resolves this synchronously), avoid bouncing to /login before
  // we actually know whether the user is signed in.
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // staff_member (lowest tier) is confined to Invoices plus the screens the super admin
  // ticked for that person. Any other route bounces back to Invoices.
  if (!canOpenPath(currentUser, location.pathname)) {
    return <Navigate to="/invoices" replace />
  }

  return <Outlet />
}
