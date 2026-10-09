-- Directional eligibility belongs only to the independent transfer catalog.
alter table ops_transfer_private.products
  add column sender_stores text[] not null default array['S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11'],
  add column receiver_stores text[] not null default array['S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11'];

do $migration$
declare body text:=pg_get_functiondef('public.ops_transfer_api(text,jsonb)'::regprocedure);
begin
  if position('v_stores text[];' in body)=0
    or position('and recv=any(stores) and send=any(stores);' in body)=0
    or position('result := to_jsonb(prod);' in body)=0 then
    raise exception 'Transfer API changed; review directional patch before applying';
  end if;
  body:=replace(body,'v_stores text[];','v_stores text[]; v_senders text[]; v_receivers text[];');
  body:=replace(body,'and recv=any(stores) and send=any(stores);',
    'and recv=any(stores) and send=any(stores) and recv=any(receiver_stores) and send=any(sender_stores);');
  body:=replace(body,'result := to_jsonb(prod);',$patch$
   select array_agg(distinct value) into v_senders
     from jsonb_array_elements_text(coalesce(p_payload->'sender_stores',to_jsonb(prod.sender_stores)));
   select array_agg(distinct value) into v_receivers
     from jsonb_array_elements_text(coalesce(p_payload->'receiver_stores',to_jsonb(prod.receiver_stores)));
   if coalesce(cardinality(v_senders),0)=0 or coalesce(cardinality(v_receivers),0)=0
      or exists(select 1 from unnest(v_senders||v_receivers) t where t is null or t !~ '^S(0[1-9]|1[01])$') then
     raise exception '請選擇允許出貨及收貨的直營門店';
   end if;
   update ops_transfer_private.products set sender_stores=v_senders,receiver_stores=v_receivers
     where id=prod.id returning * into prod;
   result := to_jsonb(prod);
  $patch$);
  execute body;
end $migration$;

-- User-approved route: Wujia -> Kaixuan / Yihua. Existing orders stay intact.
update ops_transfer_private.products
set sender_stores=array['S01'], receiver_stores=array['S02','S08'],
    stores=array['S01','S02','S08'], version=version+1
where code='TR-MEAT-PORK-CHOP';
