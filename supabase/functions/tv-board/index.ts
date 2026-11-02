// supabase/functions/tv-board/index.ts
//
// The only way a wall monitor gets the TV Board without logging in.
// Body: { token }  ->  the rows the board shows, for every location of that screen's company.
//
// Access = knowing the long random screen link (made in Admin -> TV Screens). It is read-only, returns only what the
// board displays, and stops working the moment the screen is turned off or its link is replaced.
//
// Deploy via the Supabase Dashboard, name it exactly "tv-board", and turn OFF "Verify JWT".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  try {
    const { token } = await req.json()
    if (typeof token !== 'string' || token.length < 32) return json({ error: 'This screen link is not valid.' }, 404)
    const { data: screen } = await supabase.from('tv_screens').select('*').eq('token', token).maybeSingle()
    if (!screen || !screen.active) return json({ error: 'This screen link is not valid or has been turned off.' }, 404)
    await supabase.from('tv_screens').update({ last_seen_at: new Date().toISOString() }).eq('id', screen.id)

    const orgId = screen.org_id
    const [{ data: locs }, { data: caseRows }, { data: staffRows }] = await Promise.all([
      supabase.from('locations').select('id, name').eq('org_id', orgId).eq('active', true),
      supabase.from('cases').select('*').eq('org_id', orgId),
      supabase.from('staff_members').select('id, name').eq('org_id', orgId),
    ])
    const active = (caseRows ?? []).filter((c: any) =>
      c.type !== 'pre_need' && c.status !== 'completed' && c.custody_stage !== 'completed' && c.custody_stage !== 'shipped_released')
    active.sort((a: any, b: any) => String(b.updated_at).localeCompare(String(a.updated_at)))
    const ids = active.map((c: any) => c.id)
    const none = ids.length === 0
    const [{ data: events }, { data: orders }, { data: contracts }, { data: notes }] = await Promise.all([
      none ? { data: [] } : supabase.from('calendar_events').select('case_id, type, start_at, end_at, event_participants(staff_id)').in('case_id', ids).in('type', ['visitation', 'service']),
      none ? { data: [] } : supabase.from('service_orders').select('case_id, item, status').in('case_id', ids),
      none ? { data: [] } : supabase.from('contracts').select('case_id, contract_line_items(name)').in('case_id', ids),
      none ? { data: [] } : supabase.from('case_notes').select('case_id, body, created_at').in('case_id', ids).eq('is_special_request', true),
    ])
    const staffName = new Map((staffRows ?? []).map((s: any) => [s.id, s.name]))
    const evFor = (caseId: string, type: string) => {
      const e = (events ?? []).find((x: any) => x.case_id === caseId && x.type === type)
      return e ? { start: e.start_at, end: e.end_at, staff: (e.event_participants ?? []).map((p: any) => staffName.get(p.staff_id)).filter(Boolean) } : undefined
    }
    const status = (caseId: string, re: RegExp) => {
      const o = (orders ?? []).find((x: any) => x.case_id === caseId && re.test(x.item))
      return o ? o.status : null
    }
    const rows = active.map((c: any) => {
      const casketLines = (contracts ?? []).filter((k: any) => k.case_id === c.id).flatMap((k: any) => k.contract_line_items ?? []).map((li: any) => li.name)
      return {
        id: c.id, locationId: c.location_id, caseNumber: c.case_number,
        firstName: c.decedent_first_name, lastName: c.decedent_last_name, color: c.color ?? undefined,
        disposition: c.disposition, boardDisp: c.board_disp ?? undefined, serviceDate: c.service_date ?? undefined,
        visitation: evFor(c.id, 'visitation'), service: evFor(c.id, 'service'),
        flowers: status(c.id, /flower/i), birds: status(c.id, /dove|bird/i), escort: status(c.id, /escort|carriage/i),
        casketLines,
        specials: (notes ?? []).filter((n: any) => n.case_id === c.id).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))).map((n: any) => n.body),
      }
    })
    return json({ screen: { name: screen.name, locationId: screen.location_id }, locations: locs ?? [], rows })
  } catch (e) {
    return json({ error: 'Something went wrong. The screen will try again.' }, 500)
  }
})
