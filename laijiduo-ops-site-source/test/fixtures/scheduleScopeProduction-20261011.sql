-- Read-only production function snapshot; dependencies are synthetic in tests.
-- Original prosrc MD5: e38c23ff5ab80103cc4252d93c3e480f (2026-10-11).
CREATE OR REPLACE FUNCTION private.store_owns_schedule_request_scope(p_store_code text, p_request_scope_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select
    p_request_scope_code = p_store_code
    or exists (
      select 1
      from public.store_relation_groups relation_group
      join public.store_relation_group_members member on member.group_id = relation_group.id
      join public.store_management_relations management
        on management.managing_store_code = p_store_code
       and management.managed_store_code = member.store_code
       and management.relationship_type = 'schedule_management'
       and management.is_active
       and management.effective_from <= current_date
       and (management.effective_to is null or management.effective_to >= current_date)
      where relation_group.group_code = p_request_scope_code
        and relation_group.coordinating_store_code = p_store_code
        and relation_group.schedule_shared
        and relation_group.is_active
    );
$function$;
