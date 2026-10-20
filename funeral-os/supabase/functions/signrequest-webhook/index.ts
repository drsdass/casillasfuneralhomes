// supabase/functions/signrequest-webhook/index.ts
//
// Public endpoint SignRequest calls when a document's status changes
// (viewed, signed, declined). Configure this URL in SignRequest's team
// settings under "Integrations" as the webhook target — SignRequest
// supports a shared-secret query param for verification, which this
// checks before trusting the payload.
//
// Deploy: supabase functions deploy signrequest-webhook --no-verify-jwt
// (--no-verify-jwt because SignRequest, not a logged-in user, calls this)
//
// Set the webhook URL in SignRequest as:
//   https://<project>.supabase.co/functions/v1/signrequest-webhook?secret=<WEBHOOK_SECRET>
//
// Required secrets (supabase secrets set):
//   SIGNREQUEST_WEBHOOK_SECRET — a random string you choose, must match the
//                                 ?secret= param configured in SignRequest
//   SUPABASE_SERVICE_ROLE_KEY  — set automatically by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// SignRequest's event "status" values: sent, viewed, signed, declined, ...
const statusMap: Record<string, string> = {
  sent: 'sent',
  viewed: 'viewed',
  signed: 'signed',
  declined: 'declined',
  expired: 'expired',
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (Deno.env.get('SIGNREQUEST_WEBHOOK_SECRET') ?? '').trim()) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload = await req.json()
    // SignRequest's webhook payload shape: { uuid, status, document: {...}, signer: {...} }
    const signRequestId = payload.uuid
    const mappedStatus = statusMap[payload.status] ?? null
    if (!signRequestId || !mappedStatus) {
      return new Response(JSON.stringify({ ignored: true }), { headers: { 'content-type': 'application/json' } })
    }

    const patch: Record<string, unknown> = { status: mappedStatus }
    if (mappedStatus === 'signed') {
      patch.signed_at = new Date().toISOString()

      // Download the signed PDF from SignRequest and store it in Supabase
      // Storage so it lives alongside the case's other documents.
      if (payload.document?.download_url) {
        const fileRes = await fetch(payload.document.download_url, {
          headers: { Authorization: `Token ${Deno.env.get('SIGNREQUEST_API_KEY')}` },
        })
        if (fileRes.ok) {
          const bytes = new Uint8Array(await fileRes.arrayBuffer())
          const path = `signed/${signRequestId}.pdf`
          await supabase.storage.from('case-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
          const { data: publicUrl } = supabase.storage.from('case-documents').getPublicUrl(path)
          patch.signed_document_url = publicUrl.publicUrl
        }
      }
    }

    const { error } = await supabase.from('signature_requests').update(patch).eq('sign_request_id', signRequestId)
    if (error) throw error

    if (mappedStatus === 'signed') {
      const webhookUrl = (Deno.env.get('SLACK_WEBHOOK_URL') ?? '').trim()
      if (webhookUrl) {
        const { data: sig } = await supabase.from('signature_requests').select('document_name, signer_name').eq('sign_request_id', signRequestId).single()
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `✅ Signed: *${sig?.document_name ?? 'Document'}* by ${sig?.signer_name ?? 'signer'}` }),
        }).catch((e) => console.error('Slack notify failed:', e))
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
})
