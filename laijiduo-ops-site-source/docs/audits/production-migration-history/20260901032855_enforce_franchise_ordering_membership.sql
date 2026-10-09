drop policy if exists "users read own app memberships" on public.app_account_memberships;

create policy "users read own app memberships"
on public.app_account_memberships
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select on table public.app_account_memberships to authenticated;
