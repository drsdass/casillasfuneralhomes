-- TV Board: Flowers / Birds / Escort can be set per case as No, Yes, or Yes (confirmed).
-- Left blank, the board works it out itself from the Orders (a flower, dove or escort line = Yes).
alter table cases add column if not exists board_flowers text;
alter table cases add column if not exists board_birds text;
alter table cases add column if not exists board_escort text;
notify pgrst, 'reload schema';
