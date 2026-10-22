import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import type { Workflow, WorkItem } from '@/lib/workflow'
import type { CaseTab } from '@/lib/nextStep'

/** The status light for one line: green check when done, flashing red when missing and urgent, steady amber when missing. */
export function StatusLight({ item, size = 28 }: { item: Pick<WorkItem, 'done' | 'urgent' | 'auto' | 'waiting'>; size?: number }) {
  const s = { width: size, height: size }
  if (!item.done && item.waiting) return <span style={s} className="shrink-0 inline-flex items-center justify-center rounded-full border-[3px] border-dashed border-slate-300 bg-white" aria-label="Waiting" />
  if (item.done) return <span style={s} className="shrink-0 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={size * 0.62} strokeWidth={3} /></span>
  if (item.urgent) return <span style={s} className="wf-flash wf-blink shrink-0 inline-flex items-center justify-center rounded-full bg-red-600 text-white font-bold" aria-label="Urgent">!</span>
  return <span style={s} className="shrink-0 inline-flex items-center justify-center rounded-full border-[3px] border-amber-500 bg-white" aria-label="Missing" />
}

export interface SignoffCtl { onSign: (item: WorkItem) => void; busy: boolean; blocked?: string; lang: 'en' | 'es' }

function FixButton({ item, onTab, canEdit, ctl }: { item: WorkItem; onTab: (t: CaseTab) => void; canEdit: boolean; ctl?: SignoffCtl }) {
  if (!canEdit) return null
  const cls = 'shrink-0 rounded-md bg-[#3b4a35] text-white text-sm font-medium px-4 py-2 hover:bg-[#4d5f45]'
  const look = item.button ? (item.to ? <Link to={item.to} className={item.signoff ? 'shrink-0 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50' : cls}>{item.button}</Link> : <button type="button" onClick={() => item.tab && onTab(item.tab)} className={item.signoff ? 'shrink-0 rounded-md border border-slate-300 bg-white text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50' : cls}>{item.button}</button>) : null
  if (!item.signoff || !ctl) return look
  const es = ctl.lang === 'es'
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {look}
      <button type="button" disabled={ctl.busy || !!ctl.blocked} onClick={() => ctl.onSign(item)} title={ctl.blocked} className={`${cls} disabled:opacity-40`}>{es ? 'Ya lo revisé — está bien' : 'I checked it — it is right'}</button>
      {ctl.blocked && <span className="basis-full text-right text-xs text-amber-700">{ctl.blocked}</span>}
    </span>
  )
}

/** The big picture on a case: six blocks like a progress bar, then exactly what is still missing, each with a button to fix it. */
export function WorkflowTrack({ wf, onTab, canEdit, lang = 'en', signoff }: { wf: Workflow; onTab: (t: CaseTab) => void; canEdit: boolean; lang?: 'en' | 'es'; signoff?: SignoffCtl }) {
  const tx = (en: string, es: string) => (lang === 'es' ? es : en)
  const [showAll, setShowAll] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const shown = wf.phases.find((p) => p.key === picked) ?? wf.current
  const shownMissing = shown ? shown.items.filter((i) => !i.done && !i.auto && !i.waiting) : []
  const shownWaiting = shown ? shown.items.filter((i) => !i.done && i.waiting) : []
  const laterMissing = wf.missing.filter((m) => !shownMissing.includes(m))

  return (
    <div className={`no-print mt-4 rounded-xl border-2 bg-white p-4 ${wf.urgentCount ? 'border-red-300' : wf.allDone ? 'border-emerald-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-slate-900">{tx('Case progress', 'Progreso del caso')}</h3>
        <span className="text-sm text-slate-500">{wf.percent}% {tx('complete', 'completo')}</span>
        <span className="ml-auto">
          {wf.allDone ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold px-3 py-1"><Check size={15} strokeWidth={3} /> {tx('Nothing missing', 'No falta nada')}</span>
            : <span className={`inline-flex items-center gap-2 rounded-full text-sm font-semibold px-3 py-1 ${wf.urgentCount ? 'bg-red-600 text-white wf-flash' : 'bg-amber-100 text-amber-900'}`}>
                {wf.urgentCount ? `${wf.urgentCount} ${tx('urgent', 'urgente')} · ` : ''}{wf.missing.length} {tx(wf.missing.length === 1 ? 'thing still missing' : 'things still missing', wf.missing.length === 1 ? 'cosa falta' : 'cosas faltan')}
              </span>}
        </span>
      </div>

      <div className="mt-3 flex gap-1.5">
        {wf.phases.map((p) => {
          const tone = p.status === 'done' ? 'bg-emerald-700 text-white' : p.status === 'active' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'
          const sel = shown?.key === p.key
          return (
            <button key={p.key} type="button" onClick={() => setPicked(p.key)} className={`flex-1 min-w-0 rounded-md px-2 py-2.5 text-center leading-tight transition ${tone} ${sel ? 'ring-2 ring-offset-1 ring-slate-900' : 'hover:opacity-90'}`}>
              <div className="text-xs sm:text-sm font-semibold truncate">{p.status === 'done' ? '✓ ' : ''}{p.label}</div>
              <div className="text-[11px] opacity-90">{p.status === 'done' ? tx('Done', 'Listo') : `${p.done} ${tx('of', 'de')} ${p.total}`}</div>
            </button>
          )
        })}
      </div>

      {shown && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{shown.label} {shownMissing.length ? `— ${tx('still to do', 'por hacer')}` : shownWaiting.length ? `— ${tx('waiting', 'en espera')}` : `— ${tx('all done', 'todo listo')}`}</div>
          <div className="space-y-2">
            {(shownMissing.length ? shownMissing : shown.items.filter((i) => !i.auto).slice(0, 0)).map((it) => (
              <div key={it.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${it.urgent ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50/60'}`}>
                <StatusLight item={it} />
                <div className="flex-1 text-base font-medium text-slate-900">{it.label}</div>
                <FixButton item={it} onTab={onTab} canEdit={canEdit} ctl={signoff} />
              </div>
            ))}
            {shownWaiting.map((it) => (
              <div key={it.key} className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
                <StatusLight item={it} />
                <div className="flex-1 text-base text-slate-500">{it.label}<span className="block text-xs text-slate-400">{tx('Not ready yet — the step before it is not finished.', 'Todavía no — falta terminar el paso anterior.')}</span></div>
              </div>
            ))}
            {shownMissing.length === 0 && shownWaiting.length === 0 && <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-emerald-900"><StatusLight item={{ done: true }} /> {tx('Everything in this step is finished.', 'Todo en este paso está terminado.')}</div>}
          </div>
        </div>
      )}

      {laterMissing.length > 0 && !showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-sm font-medium text-[#3b4a35] hover:underline">{tx(`Show everything still missing on this case (${laterMissing.length} more)`, `Mostrar todo lo que falta en este caso (${laterMissing.length} más)`)}</button>
      )}
      {(showAll || (laterMissing.length === 0 && wf.allDone === false)) && showAll && (
        <div className="mt-3 space-y-1.5">
          {laterMissing.map((it) => (
            <div key={it.key} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2"><StatusLight item={it} size={22} /><div className="flex-1 text-sm text-slate-800">{it.label}</div><FixButton item={it} onTab={onTab} canEdit={canEdit} ctl={signoff} /></div>
          ))}
          <button type="button" onClick={() => setShowAll(false)} className="text-sm text-slate-500 hover:underline">{tx('Hide', 'Ocultar')}</button>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-800">{tx('See the whole checklist with check marks', 'Ver toda la lista con marcas')}</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {wf.phases.map((p) => (
            <div key={p.key}>
              <div className="text-sm font-semibold text-slate-800 mb-1">{p.label}</div>
              <ul className="space-y-1">{p.items.map((i) => <li key={i.key} className="flex items-center gap-2 text-sm text-slate-700"><StatusLight item={i} size={18} /><span className={i.done ? 'text-slate-500' : i.waiting ? 'text-slate-400' : ''}>{i.label}{i.done && i.signoff?.by ? <span className="text-emerald-700"> — {lang === 'es' ? 'revisado por' : 'checked by'} {i.signoff.by}{i.signoff.at ? `, ${new Date(i.signoff.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span> : null}</span></li>)}</ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">{tx('These check marks turn green by themselves when the information is saved — nobody has to tick them.', 'Estas marcas se ponen verdes solas cuando se guarda la información — nadie tiene que marcarlas.')}</p>
      </details>
    </div>
  )
}

/** The little version for lists: six small blocks and a pill saying how many things are missing. */
export function MiniTrack({ wf, lang = 'en' }: { wf: Workflow; lang?: 'en' | 'es' }) {
  const tx = (en: string, es: string) => (lang === 'es' ? es : en)
  return (
    <span className="inline-flex flex-col gap-1">
      <span className="flex gap-0.5" title={wf.phases.map((p) => `${p.label}: ${p.status === 'done' ? '✓' : `${p.done}/${p.total}`}`).join('\n')}>
        {wf.phases.map((p) => <span key={p.key} className={`h-2.5 w-6 rounded-sm ${p.status === 'done' ? 'bg-emerald-600' : p.status === 'active' ? 'bg-amber-500' : 'bg-slate-200'}`} />)}
      </span>
      {wf.allDone
        ? <span className="text-[11px] font-semibold text-emerald-700">✓ {tx('Nothing missing', 'No falta nada')}</span>
        : <span className={`self-start text-[11px] font-semibold rounded-full px-2 py-0.5 ${wf.urgentCount ? 'bg-red-600 text-white wf-flash wf-blink' : 'bg-amber-100 text-amber-900'}`}>{wf.urgentCount ? '! ' : ''}{wf.missing.length} {tx('missing', 'faltan')}</span>}
    </span>
  )
}
