import { Mic, Square } from 'lucide-react'
import { useDictation } from '@/lib/dictation'
import { useLanguage } from '@/i18n/LanguageContext'

/** A microphone button: tap, talk, tap again. The spoken words are appended (as text) through onText. */
export function DictateButton({ onText, onStop, size = 'md' }: { onText: (text: string) => void; onStop?: () => void; size?: 'md' | 'lg' }) {
  const { language } = useLanguage()
  const d = useDictation(language === 'es' ? 'es-US' : 'en-US', onText, onStop)
  if (!d.supported) return null
  const big = size === 'lg'
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={d.listening ? d.stop : d.start}
        className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition ${big ? 'h-14 px-6 text-base' : 'h-9 px-3 text-sm'} ${
          d.listening ? 'bg-red-600 text-white animate-pulse' : 'bg-[#3b4a35] text-white hover:bg-[#4d5f45]'
        }`}
      >
        {d.listening ? <Square size={big ? 18 : 14} /> : <Mic size={big ? 20 : 15} />}
        {d.listening ? (language === 'es' ? 'Detener' : 'Stop') : (language === 'es' ? 'Dictar' : 'Dictate')}
      </button>
      {d.listening && d.interim && <div className="text-xs text-slate-500 italic max-w-xs">{d.interim}…</div>}
      {d.error && <div className="text-xs text-red-600 max-w-xs">{d.error}</div>}
    </div>
  )
}
