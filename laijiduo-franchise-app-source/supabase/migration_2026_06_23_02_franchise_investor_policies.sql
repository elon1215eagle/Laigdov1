drop policy if exists "franchise stores visible by role" on public.franchise_stores;
create policy "franchise stores visible by role"
on public.franchise_stores for select
to authenticated
using (
  public.current_franchise_role() in ('franchise_admin', 'franchise_investor')
  or id = public.current_franchise_store_id()
);

drop policy if exists "franchise profiles read own" on public.franchise_profiles;
create policy "franchise profiles read own"
on public.franchise_profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_franchise_role() in ('franchise_admin', 'franchise_investor')
);

drop policy if exists "franchise report read by role" on public.franchise_daily_reports;
create policy "franchise report read by role"
on public.franchise_daily_reports for select
to authenticated
using (
  public.current_franchise_role() in ('franchise_admin', 'franchise_investor')
  or franchise_store_id = public.current_franchise_store_id()
);

drop policy if exists "franchise expenses read by role" on public.franchise_expenses;
create policy "franchise expenses read by role"
on public.franchise_expenses for select
to authenticated
using (
  public.current_franchise_role() in ('franchise_admin', 'franchise_investor')
  or franchise_store_id = public.current_franchise_store_id()
);
