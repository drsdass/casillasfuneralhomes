import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { av, SCENE_LABELS, type Scene } from '@/lib/av'
import { Play, Pause, SkipForward, Square, Volume2 } from 'lucide-react'

interface RemoteData {
  name: string; location: string; canMusic: boolean; canCameras: boolean; scenes: Scene[]; tracks: string[]
  state: { live: boolean; currentScene: Scene | null; musicState: 'playing' | 'paused' | 'stopped'; nowPlaying: string | null; volume: number }
}

/** Phone-friendly remote a family member can use for the music (and, if staff allow, camera views). No login. */
export default function RemotePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<RemoteData | null>(null)
  const [needPin, setNeedPin] = useState(false)
  const [wrongPin, setWrongPin] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async (p?: string) => {
    try {
      const r = await av.publicCall({ kind: 'remote', token, pin: p || undefined })
      if (r.needPin) { setNeedPin(true); setWrongPin(!!r.wrongPin); return }
      setNeedPin(false); setData(r); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [token])

  useEffect(() => { load(pin || undefined) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (needPin || error) return
    const t = setInterval(() => load(pin || undefined), 4000)
    return () => clearInterval(t)
  }, [load, needPin, error, pin])

  async function press(kind: string, payload: Record<string, unknown> = {}) {
    try {
      await av.publicCall({ kind: 'remote', token, pin: pin || undefined, command: { kind, payload } })
      setMsg('Sent'); setTimeout(() => setMsg(null), 1200)
    } catch (e) { setMsg((e as Error).message) }
  }

  const shell = (c: React.ReactNode) => <div className="min-h-screen bg-stone-50 px-4 py-8 flex justify-center"><div className="w-full max-w-sm">{c}</div></div>
  const big = 'flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-4 text-base font-medium text-slate-800 active:bg-slate-100'

  if (error) return shell(<p className="text-center text-slate-600 mt-20">{error}</p>)
  if (needPin) return shell(
    <form className="mt-20 space-y-3 text-center" onSubmit={(e) => { e.preventDefault(); load(pin) }}>
      <p className="text-slate-700">Please enter the PIN you were given.</p>
      <input className="w-full border border-slate-300 rounded-md px-3 py-3 text-center text-lg" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
      {wrongPin && <p className="text-sm text-red-600">That PIN didn’t match.</p>}
      <button className="w-full rounded-md bg-slate-900 text-white py-3">Continue</button>
    </form>)
  if (!data) return shell(<p className="text-center text-slate-400 mt-20">Loading…</p>)

  const s = data.state
  return shell(
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-sm text-slate-500">Music for the service of</p>
        <h1 className="text-xl font-semibold text-slate-900">{data.name}</h1>
      </div>

      {data.canMusic && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500">{s.musicState === 'stopped' ? 'Stopped' : s.musicState === 'playing' ? 'Now playing' : 'Paused'}</p>
            <p className="text-base text-slate-900 min-h-6">{s.nowPlaying ?? '—'}</p>
          </div>
          <div className="flex gap-2">
            <button className={big} onClick={() => press('music_play')}><Play size={18} /> Play</button>
            <button className={big} onClick={() => press('music_pause')}><Pause size={18} /></button>
            <button className={big} onClick={() => press('music_next')}><SkipForward size={18} /></button>
            <button className={big} onClick={() => press('music_stop')}><Square size={18} /></button>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-2"><Volume2 size={16} /> Volume</div>
            <input type="range" min={0} max={100} defaultValue={s.volume} className="w-full h-8"
              onMouseUp={(e) => press('volume', { volume: Number(e.currentTarget.value) })}
              onTouchEnd={(e) => press('volume', { volume: Number(e.currentTarget.value) })} />
          </div>
          {data.tracks.length > 0 && (
            <ol className="text-sm text-slate-600 list-decimal pl-6 space-y-0.5">{data.tracks.map((t, i) => <li key={i}>{t}</li>)}</ol>
          )}
        </div>
      )}

      {data.canCameras && (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Camera view {s.live ? '(live now)' : ''}</p>
          <div className="grid grid-cols-2 gap-2">
            {data.scenes.map((sc) => (
              <button key={sc} className={`rounded-xl border py-4 text-sm font-medium ${s.currentScene === sc ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-800'}`}
                onClick={() => press('scene', { scene: sc })}>{SCENE_LABELS[sc]}</button>
            ))}
          </div>
        </div>
      )}
      <p className="text-center text-sm text-slate-500 h-5">{msg}</p>
    </div>)
}
