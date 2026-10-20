-- Keeps a case's STATUS and its Chain of Custody STAGE in step, wherever the change is made.
--   * Moving a case to "Completed" or "Shipped Out / Released"  ->  status becomes Completed.
--   * Setting a case's status to Completed                      ->  it moves to the Completed column.
--   * Moving a finished case back to an earlier stage            ->  status goes back to In Progress.
--   * Changing a finished case's status back to anything else    ->  it moves back to Funeral Home.
-- Run once in the Supabase SQL editor. Also tidies existing cases (see the last statement).

create or replace function sync_case_status_custody() returns trigger language plpgsql as $$
declare
  old_done boolean := old.custody_stage in ('completed', 'shipped_released');
  new_done boolean := new.custody_stage in ('completed', 'shipped_released');
begin
  if new.custody_stage is distinct from old.custody_stage then
    -- the case was moved on Chain of Custody
    if new_done and new.status <> 'completed' then
      new.status := 'completed';
    elsif old_done and not new_done and new.status = 'completed' and new.status = old.status then
      new.status := 'in_progress';
    end if;
  elsif new.status is distinct from old.status then
    -- the status was changed (Edit case, etc.)
    if new.status = 'completed' and not new_done then
      new.custody_stage := 'completed';
      insert into custody_log (case_id, from_stage, to_stage, moved_by, note)
        values (new.id, old.custody_stage, 'completed', auth.uid(), 'Moved automatically: case marked Completed');
    elsif old.status = 'completed' and new.status <> 'completed' and new_done then
      new.custody_stage := 'funeral_home';
      insert into custody_log (case_id, from_stage, to_stage, moved_by, note)
        values (new.id, old.custody_stage, 'funeral_home', auth.uid(), 'Moved automatically: case reopened');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sync_case_status_custody_t on cases;
create trigger sync_case_status_custody_t before update of status, custody_stage on cases
  for each row execute function sync_case_status_custody();

-- One-time tidy: cases already sitting in Completed / Shipped Out but not marked Completed.
update cases set status = 'completed' where custody_stage in ('completed', 'shipped_released') and status <> 'completed';
-- And the other way round: cases marked Completed but not in a finished column.
update cases set custody_stage = 'completed' where status = 'completed' and custody_stage not in ('completed', 'shipped_released');
