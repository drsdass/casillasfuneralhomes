-- New General Price List numbers (October 2026 hand-marked increases). Run once in the Supabase SQL editor.
-- Updates the price catalog for every location. Existing contracts keep the prices they were written with.
update gpl_items set price = v.price
from (values
  ('SVC-100', 1050), ('SVC-102', 195), ('SVC-103', 175), ('SVC-105', 275), ('SVC-106', 200),
  ('SVC-107', 175), ('SVC-109', 570), ('TRN-100', 525), ('MER-106', 50), ('MER-107', 50),
  ('PKG-100', 1725), ('PKG-101', 1830)
) as v(sku, price)
where gpl_items.sku = v.sku;

select sku, name, price, count(*) as locations from gpl_items
where sku in ('SVC-100','SVC-102','SVC-103','SVC-105','SVC-106','SVC-107','SVC-109','TRN-100','MER-106','MER-107','PKG-100','PKG-101')
group by sku, name, price order by sku;
