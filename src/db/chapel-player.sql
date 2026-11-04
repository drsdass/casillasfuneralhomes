-- Chapel Player: video / music / pictures shown on the chapel TV, controlled from the tablet.
-- Paste into the Supabase SQL editor and run once. Safe to run again. (Run spotify.sql first — it creates the file bucket.)

-- The House library: YouTube links and files the funeral home keeps (hymns, slideshows, welcome loops).
create table if not exists house_media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  kind text not null default 'video',      -- video | audio | image
  source text not null default 'youtube',  -- youtube | file
  youtube_id text,
  storage_path text,
  mime text,
  size bigint not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists house_media_org_idx on house_media (org_id, created_at desc);
alter table house_media enable row level security;
drop policy if exists "house_media_all" on house_media;
create policy "house_media_all" on house_media for all
  using (org_id = current_user_org_id()) with check (org_id = current_user_org_id());

-- One "remote control" row per company. The tablet writes it; the Chapel Player page on the laptop follows it.
create table if not exists chapel_player (
  org_id uuid primary key references organizations(id) on delete cascade,
  queue jsonb not null default '[]',
  idx int not null default 0,
  playing boolean not null default false,
  seq int not null default 0,        -- bumped to restart the same item
  cmd jsonb,                         -- one-shot commands such as "skip 30 s"
  status jsonb,                      -- written by the player: position, length, errors
  heartbeat timestamptz,             -- written by the player so the tablet can tell it is open
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table chapel_player enable row level security;
drop policy if exists "chapel_player_all" on chapel_player;
create policy "chapel_player_all" on chapel_player for all
  using (org_id = current_user_org_id()) with check (org_id = current_user_org_id());

-- instant updates
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chapel_player') then
    alter publication supabase_realtime add table public.chapel_player;
  end if;
end $$;

notify pgrst, 'reload schema';
