-- Transfers are an independent ledger. No inventory or franchise writes.
create schema if not exists ops_transfer_private;
revoke all on schema ops_transfer_private from public, anon, authenticated;

create table ops_transfer_private.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('肉品','點心','南北貨','五金')),
  spec text not null default '',
  units text[] not null check (cardinality(units) > 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  stores text[] not null default array['S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11'],
  version integer not null default 1
);
create table ops_transfer_private.product_sources (
  product_id uuid primary key references ops_transfer_private.products(id),
  source_system text not null,
  source_id uuid not null,
  source_code text not null,
  source_name text not null,
  source_unit text not null
);
create table ops_transfer_private.requests (
  id uuid primary key,
  number bigint generated always as identity unique,
  receiver text not null check (receiver ~ '^S(0[1-9]|1[01])$'),
  sender text not null check (sender ~ '^S(0[1-9]|1[01])$'),
  status text not null check (status in ('requested','shipped','disputed','completed','cancelled')),
  version integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (receiver <> sender)
);
create index on ops_transfer_private.requests(receiver,status,created_at desc);
create index on ops_transfer_private.requests(sender,status,created_at desc);
create table ops_transfer_private.events (
  id bigint generated always as identity primary key,
  request_id uuid references ops_transfer_private.requests(id),
  product_id uuid references ops_transfer_private.products(id),
  actor_id uuid not null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  reason text not null default '',
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index on ops_transfer_private.events(request_id,id);
create table ops_transfer_private.commands (
  id uuid primary key,
  actor_id uuid not null,
  request_hash text not null,
  response jsonb not null
);
alter table ops_transfer_private.products enable row level security;
alter table ops_transfer_private.product_sources enable row level security;
alter table ops_transfer_private.requests enable row level security;
alter table ops_transfer_private.events enable row level security;
alter table ops_transfer_private.commands enable row level security;
revoke all on all tables in schema ops_transfer_private from public, anon, authenticated;

insert into ops_transfer_private.products(code,name,category,spec,units,active,sort_order)
select 'TR-' || product_code,
 case when product_code='SNACK-CUT-SWEET-POTATO-9KG' then '地瓜' else name end,
 category,
 case when product_code='SNACK-CUT-SWEET-POTATO-9KG' then '' else coalesce(note,'') end,
 case when category='肉品' or product_code='SNACK-CUT-SWEET-POTATO-9KG' then array['箱','包']
      when product_code='MEAT-SKIN' then array['支'] else array[order_unit] end,
 not (name like '%整顆地瓜%'), coalesce(sort_order,100)
from public.franchise_order_products
where is_orderable and not is_adjustment and category in ('肉品','點心','南北貨','五金');
insert into ops_transfer_private.product_sources
select p.id,'franchise_ordering',s.id,s.product_code,s.name,s.order_unit
from ops_transfer_private.products p join public.franchise_order_products s on p.code='TR-'||s.product_code;

create function ops_transfer_private.actor() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p record; h boolean;
begin
 select pr.id,pr.full_name,pr.role::text role,s.store_code into p
 from public.profiles pr left join public.stores s on s.id=pr.store_id
 where pr.id=auth.uid() and pr.is_active;
 if not found then raise exception '請以營運 APP 授權帳號登入'; end if;
 h := p.role = any(array['ceo','coo','cfo','cso','general_affairs','admin','hq','supervisor']);
 if not h and (p.role<>'store_manager' or coalesce(p.store_code,'') !~ '^S(0[1-9]|1[01])$') then
   raise exception '調貨中心目前僅開放直營門店及總部';
 end if;
 return jsonb_build_object('id',p.id,'name',coalesce(p.full_name,p.role),'role',p.role,'store',p.store_code,'is_hq',h);
end $$;

-- Single authority for permissions, snapshots, optimistic locking and retries.
create function public.ops_transfer_api(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a jsonb := ops_transfer_private.actor(); h boolean := (a->>'is_hq')::boolean;
 r ops_transfer_private.requests; prod ops_transfer_private.products;
 old jsonb; result jsonb; d jsonb; line jsonb; base jsonb; lines jsonb := '[]';
 rid uuid; cid uuid; ph text; reason text := trim(coalesce(p_payload->>'reason',''));
 recv text; send text; qty numeric; changed boolean := false; total numeric := 0;
 ids text[] := '{}'; u text; ack text; v_units text[]; v_stores text[];
begin
 if length(p_payload::text)>200000 then raise exception '單據內容過大'; end if;
 if p_action='bootstrap' then
   return jsonb_build_object('actor',a,
    'stores',(select coalesce(jsonb_agg(jsonb_build_object('code',store_code,'name',name) order by store_code),'[]')
      from public.stores where is_active and store_code ~ '^S(0[1-9]|1[01])$'),
    'products',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('source',to_jsonb(s)) order by p.sort_order,p.code),'[]')
      from ops_transfer_private.products p left join ops_transfer_private.product_sources s on s.product_id=p.id
      where h or (p.active and (a->>'store')=any(p.stores))));
 elsif p_action='list' then
   return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]') from (
    select x.* from ops_transfer_private.requests x
    where (h or a->>'store' in (x.sender,x.receiver))
      and (coalesce(p_payload->>'status','')='' or x.status=p_payload->>'status')
      and (coalesce(p_payload->>'store','')='' or p_payload->>'store' in (x.sender,x.receiver))
      and (coalesce(p_payload->>'from','')='' or x.data->>'date'>=p_payload->>'from')
      and (coalesce(p_payload->>'to','')='' or x.data->>'date'<=p_payload->>'to')
    order by x.created_at desc limit 100 offset least(100000,greatest(0,coalesce((p_payload->>'offset')::int,0)))
   ) q);
 elsif p_action='detail' then
   select * into r from ops_transfer_private.requests where id=(p_payload->>'id')::uuid;
   if not found or not (h or a->>'store' in (r.sender,r.receiver)) then raise exception '無權查看此調貨單'; end if;
   return to_jsonb(r)||jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from ops_transfer_private.events e where e.request_id=r.id));
 end if;

 cid := (p_payload->>'command_id')::uuid;
 if cid is null then raise exception '缺少操作識別碼，請重新操作'; end if;
 ph := md5(p_action||p_payload::text);
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 select response into result from ops_transfer_private.commands where id=cid and actor_id=(a->>'id')::uuid and request_hash=ph;
 if found then return result; end if;
 if exists(select 1 from ops_transfer_private.commands where id=cid) then raise exception '重複操作識別碼'; end if;

 if p_action='product' then
   if not h then raise exception '僅總部可設定調貨品項'; end if;
   if reason='' then raise exception '請填寫設定原因'; end if;
   rid := nullif(p_payload->>'id','')::uuid;
   if rid is not null then
     select * into prod from ops_transfer_private.products where id=rid for update;
     if not found then raise exception '品項不存在'; end if;
     if prod.version is distinct from (p_payload->>'version')::int then raise exception '品項已更新，請重新整理'; end if;
     old := to_jsonb(prod);
   end if;
   select array_agg(distinct value) into v_units from jsonb_array_elements_text(p_payload->'units');
   select array_agg(distinct value) into v_stores from jsonb_array_elements_text(p_payload->'stores');
   if coalesce(cardinality(v_units),0)=0 or exists(select 1 from unnest(v_units) t where t !~ '^[一-龥A-Za-z0-9]{1,8}$') then raise exception '請選擇有效單位'; end if;
   if coalesce(cardinality(v_stores),0)=0 or exists(select 1 from unnest(v_stores) t where t !~ '^S(0[1-9]|1[01])$') then raise exception '請選擇適用直營門店'; end if;
   if length(trim(coalesce(p_payload->>'name','')))=0 or length(p_payload->>'name')>80 then raise exception '請填寫品項名稱（80字內）'; end if;
   if rid is null then
     insert into ops_transfer_private.products(code,name,category,spec,units,active,sort_order,stores)
     values ('TR-CUSTOM-'||gen_random_uuid(),trim(p_payload->>'name'),p_payload->>'category',coalesce(p_payload->>'spec',''),v_units,coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'sort_order')::int,100),v_stores) returning * into prod;
   else
     update ops_transfer_private.products set name=trim(p_payload->>'name'),category=p_payload->>'category',spec=coalesce(p_payload->>'spec',''),units=v_units,active=(p_payload->>'active')::boolean,sort_order=(p_payload->>'sort_order')::int,stores=v_stores,version=version+1 where id=rid returning * into prod;
   end if;
   result := to_jsonb(prod);
   insert into ops_transfer_private.events(product_id,actor_id,actor_name,actor_role,action,reason,before_state,after_state)
     values(prod.id,(a->>'id')::uuid,a->>'name',a->>'role','product',reason,old,result);
 elsif p_action='create' then
   recv := p_payload->>'receiver'; send := p_payload->>'sender';
   if not h and recv is distinct from a->>'store' then raise exception '收貨店必須為登入門店'; end if;
   if h and reason='' then raise exception '總部代建單請填寫原因'; end if;
   if recv is null or send is null or recv=send or recv !~ '^S(0[1-9]|1[01])$' or send !~ '^S(0[1-9]|1[01])$'
      or (select count(*) from public.stores where store_code in(recv,send) and is_active)<>2 then raise exception '請選擇兩間不同的有效直營門店'; end if;
   if coalesce(p_payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '請選擇調貨日期'; end if;
   perform (p_payload->>'date')::date;
   if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 100 then raise exception '請加入1至100個品項'; end if;
   for line in select value from jsonb_array_elements(p_payload->'lines') loop
     if line->>'product_id'=any(ids) then raise exception '相同品項只能選一種單位'; end if;
     ids := array_append(ids,line->>'product_id');
     select * into prod from ops_transfer_private.products where id=(line->>'product_id')::uuid and active and recv=any(stores) and send=any(stores);
     if not found then raise exception '品項未啟用或不適用此門店'; end if;
     qty := (line->>'quantity')::numeric; u := line->>'unit';
     if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty>1000000 or qty<>round(qty,3) then raise exception '數量須大於0，最多三位小數'; end if;
     if u is null or not u=any(prod.units) then raise exception '請選擇品項允許的單一單位'; end if;
     lines := lines||jsonb_build_array(jsonb_build_object('product_id',prod.id,'code',prod.code,'name',prod.name,'spec',prod.spec,'category',prod.category,'unit',u,'quantity',qty));
   end loop;
   rid := (p_payload->>'id')::uuid;
   d := jsonb_build_object('date',p_payload->>'date','note',left(coalesce(p_payload->>'note',''),2000),'lines',lines,'requester',a->>'name','sender_name',(select name from public.stores where store_code=send),'receiver_name',(select name from public.stores where store_code=recv));
   insert into ops_transfer_private.requests(id,receiver,sender,status,data) values(rid,recv,send,'requested',d) returning * into r;
   result := to_jsonb(r);
   insert into ops_transfer_private.events(request_id,actor_id,actor_name,actor_role,action,reason,after_state)
     values(r.id,(a->>'id')::uuid,a->>'name',a->>'role',p_action,reason,result);
 else
   rid := (p_payload->>'id')::uuid;
   select * into r from ops_transfer_private.requests where id=rid for update;
   if not found or not(h or a->>'store' in(r.sender,r.receiver)) then raise exception '無权操作此調貨單'; end if;
   if r.version is distinct from (p_payload->>'version')::int then raise exception '單據已更新，請重新整理後再操作'; end if;
   if h and reason='' then raise exception '總部代操作請填寫原因'; end if;
   old := to_jsonb(r); d := r.data;
   if p_action='ship' or p_action='receive' then
     if p_action='ship' and (r.status<>'requested' or not(h or a->>'store'=r.sender)) then raise exception '僅出貨店可確認待出貨單'; end if;
     if p_action='receive' and (r.status<>'shipped' or not(h or a->>'store'=r.receiver)) then raise exception '僅收貨店可點收已出貨單'; end if;
     base := case when p_action='ship' then d->'lines' else d->'shipped' end;
     if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines')<>jsonb_array_length(base) then raise exception '請逐項核對所有品項'; end if;
     for line in select value from jsonb_array_elements(base) loop
       if (select count(*) from jsonb_array_elements(p_payload->'lines') x where x->>'product_id'=line->>'product_id')<>1 then raise exception '品項不一致'; end if;
       select (x->>'quantity')::numeric into qty from jsonb_array_elements(p_payload->'lines') x where x->>'product_id'=line->>'product_id';
       if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<0 or qty>1000000 or qty<>round(qty,3) then raise exception '數量不可為負數，最多三位小數'; end if;
       changed := changed or qty<>(line->>'quantity')::numeric; total := total+qty;
       lines := lines||jsonb_build_array(line||jsonb_build_object('quantity',qty));
     end loop;
     if changed and reason='' then raise exception '數量有差異，請填寫原因'; end if;
     if p_action='ship' then
       if total=0 then raise exception '至少出貨一個品項；無法出貨請取消'; end if;
       r.status := 'shipped'; d := d||jsonb_build_object('shipped',lines,'shipped_at',now());
     else
       r.status := case when changed then 'disputed' else 'completed' end;
       d := d||jsonb_build_object('received',lines,'received_at',now());
       if not changed then d := d||jsonb_build_object('completed_at',now()); end if;
     end if;
   elsif p_action='cancel' then
     if r.status<>'requested' or reason='' then raise exception '僅未出貨单可取消，並須填寫原因'; end if;
     r.status := 'cancelled';
   elsif p_action='resolve' then
     if r.status<>'disputed' or not(h or a->>'store'=r.sender) or reason='' then raise exception '請由出貨店或總部提出差異處理方式'; end if;
     d := d||jsonb_build_object('resolution',reason,'sender_ack',false,'receiver_ack',false);
   elsif p_action in ('ack_sender','ack_receiver') then
     ack := case when p_action='ack_sender' then 'sender_ack' else 'receiver_ack' end;
     if r.status<>'disputed' or coalesce(d->>'resolution','')='' or not(h or a->>'store'=case when p_action='ack_sender' then r.sender else r.receiver end) then raise exception '無權確認，或尚未提出處理方式'; end if;
     if coalesce((d->>ack)::boolean,false) then raise exception '此方已確認'; end if;
     d := d||jsonb_build_object(ack,true);
     if (d->>'sender_ack')::boolean and (d->>'receiver_ack')::boolean then r.status := 'completed'; d := d||jsonb_build_object('completed_at',now()); end if;
   elsif p_action='correction_note' then
     if not h or r.status<>'completed' or reason='' then raise exception '僅總部可為結案單追加更正說明'; end if;
   else raise exception '不支援此操作';
   end if;
   update ops_transfer_private.requests set status=r.status,data=d,version=version+1,updated_at=now() where id=rid returning * into r;
   result := to_jsonb(r);
   insert into ops_transfer_private.events(request_id,actor_id,actor_name,actor_role,action,reason,before_state,after_state)
    values(r.id,(a->>'id')::uuid,a->>'name',a->>'role',p_action,reason,old,result);
 end if;
 insert into ops_transfer_private.commands values(cid,(a->>'id')::uuid,ph,result);
 return result;
end $$;
revoke all on all functions in schema ops_transfer_private from public,anon,authenticated;
revoke all on function public.ops_transfer_api(text,jsonb) from public,anon;
grant execute on function public.ops_transfer_api(text,jsonb) to authenticated;
