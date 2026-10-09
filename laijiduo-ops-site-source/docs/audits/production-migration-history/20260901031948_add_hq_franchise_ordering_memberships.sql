insert into public.app_account_memberships (user_id, app_code, note)
select
  u.id,
  'franchise_ordering',
  '經營者確認 CEO、COO、CFO 同時使用加盟叫貨 APP'
from auth.users u
where lower(u.email) in (
  'ceo@laigdo.com',
  'coo@laigdo.com',
  'cfo@laigdo.com'
)
on conflict (user_id, app_code) do nothing;
