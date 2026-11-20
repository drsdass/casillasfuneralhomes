import { useCallback, useEffect, useState } from 'react'

/** "Recently opened" and "starred" cases, kept for each signed-in person on the device they use. */
interface Store { recent: { id: string; at: number }[]; pinned: string[] }
const key = (userId: string) => `cos.caseShortcuts.${userId}`
const EVT = 'cos-case-shortcuts'

function read(userId: string): Store {
  try { const s = JSON.parse(localStorage.getItem(key(userId)) || '{}'); return { recent: Array.isArray(s.recent) ? s.recent : [], pinned: Array.isArray(s.pinned) ? s.pinned : [] } } catch { return { recent: [], pinned: [] } }
}
function write(userId: string, s: Store) {
  try { localStorage.setItem(key(userId), JSON.stringify(s)) } catch { /* private window: shortcuts just don't stick */ }
  window.dispatchEvent(new Event(EVT))
}

/** Called whenever a case is opened. */
export function noteCaseOpened(userId: string, caseId: string) {
  const s = read(userId)
  write(userId, { ...s, recent: [{ id: caseId, at: Date.now() }, ...s.recent.filter((r) => r.id !== caseId)].slice(0, 30) })
}

export function useCaseShortcuts(userId: string | undefined) {
  const [s, setS] = useState<Store>(() => (userId ? read(userId) : { recent: [], pinned: [] }))
  useEffect(() => {
    if (!userId) return
    const sync = () => setS(read(userId))
    sync()
    window.addEventListener(EVT, sync); window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync) }
  }, [userId])
  const togglePin = useCallback((caseId: string) => {
    if (!userId) return
    const cur = read(userId)
    write(userId, { ...cur, pinned: cur.pinned.includes(caseId) ? cur.pinned.filter((x) => x !== caseId) : [caseId, ...cur.pinned] })
  }, [userId])
  return { recent: s.recent, pinned: s.pinned, togglePin }
}
