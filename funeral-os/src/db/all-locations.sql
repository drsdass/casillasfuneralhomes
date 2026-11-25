-- Everyone sees the cases of ALL locations of their own company (Casillas: Cathedral City, Desert Hot Springs, Coachella).
-- Run once in the Supabase SQL editor. Safe to run again. Sanders stays separate: people are only linked to locations of their own company.

-- 1. Link every staff member to every location of their company.
insert into staff_locations (staff_id, location_id)
select sm.id, l.id
from staff_members sm
join locations l on l.org_id = sm.org_id
on conflict do nothing;

-- 2. Keep it that way: a new staff member is linked to all locations of their company...
create or replace function link_staff_to_all_locations() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into staff_locations (staff_id, location_id)
  select new.id, l.id from locations l where l.org_id = new.org_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists staff_all_locations on staff_members;
create trigger staff_all_locations after insert on staff_members for each row execute function link_staff_to_all_locations();

-- 3. ...and a new location is linked to every staff member of that company.
create or replace function link_location_to_all_staff() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into staff_locations (staff_id, location_id)
  select sm.id, new.id from staff_members sm where sm.org_id = new.org_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists location_all_staff on locations;
create trigger location_all_staff after insert on locations for each row execute function link_location_to_all_staff();

select l.name, count(*) as staff_linked from staff_locations sl join locations l on l.id = sl.location_id group by l.name order by l.name;
