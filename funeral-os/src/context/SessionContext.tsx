import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react'
import { staff as mockStaff, locations as mockLocations, organizations as mockOrganizations } from '@/data/mockData'
import { supabase, USE_MOCK, getStoredOrgId, storeOrgId } from '@/lib/supabase'
import type { StaffMember, Location, UserRole, Organization } from '@/types'
import { canViewAllLocations } from '@/lib/permissions'
import { setCompany, brandFor } from '@/lib/company'

const STORAGE_KEY = 'casillas_os_session_user_id'

interface SessionContextValue {
  currentUser: StaffMember | null
  activeLocationId: string
  setActiveLocationId: (id: string) => void
  accessibleLocations: Location[]
  /** Companies this person may work in (usually one; admins who can see everything get a switcher). */
  organizations: Organization[]
  activeOrg: Organization | null
  switchOrg: (orgId: string, path?: string) => void
  login: (email: string, password: string) => Promise<{ ok: true; role: UserRole } | { ok: false; error: string }>
  logout: () => void
  loading: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

/** Converts a Supabase staff_members row (with joined staff_locations) into the app's StaffMember shape. */
function mapStaffRow(row: any): StaffMember {
  return {
    id: row.id,
    orgId: row.org_id,
    locationIds: (row.staff_locations ?? []).map((sl: { location_id: string }) => sl.location_id),
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title ?? undefined,
    department: row.department ?? undefined,
    phone: row.phone ?? undefined,
    avatarColor: row.avatar_color ?? undefined,
    active: row.active,
    disabledFeatures: row.disabled_features ?? [],
    allCompanies: row.all_companies ?? false,
  }
}

function mapLocationRow(row: any): Location {
  return {
    id: row.id, orgId: row.org_id, name: row.name, address: row.address,
    city: row.city, state: row.state, zip: row.zip, phone: row.phone,
    timezone: row.timezone, licenseNumber: row.license_number ?? undefined, active: row.active,
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(() => {
    if (!USE_MOCK) return null // real mode resolves this async below, via Supabase's own session
    const savedId = localStorage.getItem(STORAGE_KEY)
    if (!savedId) return null
    return mockStaff.find((s) => s.id === savedId && s.active) ?? null
  })
  const [loading, setLoading] = useState(!USE_MOCK)
  // Real mode: the full location list (not just the ones this user can
  // access — that's derived below), fetched once real auth resolves.
  const [allLocations, setAllLocations] = useState<Location[]>(USE_MOCK ? mockLocations : [])

  const [orgList, setOrganizations] = useState<Organization[]>([])
  const [activeOrgId, setActiveOrgId] = useState<string>('')

  const [activeLocationId, setActiveLocationId] = useState<string>(
    () => (USE_MOCK ? (currentUser?.locationIds[0] ?? mockLocations[0].id) : '')
  )

  // Which companies this person may work in, which one this tab is in, and that company's locations.
  async function loadCompanies(mapped: StaffMember) {
    const { data: orgRows } = await supabase!.from('organizations').select('*')
    const orgs: Organization[] = (orgRows ?? []).map((o: any) => ({ id: o.id, name: o.name, createdAt: o.created_at, logoUrl: o.logo_url ?? undefined }))
    const stored = getStoredOrgId()
    const chosen = orgs.find((o) => o.id === stored)?.id ?? mapped.orgId
    if (stored && stored !== chosen) storeOrgId(null) // an old choice this person can no longer use
    setOrganizations(orgs)
    setActiveOrgId(chosen)
    // RLS (together with the company header) already limits this to the active company.
    const { data: locRows } = await supabase!.from('locations').select('*')
    const locs = (locRows ?? []).map(mapLocationRow)
    setAllLocations(locs)
    return { locs }
  }

  // Real-mode: restore/refresh the session from Supabase Auth on load, and
  // react to sign-in/sign-out from anywhere (e.g. token refresh, another tab).
  useEffect(() => {
    if (USE_MOCK) return

    async function loadStaffForSession(userId: string) {
      const { data, error } = await supabase!
        .from('staff_members')
        .select('*, staff_locations(location_id)')
        .eq('id', userId)
        .single()
      if (error || !data) {
        setCurrentUser(null)
        return
      }
      const mapped = mapStaffRow(data)
      const { locs } = await loadCompanies(mapped)
      setCurrentUser(mapped)
      setActiveLocationId((prev) => (locs.some((l) => l.id === prev) ? prev : (locs.find((l) => mapped.locationIds.includes(l.id)) ?? locs[0])?.id ?? ''))
    }


    // Block on the full session+staff+location load before flipping
    // `loading` to false — otherwise RequireAuth can render a route with
    // `currentUser` still null for a moment, or `activeLocationId` still
    // pointing at nothing, causing a flash of the wrong screen or a save
    // that targets a location the UI hasn't actually resolved yet.
    supabase!.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        await loadStaffForSession(data.session.user.id)
      }
      setLoading(false)
    })

    const { data: subscription } = supabase!.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadStaffForSession(session.user.id)
      else setCurrentUser(null)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  // Mock mode keeps every company's locations in one list, so narrow to the active company here (real mode: the database does it).
  const organizations = useMemo(() => {
    if (!USE_MOCK) return orgList
    if (!currentUser) return []
    const mayAll = !!currentUser.allCompanies && canViewAllLocations(currentUser.role)
    return mockOrganizations.filter((o) => o.id === currentUser.orgId || mayAll)
  }, [orgList, currentUser])
  useEffect(() => {
    if (!USE_MOCK || !currentUser) return
    const stored = getStoredOrgId()
    setActiveOrgId(organizations.find((o) => o.id === stored)?.id ?? currentUser.orgId)
  }, [currentUser, organizations])
  const activeOrg = useMemo(() => organizations.find((o) => o.id === activeOrgId) ?? organizations[0] ?? null, [organizations, activeOrgId])
  const accessibleLocations = useMemo(() => {
    if (!currentUser) return []
    const inCompany = allLocations.filter((l) => !activeOrg || l.orgId === activeOrg.id)
    // Admins and super admins see every location of the company they are working in.
    return canViewAllLocations(currentUser.role) ? inCompany : inCompany.filter((l) => currentUser.locationIds.includes(l.id))
  }, [currentUser, allLocations, activeOrg])

  // Real mode and mock mode both: if the chosen location isn't in this company, move to one that is.
  useEffect(() => {
    if (accessibleLocations.length && !accessibleLocations.some((l) => l.id === activeLocationId)) setActiveLocationId(accessibleLocations[0].id)
  }, [accessibleLocations, activeLocationId])

  // The look (colours, logo) follows the company being worked in.
  useEffect(() => {
    document.documentElement.dataset.company = brandFor(activeOrg?.name).key
  }, [activeOrg])
  setCompany(activeOrg?.name) // so messages and forms outside React hooks use the right company name

  /** Switch company. A full reload keeps every screen and cache from mixing two companies' data. */
  function switchOrg(orgId: string, path = '/') {
    storeOrgId(orgId)
    window.location.assign(path)
  }

  async function login(email: string, password: string): Promise<{ ok: true; role: UserRole } | { ok: false; error: string }> {
    if (!USE_MOCK) {
      const { data, error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
      if (error || !data.user) {
        return { ok: false, error: 'Incorrect email or password.' }
      }
      const { data: staffRow, error: staffErr } = await supabase!
        .from('staff_members')
        .select('*, staff_locations(location_id)')
        .eq('id', data.user.id)
        .single()
      if (staffErr || !staffRow) {
        return { ok: false, error: 'Signed in, but no staff record was found for this account.' }
      }
      const mapped = mapStaffRow(staffRow)
      storeOrgId(null) // everyone starts in their own company after signing in
      const { locs } = await loadCompanies(mapped)
      setCurrentUser(mapped)
      setActiveLocationId((locs.find((l) => mapped.locationIds.includes(l.id)) ?? locs[0])?.id ?? '')
      return { ok: true, role: mapped.role }
    }

    // MOCK-ONLY auth against plaintext passwords in mockData.ts. This is a
    // stand-in for real authentication — used only when Supabase env vars
    // aren't set. See README "Auth" section.
    const match = mockStaff.find(
      (s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.active
    )
    if (!match || match.password !== password) {
      return { ok: false, error: 'Incorrect email or password.' }
    }
    setCurrentUser(match)
    setActiveLocationId(match.locationIds[0])
    localStorage.setItem(STORAGE_KEY, match.id)
    return { ok: true, role: match.role }
  }

  function logout() {
    if (!USE_MOCK) {
      supabase!.auth.signOut()
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    storeOrgId(null)
    setCurrentUser(null)
  }

  // Anything this person creates (cases, vendors, families...) belongs to the company they are working in,
  // so the user handed to the rest of the app carries the ACTIVE company as its orgId.
  const workingUser = useMemo(
    () => (currentUser && activeOrg && currentUser.orgId !== activeOrg.id ? { ...currentUser, orgId: activeOrg.id } : currentUser),
    [currentUser, activeOrg]
  )

  const value: SessionContextValue = {
    currentUser: workingUser,
    activeLocationId,
    setActiveLocationId,
    accessibleLocations,
    organizations,
    activeOrg,
    switchOrg,
    login,
    logout,
    loading,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
