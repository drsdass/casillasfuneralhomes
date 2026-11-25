-- Spotify (Premium) control from the OS + Family media (music / video a family brings on a USB drive).
-- Paste into the Supabase SQL editor and run once. Safe to run again.

-- ── Spotify: one shared house account, connected once by an admin ───────────────────────────────────────────────────────
create table if not exists spotify_links (
  org_id uuid primary key references organizations(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  spotify_user text,
  connected_by text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table spotify_links enable row level security;   -- no policies: only the cloud functions can read the tokens

create table if not exists spotify_oauth_states (
  state text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now()
);
alter table spotify_oauth_states enable row level security;

-- so Spotify honours the same room lock as Sonos
alter table sonos_links add column if not exists locked_names text[] not null default '{}';

-- ── Family media: files a family brings (USB drive) — stored per case, played from the OS ───────────────────────────────
create table if not exists case_media (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  name text not null,                 -- shown to staff, e.g. "Mom's favorite songs.mp3"
  kind text not null default 'audio', -- audio | video | image
  mime text,
  size bigint not null default 0,
  storage_path text not null,
  sort int not null default 0,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists case_media_case_idx on case_media (case_id, sort, created_at);
alter table case_media enable row level security;
drop policy if exists "case_media_all" on case_media;
create policy "case_media_all" on case_media for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
  with check (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

-- private bucket for the files themselves
insert into storage.buckets (id, name, public) values ('case-media', 'case-media', false) on conflict (id) do nothing;
drop policy if exists "case_media_bucket_all" on storage.objects;
create policy "case_media_bucket_all" on storage.objects for all
  using (bucket_id = 'case-media' and auth.role() = 'authenticated')
  with check (bucket_id = 'case-media' and auth.role() = 'authenticated');

notify pgrst, 'reload schema';
