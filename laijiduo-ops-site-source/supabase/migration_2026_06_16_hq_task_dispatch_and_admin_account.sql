create table if not exists public.hq_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  task_type text not null default '總部交辦',
  scope_type text not null default '門店',
  store_id uuid references public.stores(id) on delete set null,
  assignee_name text not null,
  assignee_role text not null default '未指定',
  priority text not null default '中',
  status text not null default '待處理',
  due_date date,
  evidence text default '',
  action text default '',
  note text default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hq_tasks_priority_check check (priority in ('高', '中', '低')),
  constraint hq_tasks_status_check check (status in ('待處理', '進行中', '待覆核', '已完成', '暫停')),
  constraint hq_tasks_scope_type_check check (scope_type in ('總部', '門店', '跨店', '人資', '財務', '稽核'))
);

alter table public.hq_tasks enable row level security;

grant select, insert, update, delete on public.hq_tasks to authenticated;
grant select, insert, update, delete on public.hq_tasks to service_role;

create index if not exists hq_tasks_status_idx on public.hq_tasks(status);
create index if not exists hq_tasks_due_date_idx on public.hq_tasks(due_date);
create index if not exists hq_tasks_store_id_idx on public.hq_tasks(store_id);

drop policy if exists "hq staff read hq tasks" on public.hq_tasks;
create policy "hq staff read hq tasks"
on public.hq_tasks for select
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'supervisor', 'admin'));

drop policy if exists "hq staff manage hq tasks" on public.hq_tasks;
create policy "hq staff manage hq tasks"
on public.hq_tasks for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'hq', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'hq', 'supervisor', 'admin'));

insert into public.hq_tasks (title, task_type, scope_type, assignee_name, assignee_role, priority, status, due_date, evidence, action, note)
select * from (values
  ('鳳山南華店復店人力評估', '人力補編', '門店', '督導長', 'CSO', '高', '進行中', current_date + 3, '人員名單與可排班時段', '確認店長或副店長、正式人員與兼職支援缺口', '南華店因人力不足暫停營業，需列總部追蹤'),
  ('各店排休表月度覆核', '排班稽核', '跨店', '執行督導', 'ES', '中', '待處理', current_date + 5, '月排休表與連續上班天數', '檢查是否超過連續工作六日與每日最低人力', ''),
  ('人資主檔資料補齊', '人資異動', '人資', '行政', '總務/行政', '中', '待處理', current_date + 7, '人員職級、到職日、薪資津貼設定', '補齊人資主檔與異動紀錄', '')
) as seed(title, task_type, scope_type, assignee_name, assignee_role, priority, status, due_date, evidence, action, note)
where not exists (select 1 from public.hq_tasks);

update public.hq_tasks
set store_id = (select id from public.stores where store_code = 'S06')
where title = '鳳山南華店復店人力評估'
  and store_id is null;

with new_user as (
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_change,
    phone_change_token,
    email_change_token_current,
    email_change_confirm_status,
    reauthentication_token,
    is_sso_user,
    is_anonymous
  )
  select
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    lower('ad@laigdo.com'),
    crypt('laigdo1109', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"行政","email_verified":true}'::jsonb,
    false,
    now(),
    now(),
    null,
    '',
    '',
    '',
    0,
    '',
    false,
    false
  where not exists (select 1 from auth.users where lower(email) = lower('ad@laigdo.com'))
  returning id, email
), existing_user as (
  select id, email from new_user
  union all
  select id, email
  from auth.users
  where lower(email) = lower('ad@laigdo.com')
    and not exists (select 1 from new_user)
), upsert_identity as (
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  select
    id::text,
    id,
    jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false),
    'email',
    null,
    now(),
    now()
  from existing_user
  on conflict (provider, provider_id) do update
  set identity_data = excluded.identity_data,
      updated_at = now()
)
insert into public.profiles (id, full_name, role, store_id, is_active, created_at, updated_at)
select id, '行政', 'general_affairs'::public.app_role, null, true, now(), now()
from existing_user
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    store_id = excluded.store_id,
    is_active = true,
    updated_at = now();

update auth.users
set confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    raw_user_meta_data = '{"full_name":"行政","email_verified":true}'::jsonb,
    updated_at = now()
where lower(email) = lower('ad@laigdo.com');
