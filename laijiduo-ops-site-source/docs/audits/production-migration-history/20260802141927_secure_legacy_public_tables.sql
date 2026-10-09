alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_settings enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

drop policy if exists "headquarters manage profiles" on public.profiles;
create policy "headquarters manage profiles"
on public.profiles for all to authenticated
using ((select private.is_headquarters_role()))
with check ((select private.is_headquarters_role()));

drop policy if exists "authenticated read stores" on public.stores;
create policy "authenticated read stores"
on public.stores for select to authenticated using (true);

drop policy if exists "headquarters manage stores" on public.stores;
create policy "headquarters manage stores"
on public.stores for all to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','cfo','admin','hq'))
with check ((select public.current_profile_role())::text in ('ceo','coo','cfo','admin','hq'));

drop policy if exists "authenticated read store settings" on public.store_settings;
create policy "authenticated read store settings"
on public.store_settings for select to authenticated using (true);

drop policy if exists "headquarters manage store settings" on public.store_settings;
create policy "headquarters manage store settings"
on public.store_settings for all to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq'))
with check ((select public.current_profile_role())::text in ('ceo','coo','admin','hq'));
