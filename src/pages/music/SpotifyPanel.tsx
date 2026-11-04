import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Lock, Music2, Pause, Play, Search, SkipBack, SkipForward, Speaker, X } from 'lucide-react'
import { spotify, type SpotifyPlaylist } from '@/lib/spotify'
import { Card } from '@/components/ui/Primitives'

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
const GREEN = '#1db954'

/** Spotify (Premium) — pick a playlist, pick a room. Sits under the Sonos rooms on the Music page. */
export default function SpotifyPanel({ isAdmin, roomNames = [], groupNames = [] }: { isAdmin: boolean; roomNames?: string[]; groupNames?: string[] }) {
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')

  const { data: st, isLoading, error } = useQuery({ queryKey: ['spotify-state'], queryFn: spotify.state, refetchInterval: 5000, retry: 1 })
  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['spotify-playlists', term], enabled: !!st?.connected, staleTime: 60000,
    queryFn: () => (term ? spotify.search(term) : spotify.playlists()),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['spotify-state'] })
  const run = useMutation({ mutationFn: (f: () => Promise<unknown>) => f(), onSuccess: () => { setErr(''); setTimeout(refresh, 600) }, onError: (e) => setErr(msg(e)) })
  const act = (f: () => Promise<unknown>) => run.mutate(f)

  if (isLoading) return null
  if (error && !st) return <Card className="p-4 text-sm text-slate-500">Spotify: {msg(error)}</Card>
  if (st && !st.connected) return <SpotifyConnect isAdmin={isAdmin} />
  if (!st) return null

  const locked = (name: string) => st.lockedNames.some((n) => n.toLowerCase() === name.toLowerCase())
  const dev = st.devices.find((d) => d.id === st.deviceId) ?? st.devices.find((d) => d.active)
  const playing = st.playing && !!dev
  const pickId = st.devices.some((d) => d.id === target && !locked(d.name)) ? target : (st.devices.find((d) => d.id === st.deviceId && !locked(d.name)) ?? st.devices.find((d) => !locked(d.name)))?.id ?? ''
  const pickDev = st.devices.find((d) => d.id === pickId)
  const known = [...roomNames, ...groupNames].map((n) => n.toLowerCase())   // a grouped pair shows up in Spotify under the group name, e.g. "Chapel + 1"
  const isRoom = (n: string) => known.includes(n.toLowerCase())
  const covered = (r: string) => st.devices.some((d) => d.name.toLowerCase() === r.toLowerCase() || (d.name.toLowerCase().startsWith(r.toLowerCase() + ' +') ) || groupNames.some((g) => g.toLowerCase() === d.name.toLowerCase() && g.toLowerCase().includes(r.toLowerCase())))
  const missing = roomNames.filter((r) => !covered(r))
  const playIt = (p: SpotifyPlaylist) => { if (!pickDev) return; setNote(`Starting “${p.name}” in ${pickDev.name}…`); act(() => spotify.play(pickDev.id, p.uri, p.name)); setTimeout(() => setNote(''), 4000) }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: GREEN }}><Music2 size={17} /></span>
          <div><h2 className="text-lg font-semibold text-slate-900">Spotify</h2><p className="text-xs text-slate-500">Signed in as {st.user ?? 'the house account'}.</p></div>
        </div>
        {isAdmin && <button type="button" onClick={() => { if (confirm('Disconnect Spotify from the OS?')) act(async () => { await spotify.disconnect(); await qc.invalidateQueries({ queryKey: ['spotify-state'] }) }) }} className="text-xs text-slate-400 underline hover:text-slate-600">Disconnect Spotify</button>}
      </div>
      {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      {/* now playing */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-3">
        {st.track?.image ? <img src={st.track.image} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-200 text-slate-400"><Music2 size={22} /></span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-slate-900">{st.track?.name ?? 'Nothing playing'}</div>
          <div className="truncate text-sm text-slate-500">{[st.track?.artist, dev ? `in ${dev.name}` : ''].filter(Boolean).join(' · ')}</div>
        </div>
        {dev && !locked(dev.name) && (
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous" onClick={() => act(() => spotify.previous(dev.id))} className="grid h-11 w-11 place-items-center rounded-full border border-slate-300 hover:bg-white"><SkipBack size={18} /></button>
            <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => act(() => (playing ? spotify.pause(dev.id) : spotify.play(dev.id, '')))} className="grid h-14 w-14 place-items-center rounded-full text-white shadow" style={{ background: GREEN }}>{playing ? <Pause size={24} /> : <Play size={24} className="translate-x-0.5" />}</button>
            <button type="button" aria-label="Next" onClick={() => act(() => spotify.next(dev.id))} className="grid h-11 w-11 place-items-center rounded-full border border-slate-300 hover:bg-white"><SkipForward size={18} /></button>
          </div>
        )}
        {dev && locked(dev.name) && <span className="flex items-center gap-1.5 text-sm text-amber-800"><Lock size={14} /> {dev.name} is locked</span>}
      </div>

      {/* where to play */}
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">1. Play in which room?</div>
        <div className="flex flex-wrap gap-2">
          {st.devices.map((d) => {
            const on = d.id === pickId, lk = locked(d.name)
            return (
              <button key={d.id} type="button" disabled={lk} onClick={() => setTarget(d.id)} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium ${on ? 'border-[#1db954] bg-[#1db954]/10 text-emerald-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'} disabled:opacity-40`}>
                {lk ? <Lock size={13} /> : on ? <Check size={14} /> : <Speaker size={14} />}{d.name}{isRoom(d.name) || /\+ \d+$/.test(d.name) ? '' : ' (not a room)'}
              </button>
            )
          })}
        </div>
        {missing.length > 0 && (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {missing.join(', ')} {missing.length > 1 ? 'don’t' : 'doesn’t'} show up as {missing.length > 1 ? 'Spotify speakers' : 'a Spotify speaker'} yet. In the Sonos app tap your profile icon → Account → Content Services → Add a service → Spotify (sign in with the same Spotify account), then play any Spotify song on each speaker once. Until then, use <b>Choose music…</b> on a room card (Sonos Favorites) for those rooms.
          </div>
        )}
      </div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Tap a playlist{pickDev ? ` — it plays in ${pickDev.name}` : ''}</div>
      {note && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</div>}

      {/* search + playlists */}
      <form onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }} className="flex gap-2">
        <label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setTerm('') }} placeholder="Search Spotify playlists (e.g. “Ave Maria”, “hymns”, “mariachi suave”)" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm" /></label>
        <button type="submit" className="rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700">Search</button>
      </form>
      {listsLoading && <div className="py-6 text-center text-sm text-slate-400">Loading playlists…</div>}
      {!listsLoading && lists.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{term ? 'No playlists found.' : 'No playlists in this Spotify account yet — save a few in Spotify, or use the search above.'}</div>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((p) => (
          <button key={p.uri} type="button" onClick={() => playIt(p)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-[#1db954]/70 hover:bg-slate-50">
            {p.image ? <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400"><Music2 size={22} /></span>}
            <span className="min-w-0"><span className="block truncate text-base font-semibold text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{[p.owner, p.tracks ? `${p.tracks} songs` : ''].filter(Boolean).join(' · ')}</span></span>
          </button>
        ))}
      </div>

    </Card>
  )
}

function SpotifyConnect({ isAdmin }: { isAdmin: boolean }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [e, setE] = useState('')
  const { data: info } = useQuery({ queryKey: ['spotify-redirect'], queryFn: spotify.redirectUri, enabled: isAdmin, retry: 0 })
  const connect = async () => { setBusy(true); setE(''); try { window.location.href = (await spotify.connectUrl()).url } catch (x) { setE(msg(x)); setBusy(false) } }
  if (!isAdmin) return <Card className="p-5 text-sm text-slate-600"><b>Spotify</b> is not connected yet. Ask an Admin to open this page and press <b>Connect Spotify</b>.</Card>
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ background: GREEN }}><Music2 size={20} /></span><div><h2 className="text-lg font-semibold text-slate-900">Connect Spotify</h2><p className="text-sm text-slate-500">One time only — use the Spotify Premium account the funeral home plays music from.</p></div></div>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Open <b>developer.spotify.com/dashboard</b>, log in with that Spotify account, and press <b>Create app</b>. Name it “Casillas OS”. Under “APIs used” tick <b>Web API</b>.</li>
        <li>For <b>Redirect URI</b> paste this exact address, then Save:
          <div className="mt-1 flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-mono text-xs break-all">
            <span className="min-w-0 flex-1">{info?.redirectUri ?? 'https://<your-project>.supabase.co/functions/v1/spotify-callback'}</span>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(info?.redirectUri ?? '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }} className="shrink-0 rounded p-1.5 text-slate-500 hover:bg-white" aria-label="Copy">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          </div></li>
        <li>In the app’s <b>Settings</b>, copy the <b>Client ID</b> and <b>Client secret</b> into Supabase → Edge Functions → Secrets as <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> (never paste them in a chat).</li>
        <li>In the app’s <b>User Management</b>, add the Spotify account’s name and email. Then press the button below and tap <b>Agree</b>.</li>
      </ol>
      {info && !info.keysAdded && <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">The Spotify Client ID and Secret have not been added in Supabase yet (step 3).</div>}
      {e && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{e}</div>}
      <button type="button" onClick={connect} disabled={busy} className="rounded-lg px-5 py-3 text-base font-semibold text-white disabled:opacity-50" style={{ background: GREEN }}>{busy ? 'Opening Spotify…' : 'Connect Spotify'}</button>
    </Card>
  )
}
