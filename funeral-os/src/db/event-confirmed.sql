-- Lets staff mark the church / place of a visitation or service as CONFIRMED.
-- The TV Board then shows a small check mark next to that place.
alter table calendar_events add column if not exists place_confirmed boolean not null default false;
