-- TV Screens: a private link for each wall monitor, so it shows the TV Board with no login.
-- Paste into the Supabase SQL editor and run once. Safe to run again.
--
-- Each screen has a long random token. The wall monitor opens  <site>/tv/<token>  and the "tv-board" cloud function
-- checks the token and returns ONLY what the board shows (names, dates, order checkmarks, special requests).
-- Turning a screen off or making a new link stops the old address at once.

create table if not exists tv_screens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,   -- where this monitor hangs (shown in its header)
  name text not null,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

alter table tv_screens enable row level security;
drop policy if exists "tv_screens_admin" on tv_screens;
create policy "tv_screens_admin" on tv_screens for all
  using (is_org_admin(org_id))
  with check (is_org_admin(org_id));

notify pgrst, 'reload schema';
