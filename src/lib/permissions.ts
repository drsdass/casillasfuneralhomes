import { ROLE_RANK, type UserRole, type StaffMember } from '@/types'

/** True if `role` meets or exceeds the rank of `minimum`. */
export function atLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/** Who sees an "all locations" combined view instead of being pinned to one. */
export function canViewAllLocations(role: UserRole): boolean {
  return atLeast(role, 'admin')
}

/** Only super_admin can assign or change another user's role, or their location/feature access. */
export function canAssignRoles(role: UserRole): boolean {
  return role === 'super_admin'
}

/** Same bar as role assignment — managing a user's location/feature access is an equally sensitive action. */
export function canManageAccess(role: UserRole): boolean {
  return role === 'super_admin'
}

/** staff_member is restricted to the Invoices screen (print + paid toggle only). */
export function isRestrictedToInvoices(role: UserRole): boolean {
  return role === 'staff_member'
}

/** Who can create/edit GPL items and full contracts (not just toggle paid status). */
export function canEditFinancials(role: UserRole): boolean {
  return atLeast(role, 'manager')
}

/** Who can create/edit cases, tasks, and move chain-of-custody stages. */
export function canEditCases(role: UserRole): boolean {
  return atLeast(role, 'supervisor')
}

/** Manager and above only: assigning staff (and vehicles) to events, which locks that person out of overlapping events. */
export function canAssignStaff(role: UserRole): boolean {
  return atLeast(role, 'manager')
}

/** Revenue/case-volume reporting exposes financials across cases — same bar as editing financials. */
export function canViewReports(role: UserRole): boolean {
  return atLeast(role, 'manager')
}

/** Who can view the audit log — sensitive, so kept at admin+ for now. */
export function canViewAuditLog(role: UserRole): boolean {
  return atLeast(role, 'admin')
}

/** Landing route immediately after login, based on role. */
export function landingRouteFor(role: UserRole): string {
  return isRestrictedToInvoices(role) ? '/invoices' : '/'
}

/** Every nav key a role could see by default, before per-user overrides. */
function roleDefaultNavKeys(role: UserRole): string[] {
  if (isRestrictedToInvoices(role)) return ['invoices']
  const keys = ['dashboard', 'cases', 'families', 'custody', 'calendar', 'staff-schedule', 'messages', 'inbox', 'financials', 'board']
  if (canViewReports(role)) keys.push('reports')
  if (atLeast(role, 'admin')) keys.push('admin')
  return keys
}

/**
 * Nav items visible in the sidebar for a specific user, in order. Applies
 * that user's `disabledFeatures` overrides on top of their role's defaults
 * — this is the super_admin "allow or disable access to locations or
 * features" control from the Admin page.
 */
export function visibleNavKeys(user: Pick<StaffMember, 'role' | 'disabledFeatures'>): string[] {
  const defaults = roleDefaultNavKeys(user.role)
  const disabled = new Set(user.disabledFeatures ?? [])
  return defaults.filter((k) => !disabled.has(k))
}

/** All feature keys a super_admin can toggle per-user, with display labels. */
export const TOGGLEABLE_FEATURES: { key: string; label: string }[] = [
  { key: 'cases', label: 'Cases' },
  { key: 'families', label: 'Families' },
  { key: 'custody', label: 'Chain of Custody' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'staff-schedule', label: 'Staff Schedule' },
  { key: 'messages', label: 'Messages' },
  { key: 'inbox', label: 'Email Inbox' },
  { key: 'financials', label: 'Financials / Accounting' },
  { key: 'reports', label: 'Reports' },
  { key: 'board', label: 'TV Board' },
  { key: 'admin', label: 'Admin' },
]
