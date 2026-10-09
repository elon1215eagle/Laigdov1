begin;

create table if not exists public.work_positions (
  code text primary key,
  display_name text not null unique,
  sort_order integer not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint work_positions_code_check check (code in ('店長值班','櫃台','炸台','備料','包裝','外送','後勤','送貨'))
);

insert into public.work_positions (code, display_name, sort_order)
values ('店長值班','店長值班',10),('櫃台','櫃台',20),('炸台','炸台',30),('備料','備料',40),('包裝','包裝',50),('外送','外送',60),('後勤','後勤',70),('送貨','送貨',80)
on conflict (code) do update set display_name=excluded.display_name, sort_order=excluded.sort_order, is_active=true;

create table if not exists public.staff_position_skills (
  staff_id text not null references public.store_staff(id) on delete cascade,
  position_code text not null references public.work_positions(code) on delete restrict,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, position_code)
);

create unique index if not exists staff_position_skills_one_primary_idx
  on public.staff_position_skills (staff_id) where is_primary;

insert into public.staff_position_skills (staff_id, position_code, is_primary)
select staff.id,
  case when staff.role_name in ('店長','副店長') then '店長值班' when staff.work_category='後勤' then '後勤' else '送貨' end,
  true
from public.store_staff staff
where staff.role_name in ('店長','副店長') or staff.work_category in ('後勤','送貨')
on conflict (staff_id, position_code) do nothing;

alter table public.work_positions enable row level security;
alter table public.staff_position_skills enable row level security;

create policy "authenticated read work positions" on public.work_positions for select to authenticated using (true);
create policy "headquarters manage work positions" on public.work_positions for all to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'));
create policy "staff skills visible by staff scope" on public.staff_position_skills for select to authenticated
using (exists (select 1 from public.store_staff visible_staff where visible_staff.id=staff_position_skills.staff_id));
create policy "headquarters manage staff skills" on public.staff_position_skills for all to authenticated
using ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'))
with check ((select public.current_profile_role())::text in ('ceo','coo','admin','hq','cso','general_affairs'));

grant select, insert, update, delete on public.work_positions, public.staff_position_skills to authenticated, service_role;

create or replace function public.replace_staff_position_skills(p_staff_id text, p_positions text[], p_primary_position text)
returns setof public.staff_position_skills language plpgsql security invoker set search_path=public as $$
begin
  if (select public.current_profile_role())::text not in ('ceo','coo','admin','hq','cso','general_affairs') then
    raise exception 'insufficient skill management permission' using errcode='42501';
  end if;
  if p_primary_position is null or not (p_primary_position=any(p_positions)) then
    raise exception 'primary position must be included in positions' using errcode='22023';
  end if;
  delete from public.staff_position_skills where staff_id=p_staff_id;
  insert into public.staff_position_skills(staff_id,position_code,is_primary,created_by)
  select p_staff_id, position_code, position_code=p_primary_position, auth.uid()
  from unnest(p_positions) position_code;
  return query select * from public.staff_position_skills where staff_id=p_staff_id order by position_code;
end; $$;

revoke all on function public.replace_staff_position_skills(text,text[],text) from public, anon;
grant execute on function public.replace_staff_position_skills(text,text[],text) to authenticated, service_role;

commit;
