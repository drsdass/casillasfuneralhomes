#!/usr/bin/env node
// scripts/seed-supabase.mjs
//
// One-time setup script: creates the organization, 4 locations, all 18 real
// staff accounts (as actual Supabase Auth users + matching staff_members
// rows), the real GPL, and the vehicle fleet.
//
// Deliberately does NOT seed any fake cases, tasks, notes, contracts, or
// calendar events — those are demo-only data that belongs in the app's
// mock mode, not in a database real families' information will eventually
// live in. Staff create real cases themselves once they can log in.
//
// RUN THIS LOCALLY, NEVER IN A DEPLOYED ENVIRONMENT. It needs your Supabase
// service_role key, which bypasses every RLS policy — that key should never
// be pasted into a chat, committed to git, or put in an env var that ships
// to the browser (it must NOT have the VITE_ prefix).
//
// Usage:
//   1. In the Supabase dashboard: Settings → API → copy the `service_role`
//      secret key (NOT the anon key you already used for .env.local).
//   2. In your terminal (this shell session only, not a file):
//        export SUPABASE_URL="https://kduvajnzussalxihgyfv.supabase.co"
//        export SUPABASE_SERVICE_ROLE_KEY="paste-the-service-role-key-here"
//   3. node scripts/seed-supabase.mjs
//   4. Close that terminal when done so the key isn't sitting in your shell
//      history longer than necessary (or run `history -d` on the export line).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. See the comment at the top of this file.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Creating organization...')
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: 'Casillas Funeral Home' })
    .select()
    .single()
  if (orgErr) throw orgErr

  console.log('Creating locations...')
  const locationDefs = [
    { name: 'Casillas Funeral Home — Cathedral City', address: '68625 Perez Rd #20', city: 'Cathedral City', state: 'CA', zip: '92234', phone: '(760) 202-7420', license_number: 'FD 2117' },
    { name: 'Casillas Funeral Home — Desert Hot Springs', address: '66272 Pierson Blvd', city: 'Desert Hot Springs', state: 'CA', zip: '92240', phone: '(760) 671-6671', license_number: 'FD 2432' },
    { name: 'Casillas Funeral Home — Coachella', address: '85891 Grapefruit Blvd', city: 'Coachella', state: 'CA', zip: '92236', phone: '(760) 398-1536', license_number: 'FD 1498' },
    // Placeholder — replace address/phone/license once you have Eureka's real details.
    { name: 'Casillas Funeral Home — Eureka', address: '123 Main St (placeholder)', city: 'Eureka', state: 'CA', zip: '95501', phone: '(707) 555-0100', license_number: 'FD TBD' },
  ]
  const { data: locations, error: locErr } = await supabase
    .from('locations')
    .insert(locationDefs.map((l) => ({ ...l, org_id: org.id, timezone: 'America/Los_Angeles', active: true })))
    .select()
  if (locErr) throw locErr

  const locByCity = Object.fromEntries(locations.map((l) => [l.city, l.id]))
  const CA_LOCATIONS = [locByCity['Cathedral City'], locByCity['Desert Hot Springs'], locByCity['Coachella']]
  const EUREKA_ONLY = [locByCity['Eureka']]
  const ALL_LOCATIONS = locations.map((l) => l.id)

  console.log('Creating staff accounts (this creates real login credentials — change these passwords immediately after)...')
  const staffDefs = [
    { name: 'Joel Casillas', email: 'casillasjoel@live.com', password: 'qwerty', role: 'super_admin', title: 'Owner', phone: '760-702-5848', locationIds: ALL_LOCATIONS },
    { name: 'Carolina Casillas', email: 'carolina.casillas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'super_admin', title: 'Owner', phone: '760-702-6143', locationIds: ALL_LOCATIONS },
    { name: 'Rosie Canas', email: 'rosie.canas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'super_admin', title: 'Operations', phone: '760-702-9778', locationIds: ALL_LOCATIONS },
    { name: 'Ashlie Casillas', email: 'ashlie.casillas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'super_admin', title: 'Operations', phone: '760-397-7274', locationIds: ALL_LOCATIONS },
    { name: 'Joseph Casillas', email: 'joseph.casillas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'admin', title: 'Admin', phone: '760-702-0435', locationIds: CA_LOCATIONS },
    { name: 'Leticia Casillas', email: 'leticia.casillas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'admin', title: 'Admin', phone: '760-899-1680', locationIds: EUREKA_ONLY },
    { name: 'Noemi Mejia', email: 'noemi.mejia@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'manager', title: 'Manager', phone: '760-574-5821', locationIds: CA_LOCATIONS },
    { name: 'Joe Galvan', email: 'joe.galvan@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'manager', title: 'Manager', phone: '760-391-3506', locationIds: CA_LOCATIONS },
    { name: 'Marichuy Lopez', email: 'marichuy.lopez@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'manager', title: 'Manager', phone: '760-567-4798', locationIds: CA_LOCATIONS },
    { name: 'Isaiah Casillas', email: 'isaiah.casillas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'manager', title: 'Manager', phone: '760-609-2134', locationIds: CA_LOCATIONS },
    { name: 'Amber Lopez', email: 'amber.lopez@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'manager', title: 'Manager', phone: '760-485-0198', locationIds: CA_LOCATIONS },
    { name: 'Kenne Kersey', email: 'kenne.kersey@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'manager', title: 'Manager', phone: '760-673-8551', locationIds: EUREKA_ONLY },
    { name: 'David Escoto', email: 'david.escoto@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-472-9625', locationIds: CA_LOCATIONS },
    { name: 'Joey Morales', email: 'joey.morales@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', phone: '760-620-9336', locationIds: CA_LOCATIONS },
    { name: 'Leobardo Mejia', email: 'leobardo.mejia@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-333-5752', locationIds: CA_LOCATIONS },
    { name: 'Hector Salas', email: 'hector.salas@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-835-2917', locationIds: CA_LOCATIONS },
    { name: 'David Espinoza', email: 'david.espinoza@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', department: 'Funeral Services', phone: '760-578-7907', locationIds: CA_LOCATIONS },
    { name: 'Silvia Rochin', email: 'silvia.rochin@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', phone: '760-391-1656', locationIds: CA_LOCATIONS },
    { name: 'Kelly Little', email: 'kelly.little@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', phone: '916-672-7436', locationIds: EUREKA_ONLY },
    { name: 'Martha Barcelo', email: 'martha.barcelo@casillasfuneralhome.com', password: 'ChangeMe123!', role: 'staff_member', title: 'Staff Member', phone: '707-726-3874', locationIds: EUREKA_ONLY },
  ]

  for (const s of staffDefs) {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true, // skip email verification since these are pre-provisioned staff accounts
    })
    if (authErr) {
      console.error(`  Failed to create auth user for ${s.name}: ${authErr.message}`)
      continue
    }

    const { error: staffErr } = await supabase.from('staff_members').insert({
      id: authUser.user.id,
      org_id: org.id,
      name: s.name,
      email: s.email,
      role: s.role,
      title: s.title,
      department: s.department ?? null,
      phone: s.phone ?? null,
      active: true,
    })
    if (staffErr) {
      console.error(`  Failed to create staff_members row for ${s.name}: ${staffErr.message}`)
      continue
    }

    const { error: locLinkErr } = await supabase.from('staff_locations').insert(
      s.locationIds.map((locationId) => ({ staff_id: authUser.user.id, location_id: locationId }))
    )
    if (locLinkErr) console.error(`  Failed to link locations for ${s.name}: ${locLinkErr.message}`)

    console.log(`  Created ${s.name} (${s.email})`)
  }

  console.log('Creating GPL items (real Oct 2024 price list, applied to all locations)...')
  const gplCanonical = [
    { sku: 'SVC-100', name: 'Basic Services of Funeral Director and Staff and Overhead', category: 'service', price: 995, taxable: false },
    { sku: 'SVC-101', name: 'Staff for Prayer Services', category: 'service', price: 450, taxable: false },
    { sku: 'SVC-102', name: 'Staff and Equipment for Off-Site Prayer Services/Mass', category: 'service', price: 185, taxable: false },
    { sku: 'SVC-103', name: 'Staff for Graveside Services', category: 'service', price: 150, taxable: false },
    { sku: 'SVC-104', name: 'Staff for Weekend or Holiday Services', category: 'service', price: 400, taxable: false },
    { sku: 'SVC-105', name: 'Dressing, Cosmetics, Hair Styling and Casketing of Remains', category: 'service', price: 250, taxable: false },
    { sku: 'SVC-106', name: 'Dressing Unembalmed Remains', category: 'service', price: 150, taxable: false },
    { sku: 'SVC-107', name: 'Post-Autopsy Care', category: 'service', price: 150, taxable: false },
    { sku: 'SVC-108', name: 'Viewing Unembalmed Body / Sanitary Care', category: 'service', price: 225, taxable: false },
    { sku: 'SVC-109', name: 'Embalming', category: 'service', price: 490, taxable: false },
    { sku: 'TRN-100', name: 'Transfer of Deceased to Funeral Home (25 mile radius)', category: 'service', price: 475, taxable: false },
    { sku: 'TRN-101', name: 'Second Man Removal', category: 'service', price: 85, taxable: false },
    { sku: 'TRN-102', name: 'Hearse (25 mile radius)', category: 'service', price: 170, taxable: false },
    { sku: 'TRN-103', name: 'Service/Utility Vehicle (50 mile radius)', category: 'service', price: 150, taxable: false },
    { sku: 'TRN-104', name: 'International Transportation (starts at)', category: 'service', price: 350, taxable: false },
    { sku: 'FAC-100', name: 'Staff Services and Use of Facilities for Memorial Services', category: 'facility', price: 450, taxable: false },
    { sku: 'FAC-101', name: 'Staff Services and Use of Facilities for Visitation (4 hrs, up to 9:00pm)', category: 'facility', price: 450, taxable: false },
    { sku: 'FAC-102', name: 'Staff Services and Use of Equipment for Graveside Service', category: 'facility', price: 150, taxable: false },
    { sku: 'FAC-103', name: 'Refrigerated Holding of Remains (per day)', category: 'facility', price: 85, taxable: false },
    { sku: 'FAC-104', name: 'Overnight Visitation / Extended Hours After 9:00pm', category: 'facility', price: 400, taxable: false },
    { sku: 'FAC-105', name: 'Staff Services and Use of Facilities for Funeral Ceremony', category: 'facility', price: 185, taxable: false },
    { sku: 'MER-100', name: 'Adult Casket — Economy', category: 'merchandise', price: 730, taxable: true },
    { sku: 'MER-101', name: 'Adult Casket — Mid-Range', category: 'merchandise', price: 2895, taxable: true },
    { sku: 'MER-102', name: 'Adult Casket — Premium', category: 'merchandise', price: 10500, taxable: true },
    { sku: 'MER-103', name: 'Infant / Children\u2019s Casket', category: 'merchandise', price: 370, taxable: true },
    { sku: 'MER-104', name: 'Rental Casket', category: 'merchandise', price: 1095, taxable: true },
    { sku: 'MER-105', name: 'Alternate Container for Cremation', category: 'merchandise', price: 105, taxable: true },
    { sku: 'MER-106', name: 'Memorial Folders and Prayer Cards (first 100)', category: 'merchandise', price: 45, taxable: true },
    { sku: 'MER-107', name: 'Memorial Register Book', category: 'merchandise', price: 45, taxable: true },
    { sku: 'MER-108', name: 'Urn (starting at)', category: 'merchandise', price: 45, taxable: true },
    { sku: 'MER-109', name: 'Outside Shipping Container for Airline Transport', category: 'merchandise', price: 185, taxable: true },
    { sku: 'MER-110', name: 'Combination Shipping Container', category: 'merchandise', price: 295, taxable: true },
    { sku: 'MER-111', name: 'Memorial Marker (starting at)', category: 'merchandise', price: 1165, taxable: true },
    { sku: 'MER-112', name: 'Crucifix', category: 'merchandise', price: 25, taxable: true },
    { sku: 'MER-113', name: 'Rosary', category: 'merchandise', price: 15, taxable: true },
    { sku: 'OTH-100', name: 'Cremation', category: 'service', price: 300, taxable: false },
    { sku: 'OTH-101', name: 'DCA Fee', category: 'cash_advance', price: 11.5, taxable: false },
    { sku: 'OTH-102', name: 'Mailing Cremated Remains Within the United States', category: 'service', price: 160, taxable: false },
    { sku: 'OTH-103', name: 'Motorcycle Escorts (2 Bikes)', category: 'service', price: 400, taxable: false },
    { sku: 'OTH-104', name: 'Insurance Assignment', category: 'cash_advance', price: 350, taxable: false },
    { sku: 'OTH-105', name: 'Forwarding Remains to Another Funeral Home', category: 'service', price: 2360, taxable: false },
    { sku: 'OTH-106', name: 'Receiving Remains from Another Funeral Home', category: 'service', price: 1790, taxable: false },
    { sku: 'PKG-100', name: 'Direct Cremation — Container Provided by Purchaser', category: 'service', price: 1620, taxable: false },
    { sku: 'PKG-101', name: 'Direct Cremation — Container Purchased from Funeral Home', category: 'service', price: 1720, taxable: false },
    { sku: 'PKG-102', name: 'Immediate Burial — Casket Provided by Purchaser', category: 'service', price: 2190, taxable: false },
    { sku: 'PKG-103', name: 'Immediate Burial — Casket Purchased from Funeral Home', category: 'service', price: 2190, taxable: false },
  ]
  for (const loc of locations) {
    const { error: gplErr } = await supabase.from('gpl_items').insert(
      gplCanonical.map((item) => ({ ...item, org_id: org.id, location_id: loc.id, active: true }))
    )
    if (gplErr) console.error(`  Failed to insert GPL for ${loc.name}: ${gplErr.message}`)
  }

  console.log('Creating vehicle fleet...')
  const vehicleDefs = [
    { name: 'Hearse #1', type: 'hearse', city: 'Cathedral City' },
    { name: 'Transfer Van', type: 'van', city: 'Cathedral City' },
    { name: 'Hearse #1', type: 'hearse', city: 'Desert Hot Springs' },
    { name: 'Hearse #1', type: 'hearse', city: 'Coachella' },
    { name: 'Family Limousine', type: 'limousine', city: 'Coachella' },
    { name: 'Hearse #1', type: 'hearse', city: 'Eureka' },
  ]
  const { error: vehErr } = await supabase.from('vehicles').insert(
    vehicleDefs.map((v) => ({ name: v.name, type: v.type, org_id: org.id, location_id: locByCity[v.city], active: true }))
  )
  if (vehErr) console.error(`  Failed to insert vehicles: ${vehErr.message}`)

  console.log('\nDone. Every non-Joel account was created with the password "ChangeMe123!" —')
  console.log('have each person change theirs on first login (or build a "force password')
  console.log('reset on first login" flow before rolling this out).')
}

main().catch((err) => {
  console.error('Seed script failed:', err)
  process.exit(1)
})
