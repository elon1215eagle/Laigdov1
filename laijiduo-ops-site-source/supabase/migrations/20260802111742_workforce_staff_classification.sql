begin;

alter table public.store_staff
  add column if not exists employment_type text,
  add column if not exists work_category text,
  add column if not exists employment_status text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

update public.store_staff
set
  employment_type = coalesce(
    employment_type,
    case when role_name in ('兼職人員', '兼職後勤') then '兼職' else '正職' end
  ),
  work_category = coalesce(
    work_category,
    case
      when role_name = '兼職後勤' then '後勤'
      when role_name = '送貨人員' then '送貨'
      when role_name = '總部人員' then '總部'
      else '門店營運'
    end
  ),
  employment_status = coalesce(
    employment_status,
    case when is_active = false then '停用' else '在職' end
  );

alter table public.store_staff
  drop constraint if exists store_staff_employment_type_check,
  add constraint store_staff_employment_type_check
    check (employment_type is null or employment_type in ('正職', '兼職')),
  drop constraint if exists store_staff_work_category_check,
  add constraint store_staff_work_category_check
    check (work_category is null or work_category in ('門店營運', '後勤', '送貨', '總部')),
  drop constraint if exists store_staff_employment_status_check,
  add constraint store_staff_employment_status_check
    check (employment_status is null or employment_status in ('待到職', '在職', '留職停薪', '已離職', '停用'));

create unique index if not exists store_staff_auth_user_id_unique
  on public.store_staff (auth_user_id)
  where auth_user_id is not null;

create index if not exists store_staff_classification_idx
  on public.store_staff (store_code, employment_status, work_category);

comment on column public.store_staff.role_name is '人員職稱；保留既有欄位以維持舊版相容。';
comment on column public.store_staff.employment_type is '僱用型態：正職或兼職。';
comment on column public.store_staff.work_category is '工作類別：門店營運、後勤、送貨或總部。';
comment on column public.store_staff.employment_status is '人員狀態：待到職、在職、留職停薪、已離職或停用。';
comment on column public.store_staff.auth_user_id is '選填的登入帳號關聯；人員主檔不強制建立登入帳號。';

commit;
