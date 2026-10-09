-- Production security catalog audit
-- Read-only: this file contains SELECT statements only.

select current_database() as database_name, current_timestamp as checked_at;

select
  count(*) filter (where c.relkind in ('r','p')) as public_tables,
  count(*) filter (where c.relkind in ('r','p') and c.relrowsecurity) as rls_enabled,
  count(*) filter (where c.relkind in ('r','p') and not c.relrowsecurity) as rls_disabled,
  count(*) filter (where c.relkind='v') as views
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v');

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       count(pol.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies pol
  on pol.schemaname=n.nspname and pol.tablename=c.relname
where n.nspname='public' and c.relkind in ('r','p')
group by c.oid,c.relname,c.relrowsecurity
order by c.relname;

select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       exists (
         select 1
         from unnest(coalesce(p.proconfig,array[]::text[])) cfg
         where cfg like 'search_path=%'
       ) as fixed_search_path,
       has_function_privilege('anon',p.oid,'execute') as anon_execute,
       has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
order by p.proname,arguments;

select c.relname as view_name, c.reloptions
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
order by c.relname;
