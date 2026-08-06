update public.stores
set operating_status = 'active',
    is_active = true,
    manager_name = case when manager_name in ('人力不足暫停', '') then '五甲店統籌' else manager_name end
where store_code = 'S06';

update public.store_relation_groups
set demand = 7,
    rule_note = '五甲與南華合併排假、合併看人力；南華已恢復營業並由五甲統籌。',
    updated_at = now()
where group_code = 'S01-S06';

insert into public.store_staffing_demand_rules (
  store_code, rule_type, start_time, end_time, required_count, is_active, note
)
values
  ('S01', 'baseline', '10:00', '23:00', 7, true, '五甲每日基準需求'),
  ('S06', 'baseline', '09:00', '21:00', 7, true, '南華每日基準需求')
on conflict (store_code, rule_type, coalesce(weekday, '-1'::integer), coalesce(special_date, '1900-01-01'::date), start_time, end_time)
do update set
  required_count = excluded.required_count,
  note = excluded.note,
  updated_at = now();
