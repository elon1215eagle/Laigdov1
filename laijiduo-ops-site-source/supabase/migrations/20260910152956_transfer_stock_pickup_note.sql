-- Annotation only: no inventory writes and no rewriting historical orders.
do $migration$
declare body text := pg_get_functiondef('public.ops_transfer_api(text,jsonb)'::regprocedure);
 pair text[];
begin
 foreach pair slice 1 in array array[
  array[$old$qty := (line->>'quantity')::numeric; u := line->>'unit';$old$,
        $new$if line ? 'stock_pickup' and jsonb_typeof(line->'stock_pickup')<>'boolean' then
       raise exception '庫存取貨須為勾選或未勾選';
     end if;
     if coalesce((line->>'stock_pickup')::boolean,false) and not (prod.category='肉品' or prod.name='地瓜') then
       raise exception '只有肉類及地瓜可選庫存取貨';
     end if;
     qty := (line->>'quantity')::numeric; u := line->>'unit';$new$],
  array[$old$'category',prod.category,'unit',u,'quantity',qty$old$,
        $new$'category',prod.category,'unit',u,'quantity',qty,'stock_pickup',coalesce((line->>'stock_pickup')::boolean,false)$new$]
 ] loop
  if cardinality(string_to_array(body,pair[1]))<>2 then
   raise exception 'Transfer API baseline differs. Review stock pickup migration before applying.';
  end if;
  body:=replace(body,pair[1],pair[2]);
 end loop;
 execute body;
end $migration$;
