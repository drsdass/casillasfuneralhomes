import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LifeBuoy, X, CheckCircle2 } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { api } from '@/lib/api'
import { recentErrors } from '@/lib/errorLog'

/** "Help" at the top of every page: type what isn't working and it goes straight to the admins, with the page and technical details attached. */
export function HelpButton() {
  const { currentUser } = useSession()
  const { language } = useLanguage()
  const es = language === 'es'
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  if (!currentUser) return null

  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true); setErr('')
    try {
      const details = [
        `Page: ${window.location.href}`,
        `Screen: ${window.innerWidth}x${window.innerHeight}`,
        `Browser: ${navigator.userAgent}`,
        `Time: ${new Date().toISOString()}`,
        recentErrors().length ? `Recent errors:\n${recentErrors().join('\n')}` : 'Recent errors: none',
      ].join('\n')
      await api.submitHelpReport({ message: text.trim(), page: loc.pathname, details }, currentUser)
      setSent(true); setText('')
    } catch (e) {
      setErr((e as Error)?.message || 'Could not send. Please tell Satish or Ashlie directly.')
    } finally { setBusy(false) }
  }
  const close = () => { setOpen(false); setSent(false); setErr('') }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={es ? 'Algo no funciona? Avísenos' : "Something not working? Tell us"} aria-label="Help"
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium px-2.5 sm:px-3 h-10 sm:h-9 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition">
        <LifeBuoy size={15} /><span className="hidden sm:inline">{es ? 'Ayuda' : 'Help'}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{es ? 'Algo no funciona?' : "Something isn't working?"}</h2>
                <p className="text-sm text-slate-500">{es ? 'Cuéntenos qué pasó. Se envía a los administradores junto con la página en que está.' : 'Tell us what happened. It goes to the admins along with the page you are on.'}</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {sent ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={32} />
                <p className="font-medium text-slate-900">{es ? 'Enviado. Gracias.' : 'Sent. Thank you.'}</p>
                <p className="mt-1 text-sm text-slate-500">{es ? 'Lo revisaremos pronto.' : "We'll look into it."}</p>
                <button type="button" onClick={close} className="mt-4 rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white">{es ? 'Cerrar' : 'Close'}</button>
              </div>
            ) : (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus
                  placeholder={es ? 'Ej: Al guardar la hoja vital no se guardó el teléfono…' : 'Example: I saved the Vital Sheet but the phone number did not stay…'}
                  className="w-full rounded-md border border-slate-300 p-2.5 text-sm" />
                <p className="mt-1 text-xs text-slate-400">{es ? 'Página:' : 'Page:'} {loc.pathname}</p>
                {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-md border border-slate-300 px-3 py-2 text-sm">{es ? 'Cancelar' : 'Cancel'}</button>
                  <button type="button" onClick={send} disabled={!text.trim() || busy} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '…' : es ? 'Enviar' : 'Send'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
