create or replace function public.current_profile_role()
returns app_role
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p.role::text = '[REDACTED]' then '[REDACTED]'::public.app_role
    else p.role
  end
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
$$;

update public.profiles
set full_name = '[REDACTED]', role = '[REDACTED]'::public.app_role, updated_at = now()
where id = (select id from auth.users where lower(email) = lower('[REDACTED]'));

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
    crypt('[REDACTED]', gen_salt('[REDACTED]')),
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
  select id, email from auth.users where lower(email) = lower('[REDACTED]') and not exists (select 1 from new_user)
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
