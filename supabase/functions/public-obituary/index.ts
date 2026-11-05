// supabase/functions/public-obituary/index.ts
//
// The public face of the obituary pages. Anyone on the internet may call it, so it only ever returns PUBLISHED obituaries
// and APPROVED guest book messages, and the only thing it lets the public write is a guest book message or a candle.
//
// Body: { action: 'list', org?, location?, q?, page? }            -> published obituaries (20 per page)
//       { action: 'get', slug }                                   -> one published obituary + its approved tributes
//       { action: 'events', org? }                                -> published events with how many have signed up
//       { action: 'rsvp', eventId, name, email, phone, guests, hp } -> sign up for an event
//       { action: 'tribute', slug, kind, name, message, hp }      -> leave a candle (shows at once) or a guest book message (staff approve)
//
// Deploy via the Supabase Dashboard, name it exactly "public-obituary", and turn OFF "Verify JWT".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const PER = 20
const pub = 'id, org_id, location_id, slug, name, birth_date, death_date, photo_url, published_at, pinned'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  try {
    const b = await req.json()
    if (b.action === 'list') {
      const page = Math.max(1, Number(b.page) || 1)
      let q = db.from('obituaries').select(pub, { count: 'exact' }).eq('status', 'published')
      if (typeof b.org === 'string' && b.org) q = q.eq('org_id', b.org)
      if (typeof b.location === 'string' && b.location) q = q.eq('location_id', b.location)
      if (typeof b.q === 'string' && b.q.trim()) q = q.ilike('name', `%${b.q.trim().replace(/[%_,()]/g, ' ').slice(0, 60)}%`)
      const { data, count, error } = await q.order('pinned', { ascending: false }).order('published_at', { ascending: false, nullsFirst: false }).range((page - 1) * PER, page * PER - 1)
      if (error) return json({ error: error.message }, 500)
      const locIds = [...new Set((data ?? []).map((o: any) => o.location_id).filter(Boolean))]
      let locs: any[] = []
      if (typeof b.org === 'string' && b.org) locs = (await db.from('locations').select('id, name').eq('org_id', b.org).eq('active', true)).data ?? []
      else if (locIds.length) locs = (await db.from('locations').select('id, name').in('id', locIds)).data ?? []
      const org = typeof b.org === 'string' && b.org ? (await db.from('organizations').select('name').eq('id', b.org).maybeSingle()).data?.name ?? null : null
      return json({ items: data ?? [], total: count ?? 0, page, per: PER, locations: locs, orgName: org })
    }

    if (b.action === 'get') {
      const { data: o } = await db.from('obituaries').select(`${pub}, body, service_info`).eq('slug', String(b.slug ?? '')).eq('status', 'published').maybeSingle()
      if (!o) return json({ error: 'This obituary was not found.' }, 404)
      const [{ data: t }, { data: org }, { data: loc }] = await Promise.all([
        db.from('obituary_tributes').select('id, kind, name, message, created_at').eq('obituary_id', o.id).eq('approved', true).order('created_at', { ascending: false }).limit(300),
        db.from('organizations').select('name').eq('id', o.org_id).maybeSingle(),
        o.location_id ? db.from('locations').select('name, address, city, state, phone').eq('id', o.location_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      return json({ obituary: o, tributes: t ?? [], orgName: org?.name ?? null, location: loc ?? null })
    }

    if (b.action === 'tribute') {
      if (b.hp) return json({ ok: true })                                  // a bot filled the hidden field: pretend it worked
      const kind = b.kind === 'candle' ? 'candle' : 'guestbook'
      const name = String(b.name ?? '').trim().slice(0, 80)
      const message = String(b.message ?? '').trim().slice(0, 1500)
      if (!name) return json({ error: 'Please enter your name.' }, 400)
      if (kind === 'guestbook' && message.length < 2) return json({ error: 'Please write a message.' }, 400)
      if (/https?:\/\/|www\./i.test(message)) return json({ error: 'Messages cannot contain links.' }, 400)
      const { data: o } = await db.from('obituaries').select('id').eq('slug', String(b.slug ?? '')).eq('status', 'published').maybeSingle()
      if (!o) return json({ error: 'This obituary was not found.' }, 404)
      const since = new Date(Date.now() - 3600_000).toISOString()
      const { count } = await db.from('obituary_tributes').select('id', { count: 'exact', head: true }).eq('obituary_id', o.id).gte('created_at', since)
      if ((count ?? 0) >= 40) return json({ error: 'Too many messages right now. Please try again later.' }, 429)
      const { error } = await db.from('obituary_tributes').insert({ obituary_id: o.id, kind, name, message, approved: kind === 'candle' })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, pending: kind === 'guestbook' })
    }
    if (b.action === 'events') {
      let q = db.from('site_events').select('id, org_id, location_id, title, description, starts_at, ends_at, place, photo_url, capacity, rsvp_open').eq('status', 'published')
      if (typeof b.org === 'string' && b.org) q = q.eq('org_id', b.org)
      const { data, error } = await q.order('starts_at', { ascending: true }).limit(200)
      if (error) return json({ error: error.message }, 500)
      const ids = (data ?? []).map((e: any) => e.id)
      const counts = new Map<string, number>()
      if (ids.length) for (const r of (await db.from('site_event_rsvps').select('event_id, guests').in('event_id', ids)).data ?? []) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + Number(r.guests ?? 1))
      const org = typeof b.org === 'string' && b.org ? (await db.from('organizations').select('name').eq('id', b.org).maybeSingle()).data?.name ?? null : null
      return json({ items: (data ?? []).map((e: any) => ({ ...e, attending: counts.get(e.id) ?? 0 })), orgName: org })
    }

    if (b.action === 'rsvp') {
      if (b.hp) return json({ ok: true })
      const name = String(b.name ?? '').trim().slice(0, 80)
      const email = String(b.email ?? '').trim().slice(0, 120)
      const phone = String(b.phone ?? '').trim().slice(0, 30)
      const guests = Math.min(10, Math.max(1, Math.floor(Number(b.guests) || 1)))
      if (!name) return json({ error: 'Please enter your name.' }, 400)
      if (!email && !phone) return json({ error: 'Please give an email or a phone number so we can reach you.' }, 400)
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'That email address does not look right.' }, 400)
      const { data: ev } = await db.from('site_events').select('id, capacity, rsvp_open, starts_at').eq('id', String(b.eventId ?? '')).eq('status', 'published').maybeSingle()
      if (!ev) return json({ error: 'This event was not found.' }, 404)
      if (!ev.rsvp_open) return json({ error: 'Sign-up for this event is closed.' }, 400)
      const taken = ((await db.from('site_event_rsvps').select('guests').eq('event_id', ev.id)).data ?? []).reduce((n: number, r: any) => n + Number(r.guests ?? 1), 0)
      if (ev.capacity && taken + guests > ev.capacity) return json({ error: ev.capacity - taken > 0 ? `Only ${ev.capacity - taken} place(s) are left.` : 'This event is full.' }, 400)
      const since = new Date(Date.now() - 3600_000).toISOString()
      const { count } = await db.from('site_event_rsvps').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).gte('created_at', since)
      if ((count ?? 0) >= 60) return json({ error: 'Too many sign-ups right now. Please try again later.' }, 429)
      const { error } = await db.from('site_event_rsvps').insert({ event_id: ev.id, name, email: email || null, phone: phone || null, guests })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }
    return json({ error: 'Unknown request.' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong.' }, 500)
  }
})
