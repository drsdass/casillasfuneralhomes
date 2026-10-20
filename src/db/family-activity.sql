-- Family activity: staff are told when a family fills something in on their portal link.
-- Run once in the Supabase SQL editor.
--
-- BEFORE RUNNING: replace PASTE_THE_SAME_SYNC_SECRET (one place, near the bottom) with the same SYNC_SECRET
-- you already used for mail.sql (Edge Functions > Secrets).

alter table cases add column if not exists family_unseen boolean not null default false;
alter table cases add column if not exists family_activity_at timestamptz;
alter table cases add column if not exists family_activity_note text;

-- One obituary draft per case (the family portal saves into it).
delete from obituary_drafts a using obituary_drafts b where a.case_id = b.case_id and a.ctid < b.ctid;
create unique index if not exists obituary_drafts_case_key on obituary_drafts (case_id);

-- Messages the family types into the portal.
create table if not exists family_messages (
  id uuid primary key default uuid_generate_v4(),
  case_id uuid not null references cases(id) on delete cascade,
  from_family boolean not null default true,
  body text not null,
  created_at timestamptz not null default now()
);
alter table family_messages enable row level security;
drop policy if exists family_messages_staff on family_messages;
create policy family_messages_staff on family_messages for all
  using (exists (select 1 from cases c where c.id = case_id and has_location_access(c.location_id)));

-- Anything the family does is logged by the portal functions with no staff member attached ("Family ...").
-- 1) make sure that entry belongs to the right company, 2) flag the case, 3) buzz the right phones.
create or replace function family_audit_before() returns trigger language plpgsql security definer as $$
begin
  if new.changed_by is null and new.case_id is not null and new.org_id is null then
    select org_id into new.org_id from cases where id = new.case_id;
  end if;
  return new;
end $$;
drop trigger if exists family_audit_before_t on audit_log;
create trigger family_audit_before_t before insert on audit_log for each row execute function family_audit_before();

create extension if not exists pg_net;
create or replace function family_audit_after() returns trigger language plpgsql security definer as $$
begin
  if new.changed_by is null and new.case_id is not null and new.summary ilike 'Family %' then
    update cases set family_unseen = true, family_activity_at = now(), family_activity_note = new.summary where id = new.case_id;
    begin
      perform net.http_post(
        url := 'https://kduvajnzussalxihgyfv.supabase.co/functions/v1/send-push',
        headers := '{"Content-Type":"application/json","x-sync-secret":"PASTE_THE_SAME_SYNC_SECRET"}'::jsonb,
        body := jsonb_build_object('type', 'family', 'caseId', new.case_id, 'note', new.summary));
    exception when others then null;  -- a failed buzz must never block the family's save
    end;
  end if;
  return new;
end $$;
drop trigger if exists family_audit_after_t on audit_log;
create trigger family_audit_after_t after insert on audit_log for each row execute function family_audit_after();

notify pgrst, 'reload schema';
