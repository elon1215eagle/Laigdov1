-- Monday meat deliveries must be finalized on the preceding Friday at 13:00.
-- Other meat deliveries keep the existing two-calendar-day cutoff at 13:00.
-- A manual headquarters lock or unlock remains authoritative.

create or replace function public.is_franchise_order_category_locked(
  p_arrival_date date,
  p_category text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  manual_state boolean;
  days_before integer;
  cutoff_hour integer;
  cutoff_at timestamptz;
begin
  select locks.is_locked
    into manual_state
  from public.franchise_order_category_locks locks
  where locks.arrival_date = p_arrival_date
    and locks.category = p_category;

  if found then
    return manual_state;
  end if;

  if p_category = '肉品' then
    days_before := case
      when extract(isodow from p_arrival_date) = 1 then 3
      else 2
    end;
    cutoff_hour := 13;
  elsif p_category in ('點心', '南北貨', '五金') then
    days_before := 3;
    cutoff_hour := 18;
  else
    return true;
  end if;

  cutoff_at := (
    ((p_arrival_date - days_before)::text || format(' %s:00:00', cutoff_hour))::timestamp
    at time zone 'Asia/Taipei'
  );
  return now() >= cutoff_at;
end;
$$;

revoke all on function public.is_franchise_order_category_locked(date, text) from public;
revoke all on function public.is_franchise_order_category_locked(date, text) from anon;
grant execute on function public.is_franchise_order_category_locked(date, text) to authenticated;

comment on function public.is_franchise_order_category_locked(date, text) is
  'Returns category lock state. Monday meat deliveries cut off Friday 13:00 Asia/Taipei; other meat deliveries cut off two calendar days before at 13:00.';
