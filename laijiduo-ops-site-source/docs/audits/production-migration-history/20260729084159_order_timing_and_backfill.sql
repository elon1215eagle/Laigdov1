alter table public.franchise_orders
  add column if not exists is_backfill boolean not null default false,
  add column if not exists actual_ordered_at timestamptz,
  add column if not exists backfill_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'franchise_orders_backfill_details_check'
      and conrelid = 'public.franchise_orders'::regclass
  ) then
    alter table public.franchise_orders
      add constraint franchise_orders_backfill_details_check
      check (
        not is_backfill
        or (
          actual_ordered_at is not null
          and nullif(btrim(backfill_reason), '') is not null
        )
      );
  end if;
end $$;

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
  if not is_headquarters and new.arrival_date < taipei_today + 2 then
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

drop trigger if exists enforce_franchise_order_timing_trigger on public.franchise_orders;
create trigger enforce_franchise_order_timing_trigger
before insert or update on public.franchise_orders
for each row execute function public.enforce_franchise_order_timing();

revoke all on function public.enforce_franchise_order_timing() from public;
revoke all on function public.enforce_franchise_order_timing() from anon;
revoke all on function public.enforce_franchise_order_timing() from authenticated;
