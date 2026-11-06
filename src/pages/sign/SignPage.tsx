import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { USE_MOCK } from '@/lib/supabase'

/** Draws the PDF's pages one under another, sized to the screen — works on a phone, where an embedded PDF often won't show. */
function PdfPages({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = worker
        const doc = await pdfjs.getDocument({ url }).promise
        if (dead || !box.current) return
        box.current.innerHTML = ''
        const width = Math.min(box.current.clientWidth || 700, 900)
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const scale = (width / base.width) * (window.devicePixelRatio || 1)
          const vp = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = vp.width; canvas.height = vp.height
          canvas.style.width = '100%'; canvas.style.height = 'auto'
          canvas.className = 'mb-3 rounded border border-slate-200 bg-white shadow-sm'
          box.current.appendChild(canvas)
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        }
      } catch (e) { if (!dead) setErr(e instanceof Error ? e.message : 'Could not show the document.') }
    })()
    return () => { dead = true }
  }, [url])
  return <div>{err ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err} <a className="underline" href={url} target="_blank" rel="noreferrer">Open the document</a></p> : null}<div ref={box} /></div>
}

/** A finger-or-mouse signature box. */
function SignatureBox({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [has, setHas] = useState(false)
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height } }
  const start = (e: React.PointerEvent) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const c = ref.current!.getContext('2d')!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y) }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const c = ref.current!.getContext('2d')!; const p = pos(e); c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111827'; c.lineTo(p.x, p.y); c.stroke() }
  const end = () => { if (!drawing.current) return; drawing.current = false; setHas(true); onChange(ref.current!.toDataURL('image/png')) }
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHas(false); onChange(null) }
  return (
    <div>
      <div className="relative rounded-md border-2 border-dashed border-slate-300 bg-white">
        <canvas ref={ref} width={900} height={300} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} style={{ touchAction: 'none', width: '100%', height: 150 }} />
        {!has && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300">Sign here with your finger or mouse</span>}
      </div>
      <button type="button" onClick={clear} className="mt-1 text-sm text-slate-500 underline">Clear and start again</button>
    </div>
  )
}

/** Public page (no login): the family member reads the document and signs it. */
export default function SignPage() {
  const { token = '' } = useParams()
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['esign', token], queryFn: () => api.esignPublic.get(token), retry: false })
  const [name, setName] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [done, setDone] = useState<{ signedUrl?: string } | null>(null)
  const [declined, setDeclined] = useState(false)
  const sign = useMutation({ mutationFn: () => api.esignPublic.sign(token, name.trim(), sig!), onSuccess: (r) => setDone(r) })
  const decline = useMutation({ mutationFn: () => api.esignPublic.decline(token), onSuccess: () => setDeclined(true) })
  useEffect(() => { if (data?.signerName && !name) setName(data.signerName) }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = data && (data.status === 'sent' || data.status === 'viewed')
  const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-[#3b4a35] px-4 py-3 text-white"><div className="mx-auto max-w-3xl text-lg font-semibold">{data?.orgName ?? 'Casillas Funeral Home'}</div></header>
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        {isLoading && <p className="py-16 text-center text-slate-500">Opening your document…</p>}
        {error && <div className="rounded-lg bg-white p-6 text-center"><AlertCircle className="mx-auto mb-2 text-red-500" /><p className="text-slate-700">{msg(error)}</p><button onClick={() => refetch()} className="mt-3 text-sm text-slate-500 underline">Try again</button></div>}

        {data && (done || data.status === 'signed') && (
          <div className="rounded-lg bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={40} />
            <h1 className="text-xl font-semibold text-slate-900">Thank you. It is signed.</h1>
            <p className="mt-1 text-slate-600">{data.documentName}</p>
            {(done?.signedUrl ?? data.signedUrl) && <a href={done?.signedUrl ?? data.signedUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#3b4a35] px-4 py-2.5 font-semibold text-white"><Download size={16} /> Download your copy</a>}
            {USE_MOCK && !done?.signedUrl && !data.signedUrl && <p className="mt-3 text-xs text-slate-400">(Demo mode: no real file.)</p>}
          </div>
        )}
        {data && declined && <div className="rounded-lg bg-white p-6 text-center text-slate-700">You chose not to sign. The funeral home has been told. You can close this page.</div>}
        {data && !done && !declined && (data.status === 'declined' || data.status === 'expired') && <div className="rounded-lg bg-white p-6 text-center text-slate-700">{data.status === 'expired' ? 'This signing link has expired. Please call the funeral home and we will send a new one.' : 'This document was declined. Please call the funeral home if that was a mistake.'}</div>}

        {open && !done && !declined && (
          <>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Please review and sign</h1>
              <p className="text-slate-600">{data.documentName} · for {data.signerName}</p>
            </div>
            {data.pdfUrl ? <PdfPages url={data.pdfUrl} /> : USE_MOCK ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">The document appears here.</div> : null}
            <div className="space-y-4 rounded-lg bg-white p-4 sm:p-6">
              <label className="block text-sm font-medium text-slate-700">Type your full name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
              </label>
              <div><div className="mb-1 text-sm font-medium text-slate-700">Your signature</div><SignatureBox onChange={setSig} /></div>
              <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" style={{ width: 18, height: 18 }} /> I have read this document, and I agree to sign it electronically. I understand my electronic signature has the same effect as signing on paper.</label>
              {sign.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg(sign.error)}</p>}
              <button type="button" disabled={sign.isPending || !sig || !agree || name.trim().length < 2} onClick={() => sign.mutate()} className="w-full rounded-md bg-[#3b4a35] px-4 py-3 text-base font-semibold text-white disabled:opacity-50">{sign.isPending ? 'Signing…' : 'Sign the document'}</button>
              <button type="button" onClick={() => { if (confirm('Decline to sign this document?')) decline.mutate() }} className="block w-full text-center text-sm text-slate-500 underline">I do not want to sign</button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
