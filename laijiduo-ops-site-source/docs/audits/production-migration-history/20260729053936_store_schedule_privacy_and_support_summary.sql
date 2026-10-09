-- Draft only.
-- Prerequisite: store_identity_and_operating_scope.sql has been reviewed and applied.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

drop policy if exists "authenticated can read monthly leave plans" on public.monthly_leave_plans;
drop policy if exists "authenticated can insert monthly leave plans" on public.monthly_leave_plans;
drop policy if exists "authenticated can update monthly leave plans" on public.monthly_leave_plans;
drop policy if exists "authenticated can delete monthly leave plans" on public.monthly_leave_plans;
drop policy if exists "schedule details visible by operating scope" on public.monthly_leave_plans;

create policy "schedule details visible by operating scope"
  on public.monthly_leave_plans
  for select
  to authenticated
  using (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs', 'supervisor')
    or exists (
      select 1
      from public.profiles profile
      join public.stores own_store on own_store.id = profile.store_id
      where profile.id = (select auth.uid())
        and profile.role::text = 'store_manager'
        and (
          monthly_leave_plans.store_code = own_store.store_code
          or exists (
            select 1
            from public.store_relation_group_members own_member
            join public.store_relation_group_members visible_member
              on visible_member.group_id = own_member.group_id
            where own_member.store_code = own_store.store_code
              and visible_member.store_code = monthly_leave_plans.store_code
          )
        )
    )
  );

create policy "schedule details managed by operating scope"
  on public.monthly_leave_plans
  for all
  to authenticated
  using (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs')
    or exists (
      select 1
      from public.profiles profile
      join public.stores own_store on own_store.id = profile.store_id
      where profile.id = (select auth.uid())
        and profile.role::text = 'store_manager'
        and own_store.operating_status = 'active'
        and (
          monthly_leave_plans.store_code = own_store.store_code
          or exists (
            select 1
            from public.store_relation_groups relation_group
            join public.store_relation_group_members target_member
              on target_member.group_id = relation_group.id
            join public.stores target_store
              on target_store.store_code = target_member.store_code
            where relation_group.coordinating_store_code = own_store.store_code
              and target_member.store_code = monthly_leave_plans.store_code
              and target_store.operating_status = 'suspended'
          )
        )
    )
  )
  with check (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs')
    or exists (
      select 1
      from public.profiles profile
      join public.stores own_store on own_store.id = profile.store_id
      where profile.id = (select auth.uid())
        and profile.role::text = 'store_manager'
        and own_store.operating_status = 'active'
        and (
          monthly_leave_plans.store_code = own_store.store_code
          or exists (
            select 1
            from public.store_relation_groups relation_group
            join public.store_relation_group_members target_member
              on target_member.group_id = relation_group.id
            join public.stores target_store
              on target_store.store_code = target_member.store_code
            where relation_group.coordinating_store_code = own_store.store_code
              and target_member.store_code = monthly_leave_plans.store_code
              and target_store.operating_status = 'suspended'
          )
        )
    )
  );

drop policy if exists "read store staff by authenticated" on public.store_staff;
drop policy if exists "store staff visible by operating scope" on public.store_staff;

create policy "store staff visible by operating scope"
  on public.store_staff
  for select
  to authenticated
  using (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs', 'supervisor')
    or exists (
      select 1
      from public.profiles profile
      join public.stores own_store on own_store.id = profile.store_id
      where profile.id = (select auth.uid())
        and profile.role::text = 'store_manager'
        and (
          store_staff.store_code = own_store.store_code
          or exists (
            select 1
            from public.store_relation_group_members own_member
            join public.store_relation_group_members visible_member
              on visible_member.group_id = own_member.group_id
            where own_member.store_code = own_store.store_code
              and visible_member.store_code = store_staff.store_code
          )
        )
    )
  );

create or replace function private.temporary_support_summary(p_support_date date)
returns table (
  scope_code text,
  scope_name text,
  demand numeric,
  working_people_count bigint,
  lunch_coverage numeric,
  dinner_coverage numeric,
  effective_count numeric,
  surplus numeric,
  part_time_missing_hours bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  return query
  with relation_scopes as (
    select
      relation_group.group_code as scope_code,
      relation_group.group_name as scope_name,
      relation_group.demand::numeric as demand
    from public.store_relation_groups relation_group
    where relation_group.is_active
  ),
  grouped_store_codes as (
    select member.store_code
    from public.store_relation_group_members member
    join public.store_relation_groups relation_group on relation_group.id = member.group_id
    where relation_group.is_active
  ),
  standalone_scopes as (
    select
      store.store_code as scope_code,
      store.name as scope_name,
      coalesce(setting.scheduled_staff_count, 0)::numeric as demand
    from public.stores store
    left join public.store_settings setting on setting.store_name = store.name
    where store.operating_status = 'active'
      and not exists (
        select 1 from grouped_store_codes grouped where grouped.store_code = store.store_code
      )
  ),
  scopes as (
    select * from relation_scopes
    union all
    select * from standalone_scopes
  ),
  scope_members as (
    select relation_group.group_code as scope_code, member.store_code
    from public.store_relation_groups relation_group
    join public.store_relation_group_members member on member.group_id = relation_group.id
    where relation_group.is_active
    union all
    select standalone.scope_code, standalone.scope_code from standalone_scopes standalone
  ),
  staff_assignments as (
    select
      staff.id,
      staff.role_name,
      coalesce(day_shift.assigned_store_code, staff.store_code) as effective_store_code,
      coalesce(
        day_shift.start_time,
        case when extract(isodow from p_support_date) in (6, 7)
          then coalesce(staff.holiday_start_time, staff.weekday_start_time, staff.work_start_time)
          else coalesce(staff.weekday_start_time, staff.work_start_time)
        end
      ) as effective_start_time,
      coalesce(
        day_shift.end_time,
        case when extract(isodow from p_support_date) in (6, 7)
          then coalesce(staff.holiday_end_time, staff.weekday_end_time, staff.work_end_time)
          else coalesce(staff.weekday_end_time, staff.work_end_time)
        end
      ) as effective_end_time
    from public.store_staff staff
    left join public.daily_staff_shifts day_shift
      on day_shift.staff_id = staff.id
      and day_shift.shift_date = p_support_date
    where staff.is_active
      and staff.role_name not in ('兼職後勤', '送貨人員')
      and staff.role_name !~ '(外送|送貨|配送)'
  ),
  eligible_staff as (
    select
      scope.scope_code,
      scope.scope_name,
      scope.demand,
      staff.id,
      staff.role_name,
      staff.effective_start_time as work_start_time,
      staff.effective_end_time as work_end_time,
      leave_plan.leave_days,
      not (
        extract(day from p_support_date)::integer =
        any(coalesce(leave_plan.leave_days, '{}'::integer[]))
      ) as is_working
    from scopes scope
    join scope_members member on member.scope_code = scope.scope_code
    join staff_assignments staff
      on staff.effective_store_code = member.store_code
    left join public.monthly_leave_plans leave_plan
      on leave_plan.period_month = to_char(p_support_date, 'YYYY-MM')
      and leave_plan.staff_id = staff.id
  ),
  coverage as (
    select
      staff.*,
      case
        when not staff.is_working then 0::numeric
        when staff.role_name <> '兼職人員' then 1::numeric
        when staff.work_start_time is null or staff.work_end_time is null then 0::numeric
        else greatest(
          0,
          extract(epoch from (
            least(staff.work_end_time, time '14:00') -
            greatest(staff.work_start_time, time '11:00')
          )) / 10800
        )
      end as lunch_ratio,
      case
        when not staff.is_working then 0::numeric
        when staff.role_name <> '兼職人員' then 1::numeric
        when staff.work_start_time is null or staff.work_end_time is null then 0::numeric
        else greatest(
          0,
          extract(epoch from (
            least(staff.work_end_time, time '19:00') -
            greatest(staff.work_start_time, time '16:30')
          )) / 9000
        )
      end as dinner_ratio
    from eligible_staff staff
  ),
  totals as (
    select
      scope.scope_code,
      scope.scope_name,
      scope.demand,
      count(coverage.id) filter (where coverage.is_working) as working_people_count,
      coalesce(sum(coverage.lunch_ratio), 0)::numeric as lunch_coverage,
      coalesce(sum(coverage.dinner_ratio), 0)::numeric as dinner_coverage,
      count(coverage.id) filter (
        where coverage.is_working
          and coverage.role_name = '兼職人員'
          and (coverage.work_start_time is null or coverage.work_end_time is null)
      ) as part_time_missing_hours
    from scopes scope
    left join coverage on coverage.scope_code = scope.scope_code
    group by scope.scope_code, scope.scope_name, scope.demand
  )
  select
    total.scope_code,
    total.scope_name,
    total.demand,
    total.working_people_count,
    round(total.lunch_coverage, 2),
    round(total.dinner_coverage, 2),
    round(least(total.lunch_coverage, total.dinner_coverage), 2),
    round(least(total.lunch_coverage, total.dinner_coverage) - total.demand, 2),
    total.part_time_missing_hours
  from totals total
  order by least(total.lunch_coverage, total.dinner_coverage) - total.demand, total.scope_code;
end;
$$;

revoke all on function private.temporary_support_summary(date) from public;
grant execute on function private.temporary_support_summary(date) to authenticated;

create or replace function public.get_temporary_support_summary(p_support_date date)
returns table (
  scope_code text,
  scope_name text,
  demand numeric,
  working_people_count bigint,
  lunch_coverage numeric,
  dinner_coverage numeric,
  effective_count numeric,
  surplus numeric,
  part_time_missing_hours bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$
  select * from private.temporary_support_summary(p_support_date);
$$;

revoke all on function public.get_temporary_support_summary(date) from public;
grant execute on function public.get_temporary_support_summary(date) to authenticated;
