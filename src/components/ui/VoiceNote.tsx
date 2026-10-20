import { useEffect, useMemo, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, X, Check } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { api } from '@/lib/api'
import { appendChunk } from '@/lib/dictation'
import { canViewAllLocations } from '@/lib/permissions'
import { suggestStage, casesNamedIn } from '@/lib/voiceNote'
import { CUSTODY_STAGE_LABELS, type CustodyStage } from '@/types'
import { DictateButton } from '@/components/ui/DictateButton'
import { isCaseDone } from '@/lib/caseDone'

/** The big microphone in the top bar of every page: say a note, pick (or say) the file, save. */
export function VoiceNoteButton() {
  const [open, setOpen] = useState(false)
  const { language } = useLanguage()
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap bg-[#b3925a] text-[#2b3327] text-sm font-semibold px-3 sm:px-4 h-10 rounded-full hover:bg-[#c4a36b] shadow-sm transition"
        title={language === 'es' ? 'Dictar una nota' : 'Say a note and save it to a file'}
        aria-label={language === 'es' ? 'Nota de voz' : 'Voice note'}
      >
        <Mic size={18} /> <span className="hidden sm:inline">{language === 'es' ? 'Nota de voz' : 'Voice note'}</span>
      </button>
      {open && <VoiceNoteDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function VoiceNoteDialog({ onClose }: { onClose: () => void }) {
  const { currentUser, activeLocationId } = useSession()
  const { language } = useLanguage()
  const tx = (en: string, es: string) => (language === 'es' ? es : en)
  const qc = useQueryClient()
  const routeCase = useMatch('/cases/:caseId/*')?.params.caseId
  const all = currentUser ? canViewAllLocations(currentUser.role) : false
  const [text, setText] = useState('')
  const [caseId, setCaseId] = useState('')
  const [stage, setStage] = useState<CustodyStage | null>(null)
  const [alsoMove, setAlsoMove] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const { data: cases = [] } = useQuery({ queryKey: ['cases', all ? 'all' : activeLocationId], queryFn: () => api.getCases(all ? undefined : activeLocationId) })
  const open = useMemo(() => cases.filter((c) => !isCaseDone(c)), [cases])
  useEffect(() => { if (routeCase && !caseId && open.some((c) => c.id === routeCase)) setCaseId(routeCase) }, [routeCase, open, caseId])
  useEffect(() => { const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])

  const chosen = open.find((c) => c.id === caseId)
  const save = useMutation({
    mutationFn: async () => {
      await api.addNote(caseId, currentUser!, `[Voice] ${text.trim()}`)
      if (alsoMove && stage && chosen && stage !== chosen.custodyStage) await api.moveCustody(caseId, stage, currentUser!, text.trim())
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['case-notes'] }); qc.invalidateQueries({ queryKey: ['custody-log'] })
      setDone(chosen ? `${chosen.decedent.firstName} ${chosen.decedent.lastName}` : ''); setText(''); setStage(null); setAlsoMove(false)
    },
  })

  function onSpoken(chunk: string) {
    setDone(null)
    setText((prev) => {
      const next = appendChunk(prev, chunk)
      const named = casesNamedIn(next, open)
      if (named.length === 1) setCaseId(named[0].id)
      setStage(suggestStage(next))
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold text-slate-900 flex items-center gap-2"><Mic size={18} /> {tx('Voice note', 'Nota de voz')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-500">{tx('Tap the microphone, say your note, tap Stop. Say the decedent’s name and it picks the file.', 'Toque el micrófono, diga su nota y toque Detener. Diga el nombre y se elige el archivo.')}</p>
        <DictateButton size="lg" onText={onSpoken} />
        <textarea value={text} onChange={(e) => { setText(e.target.value); setDone(null) }} rows={4}
          placeholder={tx('Your note appears here. You can also type or fix it.', 'Su nota aparece aquí. También puede escribir o corregirla.')}
          className="w-full border border-slate-200 rounded-lg p-3 text-base focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-3 text-base bg-white">
          <option value="">{tx('Which file does this go on?', '¿En qué archivo va?')}</option>
          {open.map((c) => <option key={c.id} value={c.id}>{c.decedent.firstName} {c.decedent.lastName} — {c.caseNumber}</option>)}
        </select>
        {stage && chosen && stage !== chosen.custodyStage && (
          <label className="flex items-center gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <input type="checkbox" checked={alsoMove} onChange={(e) => setAlsoMove(e.target.checked)} className="h-4 w-4 accent-[#3b4a35]" />
            {tx('Also move to', 'Mover también a')} <b>{CUSTODY_STAGE_LABELS[stage]}</b>
          </label>
        )}
        <button onClick={() => save.mutate()} disabled={!text.trim() || !caseId || save.isPending}
          className="w-full h-12 rounded-lg bg-[#3b4a35] text-white font-medium text-base disabled:opacity-40">
          {save.isPending ? tx('Saving…', 'Guardando…') : tx('Save note to file', 'Guardar nota en el archivo')}
        </button>
        {done !== null && <div className="flex items-center gap-1.5 text-sm text-emerald-700"><Check size={15} /> {tx('Saved', 'Guardado')}{done ? ` — ${done}` : ''}.</div>}
        {save.isError && <div className="text-sm text-red-600">{tx('Couldn’t save — check your connection and try again.', 'No se pudo guardar. Revise su conexión.')}</div>}
      </div>
    </div>
  )
}
