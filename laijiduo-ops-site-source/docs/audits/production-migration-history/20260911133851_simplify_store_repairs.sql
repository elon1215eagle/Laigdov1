alter table ops_repair_private.tickets add column handling_method text not null default 'headquarters'
 check(handling_method in('headquarters','store'));

create function public.ops_repair_simple_api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb:=ops_repair_private.actor(); h boolean:=(a->>'manageRepairs')::boolean;
 t ops_repair_private.tickets; c ops_repair_private.commands; old jsonb; cid uuid; answer jsonb;
 photo jsonb; method text:=coalesce(p_payload->>'handling_method','headquarters');
 note text:=trim(coalesce(p_payload->>'note','')); manifest jsonb:=coalesce(p_payload->'photo_manifest','[]');
begin
 if p_action in('list','detail') then return public.ops_repair_api(p_action,p_payload); end if;
 if p_action is null or p_action not in('prepare','save','reopen','withdraw') then raise exception '不支援的操作'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>30000 then raise exception '資料格式不正確'; end if;
 cid:=(p_payload->>'command_id')::uuid;
 if cid is null then raise exception '缺少請求編號'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select * into c from ops_repair_private.commands where id=cid;
 if found then
  if c.actor_id<>(a->>'id')::uuid or c.action<>'simple_'||p_action or c.payload<>p_payload then raise exception '請求編號已使用'; end if;
  return c.response;
 end if;
 if p_payload->>'id' is not null then
  select * into t from ops_repair_private.tickets where id=(p_payload->>'id')::uuid for update;
  if t.id is null or not coalesce(h or t.store=a->>'store',false) then raise exception '無權操作此門店報修'; end if;
  if t.version is distinct from (p_payload->>'version')::integer then raise exception '資料已更新，請重新載入；原輸入已保留'; end if;
  if t.status='withdrawn' then raise exception '已撤銷報修不可修改'; end if;
  old:=to_jsonb(t);
 elsif p_action<>'prepare' then raise exception '報修單不存在';
 end if;
 if p_action in('prepare','save') then
  if method not in('headquarters','store') then raise exception '請選擇處理方式'; end if;
  if coalesce(p_payload->>'description','')='' or length(p_payload->>'description')>2000 then raise exception '請填寫問題說明'; end if;
  if coalesce(p_payload->>'cost','')<>'' and p_payload->>'cost' !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then raise exception '費用最多兩位小數且不可為負數'; end if;
  if length(coalesce(p_payload->>'vendor',''))>200 or length(coalesce(p_payload->>'assignee',''))>100 then raise exception '處理資料過長'; end if;
  if coalesce((p_payload->>'completed')::boolean,false) and length(trim(coalesce(p_payload->>'result',''))) not between 1 and 2000 then raise exception '請填寫維修結果'; end if;
  if t.id is not null and method<>t.handling_method and length(note) not between 1 and 2000 then raise exception '變更處理方式請填寫原因'; end if;
 end if;
 if p_action='prepare' then
  if jsonb_typeof(manifest)<>'array' or jsonb_array_length(manifest)>15 then raise exception '照片清單不正確'; end if;
  if t.id is null then
   if not h and p_payload->>'store' is distinct from a->>'store' then raise exception '不可跨店回報'; end if;
   if not exists(select 1 from public.stores where store_code=p_payload->>'store' and is_active) then raise exception '門店未啟用'; end if;
   insert into ops_repair_private.tickets(store,category,description,urgency,contact,phone,created_by,handling_method)
    values(p_payload->>'store',p_payload->>'category',trim(p_payload->>'description'),p_payload->>'urgency',coalesce(p_payload->>'contact',''),coalesce(p_payload->>'phone',''),(a->>'id')::uuid,method) returning * into t;
  else
   update ops_repair_private.tickets set version=version+1,updated_at=now() where id=t.id returning * into t;
  end if;
  for photo in select value from jsonb_array_elements(manifest) loop
   if coalesce(photo->>'purpose','') not in('report','completion','receipt') then raise exception '照片類別不正確'; end if;
   if (select count(*) from ops_repair_private.attachments where ticket_id=t.id and purpose=photo->>'purpose')>=5 then raise exception '每類照片最多 5 張'; end if;
   insert into ops_repair_private.attachments(id,ticket_id,owner_id,name,mime,size,fingerprint,path,purpose)
   values((photo->>'id')::uuid,t.id,(a->>'id')::uuid,photo->>'name',photo->>'mime',(photo->>'size')::bigint,photo->>'fingerprint',t.id::text||'/'||(photo->>'id'),photo->>'purpose');
  end loop;
  note:=case when old is null then '新增報修' else '登記待保存附件' end;
 elsif p_action='save' then
  if exists(select 1 from ops_repair_private.attachments where ticket_id=t.id and state<>'available') then raise exception '照片尚未完成，請接續原單上傳'; end if;
  if t.status='completed' and not coalesce((p_payload->>'completed')::boolean,false) then raise exception '重新處理請使用仍有問題並填原因'; end if;
  update ops_repair_private.tickets set category=p_payload->>'category',description=trim(p_payload->>'description'),urgency=p_payload->>'urgency',
   contact=coalesce(p_payload->>'contact',''),phone=coalesce(p_payload->>'phone',''),handling_method=method,
   assignee=coalesce(p_payload->>'assignee',''),vendor=coalesce(p_payload->>'vendor',''),due_date=nullif(p_payload->>'due_date','')::date,
   cost=nullif(p_payload->>'cost','')::numeric,cost_note=coalesce(p_payload->>'cost_note',''),result=coalesce(p_payload->>'result',''),
   status=case when coalesce((p_payload->>'completed')::boolean,false) then 'completed' else 'pending' end,
   version=version+1,updated_at=now() where id=t.id returning * into t;
  note:=coalesce(nullif(note,''),case when t.status='completed' then '儲存並完成' else '儲存報修資料' end);
 else
  if length(note) not between 1 and 2000 then raise exception '請填寫原因'; end if;
  if p_action='reopen' and t.status<>'completed' then raise exception '只有已處理案件可重新處理'; end if;
  if p_action='withdraw' and t.status='completed' then raise exception '已處理案件不可撤銷'; end if;
  update ops_repair_private.tickets set status=case when p_action='reopen' then 'pending' else 'withdrawn' end,version=version+1,updated_at=now() where id=t.id returning * into t;
 end if;
 answer:=to_jsonb(t);
 insert into ops_repair_private.events(ticket_id,actor_id,actor_name,actor_role,action,note,before_state,after_state)
 values(t.id,(a->>'id')::uuid,a->>'name',a->>'role','simple_'||p_action,note,old,answer);
 insert into ops_repair_private.commands(id,actor_id,payload,action,response) values(cid,(a->>'id')::uuid,p_payload,'simple_'||p_action,answer);
 return answer;
end $$;
revoke all on function public.ops_repair_simple_api(text,jsonb) from public,anon;
grant execute on function public.ops_repair_simple_api(text,jsonb) to authenticated;

create or replace function public.ops_repair_photo_api(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb:=ops_repair_private.actor(); h boolean:=(a->>'manageRepairs')::boolean; purpose text:=coalesce(p_payload->>'purpose','report');
 t ops_repair_private.tickets; f ops_repair_private.attachments; meta jsonb; answer jsonb;
begin
 if p_action='confirm' then raise exception '照片須經後端安全驗證'; end if;
 if p_action is null or p_action not in('reserve','confirm','list') then raise exception '不支援的照片操作'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>3000 then raise exception '照片資料不正確'; end if;
 select * into t from ops_repair_private.tickets where id=(p_payload->>'ticketId')::uuid for update;
 if t.id is null or not(h or t.store=a->>'store') then raise exception '無權操作照片'; end if;
 if p_action='list' then
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]') from ops_repair_private.attachments x where x.ticket_id=t.id);
 end if;
 if purpose not in('report','completion','receipt') then raise exception '無權新增此類單據'; end if;
 select * into f from ops_repair_private.attachments where id=(p_payload->>'id')::uuid;
 if found then
  if f.ticket_id<>t.id or f.owner_id<>(a->>'id')::uuid or f.fingerprint is distinct from p_payload->>'fingerprint' or f.purpose<>purpose then raise exception '照片識別不符'; end if;
  if p_action='reserve' and (f.name is distinct from p_payload->>'name' or f.mime is distinct from p_payload->>'mime' or f.size is distinct from (p_payload->>'size')::bigint) then raise exception '照片內容不符'; end if;
 else
  if p_action<>'reserve' then raise exception '照片尚未登記'; end if;
  if t.status='withdrawn' then raise exception '已結案僅總部可補費用單據'; end if;
  if (select count(*) from ops_repair_private.attachments where ticket_id=t.id and attachments.purpose=coalesce(p_payload->>'purpose','report'))>=5 then raise exception '最多 5 張照片'; end if;
  insert into ops_repair_private.attachments(id,ticket_id,owner_id,name,mime,size,fingerprint,path,purpose)
  values((p_payload->>'id')::uuid,t.id,(a->>'id')::uuid,p_payload->>'name',p_payload->>'mime',(p_payload->>'size')::bigint,p_payload->>'fingerprint',t.id::text||'/'||(p_payload->>'id'),purpose) returning * into f;
 end if;
 if f.state='reserved' then
  select metadata into meta from storage.objects where bucket_id='ops-repair-photos' and name=f.path;
  if found then
   if meta->>'mimetype' is distinct from f.mime or (meta->>'size')::bigint is distinct from f.size then raise exception '儲存照片規格不符'; end if;
   if p_action='confirm' then
    update ops_repair_private.attachments set state='available',confirmed_at=now() where id=f.id returning * into f;
    insert into ops_repair_private.events(ticket_id,actor_id,actor_name,actor_role,action,note,before_state,after_state)
    values(t.id,(a->>'id')::uuid,a->>'name',a->>'role','photo_confirm','照片保存完成',null,jsonb_build_object('attachment',to_jsonb(f)));
   end if;
  elsif p_action='confirm' then raise exception '照片尚未上傳完成';
  end if;
 end if;
 answer:=to_jsonb(f);
 if p_action='reserve' and f.state='reserved' and meta is not null then answer:=answer||'{"state":"uploaded"}'::jsonb; end if;
 return answer;
end $$;
revoke all on function public.ops_repair_photo_api(text,jsonb) from public,anon;
grant execute on function public.ops_repair_photo_api(text,jsonb) to authenticated;

create or replace function public.ops_repair_photo_access(p_path text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a jsonb; result boolean;
begin
 begin a:=ops_repair_private.actor(); exception when others then return false; end;
 select true into result from ops_repair_private.attachments f join ops_repair_private.tickets t on t.id=f.ticket_id
 where f.path=p_path and ((a->>'manageRepairs')::boolean or t.store=a->>'store')
 and (not p_write or (f.owner_id=(a->>'id')::uuid and f.state='reserved'
  
  and t.status<>'withdrawn'));
 return coalesce(result,false);
end $$;
revoke all on function public.ops_repair_photo_access(text,boolean) from public,anon;
grant execute on function public.ops_repair_photo_access(text,boolean) to authenticated;
create or replace function public.ops_repair_verify_photo(p_id uuid,p_actor uuid,p_fingerprint text,p_mime text,p_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f ops_repair_private.attachments; t ops_repair_private.tickets; a jsonb; meta jsonb;
begin
 select * into f from ops_repair_private.attachments where id=p_id;
 if f.id is null or f.owner_id<>p_actor then raise exception '照片識別不符'; end if;
 select * into t from ops_repair_private.tickets where id=f.ticket_id for update;
 select * into f from ops_repair_private.attachments where id=p_id for update;
 select jsonb_build_object('name',p.full_name,'role',p.role,'store',s.store_code,
 'hq',p.role::text in('ceo','coo','cfo','cso','general_affairs','admin','hq','supervisor')) into a
 from public.profiles p left join public.stores s on s.id=p.store_id
 where p.id=p_actor and p.is_active=true;
 if a is null or not coalesce(((a->>'hq')::boolean or (a->>'role'='store_manager' and a->>'store'=t.store)),false) then raise exception '無權確認照片'; end if;
 if f.fingerprint is distinct from p_fingerprint or f.mime is distinct from p_mime or f.size is distinct from p_size then raise exception '照片內容驗證不符'; end if;
 if f.state='available' then return to_jsonb(f); end if;
 if t.status='withdrawn' then raise exception '目前狀態不可新增照片'; end if;
 select metadata into meta from storage.objects where bucket_id='ops-repair-photos' and name=f.path;
 if meta is null or meta->>'mimetype' is distinct from f.mime or (meta->>'size')::bigint is distinct from f.size then raise exception '照片尚未完整保存'; end if;
 update ops_repair_private.attachments set state='available',confirmed_at=now() where id=f.id returning * into f;
 insert into ops_repair_private.events(ticket_id,actor_id,actor_name,actor_role,action,note,before_state,after_state)
 values(t.id,p_actor,a->>'name',a->>'role','photo_confirm','照片保存完成',null,jsonb_build_object('attachment',to_jsonb(f)));
 return to_jsonb(f);
end $$;
revoke all on function public.ops_repair_verify_photo(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.ops_repair_verify_photo(uuid,uuid,text,text,bigint) to service_role;
