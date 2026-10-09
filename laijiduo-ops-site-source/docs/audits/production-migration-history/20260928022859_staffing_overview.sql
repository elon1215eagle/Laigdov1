-- Isolated staffing display module. Existing HR, scheduling, Auth and store tables are read only.
create schema if not exists ops_staffing_private;
revoke all on schema ops_staffing_private from public, anon, authenticated;

create table ops_staffing_private.pages (
  store_code text primary key,
  draft_content jsonb not null default '{}'::jsonb,
  published_content jsonb,
  version integer not null default 1 check (version > 0),
  published_version integer not null default 0 check (published_version >= 0),
  updated_by uuid not null references public.profiles(id),
  published_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table ops_staffing_private.events (
  id bigint generated always as identity primary key,
  store_code text not null,
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  actor_role text not null,
  action text not null check (action in ('save_draft', 'publish')),
  reason text not null default '',
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index staffing_events_store_created on ops_staffing_private.events(store_code, created_at desc);

create table ops_staffing_private.commands (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create function ops_staffing_private.actor() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(p.full_name, ''),
    'role', p.role::text,
    'store', s.store_code,
    'view_all', p.role::text in ('ceo','coo','cfo','cso','general_affairs','admin','hq','supervisor'),
    'manage', p.role::text in ('ceo','coo','cso','general_affairs','admin','hq')
  )
  from public.profiles p
  left join public.stores s on s.id = p.store_id
  where p.id = auth.uid() and p.is_active = true
$$;

create function public.ops_staffing_display_api(p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := ops_staffing_private.actor();
  page ops_staffing_private.pages%rowtype;
  command ops_staffing_private.commands%rowtype;
  store_code_value text := upper(trim(coalesce(p_payload->>'store_code', '')));
  command_id uuid;
  expected_version integer := coalesce((p_payload->>'expected_version')::integer, 0);
  content_value jsonb := p_payload->'content';
  reason_value text := trim(coalesce(p_payload->>'reason', ''));
  before_value jsonb;
  answer jsonb;
  visible_record jsonb;
begin
  if a is null then raise exception 'staffing_forbidden' using errcode = '42501'; end if;
  if p_action not in ('read', 'save_draft', 'publish') then raise exception 'staffing_invalid_action'; end if;
  if store_code_value = '' or not exists(select 1 from public.stores s where upper(s.store_code) = store_code_value) then
    raise exception 'staffing_invalid_store';
  end if;

  if p_action = 'read' then
    if not coalesce((a->>'view_all')::boolean, false) and a->>'store' is distinct from store_code_value then
      raise exception 'staffing_forbidden' using errcode = '42501';
    end if;
    select * into page from ops_staffing_private.pages where store_code = store_code_value;
    if page.store_code is null then
      return jsonb_build_object('record', null, 'events', '[]'::jsonb);
    end if;
    visible_record := case when coalesce((a->>'manage')::boolean, false)
      then to_jsonb(page)
      else jsonb_build_object(
        'store_code', page.store_code,
        'published_content', page.published_content,
        'published_version', page.published_version,
        'published_at', page.published_at
      ) end;
    return jsonb_build_object(
      'record', visible_record,
      'events', case when coalesce((a->>'manage')::boolean, false) then coalesce((
        select jsonb_agg(to_jsonb(event_row) order by event_row.created_at desc)
        from (select * from ops_staffing_private.events e where e.store_code = store_code_value order by e.created_at desc limit 20) event_row
      ), '[]'::jsonb) else '[]'::jsonb end
    );
  end if;

  if not coalesce((a->>'manage')::boolean, false) then raise exception 'staffing_forbidden' using errcode = '42501'; end if;
  if length(reason_value) not between 1 and 200 then raise exception 'staffing_reason_required'; end if;
  command_id := (p_payload->>'command_id')::uuid;
  if command_id is null then raise exception 'staffing_command_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(command_id::text, 0));
  select * into command from ops_staffing_private.commands where id = command_id;
  if command.id is not null then
    if command.actor_id <> (a->>'id')::uuid or command.action <> p_action or command.payload <> p_payload then
      raise exception 'staffing_command_reused';
    end if;
    return command.response;
  end if;

  select * into page from ops_staffing_private.pages where store_code = store_code_value for update;
  if page.store_code is null then
    if p_action = 'publish' then raise exception 'staffing_draft_missing'; end if;
    if expected_version <> 0 then raise exception 'staffing_stale_version'; end if;
  elsif page.version <> expected_version then
    raise exception 'staffing_stale_version';
  end if;
  before_value := case when page.store_code is null then null else to_jsonb(page) end;

  if p_action = 'save_draft' then
    if content_value is null or jsonb_typeof(content_value) <> 'object' or octet_length(content_value::text) > 100000 then
      raise exception 'staffing_invalid_content';
    end if;
    if jsonb_typeof(content_value->'people') <> 'array' or jsonb_array_length(content_value->'people') > 100 then
      raise exception 'staffing_invalid_people';
    end if;
    insert into ops_staffing_private.pages(store_code, draft_content, version, updated_by)
    values(store_code_value, content_value, 1, (a->>'id')::uuid)
    on conflict(store_code) do update set
      draft_content = excluded.draft_content,
      version = ops_staffing_private.pages.version + 1,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning * into page;
  else
    if page.draft_content is null or page.draft_content = '{}'::jsonb then raise exception 'staffing_draft_missing'; end if;
    update ops_staffing_private.pages set
      published_content = draft_content,
      published_version = published_version + 1,
      version = version + 1,
      published_by = (a->>'id')::uuid,
      published_at = now(),
      updated_by = (a->>'id')::uuid,
      updated_at = now()
    where store_code = store_code_value
    returning * into page;
  end if;

  insert into ops_staffing_private.events(store_code, actor_id, actor_name, actor_role, action, reason, before_state, after_state)
  values(store_code_value, (a->>'id')::uuid, a->>'name', a->>'role', p_action, reason_value, before_value, to_jsonb(page));

  answer := jsonb_build_object(
    'record', to_jsonb(page),
    'events', coalesce((
      select jsonb_agg(to_jsonb(event_row) order by event_row.created_at desc)
      from (select * from ops_staffing_private.events e where e.store_code = store_code_value order by e.created_at desc limit 20) event_row
    ), '[]'::jsonb)
  );
  insert into ops_staffing_private.commands(id, actor_id, action, payload, response)
  values(command_id, (a->>'id')::uuid, p_action, p_payload, answer);
  return answer;
end $$;

revoke all on all tables in schema ops_staffing_private from public, anon, authenticated;
revoke all on all functions in schema ops_staffing_private from public, anon, authenticated;
revoke all on function public.ops_staffing_display_api(text, jsonb) from public, anon;
grant execute on function public.ops_staffing_display_api(text, jsonb) to authenticated;
