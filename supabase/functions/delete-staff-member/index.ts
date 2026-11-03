// supabase/functions/delete-staff-member/index.ts
//
// Lets a Super Admin remove a person from the Admin page.
//  - Someone who has never done any work in the system (a mistake, a test login) is deleted completely: staff record, login, location access.
//  - Someone with history (cases, notes, the activity log all point to them) cannot be erased without breaking that history,
//    so they are switched off instead: marked inactive, hidden from every list, and their login is blocked. Nothing they did is lost.
//
// Deploy via the Supabase Dashboard, name it exactly "delete-staff-member", leave "Verify JWT" ON.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not authenticated' }, 401)
    const { data: { user: caller }, error: userErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userErr || !caller) return json({ error: 'Not authenticated' }, 401)
    const { data: callerStaff } = await admin.from('staff_members').select('role, org_id, all_companies').eq('id', caller.id).single()
    if (!callerStaff || callerStaff.role !== 'super_admin') return json({ error: 'Only a Super Admin can remove staff.' }, 403)

    const { staffId } = await req.json()
    if (typeof staffId !== 'string' || !staffId) return json({ error: 'Which person?' }, 400)
    if (staffId === caller.id) return json({ error: 'You cannot remove your own login.' }, 400)
    const { data: target } = await admin.from('staff_members').select('id, org_id, name').eq('id', staffId).maybeSingle()
    if (!target) return json({ error: 'That person was not found.' }, 404)
    if (target.org_id !== callerStaff.org_id && !callerStaff.all_companies) return json({ error: 'That person belongs to another company.' }, 403)

    // First try a complete removal.
    await admin.from('staff_locations').delete().eq('staff_id', staffId)
    const { error: delErr } = await admin.from('staff_members').delete().eq('id', staffId)
    if (!delErr) {
      await admin.auth.admin.deleteUser(staffId)
      return json({ mode: 'deleted', name: target.name })
    }

    // They have history: switch them off instead. Everything they did stays on the record.
    const { error: offErr } = await admin.from('staff_members').update({ active: false }).eq('id', staffId)
    if (offErr) return json({ error: offErr.message }, 400)
    await admin.auth.admin.updateUserById(staffId, { ban_duration: '876000h' }) // blocks sign-in
    return json({ mode: 'deactivated', name: target.name })
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
