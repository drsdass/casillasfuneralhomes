import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { USE_MOCK } from '@/lib/supabase'
import { PdfPages } from '@/components/signatures/PdfPages'
import { toolOf, type SignField } from '@/lib/esignFields'

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
        {!has && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300">Draw with your finger or mouse</span>}
      </div>
      <button type="button" onClick={clear} className="mt-1 text-sm text-slate-500 underline">Clear and start again</button>
    </div>
  )
}

const todayText = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric' })

/** Public page (no login): the family member reads the document, fills in the highlighted boxes and signs. */
export default function SignPage() {
  const { token = '' } = useParams()
  const { data, error, isLoading, refetch } = useQuery({ queryKey: ['esign', token], queryFn: () => api.esignPublic.get(token), retry: false })
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})        // field id -> picture / text / 'true'
  const [mySig, setMySig] = useState<string | null>(null)                 // drawn once, reused for every signature box
  const [myInit, setMyInit] = useState<string | null>(null)
  const [legacySig, setLegacySig] = useState<string | null>(null)         // documents with no boxes: one signature at the end
  const [pad, setPad] = useState<{ kind: 'signature' | 'initials'; fieldId: string } | null>(null)
  const [padImg, setPadImg] = useState<string | null>(null)
  const [textFor, setTextFor] = useState<SignField | null>(null)
  const [textVal, setTextVal] = useState('')
  const [done, setDone] = useState<{ signedUrl?: string } | null>(null)
  const [declined, setDeclined] = useState(false)
  const fields = useMemo(() => data?.fields ?? [], [data])
  const hasFields = fields.length > 0
  useEffect(() => { if (data?.signerName && !name) setName(data.signerName) }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const filled = (f: SignField) => f.type === 'name' ? name.trim().length > 1 : f.type === 'date' ? !!values[f.id] : f.type === 'checkbox' ? true : !!values[f.id]
  const todo = fields.filter((f) => f.required !== false && !filled(f))
  const ready = agree && name.trim().length > 1 && (hasFields ? todo.length === 0 : !!legacySig)
  const sign = useMutation({
    mutationFn: () => api.esignPublic.sign(token, name.trim(), hasFields ? (mySig ?? null) : legacySig, hasFields ? Object.fromEntries(Object.entries(values).filter(([, v]) => v)) : undefined),
    onSuccess: (r) => setDone(r),
  })
  const decline = useMutation({ mutationFn: () => api.esignPublic.decline(token), onSuccess: () => setDeclined(true) })
  const open = data && (data.status === 'sent' || data.status === 'viewed')
  const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

  const tap = (f: SignField) => {
    if (f.type === 'signature') { if (mySig) setValues((v) => ({ ...v, [f.id]: mySig })); else { setPadImg(null); setPad({ kind: 'signature', fieldId: f.id }) } }
    else if (f.type === 'initials') { if (myInit) setValues((v) => ({ ...v, [f.id]: myInit })); else { setPadImg(null); setPad({ kind: 'initials', fieldId: f.id }) } }
    else if (f.type === 'date') setValues((v) => ({ ...v, [f.id]: todayText() }))
    else if (f.type === 'checkbox') setValues((v) => ({ ...v, [f.id]: v[f.id] ? '' : 'true' }))
    else if (f.type === 'text') { setTextFor(f); setTextVal(values[f.id] ?? '') }
  }
  const redo = (f: SignField) => { setPadImg(null); setPad({ kind: f.type === 'initials' ? 'initials' : 'signature', fieldId: f.id }) }
  const nextField = () => { const f = todo[0]; if (f) document.getElementById(`field-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }

  const overlay = (page: number) => (
    <>
      {fields.filter((f) => f.page === page).map((f) => {
        const isDone = filled(f) && (f.type !== 'checkbox' || !!values[f.id])
        const img = (f.type === 'signature' || f.type === 'initials') && values[f.id]
        return (
          <button key={f.id} id={`field-${f.id}`} type="button" onClick={() => (isDone && (f.type === 'signature' || f.type === 'initials') ? redo(f) : tap(f))} disabled={f.type === 'name'}
            className={`absolute flex items-center justify-center overflow-hidden rounded border-2 text-[11px] font-semibold ${isDone ? 'border-emerald-500 bg-emerald-50/80 text-emerald-900' : 'animate-pulse border-amber-500 bg-amber-100/80 text-amber-900'}`}
            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
            {img ? <img src={img as string} alt="" className="max-h-full max-w-full object-contain" />
              : f.type === 'name' ? (name.trim() || 'Your name')
              : f.type === 'date' ? (values[f.id] || 'Tap for today’s date')
              : f.type === 'text' ? (values[f.id] || f.label || 'Tap to type')
              : f.type === 'checkbox' ? (values[f.id] ? '✔' : '')
              : toolOf(f.type).hint}
          </button>
        )
      })}
    </>
  )

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
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
              {hasFields && <p className="mt-1 text-sm text-slate-500">Tap each <b className="text-amber-700">highlighted box</b> on the document to fill it in. Use <b>Next</b> at the bottom to jump to the next one.</p>}
            </div>
            {data.pdfUrl ? <PdfPages url={data.pdfUrl} overlay={hasFields ? overlay : undefined} /> : USE_MOCK ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">The document appears here.{hasFields && <div className="relative mx-auto mt-4 h-28 max-w-xs">{overlay(0)}</div>}</div> : null}
            <div className="space-y-4 rounded-lg bg-white p-4 sm:p-6">
              <label className="block text-sm font-medium text-slate-700">Type your full name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
              </label>
              {!hasFields && <div><div className="mb-1 text-sm font-medium text-slate-700">Your signature</div><SignatureBox onChange={setLegacySig} /></div>}
              <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" style={{ width: 18, height: 18 }} /> I have read this document, and I agree to sign it electronically. I understand my electronic signature has the same effect as signing on paper.</label>
              {sign.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg(sign.error)}</p>}
              <button type="button" disabled={sign.isPending || !ready} onClick={() => sign.mutate()} className="w-full rounded-md bg-[#3b4a35] px-4 py-3 text-base font-semibold text-white disabled:opacity-50">{sign.isPending ? 'Signing…' : hasFields && todo.length ? `${todo.length} box${todo.length === 1 ? '' : 'es'} left to fill in` : 'Sign the document'}</button>
              <button type="button" onClick={() => { if (confirm('Decline to sign this document?')) decline.mutate() }} className="block w-full text-center text-sm text-slate-500 underline">I do not want to sign</button>
            </div>
          </>
        )}
      </main>

      {open && !done && !declined && hasFields && todo.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 shadow-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-sm text-slate-600">{fields.length - todo.length} of {fields.length} done</span>
            <button type="button" onClick={nextField} className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-5 py-2.5 text-base font-semibold text-white">Next <ChevronRight size={18} /></button>
          </div>
        </div>
      )}

      {pad && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setPad(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-semibold">{pad.kind === 'initials' ? 'Draw your initials' : 'Draw your signature'}</h2>
            <SignatureBox onChange={setPadImg} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPad(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={!padImg} onClick={() => {
                if (!padImg) return
                const kind = pad.kind
                if (kind === 'signature') { setMySig(padImg); setValues((v) => ({ ...v, ...Object.fromEntries(fields.filter((f) => f.type === 'signature' && (f.id === pad.fieldId || v[f.id])).map((f) => [f.id, padImg])) })) }
                else { setMyInit(padImg); setValues((v) => ({ ...v, ...Object.fromEntries(fields.filter((f) => f.type === 'initials' && (f.id === pad.fieldId || v[f.id])).map((f) => [f.id, padImg])) })) }
                setPad(null)
              }} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Use this</button>
            </div>
          </div>
        </div>
      )}
      {textFor && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setTextFor(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-semibold">{textFor.label || 'Type here'}</h2>
            <input autoFocus value={textVal} onChange={(e) => setTextVal(e.target.value)} maxLength={200} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setTextFor(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button type="button" disabled={!textVal.trim()} onClick={() => { setValues((v) => ({ ...v, [textFor.id]: textVal.trim() })); setTextFor(null) }} className="rounded-md bg-[#3b4a35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
