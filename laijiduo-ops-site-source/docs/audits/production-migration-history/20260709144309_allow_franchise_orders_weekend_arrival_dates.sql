alter table public.franchise_orders
  drop constraint if exists franchise_orders_arrival_weekday_check;

alter table public.franchise_orders
  add constraint franchise_orders_arrival_weekday_check
  check (extract(isodow from arrival_date) between 1 and 7);
