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

// @@WORKFLOW@@

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
