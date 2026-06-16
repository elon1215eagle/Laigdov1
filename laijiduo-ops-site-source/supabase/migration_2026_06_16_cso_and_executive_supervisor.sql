alter type public.app_role add value if not exists 'cso';

create or replace function public.current_profile_role()
returns app_role
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p.role::text = 'cso' then 'supervisor'::public.app_role
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
$$;

update public.profiles
set full_name = '督導長',
    role = 'cso'::public.app_role,
    updated_at = now()
where id = (select id from auth.users where lower(email) = lower('cso@laigdo.com'));

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
    lower('ES@laogdo.com'),
    crypt('laigdo1109', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"執行督導","email_verified":true}'::jsonb,
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
  where not exists (select 1 from auth.users where lower(email) = lower('ES@laogdo.com'))
  returning id, email
), existing_user as (
  select id, email from new_user
  union all
  select id, email
  from auth.users
  where lower(email) = lower('ES@laogdo.com')
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
select id, '執行督導', 'supervisor'::public.app_role, null, true, now(), now()
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
    raw_user_meta_data = '{"full_name":"執行督導","email_verified":true}'::jsonb,
    updated_at = now()
where lower(email) = lower('ES@laogdo.com');
