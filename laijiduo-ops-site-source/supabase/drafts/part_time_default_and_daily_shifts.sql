begin;

alter table public.store_staff
  add column if not exists weekday_start_time time,
  add column if not exists weekday_end_time time,
  add column if not exists holiday_start_time time,
  add column if not exists holiday_end_time time;

update public.store_staff
set
  weekday_start_time = coalesce(weekday_start_time, work_start_time),
  weekday_end_time = coalesce(weekday_end_time, work_end_time),
  holiday_start_time = coalesce(holiday_start_time, weekday_start_time, work_start_time),
  holiday_end_time = coalesce(holiday_end_time, weekday_end_time, work_end_time)
where role_name = '兼職人員';

comment on column public.store_staff.weekday_start_time is '兼職人員平日預設上班時間，可留空。';
comment on column public.store_staff.weekday_end_time is '兼職人員平日預設下班時間，可留空。';
comment on column public.store_staff.holiday_start_time is '兼職人員週末或指定假日預設上班時間，可留空。';
comment on column public.store_staff.holiday_end_time is '兼職人員週末或指定假日預設下班時間，可留空。';

create table if not exists public.daily_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  staff_id text not null references public.store_staff(id) on delete cascade,
  employee_name text not null,
  home_store_code text not null,
  assigned_store_code text not null,
  start_time time not null,
  end_time time not null,
  shift_type text not null default 'override'
    check (shift_type in ('override', 'support')),
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_staff_shifts_time_check check (end_time > start_time),
  constraint daily_staff_shifts_staff_date_unique unique (shift_date, staff_id)
);

create index if not exists daily_staff_shifts_date_store_idx
  on public.daily_staff_shifts (shift_date, assigned_store_code, home_store_code);

drop trigger if exists set_daily_staff_shifts_updated_at on public.daily_staff_shifts;
create trigger set_daily_staff_shifts_updated_at
before update on public.daily_staff_shifts
for each row execute function public.set_store_staff_updated_at();

alter table public.daily_staff_shifts enable row level security;

grant select, insert, update, delete on table public.daily_staff_shifts to authenticated;
grant select, insert, update, delete on table public.daily_staff_shifts to service_role;

drop policy if exists "headquarters manage daily staff shifts" on public.daily_staff_shifts;
create policy "headquarters manage daily staff shifts"
on public.daily_staff_shifts
for all
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

drop policy if exists "store managers read relevant daily staff shifts" on public.daily_staff_shifts;
create policy "store managers read relevant daily staff shifts"
on public.daily_staff_shifts
for select
to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid())
      and s.store_code in (
        public.daily_staff_shifts.home_store_code,
        public.daily_staff_shifts.assigned_store_code
      )
  )
);

drop policy if exists "store managers create own daily staff shifts" on public.daily_staff_shifts;
create policy "store managers create own daily staff shifts"
on public.daily_staff_shifts
for insert
to authenticated
with check (
  public.current_profile_role()::text = 'store_manager'
  and exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid())
      and s.store_code = public.daily_staff_shifts.home_store_code
  )
);

drop policy if exists "store managers update own daily staff shifts" on public.daily_staff_shifts;
create policy "store managers update own daily staff shifts"
on public.daily_staff_shifts
for update
to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid())
      and s.store_code = public.daily_staff_shifts.home_store_code
  )
)
with check (
  public.current_profile_role()::text = 'store_manager'
  and exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid())
      and s.store_code = public.daily_staff_shifts.home_store_code
  )
);

drop policy if exists "store managers delete own daily staff shifts" on public.daily_staff_shifts;
create policy "store managers delete own daily staff shifts"
on public.daily_staff_shifts
for delete
to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and exists (
    select 1
    from public.profiles p
    join public.stores s on s.id = p.store_id
    where p.id = (select auth.uid())
      and s.store_code = public.daily_staff_shifts.home_store_code
  )
);

commit;

