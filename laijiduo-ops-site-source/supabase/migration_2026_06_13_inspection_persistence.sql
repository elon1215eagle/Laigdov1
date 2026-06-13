-- 2026-06-13 Laijiduo inspection persistence upgrade
-- Store online inspection form data, manager signature, and source type in Supabase.

alter table public.store_inspections
alter column score type numeric(6,2) using score::numeric;

alter table public.store_inspections
add column if not exists form_data jsonb,
add column if not exists manager_signature text,
add column if not exists source_type text not null default 'upload';

create index if not exists store_inspections_date_store_idx
on public.store_inspections (inspection_date desc, store_id);

create index if not exists store_inspection_issues_status_idx
on public.store_inspection_issues (status, severity);

drop policy if exists "supervisors manage inspections" on public.store_inspections;
create policy "supervisors manage inspections"
on public.store_inspections for all
to authenticated
using (public.current_profile_role() in ('hq', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('hq', 'supervisor', 'admin'));

drop policy if exists "supervisors manage inspection issues" on public.store_inspection_issues;
create policy "supervisors manage inspection issues"
on public.store_inspection_issues for all
to authenticated
using (public.current_profile_role() in ('hq', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('hq', 'supervisor', 'admin'));

drop policy if exists "supervisors manage inspection photos" on public.store_inspection_photos;
create policy "supervisors manage inspection photos"
on public.store_inspection_photos for all
to authenticated
using (public.current_profile_role() in ('hq', 'supervisor', 'admin'))
with check (public.current_profile_role() in ('hq', 'supervisor', 'admin'));
