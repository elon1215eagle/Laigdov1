create extension if not exists btree_gist with schema extensions;

alter table public.daily_staff_shifts
  drop constraint if exists daily_staff_shifts_staff_date_unique;

alter table public.daily_staff_shifts
  drop constraint if exists daily_staff_shifts_no_overlap;

alter table public.daily_staff_shifts
  add constraint daily_staff_shifts_no_overlap
  exclude using gist (
    staff_id with =,
    tsrange(
      (shift_date + start_time)::timestamp,
      (shift_date + end_time)::timestamp,
      '[)'
    ) with &&
  );

create index if not exists daily_staff_shifts_staff_date_start_idx
  on public.daily_staff_shifts (staff_id, shift_date, start_time);
