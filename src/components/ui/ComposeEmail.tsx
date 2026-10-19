import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, X, Loader2 } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { api } from '@/lib/api'
import { DictateButton } from '@/components/ui/DictateButton'
import type { InboundEmail } from '@/types'

/** Write or reply to an email from the shared funeral home address. The system records who sent it. */
export function ComposeEmail({ to: initialTo = '', subject: initialSubject = '', caseId, replyTo, onClose }: {
  to?: string; subject?: string; caseId?: string; replyTo?: InboundEmail; onClose: () => void
}) {
  const { currentUser } = useSession()
  const { language } = useLanguage()
  const tx = (en: string, es: string) => (language === 'es' ? es : en)
  const qc = useQueryClient()
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)

  const send = useMutation({
    mutationFn: () => api.sendEmail({ to: to.trim(), subject: subject.trim(), body, caseId, replyToEmailId: replyTo?.id }, currentUser!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emails'] })
      qc.invalidateQueries({ queryKey: ['case-emails'] })
      qc.invalidateQueries({ queryKey: ['activity-panel'] })
      setSent(true)
      setTimeout(onClose, 1200)
    },
  })
  const ready = to.trim() !== '' && subject.trim() !== '' && body.trim() !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold text-slate-900">{replyTo ? tx('Reply', 'Responder') : tx('New email', 'Nuevo correo')}</h2>
          <button onClick={onClose} aria-label={tx('Close', 'Cerrar')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">{tx('To', 'Para')}
            <input value={to} onChange={(e) => setTo(e.target.value)} type="email" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-700">{tx('Subject', 'Asunto')}
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
          </label>
          <label className="block text-sm font-medium text-slate-700">{tx('Message', 'Mensaje')}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base" />
          </label>
          <DictateButton onText={(t) => setBody((b) => (b ? `${b} ${t}` : t))} />
          <p className="text-xs text-slate-500">
            {tx(`Sent from the funeral home email, signed with your name (${currentUser?.name}). A record of who sent it is kept.`,
                `Se envía desde el correo de la funeraria, firmado con su nombre (${currentUser?.name}). Se guarda quién lo envió.`)}
          </p>
          {send.isError && <p className="text-sm text-red-600">{(send.error as Error).message}</p>}
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          {sent && <span className="text-sm font-medium text-emerald-700">{tx('Sent', 'Enviado')} ✓</span>}
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">{tx('Cancel', 'Cancelar')}</button>
          <button disabled={!ready || send.isPending || sent} onClick={() => send.mutate()} className="inline-flex items-center gap-2 rounded-lg bg-[#3b4a35] px-5 py-2 font-semibold text-white hover:bg-[#4d5f45] disabled:opacity-50">
            {send.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {tx('Send', 'Enviar')}
          </button>
        </div>
      </div>
    </div>
  )
}
