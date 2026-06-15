create table if not exists public.monthly_leave_plans (
  id uuid primary key default gen_random_uuid(),
  period_month text not null check (period_month ~ '^\d{4}-\d{2}$'),
  store_code text not null,
  store_name text not null,
  staff_id text not null,
  employee_name text not null,
  role_name text not null,
  leave_days integer[] not null default '{}',
  note text not null default '',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_leave_plans_unique unique (period_month, staff_id)
);

create index if not exists monthly_leave_plans_period_store_idx
  on public.monthly_leave_plans (period_month, store_code);

create or replace function public.set_monthly_leave_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_monthly_leave_plans_updated_at on public.monthly_leave_plans;
create trigger set_monthly_leave_plans_updated_at
before update on public.monthly_leave_plans
for each row execute function public.set_monthly_leave_plans_updated_at();

alter table public.monthly_leave_plans enable row level security;

drop policy if exists "authenticated can read monthly leave plans" on public.monthly_leave_plans;
create policy "authenticated can read monthly leave plans"
on public.monthly_leave_plans
for select
to authenticated
using (true);

drop policy if exists "authenticated can insert monthly leave plans" on public.monthly_leave_plans;
create policy "authenticated can insert monthly leave plans"
on public.monthly_leave_plans
for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update monthly leave plans" on public.monthly_leave_plans;
create policy "authenticated can update monthly leave plans"
on public.monthly_leave_plans
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can delete monthly leave plans" on public.monthly_leave_plans;
create policy "authenticated can delete monthly leave plans"
on public.monthly_leave_plans
for delete
to authenticated
using (true);

grant select, insert, update, delete on table public.monthly_leave_plans to authenticated;
grant select, insert, update, delete on table public.monthly_leave_plans to service_role;
