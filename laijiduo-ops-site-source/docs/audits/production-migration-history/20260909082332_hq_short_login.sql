create schema if not exists hq_short_private;
revoke all on schema hq_short_private from public, anon, authenticated;
create table hq_short_private.credentials (
  alias text primary key check (alias ~ '^[a-z][a-z0-9]{1,31}$'),
  user_id uuid not null unique references auth.users(id),
  password_hash text not null,
  enabled boolean not null default true,
  failures integer not null default 0,
  blocked_until timestamptz,
  last_login_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table hq_short_private.events (
  id bigint generated always as identity primary key,
  alias text not null,
  actor_id uuid,
  action text not null,
  reason text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
create table hq_short_private.rate_limit (
  id boolean primary key default true check (id),
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
insert into hq_short_private.rate_limit(id) values(true);
alter table hq_short_private.credentials enable row level security;
alter table hq_short_private.events enable row level security;
alter table hq_short_private.rate_limit enable row level security;
revoke all on all tables in schema hq_short_private from public, anon, authenticated;

create function public.hq_short_verify(p_alias text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c hq_short_private.credentials%rowtype; r hq_short_private.rate_limit%rowtype;
  email_value text;
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into r from hq_short_private.rate_limit where id for update;
  if r.window_start < now() - interval '1 minute' then
    update hq_short_private.rate_limit set window_start=now(), attempts=1 where id;
  elsif r.attempts >= 60 then return jsonb_build_object('ok',false);
  else update hq_short_private.rate_limit set attempts=attempts+1 where id;
  end if;
  if p_alias is null or p_alias !~ '^[a-z][a-z0-9]{1,31}$' or p_password is null
    or octet_length(p_password) > 72 or length(p_password) < 1 then
    return jsonb_build_object('ok',false);
  end if;
  select * into c from hq_short_private.credentials where alias=p_alias for update;
  if not found or not c.enabled or c.blocked_until > now() then
    return jsonb_build_object('ok',false);
  end if;
  if extensions.crypt(p_password,c.password_hash) is distinct from c.password_hash then
    update hq_short_private.credentials set
      failures=case when blocked_until <= now() then 1 else failures+1 end,
      blocked_until=case when (case when blocked_until <= now() then 1 else failures+1 end)>=5
        then now()+interval '15 minutes' else null end where alias=p_alias;
    insert into hq_short_private.events(alias,action,reason) values(p_alias,'login_failed','Invalid credential');
    return jsonb_build_object('ok',false);
  end if;
  select u.email into email_value from auth.users u join public.profiles p on p.id=u.id
    where u.id=c.user_id and p.is_active and p.role::text in
      ('ceo','coo','cfo','cso','supervisor','general_affairs','admin')
      and (u.banned_until is null or u.banned_until <= now()) and u.deleted_at is null
      and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified');
  if email_value is null then return jsonb_build_object('ok',false); end if;
  update hq_short_private.credentials set failures=0,blocked_until=null where alias=p_alias;
  return jsonb_build_object('ok',true,'user_id',c.user_id,'email',email_value,'version',c.version);
end $$;
revoke all on function public.hq_short_verify(text,text) from public,anon,authenticated;
grant execute on function public.hq_short_verify(text,text) to service_role;

create function public.hq_short_complete(p_alias text,p_version integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  update hq_short_private.credentials c set last_login_at=now() where alias=p_alias and enabled and version=p_version
    and exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=c.user_id
      and p.is_active and p.role::text in ('ceo','coo','cfo','cso','supervisor','general_affairs','admin')
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified'));
  if not found then return false; end if;
  insert into hq_short_private.events(alias,action,reason) values(p_alias,'login','Short login completed');
  return true;
end $$;
revoke all on function public.hq_short_complete(text,integer) from public,anon,authenticated;
grant execute on function public.hq_short_complete(text,integer) to service_role;

create function public.hq_short_list() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=(select auth.uid()) and is_active and role::text='coo') then
    raise exception 'COO only' using errcode='42501'; end if;
  return jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object(
    'alias',c.alias,'email',u.email,'name',p.full_name,'enabled',c.enabled,'last_login_at',c.last_login_at,
    'blocked_until',c.blocked_until,'version',c.version) order by c.alias)
    from hq_short_private.credentials c join auth.users u on u.id=c.user_id join public.profiles p on p.id=c.user_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select a.id,a.alias,a.action,a.reason,a.created_at,
      p.full_name as actor,a.before_state,a.after_state from hq_short_private.events a
      left join public.profiles p on p.id=a.actor_id order by a.id desc limit 100) e),'[]'::jsonb));
end $$;
revoke all on function public.hq_short_list() from public,anon;
grant execute on function public.hq_short_list() to authenticated;

create function public.hq_short_manage(p_alias text,p_action text,p_reason text,p_password text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c hq_short_private.credentials%rowtype; next_enabled boolean;
begin
  if not exists(select 1 from public.profiles where id=(select auth.uid()) and is_active and role::text='coo') then
    raise exception 'COO only' using errcode='42501'; end if;
  if p_reason is null or length(trim(p_reason)) < 2 or length(p_reason)>500 then raise exception '請填寫調整原因'; end if;
  select * into c from hq_short_private.credentials where alias=p_alias for update;
  if not found then raise exception '找不到短帳號'; end if;
  if p_action not in ('reset','enable','disable') or p_action is null then raise exception 'Invalid action'; end if;
  if p_action='reset' and (p_password is null or length(p_password)<8 or octet_length(p_password)>72) then
    raise exception '密碼需至少8字元，且不超過72位元組'; end if;
  next_enabled:=case p_action when 'enable' then true when 'disable' then false else c.enabled end;
  update hq_short_private.credentials set enabled=next_enabled,
    password_hash=case when p_action='reset' then extensions.crypt(p_password,extensions.gen_salt('bf',12)) else password_hash end,
    version=version+1,failures=0,blocked_until=null,updated_at=now() where alias=p_alias;
  insert into hq_short_private.events(alias,actor_id,action,reason,before_state,after_state)
    values(p_alias,auth.uid(),p_action,trim(p_reason),jsonb_build_object('enabled',c.enabled,'version',c.version),
      jsonb_build_object('enabled',next_enabled,'version',c.version+1));
end $$;
revoke all on function public.hq_short_manage(text,text,text,text) from public,anon;
grant execute on function public.hq_short_manage(text,text,text,text) to authenticated;
