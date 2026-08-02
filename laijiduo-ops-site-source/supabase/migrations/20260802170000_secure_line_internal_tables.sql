begin;

alter table public.line_group_messages enable row level security;
alter table public.line_tasks enable row level security;
alter table public.line_task_events enable row level security;

revoke all on table public.line_group_messages from anon, authenticated;
revoke all on table public.line_tasks from anon, authenticated;
revoke all on table public.line_task_events from anon, authenticated;

revoke execute on function public.current_profile_role() from anon;
revoke execute on function public.current_profile_store_id() from anon;
revoke execute on function public.current_franchise_role() from anon;
revoke execute on function public.current_franchise_store_id() from anon;

alter function public.set_monthly_leave_plans_updated_at()
  set search_path = pg_catalog, public;
alter function public.set_store_staff_updated_at()
  set search_path = pg_catalog, public;

commit;
