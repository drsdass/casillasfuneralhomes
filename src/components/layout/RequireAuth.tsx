import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { isRestrictedToInvoices } from '@/lib/permissions'

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

  // staff_member (lowest tier) is confined to the invoices screen — print
  // and paid/unpaid toggle only. Any other route bounces back there.
  if (isRestrictedToInvoices(currentUser.role) && location.pathname !== '/invoices') {
    return <Navigate to="/invoices" replace />
  }

  return <Outlet />
}
