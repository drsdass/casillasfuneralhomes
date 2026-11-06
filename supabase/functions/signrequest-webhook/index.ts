// supabase/functions/signrequest-webhook/index.ts
//
// SignRequest calls this when someone views, signs or declines a document. We never trust the message itself:
// it only tells us WHICH document changed, and then we ask SignRequest directly what the document's status is.
//
// Deploy via the Supabase Dashboard: name it exactly "signrequest-webhook" and turn OFF "Verify JWT".
// Secrets: SIGNREQUEST_API_KEY, SIGNREQUEST_WEBHOOK_SECRET (the same random string used by send-signature-request).
// The send function adds the callback address to every request, so nothing needs to be set up inside SignRequest.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } })

// SignRequest document status codes -> ours
const STATUS: Record<string, string> = { se: 'sent', vi: 'viewed', si: 'signed', sd: 'signed', do: 'signed', de: 'declined', ca: 'declined', xp: 'expired' }

Deno.serve(async (req) => {
  const secret = (Deno.env.get('SIGNREQUEST_WEBHOOK_SECRET') ?? '').trim()
  if (!secret || new URL(req.url).searchParams.get('secret') !== secret) return new Response('Unauthorized', { status: 401 })
  const key = (Deno.env.get('SIGNREQUEST_API_KEY') ?? '').trim()
  try {
    const raw = await req.text()
    console.log('signrequest event', raw.slice(0, 800))
    const found = [...new Set(raw.match(UUID) ?? [])]
    // deno-lint-ignore no-explicit-any
    let payload: any = {}
    try { payload = JSON.parse(raw) } catch { /* ignore */ }
    const external = payload?.document?.external_id ?? payload?.event_payload?.document?.external_id

    let q = db.from('signature_requests').select('*').in('sign_request_id', found.length ? found : ['none'])
    let { data: rows } = await q
    if ((!rows || rows.length === 0) && external) rows = (await db.from('signature_requests').select('*').eq('id', external)).data
    const row = rows?.[0]
    if (!row) return ok({ ignored: true })

    // Ask SignRequest for the truth.
    const r = await fetch(`https://signrequest.com/api/v1/documents/${row.sign_request_id}/`, { headers: { Authorization: `Token ${key}` } })
    if (!r.ok) throw new Error(`SignRequest document lookup failed: ${r.status}`)
    const doc = await r.json()
    const status = STATUS[String(doc.status)] ?? null
    if (!status || status === row.status) return ok({ unchanged: true })

    const patch: Record<string, unknown> = { status }
    if (status === 'signed') {
      patch.signed_at = new Date().toISOString()
      const pdfUrl: string | undefined = doc.pdf ?? doc.signing_log?.pdf
      if (pdfUrl) {
        let f = await fetch(pdfUrl, { headers: { Authorization: `Token ${key}` } })
        if (!f.ok) f = await fetch(pdfUrl)
        if (f.ok) {
          const path = `signed/${row.case_id}/${row.sign_request_id}.pdf`
          const up = await db.storage.from('case-documents').upload(path, new Uint8Array(await f.arrayBuffer()), { contentType: 'application/pdf', upsert: true })
          if (!up.error) {
            patch.signed_document_url = path
            // Also file it with the case's other documents.
            const exists = await db.from('case_documents').select('id').eq('case_id', row.case_id).eq('storage_path', path).maybeSingle()
            if (!exists.data) await db.from('case_documents').insert({ case_id: row.case_id, name: `Signed — ${row.document_name}`, category: 'contract', storage_path: path, uploaded_by: row.sent_by, signed: true })
          }
        }
      }
    }
    await db.from('signature_requests').update(patch).eq('id', row.id)

    if (status === 'signed') {
      const hook = (Deno.env.get('SLACK_WEBHOOK_URL') ?? '').trim()
      if (hook) fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `✅ Signed: *${row.document_name}* by ${row.signer_name}` }) }).catch(() => {})
    }
    return ok()
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
})
