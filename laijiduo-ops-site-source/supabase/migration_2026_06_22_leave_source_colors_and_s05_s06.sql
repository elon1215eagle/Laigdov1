alter table public.monthly_leave_plans
  add column if not exists manual_leave_days integer[] not null default '{}',
  add column if not exists auto_leave_days integer[] not null default '{}';

update public.monthly_leave_plans
set manual_leave_days = leave_days,
    auto_leave_days = '{}'
where coalesce(array_length(manual_leave_days, 1), 0) = 0
  and coalesce(array_length(auto_leave_days, 1), 0) = 0;

update public.stores
set store_code = 'TMP-S05'
where store_code = 'S05';

update public.stores
set store_code = 'S05',
    name = '前鎮隆興店',
    manager_name = '威廷副店長',
    target_daily_revenue = 72000,
    target_monthly_revenue = 2160000,
    is_active = true
where store_code = 'S06'
  and name = '前鎮隆興店';

update public.stores
set store_code = 'S06',
    name = '鳳山南華店',
    manager_name = '人力不足暫停',
    target_daily_revenue = 0,
    target_monthly_revenue = 0,
    is_active = false
where store_code = 'TMP-S05'
  and name = '鳳山南華店';

update public.profiles p
set store_id = s.id,
    updated_at = now()
from public.stores s
where p.role = 'store_manager'
  and p.full_name like s.store_code || ' %';
