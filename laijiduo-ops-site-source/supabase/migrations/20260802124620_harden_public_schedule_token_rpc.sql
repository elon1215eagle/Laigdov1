alter function public.get_personal_schedule_by_token(text) rename to get_personal_schedule_by_token_legacy;

create or replace function private.get_personal_schedule_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_build_object(
    'status', case
      when link_row.revoked_at is not null then 'revoked'
      when link_row.expires_at <= now() then 'expired'
      else 'active'
    end,
    'period_month', link_row.period_month,
    'schedule_version', link_row.schedule_version,
    'expires_at', link_row.expires_at,
    'has_newer_version', (
      coalesce((select lock_row.schedule_version from public.monthly_schedule_locks lock_row where lock_row.period_month = link_row.period_month), link_row.schedule_version)
      > link_row.schedule_version
      or exists (
        select 1 from public.schedule_personal_links newer
        where newer.period_month = link_row.period_month
          and newer.staff_id = link_row.staff_id
          and newer.schedule_version > link_row.schedule_version
          and newer.revoked_at is null
      )
    ),
    'schedule', case
      when link_row.revoked_at is null and link_row.expires_at > now() then link_row.schedule_payload
      else null
    end
  )
  from public.schedule_personal_links link_row
  where link_row.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  limit 1;
$$;

revoke all on function private.get_personal_schedule_by_token(text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.get_personal_schedule_by_token(text) to anon, authenticated;

create function public.get_personal_schedule_by_token(p_token text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$
  select private.get_personal_schedule_by_token(p_token);
$$;

revoke all on function public.get_personal_schedule_by_token_legacy(text) from public, anon, authenticated;
drop function public.get_personal_schedule_by_token_legacy(text);
revoke all on function public.get_personal_schedule_by_token(text) from public;
grant execute on function public.get_personal_schedule_by_token(text) to anon, authenticated;
