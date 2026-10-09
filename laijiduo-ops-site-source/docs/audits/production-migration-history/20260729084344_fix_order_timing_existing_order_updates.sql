create or replace function public.enforce_franchise_order_timing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  role_text text := (public.current_franchise_role())::text;
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
  is_headquarters boolean := role_text in (
    'franchise_admin',
    'franchise_hq',
    'franchise_coo',
    'franchise_cfo'
  );
begin
  if not is_headquarters
    and new.arrival_date < taipei_today + 2
    and (
      tg_op = 'INSERT'
      or new.arrival_date is distinct from old.arrival_date
    )
  then
    raise exception 'Franchise stores must order at least two calendar days before arrival.';
  end if;

  if is_headquarters and new.arrival_date < taipei_today and tg_op = 'INSERT' then
    new.is_backfill := true;
    if new.actual_ordered_at is null or nullif(btrim(new.backfill_reason), '') is null then
      raise exception 'Historical backfill requires actual order time and reason.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_franchise_order_timing() from public;
revoke all on function public.enforce_franchise_order_timing() from anon;
revoke all on function public.enforce_franchise_order_timing() from authenticated;
