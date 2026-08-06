alter table public.store_operating_settings
  add column if not exists baseline_demand integer not null default 0 check (baseline_demand >= 0),
  add column if not exists lunch_peak_demand integer not null default 0 check (lunch_peak_demand >= 0),
  add column if not exists dinner_peak_demand integer not null default 0 check (dinner_peak_demand >= 0);

update public.store_operating_settings setting
set baseline_demand=coalesce((select required_count from public.store_staffing_demand_rules rule_row where rule_row.store_code=setting.store_code and rule_row.rule_type='baseline' and rule_row.is_active order by rule_row.created_at desc limit 1),0),
    lunch_peak_demand=coalesce((select required_count from public.store_staffing_demand_rules rule_row where rule_row.store_code=setting.store_code and rule_row.rule_type='baseline' and rule_row.is_active order by rule_row.created_at desc limit 1),0),
    dinner_peak_demand=coalesce((select required_count from public.store_staffing_demand_rules rule_row where rule_row.store_code=setting.store_code and rule_row.rule_type='baseline' and rule_row.is_active order by rule_row.created_at desc limit 1),0);

create or replace function public.save_store_operating_configuration(
  p_store_code text,
  p_payload jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  store_before jsonb;
  settings_before jsonb;
  result_payload jsonb;
  baseline_start time;
  baseline_end time;
begin
  if actor_id is null then raise exception '尚未登入'; end if;
  select role::text into actor_role from public.profiles where id=actor_id and is_active=true;
  if actor_role not in ('ceo','coo','admin','hq','general_affairs') then raise exception '沒有門店營運設定權限'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception '修改原因至少需要三個字'; end if;
  if not exists (select 1 from public.stores where store_code=p_store_code) then raise exception '找不到門店'; end if;

  select to_jsonb(s) into store_before from public.stores s where s.store_code=p_store_code;
  select coalesce(to_jsonb(o), '{}'::jsonb) into settings_before from public.store_operating_settings o where o.store_code=p_store_code;

  update public.stores set
    manager_name=coalesce(nullif(trim(p_payload->>'manager_name'),''), manager_name),
    operating_status=coalesce(nullif(p_payload->>'operating_status',''), operating_status),
    is_active=coalesce((p_payload->>'is_active')::boolean, is_active),
    target_monthly_revenue=coalesce((p_payload->>'target_monthly_revenue')::numeric, target_monthly_revenue),
    target_daily_revenue=coalesce((p_payload->>'target_daily_revenue')::integer, target_daily_revenue)
  where store_code=p_store_code;

  insert into public.store_operating_settings (
    store_code, weekday_open_time, weekday_close_time, holiday_open_time, holiday_close_time,
    lunch_peak_start, lunch_peak_end, dinner_peak_start, dinner_peak_end,
    lunch_report_time, dinner_report_time, close_report_time,
    baseline_demand, lunch_peak_demand, dinner_peak_demand, effective_from, updated_by, updated_at
  ) values (
    p_store_code,
    (p_payload->>'weekday_open_time')::time, (p_payload->>'weekday_close_time')::time,
    (p_payload->>'holiday_open_time')::time, (p_payload->>'holiday_close_time')::time,
    (p_payload->>'lunch_peak_start')::time, (p_payload->>'lunch_peak_end')::time,
    (p_payload->>'dinner_peak_start')::time, (p_payload->>'dinner_peak_end')::time,
    (p_payload->>'lunch_report_time')::time, (p_payload->>'dinner_report_time')::time,
    (p_payload->>'close_report_time')::time,
    greatest(0,(p_payload->>'baseline_demand')::integer),
    greatest(0,(p_payload->>'lunch_peak_demand')::integer),
    greatest(0,(p_payload->>'dinner_peak_demand')::integer),
    coalesce((p_payload->>'effective_from')::date,current_date), actor_id, now()
  ) on conflict (store_code) do update set
    weekday_open_time=excluded.weekday_open_time, weekday_close_time=excluded.weekday_close_time,
    holiday_open_time=excluded.holiday_open_time, holiday_close_time=excluded.holiday_close_time,
    lunch_peak_start=excluded.lunch_peak_start, lunch_peak_end=excluded.lunch_peak_end,
    dinner_peak_start=excluded.dinner_peak_start, dinner_peak_end=excluded.dinner_peak_end,
    lunch_report_time=excluded.lunch_report_time, dinner_report_time=excluded.dinner_report_time,
    close_report_time=excluded.close_report_time,
    baseline_demand=excluded.baseline_demand, lunch_peak_demand=excluded.lunch_peak_demand,
    dinner_peak_demand=excluded.dinner_peak_demand, effective_from=excluded.effective_from,
    updated_by=actor_id, updated_at=now();

  baseline_start := (p_payload->>'weekday_open_time')::time;
  baseline_end := (p_payload->>'weekday_close_time')::time;
  update public.store_staffing_demand_rules set is_active=false, updated_at=now()
  where store_code=p_store_code and rule_type='baseline' and is_active;
  insert into public.store_staffing_demand_rules (
    store_code, rule_type, start_time, end_time, required_count, is_active, note, created_by
  )
  select p_store_code, 'baseline', segment.start_time, segment.end_time, segment.required_count, true, segment.note, actor_id
  from (values
    (baseline_start, (p_payload->>'lunch_peak_start')::time, greatest(0,(p_payload->>'baseline_demand')::integer), '一般時段'),
    ((p_payload->>'lunch_peak_start')::time, (p_payload->>'lunch_peak_end')::time, greatest(0,(p_payload->>'lunch_peak_demand')::integer), '午峰時段'),
    ((p_payload->>'lunch_peak_end')::time, (p_payload->>'dinner_peak_start')::time, greatest(0,(p_payload->>'baseline_demand')::integer), '一般時段'),
    ((p_payload->>'dinner_peak_start')::time, (p_payload->>'dinner_peak_end')::time, greatest(0,(p_payload->>'dinner_peak_demand')::integer), '晚峰時段'),
    ((p_payload->>'dinner_peak_end')::time, baseline_end, greatest(0,(p_payload->>'baseline_demand')::integer), '一般時段')
  ) segment(start_time,end_time,required_count,note)
  where segment.end_time > segment.start_time
  on conflict (store_code, rule_type, coalesce(weekday,-1), coalesce(special_date,date '1900-01-01'), start_time, end_time)
  do update set required_count=excluded.required_count, is_active=true, note=excluded.note, updated_at=now();

  if nullif(p_payload->>'relation_group_code','') is not null then
    update public.store_relation_groups set
      demand=greatest(0,(p_payload->>'group_demand')::integer),
      rule_note=coalesce(p_payload->>'relation_rule_note',rule_note), updated_at=now()
    where group_code=p_payload->>'relation_group_code';
  end if;

  select jsonb_build_object(
    'store', to_jsonb(s), 'settings', to_jsonb(o),
    'baseline_demand', (p_payload->>'baseline_demand')::integer
  ) into result_payload
  from public.stores s join public.store_operating_settings o on o.store_code=s.store_code
  where s.store_code=p_store_code;

  insert into public.store_operating_setting_audits (
    store_code, change_reason, before_data, after_data, changed_by
  ) values (
    p_store_code, trim(p_reason),
    jsonb_build_object('store',store_before,'settings',settings_before), result_payload, actor_id
  );
  return result_payload;
end;
$$;

revoke all on function public.save_store_operating_configuration(text,jsonb,text) from public, anon;
grant execute on function public.save_store_operating_configuration(text,jsonb,text) to authenticated;
