drop policy if exists "franchise orders update by role" on public.franchise_orders;

create policy "franchise orders update by role"
on public.franchise_orders
for update
to authenticated
using (
  (current_franchise_role())::text = any (array[
    'franchise_admin'::text,
    'franchise_hq'::text,
    'franchise_coo'::text,
    'franchise_cfo'::text
  ])
  or franchise_store_id = current_franchise_store_id()
)
with check (
  (current_franchise_role())::text = any (array[
    'franchise_admin'::text,
    'franchise_hq'::text,
    'franchise_coo'::text,
    'franchise_cfo'::text
  ])
  or franchise_store_id = current_franchise_store_id()
);
