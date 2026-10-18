import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { av, SCENE_LABELS, type Scene, type ServiceAv } from '@/lib/av'
import { useSession } from '@/context/SessionContext'
import { atLeast } from '@/lib/permissions'
import { Card } from '@/components/ui/Primitives'
import { ArrowLeft, Play, Pause, SkipForward, Square, Radio, Copy, Check, Music, Video, Wifi, WifiOff, ShieldCheck } from 'lucide-react'

const btn = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'
const input = 'w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm'

function CopyLink({ label, path }: { label: string; path: string }) {
  const [done, setDone] = useState(false)
  const url = `${window.location.origin}${path}`
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={url} className={`${input} text-xs`} onFocus={(e) => e.currentTarget.select()} />
        <button className={btn} onClick={() => { navigator.clipboard?.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500) }}>
          {done ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-1.5 cursor-pointer">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="text-sm text-slate-800">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  )
}

export default function ServiceRoom() {
  const { caseId } = useParams<{ caseId: string }>()
  const { currentUser } = useSession()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })
  const { data: svc } = useQuery({
    queryKey: ['service-av', caseId], queryFn: () => av.getService(caseId!), enabled: !!caseId && av.available, refetchInterval: 3000,
  })
  const { data: status } = useQuery({
    queryKey: ['av-status', c?.locationId], queryFn: () => av.locationStatus(c!.locationId), enabled: !!c && av.available, refetchInterval: 5000,
  })
  const { data: docs = [] } = useQuery({ queryKey: ['case-documents', caseId], queryFn: () => api.getCaseDocuments(caseId!), enabled: !!caseId })
  const { data: commands = [] } = useQuery({
    queryKey: ['av-commands', caseId], queryFn: () => av.recentCommands(caseId!), enabled: !!caseId && av.available, refetchInterval: 3000,
  })
  const isAdmin = !!currentUser && atLeast(currentUser.role, 'admin')
  const { data: setup } = useQuery({
    queryKey: ['av-setup', c?.locationId], queryFn: () => av.getLocationSetup(c!.locationId), enabled: !!c && av.available && isAdmin,
  })
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const save = useMutation({
    mutationFn: (patch: Partial<ServiceAv>) => av.updateSettings(caseId!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-av', caseId] }),
    onError: (e) => setError((e as Error).message),
  })
  const send = useMutation({
    mutationFn: (v: { kind: string; payload?: Record<string, unknown> }) => av.send(caseId!, c!.locationId, v.kind, v.payload ?? {}),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['av-commands', caseId] }) },
    onError: (e) => setError((e as Error).message),
  })

  if (!av.available) {
    return <Card className="p-6 text-sm text-slate-600">The Service Room controls real chapel equipment, so it only works when the OS is connected to the live database.</Card>
  }
  if (!c || !svc) return <div className="text-sm text-slate-400">Loading…</div>

  const music = docs.filter((d) => d.category === 'music')
  const scenes = (['speaker', 'front', 'audience', 'slate'] as Scene[]).filter(
    (s) => !(s === 'front' && !svc.showCasket) && !(s === 'audience' && !svc.showAudience))
  const rooms = status?.bridgeInfo?.rooms ?? []
  const name = `${c.decedent.firstName} ${c.decedent.lastName}`

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to={`/cases/${c.id}`} className="text-slate-500 hover:text-slate-800"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Service Room — {name}</h1>
          <p className="text-xs text-slate-500">Music and live stream for the chapel</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 ${status?.bridgeOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {status?.bridgeOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {status?.bridgeOnline ? 'Chapel computer online' : 'Chapel computer offline'}
        </span>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{error}</div>}
      {!status?.bridgeOnline && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
          Buttons are saved and will run as soon as the chapel computer comes online. Nothing happens in the chapel until then.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---------- Live stream ---------- */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium text-slate-900"><Video size={16} /> Live stream</div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${svc.live ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
            {svc.live ? 'LIVE now' : 'Not streaming'}
            {svc.live && svc.currentScene && <span className="text-slate-500">· showing {SCENE_LABELS[svc.currentScene]}</span>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!svc.live
              ? <button className={`${btn} bg-red-600 text-white border-red-600 hover:bg-red-700`} disabled={!svc.streamAllowed || send.isPending} onClick={() => send.mutate({ kind: 'stream_start' })}><Radio size={14} /> Go live</button>
              : <button className={btn} disabled={send.isPending} onClick={() => send.mutate({ kind: 'stream_stop' })}><Square size={14} /> End stream</button>}
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Camera view</div>
            <div className="grid grid-cols-2 gap-2">
              {scenes.map((s) => (
                <button key={s} className={`${btn} ${svc.currentScene === s ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-900' : ''}`}
                  onClick={() => send.mutate({ kind: 'scene', payload: { scene: s } })}>{SCENE_LABELS[s]}</button>
              ))}
            </div>
            {(!svc.showCasket || !svc.showAudience) && (
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><ShieldCheck size={12} /> Hidden for this family: {[!svc.showCasket && 'casket & altar view', !svc.showAudience && 'audience view'].filter(Boolean).join(', ')}. These cannot be selected.</p>
            )}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-medium text-slate-500 mb-1">What the family allows</div>
            <Toggle label="Allow a live stream for this family" checked={svc.streamAllowed} onChange={(v) => save.mutate({ streamAllowed: v })} />
            <Toggle label="Show the casket and altar (front camera)" checked={svc.showCasket} onChange={(v) => save.mutate({ showCasket: v })} />
            <Toggle label="Show the audience" checked={svc.showAudience} onChange={(v) => save.mutate({ showAudience: v })} />
            <Toggle label="Record the service for replay" checked={svc.recordService} onChange={(v) => save.mutate({ recordService: v })} />
          </div>
        </Card>

        {/* ---------- Music ---------- */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium text-slate-900"><Music size={16} /> Music</div>
          <div className="text-sm text-slate-600">
            {svc.musicState === 'stopped' ? 'Stopped' : <><span className="font-medium">{svc.musicState === 'playing' ? 'Playing' : 'Paused'}</span>{svc.nowPlaying ? ` · ${svc.nowPlaying}` : ''}</>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={btn} disabled={music.length === 0} onClick={() => send.mutate({ kind: 'music_play', payload: { room: svc.musicRoom || null } })}><Play size={14} /> Play playlist</button>
            <button className={btn} onClick={() => send.mutate({ kind: 'music_pause' })}><Pause size={14} /></button>
            <button className={btn} onClick={() => send.mutate({ kind: 'music_resume' })}><Play size={14} /> Resume</button>
            <button className={btn} onClick={() => send.mutate({ kind: 'music_next' })}><SkipForward size={14} /></button>
            <button className={btn} onClick={() => send.mutate({ kind: 'music_stop' })}><Square size={14} /></button>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Volume {svc.volume}</div>
            <input type="range" min={0} max={100} defaultValue={svc.volume} className="w-full"
              onMouseUp={(e) => send.mutate({ kind: 'volume', payload: { volume: Number(e.currentTarget.value) } })}
              onTouchEnd={(e) => send.mutate({ kind: 'volume', payload: { volume: Number(e.currentTarget.value) } })} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Speaker room</div>
            <select className={input} value={svc.musicRoom} onChange={(e) => save.mutate({ musicRoom: e.target.value })}>
              <option value="">All speakers</option>
              {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
              {svc.musicRoom && !rooms.includes(svc.musicRoom) && <option value={svc.musicRoom}>{svc.musicRoom}</option>}
            </select>
            {rooms.length === 0 && <p className="text-xs text-slate-500 mt-1">No speakers found yet. They appear when the chapel computer is online.</p>}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-medium text-slate-500 mb-1">Playlist ({music.length} {music.length === 1 ? 'song' : 'songs'})</div>
            {music.length === 0
              ? <p className="text-xs text-slate-500">No music yet. Add songs under this case’s documents (category “music”) or ask the family to upload them in their portal.</p>
              : <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-0.5">{music.map((m) => <li key={m.id}>{m.name}</li>)}</ol>}
          </div>
        </Card>
      </div>

      {/* ---------- Family links ---------- */}
      <Card className="p-4 space-y-3">
        <div className="font-medium text-slate-900">Links for the family</div>
        <CopyLink label="Watch link — send to everyone who wants to watch" path={`/watch/${svc.watchToken}`} />
        <Toggle label="Let a family member control the music from their phone" hint="They get a separate private link. They can never start or stop the stream."
          checked={svc.remoteEnabled} onChange={(v) => save.mutate({ remoteEnabled: v })} />
        {svc.remoteEnabled && (
          <div className="pl-7 space-y-2">
            <CopyLink label="Remote link — only for the family member running the music" path={`/remote/${svc.remoteToken}`} />
            <Toggle label="Remote can control music" checked={svc.remoteMusic} onChange={(v) => save.mutate({ remoteMusic: v })} />
            <Toggle label="Remote can also switch camera views" hint="Only views the family allowed above are ever offered." checked={svc.remoteCameras} onChange={(v) => save.mutate({ remoteCameras: v })} />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-slate-500">PIN (optional)
            <input className={input} defaultValue={svc.pin} placeholder="e.g. 4821" onBlur={(e) => e.target.value !== svc.pin && save.mutate({ pin: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">Links stop working after
            <input type="date" className={input} defaultValue={svc.linkExpiresAt?.slice(0, 10) ?? ''}
              onBlur={(e) => save.mutate({ linkExpiresAt: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : (null as unknown as string) })} />
          </label>
          <label className="text-xs text-slate-500">Replay link (after the service)
            <input className={input} defaultValue={svc.replayUrl} placeholder="https://…" onBlur={(e) => e.target.value !== svc.replayUrl && save.mutate({ replayUrl: e.target.value })} />
          </label>
        </div>
        <button className="text-xs text-slate-500 underline" onClick={async () => {
          if (confirm('Make new links? The old ones will stop working.')) { await av.resetLinks(caseId!); qc.invalidateQueries({ queryKey: ['service-av', caseId] }) }
        }}>Make new links (old ones stop working)</button>
      </Card>

      {commands.length > 0 && (
        <Card className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Recent button presses</div>
          <ul className="text-xs text-slate-600 space-y-1">
            {commands.map((m: { id: number; kind: string; status: string; error: string | null; requested_by: string; payload: { scene?: string } }) => (
              <li key={m.id} className="flex gap-2">
                <span className={m.status === 'done' ? 'text-emerald-600' : m.status === 'failed' ? 'text-red-600' : 'text-slate-400'}>●</span>
                <span>{m.kind.replace('_', ' ')}{m.payload?.scene ? ` → ${m.payload.scene}` : ''} · {m.requested_by} · {m.status}{m.error ? ` — ${m.error}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-4 space-y-3">
          <div className="font-medium text-slate-900">Chapel setup (admins) <span className="text-xs font-normal text-slate-500">— same for every service at this location</span></div>
          <label className="text-xs text-slate-500 block">Live player address (embed URL from Cloudflare Stream / Mux / Vimeo)
            <input className={input} value={playerUrl ?? setup?.playerEmbedUrl ?? ''} onChange={(e) => setPlayerUrl(e.target.value)} placeholder="https://…" />
          </label>
          <div className="flex gap-2 items-center flex-wrap">
            <button className={btn} onClick={async () => { await av.saveLocationSetup(c.locationId, playerUrl ?? setup?.playerEmbedUrl ?? ''); qc.invalidateQueries({ queryKey: ['av-setup'] }); qc.invalidateQueries({ queryKey: ['av-status'] }) }}>Save</button>
            <button className="text-xs text-slate-500 underline" onClick={async () => {
              if (!setup) await av.saveLocationSetup(c.locationId, '')
              await qc.invalidateQueries({ queryKey: ['av-setup'] }); setShowKey((v) => !v)
            }}>{showKey ? 'Hide' : 'Show'} the key for the chapel computer</button>
          </div>
          {showKey && setup && <code className="block text-xs break-all bg-slate-50 border border-slate-200 rounded p-2 select-all">{setup.bridgeKey}</code>}
        </Card>
      )}
    </div>
  )
}
