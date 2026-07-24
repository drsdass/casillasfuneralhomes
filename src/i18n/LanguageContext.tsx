import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { en } from './en'
import { es } from './es'

export type Language = 'en' | 'es'

const dictionaries = { en, es }

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
  /** Looks up a dot-notation path, e.g. t('familyPortal.obituary.title'). Falls back to the path itself if missing, so a gap is visible instead of blank/crashing. Supports {placeholder} interpolation via the second argument. */
  t: (path: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getStoredLanguage(storageKey: string): Language {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem(storageKey)
  if (stored === 'en' || stored === 'es') return stored
  // Default to Spanish if the browser's own language is Spanish — a
  // reasonable first guess for someone who's never toggled before, still
  // fully overridable via the toggle button.
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/**
 * One provider, reused for both the staff app and the Family Portal — but
 * each mounts its own instance with a different localStorage key, since a
 * staff member's language preference and a family's are unrelated (a
 * family member's browser has no concept of "this staff account prefers
 * Spanish," and vice versa).
 */
export function LanguageProvider({ children, storageKey = 'casillas_os_language' }: { children: ReactNode; storageKey?: string }) {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage(storageKey))

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(storageKey, lang)
  }, [storageKey])

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'es' : 'en')
  }, [language, setLanguage])

  const t = useCallback((path: string, vars?: Record<string, string | number>): string => {
    const parts = path.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = dictionaries[language]
    for (const part of parts) {
      node = node?.[part]
      if (node === undefined) return path // visible gap instead of a blank string or a crash
    }
    if (typeof node !== 'string') return path
    if (!vars) return node
    return Object.entries(vars).reduce((str, [key, value]) => str.replaceAll(`{${key}}`, String(value)), node)
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
