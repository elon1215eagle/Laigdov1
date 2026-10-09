do $guard$
begin
  if md5(pg_get_functiondef('public.request_coo_salary_access(text)'::regprocedure)) <> '3242450f53721bdefa6ef75aef7316f7' then
    raise exception 'request_coo_salary_access definition drifted; aborting';
  end if;
  if md5(pg_get_functiondef('public.review_staffing_demand_change_request(uuid,text,text)'::regprocedure)) <> '4deb375f0fb7e2cf97d0578324128c00' then
    raise exception 'review_staffing_demand_change_request definition drifted; aborting';
  end if;
  if md5(pg_get_functiondef('public.revoke_personal_schedule_link(uuid)'::regprocedure)) <> '69104b281bf0400d1df24715a4a3b186' then
    raise exception 'revoke_personal_schedule_link definition drifted; aborting';
  end if;
end;
$guard$;

create or replace function public.request_coo_salary_access(p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  caller_id uuid := auth.uid();
  expiry timestamptz := now() + interval '15 minutes';
begin
  if caller_id is null then
    raise exception 'authentication required';
  end if;
  if public.current_profile_role()::text is distinct from 'coo' then
    raise exception 'only COO may request temporary salary access';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason is required';
  end if;

  insert into public.salary_access_events(user_id, role_name, reason, expires_at)
  values (caller_id, 'coo', trim(p_reason), expiry);

  return expiry;
end;
$function$;

create or replace function public.review_staffing_demand_change_request(
  p_request_id uuid,
  p_status text,
  p_review_note text default ''::text
)
returns public.staffing_demand_change_requests
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  caller_id uuid := auth.uid();
  request_row public.staffing_demand_change_requests;
  rule_row public.store_staffing_demand_rules;
begin
  if caller_id is null then
    raise exception 'authentication required';
  end if;
  if public.current_profile_role()::text not in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs') then
    raise exception 'insufficient privilege';
  end if;
  if p_status not in ('approved', 'rejected', 'closed') then
    raise exception 'invalid status';
  end if;

  select *
  into request_row
  from public.staffing_demand_change_requests
  where id = p_request_id
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception 'request unavailable';
  end if;

  if p_status = 'approved' then
    insert into public.store_staffing_demand_rules (
      store_code,
      rule_type,
      weekday,
      special_date,
      start_time,
      end_time,
      required_count,
      is_active,
      created_by
    ) values (
      request_row.store_code,
      coalesce(request_row.proposed_rule->>'rule_type', 'baseline'),
      nullif(request_row.proposed_rule->>'weekday', '')::integer,
      nullif(request_row.proposed_rule->>'special_date', '')::date,
      (request_row.proposed_rule->>'start_time')::time,
      (request_row.proposed_rule->>'end_time')::time,
      (request_row.proposed_rule->>'required_count')::integer,
      true,
      caller_id
    )
    returning * into rule_row;
  end if;

  update public.staffing_demand_change_requests
  set status = p_status,
      reviewed_by = caller_id,
      reviewed_at = now(),
      review_note = coalesce(p_review_note, ''),
      resulting_rule_id = case when p_status = 'approved' then rule_row.id else null end,
      updated_at = now()
  where id = p_request_id
  returning * into request_row;

  return request_row;
end;
$function$;

create or replace function public.revoke_personal_schedule_link(p_link_id uuid)
returns public.schedule_personal_links
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  caller_id uuid := auth.uid();
  target_row public.schedule_personal_links;
begin
  if caller_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into target_row
  from public.schedule_personal_links
  where id = p_link_id
  for update;

  if target_row.id is null then
    raise exception '找不到個人班表連結';
  end if;
  if not private.can_manage_personal_schedule_link(target_row.home_store_code, target_row.period_month) then
    raise exception '無權撤銷此連結';
  end if;

  update public.schedule_personal_links
  set revoked_at = now(), revoked_by = caller_id
  where id = p_link_id
  returning * into target_row;

  return target_row;
end;
$function$;

revoke all on function public.request_coo_salary_access(text) from public, anon;
grant execute on function public.request_coo_salary_access(text) to authenticated;

revoke all on function public.review_staffing_demand_change_request(uuid, text, text) from public, anon;
grant execute on function public.review_staffing_demand_change_request(uuid, text, text) to authenticated;

revoke all on function public.revoke_personal_schedule_link(uuid) from public, anon;
grant execute on function public.revoke_personal_schedule_link(uuid) to authenticated;
