import { useState } from 'react'
import { ChevronDown, ChevronRight, StickyNote } from 'lucide-react'
import type { SheetDef } from '@/lib/sheetEngine'

/** Price lists and reminders that sit beside a tab in the order workbook (columns AI and beyond). Shown for that tab only, never printed. */
export function TabNotes({ sheet }: { sheet: SheetDef }) {
  const [open, setOpen] = useState(false)
  const notes = sheet.notes ?? []
  if (notes.length === 0) return null
  return (
    <div className="no-print rounded-md border border-amber-200 bg-amber-50/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-amber-900">
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<StickyNote size={15} /> Notes for {sheet.name.trim()} <span className="font-normal text-amber-800/70">({notes.length} lines — price lists and reminders, not part of the printed form)</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-amber-200 px-3 py-2">
          <table className="text-sm text-slate-800">
            <tbody>
              {notes.map((row, i) => (
                <tr key={i} className="align-top">
                  {row.map((cell, j) => <td key={j} className="whitespace-nowrap py-0.5 pr-5">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
