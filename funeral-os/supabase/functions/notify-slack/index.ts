// supabase/functions/notify-slack/index.ts
//
// Posts a message into a Slack channel via an Incoming Webhook. Called
// from the frontend after key events (new case, custody stage change,
// staff time off) so activity shows up in Slack without anyone having to
// check Casillas OS directly. The webhook URL is a secret — it must never
// be called directly from the browser, since anyone holding that URL can
// post to your channel.
//
// Deploy via the Supabase Dashboard's Edge Function editor, name it
// exactly "notify-slack".
//
// Required secret (Edge Functions → Secrets):
//   SLACK_WEBHOOK_URL — from Slack: create an Incoming Webhook for the
//   channel you want these posted to (Slack → your workspace → Apps →
//   search "Incoming Webhooks" → Add to Slack → pick a channel → copy
//   the Webhook URL it gives you, looks like
//   https://hooks.slack.com/services/T000/B000/XXXXXXXX)
//
// If SLACK_WEBHOOK_URL isn't set, this quietly does nothing rather than
// erroring — Slack notifications are a nice-to-have, never something that
// should block or fail the actual action that triggered them.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  text: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const webhookUrl = (Deno.env.get('SLACK_WEBHOOK_URL') ?? '').trim()
    if (!webhookUrl) {
      return new Response(JSON.stringify({ skipped: true, reason: 'SLACK_WEBHOOK_URL not configured' }), {
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      })
    }

    const body: RequestBody = await req.json()
    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body.text }),
    })
    if (!slackRes.ok) throw new Error(`Slack webhook error: ${await slackRes.text()}`)

    return new Response(JSON.stringify({ sent: true }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    console.error(err)
    // Deliberately still 200 — a failed Slack post is a background
    // annoyance, not something that should surface as an error to whoever
    // triggered it (they already successfully did their actual action).
    return new Response(JSON.stringify({ sent: false, error: String(err) }), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
