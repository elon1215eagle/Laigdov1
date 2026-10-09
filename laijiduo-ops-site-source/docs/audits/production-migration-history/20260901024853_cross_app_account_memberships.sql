create table if not exists public.app_account_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_code text not null check (app_code in ('operations', 'franchise_performance', 'franchise_ordering')),
  is_active boolean not null default true,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, app_code)
);

alter table public.app_account_memberships enable row level security;
revoke all on table public.app_account_memberships from public, anon, authenticated;

insert into public.app_account_memberships (user_id, app_code, note)
select p.id, 'operations', '由既有營運 profiles 建立初始歸屬'
from public.profiles p
on conflict (user_id, app_code) do nothing;

insert into public.app_account_memberships (user_id, app_code, note)
select u.id, 'franchise_performance', '經營者確認為加盟業績計算 APP'
from auth.users u
where lower(u.email) in ('ck@laigdo.com', 'hsu@laigdo.com', 'pan@laigdo.com')
on conflict (user_id, app_code) do nothing;

insert into public.app_account_memberships (user_id, app_code, note)
select u.id, 'franchise_ordering', '經營者確認為加盟叫貨 APP；F04 為保留缺號'
from auth.users u
where lower(u.email) in (
  'f01@laigdo.com', 'f02@laigdo.com', 'f03@laigdo.com',
  'f05@laigdo.com', 'f06@laigdo.com', 'f07@laigdo.com',
  'f08@laigdo.com', 'f09@laigdo.com', 'f10@laigdo.com', 'f11@laigdo.com'
)
on conflict (user_id, app_code) do nothing;

create table if not exists public.app_account_membership_audits (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  app_code text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table public.app_account_membership_audits enable row level security;
revoke all on table public.app_account_membership_audits from public, anon, authenticated;

create or replace function public.audit_app_account_membership_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.app_account_membership_audits (
    user_id, app_code, action, before_data, after_data, changed_by
  ) values (
    coalesce(new.user_id, old.user_id),
    coalesce(new.app_code, old.app_code),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists app_account_memberships_audit on public.app_account_memberships;
create trigger app_account_memberships_audit
after insert or update or delete on public.app_account_memberships
for each row execute function public.audit_app_account_membership_change();

create or replace function public.get_cross_app_account_summary()
returns table (
  user_id uuid,
  email text,
  app_code text,
  app_label text,
  role_label text,
  store_code text,
  store_name text,
  is_active boolean,
  last_sign_in_at timestamptz,
  profile_complete boolean,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  caller_role text;
begin
  select p.role::text into caller_role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if caller_role is null or caller_role not in ('ceo', 'coo', 'admin', 'hq') then
    raise exception 'account_management_forbidden' using errcode = '42501';
  end if;

  return query
  with account_rows as (
    select
      u.id as user_id,
      u.email::text as email,
      m.app_code,
      case m.app_code
        when 'operations' then '營運 APP'
        when 'franchise_performance' then '加盟業績計算 APP'
        when 'franchise_ordering' then '加盟叫貨 APP'
        else '未分類'
      end as app_label,
      case
        when m.app_code = 'operations' then op.role::text
        when m.app_code in ('franchise_performance', 'franchise_ordering') then fp.role::text
        else null
      end as role_label,
      case
        when m.app_code = 'operations' then os.store_code
        when m.app_code in ('franchise_performance', 'franchise_ordering') then fs.store_code
        else null
      end as store_code,
      case
        when m.app_code = 'operations' then os.name
        when m.app_code in ('franchise_performance', 'franchise_ordering') then fs.name
        else null
      end as store_name,
      coalesce(m.is_active, true) as membership_active,
      u.banned_until,
      u.last_sign_in_at,
      case
        when m.app_code = 'operations' then op.id is not null
        when m.app_code in ('franchise_performance', 'franchise_ordering') then fp.id is not null
        else false
      end as profile_complete,
      case
        when m.app_code = 'operations' then coalesce(op.is_active, false)
        when m.app_code in ('franchise_performance', 'franchise_ordering') then coalesce(fp.is_active, false)
        else true
      end as profile_active
    from auth.users u
    left join public.app_account_memberships m on m.user_id = u.id
    left join public.profiles op on op.id = u.id
    left join public.stores os on os.id = op.store_id
    left join public.franchise_profiles fp on fp.id = u.id
    left join public.franchise_stores fs on fs.id = fp.franchise_store_id
    where u.email is not null
  )
  select
    a.user_id,
    a.email,
    a.app_code,
    a.app_label,
    a.role_label,
    a.store_code,
    a.store_name,
    (a.membership_active and a.profile_active and (a.banned_until is null or a.banned_until <= now())) as is_active,
    a.last_sign_in_at,
    a.profile_complete,
    case
      when a.app_code is null then 'unclassified'
      when not a.membership_active or not a.profile_active or (a.banned_until is not null and a.banned_until > now()) then 'inactive'
      when not a.profile_complete then 'pending_configuration'
      else 'normal'
    end as status
  from account_rows a
  order by
    case a.app_code
      when 'operations' then 1
      when 'franchise_performance' then 2
      when 'franchise_ordering' then 3
      else 4
    end,
    lower(a.email);
end;
$$;

revoke all on function public.get_cross_app_account_summary() from public, anon;
grant execute on function public.get_cross_app_account_summary() to authenticated;

comment on table public.app_account_memberships is '跨 APP 帳號歸屬；只分類，不取代各 APP 原權限資料。';
comment on function public.get_cross_app_account_summary() is '僅供營運 APP 總部授權角色唯讀查詢跨 APP 帳號狀態。';
