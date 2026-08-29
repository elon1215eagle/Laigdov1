alter table public.monthly_leave_plans
  add column if not exists day_statuses jsonb not null default '{}'::jsonb;

create or replace function public.upsert_monthly_leave_plans_new(p_rows jsonb)
returns setof public.monthly_leave_plans
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  perform set_config('app.workforce_writer', 'new_module', true);
  return query
  insert into public.monthly_leave_plans (
    period_month, store_code, store_name, staff_id, employee_name, role_name,
    leave_days, manual_leave_days, auto_leave_days, day_statuses, leave_type, note, updated_by
  )
  select row_data.period_month, row_data.store_code, row_data.store_name, row_data.staff_id,
    row_data.employee_name, row_data.role_name, row_data.leave_days,
    row_data.manual_leave_days, row_data.auto_leave_days, coalesce(row_data.day_statuses, '{}'::jsonb),
    coalesce(row_data.leave_type, '排休'), coalesce(row_data.note, ''), auth.uid()
  from jsonb_to_recordset(p_rows) as row_data(
    period_month text, store_code text, store_name text, staff_id text,
    employee_name text, role_name text, leave_days integer[], manual_leave_days integer[],
    auto_leave_days integer[], day_statuses jsonb, leave_type text, note text
  )
  on conflict (period_month, staff_id) do update set
    store_code=excluded.store_code, store_name=excluded.store_name,
    employee_name=excluded.employee_name, role_name=excluded.role_name,
    leave_days=excluded.leave_days, manual_leave_days=excluded.manual_leave_days,
    auto_leave_days=excluded.auto_leave_days, day_statuses=excluded.day_statuses,
    leave_type=excluded.leave_type, note=excluded.note,
    updated_by=auth.uid(), updated_at=now()
  returning *;
end;
$$;

revoke all on function public.upsert_monthly_leave_plans_new(jsonb) from public, anon;
grant execute on function public.upsert_monthly_leave_plans_new(jsonb) to authenticated;
