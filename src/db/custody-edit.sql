-- Lets managers and above correct the date/time, location or note of a custody entry (needed when old files are being entered),
-- or remove one that was entered by mistake. Every edit is stamped on the row and also written to the Activity log.
-- Run once in the Supabase SQL editor.

alter table custody_log add column if not exists edited_at timestamptz;
alter table custody_log add column if not exists edited_by_name text;

drop policy if exists "custody_log_update" on custody_log;
create policy "custody_log_update" on custody_log for update
  using (
    exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id))
    and exists (select 1 from staff_members where id = auth.uid() and role in ('manager', 'admin', 'super_admin'))
  )
  with check (
    exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id))
    and exists (select 1 from staff_members where id = auth.uid() and role in ('manager', 'admin', 'super_admin'))
  );

drop policy if exists "custody_log_delete" on custody_log;
create policy "custody_log_delete" on custody_log for delete
  using (
    exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id))
    and exists (select 1 from staff_members where id = auth.uid() and role in ('manager', 'admin', 'super_admin'))
  );

notify pgrst, 'reload schema';
