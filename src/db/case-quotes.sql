-- Quotes: a saved copy (snapshot) of what was priced on the Orders tab, so a family can be given more than one
-- and each one stays exactly as it was sent even if the order forms change later.
create table if not exists case_quotes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  number int not null,                              -- 1, 2, 3 ... within this case
  name text not null default '',                    -- e.g. "Full Service with Cremation"
  status text not null default 'draft',             -- draft | sent | void
  packages text[] not null default '{}',            -- which order forms it was built from
  lines jsonb not null default '[]'::jsonb,         -- [{ "name": "...", "amount": 123.45, "pkg": "FULL SERV" }]
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  credit numeric not null default 0,
  total numeric not null default 0,
  valid_until date,
  note text,
  created_by uuid references staff_members(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_to text,
  unique (case_id, number)
);
alter table case_quotes enable row level security;
drop policy if exists "case_quotes_all" on case_quotes;
create policy "case_quotes_all" on case_quotes for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)))
  with check (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'case_quotes') then
    alter publication supabase_realtime add table public.case_quotes;
  end if;
end $$;
notify pgrst, 'reload schema';
