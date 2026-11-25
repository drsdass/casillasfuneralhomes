import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { Shell } from '@/pages/obituaries/PublicObituaries'
import { dayParts, fmtWhen, publicEvents, type SiteEvent } from '@/lib/siteEvents'

/** /events — the public events page: upcoming events with a sign-up form. No sign-in. */
export function PublicEvents() {
  const [sp] = useSearchParams()
  const org = sp.get('org') ?? undefined
  const { data, isLoading, isError } = useQuery({ queryKey: ['public-events', org], queryFn: () => publicEvents.list(org) })
  const upcoming = (data?.items ?? []).filter((e) => new Date(e.endsAt ?? e.startsAt).getTime() >= Date.now())
  return (
    <Shell orgName={data?.orgName}>
      <h1 className="font-serif text-3xl text-stone-900">Events</h1>
      <p className="mt-1 text-stone-500">Gatherings for our community. Everyone is welcome.</p>
      {isLoading && <div className="py-16 text-center text-stone-400">Loading…</div>}
      {isError && <div className="py-16 text-center text-stone-500">The events could not be loaded right now. Please try again in a moment.</div>}
      {!isLoading && !isError && upcoming.length === 0 && <div className="py-16 text-center text-stone-400">There are no upcoming events right now. Please check back soon.</div>}
      <div className="mt-6 space-y-5">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
    </Shell>
  )
}

function EventCard({ e }: { e: SiteEvent }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ name: '', email: '', phone: '', guests: 1, hp: '' })
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const left = e.capacity ? Math.max(0, e.capacity - (e.attending ?? 0)) : null
  const full = left === 0
  const send = useMutation({
    mutationFn: () => publicEvents.rsvp(e.id, v),
    onSuccess: () => { setDone(true); setErr(''); qc.invalidateQueries({ queryKey: ['public-events'] }) },
    onError: (x) => setErr(x instanceof Error ? x.message : 'Something went wrong.'),
  })
  const { mon, day } = dayParts(e.startsAt)
  const cls = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-base'
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col sm:flex-row">
        {e.photoUrl && <img src={e.photoUrl} alt="" className="h-44 w-full object-cover sm:h-auto sm:w-60" />}
        <div className="flex flex-1 gap-4 p-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-stone-100 text-center leading-none"><div><div className="text-xs font-semibold tracking-wide text-amber-700">{mon}</div><div className="mt-1 font-serif text-2xl text-stone-900">{day}</div></div></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl text-stone-900">{e.title}</h2>
            <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-600"><CalendarDays size={15} /> {fmtWhen(e.startsAt, e.endsAt)}</div>
            {e.place && <div className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-600"><MapPin size={15} /> {e.place}</div>}
            {e.description && <p className="mt-3 whitespace-pre-wrap leading-relaxed text-stone-700">{e.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {e.rsvpOpen && !full && !done && !open && <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-stone-800 px-5 py-3 text-base font-semibold text-white hover:bg-stone-900">Reserve a place</button>}
              {full && <span className="rounded-lg bg-stone-100 px-4 py-2.5 text-sm text-stone-600">This event is full</span>}
              {!e.rsvpOpen && <span className="rounded-lg bg-stone-100 px-4 py-2.5 text-sm text-stone-600">Sign-up is closed</span>}
              {left != null && !full && <span className="inline-flex items-center gap-1.5 text-sm text-stone-500"><Users size={14} /> {left} place{left === 1 ? '' : 's'} left</span>}
            </div>
            {done && <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thank you, {v.name.split(' ')[0]}. Your place is reserved. We look forward to seeing you.</div>}
            {open && !done && (
              <div className="mt-4 space-y-3 rounded-xl bg-stone-50 p-4">
                <input className={cls} placeholder="Your name" value={v.name} maxLength={80} onChange={(x) => setV({ ...v, name: x.target.value })} />
                <div className="grid gap-3 sm:grid-cols-2"><input className={cls} placeholder="Email" type="email" value={v.email} onChange={(x) => setV({ ...v, email: x.target.value })} /><input className={cls} placeholder="Phone" type="tel" value={v.phone} onChange={(x) => setV({ ...v, phone: x.target.value })} /></div>
                <label className="flex items-center gap-3 text-sm text-stone-700">How many people? <input type="number" min={1} max={10} className="w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 text-base" value={v.guests} onChange={(x) => setV({ ...v, guests: Math.min(10, Math.max(1, Number(x.target.value) || 1)) })} /></label>
                <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={v.hp} onChange={(x) => setV({ ...v, hp: x.target.value })} />
                {err && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
                <div className="flex gap-2"><button type="button" disabled={!v.name.trim() || (!v.email.trim() && !v.phone.trim()) || send.isPending} onClick={() => send.mutate()} className="rounded-lg bg-stone-800 px-5 py-3 text-base font-semibold text-white hover:bg-stone-900 disabled:opacity-50">{send.isPending ? 'Sending…' : 'Reserve'}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-3 text-sm text-stone-500">Cancel</button></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
