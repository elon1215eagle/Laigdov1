drop policy if exists "users can read their profile" on public.profiles;
create policy "users can read their profile"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_profile_role() in ('ceo', 'coo', 'hq', 'supervisor', 'admin')
);

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
on public.profiles for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'admin'));

drop policy if exists "store visibility by role" on public.stores;
create policy "store visibility by role"
on public.stores for select
to authenticated
using (
  public.current_profile_role() in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'supervisor', 'admin')
  or id = public.current_profile_store_id()
);

drop policy if exists "admin manages stores" on public.stores;
create policy "admin manages stores"
on public.stores for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'admin'));

drop policy if exists "hq and admins update store targets" on public.stores;
create policy "hq and admins update store targets"
on public.stores for update
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'cfo', 'hq', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'cfo', 'hq', 'admin'));

drop policy if exists "read reports by role" on public.daily_reports;
create policy "read reports by role"
on public.daily_reports for select
to authenticated
using (
  public.current_profile_role() in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'supervisor', 'admin')
  or store_id = public.current_profile_store_id()
  or exists (
    select 1 from public.store_supervisors ss
    where ss.store_id = daily_reports.store_id
      and ss.supervisor_id = auth.uid()
  )
);

drop policy if exists "admins create reports" on public.daily_reports;
create policy "admins create reports"
on public.daily_reports for insert
to authenticated
with check (
  public.current_profile_role() in ('ceo', 'coo', 'admin')
  and submitted_by = auth.uid()
);

drop policy if exists "supervisors update assigned reports" on public.daily_reports;
create policy "supervisors update assigned reports"
on public.daily_reports for update
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'supervisor', 'admin'));

drop policy if exists "read inventory through report access" on public.inventory_counts;
create policy "read inventory through report access"
on public.inventory_counts for select
to authenticated
using (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = inventory_counts.report_id
      and (
        public.current_profile_role() in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'supervisor', 'admin')
        or dr.store_id = public.current_profile_store_id()
        or exists (
          select 1 from public.store_supervisors ss
          where ss.store_id = dr.store_id
            and ss.supervisor_id = auth.uid()
        )
      )
  )
);

drop policy if exists "admins manage inventory" on public.inventory_counts;
create policy "admins manage inventory"
on public.inventory_counts for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'admin'));

drop policy if exists "read review actions through report access" on public.review_actions;
create policy "read review actions through report access"
on public.review_actions for select
to authenticated
using (
  exists (
    select 1 from public.daily_reports dr
    where dr.id = review_actions.report_id
      and (
        public.current_profile_role() in ('ceo', 'coo', 'cfo', 'general_affairs', 'hq', 'supervisor', 'admin')
        or dr.store_id = public.current_profile_store_id()
        or exists (
          select 1 from public.store_supervisors ss
          where ss.store_id = dr.store_id
            and ss.supervisor_id = auth.uid()
        )
      )
  )
);

drop policy if exists "supervisors create review actions" on public.review_actions;
create policy "supervisors create review actions"
on public.review_actions for insert
to authenticated
with check (
  public.current_profile_role() in ('ceo', 'coo', 'supervisor', 'admin')
  and created_by = auth.uid()
);

drop policy if exists "supervisors read stores assignments" on public.store_supervisors;
create policy "supervisors read stores assignments"
on public.store_supervisors for select
to authenticated
using (
  supervisor_id = auth.uid()
  or public.current_profile_role() in ('ceo', 'coo', 'admin')
);

drop policy if exists "read inspections by role" on public.store_inspections;
create policy "read inspections by role"
on public.store_inspections for select
to authenticated
using (
  public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'hq', 'supervisor', 'admin')
  or store_id = public.current_profile_store_id()
  or exists (
    select 1 from public.store_supervisors ss
    where ss.store_id = store_inspections.store_id
      and ss.supervisor_id = auth.uid()
  )
);

drop policy if exists "supervisors manage inspections" on public.store_inspections;
create policy "supervisors manage inspections"
on public.store_inspections for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin'));

drop policy if exists "read inspection photos through inspection access" on public.store_inspection_photos;
create policy "read inspection photos through inspection access"
on public.store_inspection_photos for select
to authenticated
using (
  exists (
    select 1 from public.store_inspections si
    where si.id = store_inspection_photos.inspection_id
      and (
        public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'hq', 'supervisor', 'admin')
        or si.store_id = public.current_profile_store_id()
      )
  )
);

drop policy if exists "supervisors manage inspection photos" on public.store_inspection_photos;
create policy "supervisors manage inspection photos"
on public.store_inspection_photos for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin'));

drop policy if exists "read inspection issues through inspection access" on public.store_inspection_issues;
create policy "read inspection issues through inspection access"
on public.store_inspection_issues for select
to authenticated
using (
  exists (
    select 1 from public.store_inspections si
    where si.id = store_inspection_issues.inspection_id
      and (
        public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'hq', 'supervisor', 'admin')
        or si.store_id = public.current_profile_store_id()
      )
  )
);

drop policy if exists "supervisors manage inspection issues" on public.store_inspection_issues;
create policy "supervisors manage inspection issues"
on public.store_inspection_issues for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin'));

drop policy if exists "read handovers by role" on public.store_handovers;
create policy "read handovers by role"
on public.store_handovers for select
to authenticated
using (
  public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'hq', 'supervisor', 'admin')
  or store_id = public.current_profile_store_id()
  or exists (
    select 1 from public.store_supervisors ss
    where ss.store_id = store_handovers.store_id
      and ss.supervisor_id = auth.uid()
  )
);

drop policy if exists "store managers manage handovers" on public.store_handovers;
create policy "store managers manage handovers"
on public.store_handovers for all
to authenticated
using (
  (
    public.current_profile_role() = 'store_manager'
    and store_id = public.current_profile_store_id()
  )
  or public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin')
)
with check (
  (
    public.current_profile_role() = 'store_manager'
    and store_id = public.current_profile_store_id()
  )
  or public.current_profile_role() in ('ceo', 'coo', 'general_affairs', 'supervisor', 'admin')
);

drop policy if exists "read staff performance by role" on public.staff_performance;
create policy "read staff performance by role"
on public.staff_performance for select
to authenticated
using (
  public.current_profile_role() in ('ceo', 'coo', 'hq', 'supervisor', 'admin')
  or exists (
    select 1 from public.store_supervisors ss
    where ss.store_id = staff_performance.store_id
      and ss.supervisor_id = auth.uid()
  )
);

drop policy if exists "supervisors manage staff performance" on public.staff_performance;
create policy "supervisors manage staff performance"
on public.staff_performance for all
to authenticated
using (public.current_profile_role() in ('ceo', 'coo', 'hq', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('ceo', 'coo', 'hq', 'supervisor', 'admin'));
