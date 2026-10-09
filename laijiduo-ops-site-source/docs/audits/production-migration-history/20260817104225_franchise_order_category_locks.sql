-- Independent category cutoffs for one franchise order.
-- Meat locks two calendar days before arrival at 13:00 Asia/Taipei.
-- Snacks, dry goods, and hardware lock three calendar days before arrival at 18:00.

create table if not exists public.franchise_order_category_locks (
  arrival_date date not null,
  category text not null check (category in ('肉品', '點心', '南北貨', '五金')),
  is_locked boolean not null,
  reason text not null check (nullif(btrim(reason), '') is not null),
  locked_by uuid references auth.users(id),
  locked_at timestamptz,
  unlocked_by uuid references auth.users(id),
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (arrival_date, category)
);

create table if not exists public.franchise_order_category_lock_events (
  id uuid primary key default gen_random_uuid(),
  arrival_date date not null,
  category text not null check (category in ('肉品', '點心', '南北貨', '五金')),
  action text not null check (action in ('locked', 'unlocked')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists franchise_order_category_lock_events_date_idx
  on public.franchise_order_category_lock_events(arrival_date, created_at desc);

alter table public.franchise_order_category_locks enable row level security;
alter table public.franchise_order_category_lock_events enable row level security;

drop policy if exists "category locks readable by signed-in users" on public.franchise_order_category_locks;
create policy "category locks readable by signed-in users"
on public.franchise_order_category_locks for select
to authenticated
using (true);

drop policy if exists "category locks managed by headquarters" on public.franchise_order_category_locks;
create policy "category locks managed by headquarters"
on public.franchise_order_category_locks for all
to authenticated
using ((public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'))
with check ((public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'));

drop policy if exists "category lock events readable by headquarters" on public.franchise_order_category_lock_events;
create policy "category lock events readable by headquarters"
on public.franchise_order_category_lock_events for select
to authenticated
using ((public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'));

drop policy if exists "category lock events inserted by headquarters" on public.franchise_order_category_lock_events;
create policy "category lock events inserted by headquarters"
on public.franchise_order_category_lock_events for insert
to authenticated
with check ((public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'));

grant select, insert, update on table public.franchise_order_category_locks to authenticated;
grant select, insert on table public.franchise_order_category_lock_events to authenticated;

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
    days_before := 2;
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

create or replace function public.set_franchise_order_category_lock(
  p_arrival_date date,
  p_categories text[],
  p_is_locked boolean,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  role_text text := (public.current_franchise_role())::text;
  category_text text;
  actor_id uuid := auth.uid();
  action_text text := case when p_is_locked then 'locked' else 'unlocked' end;
begin
  if role_text not in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo') then
    raise exception 'Only headquarters roles can lock or unlock categories.';
  end if;
  if p_arrival_date is null or coalesce(array_length(p_categories, 1), 0) = 0 then
    raise exception 'Arrival date and categories are required.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A lock or unlock reason is required.';
  end if;

  foreach category_text in array p_categories loop
    if category_text not in ('肉品', '點心', '南北貨', '五金') then
      raise exception 'Unsupported order category: %', category_text;
    end if;

    insert into public.franchise_order_category_locks (
      arrival_date,
      category,
      is_locked,
      reason,
      locked_by,
      locked_at,
      unlocked_by,
      unlocked_at,
      updated_at
    ) values (
      p_arrival_date,
      category_text,
      p_is_locked,
      btrim(p_reason),
      case when p_is_locked then actor_id else null end,
      case when p_is_locked then now() else null end,
      case when p_is_locked then null else actor_id end,
      case when p_is_locked then null else now() end,
      now()
    )
    on conflict (arrival_date, category) do update set
      is_locked = excluded.is_locked,
      reason = excluded.reason,
      locked_by = excluded.locked_by,
      locked_at = excluded.locked_at,
      unlocked_by = excluded.unlocked_by,
      unlocked_at = excluded.unlocked_at,
      updated_at = now();

    insert into public.franchise_order_category_lock_events (
      arrival_date,
      category,
      action,
      reason,
      created_by
    ) values (
      p_arrival_date,
      category_text,
      action_text,
      btrim(p_reason),
      actor_id
    );
  end loop;
end;
$$;

create or replace function public.enforce_franchise_order_item_category_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  role_text text := (public.current_franchise_role())::text;
  target_order_id uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  target_product_id uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  target_arrival_date date;
  target_category text;
begin
  if role_text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select orders.arrival_date
    into target_arrival_date
  from public.franchise_orders orders
  where orders.id = target_order_id;

  select products.category
    into target_category
  from public.franchise_order_products products
  where products.id = target_product_id;

  if public.is_franchise_order_category_locked(target_arrival_date, target_category) then
    raise exception 'The % category is locked for arrival date %.', target_category, target_arrival_date;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists enforce_franchise_order_item_category_lock_trigger on public.franchise_order_items;
create trigger enforce_franchise_order_item_category_lock_trigger
before insert or update or delete on public.franchise_order_items
for each row execute function public.enforce_franchise_order_item_category_lock();

revoke all on function public.set_franchise_order_category_lock(date, text[], boolean, text) from public;
revoke all on function public.set_franchise_order_category_lock(date, text[], boolean, text) from anon;
grant execute on function public.set_franchise_order_category_lock(date, text[], boolean, text) to authenticated;

revoke all on function public.is_franchise_order_category_locked(date, text) from public;
revoke all on function public.is_franchise_order_category_locked(date, text) from anon;
grant execute on function public.is_franchise_order_category_locked(date, text) to authenticated;
