import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useSession } from '@/context/SessionContext'
import { USE_MOCK, supabase } from '@/lib/supabase'

/** "Easy view": bigger text and buttons, fewer menu items, a simple Today home. A personal choice, remembered per person: saved to their account (so it follows them to any computer), with a copy on this computer as backup. */
interface EasyViewValue { easy: boolean; setEasy: (v: boolean) => void; toggle: () => void }
const Ctx = createContext<EasyViewValue>({ easy: false, setEasy: () => {}, toggle: () => {} })

const key = (userId: string) => `casillas_easy_view_${userId}`
function read(userId: string | undefined): boolean {
  if (!userId) return false
  try { return localStorage.getItem(key(userId)) === '1' } catch { return false }
}

export function EasyViewProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useSession()
  const userId = currentUser?.id
  const [easy, setEasyState] = useState(() => read(userId))

  useEffect(() => { setEasyState(read(userId)) }, [userId])
  // Pull the saved choice from the account (if the prefs.sql step has been run); this computer's copy is the fallback.
  useEffect(() => {
    if (USE_MOCK || !userId || !supabase) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.from('staff_members').select('easy_view').eq('id', userId).maybeSingle()
        if (error || cancelled || !data || typeof data.easy_view !== 'boolean') return
        setEasyState(data.easy_view)
        try { localStorage.setItem(key(userId), data.easy_view ? '1' : '0') } catch { /* ignore */ }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [userId])
  useEffect(() => {
    document.documentElement.classList.toggle('easy', easy)
    return () => document.documentElement.classList.remove('easy')
  }, [easy])

  const setEasy = useCallback((v: boolean) => {
    setEasyState(v)
    if (userId) { try { localStorage.setItem(key(userId), v ? '1' : '0') } catch { /* ignore */ } }
    if (!USE_MOCK && supabase) { void Promise.resolve(supabase.rpc('set_my_easy_view', { v })).catch(() => {}) }
  }, [userId])

  return <Ctx.Provider value={{ easy, setEasy, toggle: () => setEasy(!easy) }}>{children}</Ctx.Provider>
}

export const useEasyView = () => useContext(Ctx)
