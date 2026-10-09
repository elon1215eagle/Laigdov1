create function public.ops_transfer_product_history(p_product_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb:=ops_transfer_private.actor();
begin
 if not (a->>'is_hq')::boolean then raise exception '僅總部可查閱品項設定紀錄'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(e) order by e.id desc),'[]') from ops_transfer_private.events e where product_id=p_product_id);
end $$;
revoke all on function public.ops_transfer_product_history(uuid) from public,anon;
grant execute on function public.ops_transfer_product_history(uuid) to authenticated;
