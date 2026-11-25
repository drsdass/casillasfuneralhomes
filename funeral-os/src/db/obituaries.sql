-- Obituaries: the public obituary pages + guest book + candles, managed from the OS (replaces the paid obituary website).
-- Paste into the Supabase SQL editor and run once. Safe to run again.

create table if not exists obituaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  slug text not null unique,                 -- the public address: /obituaries/<slug>
  name text not null,
  birth_date date,
  death_date date,
  photo_url text,
  body text not null default '',
  service_info text not null default '',     -- visitation / service times and places, shown on the page
  status text not null default 'draft',      -- draft | published
  pinned boolean not null default false,
  published_at timestamptz,
  source text not null default 'os',         -- os | import
  external_id text,                          -- id on the old site (so an import never duplicates)
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists obituaries_external_key on obituaries (org_id, external_id) where external_id is not null;
create index if not exists obituaries_list_idx on obituaries (org_id, status, published_at desc);
create index if not exists obituaries_case_idx on obituaries (case_id);
alter table obituaries enable row level security;
drop policy if exists "obituaries_staff" on obituaries;
create policy "obituaries_staff" on obituaries for all
  using (org_id = current_user_org_id()) with check (org_id = current_user_org_id());

-- Guest book messages and candles left by the public. They are written ONLY by the public-obituary function
-- (nobody can write to this table from a browser), and a guest book message shows only after staff approve it.
create table if not exists obituary_tributes (
  id uuid primary key default gen_random_uuid(),
  obituary_id uuid not null references obituaries(id) on delete cascade,
  kind text not null default 'guestbook',    -- guestbook | candle
  name text not null,
  message text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists obituary_tributes_idx on obituary_tributes (obituary_id, created_at desc);
alter table obituary_tributes enable row level security;
drop policy if exists "obituary_tributes_staff" on obituary_tributes;
create policy "obituary_tributes_staff" on obituary_tributes for all
  using (exists (select 1 from obituaries o where o.id = obituary_id and o.org_id = current_user_org_id()))
  with check (exists (select 1 from obituaries o where o.id = obituary_id and o.org_id = current_user_org_id()));

-- photos (published obituaries are public, so the photo bucket is public to read; only signed-in staff can add)
insert into storage.buckets (id, name, public) values ('obituary-photos', 'obituary-photos', true) on conflict (id) do nothing;
drop policy if exists "obituary_photos_write" on storage.objects;
create policy "obituary_photos_write" on storage.objects for all
  using (bucket_id = 'obituary-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'obituary-photos' and auth.role() = 'authenticated');

notify pgrst, 'reload schema';
