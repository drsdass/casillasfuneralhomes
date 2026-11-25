import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Download, ExternalLink, Image as ImageIcon, Trash2, Users, X } from 'lucide-react'
import { useSession } from '@/context/SessionContext'
import { Card } from '@/components/ui/Primitives'
import { fmtWhen, fromLocalInput, siteEvents, toLocalInput, type SiteEvent } from '@/lib/siteEvents'

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

/** Staff side of the public Events page: create events, publish them, and see who signed up. */
export default function EventsManager() {
  const { activeOrg, currentUser } = useSession()
  const orgId = activeOrg?.id ?? ''
  const qc = useQueryClient()
  const [tab, setTab] = useState<'upcoming' | 'past' | 'draft'>('upcoming')
  const [editing, setEditing] = useState<SiteEvent | 'new' | null>(null)
  const { data: all = [], isLoading, error } = useQuery({ queryKey: ['site-events', orgId], queryFn: () => siteEvents.list(orgId), enabled: !!orgId })
  const { data: counts = {} } = useQuery({
    queryKey: ['site-event-counts', orgId, all.length],
    queryFn: async () => { const m: Record<string, number> = {}; for (const e of all) m[e.id] = (await siteEvents.rsvps(e.id)).reduce((n, r) => n + r.guests, 0); return m },
    enabled: all.length > 0,
  })
  const now = Date.now()
  const upcoming = all.filter((e) => e.status === 'published' && new Date(e.endsAt ?? e.startsAt).getTime() >= now)
  const past = all.filter((e) => e.status === 'published' && new Date(e.endsAt ?? e.startsAt).getTime() < now).reverse()
  const draft = all.filter((e) => e.status === 'draft')
  const shown = tab === 'upcoming' ? upcoming : tab === 'past' ? past : draft
  const refresh = () => qc.invalidateQueries({ queryKey: ['site-events'] })

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><CalendarPlus size={24} className="text-[#3b4a35]" /> Website events</h1>
          <p className="text-sm text-slate-500">Grief support circles, seminars, open houses. Published events show on the public site with a sign-up form.</p>
        </div>
        <div className="flex gap-2">
          <a href={`${window.location.origin}/events?org=${orgId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><ExternalLink size={15} /> View public page</a>
          <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b4a35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#4d5f45]"><CalendarPlus size={16} /> New event</button>
        </div>
      </div>

      <div className="flex gap-2">
        {([['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length], ['draft', 'Drafts', draft.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === k ? 'bg-[#3b4a35] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l} ({n})</button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{msg(error)} — has <code>site-events.sql</code> been run in Supabase?</div>}
      {isLoading && <div className="py-10 text-center text-slate-400">Loading…</div>}
      {!isLoading && !error && shown.length === 0 && <div className="py-10 text-center text-slate-400">Nothing here.</div>}
      <div className="space-y-3">
        {shown.map((e) => (
          <Card key={e.id} className="p-4">
            <button type="button" onClick={() => setEditing(e)} className="flex w-full items-center gap-4 text-left">
              {e.photoUrl ? <img src={e.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[#3b4a35]/10 text-[#3b4a35]"><CalendarPlus size={26} /></span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-slate-900">{e.title}</span>
                <span className="block text-sm text-slate-500">{fmtWhen(e.startsAt, e.endsAt)}</span>
                {e.place && <span className="block truncate text-sm text-slate-500">{e.place}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${e.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{e.status === 'published' ? 'Published' : 'Draft'}</span>
                <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Users size={14} /> {counts[e.id] ?? 0}{e.capacity ? ` / ${e.capacity}` : ''}</span>
              </span>
            </button>
          </Card>
        ))}
      </div>
      {editing && <Editor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} orgId={orgId} by={currentUser?.name ?? ''} onClose={() => setEditing(null)} onChanged={refresh} />}
    </div>
  )
}

function Editor({ initial, orgId, by, onClose, onChanged }: { initial: SiteEvent | null; orgId: string; by: string; onClose: () => void; onChanged: () => void }) {
  const [e, setE] = useState<SiteEvent>(initial ?? { id: '', orgId, title: '', description: '', startsAt: '', place: '', rsvpOpen: true, status: 'draft' })
  const [start, setStart] = useState(toLocalInput(initial?.startsAt))
  const [end, setEnd] = useState(toLocalInput(initial?.endsAt))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const set = (p: Partial<SiteEvent>) => setE((x) => ({ ...x, ...p }))
  const { data: rsvps = [], refetch } = useQuery({ queryKey: ['site-rsvps', e.id], queryFn: () => siteEvents.rsvps(e.id), enabled: !!e.id })
  const total = rsvps.reduce((n, r) => n + r.guests, 0)

  const save = async (status: SiteEvent['status']) => {
    if (!e.title.trim()) return setErr('Please enter a title.')
    if (!start) return setErr('Please choose the start date and time.')
    setErr(''); setBusy('Saving…')
    try { await siteEvents.save({ ...e, orgId, status, startsAt: fromLocalInput(start), endsAt: end ? fromLocalInput(end) : undefined }, by); onChanged(); onClose() } catch (x) { setErr(msg(x)) }
    setBusy('')
  }
  const csv = () => {
    const url = URL.createObjectURL(new Blob([siteEvents.csv(e, rsvps)], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `${e.title.replace(/[^a-z0-9]+/gi, '-')}-signups.csv`; a.click(); URL.revokeObjectURL(url)
  }
  const cls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base'
  const lbl = 'mb-1 block text-sm font-medium text-slate-700'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div className="text-lg font-semibold text-slate-900">{initial ? 'Edit event' : 'New event'}</div><button type="button" aria-label="Close" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
        <div className="space-y-4 p-5">
          {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
          {busy && <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">{busy}</div>}
          <div><label className={lbl}>Title</label><input className={cls} value={e.title} onChange={(x) => set({ title: x.target.value })} placeholder="Grief Support Circle" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Starts</label><input type="datetime-local" className={cls} value={start} onChange={(x) => setStart(x.target.value)} /></div>
            <div><label className={lbl}>Ends (optional)</label><input type="datetime-local" className={cls} value={end} onChange={(x) => setEnd(x.target.value)} /></div>
          </div>
          <div><label className={lbl}>Where</label><input className={cls} value={e.place} onChange={(x) => set({ place: x.target.value })} placeholder="Chapel Hall, 82-991 Grapefruit Blvd, Coachella" /></div>
          <div><label className={lbl}>Details</label><textarea className={`${cls} min-h-[120px]`} value={e.description} onChange={(x) => set({ description: x.target.value })} placeholder="What the event is, who it is for, what to bring." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Room for (blank = no limit)</label><input type="number" min={1} className={cls} value={e.capacity ?? ''} onChange={(x) => set({ capacity: x.target.value ? Number(x.target.value) : undefined })} /></div>
            <label className="mt-6 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4" checked={e.rsvpOpen} onChange={(x) => set({ rsvpOpen: x.target.checked })} /> Sign-up is open</label>
          </div>
          <div className="flex items-center gap-3">
            {e.photoUrl ? <img src={e.photoUrl} alt="" className="h-16 w-24 rounded-lg object-cover" /> : <span className="grid h-16 w-24 place-items-center rounded-lg bg-slate-100 text-slate-400"><ImageIcon size={22} /></span>}
            <button type="button" onClick={() => file.current?.click()} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{e.photoUrl ? 'Change picture' : 'Add a picture'}</button>
            {e.photoUrl && <button type="button" onClick={() => set({ photoUrl: undefined })} className="text-sm text-slate-500 underline">Remove</button>}
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (x) => { const f = x.target.files?.[0]; x.target.value = ''; if (!f) return; setBusy('Uploading…'); try { set({ photoUrl: await siteEvents.uploadPhoto(orgId, f) }) } catch (er) { setErr(msg(er)) } setBusy('') }} />
          </div>

          {e.id && (
            <div>
              <div className="mb-2 flex items-center justify-between"><div className="text-sm font-semibold text-slate-900">Signed up: {total} {total === 1 ? 'person' : 'people'}</div>{rsvps.length > 0 && <button type="button" onClick={csv} className="inline-flex items-center gap-1 text-sm font-medium text-[#3b4a35]"><Download size={15} /> Download list</button>}</div>
              {rsvps.length === 0 ? <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">No sign-ups yet.</div> : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {rsvps.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1"><div className="font-medium text-slate-900">{r.name} <span className="font-normal text-slate-500">· {r.guests} {r.guests === 1 ? 'guest' : 'guests'}</span></div><div className="truncate text-slate-500">{[r.email, r.phone].filter(Boolean).join(' · ')}</div></div>
                      <button type="button" aria-label={`Remove ${r.name}`} onClick={() => { if (confirm(`Remove ${r.name}?`)) void siteEvents.removeRsvp(r).then(() => { void refetch(); onChanged() }) }} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
          <div>{initial && <button type="button" onClick={() => { if (confirm(`Delete “${e.title}”?`)) void siteEvents.remove(initial).then(() => { onChanged(); onClose() }) }} className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 size={15} /> Delete</button>}</div>
          <div className="flex gap-2">
            {e.status === 'published'
              ? <><button type="button" disabled={!!busy} onClick={() => save('published')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Save</button><button type="button" disabled={!!busy} onClick={() => save('draft')} className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">Unpublish</button></>
              : <><button type="button" disabled={!!busy} onClick={() => save('draft')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Save draft</button><button type="button" disabled={!!busy} onClick={() => save('published')} className="rounded-lg bg-[#3b4a35] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4d5f45]">Publish</button></>}
          </div>
        </div>
      </div>
    </div>
  )
}
