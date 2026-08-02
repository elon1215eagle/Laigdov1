create extension if not exists pgcrypto with schema extensions;

create table if not exists public.schedule_personal_links (
  id uuid primary key default gen_random_uuid(),
  period_month text not null check (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  schedule_version integer not null check (schedule_version > 0),
  staff_id text not null,
  employee_name text not null,
  home_store_code text not null references public.stores(store_code) on delete restrict,
  role_name text not null default '',
  token_hash text not null unique,
  schedule_payload jsonb not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint schedule_personal_payload_object_check check (jsonb_typeof(schedule_payload) = 'object')
);

create index if not exists schedule_personal_links_staff_version_idx
on public.schedule_personal_links (period_month, staff_id, schedule_version desc);

alter table public.schedule_personal_links enable row level security;
grant select on public.schedule_personal_links to authenticated;
grant select, insert, update, delete on public.schedule_personal_links to service_role;

create or replace function private.can_manage_personal_schedule_link(
  p_store_code text,
  p_period_month text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with actor as (
    select profile.role::text as role, store_row.store_code
    from public.profiles profile
    left join public.stores store_row on store_row.id = profile.store_id
    where profile.id = auth.uid() and profile.is_active
  ),
  target_date as (
    select to_date(p_period_month || '-01', 'YYYY-MM-DD') as value
  )
  select coalesce((
    select
      actor_row.role in ('ceo','coo','cfo','admin','hq','cso','general_affairs')
      or (
        actor_row.role in ('store_manager','assistant_manager')
        and (
          actor_row.store_code = p_store_code
          or exists (
            select 1 from public.store_management_relations relation_row, target_date
            where relation_row.managing_store_code = actor_row.store_code
              and relation_row.managed_store_code = p_store_code
              and relation_row.relationship_type = 'schedule_management'
              and relation_row.is_active
              and relation_row.effective_from <= target_date.value
              and (relation_row.effective_to is null or relation_row.effective_to >= target_date.value)
          )
        )
      )
    from actor actor_row
  ), false);
$$;

revoke all on function private.can_manage_personal_schedule_link(text,text) from public, anon;
grant execute on function private.can_manage_personal_schedule_link(text,text) to authenticated;

drop policy if exists "authorized managers read personal schedule links" on public.schedule_personal_links;
create policy "authorized managers read personal schedule links"
on public.schedule_personal_links for select to authenticated
using ((select private.can_manage_personal_schedule_link(home_store_code, period_month)));

create or replace function public.issue_personal_schedule_link(
  p_period_month text,
  p_schedule_version integer,
  p_staff_id text,
  p_employee_name text,
  p_home_store_code text,
  p_role_name text,
  p_token_hash text,
  p_schedule_payload jsonb,
  p_expires_at timestamptz
)
returns public.schedule_personal_links
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  created_row public.schedule_personal_links;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if not private.can_manage_personal_schedule_link(p_home_store_code, p_period_month) then
    raise exception '無權發行此門店的個人班表';
  end if;
  if p_expires_at <= now() then raise exception '失效時間必須晚於目前時間'; end if;
  insert into public.schedule_personal_links (
    period_month, schedule_version, staff_id, employee_name, home_store_code,
    role_name, token_hash, schedule_payload, expires_at, created_by
  ) values (
    p_period_month, p_schedule_version, p_staff_id, p_employee_name, p_home_store_code,
    coalesce(p_role_name,''), p_token_hash, p_schedule_payload, p_expires_at, auth.uid()
  ) returning * into created_row;
  return created_row;
end;
$$;

create or replace function public.revoke_personal_schedule_link(p_link_id uuid)
returns public.schedule_personal_links
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_row public.schedule_personal_links;
begin
  select * into target_row from public.schedule_personal_links where id = p_link_id for update;
  if target_row.id is null then raise exception '找不到個人班表連結'; end if;
  if not private.can_manage_personal_schedule_link(target_row.home_store_code, target_row.period_month) then
    raise exception '無權撤銷此連結';
  end if;
  update public.schedule_personal_links
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_link_id
  returning * into target_row;
  return target_row;
end;
$$;

create or replace function private.get_personal_schedule_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_build_object(
    'status', case
      when link_row.revoked_at is not null then 'revoked'
      when link_row.expires_at <= now() then 'expired'
      else 'active'
    end,
    'period_month', link_row.period_month,
    'schedule_version', link_row.schedule_version,
    'expires_at', link_row.expires_at,
    'has_newer_version', (
      coalesce((select lock_row.schedule_version from public.monthly_schedule_locks lock_row where lock_row.period_month = link_row.period_month), link_row.schedule_version)
      > link_row.schedule_version
      or exists (
        select 1 from public.schedule_personal_links newer
        where newer.period_month = link_row.period_month
          and newer.staff_id = link_row.staff_id
          and newer.schedule_version > link_row.schedule_version
          and newer.revoked_at is null
      )
    ),
    'schedule', case
      when link_row.revoked_at is null and link_row.expires_at > now() then link_row.schedule_payload
      else null
    end
  )
  from public.schedule_personal_links link_row
  where link_row.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  limit 1;
$$;

create or replace function public.get_personal_schedule_by_token(p_token text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$
  select private.get_personal_schedule_by_token(p_token);
$$;

revoke all on function public.issue_personal_schedule_link(text,integer,text,text,text,text,text,jsonb,timestamptz) from public, anon;
grant execute on function public.issue_personal_schedule_link(text,integer,text,text,text,text,text,jsonb,timestamptz) to authenticated;
revoke all on function public.revoke_personal_schedule_link(uuid) from public, anon;
grant execute on function public.revoke_personal_schedule_link(uuid) to authenticated;
revoke all on function private.get_personal_schedule_by_token(text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.get_personal_schedule_by_token(text) to anon, authenticated;
revoke all on function public.get_personal_schedule_by_token(text) from public;
grant execute on function public.get_personal_schedule_by_token(text) to anon, authenticated;
