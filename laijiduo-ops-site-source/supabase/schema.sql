-- Laijiduo fried chicken operations app
-- Run this file in the Supabase SQL editor before connecting Vercel.

create extension if not exists "pgcrypto";

do $$ begin
  create type app_role as enum ('store_manager', 'hq', 'supervisor', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type report_status as enum ('draft', 'submitted', 'needs_revision', 'approved', 'follow_up');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type review_action_type as enum ('approve', 'request_revision', 'assign_transfer', 'note');
exception when duplicate_object then null;
end $$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  name text not null,
  area text not null default '全區',
  manager_name text,
  target_daily_revenue integer not null default 65000,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null,
  store_id uuid references public.stores(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_manager_requires_store check (
    role <> 'store_manager' or store_id is not null
  )
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null,
  is_active boolean not null default true
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  report_date date not null,
  opened_to_1400_revenue integer not null default 0,
  revenue_1400_to_1900 integer not null default 0,
  revenue_1900_to_close integer not null default 0,
  cash_difference integer,
  status report_status not null default 'draft',
  manager_note text,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, report_date)
);

create or replace view public.daily_report_totals
with (security_invoker = true) as
select
  dr.*,
  (
    dr.opened_to_1400_revenue
    + dr.revenue_1400_to_1900
    + dr.revenue_1900_to_close
  ) as total_revenue
from public.daily_reports dr;

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  product_id uuid not null references public.products(id),
  current_stock integer not null default 0,
  safety_stock integer not null default 0,
  loss_count integer not null default 0,
  incoming_count integer not null default 0,
  transfer_note text,
  is_shortage boolean not null default false,
  created_at timestamptz not null default now(),
  unique (report_id, product_id)
);

create table if not exists public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.review_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  action review_action_type not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.store_supervisors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  supervisor_id uuid not null references public.profiles(id) on delete cascade,
  unique (store_id, supervisor_id)
);

insert into public.stores (store_code, name, area, manager_name, target_daily_revenue) values
  ('S01', '鳳山五甲店', '南區', '阿瑄店長', 68000),
  ('S02', '鳳山凱旋店', '南區', '阿斌店長', 62000),
  ('S03', '鳳山武廟店', '南區', '阿斌店長', 59000),
  ('S04', '鳳山中山店', '南區', '樂樂店長', 64000),
  ('S05', '前鎮隆興店', '南區', '威廷代副店', 72000),
  ('S06', '鳳山南華店', '南區', '阿瑄店長', 76000),
  ('S07', '三民鼎山店', '南區', '超哥店長', 53000),
  ('S08', '三民大昌店', '南區', '仕鈞店長', 50000),
  ('S09', '三民義華店', '南區', '阿銘店長', 66000),
  ('S10', '屏東潮洲店', '南區', '以得店長', 74000),
  ('S11', '屏東潮洲店', '南區', '以得店長', 47000)
on conflict (store_code) do update set
  name = excluded.name,
  area = excluded.area,
  manager_name = excluded.manager_name,
  target_daily_revenue = excluded.target_daily_revenue,
  is_active = true;

insert into public.products (name, sort_order) values
  ('招牌炸雞', 1),
  ('雞腿', 2),
  ('雞翅', 3),
  ('雞塊', 4),
  ('薯條', 5),
  ('洋蔥圈', 6),
  ('甜不辣', 7),
  ('雞米花', 8),
  ('可樂', 9),
  ('紅茶', 10),
  ('綠茶', 11),
  ('醬料包', 12),
  ('紙袋', 13),
  ('餐盒', 14)
on conflict (name) do update set
  sort_order = excluded.sort_order,
  is_active = true;

create or replace function public.current_profile_role()
returns app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.current_profile_store_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select store_id from public.profiles where id = auth.uid() and is_active = true
$$;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.daily_reports enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.report_photos enable row level security;
alter table public.review_actions enable row level security;
alter table public.store_supervisors enable row level security;

drop policy if exists "active users can read products" on public.products;
create policy "active users can read products"
on public.products for select
to authenticated
using (is_active = true);

drop policy if exists "users can read their profile" on public.profiles;
create policy "users can read their profile"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_profile_role() in ('hq', 'supervisor', 'admin')
);

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
on public.profiles for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "store visibility by role" on public.stores;
create policy "store visibility by role"
on public.stores for select
to authenticated
using (
  public.current_profile_role() in ('hq', 'supervisor', 'admin')
  or id = public.current_profile_store_id()
);

drop policy if exists "admin manages stores" on public.stores;
create policy "admin manages stores"
on public.stores for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "read reports by role" on public.daily_reports;
create policy "read reports by role"
on public.daily_reports for select
to authenticated
using (
  public.current_profile_role() in ('hq', 'supervisor', 'admin')
  or store_id = public.current_profile_store_id()
  or exists (
    select 1 from public.store_supervisors ss
    where ss.store_id = daily_reports.store_id
      and ss.supervisor_id = auth.uid()
  )
);

drop policy if exists "store managers create own reports" on public.daily_reports;
create policy "store managers create own reports"
on public.daily_reports for insert
to authenticated
with check (
  public.current_profile_role() = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = auth.uid()
);

drop policy if exists "admins create reports" on public.daily_reports;
create policy "admins create reports"
on public.daily_reports for insert
to authenticated
with check (
  public.current_profile_role() = 'admin'
  and submitted_by = auth.uid()
);

drop policy if exists "store managers update own editable reports" on public.daily_reports;
create policy "store managers update own editable reports"
on public.daily_reports for update
to authenticated
using (
  public.current_profile_role() = 'store_manager'
  and store_id = public.current_profile_store_id()
  and status in ('draft', 'needs_revision')
)
with check (
  public.current_profile_role() = 'store_manager'
  and store_id = public.current_profile_store_id()
);

drop policy if exists "supervisors update assigned reports" on public.daily_reports;
create policy "supervisors update assigned reports"
on public.daily_reports for update
to authenticated
using (
  public.current_profile_role() in ('supervisor', 'admin')
)
with check (public.current_profile_role() in ('supervisor', 'admin'));

drop policy if exists "read inventory through report access" on public.inventory_counts;
create policy "read inventory through report access"
on public.inventory_counts for select
to authenticated
using (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and (
        public.current_profile_role() in ('hq', 'supervisor', 'admin')
        or dr.store_id = public.current_profile_store_id()
        or exists (
          select 1 from public.store_supervisors ss
          where ss.store_id = dr.store_id
            and ss.supervisor_id = auth.uid()
        )
      )
  )
);

drop policy if exists "store managers manage inventory for own reports" on public.inventory_counts;
create policy "store managers manage inventory for own reports"
on public.inventory_counts for all
to authenticated
using (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and dr.store_id = public.current_profile_store_id()
      and dr.status in ('draft', 'needs_revision', 'submitted')
  )
)
with check (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and dr.store_id = public.current_profile_store_id()
      and dr.status in ('draft', 'needs_revision', 'submitted')
  )
);

drop policy if exists "admins manage inventory" on public.inventory_counts;
create policy "admins manage inventory"
on public.inventory_counts for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

drop policy if exists "read review actions through report access" on public.review_actions;
create policy "read review actions through report access"
on public.review_actions for select
to authenticated
using (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = review_actions.report_id
      and (
        public.current_profile_role() in ('hq', 'supervisor', 'admin')
        or dr.store_id = public.current_profile_store_id()
        or exists (
          select 1 from public.store_supervisors ss
          where ss.store_id = dr.store_id
            and ss.supervisor_id = auth.uid()
        )
      )
  )
);

drop policy if exists "supervisors create review actions" on public.review_actions;
create policy "supervisors create review actions"
on public.review_actions for insert
to authenticated
with check (
  public.current_profile_role() in ('supervisor', 'admin')
  and created_by = auth.uid()
);

drop policy if exists "supervisors read stores assignments" on public.store_supervisors;
create policy "supervisors read stores assignments"
on public.store_supervisors for select
to authenticated
using (
  supervisor_id = auth.uid()
  or public.current_profile_role() = 'admin'
);
