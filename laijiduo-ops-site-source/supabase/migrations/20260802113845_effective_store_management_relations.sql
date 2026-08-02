begin;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.store_management_relations (
  id uuid primary key default gen_random_uuid(),
  managing_store_code text not null references public.stores(store_code) on delete restrict,
  managed_store_code text not null references public.stores(store_code) on delete restrict,
  relationship_type text not null default 'schedule_management',
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_management_relations_distinct_store_check check (managing_store_code <> managed_store_code),
  constraint store_management_relations_type_check check (relationship_type in ('schedule_management')),
  constraint store_management_relations_date_check check (effective_to is null or effective_to >= effective_from)
);

alter table public.store_management_relations
  drop constraint if exists store_management_relations_no_overlap;
alter table public.store_management_relations
  add constraint store_management_relations_no_overlap
  exclude using gist (
    managed_store_code with =,
    relationship_type with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  ) where (is_active);

create index if not exists store_management_relations_manager_date_idx
  on public.store_management_relations (managing_store_code, effective_from, effective_to)
  where is_active;

insert into public.store_management_relations (
  managing_store_code, managed_store_code, relationship_type,
  effective_from, effective_to, is_active, reason
)
select
  relation_group.coordinating_store_code,
  member.store_code,
  'schedule_management',
  date '1900-01-01',
  null,
  true,
  '既有排班群組管理關係基準'
from public.store_relation_groups relation_group
join public.store_relation_group_members member on member.group_id = relation_group.id
where member.store_code <> relation_group.coordinating_store_code
  and not exists (
    select 1 from public.store_management_relations existing
    where existing.managed_store_code = member.store_code
      and existing.relationship_type = 'schedule_management'
      and existing.effective_to is null
      and existing.is_active
  );

alter table public.store_management_relations enable row level security;

drop policy if exists "authenticated read store management relations" on public.store_management_relations;
create policy "authenticated read store management relations"
on public.store_management_relations for select to authenticated using (true);

drop policy if exists "headquarters manage store management relations" on public.store_management_relations;
create policy "headquarters manage store management relations"
on public.store_management_relations for all to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs'));

grant select, insert, update, delete on public.store_management_relations to authenticated;
grant select, insert, update, delete on public.store_management_relations to service_role;

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
      from public.store_relation_groups relation_group
      join public.store_relation_group_members member on member.group_id = relation_group.id
      join public.store_management_relations management
        on management.managing_store_code = p_store_code
       and management.managed_store_code = member.store_code
       and management.relationship_type = 'schedule_management'
       and management.is_active
       and management.effective_from <= current_date
       and (management.effective_to is null or management.effective_to >= current_date)
      where relation_group.group_code = p_request_scope_code
        and relation_group.coordinating_store_code = p_store_code
        and relation_group.schedule_shared
        and relation_group.is_active
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
    select profile.id, profile.role::text as role, store_row.store_code
    from public.profiles profile
    left join public.stores store_row on store_row.id = profile.store_id
    where profile.id = auth.uid() and profile.is_active
  ),
  target_date as (
    select to_date(p_period_month || '-01', 'YYYY-MM-DD') as value
  ),
  schedule_state as (
    select coalesce((select schedule_lock.is_confirmed from public.monthly_schedule_locks schedule_lock where schedule_lock.period_month = p_period_month), false) as is_confirmed
  ),
  approved_request as (
    select exists (
      select 1 from public.monthly_schedule_change_requests request_row
      join actor actor_row on private.store_owns_schedule_request_scope(actor_row.store_code, request_row.store_code)
      where request_row.period_month = p_period_month and request_row.status = 'approved'
    ) as allowed
  )
  select coalesce((
    select case
      when actor_row.role in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then true
      when actor_row.role in ('store_manager', 'assistant_manager')
        and (
          p_target_store_code = actor_row.store_code
          or exists (
            select 1 from public.store_management_relations management, target_date
            where management.managing_store_code = actor_row.store_code
              and management.managed_store_code = p_target_store_code
              and management.relationship_type = 'schedule_management'
              and management.is_active
              and management.effective_from <= target_date.value
              and (management.effective_to is null or management.effective_to >= target_date.value)
          )
        )
        and (not (select is_confirmed from schedule_state) or (select allowed from approved_request))
        then true
      else false
    end from actor actor_row
  ), false);
$$;

revoke all on function private.store_owns_schedule_request_scope(text, text) from public;
grant execute on function private.store_owns_schedule_request_scope(text, text) to authenticated;
revoke all on function private.store_can_manage_schedule(text, text) from public;
grant execute on function private.store_can_manage_schedule(text, text) to authenticated;

comment on table public.store_management_relations is '門店排班管理關係版本；不影響各店營收、庫存及成本資料獨立性。';

commit;
