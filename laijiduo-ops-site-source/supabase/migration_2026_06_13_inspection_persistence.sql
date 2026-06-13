-- 2026-06-13 Laijiduo inspection persistence upgrade
-- Store online inspection form data, manager signature, and source type in Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.store_inspections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  inspection_date date not null,
  supervisor_name text not null,
  manager_name text,
  score numeric(6,2),
  status text not null default 'pending',
  summary text,
  form_data jsonb,
  manager_signature text,
  source_type text not null default 'upload',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.store_inspections(id) on delete cascade,
  storage_path text not null,
  original_name text,
  page_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.store_inspection_issues (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.store_inspections(id) on delete cascade,
  category text not null,
  title text not null,
  description text,
  suggestion text,
  severity text not null default 'normal',
  due_date date,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.store_inspections enable row level security;
alter table public.store_inspection_photos enable row level security;
alter table public.store_inspection_issues enable row level security;

drop policy if exists "read inspections by role" on public.store_inspections;
create policy "read inspections by role"
on public.store_inspections for select
to authenticated
using (
  public.current_profile_role() in ('hq', 'supervisor', 'admin')
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
