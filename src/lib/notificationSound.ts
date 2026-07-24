// A short, pleasant two-tone chime, synthesized directly rather than
// loading an audio file — one less asset to host, and it sounds clean at
// any volume. Preference is per-browser (localStorage), not per-account:
// this is about whether *this computer's speakers* should make noise,
// which is naturally a per-device choice, not something that should
// follow you to a different computer.

const STORAGE_KEY = 'casillas_os_message_sound_enabled'

export function isMessageSoundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'off' // on by default
}

export function setMessageSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
}

let audioCtx: AudioContext | null = null

export function playMessageChime(): void {
  if (!isMessageSoundEnabled()) return
  try {
    // Browsers block audio until the page has had some user interaction —
    // by the time someone's logged in and using the app, that's already
    // happened, so this reliably works in practice.
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const now = audioCtx.currentTime

    const playTone = (freq: number, start: number, duration: number, gain: number) => {
      const osc = audioCtx!.createOscillator()
      const g = audioCtx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0, now + start)
      g.gain.linearRampToValueAtTime(gain, now + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, now + start + duration)
      osc.connect(g)
      g.connect(audioCtx!.destination)
      osc.start(now + start)
      osc.stop(now + start + duration)
    }

    // A soft major third — C6 then E6 — brief and pleasant, not jarring.
    playTone(1046.5, 0, 0.18, 0.12)
    playTone(1318.5, 0.08, 0.22, 0.12)
  } catch {
    // Audio can fail for all sorts of browser-permission reasons — never
    // let a chime failure disrupt the actual notification.
  }
}
