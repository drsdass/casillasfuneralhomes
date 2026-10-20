// supabase/functions/send-push/index.ts
//
// Sends phone / computer notifications ("push") to staff. Called two ways:
//   * by the sync-inbox function when new email arrives (secret header x-sync-secret), and
//   * by the app right after someone sends a message / creates a case / starts a pickup (the person's own login).
// The app only says WHAT happened; this function decides WHO hears about it, so nobody can be spammed from the browser.
//
// Who gets a notification: staff who (a) have notifications turned on for this phone/computer,
// (b) are ON DUTY (an off-duty person never gets anything), and (c) have that kind ticked in their settings.
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "send-push", and turn OFF "Verify JWT"
// (it checks the caller itself). Secrets needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SYNC_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } })

type Kind = 'email' | 'message' | 'case' | 'driver'
const PREF_COLUMN: Record<Kind, string> = { email: 'notify_email', message: 'notify_message', case: 'notify_case', driver: 'notify_driver' }
const RANK: Record<string, number> = { staff_member: 1, supervisor: 2, manager: 3, admin: 4, super_admin: 5 }

interface Staff { id: string; name: string; org_id: string; role: string; active: boolean; all_companies: boolean; disabled_features: string[] | null }
interface Message { kind: Kind; title: string; body: string; path: string; tag: string }

let vapidReady = false
function ensureVapid() {
  if (vapidReady) return
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:info@casillasfuneralhome.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  vapidReady = true
}

const shortCompany = (name: string) => name.replace(/\s*Funeral Home$/i, '')

/** Sends one notification to everyone in `staffIds` who is on duty, wants this kind, and has a device signed up. */
async function deliver(staffIds: string[], orgId: string, m: Message, excludeId?: string) {
  const ids = [...new Set(staffIds)].filter((id) => id !== excludeId)
  if (ids.length === 0) return { sent: 0, people: 0 }
  const [{ data: staffRows }, { data: prefs }, { data: subs }, { data: org }] = await Promise.all([
    supabase.from('staff_members').select('id, name, org_id, role, active, all_companies, disabled_features').in('id', ids),
    supabase.from('staff_notification_prefs').select('*').in('staff_id', ids),
    supabase.from('push_subscriptions').select('*').in('staff_id', ids),
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ])
  const prefBy = new Map((prefs ?? []).map((p) => [p.staff_id as string, p]))
  const company = org?.name ?? 'Casillas Funeral Home'
  const icon = /^sanders/i.test(company) ? '/icon-sanders-192.png' : '/icon-casillas-192.png'
  const people = new Set<string>()
  let sent = 0
  for (const st of (staffRows ?? []) as Staff[]) {
    if (!st.active) continue
    const p = prefBy.get(st.id)
    if (p && p.on_duty === false) continue                 // OFF DUTY: nothing, ever
    if (p && p[PREF_COLUMN[m.kind]] === false) continue    // they un-ticked this kind
    const mine = (subs ?? []).filter((s) => s.staff_id === st.id)
    if (mine.length === 0) continue
    // People who work in both companies see which one it is.
    const title = st.all_companies ? `${shortCompany(company)} · ${m.title}` : m.title
    const payload = JSON.stringify({ title, body: m.body, url: `${m.path}${m.path.includes('?') ? '&' : '?'}org=${orgId}`, tag: m.tag, icon })
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'high' })
        sent++; people.add(st.id)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id) // phone removed the permission
      }
    }
  }
  return { sent, people: people.size }
}

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    ensureVapid()
    // Who is asking: the server itself (secret) or a logged-in staff member.
    let caller: Staff | null = null
    const secret = env('SYNC_SECRET')
    const trusted = !!secret && req.headers.get('x-sync-secret') === secret
    if (!trusted) {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
      const { data: u } = await supabase.auth.getUser(token)
      if (!u?.user) return json({ error: 'Not allowed' }, 401)
      const { data: c } = await supabase.from('staff_members').select('id, name, org_id, role, active, all_companies, disabled_features').eq('id', u.user.id).maybeSingle()
      if (!c || !c.active) return json({ error: 'Not allowed' }, 401)
      caller = c as Staff
    }
    const body = await req.json()
    const type = String(body.type ?? '')

    // ---- New email in a company's shared mailbox (server only) ----
    if (type === 'email') {
      if (!trusted) return json({ error: 'Not allowed' }, 403)
      const orgId = String(body.orgId ?? '')
      const count = Number(body.count ?? 1)
      const { data: people } = await supabase.from('staff_members').select('id, org_id, role, all_companies, disabled_features, active')
        .eq('active', true).or(`org_id.eq.${orgId},all_companies.eq.true`)
      const ids = (people ?? []).filter((s) => (s.org_id === orgId || (s.all_companies && RANK[s.role] >= RANK.admin)) && !(s.disabled_features ?? []).includes('inbox')).map((s) => s.id as string)
      const text = count > 1 ? `${count} new emails in the shared inbox` : trim(`${body.from ?? 'Someone'}: ${body.subject ?? '(no subject)'}`, 110)
      return json(await deliver(ids, orgId, { kind: 'email', title: count > 1 ? 'New emails' : 'New email', body: text, path: '/inbox', tag: 'email' }))
    }

    // ---- The family filled something in on their portal (server only; the database sends this) ----
    if (type === 'family') {
      if (!trusted) return json({ error: 'Not allowed' }, 403)
      const caseId = String(body.caseId ?? '')
      const { data: c } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle()
      if (!c) return json({ error: 'Case not found' }, 404)
      const name = `${c.decedent_first_name ?? ''} ${c.decedent_last_name ?? ''}`.trim() || 'a case'
      const { data: locRows } = await supabase.from('staff_locations').select('staff_id').eq('location_id', c.location_id)
      const atLocation = new Set((locRows ?? []).map((r) => r.staff_id as string))
      const { data: people } = await supabase.from('staff_members').select('id, org_id, role, all_companies, active')
        .eq('active', true).or(`org_id.eq.${c.org_id},all_companies.eq.true`)
      const ids = (people ?? []).filter((s) => (s.org_id === c.org_id && (atLocation.has(s.id) || RANK[s.role] >= RANK.admin)) || (s.all_companies && RANK[s.role] >= RANK.admin)).map((s) => s.id as string)
      const note = String(body.note ?? 'The family updated their portal').replace(/^Family\s+/i, 'Family ')
      return json(await deliver(ids, c.org_id, { kind: 'case', title: `Family update \u2014 ${name}`, body: trim(note, 120), path: `/cases/${caseId}`, tag: `family-${caseId}` }))
    }

    if (!caller) return json({ error: 'Not allowed' }, 403)

    // ---- "Send me a test" button: only to the caller's own devices ----
    if (type === 'test') {
      const { data: me } = await supabase.from('staff_notification_prefs').select('on_duty').eq('staff_id', caller.id).maybeSingle()
      if (me && me.on_duty === false) return json({ sent: 0, people: 0, offDuty: true })
      const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('staff_id', caller.id)
      if (!count) return json({ sent: 0, people: 0, noDevice: true })
      return json(await deliver([caller.id], caller.org_id, { kind: 'message', title: 'Test message', body: 'If you can hear this, notifications are working.', path: '/messages', tag: `test-${Date.now()}` }))
    }

    // ---- A chat message ----
    if (type === 'message') {
      const convId = String(body.conversationId ?? '')
      const { data: parts } = await supabase.from('chat_participants').select('staff_id').eq('conversation_id', convId)
      const ids = (parts ?? []).map((p) => p.staff_id as string)
      if (!ids.includes(caller.id)) return json({ error: 'Not allowed' }, 403)
      const { data: last } = await supabase.from('chat_messages').select('body, sender_id').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!last || last.sender_id !== caller.id) return json({ sent: 0, people: 0 })
      return json(await deliver(ids, caller.org_id, { kind: 'message', title: caller.name, body: trim(String(last.body), 120), path: '/messages', tag: `msg-${convId}` }, caller.id))
    }

    // ---- A new case / first call, or a pickup needed ----
    if (type === 'case') {
      const caseId = String(body.caseId ?? '')
      const event = String(body.event ?? 'created') // 'created' | 'pickup'
      const { data: c } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle()
      if (!c) return json({ error: 'Case not found' }, 404)
      if (c.org_id !== caller.org_id && !(caller.all_companies && RANK[caller.role] >= RANK.admin)) return json({ error: 'Not allowed' }, 403)
      const name = `${c.decedent_first_name ?? ''} ${c.decedent_last_name ?? ''}`.trim() || 'a new case'
      const { data: locRows } = await supabase.from('staff_locations').select('staff_id').eq('location_id', c.location_id)
      const atLocation = new Set((locRows ?? []).map((r) => r.staff_id as string))
      const { data: people } = await supabase.from('staff_members').select('id, org_id, role, all_companies, disabled_features, active')
        .eq('active', true).or(`org_id.eq.${c.org_id},all_companies.eq.true`)
      const eligible = (people ?? []).filter((s) => (s.org_id === c.org_id && (atLocation.has(s.id) || RANK[s.role] >= RANK.admin)) || (s.all_companies && RANK[s.role] >= RANK.admin))
      const pickup = c.custody_stage === 'scene_first_call'
      const drivers = pickup ? eligible.filter((s) => RANK[s.role] >= RANK.supervisor && !(s.disabled_features ?? []).includes('driver')) : []
      const driverIds = new Set(drivers.map((s) => s.id as string))
      const others = event === 'pickup' ? [] : eligible.filter((s) => !driverIds.has(s.id as string)).map((s) => s.id as string)
      const out = { sent: 0, people: 0 }
      if (driverIds.size) {
        const r = await deliver([...driverIds], c.org_id, { kind: 'driver', title: 'Pickup needed', body: trim(`${name} — ${c.case_number ?? ''}`, 110), path: '/driver', tag: `pickup-${caseId}` }, caller.id)
        out.sent += r.sent; out.people += r.people
      }
      if (others.length) {
        const r = await deliver(others, c.org_id, { kind: 'case', title: pickup ? 'New first call' : 'New case', body: trim(`${name} — ${c.case_number ?? ''}`, 110), path: `/cases/${caseId}`, tag: `case-${caseId}` }, caller.id)
        out.sent += r.sent; out.people += r.people
      }
      // Anyone named on the case gets a direct note.
      const named = [c.assigned_director_id, c.assigned_embalmer_id].filter((x): x is string => !!x && x !== caller.id)
      if (named.length && event !== 'pickup') {
        const r = await deliver(named, c.org_id, { kind: 'case', title: 'You were assigned to a case', body: trim(`${name} — ${c.case_number ?? ''}`, 110), path: `/cases/${caseId}`, tag: `assigned-${caseId}` }, caller.id)
        out.sent += r.sent; out.people += r.people
      }
      return json(out)
    }

    return json({ error: 'Unknown notification type' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
