update public.stores
set store_code = concat('TMP-', store_code)
where store_code in ('S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11');

update public.stores
set
  store_code = 'S05',
  name = '鳳山南華店',
  manager_name = '人力不足暫停',
  target_daily_revenue = 0,
  target_monthly_revenue = 0,
  is_active = false
where name = '鳳山南華店';

update public.stores
set
  store_code = 'S06',
  name = '前鎮隆興店',
  manager_name = '威廷副店長',
  target_daily_revenue = 72000,
  target_monthly_revenue = 2160000,
  is_active = true
where name = '前鎮隆興店';

update public.stores
set
  store_code = 'S07',
  name = '三民大昌店',
  manager_name = '仕鈞副店長',
  target_daily_revenue = 76000,
  target_monthly_revenue = 2280000,
  is_active = true
where name = '三民大昌店';

update public.stores
set
  store_code = 'S08',
  name = '三民義華店',
  manager_name = '晉銘店長',
  target_daily_revenue = 53000,
  target_monthly_revenue = 1590000,
  is_active = true
where name = '三民義華店';

update public.stores
set
  store_code = 'S09',
  name = '三民鼎山店',
  manager_name = '超哥店長',
  target_daily_revenue = 66000,
  target_monthly_revenue = 1980000,
  is_active = true
where name = '三民鼎山店';

update public.stores
set
  store_code = 'S10',
  name = '屏東潮州店',
  manager_name = '以得店長',
  target_daily_revenue = 74000,
  target_monthly_revenue = 2220000,
  is_active = true
where name in ('屏東潮洲店', '屏東潮州店')
  and store_code = 'TMP-S10';

update public.stores
set
  store_code = 'S11',
  name = '屏東潮二店',
  manager_name = '耀呈副店長',
  target_daily_revenue = 47000,
  target_monthly_revenue = 1410000,
  is_active = true
where store_code = 'TMP-S11';

update public.profiles p
set store_id = s.id,
    updated_at = now()
from public.stores s
where p.role = 'store_manager'
  and p.full_name like s.store_code || ' %';
