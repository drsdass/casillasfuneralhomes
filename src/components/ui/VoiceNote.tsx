import { useEffect, useMemo, useRef, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, X, Check, Sparkles } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { api } from '@/lib/api'
import { appendChunk } from '@/lib/dictation'
import { canViewAllLocations } from '@/lib/permissions'
import { suggestStage, casesNamedIn } from '@/lib/voiceNote'
import { CUSTODY_STAGE_LABELS, type CustodyStage } from '@/types'
import { DictateButton } from '@/components/ui/DictateButton'
import { isCaseDone, isPreNeed } from '@/lib/caseDone'
import { interpretVoice, describeAction, speak, type VoiceAction } from '@/lib/voiceCommand'

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
  const textRef = useRef('')
  textRef.current = text
  const [thinking, setThinking] = useState(false)
  const [proposal, setProposal] = useState<{ actions: VoiceAction[]; reply: string } | null>(null)
  const [picked, setPicked] = useState<boolean[]>([])
  const [ran, setRan] = useState<string[] | null>(null)

  const { data: cases = [] } = useQuery({ queryKey: ['cases', all ? 'all' : activeLocationId], queryFn: () => api.getCases(all ? undefined : activeLocationId) })
  const open = useMemo(() => cases.filter((c) => !isCaseDone(c) && !isPreNeed(c)), [cases])
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

  async function understand() {
    const said = textRef.current.trim()
    if (!said) return
    setThinking(true); setRan(null)
    const r = await interpretVoice(said, open)
    setProposal({ actions: r.actions, reply: r.reply }); setPicked(r.actions.map(() => true)); setThinking(false)
  }
  const run = useMutation({
    mutationFn: async () => {
      const said: string[] = []
      for (const [i, a] of (proposal?.actions ?? []).entries()) {
        if (!picked[i]) continue
        if (a.type === 'move_custody') await api.moveCustody(a.caseId, a.stage, currentUser!, `[Voice] ${textRef.current.trim()}`)
        else await api.addNote(a.caseId, currentUser!, `[Voice] ${a.body}`, a.special)
        said.push(describeAction(a, open))
      }
      return said
    },
    onSuccess: (said) => {
      qc.invalidateQueries()
      setRan(said); setProposal(null); setText('')
      speak(said.length ? tx('Done. ', 'Listo. ') + said.join('. ') : '', language === 'es' ? 'es' : 'en')
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
        <DictateButton size="lg" onText={onSpoken} onStop={() => setTimeout(() => { void understand() }, 400)} />
        <textarea value={text} onChange={(e) => { setText(e.target.value); setDone(null) }} rows={4}
          placeholder={tx('Your note appears here. You can also type or fix it.', 'Su nota aparece aquí. También puede escribir o corregirla.')}
          className="w-full border border-slate-200 rounded-lg p-3 text-base focus:outline-none focus:ring-2 focus:ring-[#b3925a]" />
        <button type="button" onClick={() => void understand()} disabled={!text.trim() || thinking}
          className="w-full h-11 rounded-lg border border-[#3b4a35] text-[#3b4a35] font-medium text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40">
          <Sparkles size={16} /> {thinking ? tx('Thinking…', 'Pensando…') : tx('What should I do? (move cases, add notes)', '¿Qué debo hacer? (mover casos, notas)')}
        </button>
        {proposal && (
          <div className="rounded-lg border-2 border-[#b3925a] bg-amber-50/60 p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-800">{tx('Here is what I understood — tap Do it to confirm', 'Esto es lo que entendí — toque Hacerlo para confirmar')}</div>
            {proposal.actions.map((a, i) => (
              <label key={i} className="flex items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={picked[i] ?? false} onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} className="h-4 w-4 mt-0.5 accent-[#3b4a35]" />
                <span>{describeAction(a, open)}</span>
              </label>
            ))}
            {proposal.actions.length === 0 && <div className="text-sm text-slate-600">{tx('Nothing to do yet.', 'Nada por hacer todavía.')}</div>}
            {proposal.reply && <div className="text-sm text-slate-600 italic">{proposal.reply}</div>}
            {proposal.actions.length > 0 && (
              <button type="button" onClick={() => run.mutate()} disabled={run.isPending || !picked.some(Boolean)}
                className="w-full h-12 rounded-lg bg-[#3b4a35] text-white font-medium text-base disabled:opacity-40">
                {run.isPending ? tx('Working…', 'Trabajando…') : tx('Do it', 'Hacerlo')}
              </button>
            )}
            {run.isError && <div className="text-sm text-red-600">{tx('Something did not save — check the case and try again.', 'Algo no se guardó. Revise el caso e intente de nuevo.')}</div>}
          </div>
        )}
        {ran && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 space-y-0.5">{ran.map((r, i) => <div key={i} className="flex items-start gap-1.5"><Check size={15} className="mt-0.5 shrink-0" /> {r}</div>)}</div>}
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
