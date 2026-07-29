alter table public.store_staff
  add column if not exists work_start_time time,
  add column if not exists work_end_time time;

comment on column public.store_staff.work_start_time is '兼職人員預設上班起始時間，用於排班時段人力覆蓋計算。';
comment on column public.store_staff.work_end_time is '兼職人員預設下班時間，用於排班時段人力覆蓋計算。';
