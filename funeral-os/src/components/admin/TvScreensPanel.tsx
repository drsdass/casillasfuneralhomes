import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Check, Monitor, RefreshCw, Power, Trash2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { tvScreens, type TvScreen } from '@/lib/tvBoard'
import { useSession } from '@/context/SessionContext'
import { Card } from '@/components/ui/Primitives'
import { format, parseISO } from 'date-fns'

const linkFor = (s: TvScreen) => `${window.location.origin}/tv/${s.token}`

/** Admin → TV Screens: one private link per wall monitor. The monitor opens it once and shows the board with no login. */
export function TvScreensPanel() {
  const { activeOrg } = useSession()
  const qc = useQueryClient()
  const { data: screens = [] } = useQuery({ queryKey: ['tv-screens'], queryFn: tvScreens.list, refetchInterval: 30_000 })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations })
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['tv-screens'] })
  const add = useMutation({
    mutationFn: () => tvScreens.create(activeOrg!.id, name.trim(), locationId || undefined),
    onSuccess: () => { setName(''); setErr(''); refresh() },
    onError: (e) => setErr((e as Error).message || 'Could not add the screen. Has tv-screens.sql been run in Supabase?'),
  })
  const toggle = useMutation({ mutationFn: (s: TvScreen) => tvScreens.setActive(s.id, !s.active), onSuccess: refresh })
  const fresh = useMutation({ mutationFn: (s: TvScreen) => tvScreens.newLink(s.id), onSuccess: refresh })
  const del = useMutation({ mutationFn: (s: TvScreen) => tvScreens.remove(s.id), onSuccess: refresh })
  const locName = (id?: string) => { const l = locations.find((x) => x.id === id); return l ? l.name.split('—')[1]?.trim() ?? l.name : undefined }
  const copy = async (s: TvScreen) => { try { await navigator.clipboard.writeText(linkFor(s)); setCopied(s.id); setTimeout(() => setCopied(null), 2000) } catch { window.prompt('Copy this link:', linkFor(s)) } }
  const seen = (s: TvScreen) => {
    if (!s.lastSeenAt) return { text: 'Never opened', ok: false }
    const mins = (Date.now() - new Date(s.lastSeenAt).getTime()) / 60000
    return { text: mins < 3 ? 'Showing now' : `Last seen ${format(parseISO(s.lastSeenAt), 'MMM d, HH:mm')}`, ok: mins < 3 }
  }

  return (
    <div>
      <p className="text-sm text-slate-600 max-w-2xl mb-4">
        One private link per wall monitor. Open the link once on that monitor's computer and it shows the TV Board with no login — nothing to expire,
        no staff account tied to it. It can only view the board. Each location's cases are color-coded. If a screen is ever lost or moved,
        make a <b>new link</b> and the old one stops working at once.
      </p>
      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Screen name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cathedral City office" className="border border-slate-200 rounded-md px-3 py-2 text-sm w-64" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hangs at</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
              <option value="">— choose location —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()} className="inline-flex items-center gap-1.5 text-sm font-medium bg-[#3b4a35] text-white rounded-md px-3.5 py-2 disabled:opacity-50"><Plus size={14} /> Add screen</button>
        </div>
        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      </Card>

      <div className="space-y-3">
        {screens.map((s) => {
          const st = seen(s)
          return (
            <Card key={s.id} className={`p-4 ${s.active ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Monitor size={18} className="text-[#3b4a35]" />
                <div className="font-medium text-slate-900">{s.name}</div>
                {locName(s.locationId) && <span className="text-xs border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">{locName(s.locationId)}</span>}
                <span className={`text-xs ${st.ok ? 'text-emerald-700' : 'text-slate-500'}`}>{s.active ? st.text : 'Turned off'}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button onClick={() => copy(s)} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 rounded-md px-2.5 py-1.5 hover:bg-slate-50">{copied === s.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy link</>}</button>
                  <button onClick={() => { if (window.confirm('Make a new link? The old link stops working right away, and the monitor must open the new one.')) fresh.mutate(s) }} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 rounded-md px-2.5 py-1.5 hover:bg-slate-50"><RefreshCw size={12} /> New link</button>
                  <button onClick={() => toggle.mutate(s)} className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-300 rounded-md px-2.5 py-1.5 hover:bg-slate-50"><Power size={12} /> {s.active ? 'Turn off' : 'Turn on'}</button>
                  <button onClick={() => { if (window.confirm(`Delete the screen "${s.name}"? Its link stops working.`)) del.mutate(s) }} className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md px-2.5 py-1.5 hover:bg-red-50"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 break-all select-all">{linkFor(s)}</div>
            </Card>
          )
        })}
        {screens.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">No screens yet. Add one above — one per wall monitor.</div>}
      </div>
    </div>
  )
}
