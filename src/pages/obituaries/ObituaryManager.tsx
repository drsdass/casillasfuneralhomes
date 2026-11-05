import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookHeart, Check, Copy, ExternalLink, Flame, Image as ImageIcon, MessageSquare, Pin, Plus, Search, Trash2, X } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { Card } from '@/components/ui/Primitives'
import { shortLocationName } from '@/lib/company'
import { fmtDate, obituaries, PER_PAGE, type Obituary, type Tribute } from '@/lib/obituaries'

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')
const initials = (n: string) => n.replace(/["“”]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

export function Avatar({ name, url, size = 80 }: { name: string; url?: string; size?: number }) {
  return url
    ? <img src={url} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
    : <span style={{ width: size, height: size, fontSize: size * 0.36 }} className="grid shrink-0 place-items-center rounded-full bg-[#3b4a35]/10 font-semibold text-[#3b4a35]">{initials(name) || '·'}</span>
}

/** Staff side of the obituary pages: the list, and the editor for one obituary (text, photo, service times, publish, guest book). */
export default function ObituaryManager() {
  const { activeOrg, accessibleLocations, currentUser } = useSession()
  const orgId = activeOrg?.id ?? ''
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [loc, setLoc] = useState('')
  const [tab, setTab] = useState<'published' | 'draft'>('published')
  const [page, setPage] = useState(1)
  const routeState = useLocation().state as { open?: Obituary } | null
  const [editing, setEditing] = useState<Obituary | 'new' | null>(routeState?.open ?? null)
  useEffect(() => { const t = setTimeout(() => { setTerm(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const { data, isLoading, error } = useQuery({ queryKey: ['obituaries', orgId, term, loc, tab, page], queryFn: () => obituaries.list({ orgId, q: term, locationId: loc || undefined, status: tab, page }), enabled: !!orgId })
  const { data: counts } = useQuery({ queryKey: ['obituary-counts', orgId], queryFn: () => obituaries.counts(orgId), enabled: !!orgId })
  const locName = (id?: string) => { const l = accessibleLocations.find((x) => x.id === id); return l ? shortLocationName(l.name) : '' }
  const total = data?.total ?? 0
  const from = total ? (page - 1) * PER_PAGE + 1 : 0
  const to = Math.min(page * PER_PAGE, total)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['obituaries'] }); qc.invalidateQueries({ queryKey: ['obituary-counts'] }) }
  const publicList = `${window.location.origin}/obituaries?org=${orgId}`

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><BookHeart size={24} className="text-[#3b4a35]" /> Obituaries</h1>
          <p className="text-sm text-slate-500">The public obituary pages for your families. Anything you publish here appears on the public site, with a guest book and candles.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={publicList} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><ExternalLink size={15} /> View public site</a>
          <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b4a35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><Plus size={16} /> New obituary</button>
        </div>
      </div>

      {!!counts?.pending && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><MessageSquare size={18} /> {counts.pending} guest book message{counts.pending > 1 ? 's are' : ' is'} waiting for approval. Open an obituary to approve or remove them.</div>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search obituaries" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base" />
          </div>
          <select value={loc} onChange={(e) => { setLoc(e.target.value); setPage(1) }} aria-label="Choose location" className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base">
            <option value="">All locations</option>
            {accessibleLocations.filter((l) => !activeOrg || l.orgId === activeOrg.id).map((l) => <option key={l.id} value={l.id}>{shortLocationName(l.name)}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {([['published', 'Published', counts?.published], ['draft', 'Drafts', counts?.draft]] as const).map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => { setTab(k); setPage(1) }} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === k ? 'bg-[#3b4a35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}{n != null ? ` (${n})` : ''}</button>
            ))}
          </div>
          <div className="text-sm text-slate-500">{total ? `Showing ${from} to ${to} of ${total.toLocaleString()}` : ''}</div>
        </div>
      </Card>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{msg(error)} — has <code>obituaries.sql</code> been run in Supabase?</div>}
      {isLoading && <div className="py-12 text-center text-slate-400">Loading…</div>}
      {!isLoading && !error && total === 0 && <div className="py-12 text-center text-slate-400">{term ? 'No obituaries match that search.' : tab === 'draft' ? 'No drafts.' : 'Nothing published yet. Start from a case, or press New obituary.'}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(data?.items ?? []).map((o) => (
          <button key={o.id} type="button" onClick={() => setEditing(o)} className="relative flex flex-col items-center rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:border-[#3b4a35]/40 hover:shadow">
            {o.pinned && <Pin size={14} className="absolute right-3 top-3 text-slate-400" />}
            <Avatar name={o.name} url={o.photoUrl} />
            <div className="mt-3 line-clamp-2 min-h-[2.6rem] text-base font-medium leading-snug text-slate-900">{o.name}</div>
            <div className="mt-1 text-sm text-slate-500">{fmtDate(o.deathDate) || fmtDate(o.publishedAt)}</div>
            <span className={`mt-3 rounded-full px-3 py-1 text-xs font-medium ${o.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{o.status === 'published' ? 'Published' : 'Draft'}</span>
            <div className="mt-3 w-full truncate border-t border-slate-100 pt-2 text-xs text-slate-500">{locName(o.locationId) || activeOrg?.name}</div>
          </button>
        ))}
      </div>

      {total > PER_PAGE && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">← Newer</button>
          <span className="text-sm text-slate-500">Page {page} of {Math.ceil(total / PER_PAGE)}</span>
          <button type="button" disabled={page * PER_PAGE >= total} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40">Older →</button>
        </div>
      )}

      {editing && <Editor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} orgId={orgId} defaultLocation={loc || currentUser?.locationIds?.[0] || ''} by={currentUser?.name ?? ''} onClose={() => setEditing(null)} onChanged={refresh} />}
    </div>
  )
}

function Editor({ initial, orgId, defaultLocation, by, onClose, onChanged }: { initial: Obituary | null; orgId: string; defaultLocation: string; by: string; onClose: () => void; onChanged: () => void }) {
  const { accessibleLocations, activeOrg } = useSession()
  const qc = useQueryClient()
  const [o, setO] = useState<Obituary>(initial ?? { id: '', orgId, slug: '', name: '', body: '', serviceInfo: '', status: 'draft', pinned: false, locationId: defaultLocation || undefined, createdAt: '', updatedAt: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const set = (p: Partial<Obituary>) => setO((x) => ({ ...x, ...p }))
  const { data: tributes = [] } = useQuery({ queryKey: ['obituary-tributes', o.id], queryFn: () => obituaries.tributes(o.id), enabled: !!o.id })
  const refreshT = () => { qc.invalidateQueries({ queryKey: ['obituary-tributes', o.id] }); onChanged() }

  const save = async (status?: Obituary['status']) => {
    if (!o.name.trim()) { setErr('Please enter the name.'); return }
    setErr(''); setBusy('Saving…')
    try {
      const saved = await obituaries.save({ ...o, status: status ?? o.status, orgId }, by)
      setO(saved); onChanged()
      if (status) onClose()
    } catch (e) { setErr(msg(e)) }
    setBusy('')
  }
  const pick = async (f: File) => { setErr(''); setBusy('Uploading the picture…'); try { set({ photoUrl: await obituaries.uploadPhoto(orgId, f) }) } catch (e) { setErr(msg(e)) } setBusy('') }
  const del = async () => { if (!initial || !confirm(`Delete the obituary for ${o.name}? It disappears from the public site.`)) return; try { await obituaries.remove(initial); onChanged(); onClose() } catch (e) { setErr(msg(e)) } }
  const link = o.id ? obituaries.publicLink(o) : ''
  const cls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base'
  const lbl = 'mb-1 block text-sm font-medium text-slate-700'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-slate-900">{initial ? 'Edit obituary' : 'New obituary'}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="space-y-4 p-5">
          {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
          {busy && <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">{busy}</div>}

          <div className="flex items-center gap-4">
            <Avatar name={o.name || '?'} url={o.photoUrl} size={96} />
            <div className="space-y-2">
              <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><ImageIcon size={16} /> {o.photoUrl ? 'Change picture' : 'Add a picture'}</button>
              {o.photoUrl && <button type="button" onClick={() => set({ photoUrl: undefined })} className="ml-2 text-sm text-slate-500 underline">Remove</button>}
              <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
            </div>
          </div>

          <div><label className={lbl}>Name</label><input className={cls} value={o.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name as it should appear" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className={lbl}>Born</label><input type="date" className={cls} value={o.birthDate?.slice(0, 10) ?? ''} onChange={(e) => set({ birthDate: e.target.value || undefined })} /></div>
            <div><label className={lbl}>Passed away</label><input type="date" className={cls} value={o.deathDate?.slice(0, 10) ?? ''} onChange={(e) => set({ deathDate: e.target.value || undefined })} /></div>
            <div><label className={lbl}>Location</label>
              <select className={cls} value={o.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value || undefined })}>
                <option value="">—</option>
                {accessibleLocations.filter((l) => !activeOrg || l.orgId === activeOrg.id).map((l) => <option key={l.id} value={l.id}>{shortLocationName(l.name)}</option>)}
              </select>
            </div>
          </div>
          <div><label className={lbl}>Obituary</label><textarea className={`${cls} min-h-[220px] leading-relaxed`} value={o.body} onChange={(e) => set({ body: e.target.value })} placeholder="Write or paste the obituary. A blank line starts a new paragraph." /></div>
          <div><label className={lbl}>Services (shown on the page)</label><textarea className={`${cls} min-h-[90px]`} value={o.serviceInfo} onChange={(e) => set({ serviceInfo: e.target.value })} placeholder={'Visitation: Friday 5–8 PM — Chapel\nService: Saturday 10 AM'} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={o.pinned} onChange={(e) => set({ pinned: e.target.checked })} className="h-4 w-4" /> Keep at the top of the public list</label>

          {o.id && o.status === 'published' && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <input readOnly value={link} className="min-w-0 flex-1 bg-transparent text-sm text-slate-600 outline-none" />
              <button type="button" onClick={() => { void navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }} className="inline-flex items-center gap-1 text-sm font-medium text-[#3b4a35]">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}</button>
              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[#3b4a35]"><ExternalLink size={15} /> Open</a>
            </div>
          )}

          {o.id && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><Flame size={16} className="text-amber-500" /> Guest book &amp; candles <span className="font-normal text-slate-500">({tributes.length})</span></div>
              {tributes.length === 0 && <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">Nothing yet. Messages and candles from visitors show here.</div>}
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {tributes.map((t: Tribute) => (
                  <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                    <span className={`mt-0.5 shrink-0 ${t.kind === 'candle' ? 'text-amber-500' : 'text-slate-400'}`}>{t.kind === 'candle' ? <Flame size={18} /> : <MessageSquare size={18} />}</span>
                    <div className="min-w-0 flex-1 text-sm"><div className="font-medium text-slate-900">{t.name}{!t.approved && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Waiting for approval</span>}</div>{t.message && <div className="whitespace-pre-wrap text-slate-600">{t.message}</div>}<div className="text-xs text-slate-400">{fmtDate(t.createdAt)}</div></div>
                    {!t.approved && <button type="button" onClick={() => obituaries.approve(t, true).then(refreshT)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>}
                    <button type="button" aria-label="Remove" onClick={() => { if (confirm('Remove this message?')) void obituaries.removeTribute(t).then(refreshT) }} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            {initial && <button type="button" onClick={del} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 size={15} /> Delete</button>}
            {o.caseId && <Link to={`/cases/${o.caseId}`} className="text-sm text-slate-500 underline">Open the case</Link>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!!busy} onClick={() => save()} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Save</button>
            {o.status === 'published'
              ? <button type="button" disabled={!!busy} onClick={() => save('draft')} className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100">Unpublish</button>
              : <button type="button" disabled={!!busy} onClick={() => save('published')} className="rounded-lg bg-[#3b4a35] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4d5f45]">Publish</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
