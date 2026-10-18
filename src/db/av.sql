-- Service AV: music in the chapel + live stream for families.
-- Paste into the Supabase SQL editor and run once. Safe to run again.
--
-- How it works: staff (or a family "remote" link) press buttons in the OS. Each press becomes a row in
-- av_commands. A small program on the chapel computer (the "bridge") picks the rows up and drives the
-- cameras (OBS) and speakers (Sonos), then reports back. The database itself refuses a camera view the
-- family has turned off, so no button, link or bug can put it on the stream.

-- ---------------------------------------------------------------------------
-- One row per location: its live player, speaker rooms, and the key the chapel computer signs in with.
-- ---------------------------------------------------------------------------
create table if not exists av_locations (
  location_id uuid primary key references locations(id) on delete cascade,
  bridge_key text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  player_embed_url text,                         -- the embed address of this chapel's live player (Cloudflare Stream, Mux, Vimeo...)
  bridge_last_seen timestamptz,
  bridge_info jsonb not null default '{}'::jsonb  -- what the bridge last reported (OBS connected? speakers found?)
);

-- ---------------------------------------------------------------------------
-- One row per case: what is allowed on the stream, the links, and what is happening right now.
-- ---------------------------------------------------------------------------
create table if not exists service_av (
  case_id uuid primary key references cases(id) on delete cascade,
  stream_allowed boolean not null default true,
  show_casket boolean not null default true,
  show_audience boolean not null default true,
  record_service boolean not null default true,
  pin text,
  link_expires_at timestamptz,
  watch_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  remote_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  remote_enabled boolean not null default false,
  remote_music boolean not null default true,
  remote_cameras boolean not null default false,
  live boolean not null default false,
  live_started_at timestamptz,
  current_scene text,
  music_state text not null default 'stopped' check (music_state in ('playing', 'paused', 'stopped')),
  now_playing text,
  volume integer not null default 30 check (volume between 0 and 100),
  music_room text,
  replay_url text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Every button press, in order. The chapel computer works through the pending ones.
-- ---------------------------------------------------------------------------
create table if not exists av_commands (
  id bigint generated always as identity primary key,
  case_id uuid not null references cases(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  kind text not null check (kind in ('stream_start', 'stream_stop', 'scene', 'music_play', 'music_pause', 'music_resume', 'music_next', 'music_stop', 'volume')),
  payload jsonb not null default '{}'::jsonb,
  requested_by text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists av_commands_pending on av_commands (location_id, status, id);

-- ---------------------------------------------------------------------------
-- THE PRIVACY LOCK. Runs on every new command, whoever sent it (staff, family remote, anything).
-- ---------------------------------------------------------------------------
create or replace function av_enforce_privacy() returns trigger language plpgsql as $$
declare s service_av%rowtype;
begin
  if new.kind in ('scene', 'stream_start') then
    select * into s from service_av where case_id = new.case_id;
    if not found then
      raise exception 'Set up this service first (open the Service Room for the case).';
    end if;
    if new.kind = 'stream_start' and not s.stream_allowed then
      raise exception 'This family has turned the live stream off.';
    end if;
    if new.kind = 'scene' then
      if (new.payload->>'scene') = 'front' and not s.show_casket then
        raise exception 'The front view (casket and altar) is turned off for this family.';
      end if;
      if (new.payload->>'scene') = 'audience' and not s.show_audience then
        raise exception 'The audience view is turned off for this family.';
      end if;
      if (new.payload->>'scene') not in ('speaker', 'front', 'audience', 'slate') then
        raise exception 'Unknown camera view.';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists av_commands_privacy on av_commands;
create trigger av_commands_privacy before insert on av_commands for each row execute function av_enforce_privacy();

-- ---------------------------------------------------------------------------
-- Access: staff who can see the case's location. The bridge key is only for admins.
-- ---------------------------------------------------------------------------
alter table av_locations enable row level security;
alter table service_av enable row level security;
alter table av_commands enable row level security;

drop policy if exists "av_locations_admin" on av_locations;
create policy "av_locations_admin" on av_locations for all
  using (exists (select 1 from locations l where l.id = location_id and is_org_admin(l.org_id)))
  with check (exists (select 1 from locations l where l.id = location_id and is_org_admin(l.org_id)));

drop policy if exists "service_av_staff" on service_av;
create policy "service_av_staff" on service_av for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
  with check (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

drop policy if exists "av_commands_staff_select" on av_commands;
create policy "av_commands_staff_select" on av_commands for select
  using (has_location_access(location_id));
drop policy if exists "av_commands_staff_insert" on av_commands;
create policy "av_commands_staff_insert" on av_commands for insert
  with check (has_location_access(location_id));

-- Staff can see whether the chapel computer is online and a player is set up, without ever seeing the key.
create or replace function av_location_status(loc uuid)
returns table (bridge_online boolean, player_configured boolean, bridge_info jsonb)
language sql security definer stable as $$
  select coalesce(a.bridge_last_seen > now() - interval '30 seconds', false),
         coalesce(a.player_embed_url, '') <> '',
         coalesce(a.bridge_info, '{}'::jsonb)
  from locations l left join av_locations a on a.location_id = l.id
  where l.id = loc and has_location_access(l.id);
$$;
