// supabase/functions/family-portal-data/index.ts
//
// The ONLY way an unauthenticated family member's browser ever touches
// case data. Validates the one token they were given, returns just that
// case's info — never table access, never browsing. This exists because
// family_portal_links/cases/etc. all have RLS requiring a real staff
// login; a family member has no such login, so this function uses the
// service role (bypassing RLS deliberately, in this one narrow spot) and
// enforces the actual access control itself, in code, instead.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "family-portal-data". IMPORTANT: after deploying, go to this
// function's Settings tab and turn OFF "Verify JWT" — a family member has
// no Supabase session/JWT at all, so requiring one would lock them out
// entirely. (Same setting as signrequest-webhook needed.)
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

// Soft, family-facing language for each internal custody stage — staff
// see the clinical stage names elsewhere in the app; families never
// should. Keep this warm, brief, and not overly specific about anything
// families likely wouldn't want described in detail.
const STAGE_MESSAGES: Record<string, string> = {
  scene_first_call: 'We have received your loved one into our care.',
  in_transit: 'Your loved one is being brought to our facility.',
  funeral_home: 'Your loved one has arrived safely at our care facility and is being treated with the utmost care and respect.',
  chapel_service: 'We are preparing for the upcoming service.',
  crematory: 'We are carrying out arrangements with the greatest care.',
  cemetery_burial: 'We are carrying out arrangements with the greatest care.',
  shipped_released: 'Services have been completed. Thank you for trusting us during this difficult time.',
}

interface RequestBody {
  token: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const { token }: RequestBody = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const { data: link, error: linkErr } = await supabase
      .from('family_portal_links')
      .select('*')
      .eq('token', token)
      .single()
    if (linkErr || !link) {
      return new Response(JSON.stringify({ error: 'This link is invalid.' }), { status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired. Please contact the funeral home for a new one.' }), {
        status: 410, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    // Best-effort — don't fail the whole request if this write hiccups.
    supabase.from('family_portal_links').update({ last_accessed_at: new Date().toISOString() }).eq('id', link.id).then(() => {})

    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('*, case_contacts(*)')
      .eq('id', link.case_id)
      .single()
    if (caseErr || !caseRow) {
      return new Response(JSON.stringify({ error: 'Case not found.' }), { status: 404, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const [{ data: location }, { data: gplItems }, { data: contracts }, { data: obituary }, { data: mediaFiles }] = await Promise.all([
      supabase.from('locations').select('*').eq('id', caseRow.location_id).single(),
      supabase.from('gpl_items').select('*').eq('location_id', caseRow.location_id),
      supabase.from('contracts').select('*, contract_line_items(*)').eq('case_id', caseRow.id),
      supabase.from('obituary_drafts').select('*').eq('case_id', caseRow.id).maybeSingle(),
      supabase.from('case_documents').select('*').eq('case_id', caseRow.id).in('category', ['photo', 'music']),
    ])

    return new Response(JSON.stringify({
      case: caseRow,
      location,
      gplItems: gplItems ?? [],
      contracts: contracts ?? [],
      obituary: obituary ?? null,
      mediaFiles: mediaFiles ?? [],
      statusMessage: STAGE_MESSAGES[caseRow.custody_stage] ?? null,
    }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
