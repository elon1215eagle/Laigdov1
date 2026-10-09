create or replace function public.audit_monthly_leave_plan_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  source_row public.monthly_leave_plans;
begin
  if tg_op = 'DELETE' then
    source_row := old;
  else
    source_row := new;
  end if;

  insert into public.monthly_leave_plan_audit (
    period_month,
    staff_id,
    store_code,
    action,
    reason,
    before_data,
    after_data,
    changed_by
  ) values (
    source_row.period_month,
    source_row.staff_id::text,
    source_row.store_code,
    lower(tg_op),
    coalesce(nullif(trim(source_row.note), ''), '排假異動'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.audit_monthly_leave_plan_change() from public, anon, authenticated;
