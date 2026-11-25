-- Saves what staff filled in on each Statement of Funeral Goods and Services tab, per case.
create table if not exists case_statements (
  case_id uuid not null references cases(id) on delete cascade,
  sheet text not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references staff_members(id),
  updated_at timestamptz not null default now(),
  primary key (case_id, sheet)
);
alter table case_statements enable row level security;
drop policy if exists "case_statements_all" on case_statements;
create policy "case_statements_all" on case_statements for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
  with check (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'case_statements') then
    alter publication supabase_realtime add table public.case_statements;
  end if;
end $$;
notify pgrst, 'reload schema';
