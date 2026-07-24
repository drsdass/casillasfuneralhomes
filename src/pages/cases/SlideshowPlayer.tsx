import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react'

export default function SlideshowPlayer() {
  const { caseId } = useParams<{ caseId: string }>()
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [musicUrl, setMusicUrl] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })
  const { data: documents = [] } = useQuery({ queryKey: ['case-documents', caseId], queryFn: () => api.getCaseDocuments(caseId!), enabled: !!caseId })

  useEffect(() => {
    const photos = documents.filter((d) => d.category === 'photo')
    const music = documents.find((d) => d.category === 'music')
    Promise.all(photos.map((p) => api.getDocumentSignedUrl(p.url))).then(setPhotoUrls)
    if (music) api.getDocumentSignedUrl(music.url).then(setMusicUrl)
  }, [documents])

  useEffect(() => {
    if (playing && photoUrls.length > 1) {
      intervalRef.current = setInterval(() => setIndex((i) => (i + 1) % photoUrls.length), 5000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, photoUrls.length])

  useEffect(() => {
    if (!audioRef.current) return
    if (playing) audioRef.current.play().catch(() => {})
    else audioRef.current.pause()
  }, [playing])

  if (!c) return null

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="no-print flex items-center justify-between px-6 py-3 bg-black/40">
        <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
          <ArrowLeft size={15} /> Back to case
        </Link>
        <div className="text-sm text-slate-300">{c.decedent.firstName} {c.decedent.lastName} — Memorial Slideshow</div>
        <div className="w-20" />
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {photoUrls.length === 0 ? (
          <div className="text-slate-400 text-center">
            No photos uploaded yet. Send the family their portal link — they can upload photos from the Photos tab.
          </div>
        ) : (
          <>
            <img src={photoUrls[index]} alt="" className="max-h-[80vh] max-w-[90vw] object-contain" />
            {photoUrls.length > 1 && (
              <>
                <button
                  onClick={() => setIndex((i) => (i - 1 + photoUrls.length) % photoUrls.length)}
                  className="no-print absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 rounded-full p-2"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setIndex((i) => (i + 1) % photoUrls.length)}
                  className="no-print absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 rounded-full p-2"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {photoUrls.length > 0 && (
        <div className="no-print flex items-center justify-center gap-4 py-5 bg-black/40">
          <button onClick={() => setPlaying((p) => !p)} className="bg-white/10 hover:bg-white/20 rounded-full p-3">
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          {musicUrl && (
            <button onClick={() => setMuted((m) => !m)} className="bg-white/10 hover:bg-white/20 rounded-full p-3">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
          <span className="text-xs text-slate-400">{index + 1} / {photoUrls.length}</span>
        </div>
      )}

      {musicUrl && <audio ref={audioRef} src={musicUrl} loop muted={muted} />}
    </div>
  )
}
