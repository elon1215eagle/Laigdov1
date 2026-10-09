do $$
declare
  store_number integer;
  store_code text;
  source_email text;
  alias_email text;
  alias_password text;
  source_profile public.profiles%rowtype;
  alias_user_id uuid;
begin
  for store_number in 1..11 loop
    store_code := '[REDACTED]' || lpad(store_number::text, 2, '[REDACTED]');
    source_email := lower(store_code) || '[REDACTED]';
    alias_email := lower(store_code) || '[REDACTED]';
    alias_password := lower(store_code) || '[REDACTED]';

    select p.*
      into source_profile
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(u.email) = source_email
       and p.role = '[REDACTED]'
       and p.is_active = true;

    if not found then
      raise exception '[REDACTED]', source_email;
    end if;

    if exists (select 1 from auth.users where lower(email) = alias_email) then
      raise exception '[REDACTED]', alias_email;
    end if;

    alias_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at, phone_change,
      phone_change_token, email_change_token_current,
      email_change_confirm_status, reauthentication_token,
      is_sso_user, is_anonymous
    )
    values (
      '[REDACTED]',
      alias_user_id, '[REDACTED]', '[REDACTED]', alias_email,
      extensions.crypt(alias_password, extensions.gen_salt('[REDACTED]', 10)),
      now(), '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]',
      '[REDACTED]'::jsonb,
      jsonb_build_object(
        '[REDACTED]', store_code || '[REDACTED]',
        '[REDACTED]', true,
        '[REDACTED]', store_code
      ),
      now(), now(), '[REDACTED]', '[REDACTED]', '[REDACTED]', 0, '[REDACTED]', false, false
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      alias_user_id::text,
      alias_user_id,
      jsonb_build_object(
        '[REDACTED]', alias_user_id::text,
        '[REDACTED]', alias_email,
        '[REDACTED]', true,
        '[REDACTED]', false
      ),
      '[REDACTED]', now(), now(), now()
    );

    insert into public.profiles (
      id, full_name, role, store_id, is_active
    )
    values (
      alias_user_id,
      store_code || '[REDACTED]',
      source_profile.role,
      source_profile.store_id,
      true
    );
  end loop;
end
$$;
