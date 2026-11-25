-- When a case is moved to another location, its invoice (contract) and calendar events move too.
create or replace function move_case_children() returns trigger language plpgsql security definer as $$
begin
  if new.location_id is distinct from old.location_id then
    update contracts set location_id = new.location_id where case_id = new.id;
    update calendar_events set location_id = new.location_id where case_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_move_case_children on cases;
create trigger trg_move_case_children after update of location_id on cases
  for each row execute function move_case_children();
-- Tidy up cases already moved earlier so everything lines up now.
update contracts k set location_id = c.location_id from cases c where k.case_id = c.id and k.location_id <> c.location_id;
update calendar_events e set location_id = c.location_id from cases c where e.case_id = c.id and e.location_id <> c.location_id;
notify pgrst, 'reload schema';
