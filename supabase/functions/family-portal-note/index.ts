// supabase/functions/family-portal-note/index.ts
//
// Lets a family member (through their private link, no login) save the obituary they wrote or send a message to the
// funeral home. Staff are told automatically (the database flags the case and buzzes phones — see src/db/family-activity.sql).
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "family-portal-note", and turn OFF "Verify JWT".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json()
    const token = String(body.token ?? '')
    if (!token) return json({ error: 'This link is invalid.' }, 404)
    const { data: link } = await supabase.from('family_portal_links').select('case_id, expires_at').eq('token', token).maybeSingle()
    if (!link) return json({ error: 'This link is invalid.' }, 404)
    if (link.expires_at && new Date(link.expires_at) < new Date()) return json({ error: 'This link has expired. Please contact the funeral home for a new one.' }, 410)

    const text = String(body.text ?? '').trim().slice(0, 8000)
    if (!text) return json({ error: 'Please write something first.' }, 400)

    if (body.action === 'obituary') {
      const { error } = await supabase.from('obituary_drafts').upsert({ case_id: link.case_id, body: text, status: 'submitted', updated_at: new Date().toISOString() }, { onConflict: 'case_id' })
      if (error) throw error
      await supabase.from('audit_log').insert({ entity_type: 'case', entity_id: link.case_id, case_id: link.case_id, action: 'update', summary: 'Family saved an obituary draft in their portal', changed_by: null })
      return json({ ok: true })
    }
    if (body.action === 'message') {
      const { error } = await supabase.from('family_messages').insert({ case_id: link.case_id, body: text, from_family: true })
      if (error) throw error
      await supabase.from('audit_log').insert({ entity_type: 'case', entity_id: link.case_id, case_id: link.case_id, action: 'create', summary: `Family sent a message: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`, changed_by: null })
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
})
