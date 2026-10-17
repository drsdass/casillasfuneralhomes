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

export function useDictation(lang: 'en-US' | 'es-US', onText: (finalText: string) => void) {
  const supported = !!getCtor()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<RecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stop = useCallback(() => { recRef.current?.stop() }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) { setError('Dictation isn’t available in this browser — use the keyboard’s microphone key instead.'); return }
    setError(null)
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e: any) => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) onTextRef.current(String(r[0].transcript).trim())
        else partial += r[0].transcript
      }
      setInterim(partial)
    }
    rec.onerror = (e: any) => {
      setError(e?.error === 'not-allowed' ? 'Microphone is blocked — allow it for this site in the browser settings.' : e?.error === 'no-speech' ? null : 'Couldn’t hear that — try again.')
    }
    rec.onend = () => { setListening(false); setInterim('') }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }, [lang])

  useEffect(() => () => { recRef.current?.stop() }, [])
  return { supported, listening, interim, error, start, stop }
}
