create table if not exists public.monthly_leave_plan_audit (
  id bigint generated always as identity primary key,
  period_month text not null,
  staff_id text not null,
  store_code text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  reason text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists monthly_leave_plan_audit_lookup_idx
  on public.monthly_leave_plan_audit (period_month, store_code, changed_at desc);
alter table public.monthly_leave_plan_audit enable row level security;
grant select on public.monthly_leave_plan_audit to authenticated;
create policy "headquarters read leave audit" on public.monthly_leave_plan_audit
for select to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

create or replace function public.audit_monthly_leave_plan_change()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare source_row public.monthly_leave_plans;
begin
  if tg_op = 'DELETE' then source_row := old; else source_row := new; end if;
  insert into public.monthly_leave_plan_audit (
    period_month, staff_id, store_code, action, reason,
    before_data, after_data, changed_by
  ) values (
    source_row.period_month, source_row.staff_id::text, source_row.store_code,
    lower(tg_op),
    coalesce(nullif(trim(source_row.note), ''), '排假異動'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists audit_monthly_leave_plan_changes on public.monthly_leave_plans;
create trigger audit_monthly_leave_plan_changes
after insert or update or delete on public.monthly_leave_plans
for each row execute function public.audit_monthly_leave_plan_change();

create table if not exists public.staffing_demand_change_requests (
  id uuid primary key default gen_random_uuid(),
  store_code text not null references public.stores(store_code),
  reason text not null check (length(trim(reason)) >= 3),
  proposed_rule jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'closed')),
  requested_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text not null default '',
  resulting_rule_id uuid references public.store_staffing_demand_rules(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staffing_demand_change_requests_store_status_idx
  on public.staffing_demand_change_requests (store_code, status, created_at desc);
alter table public.staffing_demand_change_requests enable row level security;
grant select, insert on public.staffing_demand_change_requests to authenticated;
create policy "headquarters read demand requests" on public.staffing_demand_change_requests
for select to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));
create policy "stores read own demand requests" on public.staffing_demand_change_requests
for select to authenticated
using (exists (
  select 1 from public.stores s
  where s.id = public.current_profile_store_id() and s.store_code = staffing_demand_change_requests.store_code
));
create policy "stores create own demand requests" on public.staffing_demand_change_requests
for insert to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1 from public.stores s
    where s.id = public.current_profile_store_id() and s.store_code = staffing_demand_change_requests.store_code
  )
);

create or replace function public.review_staffing_demand_change_request(
  p_request_id uuid, p_status text, p_review_note text default ''
) returns public.staffing_demand_change_requests
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare request_row public.staffing_demand_change_requests;
declare rule_row public.store_staffing_demand_rules;
begin
  if public.current_profile_role()::text not in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then
    raise exception 'insufficient privilege';
  end if;
  if p_status not in ('approved', 'rejected', 'closed') then raise exception 'invalid status'; end if;
  select * into request_row from public.staffing_demand_change_requests where id = p_request_id for update;
  if not found or request_row.status <> 'pending' then raise exception 'request unavailable'; end if;
  if p_status = 'approved' then
    insert into public.store_staffing_demand_rules (
      store_code, rule_type, weekday, special_date, start_time, end_time,
      required_count, is_active, created_by
    ) values (
      request_row.store_code,
      coalesce(request_row.proposed_rule->>'rule_type', 'baseline'),
      nullif(request_row.proposed_rule->>'weekday', '')::integer,
      nullif(request_row.proposed_rule->>'special_date', '')::date,
      (request_row.proposed_rule->>'start_time')::time,
      (request_row.proposed_rule->>'end_time')::time,
      (request_row.proposed_rule->>'required_count')::integer,
      true, auth.uid()
    ) returning * into rule_row;
  end if;
  update public.staffing_demand_change_requests
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = coalesce(p_review_note, ''),
      resulting_rule_id = case when p_status = 'approved' then rule_row.id else null end,
      updated_at = now()
  where id = p_request_id returning * into request_row;
  return request_row;
end;
$$;
revoke all on function public.review_staffing_demand_change_request(uuid, text, text) from public, anon;
grant execute on function public.review_staffing_demand_change_request(uuid, text, text) to authenticated;
