create table if not exists public.monthly_schedule_locks (
  period_month text primary key check (period_month ~ '^\d{4}-\d{2}$'),
  is_confirmed boolean not null default false,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  period_month text not null check (period_month ~ '^\d{4}-\d{2}$'),
  store_code text not null,
  store_name text not null,
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'closed')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_schedule_change_requests_unique unique (period_month, store_code)
);

create index if not exists monthly_schedule_change_requests_period_idx
  on public.monthly_schedule_change_requests (period_month, store_code, status);

update public.stores
set store_code = 'TMP-LONGXING'
where store_code in ('S05', 'S06')
  and name = '前鎮隆興店';

update public.stores
set store_code = 'TMP-NANHUA'
where store_code in ('S05', 'S06')
  and name = '鳳山南華店';

update public.stores
set
  store_code = 'S05',
  name = '前鎮隆興店',
  manager_name = '威廷副店長',
  target_daily_revenue = 72000,
  target_monthly_revenue = 2160000,
  is_active = true
where store_code = 'TMP-LONGXING';

update public.stores
set
  store_code = 'S06',
  name = '鳳山南華店',
  manager_name = '人力不足暫停',
  target_daily_revenue = 0,
  target_monthly_revenue = 0,
  is_active = false
where store_code = 'TMP-NANHUA';

update public.profiles p
set store_id = s.id,
    updated_at = now()
from public.stores s
where p.role = 'store_manager'
  and (
    (p.full_name like 'S05 %' and s.store_code = 'S05')
    or (p.full_name like 'S06 %' and s.store_code = 'S06')
  );

do $$
begin
  if to_regclass('public.store_staff') is not null then
    update public.store_staff
    set store_code = 'S05',
        store_name = '前鎮隆興店'
    where store_name = '前鎮隆興店';

    update public.store_staff
    set store_code = 'S06',
        store_name = '鳳山南華店',
        is_active = false
    where store_name = '鳳山南華店';
  end if;

  if to_regclass('public.monthly_leave_plans') is not null then
    update public.monthly_leave_plans
    set store_code = 'S05',
        store_name = '前鎮隆興店'
    where store_name = '前鎮隆興店';

    update public.monthly_leave_plans
    set store_code = 'S06',
        store_name = '鳳山南華店'
    where store_name = '鳳山南華店';
  end if;

  if to_regclass('public.monthly_schedule_change_requests') is not null then
    update public.monthly_schedule_change_requests
    set store_code = 'S05',
        store_name = '前鎮隆興店'
    where store_name = '前鎮隆興店';

    update public.monthly_schedule_change_requests
    set store_code = 'S06',
        store_name = '鳳山南華店'
    where store_name = '鳳山南華店';
  end if;
end $$;

create or replace function public.set_monthly_schedule_lock_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_monthly_schedule_lock_updated_at on public.monthly_schedule_locks;
create trigger set_monthly_schedule_lock_updated_at
before update on public.monthly_schedule_locks
for each row execute function public.set_monthly_schedule_lock_updated_at();

drop trigger if exists set_monthly_schedule_change_request_updated_at on public.monthly_schedule_change_requests;
create trigger set_monthly_schedule_change_request_updated_at
before update on public.monthly_schedule_change_requests
for each row execute function public.set_monthly_schedule_lock_updated_at();

alter table public.monthly_schedule_locks enable row level security;
alter table public.monthly_schedule_change_requests enable row level security;

grant select, insert, update on table public.monthly_schedule_locks to authenticated;
grant select, insert, update on table public.monthly_schedule_change_requests to authenticated;
grant select, insert, update on table public.monthly_schedule_locks to service_role;
grant select, insert, update on table public.monthly_schedule_change_requests to service_role;

drop policy if exists "authenticated read monthly schedule locks" on public.monthly_schedule_locks;
create policy "authenticated read monthly schedule locks"
on public.monthly_schedule_locks
for select
to authenticated
using (true);

drop policy if exists "headquarters manage monthly schedule locks" on public.monthly_schedule_locks;
create policy "headquarters manage monthly schedule locks"
on public.monthly_schedule_locks
for all
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

drop policy if exists "authenticated read monthly schedule change requests" on public.monthly_schedule_change_requests;
create policy "authenticated read monthly schedule change requests"
on public.monthly_schedule_change_requests
for select
to authenticated
using (
  public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs')
  or (
    public.current_profile_role()::text = 'store_manager'
    and exists (
      select 1
      from public.profiles p
      join public.stores s on s.id = p.store_id
      where p.id = (select auth.uid())
        and (
          public.monthly_schedule_change_requests.store_code = s.store_code
          or (s.store_code in ('S01', 'S06') and public.monthly_schedule_change_requests.store_code = 'S01-S06')
          or (s.store_code in ('S02', 'S03') and public.monthly_schedule_change_requests.store_code = 'S02-S03')
        )
    )
  )
);

drop policy if exists "store managers create own monthly schedule change requests" on public.monthly_schedule_change_requests;
create policy "store managers create own monthly schedule change requests"
on public.monthly_schedule_change_requests
for insert
to authenticated
with check (
  public.current_profile_role()::text = 'store_manager'
  and exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid())
      and (
        public.monthly_schedule_change_requests.store_code = s.store_code
        or (s.store_code in ('S01', 'S06') and public.monthly_schedule_change_requests.store_code = 'S01-S06')
        or (s.store_code in ('S02', 'S03') and public.monthly_schedule_change_requests.store_code = 'S02-S03')
      )
  )
);

drop policy if exists "headquarters manage monthly schedule change requests" on public.monthly_schedule_change_requests;
create policy "headquarters manage monthly schedule change requests"
on public.monthly_schedule_change_requests
for all
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));
