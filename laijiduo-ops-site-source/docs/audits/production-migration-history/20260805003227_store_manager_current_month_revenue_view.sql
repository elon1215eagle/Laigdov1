drop policy if exists "read reports by role" on public.daily_reports;

create policy "read reports by role"
on public.daily_reports
for select
to authenticated
using (
  public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'cso', 'supervisor', 'admin')
  or exists (
    select 1
    from public.store_supervisors ss
    where ss.store_id = daily_reports.store_id
      and ss.supervisor_id = (select auth.uid())
  )
  or (
    public.current_profile_role()::text = 'store_manager'
    and store_id = public.current_profile_store_id()
    and report_date >= (date_trunc('month', public.current_taipei_business_date())::date - 14)
    and report_date <= public.current_taipei_business_date()
  )
);

comment on policy "read reports by role" on public.daily_reports is
  'Store managers may read only their own store current-month revenue plus up to 14 prior days for same-weekday comparison. Existing insert and update limits remain unchanged.';
