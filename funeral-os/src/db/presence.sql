-- "Who is online" dots: blue = online now, red = offline, with a phone icon when someone is on a phone.
-- Run ONCE in the Supabase SQL editor (safe to repeat).
--
-- Each open copy of the app says "I'm here" about once a minute. Someone counts as online if the database heard
-- from them in the last 3 minutes. A person can be online on a computer and a phone at the same time.

create table if not exists staff_presence (
  staff_id uuid not null references staff_members(id) on delete cascade,
  device text not null check (device in ('phone', 'computer')),
  last_seen timestamptz not null default now(),
  primary key (staff_id, device)
);
alter table staff_presence enable row level security;   -- no direct access; only the functions below

create or replace function touch_presence(p_device text)
returns void language sql security definer set search_path = public as $$
  insert into staff_presence (staff_id, device, last_seen)
  values (auth.uid(), case when p_device = 'phone' then 'phone' else 'computer' end, now())
  on conflict (staff_id, device) do update set last_seen = now();
$$;

-- Called when someone logs out, so they turn red right away.
create or replace function clear_presence()
returns void language sql security definer set search_path = public as $$
  delete from staff_presence where staff_id = auth.uid();
$$;

-- Presence for the company you are working in (plus owners/admins who work in both companies).
create or replace function presence_list()
returns table (staff_id uuid, device text, online boolean, last_seen timestamptz)
language sql security definer stable set search_path = public as $$
  select p.staff_id, p.device, p.last_seen > now() - interval '3 minutes', p.last_seen
  from staff_presence p
  join staff_members sm on sm.id = p.staff_id
  where sm.org_id = active_org_id()
     or (sm.all_companies and sm.role in ('admin', 'super_admin') and sm.org_id in (select my_org_ids()));
$$;

revoke all on function touch_presence(text), clear_presence(), presence_list() from public;
grant execute on function touch_presence(text), clear_presence(), presence_list() to authenticated;
notify pgrst, 'reload schema';
