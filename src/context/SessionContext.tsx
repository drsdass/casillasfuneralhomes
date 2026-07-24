import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react'
import { staff as mockStaff, locations as mockLocations } from '@/data/mockData'
import { supabase, USE_MOCK } from '@/lib/supabase'
import type { StaffMember, Location, UserRole } from '@/types'

const STORAGE_KEY = 'casillas_os_session_user_id'

interface SessionContextValue {
  currentUser: StaffMember | null
  activeLocationId: string
  setActiveLocationId: (id: string) => void
  accessibleLocations: Location[]
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

  const [activeLocationId, setActiveLocationId] = useState<string>(
    () => (USE_MOCK ? (currentUser?.locationIds[0] ?? mockLocations[0].id) : '')
  )

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
      setCurrentUser(mapped)
      setActiveLocationId((prev) => (mapped.locationIds.includes(prev) ? prev : mapped.locationIds[0] ?? ''))

      // Fetch the full location list too, so accessibleLocations (below)
      // can resolve real names/addresses instead of nothing — RLS already
      // scopes this to locations this org's staff can see.
      const { data: locRows } = await supabase!.from('locations').select('*')
      if (locRows) setAllLocations(locRows.map(mapLocationRow))
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

  const accessibleLocations = useMemo(
    () => (currentUser ? allLocations.filter((l) => currentUser.locationIds.includes(l.id)) : []),
    [currentUser, allLocations]
  )

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
      const { data: locRows } = await supabase!.from('locations').select('*')
      if (locRows) setAllLocations(locRows.map(mapLocationRow))
      setCurrentUser(mapped)
      setActiveLocationId(mapped.locationIds[0] ?? '')
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
    setCurrentUser(null)
  }

  const value: SessionContextValue = {
    currentUser,
    activeLocationId,
    setActiveLocationId,
    accessibleLocations,
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
