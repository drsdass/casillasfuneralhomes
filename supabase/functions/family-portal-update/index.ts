// supabase/functions/family-portal-update/index.ts
//
// The write counterpart to family-portal-data — lets a family member
// complete missing First Call and Vital Sheet information through their
// secure link, no login. Deliberately narrow: only ever touches the
// specific fields listed below, validated the same way family-portal-data
// validates reads — the token itself, checked server-side against
// family_portal_links, with the service role used only after that check
// passes.
//
// Fields intentionally NOT editable here: anything staff-observed or
// internal (gate code, weight, contagious, family present/ready,
// coroner's case info, person calling / time of removal / call taken by).
//
// SHARED-FIELD DISCREPANCIES: date of birth and veteran status also live
// on First Call, which staff may have already filled in from the phone
// call. If the family submits a different value for one of these and the
// existing value is non-empty, this does NOT silently overwrite it —
// instead it's recorded in field_discrepancies for staff to resolve, and
// the existing value is left alone. Every other field here has exactly
// one place it's ever entered, so no such check is needed for them.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "family-portal-update". Turn OFF "Verify JWT" — a family member
// has no Supabase session at all, same as family-portal-data.
//
// Required secret: SUPABASE_SERVICE_ROLE_KEY (set automatically)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface RequestBody {
  token: string
  dateOfBirth?: string
  ssn?: string
  veteran?: boolean
  contactName?: string
  contactPhone?: string
  contactRelationship?: string
  doctorName?: string
  doctorPhone?: string
  hospiceName?: string
  hospicePhone?: string
  vitalSheet?: {
    alsoKnownAs?: string
    birthCity?: string; birthState?: string; birthCountry?: string
    education?: string; hispanicLatino?: boolean; race?: string
    occupation?: string; kindOfBusiness?: string; yearsInOccupation?: string
    residenceAddress?: string; residenceCity?: string; residenceCounty?: string; residenceZip?: string; residenceState?: string; yearsInCounty?: string
    informantName?: string; informantRelationship?: string; informantMailingAddress?: string
    spouseName?: string; fatherName?: string; fatherBirthState?: string; motherName?: string; motherBirthState?: string
    sons?: string; daughters?: string; sisters?: string; brothers?: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const body: RequestBody = await req.json()
    if (!body.token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const { data: link, error: linkErr } = await supabase
      .from('family_portal_links')
      .select('case_id, expires_at')
      .eq('token', body.token)
      .single()
    if (linkErr || !link) {
      return new Response(JSON.stringify({ error: 'This link is invalid.' }), { status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired. Please contact the funeral home for a new one.' }), {
        status: 410, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('first_call, vital_sheet, field_discrepancies, decedent_dob, decedent_veteran')
      .eq('id', link.case_id)
      .single()
    if (caseErr || !caseRow) {
      return new Response(JSON.stringify({ error: 'Case not found.' }), { status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const existingDiscrepancies: Array<{ field: string; fieldLabel: string; existingValue: string; submittedValue: string; flaggedAt: string }> =
      caseRow.field_discrepancies ?? []
    const discrepancies = [...existingDiscrepancies]
    const now = new Date().toISOString()
    const casePatch: Record<string, unknown> = {}

    if (body.dateOfBirth !== undefined) {
      if (caseRow.decedent_dob && body.dateOfBirth && caseRow.decedent_dob !== body.dateOfBirth) {
        discrepancies.push({ field: 'dateOfBirth', fieldLabel: 'Date of Birth', existingValue: caseRow.decedent_dob, submittedValue: body.dateOfBirth, flaggedAt: now })
      } else {
        casePatch.decedent_dob = body.dateOfBirth || null
      }
    }
    if (body.veteran !== undefined) {
      if (caseRow.decedent_veteran === true && body.veteran === false) {
        discrepancies.push({ field: 'veteran', fieldLabel: 'Veteran Status', existingValue: 'Yes', submittedValue: 'No', flaggedAt: now })
      } else {
        casePatch.decedent_veteran = body.veteran
      }
    }
    if (discrepancies.length > existingDiscrepancies.length) {
      casePatch.field_discrepancies = discrepancies
    }

    if (body.ssn !== undefined) casePatch.decedent_ssn_encrypted = body.ssn || null

    casePatch.first_call = {
      ...(caseRow.first_call ?? {}),
      ...(body.doctorName !== undefined && { doctorName: body.doctorName }),
      ...(body.doctorPhone !== undefined && { doctorPhone: body.doctorPhone }),
      ...(body.hospiceName !== undefined && { hospiceName: body.hospiceName }),
      ...(body.hospicePhone !== undefined && { hospicePhone: body.hospicePhone }),
    }

    if (body.vitalSheet) {
      casePatch.vital_sheet = { ...(caseRow.vital_sheet ?? {}), ...body.vitalSheet }
    }

    const { error: updateErr } = await supabase.from('cases').update(casePatch).eq('id', link.case_id)
    if (updateErr) throw updateErr

    if (body.contactName || body.contactPhone || body.contactRelationship) {
      const { data: existingContact } = await supabase.from('case_contacts').select('id').eq('case_id', link.case_id).eq('is_primary', true).maybeSingle()
      if (existingContact) {
        await supabase.from('case_contacts').update({
          ...(body.contactName !== undefined && { name: body.contactName }),
          ...(body.contactPhone !== undefined && { phone: body.contactPhone }),
          ...(body.contactRelationship !== undefined && { relationship: body.contactRelationship }),
        }).eq('id', existingContact.id)
      } else {
        await supabase.from('case_contacts').insert({
          case_id: link.case_id, name: body.contactName ?? '', phone: body.contactPhone ?? null,
          relationship: body.contactRelationship ?? null, is_primary: true, is_authorizing_agent: true,
        })
      }
    }

    await supabase.from('audit_log').insert({
      entity_type: 'case', entity_id: link.case_id, case_id: link.case_id, action: 'update',
      summary: discrepancies.length > existingDiscrepancies.length
        ? 'Family submitted intake information — some fields need staff review (conflicts with existing data)'
        : 'Family completed intake information via their portal link',
      changed_by: null,
    })

    return new Response(JSON.stringify({ ok: true, hasDiscrepancy: discrepancies.length > existingDiscrepancies.length }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
