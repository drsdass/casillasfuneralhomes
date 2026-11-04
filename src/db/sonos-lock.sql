-- Lock a speaker room (e.g. the Casket Room) so staff can't pause, change or move its music.
-- Paste into the Supabase SQL editor and run once. Safe to run again.
alter table sonos_links add column if not exists locked_players text[] not null default '{}';
notify pgrst, 'reload schema';
