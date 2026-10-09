-- New module only: no existing business tables or Auth records are changed.
create schema if not exists ops_approval_private;
revoke all on schema ops_approval_private from public, anon;
grant usage on schema ops_approval_private to authenticated;

create table public.ops_approval_requests (
  id uuid primary key,
  number bigint generated always as identity unique,
  owner_id uuid not null references public.profiles(id),
  owner_name text not null,
  state text not null default 'draft' check (state in ('draft','pending','returned','approved','withdrawn')),
  version integer not null default 1,
  workflow_version integer not null default 1 check (workflow_version = 1),
  content jsonb not null default '{}'::jsonb,
  related_id uuid references public.ops_approval_requests(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz
);
create index on public.ops_approval_requests(owner_id, created_at desc);
create index on public.ops_approval_requests(state, created_at desc);
create table public.ops_approval_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.ops_approval_requests(id),
  action text not null,
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  actor_role text not null,
  reason text not null default '',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.ops_approval_events(request_id, id);
create table public.ops_approval_attachments (
  id uuid primary key,
  request_id uuid not null references public.ops_approval_requests(id),
  path text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
create index on public.ops_approval_attachments(request_id);

create function ops_approval_private.role_name() returns text
language sql stable security definer set search_path = '' as $$
 select p.role::text from public.profiles p where p.id=auth.uid() and p.is_active
 and p.role::text in ('ceo','coo','cfo','admin','hq','general_affairs','cso','supervisor')
$$;
create function ops_approval_private.can_read(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and ops_approval_private.role_name() is not null and exists (
 select 1 from public.ops_approval_requests r where r.id=p_id and
 (r.owner_id=auth.uid() or (r.state <> 'draft' and ops_approval_private.role_name() in ('ceo','coo','cfo'))))
$$;
alter table public.ops_approval_requests enable row level security;
alter table public.ops_approval_events enable row level security;
alter table public.ops_approval_attachments enable row level security;
revoke all on public.ops_approval_requests,public.ops_approval_events,public.ops_approval_attachments from anon,authenticated;
grant select on public.ops_approval_requests,public.ops_approval_events,public.ops_approval_attachments to authenticated;
create policy approval_read on public.ops_approval_requests for select to authenticated using (ops_approval_private.can_read(id));
create policy approval_event_read on public.ops_approval_events for select to authenticated using (ops_approval_private.can_read(request_id));
create policy approval_attachment_read on public.ops_approval_attachments for select to authenticated using (ops_approval_private.can_read(request_id));

create function ops_approval_private.command(p_id uuid,p_action text,p_version integer,p_content jsonb,p_reason text,p_related uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.ops_approval_requests%rowtype; v_role text; v_name text; v_amount numeric; v_content jsonb;
begin
 v_role := ops_approval_private.role_name();
 if auth.uid() is null or v_role is null then raise exception 'approval_forbidden' using errcode='42501'; end if;
 select full_name into v_name from public.profiles where id=auth.uid();
 if length(coalesce(p_reason,'')) > 2000 then raise exception 'approval_reason_too_long'; end if;
 if p_action='create' then
   if p_related is not null and (not ops_approval_private.can_read(p_related) or not exists(select 1 from public.ops_approval_requests where id=p_related and state='approved')) then raise exception 'approval_related_invalid'; end if;
   insert into public.ops_approval_requests(id,owner_id,owner_name,related_id) values(p_id,auth.uid(),coalesce(v_name,''),p_related) returning * into r;
 else
   select * into r from public.ops_approval_requests where id=p_id for update;
   if not found or not ops_approval_private.can_read(p_id) then raise exception 'approval_forbidden' using errcode='42501'; end if;
   if p_version is distinct from r.version then raise exception 'approval_stale_version'; end if;
   if p_action in ('save','submit','withdraw','attach') and r.owner_id <> auth.uid() then raise exception 'approval_forbidden' using errcode='42501'; end if;
   if p_action in ('save','attach') and r.state not in ('draft','returned') then raise exception 'approval_locked'; end if;
   if p_action='save' then
     if jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text)>20000 then raise exception 'approval_invalid_content'; end if;
     v_content := jsonb_build_object('type',coalesce(p_content->>'type','payment'),'scope',coalesce(p_content->>'scope','HQ'),'subject',trim(coalesce(p_content->>'subject','')),'payee',trim(coalesce(p_content->>'payee','')),'amount',coalesce(p_content->>'amount',''),'note',coalesce(p_content->>'note',''));
     if v_content->>'type' not in ('payment','purchase') or length(v_content->>'subject')>200 or length(v_content->>'payee')>200 or length(v_content->>'note')>4000 then raise exception 'approval_invalid_content'; end if;
     if v_content->>'scope' <> 'HQ' and not exists(select 1 from public.stores where store_code=v_content->>'scope') then raise exception 'approval_invalid_scope'; end if;
     r.content := v_content;
   elsif p_action='submit' then
     if r.state not in ('draft','returned') then raise exception 'approval_locked'; end if;
     if length(trim(coalesce(r.content->>'subject','')))=0 or length(trim(coalesce(r.content->>'payee','')))=0 or coalesce(r.content->>'amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'approval_required_fields'; end if;
     v_amount := (r.content->>'amount')::numeric;
     if v_amount<=0 then raise exception 'approval_invalid_amount'; end if;
     if not exists(select 1 from public.profiles where role::text='cfo' and is_active) then raise exception 'approval_no_reviewer'; end if;
     r.state := 'pending'; r.submitted_at := now();
   elsif p_action in ('approve','return') then
     if v_role <> 'cfo' then raise exception 'approval_forbidden' using errcode='42501'; end if;
     if r.state <> 'pending' then raise exception 'approval_locked'; end if;
     if p_action='return' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'approval_reason_required'; end if;
     r.state := case when p_action='approve' then 'approved' else 'returned' end;
     if p_action='approve' then r.closed_at := now(); end if;
   elsif p_action='withdraw' then
     if r.state not in ('draft','returned','pending') then raise exception 'approval_locked'; end if;
     if length(trim(coalesce(p_reason,'')))=0 then raise exception 'approval_reason_required'; end if;
     r.state := 'withdrawn'; r.closed_at := now();
   elsif p_action='attach' then
     if (select count(*) from public.ops_approval_attachments where request_id=p_id)>=10 then raise exception 'approval_attachment_limit'; end if;
     if length(coalesce(p_content->>'name','')) not between 1 and 255 or split_part(p_content->>'path','/',1) <> p_id::text then raise exception 'approval_invalid_attachment'; end if;
     if not exists(select 1 from storage.objects where bucket_id='ops-approval-files' and name=p_content->>'path') then raise exception 'approval_attachment_missing'; end if;
     insert into public.ops_approval_attachments(id,request_id,path,name) values((p_content->>'id')::uuid,p_id,p_content->>'path',p_content->>'name');
   else raise exception 'approval_invalid_action';
   end if;
   update public.ops_approval_requests set content=r.content,state=r.state,version=version+1,updated_at=now(),submitted_at=r.submitted_at,closed_at=r.closed_at where id=p_id returning * into r;
 end if;
 insert into public.ops_approval_events(request_id,action,actor_id,actor_name,actor_role,reason,snapshot)
 values(p_id,p_action,auth.uid(),coalesce(v_name,''),v_role,coalesce(p_reason,''),to_jsonb(r) || jsonb_build_object('attachments',coalesce((select jsonb_agg(to_jsonb(a)) from public.ops_approval_attachments a where request_id=p_id),'[]'::jsonb)));
 return to_jsonb(r);
end $$;
-- The public RPC has no elevated privileges; the private command is the only writer.
create function public.ops_approval_command(p_id uuid,p_action text,p_version integer default null,p_content jsonb default '{}'::jsonb,p_reason text default '',p_related uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select ops_approval_private.command(p_id,p_action,p_version,p_content,p_reason,p_related)
$$;
revoke all on all functions in schema ops_approval_private from public,anon;
grant execute on all functions in schema ops_approval_private to authenticated;
revoke all on function public.ops_approval_command(uuid,text,integer,jsonb,text,uuid) from public,anon;
grant execute on function public.ops_approval_command(uuid,text,integer,jsonb,text,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ops-approval-files','ops-approval-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy approval_file_upload on storage.objects for insert to authenticated with check (
 bucket_id='ops-approval-files' and ops_approval_private.role_name() is not null and exists(
 select 1 from public.ops_approval_requests r where r.id::text=split_part(name,'/',1) and r.owner_id=auth.uid() and r.state in ('draft','returned'))
);
create policy approval_file_read on storage.objects for select to authenticated using (
 bucket_id='ops-approval-files' and exists(select 1 from public.ops_approval_attachments a where a.path=name and ops_approval_private.can_read(a.request_id))
);
