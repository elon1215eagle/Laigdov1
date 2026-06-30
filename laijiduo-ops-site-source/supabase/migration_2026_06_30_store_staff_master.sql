create table if not exists public.store_staff (
  id text primary key,
  store_code text not null,
  store_name text not null,
  employee_name text not null,
  role_name text not null,
  sort_order integer not null default 999,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists store_staff_store_code_idx
  on public.store_staff (store_code, sort_order, employee_name)
  where is_active = true;

create or replace function public.set_store_staff_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_store_staff_updated_at on public.store_staff;
create trigger set_store_staff_updated_at
before update on public.store_staff
for each row execute function public.set_store_staff_updated_at();

alter table public.store_staff enable row level security;

drop policy if exists "read store staff by authenticated" on public.store_staff;
create policy "read store staff by authenticated"
on public.store_staff for select
to authenticated
using (true);

drop policy if exists "manage store staff by headquarters" on public.store_staff;
create policy "manage store staff by headquarters"
on public.store_staff for all
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

grant select, insert, update, delete on table public.store_staff to authenticated;
grant select, insert, update, delete on table public.store_staff to service_role;
