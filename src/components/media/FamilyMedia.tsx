import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Film, Image as ImageIcon, Maximize2, Music2, Pause, Play, SkipBack, SkipForward, Trash2, Upload, Usb } from 'lucide-react'
import { caseMedia, type CaseMedia } from '@/lib/caseMedia'
import type { StaffMember } from '@/types'

const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const Icon = ({ k, size = 20 }: { k: CaseMedia['kind']; size?: number }) => (k === 'video' ? <Film size={size} /> : k === 'image' ? <ImageIcon size={size} /> : <Music2 size={size} />)

/** Music, videos and pictures a family brings (USB drive, phone). Upload once to the case, then play it here — or full screen in the chapel. */
export function FamilyMedia({ caseId, canEdit, currentUser }: { caseId: string; canEdit: boolean; currentUser: StaffMember }) {
  const qc = useQueryClient()
  const key = ['case-media', caseId]
  const { data: items = [], isLoading } = useQuery({ queryKey: key, queryFn: () => caseMedia.list(caseId) })
  const [busy, setBusy] = useState<string[]>([])
  const [errs, setErrs] = useState<string[]>([])
  const [cur, setCur] = useState<number | null>(null)
  const [src, setSrc] = useState('')
  const [playing, setPlaying] = useState(false)
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const item = cur != null ? items[cur] : undefined

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    setErrs([])
    for (const f of list) {
      setBusy((b) => [...b, f.name])
      try { await caseMedia.upload(caseId, f, currentUser.name) } catch (e) { setErrs((x) => [...x, e instanceof Error ? e.message : `Could not upload ${f.name}`]) }
      setBusy((b) => b.filter((n) => n !== f.name))
      qc.invalidateQueries({ queryKey: key })
    }
  }
  const del = useMutation({ mutationFn: (m: CaseMedia) => caseMedia.remove(m), onSuccess: () => { setCur(null); qc.invalidateQueries({ queryKey: key }) } })

  useEffect(() => {
    let live = true
    setSrc('')
    if (item) caseMedia.url(item).then((u) => { if (live) setSrc(u) }).catch((e) => setErrs([e instanceof Error ? e.message : 'Could not open that file.']))
    return () => { live = false }
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // pictures advance by themselves (8 s); sound and video advance when they end
  useEffect(() => {
    if (!item || item.kind !== 'image' || !playing) return
    const t = setTimeout(() => next(), 8000)
    return () => clearTimeout(t)
  }, [item?.id, playing]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => { if (cur == null) return; if (cur + 1 < items.length) setCur(cur + 1); else { setPlaying(false) } }
  const prev = () => { if (cur != null && cur > 0) setCur(cur - 1) }
  const start = (i: number) => { setCur(i); setPlaying(true) }
  const toggle = () => {
    if (!item) { if (items.length) start(0); return }
    if (item.kind === 'image') { setPlaying((p) => !p); return }
    if (!el.current) return
    if (el.current.paused) { el.current.play(); setPlaying(true) } else { el.current.pause(); setPlaying(false) }
  }
  const full = () => { const t = stage.current; if (t?.requestFullscreen) t.requestFullscreen().catch(() => {}) }
  const unsupported = item && item.kind !== 'image' && src && el.current && !el.current.canPlayType(item.mime || (item.kind === 'video' ? 'video/mp4' : 'audio/mpeg'))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Usb size={18} className="text-[#3b4a35]" /> Family music, video &amp; pictures</h3>
        <p className="text-sm text-slate-500">When a family brings a USB drive or sends files, add them here. They stay with this case and can be played for the service.</p>
      </div>

      {canEdit && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <Upload size={26} className="text-slate-400" />
          <div className="text-sm text-slate-600">Drag files here, or</div>
          <button type="button" onClick={() => pick.current?.click()} className="rounded-lg bg-[#3b4a35] px-5 py-3 text-base font-semibold text-white hover:bg-[#4d5f45]">Choose files from the USB drive</button>
          <input ref={pick} type="file" multiple accept="audio/*,video/*,image/*,.mp3,.m4a,.wav,.mp4,.mov" className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
          <div className="text-xs text-slate-400">MP3, M4A, WAV, MP4, MOV, JPG, PNG. Plug the USB drive into this computer first. You can pick many files at once.</div>
        </div>
      )}
      {busy.length > 0 && <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">Uploading {busy.length} file{busy.length > 1 ? 's' : ''}… {busy[0]}{busy.length > 1 ? ' and more' : ''} (large videos take a minute — keep this page open)</div>}
      {errs.map((e, i) => <div key={i} className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{e}</div>)}

      {isLoading && <div className="py-6 text-center text-slate-400">Loading…</div>}
      {!isLoading && items.length === 0 && busy.length === 0 && <div className="py-6 text-center text-sm text-slate-400">Nothing added yet for this family.</div>}

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div ref={stage} className="flex min-h-[260px] flex-col overflow-hidden rounded-xl bg-black">
            <div className="grid flex-1 place-items-center">
              {!item && <button type="button" onClick={() => start(0)} className="flex flex-col items-center gap-2 p-10 text-white/80 hover:text-white"><Play size={48} /><span className="text-base">Play everything in order</span></button>}
              {item && !src && <div className="p-10 text-white/60">Opening…</div>}
              {item && src && item.kind === 'video' && <video ref={el} key={item.id} src={src} autoPlay={playing} controls playsInline className="max-h-[60vh] w-full bg-black" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={next} />}
              {item && src && item.kind === 'audio' && (
                <div className="flex w-full flex-col items-center gap-4 p-8 text-center text-white">
                  <span className="grid h-24 w-24 place-items-center rounded-full bg-white/10"><Music2 size={44} /></span>
                  <div className="max-w-full truncate text-xl font-medium">{item.name.replace(/\.[^.]+$/, '')}</div>
                  <audio ref={el as never} key={item.id} src={src} autoPlay={playing} controls className="w-full max-w-md" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={next} />
                </div>
              )}
              {item && src && item.kind === 'image' && <img key={item.id} src={src} alt={item.name} className="max-h-[60vh] w-full object-contain" />}
            </div>
            <div className="bg-black/80 px-3 py-2 text-white"><div className="mb-1 truncate text-sm text-white/80">{item ? item.name : 'Ready'}</div><div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous" onClick={prev} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><SkipBack size={18} /></button>
                <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} className="grid h-12 w-12 place-items-center rounded-full bg-white text-black">{playing ? <Pause size={22} /> : <Play size={22} className="translate-x-0.5" />}</button>
                <button type="button" aria-label="Next" onClick={next} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><SkipForward size={18} /></button>
              </div>
              <button type="button" onClick={full} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-white/10"><Maximize2 size={16} /> Full screen</button>
            </div></div>
          </div>

          <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {items.map((m, i) => (
              <li key={m.id} className={`flex items-center gap-2 px-3 py-2 ${i === cur ? 'bg-emerald-50' : ''}`}>
                <button type="button" onClick={() => start(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Icon k={m.kind} size={17} /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{m.name}</span><span className="block text-xs text-slate-500">{mb(m.size)}</span></span>
                </button>
                {canEdit && <button type="button" aria-label={`Delete ${m.name}`} onClick={() => { if (confirm(`Remove “${m.name}” from this case?`)) del.mutate(m) }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {unsupported && <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">This browser may not be able to play that kind of file. Convert it to MP3 (sound) or MP4 (video) and add it again.</div>}
      <p className="text-xs text-slate-400">Sound plays from the device this page is open on. To hear it in the chapel, open this page on the chapel computer or TV and press Full screen.</p>
    </div>
  )
}
