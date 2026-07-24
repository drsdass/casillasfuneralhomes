// supabase/functions/send-signature-request/index.ts
//
// Called from the frontend via supabase.functions.invoke('send-signature-request', {...}).
// Holds the SignRequest API key server-side — the browser never sees it.
//
// Deploy: supabase functions deploy send-signature-request
//
// Required secrets (supabase secrets set):
//   SIGNREQUEST_API_KEY   — from a SignRequest Business account
//   SIGNREQUEST_TEAM      — your SignRequest team subdomain
//   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase
//
// This function expects the document to already exist as a PDF in Supabase
// Storage (case-documents bucket) — generate the filled form to PDF
// client-side or in a separate step, upload it, then pass its storage path
// here. SignRequest needs a reachable URL or base64 file content; using a
// short-lived signed Storage URL is the simplest approach.
//
// CORS: browsers send a preflight OPTIONS request before the real POST
// whenever a request includes custom headers (which supabase-js always
// adds — Authorization, apikey, etc.). Every response below — including
// errors — must include these headers, or the browser blocks the request
// entirely before your function code ever runs, which surfaces to the
// frontend as a generic "Failed to send a request to the Edge Function"
// with no useful detail.

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
  caseId: string
  documentName: string
  documentStoragePath: string // path in the case-documents bucket
  signerName: string
  signerEmail: string
  sentBy: string // staffId, from the authenticated caller
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()

    if (!body.signerEmail) {
      return new Response(JSON.stringify({ error: 'Signer email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    // Short-lived signed URL so SignRequest can fetch the PDF without the
    // bucket needing to be public.
    const { data: signedUrl, error: urlErr } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(body.documentStoragePath, 60 * 10) // 10 minutes
    if (urlErr) throw urlErr

    const signRequestRes = await fetch('https://signrequest.com/api/v1/signrequests/', {
      method: 'POST',
      headers: {
        Authorization: `Token ${(Deno.env.get('SIGNREQUEST_API_KEY') ?? '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document: { url_w_auth: signedUrl.signedUrl, name: body.documentName },
        signers: [{ email: body.signerEmail, name: body.signerName }],
        from_email_name: 'Casillas Funeral Home',
        subject: `Please sign: ${body.documentName}`,
        message: 'Please review and sign the attached document at your earliest convenience.',
      }),
    })

    if (!signRequestRes.ok) {
      const errText = await signRequestRes.text()
      throw new Error(`SignRequest API error: ${errText}`)
    }
    const signRequestData = await signRequestRes.json()

    const { data: inserted, error: insertErr } = await supabase
      .from('signature_requests')
      .insert({
        case_id: body.caseId,
        document_name: body.documentName,
        sign_request_id: signRequestData.uuid,
        status: 'sent',
        signer_name: body.signerName,
        signer_email: body.signerEmail,
        sent_by: body.sentBy,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (insertErr) throw insertErr

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
