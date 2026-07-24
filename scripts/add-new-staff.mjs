#!/usr/bin/env node
// scripts/add-new-staff.mjs
//
// One-time script: adds Marichuy Lopez and Silvia Rochin, who weren't on
// the original designation sheet but are on the corrected employee list.
// Same safety rules as seed-supabase.mjs — run locally, needs the
// service_role key, never share that key or paste it anywhere but your
// own terminal.
//
// Usage (same env vars as before, if you still have that terminal open
// you can skip straight to step 3):
//   export SUPABASE_URL="https://kduvajnzussalxihgyfv.supabase.co"
//   export SUPABASE_SERVICE_ROLE_KEY="paste-the-service_role-key-here"
//   node scripts/add-new-staff.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: org, error: orgErr } = await supabase.from('organizations').select('id').single()
  if (orgErr) throw orgErr

  const { data: locations, error: locErr } = await supabase.from('locations').select('id, city')
  if (locErr) throw locErr
  const caLocationIds = locations.filter((l) => l.city !== 'Eureka').map((l) => l.id)

  const newStaff = [
    { name: 'Marichuy Lopez', email: 'marichuy.lopez@casillasfuneralhome.com', role: 'manager', title: 'Manager', phone: '760-567-4798' },
    { name: 'Silvia Rochin', email: 'silvia.rochin@casillasfuneralhome.com', role: 'staff_member', title: 'Staff Member', phone: '760-391-1656' },
  ]

  for (const s of newStaff) {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: s.email,
      password: 'ChangeMe123!',
      email_confirm: true,
    })
    if (authErr) {
      console.error(`Failed to create auth user for ${s.name}: ${authErr.message}`)
      continue
    }

    const { error: staffErr } = await supabase.from('staff_members').insert({
      id: authUser.user.id,
      org_id: org.id,
      name: s.name,
      email: s.email,
      role: s.role,
      title: s.title,
      phone: s.phone,
      active: true,
    })
    if (staffErr) {
      console.error(`Failed to create staff_members row for ${s.name}: ${staffErr.message}`)
      continue
    }

    const { error: locLinkErr } = await supabase.from('staff_locations').insert(
      caLocationIds.map((locationId) => ({ staff_id: authUser.user.id, location_id: locationId }))
    )
    if (locLinkErr) console.error(`Failed to link locations for ${s.name}: ${locLinkErr.message}`)

    console.log(`Created ${s.name} (${s.email})`)
  }

  console.log('\nDone. Both accounts use the password "ChangeMe123!" — have them change it on first login.')
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
