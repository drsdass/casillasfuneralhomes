-- DISP column for the TV Board (CVC, DMP, RNC, SHIP-OUT, CR/RES, CR/BUR, CR/SHIP-OUT, SHIP-IN, MEMORIAL)
alter table cases add column if not exists board_disp text;
notify pgrst, 'reload schema';
