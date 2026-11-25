import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Film, Image as ImageIcon, ListPlus, Monitor, MonitorPlay, Music2, Pause, Play, Plus, SkipBack, SkipForward, Square, Trash2, Upload, X, Link2, RotateCcw, RotateCw, ExternalLink } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { Card } from '@/components/ui/Primitives'
import { chapelPlayer, houseMedia, recentFamilyFiles, toItem, youtubeId, type HouseItem, type PlayerItem } from '@/lib/chapelPlayer'

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
const Kind = ({ k, size = 18 }: { k: PlayerItem['kind']; size?: number }) => (k === 'video' ? <Film size={size} /> : k === 'image' ? <ImageIcon size={size} /> : <Music2 size={size} />)
const clock = (s = 0) => { const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

/** The remote for the chapel TV. Whatever is chosen here plays on the laptop that feeds the chapel TV (the "Chapel Player" page). */
export default function ChapelTvPage() {
  const { activeOrg, currentUser } = useSession()
  const orgId = activeOrg?.id ?? ''
  const by = currentUser?.name
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const { data: st } = useQuery({ queryKey: ['chapel-player', orgId], queryFn: () => chapelPlayer.state(orgId), enabled: !!orgId, refetchInterval: 2500 })
  useEffect(() => (orgId ? chapelPlayer.subscribe(orgId, () => qc.invalidateQueries({ queryKey: ['chapel-player', orgId] })) : undefined), [orgId, qc])
  const [, force] = useState(0)
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 5000); return () => clearInterval(t) }, [])

  const run = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['chapel-player', orgId] }) },
    onError: (e) => setErr(msg(e)),
  })
  const act = (fn: () => Promise<void>) => run.mutate(fn)

  const queue = st?.queue ?? []
  const idx = st?.idx ?? 0
  const cur = queue[idx]
  const playing = !!st?.playing && !!cur
  const alive = !!st?.heartbeat && Date.now() - new Date(st.heartbeat).getTime() < 20000
  const status = alive ? st?.status : null
  const pct = status?.dur ? Math.min(100, ((status.pos ?? 0) / status.dur) * 100) : 0
  const playerUrl = `${window.location.origin}/player`

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><Monitor size={24} className="text-[#3b4a35]" /> Chapel TV</h1>
        <p className="text-sm text-slate-500">Choose a video, song or pictures here. It plays on the chapel TV, and the sound comes out of the Sonos speakers.</p>
      </div>

      {!alive && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">The Chapel Player is not open on the laptop.</div>
            <div>On the laptop, open <a href={playerUrl} target="_blank" rel="noreferrer" className="font-medium underline">{playerUrl}</a>, move it to the screen that goes to the chapel TV, and press <b>Start</b>. You can still build the list here — it begins playing when the laptop is ready.</div>
          </div>
        </div>
      )}
      {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className={`h-2.5 w-2.5 rounded-full ${alive ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {alive ? 'Laptop connected' : 'Laptop not connected'}
              {alive && playing && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">On the TV now</span>}
            </div>
            <div className="mt-1 truncate text-xl font-semibold text-slate-900">{cur ? cur.title : queue.length ? 'End of list' : 'Nothing queued'}</div>
            {status?.error && <div className="mt-1 text-sm font-medium text-red-600">{status.error} It will skip to the next one.</div>}
          </div>
          <a href={playerUrl} target="_blank" rel="noreferrer" className="hidden items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 sm:inline-flex"><ExternalLink size={14} /> Player page</a>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#3b4a35] transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-500"><span>{clock(status?.pos)}</span><span>{status?.dur ? clock(status.dur) : ''}</span></div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <Round label="Back 30 seconds" onClick={() => act(() => chapelPlayer.seek(orgId, -30))} disabled={!cur}><RotateCcw size={20} /></Round>
          <Round label="Previous" onClick={() => act(() => chapelPlayer.step(orgId, -1, by))} disabled={!queue.length}><SkipBack size={22} /></Round>
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} disabled={!queue.length} onClick={() => act(() => chapelPlayer.setPlaying(orgId, !playing, by))}
            className="grid h-20 w-20 place-items-center rounded-full bg-[#3b4a35] text-white shadow hover:bg-[#4d5f45] disabled:opacity-40">{playing ? <Pause size={34} /> : <Play size={34} className="translate-x-0.5" />}</button>
          <Round label="Next" onClick={() => act(() => chapelPlayer.step(orgId, 1, by))} disabled={!queue.length}><SkipForward size={22} /></Round>
          <Round label="Forward 30 seconds" onClick={() => act(() => chapelPlayer.seek(orgId, 30))} disabled={!cur}><RotateCw size={20} /></Round>
          <Round label="Stop and clear the list" onClick={() => { if (!queue.length || confirm('Stop and clear the list? The TV goes back to the welcome screen.')) act(() => chapelPlayer.clear(orgId, by)) }} disabled={!queue.length}><Square size={20} /></Round>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">Up next</h2><span className="text-xs text-slate-400">{queue.length} in list</span></div>
          {queue.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Pick something from the library.</div>}
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {queue.map((q, i) => (
              <li key={`${q.id}-${i}`} className={`flex items-center gap-2 px-2 py-2 ${i === idx ? 'rounded-lg bg-emerald-50' : ''}`}>
                <button type="button" onClick={() => act(() => chapelPlayer.jump(orgId, i, by))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${i === idx ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{i === idx && playing ? <MonitorPlay size={17} /> : <Kind k={q.kind} size={17} />}</span>
                  <span className="truncate text-sm font-medium text-slate-900">{q.title}</span>
                </button>
                <button type="button" aria-label={`Remove ${q.title}`} onClick={() => act(() => chapelPlayer.removeAt(orgId, i, by))} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>

        <Library orgId={orgId} by={by ?? ''} onPlay={(items) => act(() => chapelPlayer.playNow(orgId, items, by))} onAdd={(items) => act(() => chapelPlayer.add(orgId, items, by))} />
      </div>
    </div>
  )
}

function Round({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid h-12 w-12 place-items-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">{children}</button>
}

function Library({ orgId, by, onPlay, onAdd }: { orgId: string; by: string; onPlay: (i: PlayerItem[]) => void; onAdd: (i: PlayerItem[]) => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'house' | 'family'>('house')
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const pick = useRef<HTMLInputElement>(null)
  const { data: house = [] } = useQuery({ queryKey: ['house-media', orgId], queryFn: () => houseMedia.list(orgId), enabled: !!orgId })
  const { data: family = [] } = useQuery({ queryKey: ['family-files'], queryFn: recentFamilyFiles, enabled: tab === 'family' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['house-media', orgId] })

  const id = youtubeId(link)
  const addLink = async () => {
    if (!id) return
    setErr(''); setBusy('Adding…')
    try {
      const name = title.trim() || (await houseMedia.youtubeTitle(id)) || `YouTube video ${id}`
      await houseMedia.addYoutube(orgId, id, name, by)
      setLink(''); setTitle(''); refresh()
    } catch (e) { setErr(msg(e)) }
    setBusy('')
  }
  const upload = async (files: FileList) => {
    setErr('')
    for (const f of Array.from(files)) {
      setBusy(`Uploading ${f.name}…`)
      try { await houseMedia.upload(orgId, f, by) } catch (e) { setErr(msg(e)) }
    }
    setBusy(''); refresh()
  }
  const remove = async (h: HouseItem) => { if (!confirm(`Remove “${h.title}” from the library?`)) return; try { await houseMedia.remove(h); refresh() } catch (e) { setErr(msg(e)) } }

  return (
    <Card className="p-4">
      <div className="mb-3 flex gap-2">
        {([['house', 'House library'], ['family', 'Family files']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === k ? 'bg-[#3b4a35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
        ))}
      </div>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {busy && <div className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{busy}</div>}

      {tab === 'house' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Link2 size={16} className="text-red-600" /> Add a YouTube video</div>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the YouTube link" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base" />
            {link && !id && <div className="mt-1 text-xs text-red-600">That does not look like a YouTube link.</div>}
            {id && (
              <div className="mt-2 flex gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name (optional — we look it up)" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base" />
                <button type="button" onClick={addLink} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg bg-[#3b4a35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4d5f45] disabled:opacity-50"><Plus size={16} /> Save</button>
              </div>
            )}
            {id && <button type="button" onClick={() => onPlay([{ id: `yt-${id}`, title: title.trim() || 'YouTube video', kind: 'video', source: 'youtube', youtubeId: id }])} className="mt-2 text-sm font-medium text-[#3b4a35] underline">Just play it now without saving</button>}
          </div>

          <button type="button" onClick={() => pick.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><Upload size={16} /> Upload a video, song or picture for the library</button>
          <input ref={pick} type="file" multiple accept="audio/*,video/*,image/*,.mp3,.m4a,.wav,.mp4,.mov" className="hidden" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = '' }} />

          {house.length === 0 && <div className="py-6 text-center text-sm text-slate-400">Your library is empty. Add the videos you play often.</div>}
          <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
            {house.map((h) => (
              <Row key={h.id} title={h.title} kind={h.kind} sub={h.source === 'youtube' ? 'YouTube' : 'Uploaded file'}
                onPlay={() => onPlay([toItem(h)])} onAdd={() => onAdd([toItem(h)])} onRemove={() => remove(h)} />
            ))}
          </ul>
        </div>
      )}

      {tab === 'family' && (
        <div>
          <p className="mb-2 text-xs text-slate-500">Files added on a family’s case (Cases → the case → Media). Add them from the USB drive there first.</p>
          {family.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No family files yet.</div>}
          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {family.map((f) => {
              const it: PlayerItem = { id: f.id, title: f.name, kind: f.kind, source: 'file', path: f.path }
              return <Row key={f.id} title={f.name} kind={f.kind} sub={f.caseLabel} onPlay={() => onPlay([it])} onAdd={() => onAdd([it])} />
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Row({ title, kind, sub, onPlay, onAdd, onRemove }: { title: string; kind: PlayerItem['kind']; sub: string; onPlay: () => void; onAdd: () => void; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-2 px-1 py-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Kind k={kind} size={17} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{title}</span><span className="block truncate text-xs text-slate-500">{sub}</span></span>
      <button type="button" onClick={onPlay} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#3b4a35] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Play size={14} /> Play</button>
      <button type="button" aria-label={`Add ${title} to the list`} title="Add to the list" onClick={onAdd} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ListPlus size={16} /></button>
      {onRemove && <button type="button" aria-label={`Remove ${title}`} onClick={onRemove} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
    </li>
  )
}
