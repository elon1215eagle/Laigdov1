-- Franchise ordering closed-loop hardening.
-- Keeps existing usable flows, but moves key safeguards into Supabase.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchise_orders_status_check'
      and conrelid = 'public.franchise_orders'::regclass
  ) then
    alter table public.franchise_orders
      add constraint franchise_orders_status_check
      check (status in ('submitted', 'confirmed', 'rejected', 'completed', 'delivery_issue', 'shipped'));
  end if;
end $$;

create table if not exists public.franchise_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.franchise_orders(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists franchise_order_events_order_created_idx
  on public.franchise_order_events(order_id, created_at desc);

alter table public.franchise_order_events enable row level security;

create or replace function public.enforce_franchise_order_store_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  role_text text := (public.current_franchise_role())::text;
begin
  if role_text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo') then
    return new;
  end if;

  if old.franchise_store_id is distinct from public.current_franchise_store_id() then
    raise exception 'Only the bound franchise store can update this order.';
  end if;

  if old.status in ('submitted', 'rejected') and new.status in ('submitted', 'rejected') then
    return new;
  end if;

  if old.status in ('confirmed', 'shipped') and new.status in ('completed', 'delivery_issue') then
    return new;
  end if;

  raise exception 'This order status is locked for franchise store users.';
end;
$$;

drop trigger if exists enforce_franchise_order_store_transition_trigger on public.franchise_orders;
create trigger enforce_franchise_order_store_transition_trigger
before update on public.franchise_orders
for each row
execute function public.enforce_franchise_order_store_transition();

drop policy if exists "franchise order events read by role" on public.franchise_order_events;
create policy "franchise order events read by role"
on public.franchise_order_events for select
to authenticated
using (
  exists (
    select 1
    from public.franchise_orders orders
    where orders.id = franchise_order_events.order_id
      and (
        (public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo')
        or orders.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise order events insert by role" on public.franchise_order_events;
create policy "franchise order events insert by role"
on public.franchise_order_events for insert
to authenticated
with check (
  exists (
    select 1
    from public.franchise_orders orders
    where orders.id = franchise_order_events.order_id
      and (
        (public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo')
        or orders.franchise_store_id = public.current_franchise_store_id()
      )
  )
);

drop policy if exists "franchise orders update by role" on public.franchise_orders;
create policy "franchise orders update by role"
on public.franchise_orders
for update
to authenticated
using (
  (public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo')
  or (
    franchise_store_id = public.current_franchise_store_id()
    and status in ('submitted', 'rejected', 'confirmed', 'shipped')
  )
)
with check (
  (public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo')
  or (
    franchise_store_id = public.current_franchise_store_id()
    and (
      status in ('submitted', 'rejected')
      or status in ('completed', 'delivery_issue')
    )
  )
);

drop policy if exists "franchise order items write by role" on public.franchise_order_items;
create policy "franchise order items write by role"
on public.franchise_order_items for all
to authenticated
using (
  exists (
    select 1
    from public.franchise_orders orders
    where orders.id = franchise_order_items.order_id
      and (
        (public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo')
        or (
          orders.franchise_store_id = public.current_franchise_store_id()
          and orders.status in ('submitted', 'rejected')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.franchise_orders orders
    where orders.id = franchise_order_items.order_id
      and (
        (public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo')
        or (
          orders.franchise_store_id = public.current_franchise_store_id()
          and orders.status in ('submitted', 'rejected')
        )
      )
  )
);

grant select, insert on table public.franchise_order_events to authenticated;
