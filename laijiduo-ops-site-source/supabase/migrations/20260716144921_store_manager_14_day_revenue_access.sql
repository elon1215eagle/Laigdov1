create or replace function public.current_taipei_business_date()
returns date
language sql
stable
as $$
  select case
    when extract(hour from now() at time zone 'Asia/Taipei') < 6
      then ((now() at time zone 'Asia/Taipei')::date - 1)
    else (now() at time zone 'Asia/Taipei')::date
  end
$$;

create or replace view public.daily_report_totals
with (security_invoker = true) as
select
  dr.*,
  (
    dr.opened_to_1400_revenue
    + dr.revenue_1400_to_1900
    + dr.revenue_1900_to_close
  ) as total_revenue
from public.daily_reports dr;

grant select on public.daily_report_totals to authenticated;

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
    and report_date >= public.current_taipei_business_date() - 13
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
  and report_date >= public.current_taipei_business_date() - 13
  and report_date <= public.current_taipei_business_date()
);

drop policy if exists "store managers update own editable reports" on public.daily_reports;
create policy "store managers update own editable reports"
on public.daily_reports
for update
to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and report_date >= public.current_taipei_business_date() - 13
  and report_date <= public.current_taipei_business_date()
)
with check (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = (select auth.uid())
  and report_date >= public.current_taipei_business_date() - 13
  and report_date <= public.current_taipei_business_date()
);

drop policy if exists "read inventory through report access" on public.inventory_counts;
create policy "read inventory through report access"
on public.inventory_counts
for select
to authenticated
using (
  exists (
    select 1
    from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and (
        public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'cso', 'supervisor', 'admin')
        or exists (
          select 1
          from public.store_supervisors ss
          where ss.store_id = dr.store_id
            and ss.supervisor_id = (select auth.uid())
        )
        or (
          public.current_profile_role()::text = 'store_manager'
          and dr.store_id = public.current_profile_store_id()
          and dr.report_date >= public.current_taipei_business_date() - 13
          and dr.report_date <= public.current_taipei_business_date()
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
    from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and public.current_profile_role()::text = 'store_manager'
      and dr.store_id = public.current_profile_store_id()
      and dr.report_date >= public.current_taipei_business_date() - 13
      and dr.report_date <= public.current_taipei_business_date()
  )
)
with check (
  exists (
    select 1
    from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and public.current_profile_role()::text = 'store_manager'
      and dr.store_id = public.current_profile_store_id()
      and dr.report_date >= public.current_taipei_business_date() - 13
      and dr.report_date <= public.current_taipei_business_date()
  )
);
