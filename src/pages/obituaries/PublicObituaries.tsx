import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Copy, Flame, Mail, MapPin, Search } from 'lucide-react'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { brandFor } from '@/lib/company'
import { fmtDate, lifeSpan, publicObits, type PublicObit } from '@/lib/obituaries'

const initials = (n: string) => n.replace(/["“”]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
const Photo = ({ o, size, cls = '' }: { o: Pick<PublicObit, 'name' | 'photoUrl'>; size: number; cls?: string }) => o.photoUrl
  ? <img src={o.photoUrl} alt={o.name} style={{ width: size, height: size }} className={`shrink-0 rounded-full object-cover ${cls}`} />
  : <span style={{ width: size, height: size, fontSize: size * 0.34 }} className={`grid shrink-0 place-items-center rounded-full bg-stone-200 font-serif text-stone-600 ${cls}`}>{initials(o.name)}</span>

function Shell({ orgName, children }: { orgName?: string | null; children: React.ReactNode }) {
  const b = brandFor(orgName)
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <BrandLogo name={orgName ?? undefined} className="h-12 w-auto" />
          {b.website && <a href={`https://${b.website}`} className="text-sm text-stone-500 hover:text-stone-800">{b.website}</a>}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">{orgName ?? ''}</footer>
    </div>
  )
}

/** /obituaries — the public list. No sign-in. Search, choose a location, page through. */
export function PublicObituaries() {
  const [sp, setSp] = useSearchParams()
  const org = sp.get('org') ?? undefined
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [term, setTerm] = useState(q)
  const [loc, setLoc] = useState(sp.get('loc') ?? '')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setTerm(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const { data, isLoading, isError } = useQuery({ queryKey: ['public-obits', org, loc, term, page], queryFn: () => publicObits.list({ org, location: loc || undefined, q: term, page }), placeholderData: (p) => p })
  const nav = useNavigate()
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (data?.per ?? 20)))
  return (
    <Shell orgName={data?.orgName}>
      <h1 className="font-serif text-3xl text-stone-900">Obituaries</h1>
      <p className="mt-1 text-stone-500">In loving memory of those we have served.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="w-full rounded-lg border border-stone-300 bg-white py-3 pl-9 pr-3 text-base" />
        </div>
        {(data?.locations?.length ?? 0) > 1 && (
          <select value={loc} onChange={(e) => { setLoc(e.target.value); setPage(1); const n = new URLSearchParams(sp); loc || e.target.value ? n.set('loc', e.target.value) : n.delete('loc'); if (!e.target.value) n.delete('loc'); setSp(n, { replace: true }) }} aria-label="Choose location" className="rounded-lg border border-stone-300 bg-white px-3 py-3 text-base">
            <option value="">All locations</option>
            {data!.locations.map((l) => <option key={l.id} value={l.id}>{l.name.replace(/^(Casillas|Sanders) Funeral Home\s*[—-]\s*/, '')}</option>)}
          </select>
        )}
      </div>
      {total > 0 && <div className="mt-4 text-sm text-stone-500">{total.toLocaleString()} obituar{total === 1 ? 'y' : 'ies'}</div>}
      {isLoading && <div className="py-16 text-center text-stone-400">Loading…</div>}
      {isError && <div className="py-16 text-center text-stone-500">The obituaries could not be loaded right now. Please try again in a moment.</div>}
      {!isLoading && !isError && total === 0 && <div className="py-16 text-center text-stone-400">No obituaries found.</div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(data?.items ?? []).map((o) => (
          <button key={o.id} type="button" onClick={() => nav(`/obituaries/${o.slug}`)} className="flex flex-col items-center rounded-xl border border-stone-200 bg-white p-5 text-center shadow-sm transition hover:shadow-md">
            <Photo o={o} size={96} />
            <div className="mt-3 line-clamp-2 min-h-[3rem] font-serif text-lg leading-snug text-stone-900">{o.name}</div>
            <div className="mt-1 text-sm text-stone-500">{fmtDate(o.deathDate) || fmtDate(o.publishedAt)}</div>
          </button>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-40">← Newer</button>
          <span className="text-sm text-stone-500">Page {page} of {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-40">Older →</button>
        </div>
      )}
    </Shell>
  )
}

/** /obituaries/:slug — one obituary: photo, text, service times, candles and the guest book. */
export function PublicObituaryPage() {
  const { slug } = useParams<{ slug: string }>()
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['public-obit', slug], queryFn: () => publicObits.get(slug!), retry: false })
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [hp, setHp] = useState('')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const form = useRef<HTMLDivElement>(null)
  const send = useMutation({
    mutationFn: (kind: 'guestbook' | 'candle') => publicObits.tribute(slug!, { kind, name, message: kind === 'candle' ? '' : text, hp }),
    onSuccess: (r, kind) => {
      setNote(kind === 'candle' ? 'Your candle is lit. Thank you.' : r.pending ? 'Thank you. Your message will appear after the family’s funeral home approves it.' : 'Thank you for your message.')
      if (kind === 'guestbook') setText('')
      qc.invalidateQueries({ queryKey: ['public-obit', slug] })
    },
    onError: (e) => setNote(e instanceof Error ? e.message : 'Something went wrong.'),
  })
  const status = (error as { status?: number } | null)?.status
  const o = data?.obituary
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const paragraphs = (o?.body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const candles = data?.tributes.filter((t) => t.kind === 'candle') ?? []
  const messages = data?.tributes.filter((t) => t.kind === 'guestbook') ?? []
  const share = (href: string) => window.open(href, '_blank', 'noopener,noreferrer,width=640,height=560')

  return (
    <Shell orgName={data?.orgName}>
      <Link to={`/obituaries${o?.orgId ? `?org=${o.orgId}` : ''}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"><ArrowLeft size={15} /> All obituaries</Link>
      {isLoading && <div className="py-16 text-center text-stone-400">Loading…</div>}
      {error && <div className="py-16 text-center text-stone-500">{status === 404 ? 'This obituary was not found. It may have been removed.' : 'This page could not be loaded right now.'}</div>}
      {o && data && (
        <article className="mx-auto max-w-3xl">
          <div className="flex flex-col items-center text-center">
            <Photo o={o} size={168} cls="shadow-md ring-4 ring-white" />
            <h1 className="mt-5 font-serif text-4xl leading-tight text-stone-900">{o.name}</h1>
            {lifeSpan(o) && <div className="mt-2 text-lg text-stone-500">{lifeSpan(o)}</div>}
            {data.location && <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-stone-500"><MapPin size={14} /> {data.location.name.replace(/^(Casillas|Sanders) Funeral Home\s*[—-]\s*/, '')}</div>}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => form.current?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"><Flame size={16} /> Light a candle</button>
              <button type="button" onClick={() => share(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)} className="rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm hover:bg-stone-100">Share on Facebook</button>
              <button type="button" onClick={() => share(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`In memory of ${o.name}`)}`)} className="rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm hover:bg-stone-100">Share on X</button>
              <a href={`mailto:?subject=${encodeURIComponent(`In memory of ${o.name}`)}&body=${encodeURIComponent(url)}`} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm hover:bg-stone-100"><Mail size={15} /> Email</a>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm hover:bg-stone-100">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}</button>
            </div>
          </div>

          {paragraphs.length > 0 && <div className="mt-10 space-y-4 rounded-2xl bg-white p-7 text-lg leading-relaxed shadow-sm">{paragraphs.map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}</div>}

          {o.serviceInfo.trim() && (
            <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="font-serif text-xl text-stone-900">Services</h2>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed text-stone-700">{o.serviceInfo}</p>
              {data.location?.address && <p className="mt-3 text-sm text-stone-500">{[data.location.address, data.location.city, data.location.state].filter(Boolean).join(', ')}{data.location.phone ? ` · ${data.location.phone}` : ''}</p>}
            </section>
          )}

          <section ref={form} className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="font-serif text-2xl text-stone-900">Share a memory</h2>
            <p className="text-sm text-stone-500">Light a candle, or leave a message for the family.</p>
            <div className="mt-4 space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base" />
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message (optional for a candle)" maxLength={1500} className="min-h-[110px] w-full rounded-lg border border-stone-300 px-3 py-3 text-base" />
              <input value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" name="website" />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!name.trim() || send.isPending} onClick={() => send.mutate('candle')} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-3 text-base font-semibold text-white hover:bg-amber-600 disabled:opacity-50"><Flame size={17} /> Light a candle</button>
                <button type="button" disabled={!name.trim() || text.trim().length < 2 || send.isPending} onClick={() => send.mutate('guestbook')} className="rounded-lg bg-stone-800 px-5 py-3 text-base font-semibold text-white hover:bg-stone-900 disabled:opacity-50">Sign the guest book</button>
              </div>
              {note && <div className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-700">{note}</div>}
            </div>
          </section>

          {candles.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 font-serif text-xl text-stone-900">{candles.length} candle{candles.length > 1 ? 's' : ''} lit</h2>
              <div className="flex flex-wrap gap-2">{candles.map((c) => <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm text-amber-900"><Flame size={14} className="text-amber-500" /> {c.name}</span>)}</div>
            </section>
          )}
          {messages.length > 0 && (
            <section className="mt-6 space-y-3">
              <h2 className="font-serif text-xl text-stone-900">Guest book</h2>
              {messages.map((m) => (
                <div key={m.id} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="whitespace-pre-wrap leading-relaxed text-stone-800">{m.message}</div>
                  <div className="mt-2 text-sm text-stone-500">— {m.name} · {fmtDate(m.createdAt)}</div>
                </div>
              ))}
            </section>
          )}
        </article>
      )}
    </Shell>
  )
}
