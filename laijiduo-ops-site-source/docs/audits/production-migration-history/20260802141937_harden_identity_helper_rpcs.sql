begin;

revoke all on function public.current_profile_role() from public, anon;
revoke all on function public.current_profile_store_id() from public, anon;
revoke all on function public.current_franchise_role() from public, anon;
revoke all on function public.current_franchise_store_id() from public, anon;

grant execute on function public.current_profile_role() to authenticated, service_role;
grant execute on function public.current_profile_store_id() to authenticated, service_role;
grant execute on function public.current_franchise_role() to authenticated, service_role;
grant execute on function public.current_franchise_store_id() to authenticated, service_role;

commit;
