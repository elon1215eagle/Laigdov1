-- Additive quick-checkout schema. This migration does not modify existing reports,
-- scheduling, inventory, or HR records.

create table if not exists public.quick_checkout_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  price integer not null check (price >= 0),
  fixed_weight_grams integer check (fixed_weight_grams is null or fixed_weight_grams > 0),
  sort_order integer not null,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quick_checkout_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  label text not null,
  token_hash text not null unique,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint quick_checkout_devices_active_not_revoked check (not is_active or revoked_at is null)
);

create table if not exists public.quick_checkout_orders (
  id uuid primary key default gen_random_uuid(),
  client_order_id text not null,
  order_number text not null,
  store_id uuid not null references public.stores(id),
  device_id uuid not null references public.quick_checkout_devices(id),
  operator_code text not null,
  operator_name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'paid', 'completed', 'cancelled', 'voided')),
  subtotal integer not null default 0 check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0 and discount <= subtotal),
  total integer generated always as (subtotal - discount) stored,
  received integer check (received is null or received >= 0),
  change_due integer check (change_due is null or change_due >= 0),
  review_confirmed boolean not null default false,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, client_order_id),
  unique (store_id, order_number)
);

create table if not exists public.quick_checkout_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.quick_checkout_orders(id) on delete restrict,
  product_id uuid not null references public.quick_checkout_products(id),
  product_code text not null,
  product_name text not null,
  unit_price integer not null check (unit_price >= 0),
  fixed_weight_grams integer check (fixed_weight_grams is null or fixed_weight_grams > 0),
  quantity integer not null check (quantity > 0),
  seasonings text[] not null default '{}',
  packed boolean not null default false,
  line_total integer generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.quick_checkout_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.quick_checkout_orders(id) on delete restrict,
  store_id uuid not null references public.stores(id),
  event_type text not null,
  actor_type text not null check (actor_type in ('device', 'supervisor', 'manager', 'system')),
  actor_code text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists quick_checkout_products_active_sort_idx
  on public.quick_checkout_products (is_active, category, sort_order);
create index if not exists quick_checkout_devices_store_active_idx
  on public.quick_checkout_devices (store_id, is_active);
create index if not exists quick_checkout_orders_store_created_idx
  on public.quick_checkout_orders (store_id, created_at desc);
create index if not exists quick_checkout_orders_status_created_idx
  on public.quick_checkout_orders (status, created_at desc);
create index if not exists quick_checkout_order_lines_order_idx
  on public.quick_checkout_order_lines (order_id);
create index if not exists quick_checkout_order_events_order_created_idx
  on public.quick_checkout_order_events (order_id, created_at);

create or replace function public.quick_checkout_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists quick_checkout_products_touch_updated_at on public.quick_checkout_products;
create trigger quick_checkout_products_touch_updated_at
before update on public.quick_checkout_products
for each row execute function public.quick_checkout_touch_updated_at();

drop trigger if exists quick_checkout_orders_touch_updated_at on public.quick_checkout_orders;
create trigger quick_checkout_orders_touch_updated_at
before update on public.quick_checkout_orders
for each row execute function public.quick_checkout_touch_updated_at();

create or replace function public.quick_checkout_protect_final_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('completed', 'cancelled', 'voided') then
    raise exception 'final quick-checkout orders are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists quick_checkout_protect_final_order on public.quick_checkout_orders;
create trigger quick_checkout_protect_final_order
before update or delete on public.quick_checkout_orders
for each row execute function public.quick_checkout_protect_final_order();

insert into public.quick_checkout_products
  (code, name, category, price, fixed_weight_grams, sort_order, is_active)
values
  ('chicken_wing', '雞翅', '炸雞', 20, null, 10, true),
  ('chicken_leg', '雞腿', '炸雞', 35, null, 20, true),
  ('thigh_steak', '腿排', '炸雞', 40, null, 30, true),
  ('chicken_cutlet', '雞排', '炸雞', 65, null, 40, true),
  ('popcorn_chicken_small', '雞米花小份', '份量商品', 60, 150, 50, true),
  ('popcorn_chicken_large', '雞米花大份', '份量商品', 100, 260, 60, true),
  ('sweet_potato_small', '地瓜小份', '份量商品', 30, 170, 70, true),
  ('sweet_potato_large', '地瓜大份', '份量商品', 50, 270, 80, true),
  ('triangle_bone', '三角骨', '份量商品', 50, 250, 90, true),
  ('squid_ball', '花枝丸', '點心', 30, null, 100, true),
  ('rice_blood', '米血', '點心', 15, null, 110, true),
  ('hot_dog', '熱狗', '點心', 30, null, 120, true),
  ('chicken_neck', '雞脖子', '點心', 10, null, 130, true),
  ('chicken_skin', '雞皮', '點心', 20, null, 140, true),
  ('oden_slice', '黑輪片', '點心', 30, null, 150, true),
  ('chicken_nuggets', '麥克雞塊', '點心', 30, null, 160, true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  fixed_weight_grams = excluded.fixed_weight_grams,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.quick_checkout_products enable row level security;
alter table public.quick_checkout_devices enable row level security;
alter table public.quick_checkout_orders enable row level security;
alter table public.quick_checkout_order_lines enable row level security;
alter table public.quick_checkout_order_events enable row level security;

grant select on public.quick_checkout_products to authenticated;
grant select, insert, update on public.quick_checkout_devices to authenticated;
grant select on public.quick_checkout_orders to authenticated;
grant select on public.quick_checkout_order_lines to authenticated;
grant select on public.quick_checkout_order_events to authenticated;

drop policy if exists "quick checkout products readable by active managers" on public.quick_checkout_products;
create policy "quick checkout products readable by active managers"
on public.quick_checkout_products for select to authenticated
using ((select public.current_profile_role()) is not null);

drop policy if exists "quick checkout products managed by headquarters" on public.quick_checkout_products;
create policy "quick checkout products managed by headquarters"
on public.quick_checkout_products for all to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq'))
with check ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq'));

drop policy if exists "quick checkout devices managed by authorized roles" on public.quick_checkout_devices;
create policy "quick checkout devices managed by authorized roles"
on public.quick_checkout_devices for all to authenticated
using (
  (select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq')
  or (
    (select public.current_profile_role())::text = 'store_manager'
    and store_id = (select public.current_profile_store_id())
  )
)
with check (
  (select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq')
  or (
    (select public.current_profile_role())::text = 'store_manager'
    and store_id = (select public.current_profile_store_id())
  )
);

drop policy if exists "quick checkout orders readable by store scope" on public.quick_checkout_orders;
create policy "quick checkout orders readable by store scope"
on public.quick_checkout_orders for select to authenticated
using (
  (select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq')
  or store_id = (select public.current_profile_store_id())
);

drop policy if exists "quick checkout lines readable through order scope" on public.quick_checkout_order_lines;
create policy "quick checkout lines readable through order scope"
on public.quick_checkout_order_lines for select to authenticated
using (
  exists (
    select 1 from public.quick_checkout_orders orders
    where orders.id = order_id
  )
);

drop policy if exists "quick checkout events readable by store scope" on public.quick_checkout_order_events;
create policy "quick checkout events readable by store scope"
on public.quick_checkout_order_events for select to authenticated
using (
  (select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq')
  or store_id = (select public.current_profile_store_id())
);

revoke all on public.quick_checkout_products from anon;
revoke all on public.quick_checkout_devices from anon;
revoke all on public.quick_checkout_orders from anon;
revoke all on public.quick_checkout_order_lines from anon;
revoke all on public.quick_checkout_order_events from anon;
