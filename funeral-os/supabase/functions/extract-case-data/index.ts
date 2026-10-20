// supabase/functions/extract-case-data/index.ts
//
// Reads an uploaded document (intake form, hospital paperwork, existing
// invoice, etc. — PDF or image) and extracts case-relevant fields using
// Claude's vision/document understanding. Returns structured JSON for the
// frontend to pre-fill a New Case form with — the extraction is never
// saved directly; a staff member always reviews and confirms before a
// case is actually created.
//
// Deploy via the Supabase Dashboard's Edge Function editor (Deploy a new
// function → Via Editor), same as the other functions in this project —
// no CLI needed. Name it exactly "extract-case-data".
//
// Required secret (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY — same key used by sync-inbox for email matching
//
// CORS: same requirement as send-signature-request — every response,
// including errors, needs these headers or the browser blocks the request
// before your code ever runs.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  fileBase64: string // the uploaded file, base64-encoded, no data: URL prefix
  mediaType: string // e.g. "application/pdf", "image/jpeg", "image/png"
}

const EXTRACTION_SYSTEM_PROMPT = `You extract funeral home case information from an uploaded document
(intake form, hospital paperwork, an existing invoice, a handwritten note, etc.).

Respond with ONLY a JSON object, no other text, matching this shape exactly:
{
  "decedentFirstName": string or null,
  "decedentMiddleName": string or null,
  "decedentLastName": string or null,
  "dateOfBirth": "YYYY-MM-DD" or null,
  "dateOfDeath": "YYYY-MM-DD" or null,
  "placeOfDeath": string or null,
  "sex": string or null,
  "maritalStatus": string or null,
  "disposition": one of "burial","cremation","entombment","donation","undetermined", or null,
  "type": one of "at_need","pre_need","transfer_only", or null,
  "contactName": string or null,
  "contactRelationship": string or null,
  "contactPhone": string or null,
  "contactEmail": string or null,
  "confidence": "high", "medium", or "low" — your overall confidence in this extraction,
  "notes": string or null — anything ambiguous, illegible, or worth a human double-checking
}

Only fill fields you can actually find evidence for in the document. Use null for anything
not present or unclear — never guess or fabricate a value. If the document is illegible,
irrelevant, or not a funeral-related document at all, set confidence to "low" and explain
why in notes.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()
    if (!body.fileBase64 || !body.mediaType) {
      return new Response(JSON.stringify({ error: 'fileBase64 and mediaType are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const isPdf = body.mediaType === 'application/pdf'
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.fileBase64 } }

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
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: 'Extract the case information from this document, following the JSON schema exactly.' },
          ],
        }],
      }),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      throw new Error(`Claude API error: ${errText}`)
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text ?? '{}'

    // Claude occasionally wraps JSON in markdown fences despite instructions
    // not to — strip those defensively before parsing.
    const cleaned = rawText.replace(/```json\s*|```\s*/g, '').trim()
    const extracted = JSON.parse(cleaned)

    return new Response(JSON.stringify(extracted), {
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
