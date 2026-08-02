begin;

create table if not exists public.workforce_rollout_settings (
  setting_key text primary key default 'workforce',
  rollout_mode text not null default 'parallel',
  cutover_month text,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint workforce_rollout_singleton check (setting_key = 'workforce'),
  constraint workforce_rollout_mode_check check (rollout_mode in ('legacy','parallel','new')),
  constraint workforce_rollout_month_check check (cutover_month is null or cutover_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

create table if not exists public.workforce_rollout_audit_log (
  id bigint generated always as identity primary key,
  previous_mode text,
  next_mode text not null,
  cutover_month text,
  note text not null default '',
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

insert into public.workforce_rollout_settings (setting_key, rollout_mode, note)
values ('workforce','parallel','開發分支平行驗收；未切換正式資料寫入')
on conflict (setting_key) do nothing;

alter table public.workforce_rollout_settings enable row level security;
alter table public.workforce_rollout_audit_log enable row level security;
grant select on public.workforce_rollout_settings, public.workforce_rollout_audit_log to authenticated;
grant select, insert, update, delete on public.workforce_rollout_settings, public.workforce_rollout_audit_log to service_role;

create policy "authenticated read workforce rollout settings"
on public.workforce_rollout_settings for select to authenticated using (true);
create policy "headquarters read workforce rollout audit"
on public.workforce_rollout_audit_log for select to authenticated using ((select private.is_headquarters_role()));

create or replace function public.set_workforce_rollout_mode(
  p_mode text,
  p_cutover_month text default null,
  p_note text default ''
)
returns public.workforce_rollout_settings
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  previous_row public.workforce_rollout_settings;
  next_row public.workforce_rollout_settings;
begin
  if not private.is_headquarters_role() then raise exception '僅總部可切換人力排班模組'; end if;
  if p_mode not in ('legacy','parallel','new') then raise exception '不支援的切換模式'; end if;
  if p_mode = 'new' and p_cutover_month is null then raise exception '切換新模組必須指定月份'; end if;

  select * into previous_row from public.workforce_rollout_settings where setting_key='workforce' for update;
  insert into public.workforce_rollout_settings (setting_key, rollout_mode, cutover_month, note, updated_by, updated_at)
  values ('workforce', p_mode, p_cutover_month, coalesce(p_note,''), auth.uid(), now())
  on conflict (setting_key) do update set
    rollout_mode=excluded.rollout_mode, cutover_month=excluded.cutover_month,
    note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at
  returning * into next_row;

  insert into public.workforce_rollout_audit_log (previous_mode, next_mode, cutover_month, note, changed_by)
  values (previous_row.rollout_mode, next_row.rollout_mode, next_row.cutover_month, next_row.note, auth.uid());
  return next_row;
end;
$$;

revoke all on function public.set_workforce_rollout_mode(text,text,text) from public;
grant execute on function public.set_workforce_rollout_mode(text,text,text) to authenticated;

commit;
