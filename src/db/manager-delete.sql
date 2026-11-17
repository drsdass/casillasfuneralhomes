-- Lets managers permanently delete a case (admins and super admins already could).
-- A manager can only delete cases at a location they have access to. Every delete is still written to the Audit Log,
-- and the app still asks for three confirmations. Paste into the Supabase SQL editor and run once. Safe to run again.
drop policy if exists "cases_delete_manager" on cases;
create policy "cases_delete_manager" on cases for delete
  using (
    exists (select 1 from staff_members s where s.id = auth.uid() and s.org_id = cases.org_id and s.role = 'manager')
    and has_location_access(location_id)
  );
