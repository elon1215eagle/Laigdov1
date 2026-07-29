begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_headquarters_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'),
    false
  );
$$;

create or replace function private.store_can_manage_schedule(
  p_period_month text,
  p_target_store_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with actor as (
    select store.store_code
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and profile.is_active
      and profile.role::text = 'store_manager'
  ),
  scope_check as (
    select exists (
      select 1
      from actor
      where p_target_store_code = actor.store_code
         or exists (
           select 1
           from public.store_relation_groups relation_group
           join public.store_relation_group_members member
             on member.group_id = relation_group.id
           join public.stores target_store
             on target_store.store_code = member.store_code
           where relation_group.coordinating_store_code = actor.store_code
             and member.store_code = p_target_store_code
             and target_store.operating_status = 'suspended'
             and relation_group.schedule_shared
             and relation_group.is_active
         )
    ) as allowed
  ),
  lock_state as (
    select coalesce((
      select schedule_lock.is_confirmed
      from public.monthly_schedule_locks schedule_lock
      where schedule_lock.period_month = p_period_month
    ), false) as locked
  ),
  approved_request as (
    select exists (
      select 1
      from public.monthly_schedule_change_requests change_request
      join actor on actor.store_code = change_request.store_code
      where change_request.period_month = p_period_month
        and change_request.status = 'approved'
    ) as allowed
  )
  select scope_check.allowed
     and (not lock_state.locked or approved_request.allowed)
  from scope_check, lock_state, approved_request;
$$;

revoke all on function private.is_headquarters_role() from public;
revoke all on function private.store_can_manage_schedule(text, text) from public;
grant execute on function private.is_headquarters_role() to authenticated;
grant execute on function private.store_can_manage_schedule(text, text) to authenticated;

drop policy if exists "schedule details managed by operating scope"
  on public.monthly_leave_plans;
drop policy if exists "headquarters manage monthly leave plans"
  on public.monthly_leave_plans;
drop policy if exists "store managers manage unlocked monthly leave plans"
  on public.monthly_leave_plans;

create policy "headquarters manage monthly leave plans"
on public.monthly_leave_plans
for all
to authenticated
using ((select private.is_headquarters_role()))
with check ((select private.is_headquarters_role()));

create policy "store managers manage unlocked monthly leave plans"
on public.monthly_leave_plans
for all
to authenticated
using ((
  select private.store_can_manage_schedule(period_month, store_code)
))
with check ((
  select private.store_can_manage_schedule(period_month, store_code)
));

drop policy if exists "store managers create own daily staff shifts"
  on public.daily_staff_shifts;
drop policy if exists "store managers update own daily staff shifts"
  on public.daily_staff_shifts;
drop policy if exists "store managers delete own daily staff shifts"
  on public.daily_staff_shifts;
drop policy if exists "store managers manage unlocked daily staff shifts"
  on public.daily_staff_shifts;

create policy "store managers manage unlocked daily staff shifts"
on public.daily_staff_shifts
for all
to authenticated
using ((
  select private.store_can_manage_schedule(
    to_char(shift_date, 'YYYY-MM'),
    home_store_code
  )
))
with check ((
  select private.store_can_manage_schedule(
    to_char(shift_date, 'YYYY-MM'),
    home_store_code
  )
));

grant select, insert, update
  on table public.monthly_schedule_locks
  to authenticated;
grant select, insert, update
  on table public.monthly_schedule_change_requests
  to authenticated;

drop policy if exists "authenticated read monthly schedule locks"
  on public.monthly_schedule_locks;
create policy "authenticated read monthly schedule locks"
on public.monthly_schedule_locks
for select
to authenticated
using (true);

drop policy if exists "headquarters manage monthly schedule locks"
  on public.monthly_schedule_locks;
create policy "headquarters manage monthly schedule locks"
on public.monthly_schedule_locks
for all
to authenticated
using ((select private.is_headquarters_role()))
with check ((select private.is_headquarters_role()));

drop policy if exists "authenticated read monthly schedule change requests"
  on public.monthly_schedule_change_requests;
create policy "authenticated read monthly schedule change requests"
on public.monthly_schedule_change_requests
for select
to authenticated
using (
  (select private.is_headquarters_role())
  or exists (
    select 1
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and profile.role::text = 'store_manager'
      and monthly_schedule_change_requests.store_code = store.store_code
  )
);

drop policy if exists "store managers create own monthly schedule change requests"
  on public.monthly_schedule_change_requests;
create policy "store managers create own monthly schedule change requests"
on public.monthly_schedule_change_requests
for insert
to authenticated
with check (
  public.current_profile_role()::text = 'store_manager'
  and status = 'pending'
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and store.store_code = monthly_schedule_change_requests.store_code
  )
);

drop policy if exists "store managers update own schedule requests"
  on public.monthly_schedule_change_requests;
create policy "store managers update own schedule requests"
on public.monthly_schedule_change_requests
for update
to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and store.store_code = monthly_schedule_change_requests.store_code
  )
)
with check (
  status = 'pending'
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles profile
    join public.stores store on store.id = profile.store_id
    where profile.id = auth.uid()
      and store.store_code = monthly_schedule_change_requests.store_code
  )
);

drop policy if exists "headquarters manage monthly schedule change requests"
  on public.monthly_schedule_change_requests;
create policy "headquarters manage monthly schedule change requests"
on public.monthly_schedule_change_requests
for all
to authenticated
using ((select private.is_headquarters_role()))
with check ((select private.is_headquarters_role()));

create or replace function private.close_approved_schedule_requests_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.is_confirmed then
    update public.monthly_schedule_change_requests
    set
      status = 'closed',
      updated_at = now(),
      review_note = case
        when review_note = '' then '總部再次確認，修改權限已關閉'
        else review_note
      end
    where period_month = new.period_month
      and status = 'approved';
  end if;

  return new;
end;
$$;

revoke all
  on function private.close_approved_schedule_requests_on_confirmation()
  from public;

drop trigger if exists close_schedule_requests_on_confirmation
  on public.monthly_schedule_locks;
create trigger close_schedule_requests_on_confirmation
after insert or update of is_confirmed
on public.monthly_schedule_locks
for each row
execute function private.close_approved_schedule_requests_on_confirmation();

commit;
