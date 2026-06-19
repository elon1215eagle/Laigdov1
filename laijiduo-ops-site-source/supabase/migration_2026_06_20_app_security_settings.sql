create table if not exists public.app_security_settings (
  id text primary key default 'main',
  is_fault_mode boolean not null default false,
  fault_title text not null default '資料故障',
  fault_message text not null default '請洽系統管理員',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_security_settings_singleton check (id = 'main')
);

alter table public.app_security_settings enable row level security;

grant select, insert, update on public.app_security_settings to authenticated;

insert into public.app_security_settings (id, is_fault_mode, fault_title, fault_message)
values ('main', false, '資料故障', '請洽系統管理員')
on conflict (id) do nothing;

drop policy if exists "authenticated users read app security settings" on public.app_security_settings;
create policy "authenticated users read app security settings"
on public.app_security_settings
for select
to authenticated
using (true);

drop policy if exists "ceo coo manage app security settings" on public.app_security_settings;
create policy "ceo coo manage app security settings"
on public.app_security_settings
for all
to authenticated
using (public.current_profile_role() = any (array['ceo'::public.app_role, 'coo'::public.app_role]))
with check (public.current_profile_role() = any (array['ceo'::public.app_role, 'coo'::public.app_role]));
