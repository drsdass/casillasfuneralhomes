-- Keeps each company's audit trail (activity log) separate. Run ONCE in the Supabase SQL editor (safe to repeat).
-- Older entries were tagged with the company of the PERSON who did the action, so Joel's work on a Sanders case
-- counted as Casillas. This re-tags every entry by what the action was ABOUT.

-- Anything about a case belongs to that case's company.
update audit_log a set org_id = c.org_id from cases c
 where a.case_id = c.id and a.org_id is distinct from c.org_id;

-- Entries about staff, families, vendors, task checklists and case tasks follow the thing they changed.
update audit_log a set org_id = s.org_id from staff_members s
 where a.entity_type = 'staff' and a.case_id is null and a.entity_id = s.id and a.org_id is distinct from s.org_id;
update audit_log a set org_id = f.org_id from families f
 where a.entity_type = 'family' and a.case_id is null and a.entity_id = f.id and a.org_id is distinct from f.org_id;
update audit_log a set org_id = v.org_id from vendors v
 where a.entity_type = 'vendor' and a.case_id is null and a.entity_id = v.id and a.org_id is distinct from v.org_id;
update audit_log a set org_id = t.org_id from task_templates t
 where a.entity_type = 'task' and a.case_id is null and a.entity_id = t.id and a.org_id is distinct from t.org_id;
update audit_log a set org_id = c.org_id from case_tasks ct join cases c on c.id = ct.case_id
 where a.entity_type = 'task' and a.case_id is null and a.entity_id = ct.id and a.org_id is distinct from c.org_id;

-- The rule: you only ever see the company you are working in. Admins see all of its entries;
-- others see entries for cases at their locations. Someone with only Sanders access can never see Casillas entries.
drop policy if exists "audit_log_select" on audit_log;
create policy "audit_log_select" on audit_log for select using (
  org_id = current_user_org_id()
  and (
    (case_id is not null and exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
    or exists (select 1 from staff_members where id = auth.uid() and role in ('admin', 'super_admin'))
  )
);

-- Check: entries per company
select o.name as company, count(*) as entries
from audit_log a left join organizations o on o.id = a.org_id
group by o.name order by o.name;
