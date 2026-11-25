-- Public events for the website (grief support circles, pre-planning seminars, open houses ...) with sign-up (RSVP).
-- Paste into the Supabase SQL editor and run once. Safe to run again. Then re-deploy the "public-obituary" function (Verify JWT OFF).

create table if not exists site_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  place text not null default '',
  photo_url text,
  capacity int,                              -- null = no limit
  rsvp_open boolean not null default true,
  status text not null default 'draft',      -- draft | published
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_events_idx on site_events (org_id, status, starts_at);
alter table site_events enable row level security;
drop policy if exists "site_events_staff" on site_events;
create policy "site_events_staff" on site_events for all
  using (org_id = current_user_org_id()) with check (org_id = current_user_org_id());

-- Sign-ups: written ONLY by the public-obituary function; staff read them.
create table if not exists site_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references site_events(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  guests int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists site_event_rsvps_idx on site_event_rsvps (event_id, created_at);
alter table site_event_rsvps enable row level security;
drop policy if exists "site_event_rsvps_staff" on site_event_rsvps;
create policy "site_event_rsvps_staff" on site_event_rsvps for all
  using (exists (select 1 from site_events e where e.id = event_id and e.org_id = current_user_org_id()))
  with check (exists (select 1 from site_events e where e.id = event_id and e.org_id = current_user_org_id()));

notify pgrst, 'reload schema';
