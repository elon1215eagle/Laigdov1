-- Store managers may backfill the current and immediately preceding calendar
-- month. Store ownership and report lock rules remain enforced.

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
    and report_date >= date_trunc('month', public.current_taipei_business_date() - interval '1 month')::date
    and report_date <= public.current_taipei_business_date()
  )
);

drop policy if exists "store managers create own reports" on public.daily_reports;
create policy "store managers create own reports"
on public.daily_reports
for insert
to authenticated
with check (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = (select auth.uid())
  and report_date >= date_trunc('month', public.current_taipei_business_date() - interval '1 month')::date
  and report_date <= public.current_taipei_business_date()
  and status::text in ('draft', 'submitted', 'needs_revision')
);

drop policy if exists "read inventory through report access" on public.inventory_counts;
create policy "read inventory through report access"
on public.inventory_counts
for select
to authenticated
using (
  exists (
    select 1
    from public.daily_reports report
    where report.id = inventory_counts.report_id
      and (
        public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'cso', 'supervisor', 'admin')
        or exists (
          select 1
          from public.store_supervisors ss
          where ss.store_id = report.store_id
            and ss.supervisor_id = (select auth.uid())
        )
        or (
          public.current_profile_role()::text = 'store_manager'
          and report.store_id = public.current_profile_store_id()
          and report.report_date >= date_trunc('month', public.current_taipei_business_date() - interval '1 month')::date
          and report.report_date <= public.current_taipei_business_date()
        )
      )
  )
);

drop policy if exists "store managers manage inventory for own reports" on public.inventory_counts;
create policy "store managers manage inventory for own reports"
on public.inventory_counts
for all
to authenticated
using (
  exists (
    select 1
    from public.daily_reports report
    where report.id = inventory_counts.report_id
      and public.current_profile_role()::text = 'store_manager'
      and report.store_id = public.current_profile_store_id()
      and report.report_date >= date_trunc('month', public.current_taipei_business_date() - interval '1 month')::date
      and report.report_date <= public.current_taipei_business_date()
      and (
        report.status::text in ('draft', 'needs_revision', 'submitted')
        or exists (
          select 1
          from public.daily_report_change_requests request
          where request.report_id = report.id
            and request.status = 'approved'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.daily_reports report
    where report.id = inventory_counts.report_id
      and public.current_profile_role()::text = 'store_manager'
      and report.store_id = public.current_profile_store_id()
      and report.report_date >= date_trunc('month', public.current_taipei_business_date() - interval '1 month')::date
      and report.report_date <= public.current_taipei_business_date()
      and (
        report.status::text in ('draft', 'needs_revision', 'submitted')
        or exists (
          select 1
          from public.daily_report_change_requests request
          where request.report_id = report.id
            and request.status = 'approved'
        )
      )
  )
);
