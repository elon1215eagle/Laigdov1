begin;

create or replace function private.store_owns_schedule_request_scope(
  p_store_code text,
  p_request_scope_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    p_request_scope_code = p_store_code
    or exists (
      select 1
      from public.store_relation_groups g
      where g.group_code = p_request_scope_code
        and g.coordinating_store_code = p_store_code
        and g.schedule_shared
        and g.is_active
    );
$$;

revoke all on function private.store_owns_schedule_request_scope(text, text) from public;
grant execute on function private.store_owns_schedule_request_scope(text, text) to authenticated;

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
    select
      p.id,
      p.role::text as role,
      s.store_code
    from public.profiles p
    left join public.stores s on s.id = p.store_id
    where p.id = auth.uid()
      and p.is_active
  ),
  schedule_state as (
    select coalesce((
      select mc.is_confirmed
      from public.monthly_schedule_locks mc
      where mc.period_month = p_period_month
    ), false) as is_confirmed
  ),
  approved_request as (
    select exists (
      select 1
      from public.monthly_schedule_change_requests cr
      join actor a
        on private.store_owns_schedule_request_scope(a.store_code, cr.store_code)
      where cr.period_month = p_period_month
        and cr.status = 'approved'
    ) as allowed
  )
  select coalesce((
    select
      case
        when a.role in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then true
        when a.role in ('store_manager', 'assistant_manager')
          and (
            p_target_store_code = a.store_code
            or exists (
              select 1
              from public.store_relation_groups g
              join public.store_relation_group_members m on m.group_id = g.id
              join public.stores target_store on target_store.store_code = m.store_code
              where g.coordinating_store_code = a.store_code
                and m.store_code = p_target_store_code
                and target_store.operating_status = 'suspended'
                and g.schedule_shared
                and g.is_active
            )
          )
          and (
            not (select is_confirmed from schedule_state)
            or (select allowed from approved_request)
          )
          then true
        else false
      end
    from actor a
  ), false);
$$;

revoke all on function private.store_can_manage_schedule(text, text) from public;
grant execute on function private.store_can_manage_schedule(text, text) to authenticated;

drop policy if exists "authenticated read monthly schedule change requests"
  on public.monthly_schedule_change_requests;
create policy "authenticated read monthly schedule change requests"
on public.monthly_schedule_change_requests
for select
to authenticated
using (
  public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs')
  or exists (
    select 1
    from public.profiles p
    left join public.stores s on s.id = p.store_id
    where p.id = auth.uid()
      and p.is_active
      and private.store_owns_schedule_request_scope(
        s.store_code,
        monthly_schedule_change_requests.store_code
      )
  )
);

drop policy if exists "store managers create monthly schedule change requests"
  on public.monthly_schedule_change_requests;
create policy "store managers create monthly schedule change requests"
on public.monthly_schedule_change_requests
for insert
to authenticated
with check (
  public.current_profile_role()::text in ('store_manager', 'assistant_manager')
  and status = 'pending'
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    left join public.stores s on s.id = p.store_id
    where p.id = auth.uid()
      and p.is_active
      and private.store_owns_schedule_request_scope(
        s.store_code,
        monthly_schedule_change_requests.store_code
      )
  )
);

drop policy if exists "store managers update own monthly schedule change requests"
  on public.monthly_schedule_change_requests;
create policy "store managers update own monthly schedule change requests"
on public.monthly_schedule_change_requests
for update
to authenticated
using (
  requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    left join public.stores s on s.id = p.store_id
    where p.id = auth.uid()
      and p.is_active
      and private.store_owns_schedule_request_scope(
        s.store_code,
        monthly_schedule_change_requests.store_code
      )
  )
)
with check (
  status = 'pending'
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    left join public.stores s on s.id = p.store_id
    where p.id = auth.uid()
      and p.is_active
      and private.store_owns_schedule_request_scope(
        s.store_code,
        monthly_schedule_change_requests.store_code
      )
  )
);

commit;
