create or replace function ops_transfer_private.actor() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p record; h boolean; delivery boolean;
begin
 select pr.id,pr.full_name,pr.role::text role,s.store_code into p
 from public.profiles pr left join public.stores s on s.id=pr.store_id
 where pr.id=auth.uid() and pr.is_active;
 if not found then raise exception '請以營運 APP 授權帳號登入'; end if;
 h := p.role = any(array['ceo','coo','cfo','cso','general_affairs','admin','hq','supervisor']);
 delivery := p.role='delivery_specialist';
 if not h and not delivery and (p.role<>'store_manager' or coalesce(p.store_code,'') !~ '^S(0[1-9]|1[01])$') then
   raise exception '調貨中心目前僅開放直營門店、送貨專員及總部';
 end if;
 return jsonb_build_object('id',p.id,'name',coalesce(p.full_name,p.role),'role',p.role,'store',p.store_code,'is_hq',h,'is_delivery',delivery);
end $$;

revoke all on function ops_transfer_private.actor() from public,anon,authenticated;
grant execute on function ops_transfer_private.actor() to authenticated;

create or replace function public.ops_delivery_worker_api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a jsonb := ops_transfer_private.actor();
 t ops_delivery_private.tasks; r ops_transfer_private.requests;
 cid uuid; result jsonb; old jsonb; ph text; rid uuid; dt date;
 reason text := trim(coalesce(p_payload->>'reason',''));
begin
 if coalesce((a->>'is_delivery')::boolean,false) is not true then
   raise exception '僅送貨專員可使用此介面' using errcode='42501';
 end if;
 if length(p_payload::text)>20000 then raise exception '內容過大'; end if;

 if p_action='day' then
  dt := (p_payload->>'date')::date;
  if dt is null then raise exception '請選擇日期'; end if;
  return jsonb_build_object(
   'drivers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from ops_delivery_private.drivers x
     where x.active or exists(select 1 from ops_delivery_private.tasks y where y.driver_id=x.id and y.delivery_date=dt)),
   'tasks',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('driver_name',y.name,'request',to_jsonb(z)) order by x.position,x.created_at,x.id),'[]')
     from ops_delivery_private.tasks x join ops_delivery_private.drivers y on y.id=x.driver_id
     join ops_transfer_private.requests z on z.id=x.request_id
     where x.delivery_date=dt),
   'candidates','[]'::jsonb);
 elsif p_action='history' then
  select * into t from ops_delivery_private.tasks where id=(p_payload->>'id')::uuid;
  if t.id is null then raise exception '找不到配送紀錄'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from ops_delivery_private.events e where e.task_id=t.id);
 end if;

 if p_action not in('pick','deliver') then raise exception '送貨專員僅可確認已取或已送'; end if;
 cid := (p_payload->>'command_id')::uuid;
 if cid is null then raise exception '缺少請求編號'; end if;
 if reason='' then raise exception '請填寫操作原因'; end if;
 ph := md5(p_action||p_payload::text);
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select response into result from ops_delivery_private.commands where id=cid and actor_id=(a->>'id')::uuid and hash=ph;
 if found then return result; end if;
 if exists(select 1 from ops_delivery_private.commands where id=cid) then raise exception '請求編號已使用'; end if;

 select request_id into rid from ops_delivery_private.tasks where id=(p_payload->>'id')::uuid;
 select * into r from ops_transfer_private.requests where id=rid for update;
 if r.id is null then raise exception '找不到調貨單'; end if;
 select * into t from ops_delivery_private.tasks where id=(p_payload->>'id')::uuid for update;
 if t.id is null then raise exception '找不到配送安排'; end if;
 if t.version is distinct from (p_payload->>'version')::int then raise exception '配送資料已更新，請重新載入；輸入尚未送出'; end if;
 old := to_jsonb(t);
 if r.version is distinct from (p_payload->>'request_version')::int then raise exception '調貨單已更新，請重新核對品項及數量'; end if;

 if p_action='pick' then
  if t.state<>'planned' or r.status<>'shipped' then raise exception '須先由出貨店確認出貨，再確認取貨'; end if;
  update ops_delivery_private.tasks set state='picked',picked_at=now(),version=version+1 where id=t.id returning * into t;
 else
  if t.state<>'picked' or r.status not in('shipped','disputed','completed') then raise exception '須先取貨才能確認送達'; end if;
  update ops_delivery_private.tasks set state='delivered',delivered_at=now(),version=version+1 where id=t.id returning * into t;
 end if;

 result := to_jsonb(t);
 insert into ops_delivery_private.events(task_id,actor_id,actor_name,action,reason,before_state,after_state)
 values(t.id,(a->>'id')::uuid,a->>'name',p_action,reason,old,
   result||jsonb_build_object('source_version',r.version,'source_data',r.data));
 insert into ops_delivery_private.commands values(cid,(a->>'id')::uuid,ph,result);
 return result;
end $$;

revoke all on function public.ops_delivery_worker_api(text,jsonb) from public,anon;
grant execute on function public.ops_delivery_worker_api(text,jsonb) to authenticated;

create or replace function public.hq_short_verify(p_alias text, p_password text)
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
      ('ceo','coo','cfo','cso','supervisor','general_affairs','admin','delivery_specialist')
      and (u.banned_until is null or u.banned_until <= now()) and u.deleted_at is null
      and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified');
  if email_value is null then return jsonb_build_object('ok',false); end if;
  update hq_short_private.credentials set failures=0,blocked_until=null where alias=p_alias;
  return jsonb_build_object('ok',true,'user_id',c.user_id,'email',email_value,'version',c.version);
end $$;
revoke all on function public.hq_short_verify(text,text) from public,anon,authenticated;
grant execute on function public.hq_short_verify(text,text) to service_role;

create or replace function public.hq_short_complete(p_alias text,p_version integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  update hq_short_private.credentials c set last_login_at=now() where alias=p_alias and enabled and version=p_version
    and exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=c.user_id
      and p.is_active and p.role::text in ('ceo','coo','cfo','cso','supervisor','general_affairs','admin','delivery_specialist')
      and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
      and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified'));
  if not found then return false; end if;
  insert into hq_short_private.events(alias,action,reason) values(p_alias,'login','Short login completed');
  return true;
end $$;
revoke all on function public.hq_short_complete(text,integer) from public,anon,authenticated;
grant execute on function public.hq_short_complete(text,integer) to service_role;
