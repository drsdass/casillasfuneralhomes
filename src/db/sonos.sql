-- Sonos music control from the OS (cloud-side: no computer has to stay on).
-- Paste into the Supabase SQL editor and run once. Safe to run again.
--
-- The OS asks Sonos' own cloud service to play / pause / change the volume of the speakers. The only thing stored is the
-- permission Sonos gave the OS when an admin pressed "Connect Sonos" (a token). It is readable ONLY by the cloud
-- functions (no policies = nobody in the browser can read it).

create table if not exists sonos_links (
  org_id uuid primary key references organizations(id) on delete cascade,
  household_id text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_by text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sonos_links enable row level security;

-- Short-lived "I am connecting Sonos" notes so the return trip from Sonos can be matched to the company that asked.
create table if not exists sonos_oauth_states (
  state text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now()
);
alter table sonos_oauth_states enable row level security;

notify pgrst, 'reload schema';
