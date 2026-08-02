create or replace function public.enforce_workforce_single_writer()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare setting_row public.workforce_rollout_settings;
declare record_month text;
begin
  select * into setting_row from public.workforce_rollout_settings where setting_key = 'workforce';
  if tg_table_name = 'monthly_leave_plans' then
    if tg_op = 'DELETE' then record_month := old.period_month; else record_month := new.period_month; end if;
  else
    if tg_op = 'DELETE' then record_month := to_char(old.shift_date, 'YYYY-MM'); else record_month := to_char(new.shift_date, 'YYYY-MM'); end if;
  end if;
  if setting_row.rollout_mode = 'new'
     and record_month >= setting_row.cutover_month
     and coalesce(current_setting('app.workforce_writer', true), '') <> 'new_module' then
    raise exception '新版切換月份後僅允許人力排班模組寫入';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists enforce_leave_plan_single_writer on public.monthly_leave_plans;
create trigger enforce_leave_plan_single_writer
before insert or update or delete on public.monthly_leave_plans
for each row execute function public.enforce_workforce_single_writer();
drop trigger if exists enforce_daily_shift_single_writer on public.daily_staff_shifts;
create trigger enforce_daily_shift_single_writer
before insert or update or delete on public.daily_staff_shifts
for each row execute function public.enforce_workforce_single_writer();

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
    leave_days, manual_leave_days, auto_leave_days, leave_type, note, updated_by
  )
  select
    row_data.period_month, row_data.store_code, row_data.store_name, row_data.staff_id,
    row_data.employee_name, row_data.role_name, row_data.leave_days,
    row_data.manual_leave_days, row_data.auto_leave_days,
    coalesce(row_data.leave_type, '排休'), coalesce(row_data.note, ''), auth.uid()
  from jsonb_to_recordset(p_rows) as row_data(
    period_month text, store_code text, store_name text, staff_id text,
    employee_name text, role_name text, leave_days integer[],
    manual_leave_days integer[], auto_leave_days integer[], leave_type text, note text
  )
  on conflict (period_month, staff_id) do update set
    store_code = excluded.store_code, store_name = excluded.store_name,
    employee_name = excluded.employee_name, role_name = excluded.role_name,
    leave_days = excluded.leave_days, manual_leave_days = excluded.manual_leave_days,
    auto_leave_days = excluded.auto_leave_days, leave_type = excluded.leave_type,
    note = excluded.note, updated_by = auth.uid(), updated_at = now()
  returning *;
end;
$$;

create or replace function public.upsert_daily_staff_shift_new(p_row jsonb)
returns public.daily_staff_shifts
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare result_row public.daily_staff_shifts;
begin
  perform set_config('app.workforce_writer', 'new_module', true);
  insert into public.daily_staff_shifts (
    id, shift_date, staff_id, employee_name, home_store_code, assigned_store_code,
    start_time, end_time, shift_type, note, created_by, updated_at
  ) values (
    coalesce(nullif(p_row->>'id','')::uuid, gen_random_uuid()),
    (p_row->>'shift_date')::date, p_row->>'staff_id', coalesce(p_row->>'employee_name',''),
    p_row->>'home_store_code', p_row->>'assigned_store_code',
    (p_row->>'start_time')::time, (p_row->>'end_time')::time,
    coalesce(p_row->>'shift_type','override'), coalesce(p_row->>'note',''), auth.uid(), now()
  )
  on conflict (id) do update set
    shift_date=excluded.shift_date, staff_id=excluded.staff_id,
    employee_name=excluded.employee_name, home_store_code=excluded.home_store_code,
    assigned_store_code=excluded.assigned_store_code, start_time=excluded.start_time,
    end_time=excluded.end_time, shift_type=excluded.shift_type,
    note=excluded.note, updated_at=now()
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.delete_daily_staff_shift_new(p_shift_id uuid)
returns void language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  perform set_config('app.workforce_writer', 'new_module', true);
  delete from public.daily_staff_shifts where id = p_shift_id;
end;
$$;

revoke all on function public.upsert_monthly_leave_plans_new(jsonb) from public, anon;
revoke all on function public.upsert_daily_staff_shift_new(jsonb) from public, anon;
revoke all on function public.delete_daily_staff_shift_new(uuid) from public, anon;
grant execute on function public.upsert_monthly_leave_plans_new(jsonb) to authenticated;
grant execute on function public.upsert_daily_staff_shift_new(jsonb) to authenticated;
grant execute on function public.delete_daily_staff_shift_new(uuid) to authenticated;
