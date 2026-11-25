import { useState } from 'react'
import { X, Wand2 } from 'lucide-react'
import { PdfPages } from './PdfPages'
import { FIELD_TOOLS, makeField, toolOf, type SignField, type SignFieldType } from '@/lib/esignFields'

const tint: Record<SignFieldType, string> = { signature: 'border-amber-500 bg-amber-100/70', initials: 'border-sky-500 bg-sky-100/70', date: 'border-emerald-500 bg-emerald-100/70', name: 'border-violet-500 bg-violet-100/70', text: 'border-slate-500 bg-slate-100/70', checkbox: 'border-rose-500 bg-rose-100/70' }

/** Staff drop the boxes the family has to fill in: pick a kind, click the page, drag to move. */
export function FieldPlacer({ url, pages, setPages, fields, setFields }: { url: string; pages: number; setPages: (n: number) => void; fields: SignField[]; setFields: (f: SignField[]) => void }) {
  const [tool, setTool] = useState<SignFieldType | null>('signature')
  const update = (id: string, p: Partial<SignField>) => setFields(fields.map((f) => (f.id === id ? { ...f, ...p } : f)))
  const lastPage = Math.max(0, pages - 1)

  const quickSignDate = () => setFields([...fields,
    { ...makeField('signature', lastPage, 0.3, 0.86), x: 0.08, y: 0.84 }, { ...makeField('date', lastPage, 0.7, 0.86), x: 0.6, y: 0.865 }])
  const quickInitials = () => setFields([...fields, ...Array.from({ length: pages }, (_, p) => ({ ...makeField('initials', p, 0.9, 0.95), x: 0.86, y: 0.935 }))])

  const overlay = (page: number) => (
    <div className="h-full w-full" style={{ cursor: tool ? 'crosshair' : 'default' }}
      onPointerDown={(e) => {
        if (!tool || e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        setFields([...fields, makeField(tool, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, tool === 'text' ? 'Type here' : undefined)])
        setTool(null)
      }}>
      {fields.filter((f) => f.page === page).map((f) => (
        <div key={f.id} className={`absolute flex cursor-move select-none items-center justify-between overflow-hidden rounded border-2 px-1 text-[10px] font-semibold text-slate-800 ${tint[f.type]}`}
          style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, touchAction: 'none' }}
          onPointerDown={(e) => {
            e.stopPropagation()
            const el = e.currentTarget; el.setPointerCapture(e.pointerId)
            const r = (el.parentElement as HTMLElement).getBoundingClientRect()
            const sx = e.clientX, sy = e.clientY, ox = f.x, oy = f.y
            const move = (ev: PointerEvent) => update(f.id, { x: Math.min(Math.max(ox + (ev.clientX - sx) / r.width, 0), 1 - f.w), y: Math.min(Math.max(oy + (ev.clientY - sy) / r.height, 0), 1 - f.h) })
            const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
            el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
          }}>
          <span className="truncate">{f.type === 'text' ? (f.label || 'Text') : toolOf(f.type).label}</span>
          <button type="button" aria-label="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => setFields(fields.filter((x) => x.id !== f.id))} className="ml-1 rounded bg-white/80 p-0.5 text-slate-600 hover:text-red-600"><X size={10} /></button>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-2 space-y-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {FIELD_TOOLS.map((t) => (
            <button key={t.type} type="button" onClick={() => setTool(tool === t.type ? null : t.type)} title={t.hint} className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${tool === t.type ? 'border-[#3b4a35] bg-[#3b4a35] text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{t.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{tool ? <>Now <b>click the page</b> where the {toolOf(tool).label.toLowerCase()} goes.</> : 'Pick a kind, then click the page. Drag a box to move it, × to remove it.'}</span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={quickSignDate} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"><Wand2 size={11} /> Signature + date, last page</button>
            <button type="button" onClick={quickInitials} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"><Wand2 size={11} /> Initials on every page</button>
          </span>
        </div>
        {fields.some((f) => f.type === 'text') && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {fields.filter((f) => f.type === 'text').map((f, i) => (
              <label key={f.id} className="flex items-center gap-1 text-slate-600">Text line {i + 1} asks:
                <input value={f.label ?? ''} onChange={(e) => update(f.id, { label: e.target.value })} className="w-40 rounded border border-slate-300 px-1.5 py-1" />
              </label>
            ))}
          </div>
        )}
      </div>
      <PdfPages url={url} onLoaded={setPages} overlay={overlay} />
    </div>
  )
}
