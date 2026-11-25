import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MonitorPlay } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { useKeepAwake } from '@/lib/keepAwake'
import { chapelPlayer, fileUrl, type PlayerItem, type PlayerStatus } from '@/lib/chapelPlayer'

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

let ytLoading: Promise<void> | null = null
const loadYT = (): Promise<void> => {
  if (window.YT?.Player) return Promise.resolve()
  if (!ytLoading) ytLoading = new Promise((res) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); res() }
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s)
  })
  return ytLoading
}

const IMAGE_SECONDS = 10

/**
 * The Chapel Player: open this page on the laptop that feeds the chapel TV (/player), press Start once, and leave it.
 * It does what the tablet's "Chapel TV" remote tells it: plays YouTube links and uploaded video, music and pictures, full screen.
 * Sound comes out of the laptop's HDMI cable, so it reaches the chapel TV and — through the TV — the Sonos soundbar/speakers.
 */
export default function ChapelPlayerPage() {
  useKeepAwake()
  const { activeOrg } = useSession()
  const orgId = activeOrg?.id ?? ''
  const qc = useQueryClient()
  const [started, setStarted] = useState(false)
  const { data: st } = useQuery({ queryKey: ['chapel-player', orgId], queryFn: () => chapelPlayer.state(orgId), enabled: !!orgId, refetchInterval: 2500, refetchIntervalInBackground: true })
  useEffect(() => (orgId ? chapelPlayer.subscribe(orgId, () => qc.invalidateQueries({ queryKey: ['chapel-player', orgId] })) : undefined), [orgId, qc])

  const queue = st?.queue ?? []
  const idx = st?.idx ?? 0
  const item: PlayerItem | undefined = queue[idx]
  const playing = !!st?.playing
  const seq = st?.seq ?? 0

  const status = useRef<PlayerStatus>({})
  const setStatus = (p: PlayerStatus) => { status.current = { ...status.current, ...p } }
  // the tablet sees "player open" and how far along we are
  useEffect(() => {
    if (!orgId || !started) return
    const tick = () => void chapelPlayer.report(orgId, { ...status.current, title: item?.title }).catch(() => {})
    tick(); const t = setInterval(tick, 5000)
    return () => clearInterval(t)
  }, [orgId, started, item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(() => { if (orgId) void chapelPlayer.advance(orgId, idx, queue.length).then(() => qc.invalidateQueries({ queryKey: ['chapel-player', orgId] })) }, [orgId, idx, queue.length, qc])

  const start = () => {
    setStarted(true)
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
    try { (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el) } catch { /* the browser may refuse; the page still works */ }
  }

  if (!started) {
    return (
      <div className="grid h-screen place-items-center bg-[#1f2a1c] p-8 text-center text-white">
        <div className="max-w-md space-y-5">
          <MonitorPlay size={56} className="mx-auto text-[#c9d6bf]" />
          <div className="text-2xl font-semibold">Chapel Player</div>
          <p className="text-slate-300">Press Start once. Then leave this window open — the tablet decides what plays on the chapel TV.</p>
          <button type="button" onClick={start} className="rounded-xl bg-white px-10 py-4 text-xl font-semibold text-[#1f2a1c] hover:bg-slate-100">Start</button>
          <p className="text-xs text-slate-400">Drag this window to the screen that goes to the chapel TV before you press Start.</p>
        </div>
      </div>
    )
  }

  const key = `${item?.id}:${idx}:${seq}`
  return (
    <div className="relative h-screen w-screen cursor-none overflow-hidden bg-black text-white">
      {!item || idx >= queue.length ? (
        <Idle name={activeOrg?.name ?? ''} />
      ) : item.source === 'youtube' ? (
        <YouTubeStage key={`yt-${seq}-${idx}`} id={item.youtubeId!} playing={playing} cmd={st?.cmd ?? null} onStatus={setStatus} onEnded={advance} />
      ) : item.kind === 'image' ? (
        <ImageStage key={key} item={item} playing={playing} onStatus={setStatus} onEnded={idx + 1 < queue.length ? advance : () => {}} />
      ) : (
        <FileStage key={key} item={item} playing={playing} cmd={st?.cmd ?? null} onStatus={setStatus} onEnded={advance} />
      )}
    </div>
  )
}

function Idle({ name }: { name: string }) {
  return (
    <div className="grid h-full place-items-center bg-[#1f2a1c] text-center">
      <div className="text-white/70"><div className="font-serif text-5xl tracking-wide">{name || 'Welcome'}</div></div>
    </div>
  )
}

type StageProps = { playing: boolean; cmd: { n: number; type: 'seek'; by: number } | null; onStatus: (p: PlayerStatus) => void; onEnded: () => void }

function YouTubeStage({ id, playing, cmd, onStatus, onEnded }: StageProps & { id: string }) {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<any>(null)
  const playingRef = useRef(playing); playingRef.current = playing
  const done = useRef(onEnded); done.current = onEnded
  const lastCmd = useRef(cmd?.n ?? 0)

  useEffect(() => {
    let dead = false; let poll: ReturnType<typeof setInterval> | undefined; let skip: ReturnType<typeof setTimeout> | undefined
    onStatus({ state: 'loading', error: undefined, pos: 0, dur: 0 })
    loadYT().then(() => {
      if (dead || !host.current) return
      const mount = document.createElement('div'); host.current.innerHTML = ''; host.current.appendChild(mount)
      player.current = new window.YT.Player(mount, {
        width: '100%', height: '100%', videoId: id,
        playerVars: { autoplay: playingRef.current ? 1 : 0, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, fs: 0, origin: window.location.origin },
        events: {
          onReady: () => { if (!playingRef.current) player.current?.pauseVideo?.() },
          onStateChange: (e: any) => {
            if (e.data === 0) onStatus({ state: 'ended' }), done.current()
            else if (e.data === 1) onStatus({ state: 'playing', error: undefined })
            else if (e.data === 2) onStatus({ state: 'paused' })
          },
          onError: (e: any) => {
            const why = e.data === 101 || e.data === 150 ? 'The owner of this YouTube video does not allow it to be played here.' : e.data === 100 ? 'This YouTube video was removed or is private.' : 'This video could not be played.'
            onStatus({ state: 'error', error: why })
            skip = setTimeout(() => done.current(), 4000)
          },
        },
      })
      poll = setInterval(() => { const p = player.current; if (p?.getCurrentTime) onStatus({ pos: p.getCurrentTime(), dur: p.getDuration?.() ?? 0 }) }, 1000)
    }).catch(() => onStatus({ state: 'error', error: 'Could not reach YouTube.' }))
    return () => { dead = true; if (poll) clearInterval(poll); if (skip) clearTimeout(skip); try { player.current?.destroy?.() } catch { /* ignore */ } player.current = null }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const p = player.current; if (!p?.playVideo) return; playing ? p.playVideo() : p.pauseVideo() }, [playing])
  useEffect(() => {
    if (!cmd || cmd.n === lastCmd.current) return
    lastCmd.current = cmd.n
    const p = player.current; if (p?.getCurrentTime) p.seekTo(Math.max(0, p.getCurrentTime() + cmd.by), true)
  }, [cmd])

  return <div ref={host} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />
}

function FileStage({ item, playing, cmd, onStatus, onEnded }: StageProps & { item: PlayerItem }) {
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const [src, setSrc] = useState('')
  const lastCmd = useRef(cmd?.n ?? 0)
  useEffect(() => {
    let live = true
    onStatus({ state: 'loading', error: undefined, pos: 0, dur: 0 })
    fileUrl(item).then((u) => { if (live) setSrc(u) }).catch(() => onStatus({ state: 'error', error: 'Could not open that file.' }))
    return () => { live = false }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = el.current; if (!m || !src) return; if (playing) void m.play().catch(() => onStatus({ state: 'error', error: 'The browser blocked playback. Press Start again on the laptop.' })); else m.pause() }, [playing, src]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!cmd || cmd.n === lastCmd.current) return; lastCmd.current = cmd.n; const m = el.current; if (m) m.currentTime = Math.max(0, m.currentTime + cmd.by) }, [cmd])
  const common = {
    src, autoPlay: playing, onEnded: () => { onStatus({ state: 'ended' }); onEnded() },
    onPlay: () => onStatus({ state: 'playing', error: undefined }), onPause: () => onStatus({ state: 'paused' }),
    onTimeUpdate: () => { const m = el.current; if (m) onStatus({ pos: m.currentTime, dur: isFinite(m.duration) ? m.duration : 0 }) },
    onError: () => onStatus({ state: 'error', error: 'This file could not be played. Try converting it to MP4 (video) or MP3 (music).' }),
  }
  if (!src) return <div className="grid h-full place-items-center text-white/50">Opening…</div>
  return item.kind === 'video'
    ? <video ref={el} {...common} playsInline className="h-full w-full bg-black object-contain" />
    : (
      <div className="grid h-full place-items-center bg-[#1f2a1c] text-center">
        <div className="space-y-6 px-10"><div className="font-serif text-5xl text-white/90">{item.title}</div><audio ref={el as never} {...common} /></div>
      </div>
    )
}

function ImageStage({ item, playing, onStatus, onEnded }: Omit<StageProps, 'cmd'> & { item: PlayerItem }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let live = true; fileUrl(item).then((u) => { if (live) setSrc(u) }).catch(() => onStatus({ state: 'error', error: 'Could not open that picture.' })); return () => { live = false } }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = useRef(onEnded); done.current = onEnded
  useEffect(() => {
    if (!src) return
    onStatus({ state: playing ? 'playing' : 'paused', pos: 0, dur: IMAGE_SECONDS, error: undefined })
    if (!playing) return
    const started = Date.now()
    const t = setInterval(() => { const s = (Date.now() - started) / 1000; onStatus({ pos: s, dur: IMAGE_SECONDS }); if (s >= IMAGE_SECONDS) { clearInterval(t); done.current() } }, 500)
    return () => clearInterval(t)
  }, [src, playing]) // eslint-disable-line react-hooks/exhaustive-deps
  return src ? <img src={src} alt="" className="h-full w-full bg-black object-contain" /> : <div className="grid h-full place-items-center text-white/50">Opening…</div>
}
