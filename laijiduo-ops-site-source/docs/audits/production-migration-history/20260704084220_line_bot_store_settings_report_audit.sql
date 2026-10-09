create table if not exists public.line_group_messages (
  id bigint generated always as identity primary key,
  line_event_id text,
  reply_token text,
  source_type text,
  group_id text,
  room_id text,
  user_id text,
  message_id text,
  message_type text not null,
  text text,
  category text not null default 'general',
  severity text not null default 'C',
  media_file_name text,
  media_file_size bigint,
  media_content_type text,
  media_storage_bucket text,
  media_storage_path text,
  media_download_error text,
  task_id bigint,
  occurred_at timestamptz not null default now(),
  raw_event jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.line_group_messages
  add column if not exists media_file_name text,
  add column if not exists media_file_size bigint,
  add column if not exists media_content_type text,
  add column if not exists media_storage_bucket text,
  add column if not exists media_storage_path text,
  add column if not exists media_download_error text,
  add column if not exists task_id bigint;

alter table public.line_group_messages
  alter column category set default 'general';

create table if not exists public.line_tasks (
  id bigint generated always as identity primary key,
  group_id text not null,
  source_type text,
  category text not null,
  severity text not null default 'C',
  status text not null default 'open',
  title text not null,
  owner_name text,
  first_message_id bigint references public.line_group_messages(id),
  latest_message_id bigint references public.line_group_messages(id),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.line_task_events (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.line_tasks(id) on delete cascade,
  message_id bigint references public.line_group_messages(id),
  event_type text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.line_group_messages
  drop constraint if exists line_group_messages_task_id_fkey;

alter table public.line_group_messages
  add constraint line_group_messages_task_id_fkey
  foreign key (task_id) references public.line_tasks(id);

create index if not exists line_group_messages_occurred_at_idx
  on public.line_group_messages (occurred_at desc);

create index if not exists line_group_messages_group_id_idx
  on public.line_group_messages (group_id);

create index if not exists line_group_messages_category_idx
  on public.line_group_messages (category);

create index if not exists line_group_messages_task_id_idx
  on public.line_group_messages (task_id);

create index if not exists line_tasks_group_status_idx
  on public.line_tasks (group_id, status, updated_at desc);

create index if not exists line_tasks_due_at_idx
  on public.line_tasks (due_at);

create table if not exists public.store_settings (
  id bigint generated always as identity primary key,
  store_name text not null unique,
  short_name text not null,
  group_id text,
  group_name text,
  open_time time,
  close_time time,
  noon_peak text,
  evening_peak text,
  scheduled_staff_count integer,
  noon_report_time time,
  evening_report_time time,
  closing_report_time time,
  daily_hq_report_time time not null default '08:00',
  source_file text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_staff (
  id bigint generated always as identity primary key,
  store_name text not null references public.store_settings(store_name) on delete cascade,
  role_name text not null,
  staff_name text not null,
  source_file text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_name, role_name, staff_name)
);

alter table public.store_settings enable row level security;
alter table public.store_staff enable row level security;

grant select, insert, update, delete on public.store_settings to service_role;
grant select, insert, update, delete on public.store_staff to service_role;
grant usage, select on all sequences in schema public to service_role;

create index if not exists store_settings_group_id_idx
  on public.store_settings (group_id);

create index if not exists store_settings_short_name_idx
  on public.store_settings (short_name);

create index if not exists store_staff_store_name_idx
  on public.store_staff (store_name);

insert into public.store_settings (
  store_name,
  short_name,
  group_id,
  group_name,
  open_time,
  close_time,
  noon_peak,
  evening_peak,
  scheduled_staff_count,
  noon_report_time,
  evening_report_time,
  closing_report_time,
  daily_hq_report_time,
  source_file,
  is_active
)
values
  ('鳳山五甲店', '五甲', null, null, '10:00', '23:00', '11:30-13:30', '17:00-19:00', 3, '14:00', '19:00', '23:00', '08:00', '00AI人資.xlsx/各店時間', true),
  ('鳳山凱旋店', '凱旋', null, null, '09:30', '22:30', '11:30-13:30', '17:00-19:00', 3, '14:00', '19:00', '22:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('鳳山武廟店', '武廟', null, null, '10:30', '22:30', '11:30-13:30', '17:00-19:00', 2, '14:00', '19:00', '22:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('鳳山中山店', '中山', null, null, '10:00', '22:30', '11:30-13:30', '17:00-19:00', 2, '14:00', '19:00', '22:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('鳳山南華店', '南華', null, null, '09:00', '21:00', '11:30-13:30', '17:00-19:00', 2, '14:00', '19:00', '21:00', '08:00', '00AI人資.xlsx/各店時間', true),
  ('前鎮隆興店', '隆興', null, null, '10:00', '22:30', '11:30-13:30', '17:00-19:00', 2, '14:00', '19:00', '22:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('三民大昌店', '大昌', 'C664b7d66db0ef351a87a2a88acec921c', '義華 大昌管理群', '09:30', '22:30', '11:30-13:30', '17:00-19:00', 3, '14:00', '19:00', '22:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('三民義華店', '義華', 'C664b7d66db0ef351a87a2a88acec921c', '義華 大昌管理群', '09:30', '22:30', '11:30-13:30', '17:00-19:00', 3, '14:00', '19:00', '22:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('三民鼎山店', '鼎山', null, null, '10:00', '23:00', '11:30-13:30', '17:00-19:00', 3, '14:00', '19:00', '23:00', '08:00', '00AI人資.xlsx/各店時間', true),
  ('屏東潮州店', '潮州', null, null, '09:00', '21:30', '11:30-13:30', '17:00-19:00', 2, '14:00', '19:00', '21:30', '08:00', '00AI人資.xlsx/各店時間', true),
  ('屏東潮二店', '潮二', null, null, '09:00', '21:30', '11:30-13:30', '17:00-19:00', 2, '13:00', '18:00', '21:30', '08:00', '00AI人資.xlsx/各店時間', true)
on conflict (store_name) do update set
  short_name = excluded.short_name,
  group_id = excluded.group_id,
  group_name = excluded.group_name,
  open_time = excluded.open_time,
  close_time = excluded.close_time,
  noon_peak = excluded.noon_peak,
  evening_peak = excluded.evening_peak,
  scheduled_staff_count = excluded.scheduled_staff_count,
  noon_report_time = excluded.noon_report_time,
  evening_report_time = excluded.evening_report_time,
  closing_report_time = excluded.closing_report_time,
  daily_hq_report_time = excluded.daily_hq_report_time,
  source_file = excluded.source_file,
  is_active = excluded.is_active,
  updated_at = now();

insert into storage.buckets (id, name, public)
values ('line-media', 'line-media', false)
on conflict (id) do nothing;
