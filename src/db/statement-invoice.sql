-- Lets the invoice remember which lines came from a ticked Statement of Funeral Goods and Services tab,
-- so updating the statement replaces only those lines and never touches Orders / Price List lines.
alter table contract_line_items add column if not exists source text;
