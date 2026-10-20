-- Easy view follows the person to any computer.
-- Paste into the Supabase SQL editor and run once. Safe to run again.
alter table staff_members add column if not exists easy_view boolean;

create or replace function set_my_easy_view(v boolean)
returns void language sql security definer set search_path = public as $$
  update staff_members set easy_view = v where id = auth.uid();
$$;
grant execute on function set_my_easy_view(boolean) to authenticated;
