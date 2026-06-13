-- 2026-06-13 Laijiduo operating report upgrade
-- Purpose:
-- 1. Store monthly revenue targets and convert to daily targets in the app.
-- 2. Allow inventory and incoming quantities to use decimals.
-- 3. Store selectable units and powder box/pack counts.
-- 4. Reset product names and units to the current operating standard.

alter table public.stores
add column if not exists target_monthly_revenue numeric(12,2);

update public.stores
set target_monthly_revenue = coalesce(target_monthly_revenue, target_daily_revenue * 30)
where target_monthly_revenue is null;

alter table public.inventory_counts
alter column current_stock type numeric(12,2) using current_stock::numeric,
alter column safety_stock type numeric(12,2) using safety_stock::numeric,
alter column loss_count type numeric(12,2) using loss_count::numeric,
alter column incoming_count type numeric(12,2) using incoming_count::numeric;

alter table public.inventory_counts
add column if not exists stock_unit text,
add column if not exists incoming_unit text,
add column if not exists current_stock_boxes numeric(12,2) not null default 0,
add column if not exists current_stock_packs numeric(12,2) not null default 0,
add column if not exists incoming_boxes numeric(12,2) not null default 0,
add column if not exists incoming_packs numeric(12,2) not null default 0;

update public.inventory_counts ic
set
  stock_unit = coalesce(ic.stock_unit, p.unit),
  incoming_unit = coalesce(ic.incoming_unit, p.unit)
from public.products p
where p.id = ic.product_id
  and (ic.stock_unit is null or ic.incoming_unit is null);

insert into public.products (name, unit, sort_order, is_active) values
  ('雞翅', '箱', 1, true),
  ('雞腿', '箱', 2, true),
  ('雞排', '箱', 3, true),
  ('腿排', '箱', 4, true),
  ('雞米花', '箱', 5, true),
  ('三角骨', '箱', 6, true),
  ('雞脖子', '箱', 7, true),
  ('地瓜', '箱', 8, true),
  ('米血', '包', 9, true),
  ('花枝丸', '包', 10, true),
  ('熱狗', '包', 11, true),
  ('雞塊', '包', 12, true),
  ('黑輪', '包', 13, true),
  ('雞皮', '串', 14, true),
  ('炸油', '桶', 15, true),
  ('湯翅粉', '包', 16, true),
  ('醃粉', '包', 17, true),
  ('薯脆粉', '包', 18, true)
on conflict (name) do update set
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  is_active = true;

update public.products
set is_active = false
where name not in (
  '雞翅', '雞腿', '雞排', '腿排', '雞米花', '三角骨', '雞脖子', '地瓜',
  '米血', '花枝丸', '熱狗', '雞塊', '黑輪', '雞皮', '炸油',
  '湯翅粉', '醃粉', '薯脆粉'
);

drop policy if exists "hq and admins update store targets" on public.stores;
create policy "hq and admins update store targets"
on public.stores for update
to authenticated
using (public.current_profile_role() in ('hq', 'admin'))
with check (public.current_profile_role() in ('hq', 'admin'));
