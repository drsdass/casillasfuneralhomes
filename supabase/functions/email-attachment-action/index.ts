// supabase/functions/email-attachment-action/index.ts
//
// Handles the per-attachment choice staff make on a matched email:
//   action: "extract" — read this one attachment with Claude and return
//           structured fields for staff to review (does NOT touch the
//           case automatically — same "always reviewed" pattern as the
//           upload-to-create-case feature)
//   action: "save"    — just fetch the file and store it as a document on
//           the case, no AI involved
//
// Attachment CONTENT is only ever fetched from Microsoft Graph at the
// moment a staff member picks one of these two actions for one specific
// attachment — never in bulk, never for a whole email at once, and never
// during the sync-inbox poll (which only stores filename/type/size).
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "email-attachment-action".
//
// Required secrets: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID,
// MICROSOFT_CLIENT_SECRET, MICROSOFT_MAILBOX, ANTHROPIC_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY (set automatically)

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
  graphMessageId: string
  attachmentId: string
  filename: string
  contentType: string
  action: 'extract' | 'save'
  caseId: string
  changedBy: string // staffId
}

async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID')!
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Graph auth failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

/** Returns the attachment's raw bytes as base64, straight from Graph. */
async function fetchAttachmentContent(token: string, mailbox: string, messageId: string, attachmentId: string): Promise<string> {
  const url = `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments/${attachmentId}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Failed to fetch attachment: ${await res.text()}`)
  const data = await res.json()
  return data.contentBytes // Graph already returns file attachments base64-encoded
}

const EXTRACTION_SYSTEM_PROMPT = `You extract funeral home case information from an email attachment
(hospital paperwork, an existing invoice, a form, etc.).

Respond with ONLY a JSON object, no other text, matching this shape exactly:
{
  "decedentFirstName": string or null, "decedentMiddleName": string or null, "decedentLastName": string or null,
  "dateOfBirth": "YYYY-MM-DD" or null, "dateOfDeath": "YYYY-MM-DD" or null, "placeOfDeath": string or null,
  "sex": string or null, "maritalStatus": string or null,
  "disposition": one of "burial","cremation","entombment","donation","undetermined", or null,
  "type": one of "at_need","pre_need","transfer_only", or null,
  "contactName": string or null, "contactRelationship": string or null, "contactPhone": string or null, "contactEmail": string or null,
  "confidence": "high", "medium", or "low",
  "notes": string or null
}

Only fill fields you find actual evidence for. Use null otherwise — never guess.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const body: RequestBody = await req.json()
    const token = await getGraphToken()
    const contentBase64 = await fetchAttachmentContent(
      token, (Deno.env.get('MICROSOFT_MAILBOX') ?? '').trim(), body.graphMessageId, body.attachmentId
    )

    if (body.action === 'save') {
      const bytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0))
      const path = `email-attachments/${body.caseId}/${Date.now()}-${body.filename.replace(/[^a-z0-9.]/gi, '-')}`
      const { error: uploadErr } = await supabase.storage.from('case-documents').upload(path, bytes, { contentType: body.contentType })
      if (uploadErr) throw uploadErr

      const { data: doc, error: docErr } = await supabase
        .from('case_documents')
        .insert({ case_id: body.caseId, name: body.filename, category: 'other', storage_path: path, uploaded_by: body.changedBy })
        .select()
        .single()
      if (docErr) throw docErr

      return new Response(JSON.stringify({ action: 'save', document: doc }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    // action === 'extract'
    const isPdf = body.contentType === 'application/pdf'
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: contentBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: body.contentType, data: contentBase64 } }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extract the case information from this attachment.' }] }],
      }),
    })
    if (!claudeRes.ok) throw new Error(`Claude API error: ${await claudeRes.text()}`)
    const claudeData = await claudeRes.json()
    const cleaned = (claudeData.content?.[0]?.text ?? '{}').replace(/```json\s*|```\s*/g, '').trim()
    const extracted = JSON.parse(cleaned)

    return new Response(JSON.stringify({ action: 'extract', extracted }), {
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
