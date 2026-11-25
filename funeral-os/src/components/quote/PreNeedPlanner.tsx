import { useMemo, useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { Card, formatCurrency } from '@/components/ui/Primitives'
import type { Contract, DispositionType, GplItem } from '@/types'

/** Plain-language groups for the family, worked out from each price-list item's name (works with any price list). */
export const PLAN_GROUPS = [
  'Packages (direct cremation / immediate burial)',
  'Basic services & staff',
  'Transportation & vehicles',
  'Visitation, funeral & memorial facilities',
  'Casket, container & urn',
  'Cremation',
  'Burial & cemetery',
  'Memorial keepsakes',
  'Fees & cash advances',
  'Other items',
] as const
type PlanGroup = (typeof PLAN_GROUPS)[number]

export function planGroup(i: Pick<GplItem, 'name' | 'category'>): PlanGroup {
  const n = i.name.toLowerCase()
  if (/^(direct|immediate)\b/.test(n)) return PLAN_GROUPS[0]
  if (i.category === 'cash_advance') return PLAN_GROUPS[8]
  if (/\bcaskets?\b|container|\burns?\b|shipping/.test(n)) return PLAN_GROUPS[4]
  if (/transfer|hearse|vehicle|escort|transportation|second man|forwarding|receiving|mailing/.test(n)) return PLAN_GROUPS[2]
  if (/cremat|ashes/.test(n)) return PLAN_GROUPS[5]
  if (/burial|marker|vault|grave|cemetery|interment|entomb|crypt|niche|headstone/.test(n)) return PLAN_GROUPS[6]
  if (i.category === 'facility') return PLAN_GROUPS[3]
  if (/folder|register|crucifix|rosary|flower|prayer card|video|music|guest|keepsake|memorial/.test(n)) return PLAN_GROUPS[7]
  if (i.category === 'service') return PLAN_GROUPS[1]
  if (i.category === 'merchandise') return PLAN_GROUPS[7]
  return PLAN_GROUPS[9]
}

/** The usual starting items; the family then chooses the casket / urn / extras themselves. Matched by name so it works with any price list. */
const STARTERS: Record<'burial' | 'cremation', RegExp[]> = {
  burial: [/^basic services/i, /transfer of deceased/i, /^embalming/i, /^dressing, cosmetics/i, /^hearse/i, /facilities for visitation/i, /facilities for funeral ceremony/i, /^dca fee/i],
  cremation: [/^basic services/i, /transfer of deceased/i, /^cremation$/i, /alternate container/i, /^dca fee/i],
}

interface Props {
  contract: Contract | undefined
  gplItems: GplItem[]
  canEdit: boolean
  disposition: DispositionType
  onToggle: (item: GplItem, lineItemId?: string) => void
  onAddMany: (items: GplItem[]) => Promise<void>
  onSetDisposition: (d: DispositionType) => void
}

export function PreNeedPlanner({ contract, gplItems, canEdit, disposition, onToggle, onAddMany, onSetDisposition }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const lines = contract?.lineItems ?? []
  const lineFor = (id: string) => lines.find((li) => li.gplItemId === id && !li.serviceOrderId)
  const active = useMemo(() => gplItems.filter((g) => g.active !== false), [gplItems])
  const groups = useMemo(() => PLAN_GROUPS.map((g) => ({ name: g, items: active.filter((i) => planGroup(i) === g) })).filter((g) => g.items.length), [active])
  const total = lines.reduce((s, li) => s + li.quantity * (li.unitPrice + (li.adjustmentAmount ?? 0)), 0)
  const chosen = lines.filter((li) => li.gplItemId && !li.serviceOrderId).length

  async function start(kind: 'burial' | 'cremation') {
    setBusy(true)
    try {
      onSetDisposition(kind)
      const picks = STARTERS[kind].map((re) => active.find((i) => re.test(i.name))).filter((i): i is GplItem => !!i && !lineFor(i.id))
      if (picks.length) await onAddMany(picks)
    } finally { setBusy(false) }
  }

  return (
    <Card className="p-5 no-print border-violet-200">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-violet-900">Pre-Need Plan — pick everything out ahead of time</h3>
          <p className="text-xs text-slate-500 mt-0.5">Tap an item to choose it. Everything chosen builds the itemized invoice below, with the prices from this location’s price list.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">{chosen} chosen</div>
          <div className="text-lg font-semibold text-slate-900">{formatCurrency(total)}</div>
        </div>
      </div>

      {canEdit && (
        <div className="mt-3 rounded-lg bg-violet-50 border border-violet-200 p-3">
          <div className="text-sm font-medium text-violet-900 flex items-center gap-1.5"><Sparkles size={14} /> Start with a typical plan, then choose the rest</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void start('burial')} className="text-sm rounded-md bg-violet-700 text-white px-3.5 py-2 hover:bg-violet-800 disabled:opacity-50">Burial plan</button>
            <button type="button" disabled={busy} onClick={() => void start('cremation')} className="text-sm rounded-md bg-violet-700 text-white px-3.5 py-2 hover:bg-violet-800 disabled:opacity-50">Cremation plan</button>
            <span className="text-xs text-slate-500 self-center">{busy ? 'Adding items…' : 'Adds the usual services only — the family still picks the casket or urn, flowers, keepsakes and extras. Review every line.'}</span>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {groups.map((g) => {
          const count = g.items.filter((i) => lineFor(i.id)).length
          const isOpen = open[g.name] ?? count > 0
          return (
            <div key={g.name} className="border border-slate-200 rounded-lg">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.name]: !isOpen }))} className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left">
                <span className="text-sm font-semibold text-slate-800">{g.name}</span>
                <span className="flex items-center gap-2 text-xs">
                  {count > 0 && <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{count} chosen</span>}
                  <span className="text-slate-400">{g.items.length} items</span>
                  <ChevronDown size={16} className={`text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isOpen && (
                <div className="px-2 pb-2 space-y-0.5">
                  {g.items.map((item) => {
                    const line = lineFor(item.id)
                    return (
                      <button key={item.id} type="button" disabled={!canEdit} onClick={() => onToggle(item, line?.id)}
                        className={`w-full flex items-center justify-between gap-3 text-left text-sm px-2.5 py-2.5 rounded-md border transition ${line ? 'bg-emerald-50 border-emerald-300' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}>
                        <span className="flex items-center gap-2.5 min-w-0 text-slate-800">
                          <span className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center ${line ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check size={13} strokeWidth={3} /></span>
                          <span>{item.name}</span>
                        </span>
                        <span className="shrink-0 font-medium text-slate-700">{formatCurrency(item.price)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {groups.length === 0 && <div className="text-sm text-slate-400 text-center py-6">No price list is set up for this location yet.</div>}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">Current disposition on file: <b className="capitalize">{disposition}</b>. Change it any time from Edit.</p>
    </Card>
  )
}
