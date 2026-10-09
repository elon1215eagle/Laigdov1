begin;

alter table public.monthly_schedule_change_requests
  add column if not exists scope_type text not null default 'staff',
  add column if not exists target_date date,
  add column if not exists target_staff_id text references public.store_staff(id) on delete restrict,
  add column if not exists target_shift_id uuid references public.daily_staff_shifts(id) on delete set null,
  add column if not exists approved_until timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists approval_version integer not null default 1;

update public.monthly_schedule_change_requests
set status = 'closed',
    review_note = concat_ws('；', nullif(review_note, ''), '舊版整月解鎖已由精準核准機制關閉'),
    updated_at = now()
where status = 'approved'
  and target_date is null
  and target_staff_id is null
  and target_shift_id is null;

alter table public.monthly_schedule_change_requests
  drop constraint if exists monthly_schedule_change_requests_scope_check;

alter table public.monthly_schedule_change_requests
  add constraint monthly_schedule_change_requests_scope_check check (
    status in ('closed', 'rejected')
    or (scope_type = 'date' and target_date is not null and target_staff_id is null and target_shift_id is null)
    or (scope_type = 'staff' and target_staff_id is not null and target_date is null and target_shift_id is null)
    or (scope_type = 'shift' and target_shift_id is not null and target_date is null)
  );

create or replace function private.schedule_scope_matches(
  p_request public.monthly_schedule_change_requests,
  p_target_staff_id text,
  p_target_date date,
  p_target_shift_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case p_request.scope_type
    when 'date' then p_target_date = p_request.target_date
    when 'staff' then p_target_staff_id = p_request.target_staff_id
    when 'shift' then p_target_shift_id = p_request.target_shift_id
    else false
  end;
$$;

create or replace function private.store_can_manage_schedule_entry(
  p_period_month text,
  p_target_store_code text,
  p_target_staff_id text,
  p_target_date date default null,
  p_target_shift_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with actor as (
    select p.role::text as role, s.store_code
    from public.profiles p
    left join public.stores s on s.id = p.store_id
    where p.id = auth.uid() and p.is_active
  ),
  lock_state as (
    select coalesce((select is_confirmed from public.monthly_schedule_locks where period_month = p_period_month), false) as locked
  )
  select coalesce((
    select case
      when actor.role in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then true
      when actor.role in ('store_manager', 'assistant_manager')
        and private.store_owns_schedule_request_scope(actor.store_code, p_target_store_code)
        and (
          not (select locked from lock_state)
          or exists (
            select 1
            from public.monthly_schedule_change_requests request_row
            where request_row.period_month = p_period_month
              and private.store_owns_schedule_request_scope(actor.store_code, request_row.store_code)
              and request_row.status = 'approved'
              and request_row.used_at is null
              and request_row.approved_until > now()
              and private.schedule_scope_matches(request_row, p_target_staff_id, p_target_date, p_target_shift_id)
          )
        ) then true
      else false
    end
    from actor
  ), false);
$$;

revoke all on function private.schedule_scope_matches(public.monthly_schedule_change_requests, text, date, uuid) from public;
revoke all on function private.store_can_manage_schedule_entry(text, text, text, date, uuid) from public;
grant execute on function private.store_can_manage_schedule_entry(text, text, text, date, uuid) to authenticated;

drop policy if exists "store managers manage unlocked monthly leave plans" on public.monthly_leave_plans;
create policy "store managers manage unlocked monthly leave plans"
on public.monthly_leave_plans for all to authenticated
using ((select private.store_can_manage_schedule_entry(period_month, store_code, staff_id, null, null)))
with check ((select private.store_can_manage_schedule_entry(period_month, store_code, staff_id, null, null)));

drop policy if exists "store managers manage unlocked daily staff shifts" on public.daily_staff_shifts;
create policy "store managers manage unlocked daily staff shifts"
on public.daily_staff_shifts for all to authenticated
using ((select private.store_can_manage_schedule_entry(to_char(shift_date, 'YYYY-MM'), home_store_code, staff_id, shift_date, id)))
with check ((select private.store_can_manage_schedule_entry(to_char(shift_date, 'YYYY-MM'), home_store_code, staff_id, shift_date, id)));

create or replace function private.consume_schedule_change_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  row_period text;
  row_store text;
  row_staff text;
  row_date date;
  row_shift uuid;
begin
  if tg_table_name = 'monthly_leave_plans' then
    row_period := coalesce(new.period_month, old.period_month);
    row_store := coalesce(new.store_code, old.store_code);
    row_staff := coalesce(new.staff_id, old.staff_id);
  else
    row_date := coalesce(new.shift_date, old.shift_date);
    row_period := to_char(row_date, 'YYYY-MM');
    row_store := coalesce(new.home_store_code, old.home_store_code);
    row_staff := coalesce(new.staff_id, old.staff_id);
    row_shift := coalesce(new.id, old.id);
  end if;

  if public.current_profile_role()::text in ('store_manager', 'assistant_manager') then
    update public.monthly_schedule_change_requests request_row
    set used_at = now(), status = 'closed', updated_at = now()
    where request_row.period_month = row_period
      and request_row.status = 'approved'
      and request_row.used_at is null
      and request_row.approved_until > now()
      and private.schedule_scope_matches(request_row, row_staff, row_date, row_shift);
  end if;
  return null;
end;
$$;

drop trigger if exists consume_leave_schedule_approval on public.monthly_leave_plans;
create trigger consume_leave_schedule_approval
after insert or update or delete on public.monthly_leave_plans
for each row execute function private.consume_schedule_change_approval();

drop trigger if exists consume_shift_schedule_approval on public.daily_staff_shifts;
create trigger consume_shift_schedule_approval
after insert or update or delete on public.daily_staff_shifts
for each row execute function private.consume_schedule_change_approval();

commit;
