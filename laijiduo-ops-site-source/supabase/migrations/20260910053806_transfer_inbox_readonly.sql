create or replace function public.ops_transfer_inbox()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a jsonb := ops_transfer_private.actor(); result jsonb;
begin
  with actionable as (
    select r.* from ops_transfer_private.requests r
    where ((a->>'is_hq')::boolean or a->>'store' in (r.sender,r.receiver))
      and (
        (r.status='requested' and ((a->>'is_hq')::boolean or a->>'store'=r.sender))
        or (r.status='shipped' and ((a->>'is_hq')::boolean or a->>'store'=r.receiver))
        or (r.status='disputed' and (
          (coalesce(r.data->>'resolution','')='' and ((a->>'is_hq')::boolean or a->>'store'=r.sender))
          or (coalesce(r.data->>'resolution','')<>'' and (
            (not coalesce((r.data->>'sender_ack')::boolean,false) and ((a->>'is_hq')::boolean or a->>'store'=r.sender))
            or (not coalesce((r.data->>'receiver_ack')::boolean,false) and ((a->>'is_hq')::boolean or a->>'store'=r.receiver))
          ))
        ))
      )
  ), preview as (
    select * from actionable order by updated_at desc,id limit 20
  )
  select jsonb_build_object(
    'counts',jsonb_build_object(
      'requested',(select count(*) from actionable where status='requested'),
      'shipped',(select count(*) from actionable where status='shipped'),
      'disputed',(select count(*) from actionable where status='disputed')),
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'number',number,'status',status,'sender_name',data->>'sender_name',
      'receiver_name',data->>'receiver_name','updated_at',updated_at
    ) order by updated_at desc,id),'[]'::jsonb) from preview),
    'checked_at',now()
  ) into result;
  return result;
end $$;
revoke all on function public.ops_transfer_inbox() from public,anon;
grant execute on function public.ops_transfer_inbox() to authenticated;
