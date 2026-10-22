import type { FuneralCase, Contract, CaseTask, CaseDocument } from '@/types'
import type { CaseTab } from '@/lib/nextStep'

export interface WorkItem {
  key: string
  label: string
  done: boolean
  /** Happens by itself (e.g. "service held") — shown, but never counted as something staff forgot. */
  auto?: boolean
  /** Missing AND time is short (service within 3 days, or a task is past due) — these flash. */
  urgent?: boolean
  /** Where the fix button goes. */
  tab?: CaseTab
  to?: string
  button?: string
}
export interface WorkPhase { key: string; label: string; items: WorkItem[]; done: number; total: number; status: 'done' | 'active' | 'pending' }
export interface Workflow {
  phases: WorkPhase[]
  missing: WorkItem[]
  urgentCount: number
  percent: number
  allDone: boolean
  current?: WorkPhase
}

const PAST_SCENE = ['funeral_home', 'chapel_service', 'crematory', 'ashes_received', 'cemetery_burial', 'shipped_released', 'completed']
const FINAL = ['cemetery_burial', 'ashes_received', 'shipped_released', 'completed']

/**
 * Everything that has to happen on a case, worked out from what is actually filled in — nobody has to tick anything.
 * When someone saves the vital sheet, signs the contract, uploads a permit or enters a payment, that line turns green by itself,
 * on this page, the Cases list and the Today screen alike.
 */
export function computeWorkflow(c: FuneralCase, o: { contract?: Contract; tasks: CaseTask[]; docs: CaseDocument[] }, lang: 'en' | 'es' = 'en'): Workflow {
  const tx = (en: string, es: string) => (lang === 'es' ? es : en)
  const id = c.id
  const pre = c.type === 'pre_need'
  const completed = c.status === 'completed'
  const k = o.contract
  const now = Date.now()
  const svc = c.serviceDate ? new Date(c.serviceDate).getTime() : null
  const soon = !pre && !completed && svc !== null && svc - now < 3 * 86400000 // within 3 days, or already past
  const hasInvoice = !!k && k.lineItems.length > 0
  const signed = !!k && (k.status === 'signed' || k.status === 'paid')
  const paidIn = !!k && k.total > 0 && (k.paid || k.amountPaid >= k.total)
  const hasDoc = (cat: CaseDocument['category']) => o.docs.some((d) => d.category === cat)
  const overdue = (t: CaseTask) => !!t.dueDate && t.status !== 'confirmed' && new Date(t.dueDate + 'T23:59:59').getTime() < now
  const taskItem = (t: CaseTask, urgentIfSoon: boolean): WorkItem => ({ key: `t:${t.id}`, label: t.label, done: t.status === 'confirmed', urgent: t.status !== 'confirmed' && (overdue(t) || (urgentIfSoon && soon)), tab: 'Tasks', button: tx('Open checklist', 'Abrir lista') })
  const paperTasks = o.tasks.filter((t) => t.category === 'permits' || t.category === 'documents')
  const prepTasks = o.tasks.filter((t) => t.category !== 'permits' && t.category !== 'documents')

  const I = (key: string, label: string, done: boolean, extra: Partial<WorkItem> = {}): WorkItem => ({ key, label, done: completed || done, ...extra })
  const U = (needed: boolean) => needed && soon

  const raw: { key: string; label: string; items: WorkItem[] }[] = pre ? [
    { key: 'family', label: tx('Family & paperwork', 'Familia y papeles'), items: [
      I('contact', tx('Family contact added', 'Contacto de la familia agregado'), c.contacts.length > 0, { to: `/cases/${id}/edit`, button: tx('Add contact', 'Agregar contacto') }),
      I('disp', tx('Burial or cremation chosen', 'Entierro o cremación elegido'), c.disposition !== 'undetermined', { tab: 'Overview', button: tx('Choose', 'Elegir') }),
      ...paperTasks.map((t) => taskItem(t, false)),
    ] },
    { key: 'plan', label: tx('The plan', 'El plan'), items: [
      I('plan', tx('Everything picked out and priced', 'Todo elegido y con precio'), hasInvoice, { tab: 'Orders', button: tx('Open the plan', 'Abrir el plan') }),
      I('signed', tx('Contract signed by the family', 'Contrato firmado por la familia'), signed, { tab: 'Financials', button: tx('Get it signed', 'Pedir firma') }),
      I('paid', tx('Payment received', 'Pago recibido'), !!k && k.amountPaid > 0, { tab: 'Financials', button: tx('Record payment', 'Registrar pago') }),
    ] },
  ] : [
    { key: 'call', label: tx('First call', 'Primera llamada'), items: [
      I('fc', tx('First call details filled in', 'Detalles de la primera llamada'), c.status !== 'first_call', { to: `/cases/${id}/first-call`, button: tx('Open First Call', 'Abrir primera llamada') }),
      I('home', tx('Loved one is at the funeral home', 'El difunto está en la funeraria'), PAST_SCENE.includes(c.custodyStage), { to: '/custody', button: tx('Chain of Custody', 'Cadena de custodia') }),
    ] },
    { key: 'paper', label: tx('Family & paperwork', 'Familia y papeles'), items: [
      I('contact', tx('Family contact added', 'Contacto de la familia agregado'), c.contacts.length > 0, { to: `/cases/${id}/edit`, button: tx('Add contact', 'Agregar contacto') }),
      I('vital', tx('Vital Sheet filled out', 'Hoja vital llena'), !!c.vitalSheet, { to: `/cases/${id}/vital-sheet`, button: tx('Open Vital Sheet', 'Abrir hoja vital') }),
      I('disp', tx('Burial or cremation chosen', 'Entierro o cremación elegido'), c.disposition !== 'undetermined', { tab: 'Overview', button: tx('Choose', 'Elegir') }),
      I('auth', tx('Authorization form signed and uploaded', 'Autorización firmada y subida'), hasDoc('authorization') || o.docs.some((d) => d.signed), { tab: 'Documents', button: tx('Open Documents', 'Abrir documentos') }),
      ...paperTasks.map((t) => taskItem(t, true)),
    ] },
    { key: 'arr', label: tx('Arrangements', 'Arreglos'), items: [
      I('inv', tx('Items chosen and priced', 'Artículos elegidos y con precio'), hasInvoice, { tab: 'Orders', button: tx('Choose items', 'Elegir artículos'), urgent: U(!hasInvoice) }),
      I('signed', tx('Contract signed by the family', 'Contrato firmado por la familia'), signed, { tab: 'Financials', button: tx('Get it signed', 'Pedir firma'), urgent: U(!signed) }),
      I('dep', tx('Payment received', 'Pago recibido'), !!k && k.amountPaid > 0, { tab: 'Financials', button: tx('Record payment', 'Registrar pago'), urgent: U(!(k && k.amountPaid > 0)) }),
    ] },
    { key: 'prep', label: tx('Service details', 'Detalles del servicio'), items: [
      I('date', tx('Service date set', 'Fecha del servicio fijada'), !!c.serviceDate || c.disposition === 'donation', { to: `/cases/${id}/edit`, button: tx('Set the date', 'Fijar la fecha') }),
      I('obit', tx('Obituary done', 'Obituario listo'), !!c.obituaryCompleted, { tab: 'Documents', button: tx('Open obituary', 'Abrir obituario'), urgent: U(!c.obituaryCompleted) }),
      ...prepTasks.map((t) => taskItem(t, true)),
    ] },
    { key: 'svc', label: tx('Service & final resting', 'Servicio y destino final'), items: [
      I('held', tx('Service held', 'Servicio realizado'), (svc !== null && svc < now) || FINAL.includes(c.custodyStage), { auto: true }),
      I('final', tx('Burial / cremation completed', 'Entierro / cremación completado'), FINAL.includes(c.custodyStage), { to: '/custody', button: tx('Chain of Custody', 'Cadena de custodia') }),
    ] },
    { key: 'close', label: tx('Closing out', 'Cierre'), items: [
      I('bal', tx('Balance paid in full', 'Saldo pagado por completo'), paidIn, { tab: 'Financials', button: tx('Collect balance', 'Cobrar saldo') }),
      I('closed', tx('Case marked complete', 'Caso marcado completo'), completed, { tab: 'Overview', button: tx('Mark complete', 'Marcar completo') }),
    ] },
  ]

  let activeSet = false
  const phases: WorkPhase[] = raw.map((p) => {
    const total = p.items.length; const done = p.items.filter((i) => i.done).length
    let status: WorkPhase['status'] = done === total ? 'done' : 'pending'
    if (status !== 'done' && !activeSet) { status = 'active'; activeSet = true }
    return { ...p, done, total, status }
  })
  const all = phases.flatMap((p) => p.items)
  const missing = all.filter((i) => !i.done && !i.auto)
  return {
    phases, missing, urgentCount: missing.filter((i) => i.urgent).length,
    percent: all.length ? Math.round((all.filter((i) => i.done).length / all.length) * 100) : 0,
    allDone: missing.length === 0, current: phases.find((p) => p.status === 'active'),
  }
}
