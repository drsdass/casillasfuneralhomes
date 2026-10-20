import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
// Re-exported for the one place (family photo/music upload) that calls an
// Edge Function via a direct fetch() instead of supabase.functions.invoke()
// — needed to see the true HTTP status/body ourselves rather than trust
// the SDK wrapper's own error detection, which wasn't surfacing a real
// failure reliably for this specific request.
export const supabaseUrl = url
export const supabaseAnonKey = anonKey

// USE_MOCK is true whenever Supabase env vars aren't configured yet, so the
// app is fully clickable out of the box. Once you connect a real Supabase
// project (see README), set the env vars and this flips automatically.
export const USE_MOCK = !url || !anonKey

// Which company (Casillas, Sanders...) this browser tab is working in. Kept per tab so two tabs can't
// disturb each other. The database only honours it if this person is allowed to see that company.
const ORG_KEY = 'casillas_os_active_org'
export function getStoredOrgId(): string | null {
  try { return sessionStorage.getItem(ORG_KEY) } catch { return null }
}
export function storeOrgId(id: string | null) {
  try { if (id) sessionStorage.setItem(ORG_KEY, id); else sessionStorage.removeItem(ORG_KEY) } catch { /* ignore */ }
}

// Only database requests carry the company header (Edge Functions are told the company in their request body).
const fetchWithCompany: typeof fetch = (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
  const org = getStoredOrgId()
  if (org && href.includes('/rest/v1/')) {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('x-org-id', org)
    return fetch(input, { ...init, headers })
  }
  return fetch(input, init)
}

export const supabase = USE_MOCK
  ? null
  : createClient(url as string, anonKey as string, { global: { fetch: fetchWithCompany } })
