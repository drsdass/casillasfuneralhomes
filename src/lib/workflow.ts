// Self-contained on purpose (no imports): the same file is copied into the morning-digest Edge Function by scripts/build_digest.py,
// so the phone notification and the screens can never disagree about what is missing.

export type CaseTab = 'Overview' | 'Tasks' | 'Orders' | 'Notes' | 'Documents' | 'Emails' | 'Financials'
export interface WfCase {
  id: string; type: string; status: string; disposition: string; custodyStage: string
  contacts: { name?: string; relationship?: string; phone?: string }[]
  decedent?: unknown; vitalSheet?: unknown
  serviceDate?: string; serviceLocation?: string; visitationDate?: string; visitationLocation?: string
  obituaryCompleted?: boolean
}
export interface WfContract { status: string; lineItems: { name: string; quantity: number; unitPrice: number }[]; total: number; taxTotal: number; discount: number; amountPaid: number; paid: boolean }
export interface WfTask { id: string; label: string; category: string; status: string; dueDate?: string }
export interface WfDoc { id: string; category: string; signed?: boolean }
type FuneralCase = WfCase; type Contract = WfContract; type CaseTask = WfTask; type CaseDocument = WfDoc

/** Short stable fingerprint of what a second person looked at — if it changes later, the check has to be done again. */
export function fingerprint(x: unknown): string {
  const str = JSON.stringify(x) ?? ''
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
export const SIGNOFF_SEP = '§'
export const parseSignoff = (v: unknown): { fp: string; by: string; at: string } | null => {
  if (typeof v !== 'string') return null
  const [fp, by, at] = v.split(SIGNOFF_SEP)
  return fp ? { fp, by: by ?? '', at: at ?? '' } : null
}

export interface WorkItem {
  key: string
  label: string
  done: boolean
  /** Happens by itself (e.g. "service held") — shown, but never counted as something staff forgot. */
  auto?: boolean
  /** Missing AND time is short (service within 3 days, or a task is past due) — these flash. */
  urgent?: boolean
  /** Not ready to be looked at yet (what it checks is not finished) — shown grey, never counted as forgotten. */
  waiting?: boolean
  /** A second-person check: who signed it and when, and whether the thing changed since. */
  signoff?: { key: string; fp: string; by?: string; at?: string; stale?: boolean }
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
export function computeWorkflow(c: FuneralCase, o: { contract?: Contract; tasks: CaseTask[]; docs: CaseDocument[]; signoffs?: Record<string, unknown> }, lang: 'en' | 'es' = 'en'): Workflow {
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

  const sign = (key: string, label: string, ready: boolean, fp: unknown, extra: Partial<WorkItem>): WorkItem => {
    const rec = parseSignoff(o.signoffs?.[key]); const valid = !!rec && rec.fp === fingerprint(fp)
    const stale = ready && !!rec && !valid
    return { key, label: stale ? tx('Changed since it was checked — check again: ', 'Cambió desde la revisión — revise otra vez: ') + label : label, done: completed || (ready && valid), waiting: !ready && !completed,
      urgent: soon && ready && !valid, signoff: { key, fp: fingerprint(fp), by: valid ? rec!.by : undefined, at: valid ? rec!.at : undefined, stale }, ...extra }
  }
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
    { key: 'check', label: tx('Second check', 'Segunda revisión'), items: [
      sign('chk_vital', tx('Vital Sheet and family details looked over by a second person', 'Hoja vital y datos de la familia revisados por otra persona'), !!c.vitalSheet, [c.decedent, c.vitalSheet, c.contacts.map((x) => [x.name, x.relationship, x.phone])], { to: `/cases/${id}/vital-sheet`, button: tx('Look at it', 'Ver') }),
      sign('chk_papers', tx('Authorization and permits looked over by a second person', 'Autorización y permisos revisados por otra persona'), (hasDoc('authorization') || o.docs.some((d) => d.signed)) && paperTasks.every((t) => t.status === 'confirmed'), [o.docs.map((d) => [d.id, d.category, d.signed]), paperTasks.map((t) => [t.id, t.status])], { tab: 'Documents', button: tx('Look at it', 'Ver') }),
      sign('chk_money', tx('Invoice matches what the family chose — looked over by a second person', 'La factura coincide con lo elegido — revisada por otra persona'), hasInvoice, k ? [k.lineItems.map((l) => [l.name, l.quantity, l.unitPrice]), k.total, k.taxTotal, k.discount] : null, { tab: 'Financials', button: tx('Look at it', 'Ver') }),
      sign('chk_service', tx('Service date, time and place looked over by a second person', 'Fecha, hora y lugar del servicio revisados por otra persona'), !!c.serviceDate, [c.serviceDate, c.serviceLocation, c.visitationDate, c.visitationLocation, c.disposition], { tab: 'Overview', button: tx('Look at it', 'Ver') }),
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
  const missing = all.filter((i) => !i.done && !i.auto && !i.waiting)
  return {
    phases, missing, urgentCount: missing.filter((i) => i.urgent).length,
    percent: all.length ? Math.round((all.filter((i) => i.done).length / all.length) * 100) : 0,
    allDone: missing.length === 0, current: phases.find((p) => p.status === 'active'),
  }
}
