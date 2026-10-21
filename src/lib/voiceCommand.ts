import { USE_MOCK, supabase } from './supabase'
import { casesNamedIn, suggestStage } from './voiceNote'
import { CUSTODY_STAGE_LABELS, type CustodyStage, type FuneralCase } from '@/types'

export type VoiceAction =
  | { type: 'move_custody'; caseId: string; stage: CustodyStage }
  | { type: 'add_note'; caseId: string; body: string; special: boolean }

export interface VoiceResult { actions: VoiceAction[]; reply: string; smart: boolean }

/** Simple built-in reading of the words, used when the AI helper isn't reachable (and in the demo version). */
function localInterpret(text: string, cases: FuneralCase[]): VoiceResult {
  const named = casesNamedIn(text, cases)
  const stage = suggestStage(text)
  if (named.length !== 1) return { actions: [], reply: named.length ? 'I heard more than one name — please do them one at a time.' : 'I could not tell which file you mean — say the full name, or pick it below.', smart: false }
  if (!stage) return { actions: [], reply: 'I did not catch where to move them.', smart: false }
  return { actions: [{ type: 'move_custody', caseId: named[0].id, stage }], reply: '', smart: false }
}

export async function interpretVoice(text: string, cases: FuneralCase[]): Promise<VoiceResult> {
  if (USE_MOCK || !supabase) return localInterpret(text, cases)
  try {
    const { data, error } = await supabase.functions.invoke('voice-command', {
      body: { text, cases: cases.slice(0, 400).map((c) => ({ id: c.id, name: `${c.decedent.firstName} ${c.decedent.lastName}`, caseNumber: c.caseNumber, stage: c.custodyStage })) },
    })
    if (error || !data || data.error) return localInterpret(text, cases)
    return { actions: (data.actions ?? []) as VoiceAction[], reply: String(data.reply ?? ''), smart: true }
  } catch {
    return localInterpret(text, cases)
  }
}

export function describeAction(a: VoiceAction, cases: FuneralCase[]): string {
  const c = cases.find((x) => x.id === a.caseId)
  const name = c ? `${c.decedent.firstName} ${c.decedent.lastName}` : 'this case'
  return a.type === 'move_custody'
    ? `Move ${name} to ${CUSTODY_STAGE_LABELS[a.stage] ?? a.stage}`
    : `${a.special ? 'Special request' : 'Note'} for ${name}: “${a.body}”`
}

/** Says a short sentence out loud (best effort — some phones only allow it right after a tap). */
export function speak(text: string, lang: 'en' | 'es') {
  try {
    if (!('speechSynthesis' in window) || !text) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'es' ? 'es-US' : 'en-US'
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u)
  } catch { /* silent */ }
}
