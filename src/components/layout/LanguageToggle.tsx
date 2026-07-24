import { useLanguage } from '@/i18n/LanguageContext'
import { Languages } from 'lucide-react'

export function LanguageToggle({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { language, toggleLanguage } = useLanguage()

  const styles = variant === 'dark'
    ? 'text-slate-400 hover:text-slate-600'
    : 'text-white/80 hover:text-white'

  return (
    <button
      onClick={toggleLanguage}
      title={language === 'en' ? 'Cambiar a Español' : 'Switch to English'}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold transition ${styles}`}
    >
      <Languages size={14} />
      {language === 'en' ? 'ES' : 'EN'}
    </button>
  )
}
