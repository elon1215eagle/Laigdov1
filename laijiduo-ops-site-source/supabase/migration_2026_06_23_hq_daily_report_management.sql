drop policy if exists "hq staff create daily reports" on public.daily_reports;
create policy "hq staff create daily reports"
on public.daily_reports for insert
to authenticated
with check (
  public.current_profile_role() in ('ceo', 'coo', 'hq', 'admin')
  and submitted_by = auth.uid()
);

drop policy if exists "hq staff update daily reports" on public.daily_reports;
create policy "hq staff update daily reports"
on public.daily_reports for update
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'hq', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'hq', 'admin'));

drop policy if exists "hq staff delete daily reports" on public.daily_reports;
create policy "hq staff delete daily reports"
on public.daily_reports for delete
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'hq', 'admin'));

drop policy if exists "hq staff manage inventory counts" on public.inventory_counts;
create policy "hq staff manage inventory counts"
on public.inventory_counts for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'hq', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'hq', 'admin'));
