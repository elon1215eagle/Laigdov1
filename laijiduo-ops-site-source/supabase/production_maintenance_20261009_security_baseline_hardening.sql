-- APPLIED TO PRODUCTION: 2026-10-09 11:42 Asia/Taipei
-- Supabase project: wfhaqnicwqjfgzjcfmsq
-- Execution method: one guarded transaction through Supabase execute_sql
-- Scope: catalog hardening only. No business or HR data changes.
-- Do not re-run without a new maintenance approval and pre-flight snapshot.

begin;

alter function public.set_monthly_schedule_lock_updated_at()
  set search_path = pg_catalog;

alter function public.current_taipei_business_date()
  set search_path = pg_catalog;

revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;
grant execute on function public.rls_auto_enable() to service_role;

commit;

-- Verification
-- select p.proname, p.proconfig, p.proacl
-- from pg_proc p
-- join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public'
--   and p.proname in (
--     'set_monthly_schedule_lock_updated_at',
--     'current_taipei_business_date',
--     'rls_auto_enable'
--   );

-- Rollback (execute only after an approved rollback decision)
-- begin;
-- alter function public.set_monthly_schedule_lock_updated_at() reset search_path;
-- alter function public.current_taipei_business_date() reset search_path;
-- grant execute on function public.rls_auto_enable() to public, anon, authenticated, service_role;
-- commit;
