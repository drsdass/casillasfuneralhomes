import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useSession } from '@/context/SessionContext'

/** "Easy view": bigger text and buttons, fewer menu items, a simple Today home. A personal choice, remembered per person on this computer. */
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
  useEffect(() => {
    document.documentElement.classList.toggle('easy', easy)
    return () => document.documentElement.classList.remove('easy')
  }, [easy])

  const setEasy = useCallback((v: boolean) => {
    setEasyState(v)
    if (userId) { try { localStorage.setItem(key(userId), v ? '1' : '0') } catch { /* ignore */ } }
  }, [userId])

  return <Ctx.Provider value={{ easy, setEasy, toggle: () => setEasy(!easy) }}>{children}</Ctx.Provider>
}

export const useEasyView = () => useContext(Ctx)
