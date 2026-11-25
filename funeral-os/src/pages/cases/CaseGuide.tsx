import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronRight, PartyPopper } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/context/SessionContext'
import { useLanguage } from '@/i18n/LanguageContext'
import { nextStep } from '@/lib/nextStep'
import { computeWorkflow } from '@/lib/workflow'
import { Card } from '@/components/ui/Primitives'

/**
 * The guided path for a case: always shows the ONE thing to do now, with a big button, and a track of the whole process.
 * First Call → family contact → burial/cremation → Vital Sheet → arrangement → contract → service date → checklist → balance.
 * Each page it sends staff to ends by coming back here, so nobody has to know the process or hunt for the next screen.
 */
export default function CaseGuide() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { currentUser } = useSession()
  const { language } = useLanguage()
  const es = language === 'es'
  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })
  const { data: tasks = [] } = useQuery({ queryKey: ['case-tasks', caseId], queryFn: () => api.getCaseTasks(caseId!), enabled: !!caseId })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: api.getContracts })
  const { data: documents = [] } = useQuery({ queryKey: ['case-documents', caseId], queryFn: () => api.getCaseDocuments(caseId!), enabled: !!caseId })
  const { data: statements } = useQuery({ queryKey: ['case-statements', caseId], queryFn: () => api.getCaseStatements(caseId!), enabled: !!caseId })
  const pick = useMutation({
    mutationFn: (disposition: import('@/types').DispositionType) => api.updateCase(caseId!, { disposition }, currentUser!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['case', caseId] }); qc.invalidateQueries({ queryKey: ['cases'] }) },
  })
  if (!c) return <div className="py-16 text-center text-slate-400">{es ? 'Cargando…' : 'Loading…'}</div>

  const contract = contracts.find((k) => k.caseId === c.id)
  const step = nextStep(c, { contract, tasks }, language)
  const wf = computeWorkflow(c, { contract, tasks, docs: documents, signoffs: statements?.['_signoffs'] }, language)
  const name = `${c.decedent.firstName} ${c.decedent.lastName}`.trim()
  const go = step.to ? `${step.to}${step.to.includes('?') ? '&' : '?'}flow=1` : step.tab ? `/cases/${c.id}?tab=${step.tab}` : null
  const todo = (wf.current?.items ?? []).filter((i) => !i.done && !i.auto && !i.waiting).slice(0, 6)
  const stepNo = wf.phases.findIndex((p) => p.status === 'active') + 1

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{es ? 'Guía del caso' : 'Case guide'}</div>
        <h1 className="text-2xl font-semibold text-slate-900">{name}</h1>
      </div>

      {/* the whole process, one block per phase */}
      <ol className="flex gap-1.5">
        {wf.phases.map((p) => (
          <li key={p.key} className="min-w-0 flex-1">
            <div className={`h-2.5 rounded-full ${p.status === 'done' ? 'bg-emerald-500' : p.status === 'active' ? 'bg-amber-400' : 'bg-slate-200'}`} />
            <div className={`mt-1.5 truncate text-xs ${p.status === 'active' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{p.label}</div>
          </li>
        ))}
      </ol>

      <Card className={`p-6 ${step.done ? 'border-emerald-300 bg-emerald-50' : 'border-2 border-[#3b4a35]'}`}>
        {step.done ? (
          <div className="flex items-center gap-3 text-emerald-800"><PartyPopper size={28} /><div><div className="text-xl font-semibold">{step.text}</div><div className="text-sm">{es ? 'No queda nada pendiente en esta guía.' : 'Nothing is left to do in this guide.'}</div></div></div>
        ) : (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-[#b3925a]">{es ? 'Haga esto ahora' : 'Do this now'}{stepNo ? ` · ${es ? 'Fase' : 'Stage'} ${stepNo} / ${wf.phases.length}` : ''}</div>
            <div className="mt-2 text-2xl font-semibold leading-snug text-slate-900">{step.text}</div>
            {step.choices && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {step.choices.map((ch) => (
                  <button key={ch.value} type="button" disabled={pick.isPending} onClick={() => pick.mutate(ch.value)} className="rounded-xl bg-[#3b4a35] px-4 py-4 text-lg font-semibold text-white hover:bg-[#4d5f45] disabled:opacity-50">{ch.label}</button>
                ))}
              </div>
            )}
            {go && step.button && (
              <Link to={go} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#3b4a35] px-7 py-4 text-lg font-semibold text-white hover:bg-[#4d5f45]">{step.button} <ArrowRight size={20} /></Link>
            )}
          </>
        )}
      </Card>

      {todo.length > 0 && !step.done && (
        <Card className="p-5">
          <div className="mb-2 text-sm font-semibold text-slate-900">{es ? `Pendiente en ${wf.current?.label}` : `Still to do in ${wf.current?.label}`}</div>
          <ul className="divide-y divide-slate-100">
            {todo.map((i) => (
              <li key={i.key} className="flex items-center gap-3 py-2.5">
                <span className={`h-3 w-3 shrink-0 rounded-full ${i.urgent ? 'bg-red-500' : 'border-2 border-amber-500'}`} />
                <span className="flex-1 text-sm text-slate-800">{i.label}</span>
                {i.button && (i.to
                  ? <Link to={`${i.to}${i.to.includes('?') ? '&' : '?'}flow=1`} className="inline-flex items-center gap-1 text-sm font-medium text-[#3b4a35] hover:underline">{i.button} <ChevronRight size={14} /></Link>
                  : i.tab ? <Link to={`/cases/${c.id}?tab=${i.tab}`} className="inline-flex items-center gap-1 text-sm font-medium text-[#3b4a35] hover:underline">{i.button} <ChevronRight size={14} /></Link> : null)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => navigate(`/cases/${c.id}`)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"><Check size={14} /> {es ? 'Ir al caso completo' : 'Go to the full case'}</button>
        <span className="text-slate-400">{es ? 'Esta guía se actualiza sola' : 'This guide updates itself as you finish steps'}</span>
      </div>
    </div>
  )
}
