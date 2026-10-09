create or replace function public.save_daily_operations(
  p_report jsonb,
  p_inventory jsonb default '[]'::jsonb
)
returns public.daily_reports
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_report public.daily_reports;
begin
  if nullif(p_report->>'store_id', '') is null
    or nullif(p_report->>'report_date', '') is null then
    raise exception 'store_id and report_date are required';
  end if;

  insert into public.daily_reports (
    store_id,
    report_date,
    opened_to_1400_revenue,
    revenue_1400_to_1900,
    revenue_1900_to_close,
    cash_difference,
    status,
    manager_note,
    submitted_by,
    submitted_at
  )
  values (
    (p_report->>'store_id')::uuid,
    (p_report->>'report_date')::date,
    coalesce((p_report->>'opened_to_1400_revenue')::integer, 0),
    coalesce((p_report->>'revenue_1400_to_1900')::integer, 0),
    coalesce((p_report->>'revenue_1900_to_close')::integer, 0),
    nullif(p_report->>'cash_difference', '')::integer,
    coalesce(nullif(p_report->>'status', '')::public.report_status, 'draft'),
    coalesce(p_report->>'manager_note', ''),
    nullif(p_report->>'submitted_by', '')::uuid,
    nullif(p_report->>'submitted_at', '')::timestamptz
  )
  on conflict (store_id, report_date) do update set
    opened_to_1400_revenue = excluded.opened_to_1400_revenue,
    revenue_1400_to_1900 = excluded.revenue_1400_to_1900,
    revenue_1900_to_close = excluded.revenue_1900_to_close,
    cash_difference = excluded.cash_difference,
    status = excluded.status,
    manager_note = excluded.manager_note,
    submitted_by = excluded.submitted_by,
    submitted_at = excluded.submitted_at,
    updated_at = now()
  returning * into v_report;

  insert into public.inventory_counts (
    report_id,
    product_id,
    current_stock,
    safety_stock,
    loss_count,
    incoming_count,
    stock_unit,
    incoming_unit,
    current_stock_boxes,
    current_stock_packs,
    incoming_boxes,
    incoming_packs,
    incoming_source,
    transfer_note,
    is_shortage
  )
  select
    v_report.id,
    item.product_id,
    coalesce(item.current_stock, 0),
    coalesce(item.safety_stock, 0),
    coalesce(item.loss_count, 0),
    coalesce(item.incoming_count, 0),
    item.stock_unit,
    item.incoming_unit,
    coalesce(item.current_stock_boxes, 0),
    coalesce(item.current_stock_packs, 0),
    coalesce(item.incoming_boxes, 0),
    coalesce(item.incoming_packs, 0),
    coalesce(item.incoming_source, '廠商進貨'),
    coalesce(item.transfer_note, ''),
    coalesce(item.is_shortage, false)
  from jsonb_to_recordset(coalesce(p_inventory, '[]'::jsonb)) as item(
    product_id uuid,
    current_stock numeric,
    safety_stock numeric,
    loss_count numeric,
    incoming_count numeric,
    stock_unit text,
    incoming_unit text,
    current_stock_boxes numeric,
    current_stock_packs numeric,
    incoming_boxes numeric,
    incoming_packs numeric,
    incoming_source text,
    transfer_note text,
    is_shortage boolean
  )
  on conflict (report_id, product_id) do update set
    current_stock = excluded.current_stock,
    safety_stock = excluded.safety_stock,
    loss_count = excluded.loss_count,
    incoming_count = excluded.incoming_count,
    stock_unit = excluded.stock_unit,
    incoming_unit = excluded.incoming_unit,
    current_stock_boxes = excluded.current_stock_boxes,
    current_stock_packs = excluded.current_stock_packs,
    incoming_boxes = excluded.incoming_boxes,
    incoming_packs = excluded.incoming_packs,
    incoming_source = excluded.incoming_source,
    transfer_note = excluded.transfer_note,
    is_shortage = excluded.is_shortage;

  return v_report;
end;
$$;

revoke all on function public.save_daily_operations(jsonb, jsonb) from public;
grant execute on function public.save_daily_operations(jsonb, jsonb) to authenticated;
