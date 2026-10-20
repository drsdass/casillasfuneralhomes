-- Practice cases: lets any staff member delete a case whose number starts with PRACTICE- (real cases stay admin-only).
-- Paste into the Supabase SQL editor and run once. Safe to run again.
drop policy if exists "cases_delete_practice" on cases;
create policy "cases_delete_practice" on cases for delete
  using (case_number like 'PRACTICE-%' and has_location_access(location_id));
