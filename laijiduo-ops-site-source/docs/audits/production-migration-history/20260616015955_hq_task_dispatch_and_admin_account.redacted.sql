create table if not exists public.hq_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  task_type text not null default '[REDACTED]',
  scope_type text not null default '[REDACTED]',
  store_id uuid references public.stores(id) on delete set null,
  assignee_name text not null,
  assignee_role text not null default '[REDACTED]',
  priority text not null default '[REDACTED]',
  status text not null default '[REDACTED]',
  due_date date,
  evidence text default '[REDACTED]',
  action text default '[REDACTED]',
  note text default '[REDACTED]',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hq_tasks_priority_check check (priority in ('[REDACTED]', '[REDACTED]', '[REDACTED]')),
  constraint hq_tasks_status_check check (status in ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]')),
  constraint hq_tasks_scope_type_check check (scope_type in ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]'))
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
using (public.current_profile_role() in ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]'));

drop policy if exists "hq staff manage hq tasks" on public.hq_tasks;
create policy "hq staff manage hq tasks"
on public.hq_tasks for all
to authenticated
using (public.current_profile_role() in ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]'))
with check (public.current_profile_role() in ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]'));

insert into public.hq_tasks (title, task_type, scope_type, assignee_name, assignee_role, priority, status, due_date, evidence, action, note)
select * from (values
  ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', current_date + 3, '[REDACTED]', '[REDACTED]', '[REDACTED]'),
  ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', current_date + 5, '[REDACTED]', '[REDACTED]', '[REDACTED]'),
  ('[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', current_date + 7, '[REDACTED]', '[REDACTED]', '[REDACTED]')
) as seed(title, task_type, scope_type, assignee_name, assignee_role, priority, status, due_date, evidence, action, note)
where not exists (select 1 from public.hq_tasks);

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
    '[REDACTED]'::uuid,
    '[REDACTED]',
    '[REDACTED]',
    lower('[REDACTED]'),
    crypt('[REDACTED]', gen_salt('[REDACTED]', 10)),
    now(),
    '[REDACTED]'::jsonb,
    '[REDACTED]'::jsonb,
    false,
    now(),
    now(),
    null,
    '[REDACTED]',
    '[REDACTED]',
    '[REDACTED]',
    0,
    '[REDACTED]',
    false,
    false
  where not exists (select 1 from auth.users where lower(email) = lower('[REDACTED]'))
  returning id, email
), existing_user as (
  select id, email from new_user
  union all
  select id, email
  from auth.users
  where lower(email) = lower('[REDACTED]')
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
    jsonb_build_object('[REDACTED]', id::text, '[REDACTED]', email, '[REDACTED]', true, '[REDACTED]', false),
    '[REDACTED]',
    null,
    now(),
    now()
  from existing_user
  on conflict (provider, provider_id) do update
  set identity_data = excluded.identity_data,
      updated_at = now()
)
insert into public.profiles (id, full_name, role, store_id, is_active, created_at, updated_at)
select id, '[REDACTED]', '[REDACTED]'::public.app_role, null, true, now(), now()
from existing_user
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    store_id = excluded.store_id,
    is_active = true,
    updated_at = now();

update auth.users
set confirmation_token = '[REDACTED]',
    recovery_token = '[REDACTED]',
    email_change_token_new = '[REDACTED]',
    email_change = '[REDACTED]',
    raw_user_meta_data = '[REDACTED]'::jsonb,
    updated_at = now()
where lower(email) = lower('[REDACTED]');
