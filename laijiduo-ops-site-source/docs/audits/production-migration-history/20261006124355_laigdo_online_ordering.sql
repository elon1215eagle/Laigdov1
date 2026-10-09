-- Reviewed draft; apply only to a staging database first. No existing table writes.
begin;
create schema laigdo_order_private;
revoke all on schema laigdo_order_private from public, anon, authenticated;
create table laigdo_order_private.menus (
 store_id uuid primary key references public.stores(id),
 published boolean not null default false, accepting boolean not null default false,
 open_minute integer not null default 660 check(open_minute between 0 and 1439),
 close_minute integer not null default 1260 check(close_minute between 1 and 1440),
 lead_minutes integer not null default 30 check(lead_minutes between 15 and 180),
 products jsonb not null default '[]', version integer not null default 1,
 updated_by uuid references public.profiles(id), updated_at timestamptz not null default now(),
 check(close_minute > open_minute)
);
create table laigdo_order_private.orders (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 store_id uuid not null references public.stores(id), line_user_id text not null,
 request_id uuid not null, request_payload jsonb not null,
 customer_name text not null, phone text not null, note text not null default '',
 pickup_at timestamptz not null, lines jsonb not null, total integer not null,
 status text not null default 'pending' check(status in ('pending','accepted','preparing','ready','completed','cancelled')),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(line_user_id,request_id)
);
create index on laigdo_order_private.orders(store_id, created_at desc);
create index on laigdo_order_private.orders(line_user_id, created_at desc);
create table laigdo_order_private.events (
 id bigint generated always as identity primary key, order_id uuid references laigdo_order_private.orders(id),
 store_id uuid not null, actor_id uuid references public.profiles(id), action text not null,
 before_state jsonb, after_state jsonb not null, reason text not null default '', created_at timestamptz not null default now()
);
alter table laigdo_order_private.menus enable row level security;
alter table laigdo_order_private.orders enable row level security;
alter table laigdo_order_private.events enable row level security;

create function public.laigdo_order_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'store_code',s.store_code,
 'accepting',m.accepting,'open_minute',m.open_minute,'close_minute',m.close_minute,'lead_minutes',m.lead_minutes,
 'version',m.version,'products',m.products) order by s.store_code),'[]'::jsonb)
 from laigdo_order_private.menus m join public.stores s on s.id=m.store_id
 where m.published and s.is_active;
$$;
revoke all on function public.laigdo_order_catalog() from public;
grant execute on function public.laigdo_order_catalog() to anon, authenticated, service_role;

-- Only the LINE verification server can invoke this function. p_user is server-derived.
create function public.laigdo_order_customer(p_user text, p_action text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 m laigdo_order_private.menus%rowtype; o laigdo_order_private.orders%rowtype;
 item jsonb; product jsonb; lines_value jsonb := '[]'; total_value integer := 0; quantity_value integer;
 group_value jsonb; choice_value jsonb; option_values jsonb; option_snapshot jsonb; selected_value text;
 pickup_value timestamptz; local_pickup timestamp; minute_value integer;
begin
 if p_user is null or p_user !~ '^U[0-9a-f]{32}$' then raise exception 'invalid_line_identity'; end if;
 if p_action='my_orders' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'number',q.number,'store_id',q.store_id,
   'store_name',s.name,'pickup_at',q.pickup_at,'lines',q.lines,'total',q.total,'status',q.status,'created_at',q.created_at) order by q.created_at desc)
   from (select * from laigdo_order_private.orders where line_user_id=p_user and created_at>now()-interval '30 days' order by created_at desc limit 20) q
   join public.stores s on s.id=q.store_id),'[]');
 end if;
 if p_action<>'submit' then raise exception 'invalid_action'; end if;
 -- Serialize submissions per customer, preventing concurrent rate-limit/idempotency bypasses.
 perform pg_advisory_xact_lock(hashtext(p_user));
 select * into o from laigdo_order_private.orders where line_user_id=p_user and request_id=(p_payload->>'request_id')::uuid;
 if found then
  if o.request_payload is distinct from p_payload then raise exception 'request_id_reused'; end if;
  return jsonb_build_object('id',o.id,'number',o.number,'total',o.total,'status',o.status);
 end if;
 if (select count(*) from laigdo_order_private.orders where line_user_id=p_user and created_at>now()-interval '10 minutes') >= 3 then
  raise exception 'too_many_orders';
 end if;
 if length(trim(coalesce(p_payload->>'customer_name',''))) not between 1 and 40
  or coalesce(p_payload->>'phone','') !~ '^09[0-9]{8}$' or length(coalesce(p_payload->>'note',''))>300
  or p_payload->>'request_id' is null then raise exception 'invalid_contact'; end if;
 select * into m from laigdo_order_private.menus where store_id=(p_payload->>'store_id')::uuid for share;
 if not found or not m.published or not m.accepting or not exists(select 1 from public.stores where id=m.store_id and is_active) then raise exception 'store_closed'; end if;
 if m.version is distinct from (p_payload->>'menu_version')::integer then raise exception 'menu_changed'; end if;
 pickup_value := (p_payload->>'pickup_at')::timestamptz;
 local_pickup := pickup_value at time zone 'Asia/Taipei';
 minute_value := extract(hour from local_pickup)::integer*60+extract(minute from local_pickup)::integer;
 if pickup_value is null or pickup_value<now()+make_interval(mins=>m.lead_minutes) or pickup_value>now()+interval '24 hours'
  or minute_value<m.open_minute or minute_value>=m.close_minute or minute_value%15<>0 or extract(second from local_pickup)<>0 then raise exception 'invalid_pickup_time'; end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 30 then raise exception 'invalid_items'; end if;
 if (select count(*) from jsonb_array_elements(p_payload->'items')) <> (select count(distinct x->>'code') from jsonb_array_elements(p_payload->'items') x) then raise exception 'duplicate_item'; end if;
 for item in select * from jsonb_array_elements(p_payload->'items') loop
  select x into product from jsonb_array_elements(m.products) x where x->>'code'=item->>'code';
  if product is null or coalesce((product->>'sold_out')::boolean,false) then raise exception 'product_unavailable'; end if;
  if coalesce(item->>'quantity','') !~ '^[0-9]+$' then raise exception 'invalid_quantity'; end if;
  quantity_value := (item->>'quantity')::integer;
  if quantity_value not between 1 and 20 then raise exception 'invalid_quantity'; end if;
  if length(coalesce(item->>'note',''))>120 then raise exception 'invalid_item_note'; end if;
  option_values:=coalesce(item->'options','{}'::jsonb);option_snapshot:='[]'::jsonb;
  if jsonb_typeof(option_values) is distinct from 'object' then raise exception 'invalid_option'; end if;
  if exists(select 1 from jsonb_object_keys(option_values) k where not exists(select 1 from jsonb_array_elements(coalesce(product->'option_groups','[]')) g where g->>'id'=k)) then raise exception 'invalid_option'; end if;
  for group_value in select * from jsonb_array_elements(coalesce(product->'option_groups','[]')) loop
   selected_value:=option_values->>(group_value->>'id');
   if coalesce(selected_value,'')='' then
    if coalesce((group_value->>'required')::boolean,false) then raise exception 'required_option_missing'; end if;
   else
    select c into choice_value from jsonb_array_elements(group_value->'choices') c where c->>'value'=selected_value;
    if choice_value is null then raise exception 'invalid_option'; end if;
    option_snapshot:=option_snapshot||jsonb_build_array(jsonb_build_object('id',group_value->>'id','name',group_value->>'name','value',choice_value->>'value','label',choice_value->>'label'));
   end if;
  end loop;
  total_value := total_value + (product->>'price')::integer*quantity_value;
  lines_value := lines_value || jsonb_build_array(jsonb_build_object('code',product->>'code','name',product->>'name',
    'unit_price',(product->>'price')::integer,'quantity',quantity_value,'line_total',(product->>'price')::integer*quantity_value,
    'note',trim(coalesce(item->>'note','')),'options',option_snapshot));
 end loop;
 insert into laigdo_order_private.orders(store_id,line_user_id,request_id,request_payload,customer_name,phone,note,pickup_at,lines,total)
 values(m.store_id,p_user,(p_payload->>'request_id')::uuid,p_payload,trim(p_payload->>'customer_name'),p_payload->>'phone',coalesce(p_payload->>'note',''),pickup_value,lines_value,total_value) returning * into o;
 insert into laigdo_order_private.events(order_id,store_id,action,after_state) values(o.id,o.store_id,'submit',jsonb_build_object('status',o.status,'total',o.total));
 return jsonb_build_object('id',o.id,'number',o.number,'total',o.total,'status',o.status);
end $$;
revoke all on function public.laigdo_order_customer(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.laigdo_order_customer(text,text,jsonb) to service_role;

create function public.laigdo_order_ops(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 actor public.profiles%rowtype; m laigdo_order_private.menus%rowtype; o laigdo_order_private.orders%rowtype;
 sid uuid; manager boolean; before_value jsonb; product jsonb; next_status text;
 group_value jsonb; choice_value jsonb;
begin
 select * into actor from public.profiles where id=auth.uid() and is_active;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 manager := actor.role::text in ('ceo','coo','admin','hq');
 if not manager and actor.role::text<>'store_manager' then raise exception 'forbidden' using errcode='42501'; end if;
 sid := coalesce((p_payload->>'store_id')::uuid,actor.store_id);
 if sid is null or (not manager and sid is distinct from actor.store_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.stores where id=sid and is_active) then raise exception 'invalid_store'; end if;
 if p_action='read' then
  return jsonb_build_object('menu',(select to_jsonb(t) from laigdo_order_private.menus t where store_id=sid),
    'orders',coalesce((select jsonb_agg(to_jsonb(q)-'line_user_id'-'request_payload' order by q.created_at desc)
    from (select * from laigdo_order_private.orders where store_id=sid and created_at>now()-interval '7 days' order by created_at desc limit 200) q),'[]'),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from
    (select * from laigdo_order_private.events where store_id=sid order by created_at desc limit 50)e),'[]'),
    'report',(select jsonb_build_object('orders',count(*),'completed_revenue',coalesce(sum(total) filter(where status='completed'),0),
      'pending',count(*) filter(where status='pending'),'cancelled',count(*) filter(where status='cancelled'))
      from laigdo_order_private.orders where store_id=sid and created_at>now()-interval '7 days'));
 end if;
 if p_action='save_menu' then
  if not manager then raise exception 'forbidden' using errcode='42501'; end if;
  if p_payload->>'confirmed' is distinct from 'true' or jsonb_typeof(p_payload->'products') is distinct from 'array'
   or jsonb_array_length(p_payload->'products') not between 1 and 100 then raise exception 'menu_confirmation_required'; end if;
  if (select count(*) from jsonb_array_elements(p_payload->'products'))<>(select count(distinct x->>'code') from jsonb_array_elements(p_payload->'products')x) then raise exception 'duplicate_product'; end if;
  for product in select * from jsonb_array_elements(p_payload->'products') loop
   if coalesce(product->>'code','') !~ '^[a-zA-Z0-9_-]{1,60}$' or length(trim(coalesce(product->>'name',''))) not between 1 and 60
    or coalesce(product->>'price','') !~ '^[0-9]+$' or (product->>'price')::integer not between 1 and 10000
    or jsonb_typeof(product->'sold_out') is distinct from 'boolean' then raise exception 'invalid_product'; end if;
   if product ? 'option_groups' then
    if jsonb_typeof(product->'option_groups') is distinct from 'array' or jsonb_array_length(product->'option_groups')>5 then raise exception 'invalid_option_groups'; end if;
    if (select count(*) from jsonb_array_elements(product->'option_groups'))<>(select count(distinct g->>'id') from jsonb_array_elements(product->'option_groups')g) then raise exception 'invalid_option_groups'; end if;
    for group_value in select * from jsonb_array_elements(product->'option_groups') loop
     if coalesce(group_value->>'id','') !~ '^[a-zA-Z0-9_-]{1,60}$' or length(trim(coalesce(group_value->>'name',''))) not between 1 and 40
      or jsonb_typeof(group_value->'required') is distinct from 'boolean' or jsonb_typeof(group_value->'choices') is distinct from 'array'
      or jsonb_array_length(group_value->'choices') not between 1 and 20 then raise exception 'invalid_option_groups'; end if;
     if (select count(*) from jsonb_array_elements(group_value->'choices'))<>(select count(distinct c->>'value') from jsonb_array_elements(group_value->'choices')c) then raise exception 'invalid_option_groups'; end if;
     for choice_value in select * from jsonb_array_elements(group_value->'choices') loop
      if coalesce(choice_value->>'value','') !~ '^[a-zA-Z0-9_-]{1,60}$' or length(trim(coalesce(choice_value->>'label',''))) not between 1 and 40
       or choice_value ? 'price' or choice_value ? 'price_delta' then raise exception 'invalid_option_groups'; end if;
     end loop;
    end loop;
   end if;
  end loop;
  perform pg_advisory_xact_lock(hashtext(sid::text));
  select * into m from laigdo_order_private.menus where store_id=sid for update;
  if coalesce(m.version,0) is distinct from (p_payload->>'version')::integer then raise exception 'stale_version'; end if;
  before_value:=case when m.store_id is null then null else to_jsonb(m) end;
  insert into laigdo_order_private.menus(store_id,products,published,accepting,open_minute,close_minute,lead_minutes,updated_by)
   values(sid,p_payload->'products',true,false,(p_payload->>'open_minute')::integer,(p_payload->>'close_minute')::integer,(p_payload->>'lead_minutes')::integer,actor.id)
   on conflict(store_id) do update set products=excluded.products,published=true,open_minute=excluded.open_minute,close_minute=excluded.close_minute,
    lead_minutes=excluded.lead_minutes,version=laigdo_order_private.menus.version+1,updated_by=actor.id,updated_at=now() returning * into m;
  insert into laigdo_order_private.events(store_id,actor_id,action,before_state,after_state) values(sid,actor.id,p_action,before_value,to_jsonb(m));
  return to_jsonb(m);
 end if;
 if p_action in ('availability','accepting') then
  select * into m from laigdo_order_private.menus where store_id=sid for update;
  if not found then raise exception 'menu_not_published'; end if;
  if m.version is distinct from (p_payload->>'version')::integer then raise exception 'stale_version'; end if;
  before_value:=to_jsonb(m);
  if p_action='availability' then
   if not exists(select 1 from jsonb_array_elements(m.products)x where x->>'code'=p_payload->>'code') or jsonb_typeof(p_payload->'sold_out') is distinct from 'boolean' then raise exception 'invalid_product'; end if;
   update laigdo_order_private.menus set products=(select jsonb_agg(case when x->>'code'=p_payload->>'code' then jsonb_set(x,'{sold_out}',p_payload->'sold_out') else x end) from jsonb_array_elements(m.products)x),version=version+1,updated_by=actor.id,updated_at=now() where store_id=sid returning * into m;
  else
   if jsonb_typeof(p_payload->'accepting') is distinct from 'boolean' then raise exception 'invalid_accepting'; end if;
   update laigdo_order_private.menus set accepting=(p_payload->>'accepting')::boolean,version=version+1,updated_by=actor.id,updated_at=now() where store_id=sid returning * into m;
  end if;
  insert into laigdo_order_private.events(store_id,actor_id,action,before_state,after_state) values(sid,actor.id,p_action,before_value,to_jsonb(m));
  return to_jsonb(m);
 end if;
 if p_action='transition' then
  select * into o from laigdo_order_private.orders where id=(p_payload->>'order_id')::uuid and store_id=sid for update;
  if not found then raise exception 'order_not_found'; end if;
  next_status:=p_payload->>'status';
  if o.version is distinct from (p_payload->>'version')::integer then raise exception 'stale_version'; end if;
  if not ((o.status='pending' and next_status in ('accepted','cancelled')) or (o.status='accepted' and next_status in ('preparing','cancelled'))
   or (o.status='preparing' and next_status='ready') or (o.status='ready' and next_status='completed')) then raise exception 'invalid_transition'; end if;
  if next_status='cancelled' and length(trim(coalesce(p_payload->>'reason',''))) not between 1 and 200 then raise exception 'cancel_reason_required'; end if;
  before_value:=jsonb_build_object('status',o.status,'version',o.version);
  update laigdo_order_private.orders set status=next_status,version=version+1,updated_at=now() where id=o.id returning * into o;
  insert into laigdo_order_private.events(order_id,store_id,actor_id,action,before_state,after_state,reason)
   values(o.id,sid,actor.id,p_action,before_value,jsonb_build_object('status',o.status,'version',o.version),coalesce(p_payload->>'reason',''));
  return jsonb_build_object('id',o.id,'status',o.status,'version',o.version);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.laigdo_order_ops(text,jsonb) from public,anon;
grant execute on function public.laigdo_order_ops(text,jsonb) to authenticated;
commit;
