import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX, Shuffle, Image as ImageIcon, Film } from 'lucide-react'

export default function SlideshowPlayer() {
  const { caseId } = useParams<{ caseId: string }>()
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [musicUrls, setMusicUrls] = useState<string[]>([])
  const [videoUrls, setVideoUrls] = useState<{ name: string; url: string }[]>([])
  const [mode, setMode] = useState<'slideshow' | 'video'>('slideshow')
  const [selectedVideo, setSelectedVideo] = useState(0)
  const [index, setIndex] = useState(0)
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: c } = useQuery({ queryKey: ['case', caseId], queryFn: () => api.getCase(caseId!), enabled: !!caseId })
  const { data: documents = [] } = useQuery({ queryKey: ['case-documents', caseId], queryFn: () => api.getCaseDocuments(caseId!), enabled: !!caseId })

  useEffect(() => {
    const photos = documents.filter((d) => d.category === 'photo')
    const music = documents.filter((d) => d.category === 'music')
    const videos = documents.filter((d) => d.category === 'video')
    Promise.all(photos.map((p) => api.getDocumentSignedUrl(p.url))).then(setPhotoUrls)
    Promise.all(music.map((m) => api.getDocumentSignedUrl(m.url))).then(setMusicUrls)
    Promise.all(videos.map(async (v) => ({ name: v.name, url: await api.getDocumentSignedUrl(v.url) }))).then(setVideoUrls)
  }, [documents])

  useEffect(() => {
    if (mode === 'slideshow' && playing && photoUrls.length > 1) {
      intervalRef.current = setInterval(() => setIndex((i) => (i + 1) % photoUrls.length), 5000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, photoUrls.length, mode])

  useEffect(() => {
    if (!audioRef.current) return
    if (playing && mode === 'slideshow') audioRef.current.play().catch(() => {})
    else audioRef.current.pause()
  }, [playing, mode, trackIndex])

  function shufflePhotos() {
    setPhotoUrls((prev) => {
      const arr = [...prev]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
    setIndex(0)
  }

  if (!c) return null

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div className="no-print flex items-center justify-between px-6 py-3 bg-black/40">
        <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
          <ArrowLeft size={15} /> Back to case
        </Link>
        <div className="text-sm text-slate-300">{c.decedent.firstName} {c.decedent.lastName} — Memorial</div>
        {videoUrls.length > 0 ? (
          <div className="flex gap-1">
            <button
              onClick={() => { setMode('slideshow'); setPlaying(false) }}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md ${mode === 'slideshow' ? 'bg-white/20' : 'hover:bg-white/10'}`}
            >
              <ImageIcon size={13} /> Slideshow
            </button>
            <button
              onClick={() => { setMode('video'); setPlaying(false) }}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md ${mode === 'video' ? 'bg-white/20' : 'hover:bg-white/10'}`}
            >
              <Film size={13} /> Family's Video
            </button>
          </div>
        ) : <div className="w-20" />}
      </div>

      {mode === 'video' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          {videoUrls.length > 1 && (
            <div className="no-print flex gap-2 mb-2">
              {videoUrls.map((v, i) => (
                <button
                  key={v.url}
                  onClick={() => setSelectedVideo(i)}
                  className={`text-xs px-2.5 py-1 rounded-md ${i === selectedVideo ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10'}`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
          <video key={videoUrls[selectedVideo]?.url} src={videoUrls[selectedVideo]?.url} controls autoPlay className="max-h-[80vh] max-w-[90vw]" />
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-center justify-center relative">
            {photoUrls.length === 0 ? (
              <div className="text-slate-400 text-center px-6">
                No photos uploaded yet. Send the family their portal link — they can upload photos from the Photos tab.
              </div>
            ) : (
              <>
                <img key={index} src={photoUrls[index]} alt="" className="max-h-[80vh] max-w-[90vw] object-contain animate-[fadeIn_1s_ease-in-out]" />
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
              {musicUrls.length > 0 && (
                <button onClick={() => setMuted((m) => !m)} className="bg-white/10 hover:bg-white/20 rounded-full p-3">
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              )}
              {photoUrls.length > 1 && (
                <button onClick={shufflePhotos} title="Shuffle photo order" className="bg-white/10 hover:bg-white/20 rounded-full p-3">
                  <Shuffle size={18} />
                </button>
              )}
              <span className="text-xs text-slate-400">{index + 1} / {photoUrls.length}</span>
              {musicUrls.length > 0 && <span className="text-xs text-slate-500">· track {trackIndex + 1}/{musicUrls.length}</span>}
            </div>
          )}
        </>
      )}

      {musicUrls.length > 0 && mode === 'slideshow' && (
        <audio
          ref={audioRef}
          src={musicUrls[trackIndex]}
          muted={muted}
          onEnded={() => setTrackIndex((i) => (i + 1) % musicUrls.length)}
        />
      )}
    </div>
  )
}
