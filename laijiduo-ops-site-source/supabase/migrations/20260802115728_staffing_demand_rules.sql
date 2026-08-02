begin;

create table if not exists public.store_staffing_demand_rules (
  id uuid primary key default gen_random_uuid(),
  store_code text not null references public.stores(store_code) on delete cascade,
  rule_type text not null,
  weekday smallint,
  special_date date,
  start_time time not null,
  end_time time not null,
  required_count integer not null,
  is_active boolean not null default true,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staffing_demand_rule_type_check check (rule_type in ('baseline','weekday','special')),
  constraint staffing_demand_weekday_check check (weekday is null or weekday between 0 and 6),
  constraint staffing_demand_time_check check (end_time > start_time and extract(minute from start_time) in (0,30) and extract(minute from end_time) in (0,30)),
  constraint staffing_demand_count_check check (required_count >= 0),
  constraint staffing_demand_scope_check check (
    (rule_type='baseline' and weekday is null and special_date is null)
    or (rule_type='weekday' and weekday is not null and special_date is null)
    or (rule_type='special' and weekday is null and special_date is not null)
  )
);

create unique index if not exists staffing_demand_rule_unique_idx
on public.store_staffing_demand_rules (
  store_code, rule_type, coalesce(weekday,-1), coalesce(special_date,date '1900-01-01'), start_time, end_time
);
create index if not exists staffing_demand_lookup_idx
on public.store_staffing_demand_rules (store_code, special_date, weekday, start_time, end_time)
where is_active;

alter table public.store_staffing_demand_rules enable row level security;
create policy "authenticated read staffing demand" on public.store_staffing_demand_rules for select to authenticated using (true);
create policy "headquarters manage staffing demand" on public.store_staffing_demand_rules for all to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'));
grant select, insert, update, delete on public.store_staffing_demand_rules to authenticated, service_role;

create or replace function public.get_store_staffing_demand(p_store_code text, p_target_date date, p_target_time time)
returns integer language sql stable security invoker set search_path=public as $$
  select coalesce((
    select rule_row.required_count
    from public.store_staffing_demand_rules rule_row
    where rule_row.store_code=p_store_code and rule_row.is_active
      and rule_row.start_time<=p_target_time and rule_row.end_time>p_target_time
      and (
        (rule_row.rule_type='special' and rule_row.special_date=p_target_date)
        or (rule_row.rule_type='weekday' and rule_row.weekday=extract(dow from p_target_date)::integer)
        or rule_row.rule_type='baseline'
      )
    order by case rule_row.rule_type when 'special' then 1 when 'weekday' then 2 else 3 end
    limit 1
  ),0);
$$;

revoke all on function public.get_store_staffing_demand(text,date,time) from public, anon;
grant execute on function public.get_store_staffing_demand(text,date,time) to authenticated, service_role;

commit;
