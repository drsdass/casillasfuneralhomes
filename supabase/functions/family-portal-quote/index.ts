// supabase/functions/family-portal-quote/index.ts
//
// Lets a family member toggle real price-list items on their case's quote
// through their secure portal link — no login. Same validation pattern as
// family-portal-data/family-portal-update: the token itself, checked
// server-side, service role used only after that passes.
//
// This writes to the exact same contracts/contract_line_items tables the
// staff-facing Quote Builder uses — a family checking a box here and
// staff adding it from the price list are the same action on the same
// underlying quote, not two separate systems.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "family-portal-quote". Turn OFF "Verify JWT".
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
  action: 'add' | 'remove'
  gplItemId: string
  name?: string
  price?: number
}

async function recalcContractTotal(contractId: string) {
  const { data: contract } = await supabase.from('contracts').select('discount, tax_total').eq('id', contractId).single()
  const { data: items } = await supabase.from('contract_line_items').select('quantity, unit_price, adjustment_amount').eq('contract_id', contractId)
  const subtotal = (items ?? []).reduce((sum, i) => sum + Number(i.quantity) * (Number(i.unit_price) + Number(i.adjustment_amount ?? 0)), 0)
  const discount = Number(contract?.discount ?? 0)
  const taxTotal = Number(contract?.tax_total ?? 0)
  await supabase.from('contracts').update({ subtotal, total: subtotal - discount + taxTotal }).eq('id', contractId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const body: RequestBody = await req.json()
    if (!body.token || !body.gplItemId || !body.action) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
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
      return new Response(JSON.stringify({ error: 'This link has expired.' }), { status: 410, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    let { data: contract } = await supabase.from('contracts').select('id, location_id').eq('case_id', link.case_id).order('created_at', { ascending: true }).limit(1).maybeSingle()

    if (body.action === 'add') {
      if (!contract) {
        const { data: caseRow } = await supabase.from('cases').select('location_id').eq('id', link.case_id).single()
        const { data: created, error: createErr } = await supabase
          .from('contracts')
          .insert({ case_id: link.case_id, location_id: caseRow?.location_id, status: 'draft' })
          .select('id')
          .single()
        if (createErr) throw createErr
        contract = created
      }
      const { data: existingLine } = await supabase.from('contract_line_items').select('id').eq('contract_id', contract!.id).eq('gpl_item_id', body.gplItemId).maybeSingle()
      if (!existingLine) {
        await supabase.from('contract_line_items').insert({
          contract_id: contract!.id, gpl_item_id: body.gplItemId, name: body.name ?? 'Item', quantity: 1, unit_price: body.price ?? 0,
        })
      }
      await recalcContractTotal(contract!.id)
    } else if (body.action === 'remove' && contract) {
      await supabase.from('contract_line_items').delete().eq('contract_id', contract.id).eq('gpl_item_id', body.gplItemId)
      await recalcContractTotal(contract.id)
    }

    await supabase.from('audit_log').insert({
      entity_type: 'contract', entity_id: contract?.id ?? link.case_id, case_id: link.case_id, action: 'update',
      summary: `Family ${body.action === 'add' ? 'added' : 'removed'} "${body.name ?? body.gplItemId}" on the quote`, changed_by: null,
    })

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
