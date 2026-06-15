alter table public.monthly_leave_plans
  add column if not exists leave_type text not null default '排休';

alter table public.monthly_leave_plans
  drop constraint if exists monthly_leave_plans_leave_type_check;

alter table public.monthly_leave_plans
  add constraint monthly_leave_plans_leave_type_check
  check (leave_type in ('排休', '特休', '事假', '病假', '其他'));
