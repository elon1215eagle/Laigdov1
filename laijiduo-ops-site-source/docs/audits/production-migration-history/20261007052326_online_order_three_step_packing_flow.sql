CREATE OR REPLACE FUNCTION public.laigdo_order_ops(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not ((o.status='pending' and next_status in ('accepted','cancelled')) or (o.status='accepted' and next_status in ('preparing','ready','cancelled'))
   or (o.status='preparing' and next_status='ready') or (o.status='ready' and next_status='completed')) then raise exception 'invalid_transition'; end if;
  if next_status='cancelled' and length(trim(coalesce(p_payload->>'reason',''))) not between 1 and 200 then raise exception 'cancel_reason_required'; end if;
  before_value:=jsonb_build_object('status',o.status,'version',o.version);
  update laigdo_order_private.orders set status=next_status,version=version+1,updated_at=now() where id=o.id returning * into o;
  insert into laigdo_order_private.events(order_id,store_id,actor_id,action,before_state,after_state,reason)
   values(o.id,sid,actor.id,p_action,before_value,jsonb_build_object('status',o.status,'version',o.version),coalesce(p_payload->>'reason',''));
  return jsonb_build_object('id',o.id,'status',o.status,'version',o.version);
 end if;
 raise exception 'invalid_action';
end $function$
