// supabase/functions/send-signature-request/index.ts
//
// Sends a PDF to SignRequest so a family member can sign it (by email link, or on a tablet in the office).
// The SignRequest key stays here, on the server — the browser never sees it.
//
// Deploy via the Supabase Dashboard: name it exactly "send-signature-request", leave "Verify JWT" ON.
//
// Secrets (Edge Functions -> Secrets):
//   SIGNREQUEST_API_KEY        the API token from SignRequest (Settings -> Team -> API)
//   SIGNREQUEST_WEBHOOK_SECRET any random string you make up (shared with the signrequest-webhook function)
//
// Body: { caseId, documentName, documentStoragePath, signerName, signerEmail, mode: 'email' | 'inperson' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  let rowId: string | null = null
  try {
    const body = await req.json()
    const key = (Deno.env.get('SIGNREQUEST_API_KEY') ?? '').trim()
    if (!key) return reply({ error: 'SignRequest is not connected yet: the SIGNREQUEST_API_KEY secret is missing in Supabase.' }, 400)
    const signerEmail = String(body.signerEmail ?? '').trim()
    const signerName = String(body.signerName ?? '').trim() || 'Family Contact'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmail)) return reply({ error: 'A valid email address for the signer is needed.' }, 400)
    const mode = body.mode === 'inperson' ? 'inperson' : 'email'
    const documentName = String(body.documentName ?? 'Document').slice(0, 150)

    // Who is pressing the button, and may they see this case? (Uses their own login, so the database's rules apply.)
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: u } = await asUser.auth.getUser()
    if (!u?.user) return reply({ error: 'Please sign in again.' }, 401)
    const { data: theCase } = await asUser.from('cases').select('id, organizations(name)').eq('id', String(body.caseId ?? '')).maybeSingle()
    if (!theCase) return reply({ error: 'That case was not found, or you do not have access to it.' }, 403)
    // deno-lint-ignore no-explicit-any
    const companyName = (theCase as any).organizations?.name ?? 'Casillas Funeral Home'

    const path = String(body.documentStoragePath ?? '')
    if (!path) return reply({ error: 'No document was provided.' }, 400)
    const { data: file, error: dlErr } = await db.storage.from('case-documents').download(path)
    if (dlErr || !file) throw new Error(`Could not read the document: ${dlErr?.message ?? 'missing'}`)
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { data: row, error: insErr } = await db.from('signature_requests').insert({
      case_id: theCase.id, document_name: documentName, status: 'draft', signer_name: signerName, signer_email: signerEmail,
      sent_by: u.user.id, mode, document_path: path,
    }).select().single()
    if (insErr) throw insErr
    rowId = row.id

    const secret = (Deno.env.get('SIGNREQUEST_WEBHOOK_SECRET') ?? '').trim()
    const callback = secret ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/signrequest-webhook?secret=${encodeURIComponent(secret)}` : undefined
    const [first, ...rest] = signerName.split(/\s+/)
    const signer: Record<string, unknown> = { email: signerEmail, first_name: first, last_name: rest.join(' ') }
    if (mode === 'inperson') signer.embed_url_user_id = `inperson-${row.id}`

    const res = await fetch('https://signrequest.com/api/v1/signrequest-quick-create/', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_from_content: toBase64(bytes),
        file_from_content_name: `${documentName.replace(/[^\w .-]/g, '')}.pdf`,
        name: documentName,
        external_id: row.id,
        from_email_name: companyName,
        subject: `Please sign: ${documentName}`,
        message: `${companyName} has sent you "${documentName}" to review and sign. Thank you.`,
        signers: [signer],
        ...(callback ? { events_callback_url: callback } : {}),
      }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`SignRequest said: ${text.slice(0, 400)}`)
    // deno-lint-ignore no-explicit-any
    let out: any = {}
    try { out = JSON.parse(text) } catch { /* keep {} */ }
    const docRef = typeof out.document === 'string' ? out.document : JSON.stringify(out.document ?? out)
    const docUuid = (docRef.match(UUID)?.[0] ?? out.uuid ?? '') as string
    const embedUrl = out.signers?.find?.((s: { embed_url?: string }) => s.embed_url)?.embed_url ?? null

    const { data: done, error: upErr } = await db.from('signature_requests').update({
      sign_request_id: docUuid || null, status: 'sent', sent_at: new Date().toISOString(), embed_url: embedUrl, external_ref: out.uuid ?? null,
    }).eq('id', row.id).select().single()
    if (upErr) throw upErr
    if (mode === 'inperson' && !embedUrl) return reply({ ...done, warning: 'SignRequest did not return a signing page for the office tablet. It was emailed instead.' })
    return reply(done)
  } catch (err) {
    console.error(err)
    if (rowId) await db.from('signature_requests').delete().eq('id', rowId)
    return reply({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
