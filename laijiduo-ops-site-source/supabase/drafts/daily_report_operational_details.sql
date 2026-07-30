-- Draft only. Apply to the development branch after daily_report_lock_closed_loop.sql.

alter table public.daily_reports
  add column if not exists delivery_revenue numeric(12, 2) not null default 0,
  add column if not exists scheduled_staff_count integer not null default 0,
  add column if not exists actual_staff_count integer not null default 0,
  add column if not exists staffing_variance_reason text not null default '',
  add column if not exists customer_complaint_count integer not null default 0,
  add column if not exists customer_complaint_detail text not null default '',
  add column if not exists equipment_issue boolean not null default false,
  add column if not exists equipment_issue_detail text not null default '',
  add column if not exists special_event text not null default '';

create or replace view public.daily_report_totals
with (security_invoker = true) as
select
  report.id,
  report.store_id,
  report.report_date,
  report.opened_to_1400_revenue,
  report.revenue_1400_to_1900,
  report.revenue_1900_to_close,
  report.cash_difference,
  report.status,
  report.manager_note,
  report.submitted_by,
  report.submitted_at,
  report.reviewed_by,
  report.reviewed_at,
  report.created_at,
  report.updated_at,
  (
    report.opened_to_1400_revenue
    + report.revenue_1400_to_1900
    + report.revenue_1900_to_close
  ) as total_revenue,
  report.delivery_revenue,
  report.scheduled_staff_count,
  report.actual_staff_count,
  report.staffing_variance_reason,
  report.customer_complaint_count,
  report.customer_complaint_detail,
  report.equipment_issue,
  report.equipment_issue_detail,
  report.special_event
from public.daily_reports report;

create table if not exists public.daily_report_waste_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  product_id uuid references public.products(id),
  item_name text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists daily_report_waste_items_report_idx
on public.daily_report_waste_items (report_id);

alter table public.daily_report_waste_items enable row level security;
grant select, insert, update, delete on table public.daily_report_waste_items to authenticated;

drop policy if exists "daily report waste readable by report scope" on public.daily_report_waste_items;
create policy "daily report waste readable by report scope"
on public.daily_report_waste_items for select
to authenticated
using (
  exists (
    select 1
    from public.daily_reports report
    where report.id = daily_report_waste_items.report_id
      and (
        report.store_id = public.current_profile_store_id()
        or public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso')
      )
  )
);

drop policy if exists "store managers manage own editable waste" on public.daily_report_waste_items;
create policy "store managers manage own editable waste"
on public.daily_report_waste_items for all
to authenticated
using (
  exists (
    select 1
    from public.daily_reports report
    where report.id = daily_report_waste_items.report_id
      and report.store_id = public.current_profile_store_id()
      and report.status::text in ('draft', 'needs_revision', 'submitted')
  )
)
with check (
  exists (
    select 1
    from public.daily_reports report
    where report.id = daily_report_waste_items.report_id
      and report.store_id = public.current_profile_store_id()
      and report.status::text in ('draft', 'needs_revision', 'submitted')
  )
);

drop policy if exists "headquarters manage daily report waste" on public.daily_report_waste_items;
create policy "headquarters manage daily report waste"
on public.daily_report_waste_items for all
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'admin', 'hq'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'admin', 'hq'));

drop function if exists public.save_daily_operations(jsonb, jsonb);

create or replace function public.save_daily_operations(
  p_report jsonb,
  p_inventory jsonb default '[]'::jsonb,
  p_waste jsonb default null
)
returns public.daily_reports
language plpgsql
security invoker
set search_path = ''
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
    delivery_revenue,
    scheduled_staff_count,
    actual_staff_count,
    staffing_variance_reason,
    customer_complaint_count,
    customer_complaint_detail,
    equipment_issue,
    equipment_issue_detail,
    special_event,
    status,
    manager_note,
    submitted_by,
    submitted_at
  )
  values (
    (p_report->>'store_id')::uuid,
    (p_report->>'report_date')::date,
    coalesce((p_report->>'opened_to_1400_revenue')::numeric, 0),
    coalesce((p_report->>'revenue_1400_to_1900')::numeric, 0),
    coalesce((p_report->>'revenue_1900_to_close')::numeric, 0),
    nullif(p_report->>'cash_difference', '')::numeric,
    coalesce((p_report->>'delivery_revenue')::numeric, 0),
    coalesce((p_report->>'scheduled_staff_count')::integer, 0),
    coalesce((p_report->>'actual_staff_count')::integer, 0),
    coalesce(p_report->>'staffing_variance_reason', ''),
    coalesce((p_report->>'customer_complaint_count')::integer, 0),
    coalesce(p_report->>'customer_complaint_detail', ''),
    coalesce((p_report->>'equipment_issue')::boolean, false),
    coalesce(p_report->>'equipment_issue_detail', ''),
    coalesce(p_report->>'special_event', ''),
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
    delivery_revenue = excluded.delivery_revenue,
    scheduled_staff_count = excluded.scheduled_staff_count,
    actual_staff_count = excluded.actual_staff_count,
    staffing_variance_reason = excluded.staffing_variance_reason,
    customer_complaint_count = excluded.customer_complaint_count,
    customer_complaint_detail = excluded.customer_complaint_detail,
    equipment_issue = excluded.equipment_issue,
    equipment_issue_detail = excluded.equipment_issue_detail,
    special_event = excluded.special_event,
    status = excluded.status,
    manager_note = excluded.manager_note,
    submitted_by = excluded.submitted_by,
    submitted_at = excluded.submitted_at,
    updated_at = now()
  returning * into v_report;

  insert into public.inventory_counts (
    report_id, product_id, current_stock, safety_stock, loss_count,
    incoming_count, stock_unit, incoming_unit, current_stock_boxes,
    current_stock_packs, incoming_boxes, incoming_packs, incoming_source,
    transfer_note, is_shortage
  )
  select
    v_report.id, item.product_id, coalesce(item.current_stock, 0),
    coalesce(item.safety_stock, 0), coalesce(item.loss_count, 0),
    coalesce(item.incoming_count, 0), item.stock_unit, item.incoming_unit,
    coalesce(item.current_stock_boxes, 0), coalesce(item.current_stock_packs, 0),
    coalesce(item.incoming_boxes, 0), coalesce(item.incoming_packs, 0),
    coalesce(item.incoming_source, '廠商進貨'),
    coalesce(item.transfer_note, ''), coalesce(item.is_shortage, false)
  from jsonb_to_recordset(coalesce(p_inventory, '[]'::jsonb)) as item(
    product_id uuid, current_stock numeric, safety_stock numeric,
    loss_count numeric, incoming_count numeric, stock_unit text,
    incoming_unit text, current_stock_boxes numeric, current_stock_packs numeric,
    incoming_boxes numeric, incoming_packs numeric, incoming_source text,
    transfer_note text, is_shortage boolean
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

  if p_waste is not null then
    delete from public.daily_report_waste_items where report_id = v_report.id;
    insert into public.daily_report_waste_items (
      report_id, product_id, item_name, quantity, unit, reason
    )
    select
      v_report.id, item.product_id, trim(item.item_name),
      item.quantity, trim(coalesce(item.unit, '')), trim(coalesce(item.reason, ''))
    from jsonb_to_recordset(p_waste) as item(
      product_id uuid, item_name text, quantity numeric, unit text, reason text
    )
    where trim(coalesce(item.item_name, '')) <> '' and item.quantity > 0;
  end if;

  return v_report;
end;
$$;

revoke all on function public.save_daily_operations(jsonb, jsonb, jsonb) from public;
revoke all on function public.save_daily_operations(jsonb, jsonb, jsonb) from anon;
grant execute on function public.save_daily_operations(jsonb, jsonb, jsonb) to authenticated;
