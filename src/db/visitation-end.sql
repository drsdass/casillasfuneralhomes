-- Visitation end time (visitations now have a start AND an end). Run once in the Supabase SQL editor.
alter table cases add column if not exists visitation_end timestamptz;
