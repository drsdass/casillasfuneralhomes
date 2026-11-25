-- Quick Quotes: informational quotes made without opening a case (phone calls, walk-ins).
-- Nothing about the person who passed is stored. Each quote has a number per location and year, e.g. CC-Q-2026-001.
create table if not exists quick_quotes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  year int not null,
  seq int not null,                                 -- 1, 2, 3 ... within this location and year
  label text not null,                              -- e.g. CC-Q-2026-001
  for_name text not null default '',                -- optional: "Phone inquiry", "Garcia family"
  contact_phone text,
  contact_email text,
  name text not null default '',                    -- optional title shown on the quote
  status text not null default 'draft',             -- draft | sent | void
  tax_rate numeric not null default 8.75,
  packages text[] not null default '{}',
  lines jsonb not null default '[]'::jsonb,
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
  converted_case_id uuid references cases(id) on delete set null,
  unique (location_id, year, seq)
);
alter table quick_quotes enable row level security;
drop policy if exists "quick_quotes_all" on quick_quotes;
create policy "quick_quotes_all" on quick_quotes for all
  using (has_location_access(location_id)) with check (has_location_access(location_id));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quick_quotes') then
    alter publication supabase_realtime add table public.quick_quotes;
  end if;
end $$;
notify pgrst, 'reload schema';
