-- A case can have several visitations and several services (private + public visitation, a rosary, a church service plus a graveside ...).
-- label  = what it is ("Private", "Public", "Rosary", "Mass", "Graveside" ...), shown on the TV Board
-- source = where it came from: NULL / 'case' = the case's main visitation or service, 'vital' = filled in from the Vital Sheet, 'extra' = added by hand
alter table calendar_events add column if not exists label text;
alter table calendar_events add column if not exists source text;
notify pgrst, 'reload schema';
