-- 2026-06-15 Laijiduo handover and staff performance modules.

create extension if not exists "pgcrypto";

create table if not exists public.store_handovers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  handover_date date not null,
  shift_type text not null check (shift_type in ('早班', '晚班', '打烊')),
  cash_status text not null default '正常',
  inventory_status text not null default '正常',
  equipment_status text not null default '正常',
  cleaning_status text not null default '完成',
  customer_issue text,
  pending_tasks text,
  manager_name text,
  status text not null default '已完成',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, handover_date, shift_type)
);

create index if not exists store_handovers_date_store_idx
on public.store_handovers (handover_date desc, store_id);

create index if not exists store_handovers_status_idx
on public.store_handovers (status);

create table if not exists public.staff_performance (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id),
  period_month text not null,
  employee_name text not null,
  role_name text not null,
  late_count integer not null default 0,
  leave_count integer not null default 0,
  absence_count integer not null default 0,
  service_delay_count integer not null default 0,
  score numeric(6,2) not null default 100,
  grade text not null default 'A',
  bonus_adjustment numeric(12,2) not null default 0,
  status text not null default '正常',
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, period_month, employee_name)
);

create index if not exists staff_performance_month_store_idx
on public.staff_performance (period_month desc, store_id);

create index if not exists staff_performance_score_idx
on public.staff_performance (score, status);

grant select, insert, update, delete on public.store_handovers to authenticated;
grant select, insert, update, delete on public.staff_performance to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.store_handovers enable row level security;
alter table public.staff_performance enable row level security;
