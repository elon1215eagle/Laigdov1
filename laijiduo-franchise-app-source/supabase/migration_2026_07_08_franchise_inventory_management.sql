alter type public.franchise_app_role add value if not exists 'franchise_hq';
alter type public.franchise_app_role add value if not exists 'franchise_coo';
alter type public.franchise_app_role add value if not exists 'franchise_cfo';

create table if not exists public.franchise_inventory_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  name text not null,
  category text not null default '一般',
  allowed_units text[] not null default array['包'],
  default_unit text not null default '包',
  conversion_note text not null default '',
  default_threshold_qty numeric(12,2) not null default 0,
  sort_order integer not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.franchise_inventory_reports (
  id uuid primary key default gen_random_uuid(),
  franchise_store_id uuid not null references public.franchise_stores(id) on delete cascade,
  report_date date not null,
  status text not null default 'submitted',
  note text not null default '',
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (franchise_store_id, report_date)
);

create table if not exists public.franchise_inventory_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.franchise_inventory_reports(id) on delete cascade,
  product_id uuid not null references public.franchise_inventory_products(id),
  previous_qty numeric(12,2) not null default 0,
  previous_unit text not null default '包',
  incoming_qty numeric(12,2) not null default 0,
  incoming_unit text not null default '包',
  current_qty numeric(12,2) not null default 0,
  current_unit text not null default '包',
  waste_qty numeric(12,2) not null default 0,
  waste_unit text not null default '包',
  threshold_qty numeric(12,2) not null default 0,
  threshold_unit text not null default '包',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists franchise_inventory_reports_store_date_idx
  on public.franchise_inventory_reports (franchise_store_id, report_date desc);

create index if not exists franchise_inventory_items_report_idx
  on public.franchise_inventory_items (report_id);

create index if not exists franchise_inventory_items_product_idx
  on public.franchise_inventory_items (product_id);

alter table public.franchise_inventory_products enable row level security;
alter table public.franchise_inventory_reports enable row level security;
alter table public.franchise_inventory_items enable row level security;

drop policy if exists "franchise inventory products read" on public.franchise_inventory_products;
create policy "franchise inventory products read"
on public.franchise_inventory_products for select
to authenticated
using (true);

drop policy if exists "franchise inventory products manage by headquarters" on public.franchise_inventory_products;
create policy "franchise inventory products manage by headquarters"
on public.franchise_inventory_products for all
to authenticated
using (public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo'))
with check (public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo'));

drop policy if exists "franchise inventory reports read by role" on public.franchise_inventory_reports;
create policy "franchise inventory reports read by role"
on public.franchise_inventory_reports for select
to authenticated
using (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise inventory reports write by role" on public.franchise_inventory_reports;
create policy "franchise inventory reports write by role"
on public.franchise_inventory_reports for all
to authenticated
using (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  or franchise_store_id = public.current_franchise_store_id()
)
with check (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise inventory items read by role" on public.franchise_inventory_items;
create policy "franchise inventory items read by role"
on public.franchise_inventory_items for select
to authenticated
using (
  exists (
    select 1
    from public.franchise_inventory_reports reports
    where reports.id = franchise_inventory_items.report_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
        or reports.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise inventory items write by role" on public.franchise_inventory_items;
create policy "franchise inventory items write by role"
on public.franchise_inventory_items for all
to authenticated
using (
  exists (
    select 1
    from public.franchise_inventory_reports reports
    where reports.id = franchise_inventory_items.report_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
        or reports.franchise_store_id = public.current_franchise_store_id()
      )
  )
)
with check (
  exists (
    select 1
    from public.franchise_inventory_reports reports
    where reports.id = franchise_inventory_items.report_id
      and (
        public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo')
        or reports.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise stores visible by role" on public.franchise_stores;
create policy "franchise stores visible by role"
on public.franchise_stores for select
to authenticated
using (
  public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
  or id = public.current_franchise_store_id()
);

drop policy if exists "franchise profiles read own" on public.franchise_profiles;
create policy "franchise profiles read own"
on public.franchise_profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_franchise_role()::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo', 'franchise_investor')
);

grant select on table public.franchise_inventory_products to authenticated;
grant select, insert, update, delete on table public.franchise_inventory_reports to authenticated;
grant select, insert, update, delete on table public.franchise_inventory_items to authenticated;
grant select, insert, update, delete on table public.franchise_inventory_products to service_role;
grant select, insert, update, delete on table public.franchise_inventory_reports to service_role;
grant select, insert, update, delete on table public.franchise_inventory_items to service_role;

insert into public.franchise_inventory_products
  (product_code, name, category, allowed_units, default_unit, conversion_note, default_threshold_qty, sort_order)
values
  ('P01', '雞翅', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 1),
  ('P02', '雞腿', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 2),
  ('P03', '雞排', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 3),
  ('P04', '腿排', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 4),
  ('P05', '雞米花', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 5),
  ('P06', '三角骨', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 6),
  ('P07', '雞脖子', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 1, 7),
  ('P08', '地瓜', '主商品', array['箱', '大包', '小包'], '箱', '主商品可選箱 / 大包 / 小包', 2, 8),
  ('P09', '米血', '固定包裝', array['包'], '包', '固定以包統計', 5, 9),
  ('P10', '花枝丸', '固定包裝', array['包'], '包', '固定以包統計', 5, 10),
  ('P11', '熱狗', '固定包裝', array['包'], '包', '固定以包統計', 5, 11),
  ('P12', '雞塊', '固定包裝', array['包'], '包', '固定以包統計', 5, 12),
  ('P13', '黑輪', '固定包裝', array['包'], '包', '固定以包統計', 5, 13),
  ('P14', '雞皮', '特殊單位', array['串'], '串', '固定以串統計', 20, 14),
  ('P15', '炸油', '油品', array['桶'], '桶', '固定以桶統計', 1, 15),
  ('P16', '湯翅粉', '粉類', array['箱', '包'], '包', '1箱 = 10包', 10, 16),
  ('P17', '醃粉', '粉類', array['箱', '包'], '包', '1箱 = 10包', 10, 17),
  ('P18', '薯脆粉', '粉類', array['箱', '包'], '包', '1箱 = 10包', 10, 18)
on conflict (product_code) do update set
  name = excluded.name,
  category = excluded.category,
  allowed_units = excluded.allowed_units,
  default_unit = excluded.default_unit,
  conversion_note = excluded.conversion_note,
  default_threshold_qty = excluded.default_threshold_qty,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();
