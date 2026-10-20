-- Phone / computer notifications + the On duty / Off duty switch.
-- Run ONCE in the Supabase SQL editor (safe to repeat).
--
--  * push_subscriptions : one row per phone/computer that said "yes, send me notifications"
--  * staff_notification_prefs : each person's On duty switch and which kinds they want
--                               (new emails, messages, new cases / first calls, pickups)
-- Everything is private to the person: nobody can read or change someone else's settings.
-- The "off duty" list (just who is off, nothing else) is shared so the light can go grey for everyone.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff_members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text not null default 'computer',
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_staff on push_subscriptions (staff_id);
alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions for all
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

create table if not exists staff_notification_prefs (
  staff_id uuid primary key references staff_members(id) on delete cascade,
  on_duty boolean not null default true,
  notify_email boolean not null default true,
  notify_message boolean not null default true,
  notify_case boolean not null default true,
  notify_driver boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table staff_notification_prefs enable row level security;
drop policy if exists staff_notification_prefs_own on staff_notification_prefs;
create policy staff_notification_prefs_own on staff_notification_prefs for all
  using (staff_id = auth.uid()) with check (staff_id = auth.uid());

-- Who is off duty (so their light shows as off). Same company scope as the online list.
create or replace function off_duty_list()
returns table (staff_id uuid)
language sql security definer stable set search_path = public as $$
  select p.staff_id from staff_notification_prefs p
  join staff_members sm on sm.id = p.staff_id
  where not p.on_duty
    and (sm.org_id = active_org_id()
         or (sm.all_companies and sm.role in ('admin', 'super_admin') and sm.org_id in (select my_org_ids())));
$$;
revoke all on function off_duty_list() from public;
grant execute on function off_duty_list() to authenticated;
notify pgrst, 'reload schema';
