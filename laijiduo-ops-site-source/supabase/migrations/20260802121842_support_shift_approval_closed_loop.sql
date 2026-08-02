begin;

alter table public.monthly_schedule_locks
  add column if not exists schedule_version integer not null default 1,
  add column if not exists needs_reconfirmation boolean not null default false;

create table if not exists public.support_shift_requests (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  staff_id text not null references public.store_staff(id) on delete restrict,
  employee_name text not null default '',
  home_store_code text not null references public.stores(store_code) on delete restrict,
  assigned_store_code text not null references public.stores(store_code) on delete restrict,
  start_time time not null,
  end_time time not null,
  note text not null default '',
  status text not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  resulting_shift_id uuid references public.daily_staff_shifts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_shift_requests_different_store check (home_store_code <> assigned_store_code),
  constraint support_shift_requests_time_check check (end_time > start_time),
  constraint support_shift_requests_status_check check (status in ('pending','approved','rejected','cancelled'))
);

create index if not exists support_shift_requests_date_status_idx
  on public.support_shift_requests (shift_date, status, home_store_code, assigned_store_code);

alter table public.support_shift_requests enable row level security;
grant select, insert, update on public.support_shift_requests to authenticated;
grant select, insert, update, delete on public.support_shift_requests to service_role;

drop policy if exists "headquarters manage support shift requests" on public.support_shift_requests;
create policy "headquarters manage support shift requests"
on public.support_shift_requests for all to authenticated
using ((select private.is_headquarters_role()))
with check ((select private.is_headquarters_role()));

drop policy if exists "stores read related support shift requests" on public.support_shift_requests;
create policy "stores read related support shift requests"
on public.support_shift_requests for select to authenticated
using (exists (
  select 1 from public.profiles profile
  join public.stores actor_store on actor_store.id = profile.store_id
  where profile.id = auth.uid() and profile.is_active
    and (
      actor_store.store_code in (home_store_code, assigned_store_code)
      or exists (
        select 1 from public.store_management_relations management
        where management.managing_store_code = actor_store.store_code
          and management.managed_store_code in (home_store_code, assigned_store_code)
          and management.effective_from <= shift_date
          and (management.effective_to is null or management.effective_to >= shift_date)
      )
    )
));

drop policy if exists "stores create own support shift requests" on public.support_shift_requests;
create policy "stores create own support shift requests"
on public.support_shift_requests for insert to authenticated
with check (
  status = 'pending' and requested_by = auth.uid()
  and exists (
    select 1 from public.profiles profile
    join public.stores actor_store on actor_store.id = profile.store_id
    where profile.id = auth.uid() and profile.is_active
      and profile.role::text in ('store_manager','assistant_manager')
      and (
        actor_store.store_code = home_store_code
        or exists (
          select 1 from public.store_management_relations management
          where management.managing_store_code = actor_store.store_code
            and management.managed_store_code = home_store_code
            and management.effective_from <= shift_date
            and (management.effective_to is null or management.effective_to >= shift_date)
        )
      )
  )
);

create or replace function public.review_support_shift_request(
  p_request_id uuid,
  p_status text,
  p_review_note text default ''
)
returns public.support_shift_requests
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  request_row public.support_shift_requests;
  shift_row public.daily_staff_shifts;
begin
  if not private.is_headquarters_role() then raise exception '僅總部可核准跨店支援'; end if;
  if p_status not in ('approved','rejected') then raise exception '不支援的核准狀態'; end if;

  select * into request_row from public.support_shift_requests where id=p_request_id for update;
  if request_row.id is null then raise exception '找不到跨店支援申請'; end if;
  if request_row.status <> 'pending' then raise exception '此申請已處理'; end if;

  if p_status = 'approved' then
    insert into public.daily_staff_shifts (
      shift_date, staff_id, employee_name, home_store_code, assigned_store_code,
      start_time, end_time, shift_type, note, created_by
    ) values (
      request_row.shift_date, request_row.staff_id, request_row.employee_name,
      request_row.home_store_code, request_row.assigned_store_code,
      request_row.start_time, request_row.end_time, 'support', request_row.note, auth.uid()
    ) returning * into shift_row;
  end if;

  update public.support_shift_requests set
    status=p_status, reviewed_by=auth.uid(), reviewed_at=now(), review_note=coalesce(p_review_note,''),
    resulting_shift_id=shift_row.id, updated_at=now()
  where id=p_request_id returning * into request_row;

  if p_status = 'approved' then
    insert into public.monthly_schedule_locks (period_month, is_confirmed, schedule_version, needs_reconfirmation, note)
    values (to_char(request_row.shift_date,'YYYY-MM'), false, 2, true, '跨店支援核准後待總部重新確認')
    on conflict (period_month) do update set
      schedule_version=public.monthly_schedule_locks.schedule_version+1,
      needs_reconfirmation=true,
      note='跨店支援核准後待總部重新確認',
      updated_at=now();
  end if;
  return request_row;
end;
$$;

revoke all on function public.review_support_shift_request(uuid,text,text) from public;
grant execute on function public.review_support_shift_request(uuid,text,text) to authenticated;

commit;
