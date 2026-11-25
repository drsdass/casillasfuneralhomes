-- Sends every person a morning notification (phone / computer) listing the cases that still have something missing.
-- Run ONCE in the Supabase SQL editor, AFTER deploying the "morning-digest" Edge Function (see the comments at the top of that file).
--
-- BEFORE RUNNING: replace PASTE_THE_SAME_SYNC_SECRET (one place, below) with the same SYNC_SECRET you used for mail.sql / family-activity.sql.
-- It runs in Supabase's cloud, so nobody's computer has to be on.
--
-- The time: 15:00 UTC = 8:00 AM in California during daylight time (7:00 AM in winter). Change the "0 15 * * *" part to move it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('morning-digest') where exists (select 1 from cron.job where jobname = 'morning-digest');

select cron.schedule(
  'morning-digest',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://kduvajnzussalxihgyfv.supabase.co/functions/v1/morning-digest',
    headers := '{"Content-Type":"application/json","x-sync-secret":"PASTE_THE_SAME_SYNC_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
