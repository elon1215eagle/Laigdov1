create table if not exists public.standard_shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint standard_shift_templates_time_check check (
    end_time > start_time
    and extract(minute from start_time)::integer % 15 = 0
    and extract(minute from end_time)::integer % 15 = 0
  )
);

create unique index if not exists standard_shift_templates_active_name_idx
  on public.standard_shift_templates (lower(name)) where is_active;
create index if not exists standard_shift_templates_created_by_idx
  on public.standard_shift_templates (created_by);

alter table public.standard_shift_templates enable row level security;
grant select on public.standard_shift_templates to authenticated;
grant insert, update, delete on public.standard_shift_templates to authenticated;

drop policy if exists "authenticated read standard shift templates" on public.standard_shift_templates;
create policy "authenticated read standard shift templates"
on public.standard_shift_templates for select to authenticated
using (true);

drop policy if exists "headquarters insert standard shift templates" on public.standard_shift_templates;
create policy "headquarters insert standard shift templates"
on public.standard_shift_templates for insert to authenticated
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));
drop policy if exists "headquarters update standard shift templates" on public.standard_shift_templates;
create policy "headquarters update standard shift templates"
on public.standard_shift_templates for update to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));
drop policy if exists "headquarters delete standard shift templates" on public.standard_shift_templates;
create policy "headquarters delete standard shift templates"
on public.standard_shift_templates for delete to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

drop trigger if exists set_standard_shift_templates_updated_at on public.standard_shift_templates;
create trigger set_standard_shift_templates_updated_at
before update on public.standard_shift_templates
for each row execute function public.set_store_staff_updated_at();

insert into public.standard_shift_templates (name, start_time, end_time, sort_order)
values
  ('早班', '10:00', '16:00', 10),
  ('中班', '12:00', '20:00', 20),
  ('晚班', '15:00', '23:00', 30),
  ('全日班', '10:00', '20:00', 40)
on conflict do nothing;
