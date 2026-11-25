-- Lets staff pin a case to the top or bottom of the TV Board (otherwise the board decides automatically)
alter table cases add column if not exists board_place text;
notify pgrst, 'reload schema';
