// supabase/functions/voice-command/index.ts
//
// Turns something a staff member SAID ("move Rosalio Trevino to the chapel, and add a note to Torres that the
// family is bringing a suit") into a short list of proposed actions. It never changes anything itself:
// the app shows the list and the person taps "Do it".
//
// Deploy via the Dashboard's Edge Function editor, name it exactly "voice-command", leave "Verify JWT" ON
// (only signed-in staff can call it). Needs the ANTHROPIC_API_KEY secret (already set for sync-inbox).

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } })

const STAGES = ['scene_first_call', 'in_transit', 'funeral_home', 'chapel_service', 'crematory', 'ashes_received', 'cemetery_burial', 'shipped_released', 'completed']

const SYSTEM = `You turn what a funeral-home staff member said (English or Spanish) into proposed actions. You never act yourself.
Custody stages (use these exact ids): scene_first_call = at the scene / picked up; in_transit = on the way; funeral_home = arrived at the funeral home; chapel_service = chapel / service; crematory; ashes_received; cemetery_burial = cemetery / burial; shipped_released = shipped out or released to another party; completed = case finished.
Respond ONLY with JSON: {"actions":[...],"reply":"one short friendly sentence"}.
Each action is one of:
 {"type":"move_custody","caseId":"<id from the list>","stage":"<stage id>"}
 {"type":"add_note","caseId":"<id from the list>","body":"<the note, cleaned up, in the speaker's language>","special":true|false}   (special = true only if they said special request / put it on the TV board)
Rules: only use caseIds from the list. Match names loosely (accents, nicknames, last name only if it is unique). If a name is ambiguous or not in the list, do NOT guess: leave that action out and say who you could not identify in "reply". If you are unsure of the stage, leave the action out and ask in "reply". Never invent actions the person did not ask for. If nothing actionable was said, return {"actions":[],"reply":"..."}.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await req.json()
    const text = String(body.text ?? '').trim().slice(0, 2000)
    const cases = (Array.isArray(body.cases) ? body.cases : []).slice(0, 400) as { id: string; name: string; caseNumber: string; stage: string }[]
    if (!text) return json({ actions: [], reply: 'I did not hear anything.' })
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 700, system: SYSTEM,
        messages: [{ role: 'user', content: `Cases you may use:\n${cases.map((c) => `- ${c.id}: ${c.name} (${c.caseNumber}), now at ${c.stage}`).join('\n')}\n\nThey said: "${text}"` }],
      }),
    })
    if (!res.ok) return json({ error: 'The assistant is unavailable right now.' }, 502)
    const data = await res.json()
    const parsed = JSON.parse(String(data.content?.[0]?.text ?? '{}').replace(/```json\s*|```\s*/g, '').trim())
    const ids = new Set(cases.map((c) => c.id))
    const actions = (Array.isArray(parsed.actions) ? parsed.actions : []).filter((a: any) =>
      ids.has(a?.caseId) && ((a.type === 'move_custody' && STAGES.includes(a.stage)) || (a.type === 'add_note' && typeof a.body === 'string' && a.body.trim()))
    ).slice(0, 8).map((a: any) => a.type === 'move_custody'
      ? { type: 'move_custody', caseId: a.caseId, stage: a.stage }
      : { type: 'add_note', caseId: a.caseId, body: String(a.body).trim().slice(0, 1000), special: !!a.special })
    return json({ actions, reply: String(parsed.reply ?? '').slice(0, 300) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500)
  }
})
