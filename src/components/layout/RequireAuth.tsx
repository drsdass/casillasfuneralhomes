import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '@/context/SessionContext'
import { isRestrictedToInvoices, STAFF_MEMBER_PATHS } from '@/lib/permissions'

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

  // staff_member (lowest tier) is confined to Invoices, the TV Board, Chain of Custody
  // and the Driver view. Any other route bounces back to Invoices.
  if (isRestrictedToInvoices(currentUser.role) && !STAFF_MEMBER_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) {
    return <Navigate to="/invoices" replace />
  }

  return <Outlet />
}
