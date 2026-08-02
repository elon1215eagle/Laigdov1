create or replace function public.upsert_store_staff_secure(p_payload jsonb)
returns setof public.store_staff
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_role text := coalesce(public.current_profile_role()::text, '');
  salary_allowed boolean := false;
begin
  if actor_role not in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then
    raise exception '目前帳號沒有維護人資主檔的權限';
  end if;

  salary_allowed := actor_role in ('ceo', 'cfo')
    or (actor_role = 'coo' and public.has_salary_access());

  return query
  insert into public.store_staff as existing (
    id, store_code, store_name, employee_name, role_name,
    employment_type, work_category, employment_status, auth_user_id,
    work_start_time, work_end_time,
    weekday_start_time, weekday_end_time,
    holiday_start_time, holiday_end_time,
    estimated_hourly_cost, estimated_monthly_cost,
    sort_order, is_active, updated_by, updated_at
  ) values (
    p_payload->>'id',
    p_payload->>'store_code',
    p_payload->>'store_name',
    p_payload->>'employee_name',
    p_payload->>'role_name',
    nullif(p_payload->>'employment_type', ''),
    nullif(p_payload->>'work_category', ''),
    nullif(p_payload->>'employment_status', ''),
    nullif(p_payload->>'auth_user_id', '')::uuid,
    nullif(p_payload->>'work_start_time', '')::time,
    nullif(p_payload->>'work_end_time', '')::time,
    nullif(p_payload->>'weekday_start_time', '')::time,
    nullif(p_payload->>'weekday_end_time', '')::time,
    nullif(p_payload->>'holiday_start_time', '')::time,
    nullif(p_payload->>'holiday_end_time', '')::time,
    case when salary_allowed and p_payload ? 'estimated_hourly_cost'
      then nullif(p_payload->>'estimated_hourly_cost', '')::numeric else null end,
    case when salary_allowed and p_payload ? 'estimated_monthly_cost'
      then nullif(p_payload->>'estimated_monthly_cost', '')::numeric else null end,
    coalesce(nullif(p_payload->>'sort_order', '')::integer, 999),
    coalesce((p_payload->>'is_active')::boolean, true),
    auth.uid(),
    now()
  )
  on conflict (id) do update set
    store_code = excluded.store_code,
    store_name = excluded.store_name,
    employee_name = excluded.employee_name,
    role_name = excluded.role_name,
    employment_type = excluded.employment_type,
    work_category = excluded.work_category,
    employment_status = excluded.employment_status,
    auth_user_id = excluded.auth_user_id,
    work_start_time = excluded.work_start_time,
    work_end_time = excluded.work_end_time,
    weekday_start_time = excluded.weekday_start_time,
    weekday_end_time = excluded.weekday_end_time,
    holiday_start_time = excluded.holiday_start_time,
    holiday_end_time = excluded.holiday_end_time,
    estimated_hourly_cost = case when salary_allowed
      then excluded.estimated_hourly_cost else existing.estimated_hourly_cost end,
    estimated_monthly_cost = case when salary_allowed
      then excluded.estimated_monthly_cost else existing.estimated_monthly_cost end,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_by = auth.uid(),
    updated_at = now()
  returning existing.*;
end;
$$;

revoke all on function public.upsert_store_staff_secure(jsonb) from public, anon;
grant execute on function public.upsert_store_staff_secure(jsonb) to authenticated;

