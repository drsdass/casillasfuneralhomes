import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Truck } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Primitives'
import { DictateButton } from '@/components/ui/DictateButton'
import { appendChunk } from '@/lib/dictation'
import { suggestStage, casesNamedIn } from '@/lib/voiceNote'
import { canViewAllLocations } from '@/lib/permissions'
import { useLanguage } from '@/i18n/LanguageContext'
import { CUSTODY_STAGE_LABELS, type CustodyStage } from '@/types'
import { isCaseDone, isPreNeed } from '@/lib/caseDone'

// The next step for a case, in plain words a driver would use.
const NEXT_STEP: Partial<Record<CustodyStage, { to: CustodyStage; label: string }>> = {
  scene_first_call: { to: 'in_transit', label: 'Picked up — on the way' },
  in_transit: { to: 'funeral_home', label: 'Arrived at the funeral home' },
}

export default function DriverView() {
  const { activeLocationId, currentUser } = useSession()
  const queryClient = useQueryClient()
  const { language } = useLanguage()
  const es = language === 'es'
  const all = currentUser ? canViewAllLocations(currentUser.role) : false
  const [text, setText] = useState('')
  const [caseId, setCaseId] = useState('')
  const [stage, setStage] = useState<CustodyStage | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const { data: cases = [] } = useQuery({
    queryKey: ['cases', all ? 'all' : activeLocationId],
    queryFn: () => api.getCases(all ? undefined : activeLocationId),
  })
  const open = useMemo(() => cases.filter((c) => !isCaseDone(c) && !isPreNeed(c)), [cases])
  const active = open.filter((c) => c.custodyStage in NEXT_STEP).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['cases'] }); queryClient.invalidateQueries({ queryKey: ['custody-log'] }); queryClient.invalidateQueries({ queryKey: ['case-notes'] }) }

  const move = useMutation({
    mutationFn: ({ id, to, note }: { id: string; to: CustodyStage; note?: string }) => api.moveCustody(id, to, currentUser!, note),
    onSuccess: refresh,
  })
  const [moved, setMoved] = useState<{ id: string; name: string; from: CustodyStage; to: CustodyStage } | null>(null)
  const saveNote = useMutation({
    mutationFn: async (v: { text: string; caseId: string; stage: CustodyStage | null }) => {
      await api.addNote(v.caseId, currentUser!, `[Voice] ${v.text.trim()}`)
      const c = open.find((x) => x.id === v.caseId)
      if (v.stage && c && v.stage !== c.custodyStage) {
        await api.moveCustody(v.caseId, v.stage, currentUser!, v.text.trim())
        return { id: c.id, name: `${c.decedent.firstName} ${c.decedent.lastName}`, from: c.custodyStage, to: v.stage }
      }
      return null
    },
    onSuccess: (m, v) => { refresh(); setSaved(v.caseId); setMoved(m); setText(''); setStage(null); setCaseId('') },
  })
  const undo = useMutation({
    mutationFn: (m: { id: string; from: CustodyStage }) => api.moveCustody(m.id, m.from, currentUser!, 'Undo: moved by mistake from a voice note'),
    onSuccess: () => { refresh(); setMoved(null); setSaved(null) },
  })

  // Latest values, readable from the microphone's "stopped" callback.
  const latest = useRef({ text: '', caseId: '', stage: null as CustodyStage | null })
  latest.current = { text, caseId, stage }
  /** When the driver stops talking and the file AND the new location were both understood, save and move right away (with Undo). */
  function onStopped() {
    const { text: t, caseId: id, stage: st } = latest.current
    const c = open.find((x) => x.id === id)
    if (t.trim() && c && st && st !== c.custodyStage && !saveNote.isPending) saveNote.mutate({ text: t, caseId: id, stage: st })
  }

  function onSpoken(chunk: string) {
    setSaved(null)
    setText((prev) => {
      const next = appendChunk(prev, chunk)
      const named = casesNamedIn(next, open)
      if (named.length === 1) setCaseId(named[0].id)
      const s = suggestStage(next)
      if (s) setStage(s)
      return next
    })
  }

  /** Starter sentences: one tap fills in the note (and the file, and where they are now); the driver can still add to it by voice. */
  function chosenCase() { return open.find((c) => c.id === caseId) ?? (active.length === 1 ? active[0] : null) }
  const starters: { label: string; text: (n: string) => string; stage: CustodyStage | null }[] = es
    ? [
        { label: 'Recogí a…', text: (n) => `Recogí a ${n} en `, stage: 'scene_first_call' },
        { label: 'En camino a la funeraria', text: (n) => `En camino a la funeraria con ${n}.`, stage: 'in_transit' },
        { label: 'Llegué a la funeraria', text: (n) => `Llegué a la funeraria con ${n}.`, stage: 'funeral_home' },
        { label: 'Solo una nota', text: () => '', stage: null },
      ]
    : [
        { label: 'Picked up…', text: (n) => `Picked up ${n} from `, stage: 'scene_first_call' },
        { label: 'On the way to the funeral home', text: (n) => `On the way to the funeral home with ${n}.`, stage: 'in_transit' },
        { label: 'Arrived at the funeral home', text: (n) => `Arrived at the funeral home with ${n}.`, stage: 'funeral_home' },
        { label: 'Just a note', text: () => '', stage: null },
      ]
  function applyStarter(st: typeof starters[number]) {
    const c = chosenCase()
    setSaved(null); setMoved(null)
    if (c) setCaseId(c.id)
    setText(st.text(c ? `${c.decedent.firstName} ${c.decedent.lastName}` : (es ? 'el fallecido' : 'the decedent')))
    setStage(st.stage)
  }

  const chosen = open.find((c) => c.id === caseId)
  const canSave = !!text.trim() && !!caseId && !saveNote.isPending

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-display font-semibold text-slate-900 flex items-center gap-2"><Truck size={20} /> Driver</h1>
        <p className="text-sm text-slate-500">Tap the microphone, say what happened, then tap Stop. Say the decedent&rsquo;s name and where they are now, and it saves the note and moves them for you (with an Undo).</p>
      </div>

      <Card className="p-4 space-y-3">
        <DictateButton size="lg" onText={onSpoken} onStop={onStopped} />
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1.5">{es ? 'Toque para empezar:' : 'Tap to start:'}</div>
          <div className="flex flex-wrap gap-2">
            {starters.map((st) => (
              <button key={st.label} type="button" onClick={() => applyStarter(st)}
                className="rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 active:bg-slate-100">{st.label}</button>
            ))}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setSaved(null) }}
          rows={4}
          placeholder="e.g. Picked up John Doe from Eisenhower and I'm on the way back to Coachella."
          className="w-full border border-slate-200 rounded-lg p-3 text-base focus:outline-none focus:ring-2 focus:ring-[#b3925a]"
        />
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-3 text-base bg-white">
          <option value="">Which decedent?</option>
          {open.map((c) => <option key={c.id} value={c.id}>{c.decedent.firstName} {c.decedent.lastName} — {c.caseNumber}</option>)}
        </select>
        {stage && chosen && stage !== chosen.custodyStage && (
          <label className="flex items-center gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <input type="checkbox" checked onChange={() => setStage(null)} className="accent-[#3b4a35] h-4 w-4" />
            Also move to <b>{CUSTODY_STAGE_LABELS[stage]}</b> <span className="text-xs text-slate-500">(untick to leave where it is)</span>
          </label>
        )}
        <button
          onClick={() => saveNote.mutate({ text, caseId, stage })}
          disabled={!canSave}
          className="w-full h-12 rounded-lg bg-[#3b4a35] text-white font-medium text-base disabled:opacity-40"
        >
          {saveNote.isPending ? 'Saving…' : 'Save note to file'}
        </button>
        {moved
          ? (
            <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Check size={15} /> <span className="flex-1">Saved, and moved <b>{moved.name}</b> to <b>{CUSTODY_STAGE_LABELS[moved.to]}</b>.</span>
              <button onClick={() => undo.mutate(moved)} disabled={undo.isPending} className="font-medium underline">Undo</button>
            </div>)
          : saved && <div className="flex items-center gap-1.5 text-sm text-emerald-700"><Check size={15} /> Saved to the file.</div>}
        {saveNote.isError && <div className="text-sm text-red-600">Couldn&rsquo;t save — check your connection and try again.</div>}
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Active pickups</h2>
        <div className="space-y-2">
          {active.map((c) => {
            const next = NEXT_STEP[c.custodyStage]
            return (
              <Card key={c.id} className="p-3">
                <Link to={`/cases/${c.id}`} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.decedent.firstName} {c.decedent.lastName}</div>
                    <div className="text-xs text-slate-500">{CUSTODY_STAGE_LABELS[c.custodyStage]}{c.firstCall?.locationAddress ? ` · ${c.firstCall.locationAddress}` : ''}</div>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 shrink-0" />
                </Link>
                {next && (
                  <button
                    onClick={() => move.mutate({ id: c.id, to: next.to })}
                    disabled={move.isPending}
                    className="mt-2 w-full h-12 rounded-lg border-2 border-[#3b4a35] text-[#3b4a35] font-medium active:bg-[#3b4a35] active:text-white disabled:opacity-50"
                  >
                    {next.label}
                  </button>
                )}
              </Card>
            )
          })}
          {active.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No active pickups right now.</div>}
        </div>
      </div>
    </div>
  )
}
