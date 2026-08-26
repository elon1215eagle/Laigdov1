-- Persist the device workspace and mirror every order into reporting tables.
-- Existing finalized orders remain immutable and are never rewritten.

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
  order_json jsonb;
  line_json jsonb;
  event_json jsonb;
  saved_order_id uuid;
  saved_product_id uuid;
  existing_final boolean;
  subtotal_value integer;
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

  for order_json in
    select value from jsonb_array_elements(coalesce(normalized_workspace->'orders', '[]'::jsonb))
  loop
    if nullif(order_json->>'id', '') is null then
      continue;
    end if;

    select exists (
      select 1 from public.quick_checkout_orders
      where device_id = resolved_device_id
        and client_order_id = order_json->>'id'
        and status in ('completed', 'cancelled', 'voided')
    ) into existing_final;

    if existing_final then
      continue;
    end if;

    select coalesce(sum(
      greatest(0, coalesce((line->>'unitPrice')::integer, 0))
      * greatest(0, coalesce((line->>'quantity')::integer, 0))
    ), 0)::integer
    into subtotal_value
    from jsonb_array_elements(coalesce(order_json->'lines', '[]'::jsonb)) line;

    insert into public.quick_checkout_orders (
      client_order_id, order_number, store_id, device_id,
      operator_code, operator_name, status, subtotal, discount,
      received, change_due, review_confirmed, paid_at, completed_at,
      cancelled_at, voided_at, created_at, updated_at
    ) values (
      order_json->>'id',
      device_store.store_code || '-' || (order_json->>'id'),
      device_store.id,
      resolved_device_id,
      coalesce(order_json#>>'{operator,id}', ''),
      coalesce(order_json#>>'{operator,name}', ''),
      coalesce(order_json->>'status', 'draft'),
      subtotal_value,
      greatest(0, coalesce((order_json#>>'{discount,amount}')::integer, 0)),
      nullif(order_json#>>'{payment,received}', '')::integer,
      nullif(order_json#>>'{payment,change}', '')::integer,
      coalesce((order_json->>'reviewConfirmed')::boolean, false),
      nullif(order_json#>>'{payment,paidAt}', '')::timestamptz,
      nullif(order_json->>'completedAt', '')::timestamptz,
      case when order_json->>'status' = 'cancelled' then coalesce(nullif(order_json->>'updatedAt', '')::timestamptz, now()) end,
      case when order_json->>'status' = 'voided' then coalesce(nullif(order_json->>'updatedAt', '')::timestamptz, now()) end,
      coalesce(nullif(order_json->>'createdAt', '')::timestamptz, now()),
      coalesce(nullif(order_json->>'updatedAt', '')::timestamptz, now())
    )
    on conflict (device_id, client_order_id) do update set
      operator_code = excluded.operator_code,
      operator_name = excluded.operator_name,
      status = excluded.status,
      subtotal = excluded.subtotal,
      discount = excluded.discount,
      received = excluded.received,
      change_due = excluded.change_due,
      review_confirmed = excluded.review_confirmed,
      paid_at = excluded.paid_at,
      completed_at = excluded.completed_at,
      cancelled_at = excluded.cancelled_at,
      voided_at = excluded.voided_at,
      updated_at = excluded.updated_at
    returning id into saved_order_id;

    delete from public.quick_checkout_order_lines where order_id = saved_order_id;
    delete from public.quick_checkout_order_events where order_id = saved_order_id;

    for line_json in
      select value from jsonb_array_elements(coalesce(order_json->'lines', '[]'::jsonb))
    loop
      select id into saved_product_id
      from public.quick_checkout_products
      where code = line_json->>'productCode';

      if saved_product_id is not null and coalesce((line_json->>'quantity')::integer, 0) > 0 then
        insert into public.quick_checkout_order_lines (
          order_id, product_id, product_code, product_name, unit_price,
          fixed_weight_grams, quantity, seasonings, packed
        ) values (
          saved_order_id,
          saved_product_id,
          line_json->>'productCode',
          line_json->>'productName',
          greatest(0, coalesce((line_json->>'unitPrice')::integer, 0)),
          nullif(line_json->>'fixedWeightGrams', '')::integer,
          (line_json->>'quantity')::integer,
          array(select jsonb_array_elements_text(coalesce(line_json->'seasonings', '[]'::jsonb))),
          coalesce((line_json->>'packed')::boolean, false)
        );
      end if;
    end loop;

    for event_json in
      select value from jsonb_array_elements(coalesce(order_json->'events', '[]'::jsonb))
    loop
      insert into public.quick_checkout_order_events (
        order_id, store_id, event_type, actor_type, actor_code, reason, details, created_at
      ) values (
        saved_order_id,
        device_store.id,
        coalesce(event_json->>'type', 'unknown'),
        'device',
        coalesce(order_json#>>'{operator,id}', ''),
        nullif(event_json#>>'{details,reason}', ''),
        coalesce(event_json->'details', '{}'::jsonb),
        coalesce(nullif(event_json->>'at', '')::timestamptz, now())
      );
    end loop;
  end loop;

  update public.quick_checkout_devices
  set last_seen_at = now()
  where id = resolved_device_id;

  return true;
end;
$$;

revoke all on function public.quick_checkout_save_workspace(text, jsonb) from public;
grant execute on function public.quick_checkout_save_workspace(text, jsonb) to anon, authenticated;
