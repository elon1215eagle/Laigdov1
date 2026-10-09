alter table public.store_staff
  add column if not exists estimated_hourly_cost numeric(12,2),
  add column if not exists estimated_monthly_cost numeric(12,2);

alter table public.store_staff
  drop constraint if exists store_staff_estimated_hourly_cost_check,
  add constraint store_staff_estimated_hourly_cost_check check (estimated_hourly_cost is null or estimated_hourly_cost >= 0),
  drop constraint if exists store_staff_estimated_monthly_cost_check,
  add constraint store_staff_estimated_monthly_cost_check check (estimated_monthly_cost is null or estimated_monthly_cost >= 0);
