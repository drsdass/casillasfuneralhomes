// supabase/functions/create-staff-member/index.ts
//
// Lets a Super Admin add a new employee directly from the Admin page —
// previously the ONLY way to do this was running scripts/add-new-staff.mjs
// locally with the service_role key. Creates the Supabase Auth account,
// the staff_members row, and the staff_locations rows, all in one call.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "create-staff-member". Leave "Verify JWT" ON (default) — this
// function checks the caller is actually logged in AND is a super_admin
// before doing anything, using their own JWT to look them up.
//
// Required secret: SUPABASE_SERVICE_ROLE_KEY (set automatically)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface RequestBody {
  name: string
  email: string
  role: string
  title?: string
  department?: string
  phone?: string
  locationIds: string[]
}

const DEFAULT_TEMP_PASSWORD = 'ChangeMe123!'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    // Verify JWT (on by default for this function) already confirms the
    // request carries a valid token. Now confirm the caller is
    // specifically a super_admin — the same rule the "Add Staff" button
    // is gated behind in the UI, enforced again here since a UI check
    // alone is never real security. Using the existing service-role
    // client's own getUser(jwt) is the simplest reliable way to resolve
    // "who sent this" — no second client or extra env var needed.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: userErr } = await supabaseAdmin.auth.getUser(jwt)
    if (userErr || !caller) {
      return new Response(JSON.stringify({ error: `Not authenticated: ${userErr?.message ?? 'no user found for this token'}` }), {
        status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }
    const { data: callerStaff } = await supabaseAdmin.from('staff_members').select('role, org_id').eq('id', caller.id).single()
    if (!callerStaff || callerStaff.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only a Super Admin can add staff.' }), { status: 403, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const body: RequestBody = await req.json()
    if (!body.name || !body.email || !body.role || !body.locationIds?.length) {
      return new Response(JSON.stringify({ error: 'Name, email, role, and at least one location are required.' }), {
        status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: DEFAULT_TEMP_PASSWORD,
      email_confirm: true,
    })
    if (authErr || !authUser.user) {
      return new Response(JSON.stringify({ error: authErr?.message ?? 'Could not create the login account.' }), {
        status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const { error: staffErr } = await supabaseAdmin.from('staff_members').insert({
      id: authUser.user.id,
      org_id: callerStaff.org_id,
      name: body.name,
      email: body.email,
      role: body.role,
      title: body.title || null,
      department: body.department || null,
      phone: body.phone || null,
      active: true,
    })
    if (staffErr) {
      // Roll back the auth account so a failed attempt doesn't leave an orphaned login with no staff record.
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      return new Response(JSON.stringify({ error: staffErr.message }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const { error: locErr } = await supabaseAdmin.from('staff_locations').insert(
      body.locationIds.map((locationId) => ({ staff_id: authUser.user.id, location_id: locationId }))
    )
    if (locErr) {
      return new Response(JSON.stringify({ error: `Staff created, but location access failed: ${locErr.message}` }), {
        status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ id: authUser.user.id, tempPassword: DEFAULT_TEMP_PASSWORD }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
