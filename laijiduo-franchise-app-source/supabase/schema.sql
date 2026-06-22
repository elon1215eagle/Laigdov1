do $$
begin
  create type public.franchise_app_role as enum ('franchise_admin', 'franchise_owner');
exception when duplicate_object then null;
end $$;

create table if not exists public.franchise_stores (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  name text not null,
  owner_name text,
  area text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.franchise_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.franchise_app_role not null default 'franchise_owner',
  franchise_store_id uuid references public.franchise_stores(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.franchise_daily_reports (
  id uuid primary key default gen_random_uuid(),
  franchise_store_id uuid not null references public.franchise_stores(id) on delete cascade,
  report_date date not null,
  opened_to_1400_revenue numeric(12,2) not null default 0,
  revenue_1400_to_1900 numeric(12,2) not null default 0,
  revenue_1900_to_close numeric(12,2) not null default 0,
  full_day_revenue numeric(12,2) not null default 0,
  cash_revenue numeric(12,2) not null default 0,
  delivery_revenue numeric(12,2) not null default 0,
  other_revenue numeric(12,2) not null default 0,
  note text not null default '',
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (franchise_store_id, report_date)
);

create table if not exists public.franchise_expenses (
  id uuid primary key default gen_random_uuid(),
  franchise_store_id uuid not null references public.franchise_stores(id) on delete cascade,
  expense_date date not null,
  category text not null,
  amount numeric(12,2) not null default 0,
  payment_method text not null default '現金',
  vendor text not null default '',
  receipt_note text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists franchise_daily_reports_store_date_idx
  on public.franchise_daily_reports (franchise_store_id, report_date desc);

create index if not exists franchise_expenses_store_date_idx
  on public.franchise_expenses (franchise_store_id, expense_date desc);

create or replace function public.current_franchise_role()
returns public.franchise_app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.franchise_profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.current_franchise_store_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select franchise_store_id from public.franchise_profiles where id = auth.uid() and is_active = true
$$;

alter table public.franchise_stores enable row level security;
alter table public.franchise_profiles enable row level security;
alter table public.franchise_daily_reports enable row level security;
alter table public.franchise_expenses enable row level security;

drop policy if exists "franchise stores visible by role" on public.franchise_stores;
create policy "franchise stores visible by role"
on public.franchise_stores for select
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or id = public.current_franchise_store_id()
);

drop policy if exists "franchise admin manages stores" on public.franchise_stores;
create policy "franchise admin manages stores"
on public.franchise_stores for all
to authenticated
using (public.current_franchise_role() = 'franchise_admin')
with check (public.current_franchise_role() = 'franchise_admin');

drop policy if exists "franchise profiles read own" on public.franchise_profiles;
create policy "franchise profiles read own"
on public.franchise_profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_franchise_role() = 'franchise_admin'
);

drop policy if exists "franchise admin manages profiles" on public.franchise_profiles;
create policy "franchise admin manages profiles"
on public.franchise_profiles for all
to authenticated
using (public.current_franchise_role() = 'franchise_admin')
with check (public.current_franchise_role() = 'franchise_admin');

drop policy if exists "franchise report read by role" on public.franchise_daily_reports;
create policy "franchise report read by role"
on public.franchise_daily_reports for select
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise report write own" on public.franchise_daily_reports;
create policy "franchise report write own"
on public.franchise_daily_reports for all
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
)
with check (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise expenses read by role" on public.franchise_expenses;
create policy "franchise expenses read by role"
on public.franchise_expenses for select
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise expenses write own" on public.franchise_expenses;
create policy "franchise expenses write own"
on public.franchise_expenses for all
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
)
with check (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

grant select, insert, update, delete on table public.franchise_stores to authenticated;
grant select, insert, update, delete on table public.franchise_profiles to authenticated;
grant select, insert, update, delete on table public.franchise_daily_reports to authenticated;
grant select, insert, update, delete on table public.franchise_expenses to authenticated;
grant execute on function public.current_franchise_role() to authenticated;
grant execute on function public.current_franchise_store_id() to authenticated;
