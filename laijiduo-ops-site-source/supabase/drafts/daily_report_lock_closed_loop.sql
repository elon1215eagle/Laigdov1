-- Draft only. Apply to the development branch before production.

create table if not exists public.daily_report_change_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  reason text not null check (char_length(trim(reason)) >= 3),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'closed')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_report_change_requests_open_idx
on public.daily_report_change_requests (report_id)
where status in ('pending', 'approved');

create index if not exists daily_report_change_requests_store_id_idx
on public.daily_report_change_requests (store_id);

create index if not exists daily_report_change_requests_requested_by_idx
on public.daily_report_change_requests (requested_by);

create index if not exists daily_report_change_requests_reviewed_by_idx
on public.daily_report_change_requests (reviewed_by);

alter table public.daily_report_change_requests enable row level security;
grant select, insert, update on table public.daily_report_change_requests to authenticated;

drop policy if exists "hq staff update daily reports" on public.daily_reports;
create policy "hq staff update daily reports"
on public.daily_reports for update
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso'));

drop policy if exists "supervisors create review actions" on public.review_actions;
create policy "supervisors create review actions"
on public.review_actions for insert
to authenticated
with check (
  public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso')
  and created_by = (select auth.uid())
);

drop policy if exists "daily report change requests readable by scope" on public.daily_report_change_requests;
create policy "daily report change requests readable by scope"
on public.daily_report_change_requests for select
to authenticated
using (
  store_id = public.current_profile_store_id()
  or public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso')
);

drop policy if exists "store managers request own report changes" on public.daily_report_change_requests;
create policy "store managers request own report changes"
on public.daily_report_change_requests for insert
to authenticated
with check (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and requested_by = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1
    from public.daily_reports report
    where report.id = report_id
      and report.store_id = store_id
      and report.status::text = 'approved'
  )
);

drop policy if exists "headquarters review daily report change requests" on public.daily_report_change_requests;
create policy "headquarters review daily report change requests"
on public.daily_report_change_requests for update
to authenticated
using (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso'))
with check (public.current_profile_role()::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso'));

create or replace function public.review_daily_report_change_request(
  request_id uuid,
  decision text,
  decision_note text default ''
)
returns public.daily_report_change_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.daily_report_change_requests;
begin
  if public.current_profile_role()::text not in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso') then
    raise exception 'permission denied';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'invalid decision';
  end if;

  select *
  into request_row
  from public.daily_report_change_requests
  where id = request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'change request is not pending';
  end if;

  update public.daily_report_change_requests
  set
    status = decision,
    reviewed_by = auth.uid(),
    review_note = trim(coalesce(decision_note, '')),
    reviewed_at = now(),
    updated_at = now()
  where id = request_id
  returning * into request_row;

  if decision = 'approved' then
    update public.daily_reports
    set status = 'needs_revision'
    where id = request_row.report_id;
  end if;

  return request_row;
end;
$$;

revoke all on function public.review_daily_report_change_request(uuid, text, text) from public;
revoke all on function public.review_daily_report_change_request(uuid, text, text) from anon;
grant execute on function public.review_daily_report_change_request(uuid, text, text) to authenticated;

create or replace function public.close_daily_report_change_request_after_submit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_profile_role()::text <> 'store_manager'
    or new.store_id <> public.current_profile_store_id() then
    return new;
  end if;
  if new.status::text = 'submitted' and old.status::text = 'needs_revision' then
    update public.daily_report_change_requests
    set status = 'closed', updated_at = now()
    where report_id = new.id and status = 'approved';
  end if;
  return new;
end;
$$;

revoke all on function public.close_daily_report_change_request_after_submit() from public;
revoke all on function public.close_daily_report_change_request_after_submit() from anon;
revoke all on function public.close_daily_report_change_request_after_submit() from authenticated;

drop trigger if exists close_daily_report_change_request_after_submit on public.daily_reports;
create trigger close_daily_report_change_request_after_submit
after update of status on public.daily_reports
for each row
execute function public.close_daily_report_change_request_after_submit();

drop policy if exists "store managers update own editable reports" on public.daily_reports;
create policy "store managers update own editable reports"
on public.daily_reports for update
to authenticated
using (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and (
    status::text in ('draft', 'needs_revision')
    or exists (
      select 1
      from public.daily_report_change_requests request
      where request.report_id = daily_reports.id
        and request.status = 'approved'
    )
  )
)
with check (
  public.current_profile_role()::text = 'store_manager'
  and store_id = public.current_profile_store_id()
  and submitted_by = (select auth.uid())
  and status::text in ('draft', 'submitted', 'needs_revision')
);
