// supabase/functions/morning-digest/index.ts   (GENERATED — edit index.template.ts and run: python3 scripts/build_digest.py)
//
// Every morning sends each person one phone / computer notification: how many cases need attention and what is missing first.
// It uses the SAME checklist rules as the screens (the workflow code is copied in below), so the numbers always agree.
//
// Who gets it: people with notifications turned on for a device, who are ON DUTY and have "new cases" ticked in their settings.
//   - Anyone named as the funeral director or embalmer on a case hears about their own cases.
//   - Managers, admins and owners hear about every open case in their company.
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "morning-digest", and turn OFF "Verify JWT"
// (it checks the secret header itself). Secrets needed: the same ones send-push uses (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SYNC_SECRET).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// ---- copied from src/lib/workflow.ts ----
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

// ---- end of copied code ----

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })
const RANK: Record<string, number> = { staff_member: 1, supervisor: 2, manager: 3, admin: 4, super_admin: 5 }
const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// deno-lint-ignore no-explicit-any
type Row = any

Deno.serve(async (req) => {
  try {
    const secret = env('SYNC_SECRET')
    if (!secret || req.headers.get('x-sync-secret') !== secret) return json({ error: 'Not allowed' }, 401)
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:info@casillasfuneralhome.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

    const [{ data: caseRows }, { data: taskRows }, { data: docRows }, { data: contractRows }, { data: signRows }] = await Promise.all([
      supabase.from('cases').select('*, case_contacts(*)').neq('status', 'completed').neq('type', 'pre_need'),
      supabase.from('case_tasks').select('*'),
      supabase.from('case_documents').select('*'),
      supabase.from('contracts').select('*, contract_line_items(*)'),
      supabase.from('case_statements').select('case_id, data').eq('sheet', '_signoffs'),
    ])
    const by = (rows: Row[] | null, key: string) => { const m = new Map<string, Row[]>(); for (const r of rows ?? []) m.set(r[key], [...(m.get(r[key]) ?? []), r]); return m }
    const tasksBy = by(taskRows, 'case_id'), docsBy = by(docRows, 'case_id')
    const contractBy = new Map<string, Row>((contractRows ?? []).map((r: Row) => [r.case_id, r]))
    const signBy = new Map<string, Row>((signRows ?? []).map((r: Row) => [r.case_id, r.data ?? {}]))

    type OpenCase = { id: string; orgId: string; director: string | null; embalmer: string | null; name: string; wf: Workflow }
    const open: OpenCase[] = (caseRows ?? []).filter((r: Row) => !String(r.case_number ?? '').startsWith('PRACTICE-')).map((r: Row) => {
      const c: WfCase = {
        id: r.id, type: r.type, status: r.status, disposition: r.disposition, custodyStage: r.custody_stage,
        contacts: (r.case_contacts ?? []).map((x: Row) => ({ name: x.name, relationship: x.relationship, phone: x.phone ?? undefined })),
        decedent: { firstName: r.decedent_first_name, middleName: r.decedent_middle_name ?? undefined, lastName: r.decedent_last_name, dateOfBirth: r.decedent_dob ?? undefined, dateOfDeath: r.decedent_dod ?? undefined, placeOfDeath: r.decedent_place_of_death ?? undefined, sex: r.decedent_sex ?? undefined, maritalStatus: r.decedent_marital_status ?? undefined, veteran: r.decedent_veteran ?? undefined },
        vitalSheet: r.vital_sheet ?? undefined, serviceDate: r.service_date ?? undefined, serviceLocation: r.service_location ?? undefined,
        visitationDate: r.visitation_date ?? undefined, visitationLocation: r.visitation_location ?? undefined, obituaryCompleted: r.obituary_completed ?? false,
      }
      const k = contractBy.get(r.id)
      const contract: WfContract | undefined = k ? {
        status: k.status, total: Number(k.total), taxTotal: Number(k.tax_total), discount: Number(k.discount ?? 0), amountPaid: Number(k.amount_paid), paid: !!k.paid,
        lineItems: (k.contract_line_items ?? []).map((l: Row) => ({ name: l.name, quantity: Number(l.quantity), unitPrice: Number(l.unit_price) })),
      } : undefined
      const wf = computeWorkflow(c, {
        contract,
        tasks: (tasksBy.get(r.id) ?? []).map((t: Row) => ({ id: t.id, label: t.label, category: t.category, status: t.status, dueDate: t.due_date ?? undefined })),
        docs: (docsBy.get(r.id) ?? []).map((d: Row) => ({ id: d.id, category: d.category, signed: d.signed ?? undefined })),
        signoffs: signBy.get(r.id),
      })
      const name = `${r.decedent_first_name ?? ''} ${r.decedent_last_name ?? ''}`.trim() || r.case_number
      return { id: r.id as string, orgId: r.org_id as string, director: r.assigned_director_id as string | null, embalmer: r.assigned_embalmer_id as string | null, name, wf }
    }).filter((x: OpenCase) => !x.wf.allDone)

    const { data: staffRows } = await supabase.from('staff_members').select('id, name, org_id, role, active, all_companies').eq('active', true)
    const ids = (staffRows ?? []).map((s: Row) => s.id)
    const [{ data: prefs }, { data: subs }] = await Promise.all([
      supabase.from('staff_notification_prefs').select('*').in('staff_id', ids),
      supabase.from('push_subscriptions').select('*').in('staff_id', ids),
    ])
    const prefBy = new Map<string, Row>((prefs ?? []).map((p: Row) => [p.staff_id, p]))

    let sent = 0; const people = new Set<string>()
    for (const st of (staffRows ?? []) as Row[]) {
      const p = prefBy.get(st.id)
      if (p && (p.on_duty === false || p.notify_case === false)) continue
      const mine = (subs ?? []).filter((s: Row) => s.staff_id === st.id)
      if (mine.length === 0) continue
      const sees = RANK[st.role] >= RANK.manager
      const cases = open.filter((x) => x.director === st.id || x.embalmer === st.id || (sees && (x.orgId === st.org_id || (st.all_companies && RANK[st.role] >= RANK.admin))))
      if (cases.length === 0) continue
      cases.sort((a, b) => b.wf.urgentCount - a.wf.urgentCount || b.wf.missing.length - a.wf.missing.length)
      const urgent = cases.filter((x) => x.wf.urgentCount > 0).length
      const title = urgent ? `Good morning — ${urgent} urgent, ${cases.length} need attention` : `Good morning — ${cases.length} case${cases.length === 1 ? '' : 's'} need attention`
      const lines = cases.slice(0, 3).map((x) => { const f = x.wf.missing.find((m) => m.urgent) ?? x.wf.missing[0]; return `${x.name}: ${f.label}` })
      const body = trim(lines.join(' · ') + (cases.length > 3 ? ` · +${cases.length - 3} more` : ''), 170)
      const payload = JSON.stringify({ title, body, url: '/', tag: 'morning-digest', icon: '/icon-casillas-192.png' })
      for (const s of mine) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' }); sent++; people.add(st.id) }
        catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id) }
      }
    }
    return json({ cases: open.length, people: people.size, sent })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
