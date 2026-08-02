begin;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.staff_store_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references public.store_staff(id) on delete restrict,
  store_code text not null references public.stores(store_code) on delete restrict,
  effective_from date not null,
  effective_to date,
  reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_store_assignments_date_check
    check (effective_to is null or effective_to >= effective_from),
  constraint staff_store_assignments_reason_check
    check (char_length(trim(reason)) >= 2)
);

alter table public.staff_store_assignments
  drop constraint if exists staff_store_assignments_no_overlap;
alter table public.staff_store_assignments
  add constraint staff_store_assignments_no_overlap
  exclude using gist (
    staff_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  );

create index if not exists staff_store_assignments_store_date_idx
  on public.staff_store_assignments (store_code, effective_from, effective_to);

insert into public.staff_store_assignments (
  staff_id, store_code, effective_from, effective_to, reason, created_by
)
select staff.id, staff.store_code, date '1900-01-01', null, '既有人員歸屬基準', staff.updated_by
from public.store_staff staff
join public.stores store_row on store_row.store_code = staff.store_code
where not exists (
  select 1 from public.staff_store_assignments assignment
  where assignment.staff_id = staff.id
);

alter table public.staff_store_assignments enable row level security;

drop policy if exists "staff assignments visible by staff scope" on public.staff_store_assignments;
create policy "staff assignments visible by staff scope"
on public.staff_store_assignments
for select
to authenticated
using (
  (select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs')
  or exists (
    select 1 from public.store_staff visible_staff
    where visible_staff.id = staff_store_assignments.staff_id
  )
);

drop policy if exists "headquarters manage staff assignments" on public.staff_store_assignments;
create policy "headquarters manage staff assignments"
on public.staff_store_assignments
for all
to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

grant select, insert, update on public.staff_store_assignments to authenticated;
grant select, insert, update, delete on public.staff_store_assignments to service_role;

create or replace function public.record_staff_store_transfer(
  p_staff_id text,
  p_store_code text,
  p_effective_from date,
  p_reason text
)
returns setof public.staff_store_assignments
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  current_assignment public.staff_store_assignments%rowtype;
  inserted_assignment public.staff_store_assignments%rowtype;
  target_store_name text;
begin
  if (select public.current_profile_role())::text not in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then
    raise exception 'insufficient staff transfer permission' using errcode = '42501';
  end if;
  if p_effective_from is null or char_length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception 'transfer date and reason are required' using errcode = '22023';
  end if;

  perform 1 from public.store_staff where id = p_staff_id for update;
  if not found then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;

  select name into target_store_name from public.stores where store_code = p_store_code;
  if target_store_name is null then
    raise exception 'target store not found' using errcode = 'P0002';
  end if;

  select * into current_assignment
  from public.staff_store_assignments
  where staff_id = p_staff_id and effective_to is null
  order by effective_from desc
  limit 1
  for update;

  if current_assignment.id is not null then
    if p_effective_from <= current_assignment.effective_from then
      raise exception 'transfer date must be after current assignment start' using errcode = '22023';
    end if;
    if current_assignment.store_code = p_store_code then
      raise exception 'target store is already the current assignment' using errcode = '22023';
    end if;
    update public.staff_store_assignments
    set effective_to = p_effective_from - 1, updated_at = now()
    where id = current_assignment.id;
  end if;

  insert into public.staff_store_assignments (
    staff_id, store_code, effective_from, effective_to, reason, created_by
  ) values (
    p_staff_id, p_store_code, p_effective_from, null, trim(p_reason), auth.uid()
  ) returning * into inserted_assignment;

  update public.store_staff
  set store_code = p_store_code, store_name = target_store_name, updated_at = now()
  where id = p_staff_id;

  return next inserted_assignment;
end;
$$;

revoke all on function public.record_staff_store_transfer(text, text, date, text) from public;
revoke all on function public.record_staff_store_transfer(text, text, date, text) from anon;
grant execute on function public.record_staff_store_transfer(text, text, date, text) to authenticated;
grant execute on function public.record_staff_store_transfer(text, text, date, text) to service_role;

comment on table public.staff_store_assignments is '人員主要歸屬門店歷程；調店以生效日新增版本，不覆蓋歷史。';
comment on function public.record_staff_store_transfer(text, text, date, text) is '原子化關閉舊歸屬、建立新歸屬並同步人員主檔目前門店。';

commit;
