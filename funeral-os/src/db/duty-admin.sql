-- Lets a super admin switch someone else On duty / Off duty (Admin -> Staff). Run ONCE in the Supabase SQL editor (safe to repeat).
-- Only super admins can do it, only for people in the companies they can work in, and each change is written to the audit log.
-- The person can still switch themselves back; this is a convenience, not a lock.

create or replace function set_staff_duty(p_staff uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  me record;
  target record;
begin
  select id, role, org_id into me from staff_members where id = auth.uid();
  if me.id is null or me.role <> 'super_admin' then
    raise exception 'Only a super admin can change someone else''s duty status.';
  end if;
  select id, name, org_id into target from staff_members where id = p_staff;
  if target.id is null or target.org_id not in (select my_org_ids()) then
    raise exception 'That person is not in a company you can manage.';
  end if;

  insert into staff_notification_prefs (staff_id, on_duty, updated_at) values (p_staff, p_on, now())
  on conflict (staff_id) do update set on_duty = p_on, updated_at = now();

  insert into audit_log (entity_type, entity_id, action, summary, changed_by, org_id)
  values ('staff', p_staff, 'update',
          'Switched ' || target.name || (case when p_on then ' On duty' else ' Off duty' end),
          auth.uid(), target.org_id);
end;
$$;
revoke all on function set_staff_duty(uuid, boolean) from public;
grant execute on function set_staff_duty(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
