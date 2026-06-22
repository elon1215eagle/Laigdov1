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
  unit text not null default '箱',
  sort_order integer not null,
  is_active boolean not null default true
);

alter table public.products add column if not exists unit text not null default '箱';

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

create index if not exists daily_reports_report_date_store_id_idx
on public.daily_reports (report_date, store_id);

create index if not exists daily_reports_store_id_report_date_idx
on public.daily_reports (store_id, report_date desc);

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
  incoming_source text not null default '廠商進貨',
  transfer_note text,
  is_shortage boolean not null default false,
  created_at timestamptz not null default now(),
  unique (report_id, product_id)
);

create index if not exists inventory_counts_report_id_idx
on public.inventory_counts (report_id);

create index if not exists inventory_counts_product_id_idx
on public.inventory_counts (product_id);

alter table public.inventory_counts
add column if not exists incoming_source text not null default '廠商進貨';

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

create index if not exists store_supervisors_supervisor_id_store_id_idx
on public.store_supervisors (supervisor_id, store_id);

create table if not exists public.store_inspections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  inspection_date date not null,
  supervisor_name text not null,
  manager_name text,
  score integer,
  status text not null default '待確認',
  summary text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.store_inspections(id) on delete cascade,
  storage_path text not null,
  original_name text,
  page_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.store_inspection_issues (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.store_inspections(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  suggestion text,
  severity text not null default '一般',
  due_date date,
  status text not null default '待確認',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.stores (store_code, name, area, manager_name, target_daily_revenue, is_active) values
  ('S01', '鳳山五甲店', '南區', '阿暄店長', 68000, true),
  ('S02', '鳳山凱旋店', '南區', '阿斌店長', 62000, true),
  ('S03', '鳳山武廟店', '南區', '愛庭副店長', 59000, true),
  ('S04', '鳳山中山店', '南區', '樂樂店長', 64000, true),
  ('S05', '前鎮隆興店', '南區', '威廷副店長', 72000, true),
  ('S06', '鳳山南華店', '南區', '人力不足暫停', 0, false),
  ('S07', '三民大昌店', '南區', '仕鈞副店長', 76000, true),
  ('S08', '三民義華店', '南區', '晉銘店長', 53000, true),
  ('S09', '三民鼎山店', '南區', '超哥店長', 66000, true),
  ('S10', '屏東潮州店', '南區', '以得店長', 74000, true),
  ('S11', '屏東潮二店', '南區', '耀呈副店長', 47000, true)
on conflict (store_code) do update set
  name = excluded.name,
  area = excluded.area,
  manager_name = excluded.manager_name,
  target_daily_revenue = excluded.target_daily_revenue,
  is_active = excluded.is_active;

insert into public.products (name, unit, sort_order) values
  ('雞翅', '箱', 1),
  ('腿排', '箱', 2),
  ('雞腿', '箱', 3),
  ('雞排', '箱', 4),
  ('雞米花', '箱', 5),
  ('三角骨', '箱', 6),
  ('雞脖子', '箱', 7),
  ('雞皮', '支', 8),
  ('米血', '包', 9),
  ('花枝丸', '包', 10),
  ('黑輪', '包', 11),
  ('熱狗', '包', 12),
  ('雞塊', '包', 13),
  ('地瓜', '袋', 14),
  ('炸油', '桶', 15),
  ('醃粉', '箱', 16),
  ('湯翅粉', '箱', 17),
  ('薯脆粉', '箱', 18)
on conflict (name) do update set
  unit = excluded.unit,
  sort_order = excluded.sort_order,
  is_active = true;

update public.products
set is_active = false
where name not in (
  '雞翅', '腿排', '雞腿', '雞排', '雞米花', '三角骨', '雞脖子', '雞皮',
  '米血', '花枝丸', '黑輪', '熱狗', '雞塊', '地瓜', '炸油', '醃粉', '湯翅粉', '薯脆粉'
);

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
alter table public.store_inspections enable row level security;
alter table public.store_inspection_photos enable row level security;
alter table public.store_inspection_issues enable row level security;

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

drop policy if exists "read inspections by role" on public.store_inspections;
create policy "read inspections by role"
on public.store_inspections for select
to authenticated
using (
  public.current_profile_role() in ('hq', 'supervisor', 'admin')
  or store_id = public.current_profile_store_id()
  or exists (
    select 1 from public.store_supervisors ss
    where ss.store_id = store_inspections.store_id
      and ss.supervisor_id = auth.uid()
  )
);

drop policy if exists "supervisors manage inspections" on public.store_inspections;
create policy "supervisors manage inspections"
on public.store_inspections for all
to authenticated
using (public.current_profile_role() in ('supervisor', 'admin'))
with check (public.current_profile_role() in ('supervisor', 'admin'));

drop policy if exists "read inspection photos through inspection access" on public.store_inspection_photos;
create policy "read inspection photos through inspection access"
on public.store_inspection_photos for select
to authenticated
using (
  exists (
    select 1 from public.store_inspections si
    where si.id = store_inspection_photos.inspection_id
      and (
        public.current_profile_role() in ('hq', 'supervisor', 'admin')
        or si.store_id = public.current_profile_store_id()
      )
  )
);

drop policy if exists "supervisors manage inspection photos" on public.store_inspection_photos;
create policy "supervisors manage inspection photos"
on public.store_inspection_photos for all
to authenticated
using (public.current_profile_role() in ('supervisor', 'admin'))
with check (public.current_profile_role() in ('supervisor', 'admin'));

drop policy if exists "read inspection issues through inspection access" on public.store_inspection_issues;
create policy "read inspection issues through inspection access"
on public.store_inspection_issues for select
to authenticated
using (
  exists (
    select 1 from public.store_inspections si
    where si.id = store_inspection_issues.inspection_id
      and (
        public.current_profile_role() in ('hq', 'supervisor', 'admin')
        or si.store_id = public.current_profile_store_id()
      )
  )
);

drop policy if exists "supervisors manage inspection issues" on public.store_inspection_issues;
create policy "supervisors manage inspection issues"
on public.store_inspection_issues for all
to authenticated
using (public.current_profile_role() in ('supervisor', 'admin'))
with check (public.current_profile_role() in ('supervisor', 'admin'));
