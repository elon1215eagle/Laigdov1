create table if not exists public.store_operating_settings (
  store_code text primary key references public.stores(store_code) on delete cascade,
  weekday_open_time time not null,
  weekday_close_time time not null,
  holiday_open_time time not null,
  holiday_close_time time not null,
  lunch_peak_start time not null,
  lunch_peak_end time not null,
  dinner_peak_start time not null,
  dinner_peak_end time not null,
  lunch_report_time time not null default '14:00',
  dinner_report_time time not null default '19:00',
  close_report_time time not null,
  baseline_demand integer not null default 0 check (baseline_demand >= 0),
  lunch_peak_demand integer not null default 0 check (lunch_peak_demand >= 0),
  dinner_peak_demand integer not null default 0 check (dinner_peak_demand >= 0),
  effective_from date not null default current_date,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint store_operating_weekday_hours_check check (weekday_close_time > weekday_open_time),
  constraint store_operating_holiday_hours_check check (holiday_close_time > holiday_open_time),
  constraint store_operating_lunch_peak_check check (lunch_peak_end > lunch_peak_start),
  constraint store_operating_dinner_peak_check check (dinner_peak_end > dinner_peak_start)
);

create table if not exists public.store_operating_setting_audits (
  id uuid primary key default gen_random_uuid(),
  store_code text not null references public.stores(store_code),
  change_reason text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index if not exists store_operating_setting_audits_store_time_idx
on public.store_operating_setting_audits (store_code, changed_at desc);

alter table public.store_operating_settings enable row level security;
alter table public.store_operating_setting_audits enable row level security;

drop policy if exists "authenticated read store operating settings" on public.store_operating_settings;
create policy "authenticated read store operating settings"
on public.store_operating_settings for select to authenticated using (true);

drop policy if exists "headquarters read store setting audits" on public.store_operating_setting_audits;
create policy "headquarters read store setting audits"
on public.store_operating_setting_audits for select to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','general_affairs'));

grant select on public.store_operating_settings to authenticated;
grant select on public.store_operating_setting_audits to authenticated;

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

insert into public.store_operating_settings (
  store_code, weekday_open_time, weekday_close_time, holiday_open_time, holiday_close_time,
  lunch_peak_start, lunch_peak_end, dinner_peak_start, dinner_peak_end,
  lunch_report_time, dinner_report_time, close_report_time,
  baseline_demand, lunch_peak_demand, dinner_peak_demand
)
select s.store_code, seed.open_time::time, seed.close_time::time, seed.open_time::time, seed.close_time::time,
  seed.lunch_start::time, seed.lunch_end::time, seed.dinner_start::time, seed.dinner_end::time,
  seed.lunch_report::time, seed.dinner_report::time, seed.close_time::time,
  coalesce(demand.required_count,0), coalesce(demand.required_count,0), coalesce(demand.required_count,0)
from public.stores s
join (values
  ('S01','10:00','23:00','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S02','09:30','22:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S03','10:30','22:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S04','10:00','22:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S05','10:00','22:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S06','09:00','21:00','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S07','09:30','22:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S08','09:30','22:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S09','10:00','23:00','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S10','09:00','21:30','11:30','13:30','17:00','19:00','14:00','19:00'),
  ('S11','09:00','21:30','11:30','13:30','17:00','19:00','13:00','18:00')
) seed(store_code,open_time,close_time,lunch_start,lunch_end,dinner_start,dinner_end,lunch_report,dinner_report)
on seed.store_code=s.store_code
left join lateral (
  select required_count from public.store_staffing_demand_rules r
  where r.store_code=s.store_code and r.rule_type='baseline' and r.is_active
  order by r.created_at desc limit 1
) demand on true
on conflict (store_code) do nothing;
