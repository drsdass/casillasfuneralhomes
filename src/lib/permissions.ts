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

/** staff_member is restricted to a short list of screens: Invoices (print + paid toggle), the TV Board, Chain of Custody and the Driver phone view. */
export function isRestrictedToInvoices(role: UserRole): boolean {
  return role === 'staff_member'
}

/**
 * Staff Member is the lowest tier: Invoices always, plus whatever the super admin ticks for that person.
 * The ticks are stored in the same `disabled_features` column as 'allow:<key>' entries (so no database change is needed);
 * 'allow:set' marks that the super admin has chosen. Until then a Staff Member gets the default three below.
 */
export const STAFF_DEFAULT_KEYS = ['custody', 'driver', 'board']
export const STAFF_GRANTABLE = (): string[] => TOGGLEABLE_FEATURES.filter((f) => f.key !== 'admin').map((f) => f.key)

export function staffGrantedKeys(disabled: string[] | undefined): string[] {
  const d = disabled ?? []
  if (!d.includes('allow:set')) return STAFF_DEFAULT_KEYS
  return d.filter((k) => k.startsWith('allow:') && k !== 'allow:set').map((k) => k.slice(6))
}

/** Is this feature ticked for this person (works for every role)? */
export function featureTicked(user: Pick<StaffMember, 'role' | 'disabledFeatures'>, key: string): boolean {
  if (isRestrictedToInvoices(user.role)) return staffGrantedKeys(user.disabledFeatures).includes(key)
  return !(user.disabledFeatures ?? []).includes(key)
}

/** The new `disabled_features` list after the super admin ticks/unticks one feature for this person. */
export function toggleFeatureList(user: Pick<StaffMember, 'role' | 'disabledFeatures'>, key: string): string[] {
  if (isRestrictedToInvoices(user.role)) {
    const granted = staffGrantedKeys(user.disabledFeatures)
    const next = granted.includes(key) ? granted.filter((k) => k !== key) : [...granted, key]
    return ['allow:set', ...next.map((k) => `allow:${k}`)]
  }
  const cur = user.disabledFeatures ?? []
  return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
}

const PATH_KEYS: [string, string][] = [
  ['/cases', 'cases'], ['/quotes', 'quotes'], ['/families', 'families'], ['/custody', 'custody'], ['/driver', 'driver'],
  ['/calendar', 'calendar'], ['/staff-schedule', 'staff-schedule'], ['/music', 'music'], ['/chapel-tv', 'music'],
  ['/messages', 'messages'], ['/inbox', 'inbox'], ['/financials', 'financials'], ['/reports', 'reports'],
  ['/obituary-manager', 'obituaries'], ['/site-events', 'site-events'], ['/board', 'board'],
]

/** May this person open this page? Only Staff Members are limited (others see everything their role allows). */
export function canOpenPath(user: Pick<StaffMember, 'role' | 'disabledFeatures'>, path: string): boolean {
  if (!isRestrictedToInvoices(user.role)) return true
  if (path === '/invoices' || path.startsWith('/invoices/')) return true
  const hit = PATH_KEYS.find(([p]) => path === p || path.startsWith(p + '/'))
  return !!hit && staffGrantedKeys(user.disabledFeatures).includes(hit[1])
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
  const keys = ['dashboard', 'cases', 'quotes', 'families', 'custody', 'calendar', 'staff-schedule', 'music', 'messages', 'inbox', 'financials', 'board', 'obituaries']
  if (atLeast(role, 'manager')) keys.push('site-events')
  if (atLeast(role, 'supervisor')) keys.push('driver')
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
  if (isRestrictedToInvoices(user.role)) {
    const granted = staffGrantedKeys(user.disabledFeatures)
    return ['invoices', ...granted.filter((k) => STAFF_GRANTABLE().includes(k))]
  }
  const defaults = roleDefaultNavKeys(user.role)
  const disabled = new Set(user.disabledFeatures ?? [])
  return defaults.filter((k) => !disabled.has(k))
}

/** All feature keys a super_admin can toggle per-user, with display labels. */
export const TOGGLEABLE_FEATURES: { key: string; label: string }[] = [
  { key: 'cases', label: 'Cases' },
  { key: 'quotes', label: 'Quick Quotes' },
  { key: 'families', label: 'Families' },
  { key: 'custody', label: 'Chain of Custody' },
  { key: 'driver', label: 'Driver (phone view)' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'staff-schedule', label: 'Staff Schedule' },
  { key: 'music', label: 'Music (Sonos speakers)' },
  { key: 'messages', label: 'Messages' },
  { key: 'inbox', label: 'Email Inbox' },
  { key: 'financials', label: 'Financials / Accounting' },
  { key: 'reports', label: 'Reports' },
  { key: 'obituaries', label: 'Obituaries (public pages)' },
  { key: 'site-events', label: 'Website events' },
  { key: 'board', label: 'TV Board' },
  { key: 'admin', label: 'Admin' },
]

/** Editing the price list (names, prices, adding/hiding items): super admin only. */
export function canEditPriceList(role: UserRole): boolean {
  return role === 'super_admin'
}

/** Permanently deleting a case is admin-only (matches the database rule). */
export function canDeleteCases(role: UserRole): boolean {
  return atLeast(role, 'admin')
}

/** Correcting or removing an entry in a case's custody history (e.g. while old files are being entered): manager and above. */
export function canEditCustodyHistory(role: UserRole): boolean {
  return atLeast(role, 'manager')
}
