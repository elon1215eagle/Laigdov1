-- HQ is an outbound location in transfers, not a store or an Auth identity.
-- Refuse an unexpected API baseline rather than silently patching another version.
do $migration$
declare body text := pg_get_functiondef('public.ops_transfer_api(text,jsonb)'::regprocedure);
 pair text[]; previous jsonb; item record;
begin
 foreach pair slice 1 in array array[
  array[$old$'products',(select$old$,
        $new$'senders',(select jsonb_build_array(jsonb_build_object('code','HQ','name','總部')) || coalesce(jsonb_agg(jsonb_build_object('code',store_code,'name',name) order by store_code),'[]') from public.stores where is_active and store_code ~ '^S(0[1-9]|1[01])$'),
    'products',(select$new$],
  array[$old$send !~ '^S(0[1-9]|1[01])$'$old$,$new$(send<>'HQ' and send !~ '^S(0[1-9]|1[01])$')$new$],
  array[$old$where store_code in(recv,send) and is_active)<>2$old$,$new$where store_code in(recv,send) and is_active)<>(case when send='HQ' then 1 else 2 end)$new$],
  array[$old$and send=any(stores) and recv=any(receiver_stores)$old$,$new$and (send='HQ' or send=any(stores)) and recv=any(receiver_stores)$new$],
  array[$old$(select name from public.stores where store_code=send)$old$,$new$(case when send='HQ' then '總部' else (select name from public.stores where store_code=send) end)$new$],
  array[$old$or exists(select 1 from unnest(v_senders||v_receivers) t where t is null or t !~ '^S(0[1-9]|1[01])$')$old$,
        $new$or exists(select 1 from unnest(v_senders) t where t is null or (t<>'HQ' and t !~ '^S(0[1-9]|1[01])$'))
      or exists(select 1 from unnest(v_receivers) t where t is null or t !~ '^S(0[1-9]|1[01])$')$new$]
 ] loop
  if cardinality(string_to_array(body,pair[1]))<>2 then
   raise exception 'Transfer API baseline differs. Review HQ migration before applying.';
  end if;
  body:=replace(body,pair[1],pair[2]);
 end loop;
 execute body;
end $migration$;

alter table ops_transfer_private.requests drop constraint requests_sender_check;
alter table ops_transfer_private.requests add constraint requests_sender_check
 check(sender='HQ' or sender ~ '^S(0[1-9]|1[01])$');
alter table ops_transfer_private.products alter column sender_stores
 set default array['HQ','S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11'];

-- Record real migration snapshots without impersonating an application user.
create table ops_transfer_private.catalog_rollouts (
 migration text not null, product_id uuid not null references ops_transfer_private.products(id),
 before_state jsonb not null, after_state jsonb not null, applied_at timestamptz not null default now(),
 primary key(migration,product_id)
);
alter table ops_transfer_private.catalog_rollouts enable row level security;
revoke all on ops_transfer_private.catalog_rollouts from public,anon,authenticated;
do $catalog$
declare p ops_transfer_private.products; updated ops_transfer_private.products;
begin
 for p in select * from ops_transfer_private.products for update loop
  if not '公斤'=any(p.units) or not 'HQ'=any(p.sender_stores) then
   update ops_transfer_private.products set
    units=case when '公斤'=any(units) then units else array_append(units,'公斤') end,
    sender_stores=case when 'HQ'=any(sender_stores) then sender_stores else array_prepend('HQ',sender_stores) end,
    version=version+1
    where id=p.id returning * into updated;
   insert into ops_transfer_private.catalog_rollouts(migration,product_id,before_state,after_state)
   values('transfer_decimal_kg_hq_source',p.id,to_jsonb(p),to_jsonb(updated));
  end if;
 end loop;
end $catalog$;
