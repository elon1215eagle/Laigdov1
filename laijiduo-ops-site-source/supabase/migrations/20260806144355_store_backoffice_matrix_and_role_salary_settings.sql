create table if not exists public.store_workforce_views (
  store_code text not null references public.stores(store_code) on delete cascade,
  view_type text not null check (view_type in ('backoffice')),
  is_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (store_code, view_type)
);

alter table public.store_workforce_views enable row level security;
drop policy if exists "authenticated read workforce views" on public.store_workforce_views;
create policy "authenticated read workforce views"
on public.store_workforce_views for select to authenticated using (true);
grant select on public.store_workforce_views to authenticated;

insert into public.store_workforce_views (store_code, view_type, is_enabled)
values ('S01', 'backoffice', true)
on conflict (store_code, view_type) do update set is_enabled = excluded.is_enabled;

create or replace function public.save_store_workforce_view(
  p_store_code text,
  p_view_type text,
  p_is_enabled boolean,
  p_reason text
) returns public.store_workforce_views
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := coalesce(public.current_profile_role()::text, '');
  saved public.store_workforce_views;
begin
  if actor_id is null then raise exception '請先登入'; end if;
  if actor_role not in ('ceo','coo','admin','hq','general_affairs') then raise exception '沒有門店營運設定權限'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception '修改原因至少需要三個字'; end if;
  if p_view_type <> 'backoffice' then raise exception '不支援的矩陣類型'; end if;
  if p_view_type = 'backoffice' and p_store_code <> 'S01' and p_is_enabled then raise exception '目前僅五甲店可啟用後勤矩陣'; end if;

  insert into public.store_workforce_views (store_code, view_type, is_enabled, updated_by, updated_at)
  values (p_store_code, p_view_type, p_is_enabled, actor_id, now())
  on conflict (store_code, view_type) do update set
    is_enabled = excluded.is_enabled,
    updated_by = actor_id,
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.save_store_workforce_view(text,text,boolean,text) from public, anon;
grant execute on function public.save_store_workforce_view(text,text,boolean,text) to authenticated;

create table if not exists public.staff_role_salary_settings (
  role_name text primary key,
  salary_type text not null default 'monthly' check (salary_type in ('monthly','hourly','negotiable')),
  base_salary numeric check (base_salary is null or base_salary >= 0),
  hourly_rate numeric check (hourly_rate is null or hourly_rate >= 0),
  performance_bonus numeric check (performance_bonus is null or performance_bonus >= 0),
  monthly_rest_days numeric check (monthly_rest_days is null or monthly_rest_days >= 0),
  work_hours numeric check (work_hours is null or work_hours >= 0),
  break_hours numeric check (break_hours is null or break_hours >= 0),
  employment_type text,
  insurance_note text,
  sort_order integer not null default 999,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint staff_role_salary_hours_check check (work_hours is null or break_hours is null or break_hours <= work_hours)
);

create table if not exists public.staff_role_salary_setting_audits (
  id uuid primary key default gen_random_uuid(),
  role_name text not null,
  change_reason text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table public.staff_role_salary_settings enable row level security;
alter table public.staff_role_salary_setting_audits enable row level security;
revoke all on public.staff_role_salary_settings from anon, authenticated;
revoke all on public.staff_role_salary_setting_audits from anon, authenticated;

insert into public.staff_role_salary_settings (
  role_name, salary_type, base_salary, hourly_rate, performance_bonus, monthly_rest_days,
  work_hours, break_hours, employment_type, insurance_note, sort_order
) values
  ('店長','monthly',60000,null,null,null,11,2,'委任經理人','須自保',1),
  ('代理店長','negotiable',null,null,null,null,11,2,'聘僱制','保勞健保',2),
  ('副店長','monthly',50000,null,5000,null,11,2,'聘僱制','保勞健保',3),
  ('代理副店','negotiable',null,null,null,null,11,2,'聘僱制','保勞健保',4),
  ('資深人員','monthly',46000,null,4000,7,11,2,'聘僱制','保勞健保',5),
  ('正式人員','monthly',42000,null,3000,6,11,2,'聘僱制','保勞健保',6),
  ('新進人員','monthly',38500,null,2500,6,11,2,'聘僱制','保勞健保',7),
  ('兼職人員','hourly',null,null,null,null,null,null,'兼職','依投保資格',8),
  ('總部人員','negotiable',null,null,null,null,null,null,'聘僱制','依公司規定',9)
on conflict (role_name) do nothing;

create or replace function public.get_staff_role_salary_settings_secure()
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select to_jsonb(s)
  from public.staff_role_salary_settings s
  where s.is_active
    and public.has_salary_access()
  order by s.sort_order, s.role_name;
$$;
revoke all on function public.get_staff_role_salary_settings_secure() from public, anon;
grant execute on function public.get_staff_role_salary_settings_secure() to authenticated;

create or replace function public.save_staff_role_salary_setting(p_payload jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := coalesce(public.current_profile_role()::text, '');
  role_key text := trim(coalesce(p_payload->>'role_name',''));
  before_row jsonb;
  saved_row public.staff_role_salary_settings;
begin
  if actor_id is null then raise exception '請先登入'; end if;
  if actor_role not in ('ceo','cfo','coo') or not public.has_salary_access() then raise exception '沒有薪資設定權限'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception '修改原因至少需要三個字'; end if;
  if role_key = '' then raise exception '請選擇職級'; end if;

  select coalesce(
    (select to_jsonb(s) from public.staff_role_salary_settings s where s.role_name = role_key),
    '{}'::jsonb
  ) into before_row;

  insert into public.staff_role_salary_settings as existing (
    role_name, salary_type, base_salary, hourly_rate, performance_bonus, monthly_rest_days,
    work_hours, break_hours, employment_type, insurance_note, sort_order, is_active, updated_by, updated_at
  ) values (
    role_key,
    coalesce(nullif(p_payload->>'salary_type',''),'monthly'),
    nullif(p_payload->>'base_salary','')::numeric,
    nullif(p_payload->>'hourly_rate','')::numeric,
    nullif(p_payload->>'performance_bonus','')::numeric,
    nullif(p_payload->>'monthly_rest_days','')::numeric,
    nullif(p_payload->>'work_hours','')::numeric,
    nullif(p_payload->>'break_hours','')::numeric,
    nullif(p_payload->>'employment_type',''),
    nullif(p_payload->>'insurance_note',''),
    coalesce(nullif(p_payload->>'sort_order','')::integer,999),
    coalesce((p_payload->>'is_active')::boolean,true),
    actor_id,
    now()
  ) on conflict (role_name) do update set
    salary_type=excluded.salary_type,
    base_salary=excluded.base_salary,
    hourly_rate=excluded.hourly_rate,
    performance_bonus=excluded.performance_bonus,
    monthly_rest_days=excluded.monthly_rest_days,
    work_hours=excluded.work_hours,
    break_hours=excluded.break_hours,
    employment_type=excluded.employment_type,
    insurance_note=excluded.insurance_note,
    sort_order=excluded.sort_order,
    is_active=excluded.is_active,
    updated_by=actor_id,
    updated_at=now()
  returning * into saved_row;

  insert into public.staff_role_salary_setting_audits (
    role_name, change_reason, before_data, after_data, changed_by
  ) values (role_key, trim(p_reason), before_row, to_jsonb(saved_row), actor_id);
  return to_jsonb(saved_row);
end;
$$;
revoke all on function public.save_staff_role_salary_setting(jsonb,text) from public, anon;
grant execute on function public.save_staff_role_salary_setting(jsonb,text) to authenticated;
