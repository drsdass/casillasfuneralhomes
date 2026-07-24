// supabase/functions/family-portal-upload/index.ts
//
// Lets a family member upload photos, music (multiple tracks), and now a
// full pre-made video for the case through their secure portal link — no
// login. Same token validation as every other family-portal-* function.
//
// Photos/music go through the original base64-in-JSON path — fine for
// files up to a few MB. Video is a different animal (can easily be
// hundreds of MB), so it uses a signed-upload-URL flow instead: this
// function hands back a URL the browser uploads DIRECTLY to Storage
// (bypassing this function's own body-size limits entirely), then a
// second small call here just registers the finished file as a document.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "family-portal-upload". Turn OFF "Verify JWT".
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
  action?: 'get-upload-url' | 'register'
  filename: string
  contentType?: string
  base64Data?: string
  kind: 'photo' | 'music' | 'video'
  path?: string // only for 'register' — the path returned by 'get-upload-url'
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function validateLink(token: string) {
  const { data: link, error } = await supabase
    .from('family_portal_links')
    .select('case_id, expires_at')
    .eq('token', token)
    .single()
  if (error || !link) return { error: 'This link is invalid.', status: 404 }
  if (link.expires_at && new Date(link.expires_at) < new Date()) return { error: 'This link has expired.', status: 410 }
  return { link }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const body: RequestBody = await req.json()
    if (!body.token || !body.filename || !body.kind) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    const validated = await validateLink(body.token)
    if ('error' in validated) {
      return new Response(JSON.stringify({ error: validated.error }), { status: validated.status, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    const { link } = validated

    // --- Large-file path: video ---------------------------------------
    if (body.action === 'get-upload-url') {
      const path = `case-files/${link.case_id}/${Date.now()}-${body.filename.replace(/[^a-z0-9.]/gi, '-')}`
      const { data, error } = await supabase.storage.from('case-documents').createSignedUploadUrl(path)
      if (error) throw error
      return new Response(JSON.stringify({ path, token: data.token, signedUrl: data.signedUrl }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    if (body.action === 'register') {
      if (!body.path) {
        return new Response(JSON.stringify({ error: 'Missing path' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
      }
      const { error: docErr } = await supabase.from('case_documents').insert({
        case_id: link.case_id, name: body.filename, category: body.kind, storage_path: body.path, uploaded_by: null,
      })
      if (docErr) throw docErr
      await supabase.from('audit_log').insert({
        entity_type: 'document', entity_id: link.case_id, case_id: link.case_id, action: 'create',
        summary: `Family uploaded a video: "${body.filename}"`, changed_by: null,
      })
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    // --- Original path: photos/music, small enough for base64 ---------
    if (!body.base64Data) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    const bytes = base64ToUint8Array(body.base64Data)
    const path = `case-files/${link.case_id}/${Date.now()}-${body.filename.replace(/[^a-z0-9.]/gi, '-')}`
    const { error: uploadErr } = await supabase.storage.from('case-documents').upload(path, bytes, { contentType: body.contentType })
    if (uploadErr) throw uploadErr

    const { error: docErr } = await supabase.from('case_documents').insert({
      case_id: link.case_id, name: body.filename, category: body.kind, storage_path: path, uploaded_by: null,
    })
    if (docErr) throw docErr

    await supabase.from('audit_log').insert({
      entity_type: 'document', entity_id: link.case_id, case_id: link.case_id, action: 'create',
      summary: `Family uploaded a ${body.kind === 'music' ? 'song' : 'photo'} for the slideshow: "${body.filename}"`, changed_by: null,
    })

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
