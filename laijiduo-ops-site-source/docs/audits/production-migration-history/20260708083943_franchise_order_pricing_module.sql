create table if not exists public.franchise_order_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  name text not null,
  category text not null,
  order_unit text not null default '件',
  unit_price numeric(12,2) not null default 0,
  price_basis text not null default '單價',
  kg_per_unit numeric(10,2),
  kg_price numeric(12,2),
  inventory_product_id uuid references public.franchise_inventory_products(id),
  is_adjustment boolean not null default false,
  is_orderable boolean not null default true,
  sort_order integer not null default 999,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.franchise_orders (
  id uuid primary key default gen_random_uuid(),
  franchise_store_id uuid not null references public.franchise_stores(id) on delete cascade,
  order_date date not null default current_date,
  arrival_date date not null,
  status text not null default 'submitted',
  note text,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (franchise_store_id, arrival_date)
);

create table if not exists public.franchise_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.franchise_orders(id) on delete cascade,
  product_id uuid not null references public.franchise_order_products(id),
  quantity numeric(12,2) not null default 0,
  order_unit text not null,
  unit_price numeric(12,2) not null default 0,
  line_amount numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create table if not exists public.franchise_order_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.franchise_orders(id) on delete cascade,
  adjustment_type text not null,
  label text not null,
  amount numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists franchise_orders_store_arrival_idx on public.franchise_orders(franchise_store_id, arrival_date desc);
create index if not exists franchise_order_items_order_idx on public.franchise_order_items(order_id);
create index if not exists franchise_order_items_product_idx on public.franchise_order_items(product_id);
create index if not exists franchise_order_products_category_idx on public.franchise_order_products(category, sort_order);

alter table public.franchise_order_products enable row level security;
alter table public.franchise_orders enable row level security;
alter table public.franchise_order_items enable row level security;
alter table public.franchise_order_adjustments enable row level security;

drop policy if exists "franchise order products read" on public.franchise_order_products;
create policy "franchise order products read"
on public.franchise_order_products for select
to authenticated
using (true);

drop policy if exists "franchise order products manage by headquarters" on public.franchise_order_products;
create policy "franchise order products manage by headquarters"
on public.franchise_order_products for all
to authenticated
using (public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo'))
with check (public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo'));

drop policy if exists "franchise orders read by role" on public.franchise_orders;
create policy "franchise orders read by role"
on public.franchise_orders for select
to authenticated
using (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise orders insert by role" on public.franchise_orders;
create policy "franchise orders insert by role"
on public.franchise_orders for insert
to authenticated
with check (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise orders update by role" on public.franchise_orders;
create policy "franchise orders update by role"
on public.franchise_orders for update
to authenticated
using (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  or franchise_store_id = public.current_franchise_store_id()
)
with check (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise orders delete by headquarters" on public.franchise_orders;
create policy "franchise orders delete by headquarters"
on public.franchise_orders for delete
to authenticated
using (public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo'));

drop policy if exists "franchise order items read by role" on public.franchise_order_items;
create policy "franchise order items read by role"
on public.franchise_order_items for select
to authenticated
using (
  exists (
    select 1 from public.franchise_orders orders
    where orders.id = franchise_order_items.order_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
        or orders.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise order items write by role" on public.franchise_order_items;
create policy "franchise order items write by role"
on public.franchise_order_items for all
to authenticated
using (
  exists (
    select 1 from public.franchise_orders orders
    where orders.id = franchise_order_items.order_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
        or orders.franchise_store_id = public.current_franchise_store_id()
      )
  )
)
with check (
  exists (
    select 1 from public.franchise_orders orders
    where orders.id = franchise_order_items.order_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
        or orders.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise order adjustments read by role" on public.franchise_order_adjustments;
create policy "franchise order adjustments read by role"
on public.franchise_order_adjustments for select
to authenticated
using (
  exists (
    select 1 from public.franchise_orders orders
    where orders.id = franchise_order_adjustments.order_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
        or orders.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise order adjustments write by headquarters" on public.franchise_order_adjustments;
create policy "franchise order adjustments write by headquarters"
on public.franchise_order_adjustments for all
to authenticated
using (
  exists (
    select 1 from public.franchise_orders orders
    where orders.id = franchise_order_adjustments.order_id
      and public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  )
)
with check (
  exists (
    select 1 from public.franchise_orders orders
    where orders.id = franchise_order_adjustments.order_id
      and public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  )
);

grant select, insert, update, delete on table public.franchise_order_products to authenticated;
grant select, insert, update, delete on table public.franchise_orders to authenticated;
grant select, insert, update, delete on table public.franchise_order_items to authenticated;
grant select, insert, update, delete on table public.franchise_order_adjustments to authenticated;

insert into public.franchise_order_products (product_code, name, category, order_unit, unit_price, price_basis, kg_per_unit, kg_price, is_adjustment, is_orderable, sort_order, note)
values
  ('MEAT-W7', '雞翅 W7', '肉品', '件', 1980, '110元/kg x 18kg', 18, 110, false, true, 1, '一件=18KG'),
  ('MEAT-TS35', '腿排 TS3.5', '肉品', '件', 2070, '115元/kg x 18kg', 18, 115, false, true, 2, '一件=18KG'),
  ('MEAT-D5', '雞腿 D5棒腿', '肉品', '件', 2700, '150元/kg x 18kg', 18, 150, false, true, 3, '一件=18KG'),
  ('MEAT-CHICKEN-CUTLET', '香雞排', '肉品', '件', 2070, '115元/kg x 18kg', 18, 115, false, true, 4, '一件=18KG'),
  ('MEAT-AND2', '雞米花 AND2', '肉品', '件', 2880, '160元/kg x 18kg', 18, 160, false, true, 5, '一件=18KG'),
  ('MEAT-TRIANGLE', '三角骨', '肉品', '件', 1350, '75元/kg x 18kg', 18, 75, false, true, 6, '一件=18KG'),
  ('MEAT-NECK', '雞脖子', '肉品', '件', 1080, '60元/kg x 18kg', 18, 60, false, true, 7, '一件=18KG'),
  ('MEAT-SKIN', '雞皮', '肉品', '支', 10, '10元/支', null, null, false, true, 8, '雞皮以支計價'),
  ('SNACK-PIG-BLOOD', '米血', '點心', '包', 145, '單價', null, null, false, true, 101, null),
  ('SNACK-CUTTLEFISH-BALL', '花枝丸', '點心', '包', 400, '單價', null, null, false, true, 102, null),
  ('SNACK-HOTDOG', '熱狗', '點心', '包', 300, '單價', null, null, false, true, 103, null),
  ('SNACK-NUGGET', '雞塊', '點心', '包', 330, '單價', null, null, false, true, 104, null),
  ('SNACK-ODEN', '黑輪', '點心', '包', 220, '單價', null, null, false, true, 105, null),
  ('SNACK-SWEET-POTATO-30KG', '地瓜30kg', '點心', '袋', 800, '800元/袋', null, null, false, true, 106, null),
  ('SNACK-CUT-SWEET-POTATO-9KG', '代切地瓜9kg', '點心', '袋', 525, '525元/袋', null, null, false, true, 107, null),
  ('DRY-CRISPY-POWDER-30', '3.0脆粉(21)', '南北貨', '箱', 1640, '單價', null, null, false, true, 201, null),
  ('DRY-POTATO-CRISPY', '薯脆(地)', '南北貨', '箱', 1640, '單價', null, null, false, true, 202, null),
  ('DRY-PEPPER', '胡椒粉', '南北貨', '包', 280, '單價', null, null, false, true, 203, null),
  ('DRY-FRYING-OIL', '耐炸油', '南北貨', '桶', 855, '單價', null, null, false, true, 204, null),
  ('DRY-SWEET-POTATO-STARCH', '地瓜粉-樹薯粒粉', '南北貨', '袋', 665, '單價', null, null, false, true, 205, null),
  ('DRY-BREADCRUMBS', '麵包粉', '南北貨', '包', 195, '單價', null, null, false, true, 206, null),
  ('DRY-CHILI-POWDER', '琴益-辣椒粉', '南北貨', '包', 90, '單價', null, null, false, true, 207, null),
  ('DRY-PLUM-RED', '梅粉（紅）', '南北貨', '包', 110, '單價', null, null, false, true, 208, null),
  ('DRY-PLUM-WHITE', '梅粉（白）', '南北貨', '包', 105, '單價', null, null, false, true, 209, null),
  ('DRY-OIL-PAPER-6', '六兩防油紙袋', '南北貨', '封', 31, '單價', null, null, false, true, 210, null),
  ('DRY-OIL-PAPER-8', '八兩防油紙袋', '南北貨', '封', 38, '單價', null, null, false, true, 211, null),
  ('DRY-OIL-PAPER-16', '一斤防油紙袋', '南北貨', '封', 55, '單價', null, null, false, true, 212, null),
  ('DRY-PLASTIC-BAG-CUP', '1杯塑膠袋', '南北貨', '包', 15, '單價', null, null, false, true, 213, null),
  ('DRY-PLASTIC-BAG-4', '4兩塑膠袋', '南北貨', '包', 18, '單價', null, null, false, true, 214, null),
  ('DRY-PLASTIC-BAG-HALF', '半斤塑膠袋', '南北貨', '包', 18, '單價', null, null, false, true, 215, null),
  ('DRY-BLACK-TRASH-BAG', '黑垃圾袋', '南北貨', '捲', 110, '單價', null, null, false, true, 216, null),
  ('DRY-BAMBOO-STICK', '天然環保竹籤6吋', '南北貨', '包', 33, '單價', null, null, false, true, 217, null),
  ('DRY-SALT', '鹽巴', '南北貨', '包', 15, '單價', null, null, false, true, 218, null),
  ('DRY-BURN-OINTMENT', '燙傷藥膏', '南北貨', '支', 500, '單價', null, null, false, true, 219, null),
  ('DRY-LAUNDRY-POWDER', '洗衣粉', '南北貨', '包', 260, '單價', null, null, false, true, 220, null),
  ('DRY-DISH-SOAP', '洗碗精', '南北貨', '瓶', 45, '單價', null, null, false, true, 221, null),
  ('DRY-BLEACH', '漂白水', '南北貨', '瓶', 65, '單價', null, null, false, true, 222, null),
  ('DRY-DR-BECKMANN', '白博士', '南北貨', '瓶', 80, '單價', null, null, false, true, 223, null),
  ('DRY-DEGREASER', '去油污', '南北貨', '瓶', 140, '單價', null, null, false, true, 224, null),
  ('DRY-OIL-TEST-PAPER', '3M油品試紙', '南北貨', '罐', 660, '單價', null, null, false, true, 225, null),
  ('DRY-FIRE-EXTINGUISHER', '滅火器', '南北貨', '支', 800, '單價', null, null, false, true, 226, '南北貨區'),
  ('DRY-SEASONING-BOTTLE', '妙妙瓶（調味瓶）', '南北貨', '個', 12, '單價', null, null, false, true, 227, null),
  ('HW-GLOVES-THICK', '手套加厚', '五金', '盒', 180, '單價', null, null, false, true, 301, null),
  ('HW-DISH-GLOVES', '洗碗手套', '五金', '雙', 45, '單價', null, null, false, true, 302, null),
  ('HW-COTTON-GLOVES', '棉手套', '五金', '雙', 10, '單價', null, null, false, true, 303, null),
  ('HW-RAG', '抹布', '五金', '條', 10, '單價', null, null, false, true, 304, null),
  ('HW-STEEL-WOOL', '鐵絲球', '五金', '個', 18, '單價', null, null, false, true, 305, null),
  ('HW-SPONGE-CHEAP', '菜瓜布', '五金', '個', 10, '單價', null, null, false, true, 306, '多規格拆分'),
  ('HW-SPONGE-PREMIUM', '海綿菜瓜布', '五金', '個', 35, '單價', null, null, false, true, 307, '多規格拆分'),
  ('HW-TISSUE', '衛生紙一串（150抽x10包）', '五金', '串', 115, '單價', null, null, false, true, 308, null),
  ('HW-TAPE', '封箱膠帶48x12m x6入', '五金', '組', 130, '單價', null, null, false, true, 309, null),
  ('HW-WHITEBOARD-PEN', '白板筆細', '五金', '支', 8, '單價', null, null, false, true, 310, null),
  ('HW-BALL-PEN', '原子筆', '五金', '支', 3, '單價', null, null, false, true, 311, null),
  ('HW-MARKER', '奇異筆', '五金', '支', 12, '單價', null, null, false, true, 312, null),
  ('HW-CLIP-00', '00夾100入-裝辣椒粉', '五金', '包', 5, '單價', null, null, false, true, 313, null),
  ('HW-QQ-BOX-2', 'QQ箱2號', '五金', '組', 125, '單價', null, null, false, true, 314, '多規格拆分'),
  ('HW-QQ-BOX-3', 'QQ箱3號', '五金', '組', 85, '單價', null, null, false, true, 315, '多規格拆分'),
  ('HW-QQ-BOX-4', 'QQ箱4號', '五金', '組', 65, '單價', null, null, false, true, 316, '多規格拆分'),
  ('HW-FRIDGE-THERMOMETER', '冰箱溫度計', '五金', '個', 65, '單價', null, null, false, true, 317, null),
  ('HW-TIMER', '計時器', '五金', '個', 80, '單價', null, null, false, true, 318, null),
  ('HW-OIL-NEEDLE', '油針', '五金', '支', 250, '單價', null, null, false, true, 319, null),
  ('HW-FRY-SHOVEL', '油炸鏟', '五金', '支', 80, '單價', null, null, false, true, 320, null),
  ('HW-EGG-BEATER', '打蛋器', '五金', '支', 120, '單價', null, null, false, true, 321, null),
  ('HW-FRIES-BASKET', '大薯條籃', '五金', '個', 280, '單價', null, null, false, true, 322, null),
  ('HW-TONG-LONG', '長夾', '五金', '支', 85, '單價', null, null, false, true, 323, null),
  ('HW-TONG-SHORT', '短夾', '五金', '支', 30, '單價', null, null, false, true, 324, null),
  ('HW-HEAT-LAMP-TUBE', '保溫燈管', '五金', '支', 40, '單價', null, null, false, true, 325, null),
  ('HW-HEAT-LAMP-SEAT', '保溫燈座', '五金', '個', 400, '單價', null, null, false, true, 326, null),
  ('HW-UNIFORM', '制服', '五金', '件', 295, '單價', null, null, false, true, 327, null),
  ('HW-HAT-80', '帽子', '五金', '頂', 80, '單價', null, null, false, true, 328, '五金價目表原帽子80'),
  ('HW-FIRE-EXTINGUISHER', '滅火器', '五金', '支', 800, '單價', null, null, false, true, 329, '五金區'),
  ('HW-HAT-90', '帽子-新版', '五金', '頂', 90, '單價', null, null, false, true, 330, '五金價目表原帽子90'),
  ('ADJ-BRAND-FEE', '品牌管理費', '調整項', '筆', 0, '手動調整', null, null, true, false, 901, '不混入商品主檔，計價單調整項'),
  ('ADJ-SCRAP-SWEET-POTATO', '報廢地瓜', '調整項', '筆', 0, '手動調整', null, null, true, false, 902, '不混入商品主檔，計價單調整項')
on conflict (product_code) do update
set name = excluded.name,
    category = excluded.category,
    order_unit = excluded.order_unit,
    unit_price = excluded.unit_price,
    price_basis = excluded.price_basis,
    kg_per_unit = excluded.kg_per_unit,
    kg_price = excluded.kg_price,
    is_adjustment = excluded.is_adjustment,
    is_orderable = excluded.is_orderable,
    sort_order = excluded.sort_order,
    note = excluded.note,
    updated_at = now();
