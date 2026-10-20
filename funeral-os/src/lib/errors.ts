/**
 * Supabase (and many other libraries) throw plain objects with a
 * `.message` property rather than real Error instances — `instanceof
 * Error` silently fails on those, which was causing real error messages
 * to get swallowed and replaced with an unhelpful "Unknown error"
 * throughout the app. This pulls a usable message out of anything.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return fallback
  }
}
