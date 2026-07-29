-- Draft only. Create the final migration with Supabase CLI after staging review.

alter table public.stores
  add column if not exists operating_status text;

update public.stores
set operating_status = case
  when store_code = 'S06' then 'suspended'
  when coalesce(is_active, true) then 'active'
  else 'closed'
end
where operating_status is null;

alter table public.stores
  alter column operating_status set default 'active';

alter table public.stores
  alter column operating_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_operating_status_check'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_operating_status_check
      check (operating_status in ('active', 'suspended', 'closed'));
  end if;
end
$$;

create table if not exists public.store_relation_groups (
  id uuid primary key default gen_random_uuid(),
  group_code text not null unique,
  group_name text not null,
  coordinating_store_code text not null references public.stores(store_code),
  demand integer not null default 0 check (demand >= 0),
  rule_note text not null default '',
  schedule_shared boolean not null default true,
  staffing_shared boolean not null default true,
  temporary_support_shared boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_relation_group_members (
  group_id uuid not null references public.store_relation_groups(id) on delete cascade,
  store_code text not null references public.stores(store_code),
  created_at timestamptz not null default now(),
  primary key (group_id, store_code)
);

insert into public.store_relation_groups (
  group_code,
  group_name,
  coordinating_store_code,
  demand,
  rule_note
)
values
  ('S01-S06', '鳳山五甲店 + 鳳山南華店', 'S01', 5, '五甲與南華合併排假 / 合併看人力；南華暫停營業期間由五甲統籌。'),
  ('S02-S03', '鳳山凱旋店 + 鳳山武廟店', 'S02', 5, '凱旋與武廟合併排假、合併看人力及臨時支援。')
on conflict (group_code) do update
set group_name = excluded.group_name,
    coordinating_store_code = excluded.coordinating_store_code,
    demand = excluded.demand,
    rule_note = excluded.rule_note,
    schedule_shared = true,
    staffing_shared = true,
    temporary_support_shared = true,
    is_active = true,
    updated_at = now();

insert into public.store_relation_group_members (group_id, store_code)
select group_row.id, member.store_code
from (
  values
    ('S01-S06', 'S01'),
    ('S01-S06', 'S06'),
    ('S02-S03', 'S02'),
    ('S02-S03', 'S03')
) as member(group_code, store_code)
join public.store_relation_groups group_row
  on group_row.group_code = member.group_code
join public.stores store_row
  on store_row.store_code = member.store_code
on conflict (group_id, store_code) do nothing;

alter table public.store_relation_groups enable row level security;
alter table public.store_relation_group_members enable row level security;

grant select, insert, update, delete
  on table public.store_relation_groups
  to authenticated;

grant select, insert, update, delete
  on table public.store_relation_group_members
  to authenticated;

drop policy if exists "authenticated users read store relation groups"
  on public.store_relation_groups;
create policy "authenticated users read store relation groups"
  on public.store_relation_groups
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated users read store relation members"
  on public.store_relation_group_members;
create policy "authenticated users read store relation members"
  on public.store_relation_group_members
  for select
  to authenticated
  using (true);

drop policy if exists "headquarters manage store relation groups"
  on public.store_relation_groups;
create policy "headquarters manage store relation groups"
  on public.store_relation_groups
  for all
  to authenticated
  using (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs')
  )
  with check (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs')
  );

drop policy if exists "headquarters manage store relation members"
  on public.store_relation_group_members;
create policy "headquarters manage store relation members"
  on public.store_relation_group_members
  for all
  to authenticated
  using (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs')
  )
  with check (
    (select public.current_profile_role())::text in
      ('ceo', 'coo', 'admin', 'hq', 'cso', 'general_affairs')
  );
