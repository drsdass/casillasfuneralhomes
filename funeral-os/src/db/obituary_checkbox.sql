-- Adds the "Obituary done" checkbox and marks the imported cases that had a * on the old board.
-- Safe to run more than once, and safe to run before or after remove-asterisks.sql.
alter table cases add column if not exists obituary_completed boolean not null default false;

update cases set obituary_completed = true
where case_number like '%-B26-%'
  and ( decedent_first_name like '%*%' or decedent_last_name like '%*%'
        or exists (select 1 from case_notes n where n.case_id = cases.id and n.body like 'Obituary completed%') );

select count(*) as obituaries_marked_done from cases where obituary_completed;
