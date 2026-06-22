alter table public.inventory_counts
  add column if not exists incoming_source text not null default '廠商進貨';

notify pgrst, 'reload schema';
