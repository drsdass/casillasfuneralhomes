-- Records which device each change was made from (shown in Admin -> Audit Log)
alter table audit_log add column if not exists device text;
notify pgrst, 'reload schema';
