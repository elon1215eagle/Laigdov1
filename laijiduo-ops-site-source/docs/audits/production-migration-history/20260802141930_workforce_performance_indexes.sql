create index if not exists schedule_personal_links_created_by_idx
on public.schedule_personal_links (created_by);
create index if not exists schedule_personal_links_home_store_code_idx
on public.schedule_personal_links (home_store_code);
create index if not exists schedule_personal_links_revoked_by_idx
on public.schedule_personal_links (revoked_by) where revoked_by is not null;
create index if not exists staffing_demand_created_by_idx
on public.store_staffing_demand_rules (created_by) where created_by is not null;
create index if not exists workforce_rollout_audit_changed_by_idx
on public.workforce_rollout_audit_log (changed_by) where changed_by is not null;
create index if not exists workforce_rollout_settings_updated_by_idx
on public.workforce_rollout_settings (updated_by) where updated_by is not null;

drop policy if exists "headquarters manage staffing demand" on public.store_staffing_demand_rules;
drop policy if exists "headquarters insert staffing demand" on public.store_staffing_demand_rules;
create policy "headquarters insert staffing demand"
on public.store_staffing_demand_rules for insert to authenticated
with check ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'));
drop policy if exists "headquarters update staffing demand" on public.store_staffing_demand_rules;
create policy "headquarters update staffing demand"
on public.store_staffing_demand_rules for update to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'));
drop policy if exists "headquarters delete staffing demand" on public.store_staffing_demand_rules;
create policy "headquarters delete staffing demand"
on public.store_staffing_demand_rules for delete to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'));
