create table if not exists public.line_report_requests (
  id bigint generated always as identity primary key,
  source_id text not null,
  user_id text,
  status text not null default 'pending',
  store_names text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);

alter table public.line_report_requests enable row level security;

grant select, insert, update, delete on public.line_report_requests to service_role;
grant usage, select on all sequences in schema public to service_role;

create index if not exists line_report_requests_source_status_idx
  on public.line_report_requests (source_id, status, created_at desc);
