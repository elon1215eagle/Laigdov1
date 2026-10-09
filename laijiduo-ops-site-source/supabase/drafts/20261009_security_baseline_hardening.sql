-- DRAFT ONLY - DO NOT APPLY DIRECTLY TO PRODUCTION
-- Scope: catalog hardening only. No business or HR data changes.
-- Preconditions:
-- 1. Run production_security_catalog_audit.sql and archive the result.
-- 2. Verify public ordering and quick-checkout RPC regression tests.
-- 3. Apply in an isolated Supabase project first.
-- 4. Record rollback evidence.

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
