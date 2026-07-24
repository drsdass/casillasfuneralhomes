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

export const supabase = USE_MOCK
  ? null
  : createClient(url as string, anonKey as string)
