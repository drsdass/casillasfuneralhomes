import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Voice dictation using the phone's own speech recognition (Chrome/Android and Safari/iOS).
 * Nothing is recorded or uploaded by Casillas OS — the browser turns speech into text, and only the text is kept.
 */
interface RecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null
}

const getCtor = (): (new () => RecognitionLike) | null => {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/** Adds a newly heard phrase to the text so far without repeating itself (some phones re-send everything said so far). */
export function appendChunk(prev: string, chunk: string): string {
  const p = prev.trim(), c = chunk.trim()
  if (!c) return p
  if (!p) return c
  const pl = p.toLowerCase(), cl = c.toLowerCase()
  if (cl === pl || pl.endsWith(cl)) return p          // already there
  if (cl.startsWith(pl)) return c                      // the phone sent the whole thing again, plus more
  if (pl.includes(cl) && cl.length > 12) return p       // an earlier part repeated
  // overlap: the end of what we have equals the start of the new phrase
  for (let n = Math.min(pl.length, cl.length) - 1; n >= 8; n--) {
    if (pl.endsWith(cl.slice(0, n))) return p + c.slice(n)
  }
  return p + ' ' + c
}

export function useDictation(lang: 'en-US' | 'es-US', onText: (finalText: string) => void, onStop?: () => void) {
  const supported = !!getCtor()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<RecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop

  const stop = useCallback(() => { recRef.current?.stop() }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) { setError('Dictation isn’t available in this browser — use the keyboard’s microphone key instead.'); return }
    setError(null)
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    let handled = 0 // results already passed on — some phones report the same result again
    rec.onresult = (e: any) => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) { if (i >= handled) { handled = i + 1; onTextRef.current(String(r[0].transcript).trim()) } }
        else partial += r[0].transcript
      }
      setInterim(partial)
    }
    rec.onerror = (e: any) => {
      setError(e?.error === 'not-allowed' ? 'Microphone is blocked — allow it for this site in the browser settings.' : e?.error === 'no-speech' ? null : 'Couldn’t hear that — try again.')
    }
    rec.onend = () => { setListening(false); setInterim(''); onStopRef.current?.() }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }, [lang])

  useEffect(() => () => { recRef.current?.stop() }, [])
  return { supported, listening, interim, error, start, stop }
}
