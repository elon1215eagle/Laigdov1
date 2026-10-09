create or replace function public.get_franchise_order_overview_summary(
  p_from date,
  p_to date,
  p_store_id uuid default null
)
returns table (
  order_count bigint,
  store_count bigint,
  item_count bigint,
  item_quantity numeric,
  item_amount numeric,
  adjustment_count bigint,
  adjustment_amount numeric,
  total_amount numeric,
  status_counts jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped_orders as (
    select orders.id, orders.franchise_store_id, orders.status
    from public.franchise_orders orders
    where orders.arrival_date between p_from and p_to
      and (p_store_id is null or orders.franchise_store_id = p_store_id)
  ),
  item_totals as (
    select
      count(*)::bigint as item_count,
      coalesce(sum(items.quantity), 0)::numeric as item_quantity,
      coalesce(sum(items.quantity * items.unit_price), 0)::numeric as item_amount
    from public.franchise_order_items items
    join scoped_orders orders on orders.id = items.order_id
  ),
  adjustment_totals as (
    select
      count(*)::bigint as adjustment_count,
      coalesce(sum(adjustments.amount), 0)::numeric as adjustment_amount
    from public.franchise_order_adjustments adjustments
    join scoped_orders orders on orders.id = adjustments.order_id
  ),
  status_totals as (
    select coalesce(jsonb_object_agg(grouped.status, grouped.total), '{}'::jsonb) as status_counts
    from (
      select orders.status, count(*)::bigint as total
      from scoped_orders orders
      group by orders.status
    ) grouped
  )
  select
    (select count(*)::bigint from scoped_orders),
    (select count(distinct franchise_store_id)::bigint from scoped_orders),
    item_totals.item_count,
    item_totals.item_quantity,
    item_totals.item_amount,
    adjustment_totals.adjustment_count,
    adjustment_totals.adjustment_amount,
    (item_totals.item_amount + adjustment_totals.adjustment_amount)::numeric,
    status_totals.status_counts
  from item_totals
  cross join adjustment_totals
  cross join status_totals;
$$;

revoke all on function public.get_franchise_order_overview_summary(date, date, uuid) from public;
revoke all on function public.get_franchise_order_overview_summary(date, date, uuid) from anon;
grant execute on function public.get_franchise_order_overview_summary(date, date, uuid) to authenticated;

comment on function public.get_franchise_order_overview_summary(date, date, uuid)
is 'Returns an RLS-scoped read-only franchise order overview for the selected arrival-date range and optional store.';
