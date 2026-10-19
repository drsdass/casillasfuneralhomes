-- Shared email (Outlook / Microsoft 365): read, match to cases, reply with sent-by tracking.
-- Paste into the Supabase SQL editor and run once. Safe to run again.

alter table inbound_emails add column if not exists direction text not null default 'in';        -- 'in' = received, 'out' = sent from the OS
alter table inbound_emails add column if not exists to_address text;
alter table inbound_emails add column if not exists body text;                                    -- plain-text body (received or sent)
alter table inbound_emails add column if not exists thread_id text;                               -- Outlook conversation id, so replies stay with the same case
alter table inbound_emails add column if not exists rfc_message_id text;
alter table inbound_emails add column if not exists sent_by uuid references staff_members(id);    -- who pressed Send
alter table inbound_emails add column if not exists sent_by_name text;
create index if not exists inbound_emails_thread_idx on inbound_emails (thread_id);

-- Where the mailbox sign-in is kept. Nobody can read this from the website: only the server functions can.
create table if not exists mail_connection (
  id int primary key default 1 check (id = 1),
  address text,
  refresh_token text,
  status text not null default 'ok',      -- 'ok' or 'needs_reconnect'
  last_error text,
  connected_by uuid references staff_members(id),
  connected_at timestamptz not null default now()
);
alter table mail_connection enable row level security;
revoke all on mail_connection from anon, authenticated;

-- Run the mail check every 3 minutes, from Supabase's own servers (no computer needs to be on).
-- Before running this part:
--   1. Edge Functions > Secrets: add SYNC_SECRET = any long random text.
--   2. Replace PASTE_THE_SAME_SYNC_SECRET below with that same text.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('casillas-sync-inbox') where exists (select 1 from cron.job where jobname = 'casillas-sync-inbox');
select cron.schedule(
  'casillas-sync-inbox', '*/3 * * * *',
  $$ select net.http_post(
       url := 'https://kduvajnzussalxihgyfv.supabase.co/functions/v1/sync-inbox',
       headers := '{"Content-Type":"application/json","x-sync-secret":"PASTE_THE_SAME_SYNC_SECRET"}'::jsonb,
       body := '{}'::jsonb) $$
);
