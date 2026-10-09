drop policy if exists "franchise report write own" on public.franchise_daily_reports;
drop policy if exists "franchise report insert by role" on public.franchise_daily_reports;
drop policy if exists "franchise report update by role" on public.franchise_daily_reports;
drop policy if exists "franchise report delete by admin" on public.franchise_daily_reports;

create policy "franchise report insert by role"
on public.franchise_daily_reports for insert
to authenticated
with check (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

create policy "franchise report update by role"
on public.franchise_daily_reports for update
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
)
with check (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

create policy "franchise report delete by admin"
on public.franchise_daily_reports for delete
to authenticated
using (public.current_franchise_role() = 'franchise_admin');

drop policy if exists "franchise expenses write own" on public.franchise_expenses;
drop policy if exists "franchise expenses insert by role" on public.franchise_expenses;
drop policy if exists "franchise expenses update by role" on public.franchise_expenses;
drop policy if exists "franchise expenses delete by admin" on public.franchise_expenses;

create policy "franchise expenses insert by role"
on public.franchise_expenses for insert
to authenticated
with check (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

create policy "franchise expenses update by role"
on public.franchise_expenses for update
to authenticated
using (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
)
with check (
  public.current_franchise_role() = 'franchise_admin'
  or franchise_store_id = public.current_franchise_store_id()
);

create policy "franchise expenses delete by admin"
on public.franchise_expenses for delete
to authenticated
using (public.current_franchise_role() = 'franchise_admin');
