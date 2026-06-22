drop policy if exists "store managers create own reports" on public.daily_reports;
create policy "store managers create own reports"
on public.daily_reports for insert
to authenticated
with check (
  public.current_profile_role() = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = auth.uid()
);

drop policy if exists "store managers update own editable reports" on public.daily_reports;
create policy "store managers update own editable reports"
on public.daily_reports for update
to authenticated
using (
  public.current_profile_role() = 'store_manager'
  and store_id = public.current_profile_store_id()
  and status in ('draft', 'needs_revision', 'submitted')
)
with check (
  public.current_profile_role() = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = auth.uid()
);

drop policy if exists "store managers manage inventory for own reports" on public.inventory_counts;
create policy "store managers manage inventory for own reports"
on public.inventory_counts for all
to authenticated
using (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and dr.store_id = public.current_profile_store_id()
      and dr.status in ('draft', 'needs_revision', 'submitted')
  )
)
with check (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and dr.store_id = public.current_profile_store_id()
      and dr.status in ('draft', 'needs_revision', 'submitted')
  )
);
