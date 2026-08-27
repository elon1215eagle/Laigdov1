-- Headquarters-only quick-checkout management and auditable device controls.
-- This migration does not alter existing orders, workspaces, reports, or HR data.

create table if not exists public.quick_checkout_device_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.quick_checkout_devices(id) on delete restrict,
  store_id uuid not null references public.stores(id),
  event_type text not null check (event_type in ('disabled', 'enabled', 'revoked')),
  reason text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists quick_checkout_device_events_device_created_idx
  on public.quick_checkout_device_events (device_id, created_at desc);
create index if not exists quick_checkout_device_events_store_created_idx
  on public.quick_checkout_device_events (store_id, created_at desc);

alter table public.quick_checkout_device_events enable row level security;
grant select on public.quick_checkout_device_events to authenticated;
revoke all on public.quick_checkout_device_events from anon;

drop policy if exists "quick checkout products readable by active managers" on public.quick_checkout_products;
drop policy if exists "quick checkout products managed by headquarters" on public.quick_checkout_products;
create policy "quick checkout products readable by checkout headquarters"
on public.quick_checkout_products for select to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso'));

drop policy if exists "quick checkout devices managed by authorized roles" on public.quick_checkout_devices;
create policy "quick checkout devices readable by checkout headquarters"
on public.quick_checkout_devices for select to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso'));

drop policy if exists "quick checkout orders readable by store scope" on public.quick_checkout_orders;
create policy "quick checkout orders readable by checkout headquarters"
on public.quick_checkout_orders for select to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso'));

drop policy if exists "quick checkout lines readable through order scope" on public.quick_checkout_order_lines;
create policy "quick checkout lines readable by checkout headquarters"
on public.quick_checkout_order_lines for select to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso'));

drop policy if exists "quick checkout events readable by store scope" on public.quick_checkout_order_events;
create policy "quick checkout events readable by checkout headquarters"
on public.quick_checkout_order_events for select to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso'));

drop policy if exists "quick checkout device events readable by checkout headquarters" on public.quick_checkout_device_events;
create policy "quick checkout device events readable by checkout headquarters"
on public.quick_checkout_device_events for select to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso'));

create or replace function public.quick_checkout_manage_device(
  p_device_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := coalesce((select public.current_profile_role())::text, '');
  target_device public.quick_checkout_devices%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if actor_role not in ('ceo', 'coo', 'admin', 'hq', 'cso') then
    raise exception 'not authorized to manage checkout devices';
  end if;

  if normalized_action not in ('disable', 'enable', 'revoke') then
    raise exception 'invalid device action';
  end if;

  if char_length(normalized_reason) < 2 then
    raise exception 'a management reason is required';
  end if;

  select * into target_device
  from public.quick_checkout_devices
  where id = p_device_id
  for update;

  if target_device.id is null then
    raise exception 'checkout device not found';
  end if;

  if normalized_action = 'enable' then
    update public.quick_checkout_devices
    set is_active = true, revoked_at = null
    where id = target_device.id;
  elsif normalized_action = 'disable' then
    update public.quick_checkout_devices
    set is_active = false, revoked_at = null
    where id = target_device.id;
  else
    update public.quick_checkout_devices
    set is_active = false, revoked_at = now()
    where id = target_device.id;
  end if;

  insert into public.quick_checkout_device_events
    (device_id, store_id, event_type, reason, created_by)
  values (
    target_device.id,
    target_device.store_id,
    case normalized_action
      when 'disable' then 'disabled'
      when 'enable' then 'enabled'
      else 'revoked'
    end,
    normalized_reason,
    auth.uid()
  );

  return jsonb_build_object(
    'deviceId', target_device.id,
    'action', normalized_action,
    'success', true
  );
end;
$$;

revoke all on function public.quick_checkout_manage_device(uuid, text, text) from public, anon;
grant execute on function public.quick_checkout_manage_device(uuid, text, text) to authenticated;
