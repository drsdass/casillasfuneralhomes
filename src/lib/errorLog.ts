/** Keeps the last few browser errors so a Help report can say what went wrong behind the scenes. */
const recent: string[] = []
const push = (s: string) => { recent.push(`${new Date().toISOString().slice(11, 19)} ${s.slice(0, 300)}`); if (recent.length > 8) recent.shift() }
export function installErrorLog() {
  window.addEventListener('error', (e) => push(`error: ${e.message}`))
  window.addEventListener('unhandledrejection', (e) => push(`rejected: ${String((e.reason as Error)?.message ?? e.reason)}`))
}
export const recentErrors = () => [...recent]
