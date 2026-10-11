-- Candidate backout only. Restores the observed 2026-10-11 function, including its known defect.
begin;
do $guard$
begin
  if coalesce((select md5(replace(prosrc, chr(13), '')) from pg_proc
      where oid = 'private.consume_schedule_change_approval()'::regprocedure), '')
      not in ('f6c9a497e33975e911b5ed70b049b309', '92f1ba305489d5f4f14cbeafd5c50f3a') then
    raise exception 'schedule approval source drift: review before rollback';
  end if;
end;
$guard$;
create or replace function private.consume_schedule_change_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  row_period text;
  row_store text;
  row_staff text;
  row_date date;
  row_shift uuid;
begin
  if tg_table_name = 'monthly_leave_plans' then
    row_period := coalesce(new.period_month, old.period_month);
    row_store := coalesce(new.store_code, old.store_code);
    row_staff := coalesce(new.staff_id, old.staff_id);
  else
    row_date := coalesce(new.shift_date, old.shift_date);
    row_period := to_char(row_date, 'YYYY-MM');
    row_store := coalesce(new.home_store_code, old.home_store_code);
    row_staff := coalesce(new.staff_id, old.staff_id);
    row_shift := coalesce(new.id, old.id);
  end if;

  if public.current_profile_role()::text in ('store_manager', 'assistant_manager') then
    update public.monthly_schedule_change_requests request_row
    set used_at = now(), status = 'closed', updated_at = now()
    where request_row.period_month = row_period
      and request_row.status = 'approved'
      and request_row.used_at is null
      and request_row.approved_until > now()
      and private.schedule_scope_matches(request_row, row_staff, row_date, row_shift);
  end if;
  return null;
end;
$$;
commit;
