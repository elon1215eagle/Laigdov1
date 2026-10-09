create index if not exists franchise_order_adjustments_order_idx
on public.franchise_order_adjustments (order_id);

create or replace function public.save_franchise_order_details(
  p_order_id uuid,
  p_note text,
  p_items jsonb,
  p_adjustments jsonb
)
returns public.franchise_orders
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_order public.franchise_orders;
begin
  if public.current_franchise_role()::text not in (
    'franchise_admin',
    'franchise_hq',
    'franchise_coo',
    'franchise_cfo'
  ) then
    raise exception '只有總部、COO、CFO 可修改已送出的訂單。';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_adjustments, '[]'::jsonb)) <> 'array' then
    raise exception '訂單明細格式不正確。';
  end if;

  select orders.*
  into saved_order
  from public.franchise_orders orders
  where orders.id = p_order_id
  for update;

  if not found then
    raise exception '找不到此訂單。';
  end if;

  update public.franchise_orders
  set note = coalesce(p_note, ''),
      updated_at = now()
  where id = p_order_id;

  delete from public.franchise_order_items
  where order_id = p_order_id;

  insert into public.franchise_order_items (
    order_id, product_id, quantity, order_unit, unit_price, line_amount, note
  )
  select
    p_order_id, item.product_id, item.quantity, item.order_unit,
    item.unit_price, item.line_amount, coalesce(item.note, '')
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    product_id uuid, quantity numeric, order_unit text,
    unit_price numeric, line_amount numeric, note text
  );

  delete from public.franchise_order_adjustments
  where order_id = p_order_id;

  insert into public.franchise_order_adjustments (
    order_id, adjustment_type, label, amount, note
  )
  select
    p_order_id, adjustment.adjustment_type, adjustment.label,
    adjustment.amount, coalesce(adjustment.note, '')
  from jsonb_to_recordset(coalesce(p_adjustments, '[]'::jsonb)) as adjustment(
    adjustment_type text, label text, amount numeric, note text
  );

  select orders.*
  into saved_order
  from public.franchise_orders orders
  where orders.id = p_order_id;

  return saved_order;
end;
$$;

revoke all on function public.save_franchise_order_details(uuid, text, jsonb, jsonb) from public;
revoke all on function public.save_franchise_order_details(uuid, text, jsonb, jsonb) from anon;
grant execute on function public.save_franchise_order_details(uuid, text, jsonb, jsonb) to authenticated;

comment on function public.save_franchise_order_details(uuid, text, jsonb, jsonb)
is 'Atomically replaces headquarters-edited order items and adjustments; any failure rolls back the entire save.';
