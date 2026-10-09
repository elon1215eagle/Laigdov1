do $$ begin if md5(pg_get_functiondef('public.ops_transfer_api(text,jsonb)'::regprocedure)) <> '34b6cd3fbf7315b806e27d6b14470e93' then raise exception 'Unexpected transfer API baseline'; end if; end $$;
-- Independent dispatch ledger. Existing transfer requests remain authoritative.
create schema ops_delivery_private;
revoke all on schema ops_delivery_private from public, anon, authenticated;
create table ops_delivery_private.drivers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 40),
 active boolean not null default true, version integer not null default 1
);
create unique index on ops_delivery_private.drivers(lower(name));
create table ops_delivery_private.tasks (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references ops_transfer_private.requests(id),
 driver_id uuid not null references ops_delivery_private.drivers(id), delivery_date date not null,
 position integer not null check(position between 1 and 9999), version integer not null default 1,
 state text not null default 'planned' check(state in ('planned','picked','delivered','cancelled')),
 picked_at timestamptz, delivered_at timestamptz, created_at timestamptz not null default now()
);
create unique index on ops_delivery_private.tasks(request_id) where state <> 'cancelled';
create index on ops_delivery_private.tasks(delivery_date,driver_id,position);
create table ops_delivery_private.events (
 id bigint generated always as identity primary key, task_id uuid references ops_delivery_private.tasks(id),
 actor_id uuid not null, actor_name text not null, action text not null, reason text not null,
 before_state jsonb, after_state jsonb not null, created_at timestamptz not null default now()
);
create table ops_delivery_private.commands (
 id uuid primary key, actor_id uuid not null, hash text not null, response jsonb not null
);
alter table ops_delivery_private.drivers enable row level security;
alter table ops_delivery_private.tasks enable row level security;
alter table ops_delivery_private.events enable row level security;
alter table ops_delivery_private.commands enable row level security;
revoke all on all tables in schema ops_delivery_private from public,anon,authenticated;

create function public.ops_delivery_api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a jsonb := ops_transfer_private.actor(); h boolean := (a->>'is_hq')::boolean;
 t ops_delivery_private.tasks; r ops_transfer_private.requests; d ops_delivery_private.drivers;
 cid uuid; result jsonb; old jsonb; ph text; rid uuid; dt date;
 reason text := trim(coalesce(p_payload->>'reason',''));
begin
 if length(p_payload::text)>20000 then raise exception '內容過大'; end if;
 if p_action='day' then
  dt := (p_payload->>'date')::date;
  if dt is null then raise exception '請選擇日期'; end if;
  return jsonb_build_object(
   'drivers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from ops_delivery_private.drivers x
    where h or exists(select 1 from ops_delivery_private.tasks y join ops_transfer_private.requests z on z.id=y.request_id
      where y.driver_id=x.id and y.delivery_date=dt and a->>'store' in(z.sender,z.receiver))),
   'tasks',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('driver_name',y.name,'request',to_jsonb(z)) order by x.position,x.created_at,x.id),'[]')
    from ops_delivery_private.tasks x join ops_delivery_private.drivers y on y.id=x.driver_id
    join ops_transfer_private.requests z on z.id=x.request_id
    where x.delivery_date=dt and (h or a->>'store' in(z.sender,z.receiver))),
   'candidates',case when h then (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]') from ops_transfer_private.requests x
     where x.status in('requested','shipped') and not exists(select 1 from ops_delivery_private.tasks y where y.request_id=x.id and y.state<>'cancelled')) else '[]'::jsonb end);
 elsif p_action='history' then
  select * into t from ops_delivery_private.tasks where id=(p_payload->>'id')::uuid;
  select * into r from ops_transfer_private.requests where id=t.request_id;
  if r.id is null or not(h or a->>'store' in(r.sender,r.receiver)) then raise exception '無權查看'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from ops_delivery_private.events e where e.task_id=t.id);
 end if;
 cid := (p_payload->>'command_id')::uuid;
 if cid is null then raise exception '缺少請求編號'; end if;
 ph := md5(p_action||p_payload::text);
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select response into result from ops_delivery_private.commands where id=cid and actor_id=(a->>'id')::uuid and hash=ph;
 if found then return result; end if;
 if exists(select 1 from ops_delivery_private.commands where id=cid) then raise exception '請求編號已使用'; end if;
 if p_action='driver' then
  if not h then raise exception '僅總部可管理送貨人員'; end if;
  if reason='' then raise exception '請填寫調整原因'; end if;
  if trim(coalesce(p_payload->>'name',''))='' then raise exception '請填寫姓名'; end if;
  if nullif(p_payload->>'id','') is null then
   insert into ops_delivery_private.drivers(name) values(trim(p_payload->>'name')) returning * into d;
  else
   select * into d from ops_delivery_private.drivers where id=(p_payload->>'id')::uuid for update;
   if d.id is null or d.version is distinct from (p_payload->>'version')::int then raise exception '人員資料已更新，請重新載入'; end if;
   old := to_jsonb(d);
   update ops_delivery_private.drivers set name=trim(p_payload->>'name'),active=coalesce((p_payload->>'active')::boolean,active),version=version+1 where id=d.id returning * into d;
  end if;
  result:=to_jsonb(d);
 else
  if p_action not in('assign','edit','cancel','pick','deliver') then raise exception '不支援的操作'; end if;
  if p_action in('assign','edit','cancel') and not h then raise exception '僅總部可安排配送'; end if;
  if reason='' then raise exception '請填寫操作原因'; end if;
  if p_action='assign' then
   rid := (p_payload->>'request_id')::uuid;
  else
   select request_id into rid from ops_delivery_private.tasks where id=(p_payload->>'id')::uuid;
  end if;
  -- Lock the source before the task, so duplicate dispatch and business updates serialize.
  select * into r from ops_transfer_private.requests where id=rid for update;
  if r.id is null or not(h or a->>'store' in(r.sender,r.receiver)) then raise exception '無權操作'; end if;
  if p_action<>'assign' then
   select * into t from ops_delivery_private.tasks where id=(p_payload->>'id')::uuid for update;
   if t.version is distinct from (p_payload->>'version')::int then raise exception '配送資料已更新，請重新載入；輸入尚未送出'; end if;
   old := to_jsonb(t);
  end if;
  if p_action<>'cancel' and r.version is distinct from (p_payload->>'request_version')::int then raise exception '調貨單已更新，請重新核對品項及數量'; end if;
  if p_action in('assign','edit') then
   if r.status not in('requested','shipped') then raise exception '此調貨單不可安排配送'; end if;
   if p_action='edit' and t.state<>'planned' then raise exception '已取貨不可改期或換人'; end if;
   perform 1 from ops_delivery_private.drivers where id=(p_payload->>'driver_id')::uuid and active for update;
   if not found then raise exception '請選擇啟用的送貨人員'; end if;
   dt := (p_payload->>'date')::date;
   if dt is null then raise exception '請選擇日期'; end if;
   if p_action='assign' then
    if exists(select 1 from ops_delivery_private.tasks where request_id=r.id and state<>'cancelled') then raise exception '此單已有配送安排'; end if;
    insert into ops_delivery_private.tasks(request_id,driver_id,delivery_date,position)
    values(r.id,(p_payload->>'driver_id')::uuid,dt,(p_payload->>'position')::int) returning * into t;
   else
    update ops_delivery_private.tasks set driver_id=(p_payload->>'driver_id')::uuid,delivery_date=dt,position=(p_payload->>'position')::int,version=version+1 where id=t.id returning * into t;
   end if;
  elsif p_action='cancel' then
   if t.state<>'planned' then raise exception '僅未取貨的配送可取消'; end if;
   update ops_delivery_private.tasks set state='cancelled',version=version+1 where id=t.id returning * into t;
  elsif p_action='pick' then
   if not(h or a->>'store'=r.sender) then raise exception '僅出貨店或總部可確認取貨'; end if;
   if t.state<>'planned' or r.status<>'shipped' then raise exception '須先在原調貨單確認出貨，再確認取貨'; end if;
   update ops_delivery_private.tasks set state='picked',picked_at=now(),version=version+1 where id=t.id returning * into t;
  elsif p_action='deliver' then
   if not(h or a->>'store'=r.receiver) then raise exception '僅收貨店或總部可確認送達'; end if;
   if t.state<>'picked' or r.status not in('shipped','disputed','completed') then raise exception '須先取貨才能確認送達'; end if;
   update ops_delivery_private.tasks set state='delivered',delivered_at=now(),version=version+1 where id=t.id returning * into t;
  end if;
  result := to_jsonb(t);
 end if;
 insert into ops_delivery_private.events(task_id,actor_id,actor_name,action,reason,before_state,after_state)
 values(t.id,(a->>'id')::uuid,a->>'name',p_action,reason,old,
   case when p_action='driver' then result else result||jsonb_build_object('source_version',r.version,'source_data',r.data) end);
 insert into ops_delivery_private.commands values(cid,(a->>'id')::uuid,ph,result);
 return result;
end $$;
revoke all on function public.ops_delivery_api(text,jsonb) from public,anon;
grant execute on function public.ops_delivery_api(text,jsonb) to authenticated;
