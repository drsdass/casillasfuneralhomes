import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { av } from '@/lib/av'

/** Public page a family shares so people anywhere can watch the service. No login. */
export default function WatchPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<{ name: string; location: string; streamAllowed: boolean; live: boolean; playerUrl: string | null; replayUrl: string | null } | null>(null)
  const [needPin, setNeedPin] = useState(false)
  const [wrongPin, setWrongPin] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p?: string) => {
    try {
      const r = await av.publicCall({ kind: 'watch', token, pin: p ?? (sessionStorageGet('pin') || undefined) })
      if (r.needPin) { setNeedPin(true); setWrongPin(!!r.wrongPin); return }
      setNeedPin(false); setData(r); setError(null)
    } catch (e) { setError((e as Error).message) }
  }, [token])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (needPin || error) return
    const t = setInterval(() => load(pin || undefined), 10000)
    return () => clearInterval(t)
  }, [load, needPin, error, pin])

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl">{children}</div>
    </div>
  )

  if (error) return shell(<p className="text-center text-slate-600 mt-20">{error}</p>)
  if (needPin) return shell(
    <form className="max-w-xs mx-auto mt-20 space-y-3 text-center" onSubmit={(e) => { e.preventDefault(); sessionStoragePut('pin', pin); load(pin) }}>
      <p className="text-slate-700">Please enter the PIN you were given.</p>
      <input className="w-full border border-slate-300 rounded-md px-3 py-3 text-center text-lg" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
      {wrongPin && <p className="text-sm text-red-600">That PIN didn’t match.</p>}
      <button className="w-full rounded-md bg-slate-900 text-white py-3">Continue</button>
    </form>)
  if (!data) return shell(<p className="text-center text-slate-400 mt-20">Loading…</p>)

  return shell(
    <>
      <div className="text-center mb-5">
        <p className="text-sm text-slate-500">Service for</p>
        <h1 className="text-2xl font-semibold text-slate-900">{data.name}</h1>
        {data.location && <p className="text-sm text-slate-500 mt-1">{data.location}</p>}
      </div>
      {!data.streamAllowed ? (
        <p className="text-center text-slate-600 py-16">The family has chosen not to share a live broadcast of this service.</p>
      ) : data.live && data.playerUrl ? (
        <div className="aspect-video w-full rounded-lg overflow-hidden bg-black shadow">
          <iframe src={data.playerUrl} title="Live service" className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <div className="text-center py-16 text-slate-600 space-y-2">
          <p className="text-lg">The service has not started yet.</p>
          <p className="text-sm text-slate-500">Keep this page open. It will start by itself when the service begins.</p>
        </div>
      )}
      {data.replayUrl && !data.live && (
        <p className="text-center mt-6"><a className="text-slate-800 underline" href={data.replayUrl} target="_blank" rel="noreferrer">Watch the recording</a></p>
      )}
    </>)
}

function sessionStorageGet(k: string) { try { return sessionStorage.getItem('av_' + k) } catch { return null } }
function sessionStoragePut(k: string, v: string) { try { sessionStorage.setItem('av_' + k, v) } catch { /* ignore */ } }
