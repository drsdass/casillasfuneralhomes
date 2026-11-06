import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Draws a PDF's pages one under another, sized to the screen — works on a phone, where an embedded PDF often won't show.
 * `overlay(pageIndex)` can lay boxes over a page; they are positioned in the same 0-1 fractions as the page itself.
 */
export function PdfPages({ url, overlay, onLoaded }: { url: string; overlay?: (page: number) => ReactNode; onLoaded?: (pages: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const [count, setCount] = useState(0)
  const [err, setErr] = useState('')
  const doc = useRef<{ getPage: (n: number) => Promise<any> } | null>(null) // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    let dead = false
    setCount(0); setErr('')
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
        const d = await pdfjs.getDocument({ url }).promise
        if (dead) return
        doc.current = d
        setCount(d.numPages); onLoaded?.(d.numPages)
      } catch (e) { if (!dead) setErr(e instanceof Error ? e.message : 'Could not show the document.') }
    })()
    return () => { dead = true }
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!count || !doc.current) return
    let dead = false
    ;(async () => {
      const width = Math.min(box.current?.clientWidth || 700, 900)
      for (let i = 1; i <= count; i++) {
        const page = await doc.current!.getPage(i)
        const base = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) })
        const canvas = canvases.current[i - 1]
        if (dead || !canvas) return
        canvas.width = vp.width; canvas.height = vp.height
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
      }
    })()
    return () => { dead = true }
  }, [count])

  return (
    <div ref={box}>
      {err && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err} <a className="underline" href={url} target="_blank" rel="noreferrer">Open the document</a></p>}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-page={i} className="relative mb-3 overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
          <canvas ref={(el) => { canvases.current[i] = el }} style={{ display: 'block', width: '100%', height: 'auto' }} />
          {overlay && <div data-overlay={i} className="absolute inset-0">{overlay(i)}</div>}
        </div>
      ))}
    </div>
  )
}
