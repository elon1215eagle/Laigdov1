-- New orders are packed before payment. Existing paid orders remain valid for
-- backward compatibility and can finish their original workflow.

alter table public.quick_checkout_orders
  drop constraint if exists quick_checkout_orders_status_check;

alter table public.quick_checkout_orders
  add constraint quick_checkout_orders_status_check
  check (status in ('draft', 'packing', 'packed', 'paid', 'completed', 'cancelled', 'voided'));
