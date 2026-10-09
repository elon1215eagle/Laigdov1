create table if not exists public.salary_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_name text not null,
  reason text not null check (length(trim(reason)) >= 3),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists salary_access_events_active_idx
  on public.salary_access_events (user_id, expires_at desc);
alter table public.salary_access_events enable row level security;
grant select on public.salary_access_events to authenticated;
create policy "users read own salary access events" on public.salary_access_events
for select to authenticated using (user_id = auth.uid());
create policy "executives read salary access events" on public.salary_access_events
for select to authenticated
using (public.current_profile_role()::text in ('ceo', 'cfo'));

create or replace function public.request_coo_salary_access(p_reason text)
returns timestamptz language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare expiry timestamptz := now() + interval '15 minutes';
begin
  if public.current_profile_role()::text <> 'coo' then raise exception 'only COO may request temporary salary access'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason is required'; end if;
  insert into public.salary_access_events(user_id, role_name, reason, expires_at)
  values (auth.uid(), 'coo', trim(p_reason), expiry);
  return expiry;
end;
$$;
revoke all on function public.request_coo_salary_access(text) from public, anon;
grant execute on function public.request_coo_salary_access(text) to authenticated;

create or replace function public.has_salary_access()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.current_profile_role()::text in ('ceo', 'cfo')
    or (
      public.current_profile_role()::text = 'coo'
      and exists (
        select 1 from public.salary_access_events e
        where e.user_id = auth.uid() and e.expires_at > now()
      )
    );
$$;
revoke all on function public.has_salary_access() from public, anon;
grant execute on function public.has_salary_access() to authenticated;

create or replace function public.get_store_staff_secure()
returns setof jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select to_jsonb(staff_row)
    || jsonb_build_object(
      'estimated_hourly_cost', case when public.has_salary_access() then staff_row.estimated_hourly_cost else null end,
      'estimated_monthly_cost', case when public.has_salary_access() then staff_row.estimated_monthly_cost else null end
    )
  from public.store_staff staff_row
  where
    public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs', 'supervisor')
    or exists (
      select 1 from public.profiles profile
      join public.stores own_store on own_store.id = profile.store_id
      where profile.id = auth.uid()
        and profile.role::text = 'store_manager'
        and (
          staff_row.store_code = own_store.store_code
          or exists (
            select 1
            from public.store_relation_group_members own_member
            join public.store_relation_group_members visible_member on visible_member.group_id = own_member.group_id
            where own_member.store_code = own_store.store_code
              and visible_member.store_code = staff_row.store_code
          )
        )
    )
  order by staff_row.store_code, staff_row.sort_order, staff_row.employee_name;
$$;
revoke all on function public.get_store_staff_secure() from public, anon;
grant execute on function public.get_store_staff_secure() to authenticated;

revoke select on public.store_staff from authenticated;
grant select (
  id, store_code, store_name, employee_name, role_name, employment_type,
  work_category, employment_status, auth_user_id, work_start_time, work_end_time,
  weekday_start_time, weekday_end_time, holiday_start_time, holiday_end_time,
  sort_order, is_active, created_at, updated_at
) on public.store_staff to authenticated;
