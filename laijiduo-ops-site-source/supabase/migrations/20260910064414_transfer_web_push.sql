-- Additive notification storage; no triggers or writes to business/Auth tables.
create schema ops_push_private;
revoke all on schema ops_push_private from public,anon,authenticated;
create table ops_push_private.devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 session_id uuid not null, store text not null check(store ~ '^S(0[1-9]|1[01])$'),
 label text not null, endpoint text not null unique, subscription jsonb not null,
 active boolean not null default true, generation integer not null default 1,
 bound_at timestamptz not null default now(), last_seen timestamptz not null default now(),
 last_sent timestamptz, last_error text
);
create table ops_push_private.audit (
 id bigint generated always as identity primary key, device_id uuid not null,
 actor_id uuid, action text not null, reason text not null default '', created_at timestamptz not null default now()
);
create table ops_push_private.jobs (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references ops_push_private.devices(id),
 generation integer not null, request_id uuid not null, version integer not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0, next_at timestamptz not null default now(),
 lease uuid, leased_at timestamptz, last_error text, created_at timestamptz not null default now(),
 unique(device_id,generation,request_id,version)
);
create index on ops_push_private.jobs(state,next_at);
alter table ops_push_private.devices enable row level security;
alter table ops_push_private.audit enable row level security;
alter table ops_push_private.jobs enable row level security;
revoke all on all tables in schema ops_push_private from public,anon,authenticated;

create function ops_push_private.valid_device(d ops_push_private.devices) returns boolean
language sql stable security definer set search_path='' as $$
 select d.active and exists (
  select 1 from public.profiles p left join public.stores s on s.id=p.store_id
  join auth.sessions se on se.id=d.session_id and se.user_id=p.id
  join auth.users u on u.id=p.id
  where p.id=d.user_id and p.is_active and (se.not_after is null or se.not_after>now())
  and (u.banned_until is null or u.banned_until<=now())
  and (p.role::text=any(array['ceo','coo','cfo','cso','general_affairs','admin','hq','supervisor'])
       or (p.role::text='store_manager' and s.store_code=d.store)))
$$;
create function ops_push_private.actionable(r ops_transfer_private.requests,s text) returns boolean
language sql immutable set search_path='' as $$
 select (r.status='requested' and r.sender=s) or (r.status='shipped' and r.receiver=s)
 or (r.status='disputed' and ((coalesce(r.data->>'resolution','')='' and r.sender=s)
 or (coalesce(r.data->>'resolution','')<>'' and (
  (r.sender=s and not coalesce((r.data->>'sender_ack')::boolean,false)) or
  (r.receiver=s and not coalesce((r.data->>'receiver_ack')::boolean,false))))))
$$;

create function public.ops_push_devices(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb:=ops_transfer_private.actor(); d ops_push_private.devices; sid uuid;
 ep text:=p_payload->'subscription'->>'endpoint'; st text; result jsonb; reason text;
begin
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(v) order by v.store,v.last_seen desc),'[]') into result from (
   select x.id,x.store,x.label,x.active,ops_push_private.valid_device(x) as eligible,
    x.last_seen,x.last_sent,x.last_error,x.bound_at
   from ops_push_private.devices x where (a->>'is_hq')::boolean or x.user_id=auth.uid()
   order by x.store,x.last_seen desc,x.id limit 100 offset greatest(0,coalesce((p_payload->>'offset')::integer,0))
  ) v;
  return result;
 elsif p_action='register' then
  sid:=(auth.jwt()->>'session_id')::uuid;
  if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid() and (not_after is null or not_after>now())) then raise exception '請重新登入後啟用通知'; end if;
  st:=case when (a->>'is_hq')::boolean then p_payload->>'store' else a->>'store' end;
  if st is null or st !~ '^S(0[1-9]|1[01])$' then raise exception '請選擇通知門店'; end if;
  if ep is null or length(ep)>2048 or ep !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com)/[^[:space:]]+$'
   or coalesce(p_payload->'subscription'->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}=?$'
   or coalesce(p_payload->'subscription'->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}==?$' and coalesce(p_payload->'subscription'->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}$'
  then raise exception '不支援的通知訂閱'; end if;
  if length(trim(coalesce(p_payload->>'label','')))=0 or length(p_payload->>'label')>60 then raise exception '請填寫裝置名稱（60字內）'; end if;
  perform pg_advisory_xact_lock(hashtext('push-user:'||auth.uid()::text));
  perform pg_advisory_xact_lock(hashtext(ep));
  select * into d from ops_push_private.devices where endpoint=ep for update;
  if found and d.user_id<>auth.uid() then raise exception '此瀏覽器已綁定其他帳號，請先關閉舊訂閱'; end if;
  if d.id is null then
   if (select count(*) from ops_push_private.devices where user_id=auth.uid() and active)>=50 then raise exception '啟用裝置過多，請由總部整理'; end if;
   insert into ops_push_private.devices(user_id,session_id,store,label,endpoint,subscription)
   values(auth.uid(),sid,st,trim(p_payload->>'label'),ep,p_payload->'subscription') returning * into d;
  else
   update ops_push_private.devices set session_id=sid,store=st,label=trim(p_payload->>'label'),
    subscription=p_payload->'subscription',active=true,last_error=null,last_seen=now(),
    bound_at=case when not active or session_id<>sid or store<>st then now() else bound_at end,
    generation=generation+case when not active or session_id<>sid or store<>st then 1 else 0 end
   where id=d.id returning * into d;
  end if;
  insert into ops_push_private.audit(device_id,actor_id,action) values(d.id,auth.uid(),'register');
  return jsonb_build_object('id',d.id,'store',d.store,'active',d.active);
 elsif p_action='revoke' then
  reason:=trim(coalesce(p_payload->>'reason',''));
  if length(reason)=0 or length(reason)>200 then raise exception '請填寫停用原因（200字內）'; end if;
  update ops_push_private.devices set active=false,generation=generation+1
  where id=(p_payload->>'id')::uuid and ((a->>'is_hq')::boolean or user_id=auth.uid()) returning * into d;
  if not found then raise exception '找不到可管理的裝置'; end if;
  insert into ops_push_private.audit(device_id,actor_id,action,reason) values(d.id,auth.uid(),'revoke',reason);
  return jsonb_build_object('ok',true);
 elsif p_action='touch' then
  update ops_push_private.devices set last_seen=now() where id=(p_payload->>'id')::uuid and user_id=auth.uid()
   and session_id=(auth.jwt()->>'session_id')::uuid and ops_push_private.valid_device(devices) returning * into d;
  return jsonb_build_object('active',d.id is not null,'store',d.store);
 end if;
 raise exception '不支援的裝置操作';
end $$;
revoke all on function public.ops_push_devices(text,jsonb) from public,anon;
grant execute on function public.ops_push_devices(text,jsonb) to authenticated;

-- Workers poll current actionable snapshots, not the business write path.
create function public.ops_push_work(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; j ops_push_private.jobs; outcome text:=p_payload->>'outcome';
begin
 if p_action='claim' then
  insert into ops_push_private.jobs(device_id,generation,request_id,version)
  select d.id,d.generation,r.id,r.version from ops_push_private.devices d
  join ops_transfer_private.requests r on r.updated_at>=d.bound_at and ops_push_private.actionable(r,d.store)
  where ops_push_private.valid_device(d) on conflict do nothing;
  update ops_push_private.jobs q set state='skipped',lease=null
  where q.state in ('pending','sending') and not exists (
   select 1 from ops_push_private.devices d join ops_transfer_private.requests r on r.id=q.request_id
   where d.id=q.device_id and d.generation=q.generation and ops_push_private.valid_device(d)
    and r.version=q.version and ops_push_private.actionable(r,d.store));
  update ops_push_private.jobs set state='failed',last_error='retry_limit',lease=null
   where state='sending' and leased_at<now()-interval '5 minutes' and attempts>=5;
  with selected as (
   select id from ops_push_private.jobs where attempts<5 and
   ((state='pending' and next_at<=now()) or (state='sending' and leased_at<now()-interval '5 minutes'))
   order by created_at,id for update skip locked limit 25
  ), leased as (
   update ops_push_private.jobs q set state='sending',attempts=attempts+1,leased_at=now(),lease=gen_random_uuid()
   from selected s where q.id=s.id returning q.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'lease',q.lease,'subscription',d.subscription,
    'request_id',r.id,'number',r.number,'status',r.status,'store',d.store)),'[]') into result
   from leased q join ops_push_private.devices d on d.id=q.device_id join ops_transfer_private.requests r on r.id=q.request_id;
  return result;
 elsif p_action='check' then
  return to_jsonb(exists(select 1 from ops_push_private.jobs q join ops_push_private.devices d on d.id=q.device_id
   join ops_transfer_private.requests r on r.id=q.request_id where q.id=(p_payload->>'id')::uuid
   and q.lease=(p_payload->>'lease')::uuid and q.state='sending' and d.generation=q.generation
   and ops_push_private.valid_device(d) and r.version=q.version and ops_push_private.actionable(r,d.store)));
 elsif p_action='finish' then
  if outcome is null or outcome not in ('sent','retry','expired','failed','skipped') then raise exception 'Invalid outcome'; end if;
  select * into j from ops_push_private.jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and state='sending' for update;
  if not found then return jsonb_build_object('ok',false); end if;
  update ops_push_private.jobs set state=case when outcome='retry' and attempts<5 then 'pending' when outcome='retry' or outcome='expired' then 'failed' else outcome end,
   next_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),lease=null,
   last_error=case when outcome='sent' then null else outcome end where id=j.id;
  update ops_push_private.devices set last_sent=case when outcome='sent' then now() else last_sent end,
   last_error=case when outcome='sent' then null else outcome end,
   active=case when outcome='expired' then false else active end
  where id=j.device_id and generation=j.generation;
  if outcome='expired' then insert into ops_push_private.audit(device_id,action,reason) values(j.device_id,'expired','push_service_expired'); end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Invalid worker action';
end $$;
revoke all on function public.ops_push_work(text,jsonb) from public,anon,authenticated;
grant execute on function public.ops_push_work(text,jsonb) to service_role;
revoke all on all functions in schema ops_push_private from public,anon,authenticated;
