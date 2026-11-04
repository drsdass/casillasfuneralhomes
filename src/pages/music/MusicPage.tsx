import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Lock, Unlock, Play, Pause, SkipBack, SkipForward, Volume2, Music2, X, Link2, Unlink, PauseCircle, Speaker, Copy, Check } from 'lucide-react'
import { sonos, isPlaying, type SonosGroup, type SonosPlayer } from '@/lib/sonos'
import { useSession } from '@/context/SessionContext'
import { useKeepAwake } from '@/lib/keepAwake'
import { Card } from '@/components/ui/Primitives'

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

function Slider({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [v, setV] = useState(value)
  const [drag, setDrag] = useState(false)
  useEffect(() => { if (!drag) setV(value) }, [value, drag])
  const done = () => { setDrag(false); onCommit(v) }
  return (
    <label className="flex items-center gap-3">
      <Volume2 size={20} className="shrink-0 text-slate-500" />
      <input type="range" min={0} max={100} value={v} aria-label={label}
        onChange={(e) => { setDrag(true); setV(+e.target.value) }} onPointerUp={done} onKeyUp={done} onTouchEnd={done}
        className="h-3 w-full accent-[#3b4a35]" />
      <span className="w-9 text-right text-sm tabular-nums text-slate-600">{v}</span>
    </label>
  )
}

export default function MusicPage() {
  useKeepAwake()
  const qc = useQueryClient()
  const { currentUser } = useSession()
  const isAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [picking, setPicking] = useState<SonosGroup | null>(null)
  const [err, setErr] = useState('')

  const { data: st, isLoading, error } = useQuery({ queryKey: ['sonos-state'], queryFn: sonos.state, refetchInterval: 4000, retry: 1 })
  const { data: favs = [], isLoading: favsLoading } = useQuery({ queryKey: ['sonos-favorites'], queryFn: sonos.favorites, enabled: !!picking, staleTime: 60000 })
  const refresh = () => qc.invalidateQueries({ queryKey: ['sonos-state'] })
  const run = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => { setErr(''); setTimeout(refresh, 400) }, onError: (e) => setErr(msg(e)) })
  const act = (f: () => Promise<unknown>) => run.mutate(f)

  const outcome = params.get('sonos')
  const players = st?.players ?? []
  const groups = st?.groups ?? []
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? ''
  const lockedIds = st?.locked ?? []
  const isLocked = (g: SonosGroup) => g.playerIds.some((id) => lockedIds.includes(id))
  const free = groups.filter((g) => !isLocked(g))
  const anyPlaying = free.some(isPlaying)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Music</h1>
          <p className="text-sm text-slate-500">Chapel, Chapel Hall and Casket Room speakers — play, pause, volume and playlists.</p>
        </div>
        {st?.connected && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!anyPlaying} onClick={() => act(async () => { for (const g of free.filter(isPlaying)) await sonos.pause(g.id) })}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-40"><PauseCircle size={20} /> Pause everything</button>
          </div>
        )}
      </div>

      {outcome && (
        <div className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${outcome === 'connected' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <span>{outcome === 'connected' ? 'Sonos is connected.' : outcome === 'denied' ? 'Sonos was not allowed — nothing changed.' : outcome === 'expired' ? 'That connect link timed out. Press Connect Sonos again.' : 'Could not connect Sonos.'}{params.get('why') ? ` Reason: ${params.get('why')}` : ' Try again, and check the setup steps.'}</span>
          <button type="button" aria-label="Dismiss" onClick={() => { params.delete('sonos'); setParams(params) }}><X size={16} /></button>
        </div>
      )}
      {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      {error && !st && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not reach the music service: {msg(error)}</div>}

      {isLoading && <div className="py-16 text-center text-slate-400">Looking for the speakers…</div>}

      {st && !st.connected && <ConnectCard isAdmin={isAdmin} />}

      {st?.connected && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms</span>
            <button type="button" disabled={free.length <= 1} onClick={() => { const lead = free.find(isPlaying) ?? free[0]; act(() => sonos.setGroup(lead.id, players.filter((p) => !lockedIds.includes(p.id)).map((p) => p.id))) }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Link2 size={15} /> Play in all rooms together{lockedIds.length ? ' (except locked)' : ''}</button>
            <button type="button" disabled={free.every((g) => g.playerIds.length <= 1)} onClick={() => act(async () => { for (const g of free) for (const id of g.playerIds.slice(1)) await sonos.separate(id) })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Unlink size={15} /> Separate rooms</button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <RoomCard key={g.id} g={g} players={players} nameOf={nameOf} locked={isLocked(g)} lockedIds={lockedIds} canLock={!!st?.canLock}
                onLock={(on) => act(() => sonos.lock(g.playerIds[0], on))}
                onPlayPause={() => act(() => (isPlaying(g) ? sonos.pause(g.id) : sonos.play(g.id)))}
                onNext={() => act(() => sonos.next(g.id))} onPrev={() => act(() => sonos.previous(g.id))}
                onVolume={(v) => act(() => sonos.groupVolume(g.id, v))}
                onPlayerVolume={(p, v) => act(() => sonos.playerVolume(p, v))}
                onPick={() => setPicking(g)}
                onToggleRoom={(p) => g.playerIds.includes(p.id)
                  ? (g.playerIds.length > 1 ? act(() => sonos.separate(p.id)) : undefined)
                  : act(() => sonos.setGroup(g.id, [...g.playerIds, p.id]))} />
            ))}
          </div>

          {isAdmin && (
            <div className="pt-2 text-right">
              <button type="button" onClick={() => { if (confirm('Disconnect Sonos from the OS? The speakers keep working in the Sonos app.')) { act(async () => { await sonos.disconnect(); await qc.invalidateQueries({ queryKey: ['sonos-state'] }) }) } }}
                className="text-xs text-slate-400 underline hover:text-slate-600">Disconnect Sonos</button>
            </div>
          )}
        </>
      )}

      {picking && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setPicking(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Play on {picking.name}</h2>
              <button type="button" aria-label="Close" onClick={() => setPicking(null)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500">These are the Favorites saved in the Sonos app. To add a playlist or station here, save it as a Favorite in the Sonos app once.</p>
            {favsLoading && <div className="py-8 text-center text-slate-400">Loading…</div>}
            {!favsLoading && favs.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No Favorites yet. In the Sonos app, open a playlist or station and tap the heart / “Add to Sonos Favorites”.</div>}
            <div className="grid gap-2 sm:grid-cols-2">
              {favs.map((f) => (
                <button key={f.id} type="button" onClick={() => { act(() => sonos.loadFavorite(picking.id, f.id)); setPicking(null) }}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-[#3b4a35]/60 hover:bg-slate-50">
                  {f.image ? <img src={f.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Music2 size={22} /></span>}
                  <span className="min-w-0"><span className="block truncate text-base font-semibold text-slate-900">{f.name}</span><span className="block truncate text-xs text-slate-500">{[f.service, f.description].filter(Boolean).join(' · ')}</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoomCard({ g, players, nameOf, locked, lockedIds, canLock, onLock, onPlayPause, onNext, onPrev, onVolume, onPlayerVolume, onPick, onToggleRoom }: {
  g: SonosGroup; players: SonosPlayer[]; nameOf: (id: string) => string; locked: boolean; lockedIds: string[]; canLock: boolean; onLock: (on: boolean) => void
  onPlayPause: () => void; onNext: () => void; onPrev: () => void; onVolume: (v: number) => void; onPlayerVolume: (id: string, v: number) => void
  onPick: () => void; onToggleRoom: (p: SonosPlayer) => void
}) {
  const playing = isPlaying(g)
  const members = g.playerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean) as SonosPlayer[]
  return (
    <Card className={`p-4 ${playing ? 'ring-2 ring-emerald-400/70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><Speaker size={20} className="shrink-0 text-[#3b4a35]" /><h2 className="truncate text-lg font-semibold text-slate-900">{g.name}</h2></div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${playing ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{playing ? 'Playing' : g.playbackState === 'PLAYBACK_STATE_PAUSED' ? 'Paused' : 'Stopped'}</span>
      </div>

      {locked && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex items-center gap-1.5"><Lock size={15} /> Locked — this room keeps playing. Staff can’t pause or change it.</span>
          {canLock && <button type="button" onClick={() => { if (confirm('Unlock this room so its music and volume can be changed?')) onLock(false) }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-amber-100"><Unlock size={13} /> Unlock</button>}
        </div>
      )}

      <div className="mt-3 flex min-h-[3.5rem] items-center gap-3">
        {g.track?.image ? <img src={g.track.image} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Music2 size={22} /></span>}
        <div className="min-w-0">
          <div className="truncate text-base font-medium text-slate-900">{g.track?.name ?? 'Nothing playing'}</div>
          <div className="truncate text-sm text-slate-500">{[g.track?.artist, g.track?.album].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      <fieldset disabled={locked} className={locked ? 'opacity-50' : ''}>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={onPrev} aria-label="Previous song" className="grid h-12 w-12 place-items-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"><SkipBack size={20} /></button>
        <button type="button" onClick={onPlayPause} aria-label={playing ? 'Pause' : 'Play'} className="grid h-16 w-16 place-items-center rounded-full bg-[#3b4a35] text-white shadow hover:bg-[#4d5f45]">{playing ? <Pause size={28} /> : <Play size={28} className="translate-x-0.5" />}</button>
        <button type="button" onClick={onNext} aria-label="Next song" className="grid h-12 w-12 place-items-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"><SkipForward size={20} /></button>
      </div>

      <div className="mt-3"><Slider value={g.volume ?? 0} onCommit={onVolume} label={`${g.name} volume`} /></div>
      {members.length > 1 && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {members.map((p) => <div key={p.id}><div className="text-xs text-slate-500">{p.name}</div><Slider value={p.volume ?? 0} onCommit={(v) => onPlayerVolume(p.id, v)} label={`${p.name} volume`} /></div>)}
        </div>
      )}

      <button type="button" onClick={onPick} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-800 hover:bg-slate-50">Choose music…</button>
      </fieldset>

      {!locked && canLock && g.playerIds.length === 1 && (
        <button type="button" onClick={() => onLock(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 underline hover:text-slate-800"><Lock size={12} /> Lock this room (keep its music and volume from being changed)</button>
      )}

      {!locked && players.length > 1 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Also playing in</div>
          <div className="flex flex-wrap gap-1.5">
            {players.map((p) => {
              const on = g.playerIds.includes(p.id)
              return (
                <button key={p.id} type="button" onClick={() => onToggleRoom(p)} aria-pressed={on} disabled={lockedIds.includes(p.id)} title={lockedIds.includes(p.id) ? 'Locked' : undefined}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-[#3b4a35] bg-[#3b4a35]/10 font-medium text-[#3b4a35]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'} disabled:opacity-40`}>
                  {on && <Check size={13} />}{nameOf(p.id) || p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

function ConnectCard({ isAdmin }: { isAdmin: boolean }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [e, setE] = useState('')
  const { data: info } = useQuery({ queryKey: ['sonos-redirect'], queryFn: sonos.redirectUri, enabled: isAdmin, retry: 0 })
  const connect = async () => {
    setBusy(true); setE('')
    try { const r = await sonos.connectUrl(); window.location.href = r.url } catch (x) { setE(msg(x)); setBusy(false) }
  }
  if (!isAdmin) return <Card className="p-6 text-center text-slate-600"><Music2 className="mx-auto mb-2 text-slate-300" size={32} />Music is not connected yet. Ask an Admin to open this page and press <b>Connect Sonos</b>.</Card>
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-3"><Speaker className="text-[#3b4a35]" size={28} /><div><h2 className="text-lg font-semibold text-slate-900">Connect Sonos</h2><p className="text-sm text-slate-500">One time only. After this the tablet (or any phone or computer) can run the music.</p></div></div>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Go to <b>developer.sonos.com</b>, click <b>Get Started</b>, sign in with the Sonos account the speakers belong to, open the integration manager (My Integrations), and choose <b>New control integration</b>. Name it “Casillas OS”.</li>
        <li>When it asks for a <b>Redirect URI</b>, paste this exact address:
          <div className="mt-1 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-mono text-xs break-all">
            <span className="min-w-0 flex-1">{info?.redirectUri ?? 'https://<your-project>.supabase.co/functions/v1/sonos-callback'}</span>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(info?.redirectUri ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }} className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-white" aria-label="Copy">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          </div>
        </li>
        <li>Sonos gives you a <b>Key</b> and a <b>Secret</b>. In Supabase → Edge Functions → Secrets add <code>SONOS_CLIENT_ID</code>, <code>SONOS_CLIENT_SECRET</code> and <code>APP_URL</code>.</li>
        <li>Press the button below, sign in to Sonos and tap <b>Allow</b>.</li>
      </ol>
      {info && !info.keysAdded && <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">The Sonos Key and Secret have not been added in Supabase yet (step 3).</div>}
      {e && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{e}</div>}
      <button type="button" onClick={connect} disabled={busy} className="rounded-lg bg-[#3b4a35] px-5 py-3 text-base font-semibold text-white hover:bg-[#4d5f45] disabled:opacity-50">{busy ? 'Opening Sonos…' : 'Connect Sonos'}</button>
    </Card>
  )
}
