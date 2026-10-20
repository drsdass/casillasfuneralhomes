// supabase/functions/notify-family-sms/index.ts
//
// Sends a text message to a family's primary contact — currently used
// for one moment specifically: the decedent arriving at the funeral
// home's care ("Your loved one has arrived safely..."), triggered
// automatically from a custody stage change. Kept generic (just phone +
// message in, sent via Twilio) so it can be reused for other family
// notifications later without a new function.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "notify-family-sms".
//
// Required secrets (Edge Functions → Secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER — the phone number Twilio gave you, e.g. +17605551234
//
// If any of these aren't set, this quietly does nothing rather than
// erroring — same "fire and forget, never block the real action" pattern
// as the Slack notifications.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  toPhone: string
  message: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const accountSid = (Deno.env.get('TWILIO_ACCOUNT_SID') ?? '').trim()
    const authToken = (Deno.env.get('TWILIO_AUTH_TOKEN') ?? '').trim()
    const fromNumber = (Deno.env.get('TWILIO_FROM_NUMBER') ?? '').trim()
    if (!accountSid || !authToken || !fromNumber) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Twilio secrets not configured' }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const { toPhone, message }: RequestBody = await req.json()
    if (!toPhone || !message) {
      return new Response(JSON.stringify({ error: 'toPhone and message are required' }), {
        status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromNumber, To: toPhone, Body: message }),
    })
    if (!twilioRes.ok) throw new Error(`Twilio error: ${await twilioRes.text()}`)

    return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    // Still 200 — an SMS failing shouldn't surface as an error to whoever
    // triggered the underlying action (they already succeeded at that).
    return new Response(JSON.stringify({ sent: false, error: String(err) }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
