insert into public.staff_role_salary_settings (
  role_name,
  salary_type,
  employment_type,
  insurance_note,
  sort_order,
  is_active
)
values (
  '委任店經理',
  'negotiable',
  '委任經理人',
  '須自保',
  1,
  true
)
on conflict (role_name) do nothing;

update public.staff_role_salary_settings
set sort_order = case role_name
  when '委任店經理' then 1
  when '店長' then 2
  when '代理店長' then 3
  when '副店長' then 4
  when '代理副店' then 5
  when '資深人員' then 6
  when '正式人員' then 7
  when '新進人員' then 8
  when '兼職人員' then 9
  when '總部人員' then 10
  else sort_order
end
where role_name in (
  '委任店經理',
  '店長',
  '代理店長',
  '副店長',
  '代理副店',
  '資深人員',
  '正式人員',
  '新進人員',
  '兼職人員',
  '總部人員'
);
