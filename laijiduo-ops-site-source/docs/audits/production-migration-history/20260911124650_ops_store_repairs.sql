-- Independent store repair module; no existing APP tables or accounts are modified.
create schema ops_repair_private;
revoke all on schema ops_repair_private from public,anon,authenticated;
create table ops_repair_private.tickets (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 store text not null check(store ~ '^S(0[1-9]|1[01])$'),
 category text not null check(category in('炸爐','冰箱','排煙','水電','其他')),
 description text not null check(length(trim(description)) between 1 and 2000),
 urgency text not null check(urgency in('normal','business','safety')),
 contact text not null default '' check(length(contact)<=100), phone text not null default '' check(length(phone)<=40),
 status text not null default 'pending' check(status in('pending','processing','awaiting_confirmation','completed','withdrawn')),
 version integer not null default 1, created_by uuid not null, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), assignee text not null default '', vendor text not null default '',
 due_date date, result text not null default '', cost numeric(12,2) check(cost>=0),
 cost_note text not null default '' check(length(cost_note)<=2000),
 expected_photos integer not null default 0 check(expected_photos between 0 and 5)
);
create index on ops_repair_private.tickets(store,status,created_at);
create table ops_repair_private.events (
 id bigint generated always as identity primary key, ticket_id uuid not null references ops_repair_private.tickets(id),
 actor_id uuid not null, actor_name text not null, actor_role text not null, action text not null, note text not null,
 before_state jsonb, after_state jsonb not null, created_at timestamptz not null default now()
);
create table ops_repair_private.commands (
 id uuid primary key, actor_id uuid not null, payload jsonb not null, action text not null, response jsonb not null
);
create index on ops_repair_private.events(ticket_id,id desc);
alter table ops_repair_private.tickets enable row level security;
alter table ops_repair_private.events enable row level security;
alter table ops_repair_private.commands enable row level security;
revoke all on all tables in schema ops_repair_private from public,anon,authenticated;

create function ops_repair_private.actor() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p record; h boolean;
begin
 select pr.id,pr.full_name,pr.role::text role,s.store_code into p
 from public.profiles pr left join public.stores s on s.id=pr.store_id
 where pr.id=auth.uid() and pr.is_active;
 if not found then raise exception '請以營運 APP 授權帳號登入'; end if;
 h:=p.role=any(array['ceo','coo','cfo','cso','general_affairs','admin','hq','supervisor']);
 if not h and (p.role<>'store_manager' or coalesce(p.store_code,'') !~ '^S(0[1-9]|1[01])$') then
  raise exception '未開放門店報修';
 end if;
 return jsonb_build_object('id',p.id,'name',coalesce(p.full_name,p.role),'role',p.role,'active',true,'manageRepairs',h,'store',case when h then null else p.store_code end);
end $$;
revoke all on function ops_repair_private.actor() from public,anon,authenticated;

create function public.ops_repair_api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb:=ops_repair_private.actor(); h boolean:=(a->>'manageRepairs')::boolean;
 t ops_repair_private.tickets; previous jsonb; response jsonb; c ops_repair_private.commands;
 cid uuid; target_store text; next_status text; photo jsonb; manifest jsonb:=coalesce(p_payload->'photo_manifest','[]'); note text:=trim(coalesce(p_payload->>'note',''));
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>15000 then raise exception '內容格式不正確'; end if;
 if p_action='list' then
  return jsonb_build_object('actor',a,'complete',true,
   'stores',(select coalesce(jsonb_agg(jsonb_build_object('code',s.store_code,'name',s.name) order by s.store_code),'[]') from public.stores s where s.is_active and s.store_code ~ '^S(0[1-9]|1[01])$' and (h or s.store_code=a->>'store')),
   'rows',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('storeName',s.name,'createdAt',x.created_at,
    'pendingPhotos',(select count(*) from ops_repair_private.attachments f where f.ticket_id=x.id and f.state<>'available'),
    'lastHandling',(select jsonb_build_object('name',e.actor_name,'role',e.actor_role,'at',e.created_at) from ops_repair_private.events e where e.ticket_id=x.id and e.action in('start','update_work','finish') order by e.id desc limit 1)) order by x.created_at desc,x.id),'[]') from ops_repair_private.tickets x left join public.stores s on s.store_code=x.store where h or x.store=a->>'store'));
 end if;
 if p_action='detail' then
  select * into t from ops_repair_private.tickets where id=(p_payload->>'id')::uuid;
  if t.id is null or not(h or t.store=a->>'store') then raise exception '無權查看'; end if;
  return jsonb_build_object('ticket',to_jsonb(t),'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from ops_repair_private.events e where e.ticket_id=t.id));
 end if;
 if p_action is null or p_action not in('create','start','update_work','update_cost','finish','confirm','reject','withdraw','comment') then raise exception '不支援的操作'; end if;
 cid:=(p_payload->>'command_id')::uuid;
 if cid is null then raise exception '缺少請求編號'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select * into c from ops_repair_private.commands where id=cid;
 if found then
  if c.actor_id<>(a->>'id')::uuid or c.payload<>p_payload or c.action<>p_action then raise exception '請求編號已使用'; end if;
  return c.response;
 end if;
 if p_action='create' then
  target_store:=case when h then p_payload->>'store' else a->>'store' end;
  if not h and p_payload->>'store' is distinct from target_store then raise exception '不可跨店回報'; end if;
  if not exists(select 1 from public.stores where store_code=target_store and is_active) then raise exception '門店未啟用'; end if;
  -- Reject files until verified storage registration is implemented; never drop attachments silently.
  if coalesce(p_payload->'attachments','[]')<>'[]'::jsonb then raise exception '附件上傳尚未啟用'; end if;
  if jsonb_typeof(manifest)<>'array' or jsonb_array_length(manifest)>5 then raise exception '照片清單不正確'; end if;
  insert into ops_repair_private.tickets(store,category,description,urgency,contact,phone,created_by,expected_photos)
   values(target_store,p_payload->>'category',trim(p_payload->>'description'),p_payload->>'urgency',coalesce(p_payload->>'contact',''),coalesce(p_payload->>'phone',''),(a->>'id')::uuid,jsonb_array_length(manifest)) returning * into t;
  for photo in select value from jsonb_array_elements(manifest) loop
   insert into ops_repair_private.attachments(id,ticket_id,owner_id,name,mime,size,fingerprint,path)
    values((photo->>'id')::uuid,t.id,(a->>'id')::uuid,photo->>'name',photo->>'mime',(photo->>'size')::bigint,photo->>'fingerprint',t.id::text||'/'||(photo->>'id'));
  end loop;
  note:='新增報修';
 else
  select * into t from ops_repair_private.tickets where id=(p_payload->>'id')::uuid for update;
  if t.id is null or not(h or t.store=a->>'store') then raise exception '無權操作'; end if;
  if t.version is distinct from (p_payload->>'version')::integer then raise exception '資料已更新，請重新載入'; end if;
  if length(note) not between 1 and 2000 then raise exception '請填寫處理內容或原因'; end if;
  previous:=to_jsonb(t); next_status:=t.status;
  case p_action
   when 'start' then
    if not h or t.status<>'pending' then raise exception '不允許開始處理'; end if;
    if exists(select 1 from ops_repair_private.attachments where ticket_id=t.id and state<>'available') then raise exception '照片尚未完成，請先補齊'; end if;
    next_status:='processing';
   when 'update_work' then
    if not h or t.status<>'processing' then raise exception '不允許更新處理資料'; end if;
   when 'update_cost' then
    if not h or t.status not in('awaiting_confirmation','completed') then raise exception '不允許更新費用'; end if;
   when 'finish' then
    if not h or t.status<>'processing' then raise exception '不允許完成處理'; end if;
    if exists(select 1 from ops_repair_private.attachments where ticket_id=t.id and state<>'available') then raise exception '照片尚未完成，請先補齊'; end if;
    next_status:='awaiting_confirmation'; t.result:=note;
   when 'confirm' then
    if h or t.store is distinct from a->>'store' or t.status<>'awaiting_confirmation' then raise exception '僅門店可確認修復'; end if;
    if exists(select 1 from ops_repair_private.attachments where ticket_id=t.id and state<>'available') then raise exception '照片尚未完成，請先補齊'; end if;
    next_status:='completed';
   when 'reject' then
    if h or t.store is distinct from a->>'store' or t.status<>'awaiting_confirmation' then raise exception '僅門店可回報未修好'; end if;
    next_status:='processing';
   when 'withdraw' then
    if t.status<>'pending' then raise exception '僅待處理可撤銷'; end if;
    next_status:='withdrawn';
   when 'comment' then
    if t.status='withdrawn' then raise exception '已撤銷不能修改'; end if;
  end case;
  if p_action in('start','update_work','finish') then
   t.assignee:=coalesce(p_payload->>'assignee',t.assignee); t.vendor:=coalesce(p_payload->>'vendor',t.vendor);
   if length(t.assignee)>100 or length(t.vendor)>200 then raise exception '處理資料過長'; end if;
   if p_payload ? 'due_date' then t.due_date:=nullif(p_payload->>'due_date','')::date; end if;
  end if;
  if p_action in('start','update_work','finish','update_cost') then
   if p_payload ? 'cost' then
    if coalesce(p_payload->>'cost','')<>'' and p_payload->>'cost' !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then raise exception '費用須為非負數，最多兩位小數'; end if;
    t.cost:=nullif(p_payload->>'cost','')::numeric;
   end if;
   if p_payload ? 'cost_note' then t.cost_note:=coalesce(p_payload->>'cost_note',''); end if;
  elsif p_payload ? 'cost' or p_payload ? 'cost_note' then raise exception '此操作不可修改費用';
  end if;
  update ops_repair_private.tickets set status=next_status,version=version+1,updated_at=now(),
   assignee=t.assignee,vendor=t.vendor,due_date=t.due_date,cost=t.cost,cost_note=t.cost_note,result=t.result where id=t.id returning * into t;
 end if;
 response:=to_jsonb(t);
 insert into ops_repair_private.events(ticket_id,actor_id,actor_name,actor_role,action,note,before_state,after_state)
  values(t.id,(a->>'id')::uuid,a->>'name',a->>'role',p_action,note,previous,response);
 insert into ops_repair_private.commands(id,actor_id,payload,action,response) values(cid,(a->>'id')::uuid,p_payload,p_action,response);
 return response;
end $$;
revoke all on function public.ops_repair_api(text,jsonb) from public,anon;
grant execute on function public.ops_repair_api(text,jsonb) to authenticated;

create table ops_repair_private.attachments (
 id uuid primary key, ticket_id uuid not null references ops_repair_private.tickets(id),
 owner_id uuid not null, name text not null check(length(name) between 1 and 200),
 mime text not null check(mime in('image/jpeg','image/png','image/webp')),
 purpose text not null default 'report' check(purpose in('report','completion','receipt')),
 size bigint not null check(size between 1 and 10485760), fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 path text not null unique, state text not null default 'reserved' check(state in('reserved','available')),
 created_at timestamptz not null default now(), confirmed_at timestamptz
);
alter table ops_repair_private.attachments enable row level security;
revoke all on ops_repair_private.attachments from public,anon,authenticated;

create function public.ops_repair_photo_api(p_action text,p_payload jsonb) returns jsonb
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
 if purpose not in('report','completion','receipt') or (purpose<>'report' and not h) then raise exception '無權新增此類單據'; end if;
 select * into f from ops_repair_private.attachments where id=(p_payload->>'id')::uuid;
 if found then
  if f.ticket_id<>t.id or f.owner_id<>(a->>'id')::uuid or f.fingerprint is distinct from p_payload->>'fingerprint' or f.purpose<>purpose then raise exception '照片識別不符'; end if;
  if p_action='reserve' and (f.name is distinct from p_payload->>'name' or f.mime is distinct from p_payload->>'mime' or f.size is distinct from (p_payload->>'size')::bigint) then raise exception '照片內容不符'; end if;
 else
  if p_action<>'reserve' then raise exception '照片尚未登記'; end if;
  if t.status not in('pending','processing','awaiting_confirmation') and not(t.status='completed' and h and purpose='receipt') then raise exception '已結案僅總部可補費用單據'; end if;
  if (select count(*) from ops_repair_private.attachments where ticket_id=t.id)>=5 then raise exception '最多 5 張照片'; end if;
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

create function public.ops_repair_photo_access(p_path text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a jsonb; result boolean;
begin
 begin a:=ops_repair_private.actor(); exception when others then return false; end;
 select true into result from ops_repair_private.attachments f join ops_repair_private.tickets t on t.id=f.ticket_id
 where f.path=p_path and ((a->>'manageRepairs')::boolean or t.store=a->>'store')
 and (not p_write or (f.owner_id=(a->>'id')::uuid and f.state='reserved'
  and (f.purpose='report' or (a->>'manageRepairs')::boolean)
  and (t.status in('pending','processing','awaiting_confirmation') or (t.status='completed' and f.purpose='receipt' and (a->>'manageRepairs')::boolean))));
 return coalesce(result,false);
end $$;
revoke all on function public.ops_repair_photo_access(text,boolean) from public,anon;
grant execute on function public.ops_repair_photo_access(text,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('ops-repair-photos','ops-repair-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy repair_photo_upload on storage.objects for insert to authenticated
 with check(bucket_id='ops-repair-photos' and public.ops_repair_photo_access(name,true));
create policy repair_photo_read on storage.objects for select to authenticated
 using(bucket_id='ops-repair-photos' and public.ops_repair_photo_access(name,false));
-- No update/delete policies: confirmed objects are immutable, uncertain uploads are retained.

-- Only the trusted image verifier can make an uploaded object available.
create function public.ops_repair_verify_photo(p_id uuid,p_actor uuid,p_fingerprint text,p_mime text,p_size bigint) returns jsonb
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
 if a is null or not coalesce(((a->>'hq')::boolean or (a->>'role'='store_manager' and a->>'store'=t.store)),false)
 or (f.purpose<>'report' and not (a->>'hq')::boolean) then raise exception '無權確認照片'; end if;
 if f.fingerprint is distinct from p_fingerprint or f.mime is distinct from p_mime or f.size is distinct from p_size then raise exception '照片內容驗證不符'; end if;
 if f.state='available' then return to_jsonb(f); end if;
 if t.status not in('pending','processing','awaiting_confirmation') and not(t.status='completed' and f.purpose='receipt' and (a->>'hq')::boolean) then raise exception '目前狀態不可新增照片'; end if;
 select metadata into meta from storage.objects where bucket_id='ops-repair-photos' and name=f.path;
 if meta is null or meta->>'mimetype' is distinct from f.mime or (meta->>'size')::bigint is distinct from f.size then raise exception '照片尚未完整保存'; end if;
 update ops_repair_private.attachments set state='available',confirmed_at=now() where id=f.id returning * into f;
 insert into ops_repair_private.events(ticket_id,actor_id,actor_name,actor_role,action,note,before_state,after_state)
 values(t.id,p_actor,a->>'name',a->>'role','photo_confirm','照片保存完成',null,jsonb_build_object('attachment',to_jsonb(f)));
 return to_jsonb(f);
end $$;
revoke all on function public.ops_repair_verify_photo(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.ops_repair_verify_photo(uuid,uuid,text,text,bigint) to service_role;
