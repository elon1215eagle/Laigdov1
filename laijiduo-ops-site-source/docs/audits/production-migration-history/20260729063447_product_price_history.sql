create table if not exists public.franchise_order_product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.franchise_order_products(id) on delete cascade,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  kg_price numeric(12,2) check (kg_price is null or kg_price >= 0),
  price_basis text not null default '單價',
  effective_from timestamptz not null,
  note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (product_id, effective_from)
);

create index if not exists franchise_order_product_prices_lookup_idx
  on public.franchise_order_product_prices(product_id, effective_from desc);

alter table public.franchise_order_product_prices enable row level security;

drop policy if exists "franchise product prices read by authenticated" on public.franchise_order_product_prices;
create policy "franchise product prices read by authenticated"
on public.franchise_order_product_prices for select
to authenticated
using (true);

drop policy if exists "franchise product prices manage by headquarters" on public.franchise_order_product_prices;
create policy "franchise product prices manage by headquarters"
on public.franchise_order_product_prices for all
to authenticated
using ((public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'))
with check ((public.current_franchise_role())::text in ('franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'));

insert into public.franchise_order_product_prices (
  product_id,
  unit_price,
  kg_price,
  price_basis,
  effective_from,
  note
)
select
  product.id,
  product.unit_price,
  product.kg_price,
  product.price_basis,
  coalesce(product.created_at, now()),
  '既有商品價格初始化'
from public.franchise_order_products product
where not exists (
  select 1
  from public.franchise_order_product_prices price
  where price.product_id = product.id
);

create or replace function public.sync_current_franchise_product_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.effective_from <= now() then
    update public.franchise_order_products
    set
      unit_price = new.unit_price,
      kg_price = new.kg_price,
      price_basis = new.price_basis,
      updated_at = now()
    where id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_current_franchise_product_price_trigger
  on public.franchise_order_product_prices;
create trigger sync_current_franchise_product_price_trigger
after insert or update on public.franchise_order_product_prices
for each row execute function public.sync_current_franchise_product_price();
