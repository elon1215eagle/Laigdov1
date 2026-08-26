create table if not exists public.quick_checkout_device_workspaces (
  device_id uuid primary key references public.quick_checkout_devices(id) on delete cascade,
  workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint quick_checkout_workspace_is_object check (jsonb_typeof(workspace) = 'object')
);

alter table public.quick_checkout_device_workspaces enable row level security;
revoke all on public.quick_checkout_device_workspaces from anon, authenticated;

create or replace function public.quick_checkout_resolve_device(p_device_token text)
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select device.id
  from public.quick_checkout_devices device
  where device.token_hash = encode(digest(p_device_token, 'sha256'), 'hex')
    and device.is_active = true
    and device.revoked_at is null
    and length(p_device_token) >= 32
  limit 1
$$;

revoke all on function public.quick_checkout_resolve_device(text) from public, anon, authenticated;

create or replace function public.quick_checkout_create_device(
  p_store_code text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  actor_role text := coalesce((select public.current_profile_role())::text, '');
  actor_store_id uuid := (select public.current_profile_store_id());
  target_store public.stores%rowtype;
  raw_token text := encode(gen_random_bytes(32), 'hex');
  created_device public.quick_checkout_devices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target_store
  from public.stores
  where upper(store_code) = upper(trim(p_store_code))
    and is_active = true;

  if target_store.id is null then
    raise exception 'active store not found';
  end if;

  if actor_role not in ('ceo', 'coo', 'admin', 'hq')
     and not (actor_role = 'store_manager' and actor_store_id = target_store.id) then
    raise exception 'not authorized to bind this store device';
  end if;

  if nullif(trim(p_label), '') is null then
    raise exception 'device label is required';
  end if;

  insert into public.quick_checkout_devices
    (store_id, label, token_hash, created_by)
  values
    (target_store.id, trim(p_label), encode(digest(raw_token, 'sha256'), 'hex'), auth.uid())
  returning * into created_device;

  return jsonb_build_object(
    'deviceId', created_device.id,
    'deviceToken', raw_token,
    'storeCode', target_store.store_code,
    'storeName', target_store.name
  );
end;
$$;

revoke all on function public.quick_checkout_create_device(text, text) from public, anon;
grant execute on function public.quick_checkout_create_device(text, text) to authenticated;

create or replace function public.quick_checkout_load_workspace(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resolved_device_id uuid := public.quick_checkout_resolve_device(p_device_token);
  saved_workspace jsonb;
begin
  if resolved_device_id is null then
    raise exception 'invalid or revoked device';
  end if;

  update public.quick_checkout_devices
  set last_seen_at = now()
  where id = resolved_device_id;

  select workspace into saved_workspace
  from public.quick_checkout_device_workspaces
  where device_id = resolved_device_id;

  return jsonb_build_object('workspace', saved_workspace);
end;
$$;

create or replace function public.quick_checkout_save_workspace(
  p_device_token text,
  p_workspace jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resolved_device_id uuid := public.quick_checkout_resolve_device(p_device_token);
  device_store public.stores%rowtype;
  normalized_workspace jsonb;
begin
  if resolved_device_id is null then
    raise exception 'invalid or revoked device';
  end if;

  if p_workspace is null or jsonb_typeof(p_workspace) <> 'object' then
    raise exception 'workspace must be a JSON object';
  end if;

  if octet_length(p_workspace::text) > 1048576 then
    raise exception 'workspace exceeds size limit';
  end if;

  select store.* into device_store
  from public.quick_checkout_devices device
  join public.stores store on store.id = device.store_id
  where device.id = resolved_device_id;

  normalized_workspace := jsonb_set(p_workspace, '{storeCode}', to_jsonb(device_store.store_code), true);
  normalized_workspace := jsonb_set(normalized_workspace, '{storeName}', to_jsonb(device_store.name), true);

  insert into public.quick_checkout_device_workspaces (device_id, workspace, updated_at)
  values (resolved_device_id, normalized_workspace, now())
  on conflict (device_id) do update set
    workspace = excluded.workspace,
    updated_at = excluded.updated_at;

  update public.quick_checkout_devices
  set last_seen_at = now()
  where id = resolved_device_id;

  return true;
end;
$$;

create or replace function public.quick_checkout_clear_workspace(p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resolved_device_id uuid := public.quick_checkout_resolve_device(p_device_token);
begin
  if resolved_device_id is null then
    raise exception 'invalid or revoked device';
  end if;

  delete from public.quick_checkout_device_workspaces
  where device_id = resolved_device_id;

  return true;
end;
$$;

revoke all on function public.quick_checkout_load_workspace(text) from public;
revoke all on function public.quick_checkout_save_workspace(text, jsonb) from public;
revoke all on function public.quick_checkout_clear_workspace(text) from public;
grant execute on function public.quick_checkout_load_workspace(text) to anon, authenticated;
grant execute on function public.quick_checkout_save_workspace(text, jsonb) to anon, authenticated;
grant execute on function public.quick_checkout_clear_workspace(text) to anon, authenticated;
