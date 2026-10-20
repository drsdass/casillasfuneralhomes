-- Makes changes show up on everyone's screens instantly (safe to run more than once).
do $$
declare t text;
begin
  foreach t in array array['cases','case_notes','service_orders','contracts','contract_line_items','calendar_events','custody_log','case_documents','case_tasks','case_contacts','payments','family_messages','obituary_drafts'] loop
    if to_regclass('public.'||t) is not null
       and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
