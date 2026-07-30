-- Development branch baseline for daily reporting.
-- The branch already contains stores, profiles and scheduling test identities.

create extension if not exists "pgcrypto";

do $$
begin
  create type public.report_status as enum (
    'draft', 'submitted', 'needs_revision', 'approved', 'follow_up'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.review_action_type as enum (
    'approve', 'request_revision', 'assign_transfer', 'note'
  );
exception when duplicate_object then null;
end
$$;

create or replace function public.current_profile_store_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select profile.store_id
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.is_active = true
$$;

create or replace function public.current_taipei_business_date()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

revoke all on function public.current_profile_store_id() from public;
revoke all on function public.current_taipei_business_date() from public;
grant execute on function public.current_profile_store_id() to authenticated;
grant execute on function public.current_taipei_business_date() to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null,
  is_active boolean not null default true,
  unit text not null default '箱'
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  report_date date not null,
  opened_to_1400_revenue integer not null default 0,
  revenue_1400_to_1900 integer not null default 0,
  revenue_1900_to_close integer not null default 0,
  cash_difference integer,
  status public.report_status not null default 'draft',
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

create index if not exists daily_reports_submitted_by_idx
on public.daily_reports (submitted_by);

create index if not exists daily_reports_reviewed_by_idx
on public.daily_reports (reviewed_by);

create or replace view public.daily_report_totals
with (security_invoker = true) as
select
  report.*,
  (
    report.opened_to_1400_revenue
    + report.revenue_1400_to_1900
    + report.revenue_1900_to_close
  ) as total_revenue
from public.daily_reports report;

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  product_id uuid not null references public.products(id),
  current_stock numeric not null default 0,
  safety_stock numeric not null default 0,
  loss_count numeric not null default 0,
  incoming_count numeric not null default 0,
  transfer_note text,
  is_shortage boolean not null default false,
  created_at timestamptz not null default now(),
  stock_unit text,
  incoming_unit text,
  current_stock_boxes numeric not null default 0,
  current_stock_packs numeric not null default 0,
  incoming_boxes numeric not null default 0,
  incoming_packs numeric not null default 0,
  incoming_source text not null default '廠商進貨',
  unique (report_id, product_id)
);

create index if not exists inventory_counts_product_id_idx
on public.inventory_counts (product_id);

create table if not exists public.review_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  action public.review_action_type not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists review_actions_report_id_idx
on public.review_actions (report_id);

create index if not exists review_actions_created_by_idx
on public.review_actions (created_by);

insert into public.products (name, unit, sort_order)
values
  ('雞翅', '箱', 1),
  ('雞腿', '箱', 2),
  ('雞排', '箱', 3),
  ('腿排', '箱', 4),
  ('雞米花', '箱', 5),
  ('三角骨', '箱', 6),
  ('雞脖子', '箱', 7),
  ('地瓜', '箱', 8),
  ('米血', '包', 9),
  ('花枝丸', '包', 10),
  ('熱狗', '包', 11),
  ('雞塊', '包', 12),
  ('黑輪', '包', 13),
  ('雞皮', '串', 14),
  ('炸油', '桶', 15),
  ('湯翅粉', '箱', 16),
  ('醃粉', '箱', 17),
  ('薯脆粉', '箱', 18)
on conflict (name) do update
set unit = excluded.unit,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.products enable row level security;
alter table public.daily_reports enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.review_actions enable row level security;

grant select on table public.products to authenticated;
grant select, insert, update, delete on table public.daily_reports to authenticated;
grant select, insert, update, delete on table public.inventory_counts to authenticated;
grant select, insert on table public.review_actions to authenticated;
grant select on table public.daily_report_totals to authenticated;

drop policy if exists "active users can read products" on public.products;
create policy "active users can read products"
on public.products for select to authenticated
using (is_active = true);

drop policy if exists "read reports by role" on public.daily_reports;
create policy "read reports by role"
on public.daily_reports for select to authenticated
using (
  public.current_profile_role()::text in (
    'ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'cso', 'supervisor', 'admin'
  )
  or (
    public.current_profile_role()::text = 'store_manager'
    and store_id = public.current_profile_store_id()
    and report_date between public.current_taipei_business_date() - 13
      and public.current_taipei_business_date()
  )
);

drop policy if exists "store managers create own reports" on public.daily_reports;
create policy "store managers create own reports"
on public.daily_reports for insert to authenticated
with check (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = (select auth.uid())
  and report_date between public.current_taipei_business_date() - 13
    and public.current_taipei_business_date()
);

drop policy if exists "store managers update own editable reports" on public.daily_reports;
create policy "store managers update own editable reports"
on public.daily_reports for update to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and report_date between public.current_taipei_business_date() - 13
    and public.current_taipei_business_date()
)
with check (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = (select auth.uid())
  and report_date between public.current_taipei_business_date() - 13
    and public.current_taipei_business_date()
);

drop policy if exists "hq staff create daily reports" on public.daily_reports;
create policy "hq staff create daily reports"
on public.daily_reports for insert to authenticated
with check (
  public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'admin')
  and submitted_by = (select auth.uid())
);

drop policy if exists "hq staff update daily reports" on public.daily_reports;
create policy "hq staff update daily reports"
on public.daily_reports for update to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'admin'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'admin'));

drop policy if exists "hq staff delete daily reports" on public.daily_reports;
create policy "hq staff delete daily reports"
on public.daily_reports for delete to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'admin'));

drop policy if exists "read inventory through report access" on public.inventory_counts;
create policy "read inventory through report access"
on public.inventory_counts for select to authenticated
using (
  exists (
    select 1 from public.daily_reports report
    where report.id = inventory_counts.report_id
  )
);

drop policy if exists "store managers manage inventory for own reports" on public.inventory_counts;
create policy "store managers manage inventory for own reports"
on public.inventory_counts for all to authenticated
using (
  exists (
    select 1 from public.daily_reports report
    where report.id = inventory_counts.report_id
      and public.current_profile_role()::text = 'store_manager'
      and report.store_id = public.current_profile_store_id()
      and report.report_date between public.current_taipei_business_date() - 13
        and public.current_taipei_business_date()
  )
)
with check (
  exists (
    select 1 from public.daily_reports report
    where report.id = inventory_counts.report_id
      and public.current_profile_role()::text = 'store_manager'
      and report.store_id = public.current_profile_store_id()
      and report.report_date between public.current_taipei_business_date() - 13
        and public.current_taipei_business_date()
  )
);

drop policy if exists "hq staff manage inventory counts" on public.inventory_counts;
create policy "hq staff manage inventory counts"
on public.inventory_counts for all to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'admin'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'admin'));

drop policy if exists "read review actions through report access" on public.review_actions;
create policy "read review actions through report access"
on public.review_actions for select to authenticated
using (
  exists (
    select 1 from public.daily_reports report
    where report.id = review_actions.report_id
  )
);

drop policy if exists "supervisors create review actions" on public.review_actions;
create policy "supervisors create review actions"
on public.review_actions for insert to authenticated
with check (
  public.current_profile_role()::text in ('ceo', 'coo', 'hq', 'supervisor', 'admin')
  and created_by = (select auth.uid())
);
