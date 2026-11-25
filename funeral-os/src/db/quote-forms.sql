-- Quotes keep the statement form itself (every value as it was), so a quote prints exactly like the signed Statement of Funeral Goods and Services.
alter table case_quotes  add column if not exists forms jsonb;
alter table case_quotes  add column if not exists tax_rate numeric;
alter table quick_quotes add column if not exists forms jsonb;
notify pgrst, 'reload schema';
