begin;

drop policy if exists "headquarters manage store staff" on public.store_staff;
create policy "headquarters manage store staff"
on public.store_staff
for all
to authenticated
using ((select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo', 'coo', 'cfo', 'admin', 'hq', 'cso', 'general_affairs'));

commit;
