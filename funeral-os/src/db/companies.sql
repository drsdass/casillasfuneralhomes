-- Sanders Funeral Home as its OWN company (separate from Casillas), seen by admins through a company switcher.
-- Paste into the Supabase SQL editor and run ONCE. (Safe to run again; it will not duplicate anything.)
--
-- How it works:
--   * Every staff member has a "home" company. Everything they see is limited to the company they are working in.
--   * Admins and super admins marked "can see all companies" may switch between companies (button in the sidebar).
--   * The website tells the database which company a browser tab is working in (header x-org-id). The database
--     only honours it if that person is allowed to see that company; otherwise it uses their home company.
--   * Because the existing security rules already call current_user_org_id(), has_location_access() and is_org_admin(),
--     changing those three functions walls off cases, families, staff, schedule, prices, etc. all at once.

-- 1. People who can switch companies ----------------------------------------------------------
alter table staff_members add column if not exists all_companies boolean not null default false;
alter table organizations add column if not exists logo_url text;

create or replace function my_org_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select sm.org_id from staff_members sm where sm.id = auth.uid()
  union
  select o.id from organizations o
   where exists (select 1 from staff_members sm where sm.id = auth.uid() and sm.all_companies and sm.role in ('admin', 'super_admin'));
$$;

create or replace function active_org_id()
returns uuid language plpgsql security definer stable set search_path = public as $$
declare want uuid; home uuid;
begin
  select org_id into home from staff_members where id = auth.uid();
  begin
    want := nullif(current_setting('request.headers', true)::json ->> 'x-org-id', '')::uuid;
  exception when others then
    want := null;
  end;
  if want is not null and want in (select my_org_ids()) then return want; end if;
  return home;
end;
$$;

create or replace function current_user_org_id()
returns uuid language sql security definer stable set search_path = public as $$
  select active_org_id();
$$;

create or replace function is_org_admin(check_org_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select check_org_id = active_org_id()
     and exists (select 1 from staff_members where id = auth.uid() and role in ('admin', 'super_admin'));
$$;

create or replace function has_location_access(check_location_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from locations l
    where l.id = check_location_id
      and l.org_id = active_org_id()
      and (
        exists (select 1 from staff_locations sl where sl.staff_id = auth.uid() and sl.location_id = l.id)
        or exists (select 1 from staff_members sm where sm.id = auth.uid() and sm.role in ('admin', 'super_admin'))
      )
  );
$$;

alter table organizations enable row level security;
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select using (id in (select my_org_ids()));

-- Your own staff row must always be readable (even while working in the other company).
drop policy if exists "staff_members_select" on staff_members;
create policy "staff_members_select" on staff_members for select
  using (id = auth.uid() or org_id = current_user_org_id());
drop policy if exists "staff_members_update" on staff_members;
create policy "staff_members_update" on staff_members for update
  using (id = auth.uid() or org_id = current_user_org_id())
  with check (id = auth.uid() or org_id = current_user_org_id());

-- Only a super admin may change roles, feature access, or who can see all companies.
create or replace function enforce_role_change_permission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     or new.disabled_features is distinct from old.disabled_features
     or new.all_companies is distinct from old.all_companies
     or new.org_id is distinct from old.org_id then
    if auth.uid() is not null and not exists (
      select 1 from staff_members s
      where s.id = auth.uid() and s.role = 'super_admin' and (s.org_id = old.org_id or s.all_companies)
    ) then
      raise exception 'Only a super_admin can change a user''s role, feature access or company.';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Audit log, email and mailbox belong to a company ---------------------------------------------
alter table audit_log add column if not exists org_id uuid default current_user_org_id();
update audit_log a set org_id = s.org_id from staff_members s where s.id = a.changed_by and a.org_id is null;

alter table inbound_emails add column if not exists org_id uuid references organizations(id) on delete cascade;

do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'mail_connection'::regclass and contype = 'c' loop
    execute format('alter table mail_connection drop constraint %I', c);
  end loop;
end $$;
alter table mail_connection add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table mail_connection add column if not exists tenant text; -- only if this mailbox is in a different Microsoft directory
create sequence if not exists mail_connection_id_seq owned by mail_connection.id;
select setval('mail_connection_id_seq', greatest((select coalesce(max(id), 0) from mail_connection), 1));
alter table mail_connection alter column id set default nextval('mail_connection_id_seq');
create unique index if not exists mail_connection_org_key on mail_connection (org_id);

-- 3. Create the Sanders company and move its data ------------------------------------------------------
do $$
declare
  casillas uuid;
  sanders uuid;
  sanders_locs uuid[];
begin
  select id into casillas from organizations where name not ilike 'Sanders%' order by created_at limit 1;
  select id into sanders from organizations where name ilike 'Sanders%' limit 1;
  if sanders is null then
    insert into organizations (name) values ('Sanders Funeral Home') returning id into sanders;
  end if;

  select array_agg(id) into sanders_locs from locations where name ilike 'Sanders%';
  if sanders_locs is null then raise exception 'No location named Sanders... was found.'; end if;

  update locations set org_id = sanders where id = any(sanders_locs);
  -- Sanders's real details (from the funeral home).
  update locations set address = '1835 E. St.', city = 'Eureka', state = 'CA', zip = '95501',
         phone = '(707) 442-2941', license_number = 'FD-320'
   where id = any(sanders_locs);
  update cases set org_id = sanders where location_id = any(sanders_locs);
  update gpl_items set org_id = sanders where location_id = any(sanders_locs);
  update vehicles set org_id = sanders where location_id = any(sanders_locs);
  update calendar_events set org_id = sanders where location_id = any(sanders_locs);

  -- Families only ever served at Sanders move with them (a family served by both stays with Casillas).
  update families f set org_id = sanders
   where exists (select 1 from cases c where c.family_id = f.id and c.location_id = any(sanders_locs))
     and not exists (select 1 from cases c where c.family_id = f.id and not (c.location_id = any(sanders_locs)));

  -- Sanders starts with its own copy of the standard task checklist (it can edit it independently).
  if not exists (select 1 from task_templates where org_id = sanders) then
    insert into task_templates (org_id, label, category, days_until_due, sort_order, active)
    select sanders, label, category, days_until_due, sort_order, active from task_templates where org_id = casillas;
  end if;

  -- Existing mail history and the current mailbox belong to Casillas.
  update inbound_emails e set org_id = coalesce((select c.org_id from cases c where c.id = e.case_id), casillas) where e.org_id is null;
  update mail_connection set org_id = casillas where org_id is null;
  update sync_state set key = 'inbox_last_synced:' || casillas::text where key = 'inbox_last_synced';
  update audit_log set org_id = casillas where org_id is null;

  -- Casillas admins and super admins may switch between both companies.
  update staff_members set all_companies = true where org_id = casillas and role in ('admin', 'super_admin');

  -- Kenny and Leticia: admins of Sanders only.
  update staff_members set org_id = sanders, all_companies = false
   where org_id = casillas and (name ilike 'Kenn%' or name ilike 'Leticia%');
  -- Anyone else who only ever worked at the Sanders location moves there too.
  update staff_members sm set org_id = sanders
   where sm.org_id = casillas and not sm.all_companies
     and exists (select 1 from staff_locations sl where sl.staff_id = sm.id and sl.location_id = any(sanders_locs))
     and not exists (select 1 from staff_locations sl where sl.staff_id = sm.id and not (sl.location_id = any(sanders_locs)));
  -- Sanders people only have Sanders locations.
  delete from staff_locations where staff_id in (select id from staff_members where org_id = sanders)
     and not (location_id = any(sanders_locs));
  insert into staff_locations (staff_id, location_id)
    select sm.id, l from staff_members sm cross join unnest(sanders_locs) l where sm.org_id = sanders
    on conflict do nothing;
end $$;

-- Mail and audit rules by company (the Sanders mailbox is connected separately from the Casillas one).
drop policy if exists "inbound_emails_select" on inbound_emails;
create policy "inbound_emails_select" on inbound_emails for select using (
  org_id = current_user_org_id()
  and (case_id is null or exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
);
drop policy if exists "inbound_emails_update" on inbound_emails;
create policy "inbound_emails_update" on inbound_emails for update using (
  org_id = current_user_org_id()
  and (case_id is null or exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
);
drop policy if exists "audit_log_select" on audit_log;
create policy "audit_log_select" on audit_log for select using (
  (case_id is not null and exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
  or (
    org_id = current_user_org_id()
    and exists (select 1 from staff_members where id = auth.uid() and role in ('admin', 'super_admin'))
  )
);

-- 4. Check: who is in which company now -------------------------------------------------------------------
select o.name as company, sm.name, sm.role, sm.all_companies as can_switch
from staff_members sm join organizations o on o.id = sm.org_id
order by o.name, sm.role, sm.name;
