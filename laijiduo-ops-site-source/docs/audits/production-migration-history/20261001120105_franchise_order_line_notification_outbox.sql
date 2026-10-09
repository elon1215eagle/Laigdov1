create table if not exists public.franchise_order_notification_settings (
  channel text primary key,
  is_enabled boolean not null default false,
  recipient_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.franchise_order_notification_settings (channel, is_enabled, recipient_label)
values ('line_order_submitted', false, '系統故障通知群')
on conflict (channel) do nothing;

alter table public.franchise_order_notification_settings enable row level security;

drop policy if exists "headquarters read order notification settings"
on public.franchise_order_notification_settings;
create policy "headquarters read order notification settings"
on public.franchise_order_notification_settings
for select
to authenticated
using (
  public.current_franchise_role()::text in (
    'franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'
  )
);

create table if not exists public.franchise_order_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.franchise_orders(id) on delete cascade,
  event_type text not null default 'order_submitted'
    check (event_type in ('order_submitted')),
  deduplication_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default (now() + interval '30 seconds'),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists franchise_order_notification_outbox_dispatch_idx
on public.franchise_order_notification_outbox (status, available_at, created_at);

alter table public.franchise_order_notification_outbox enable row level security;

drop policy if exists "headquarters read order notifications" on public.franchise_order_notification_outbox;
create policy "headquarters read order notifications"
on public.franchise_order_notification_outbox
for select
to authenticated
using (
  public.current_franchise_role()::text in (
    'franchise_admin', 'franchise_hq', 'franchise_coo', 'franchise_cfo'
  )
);

create or replace function public.enqueue_franchise_order_submitted_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.franchise_order_notification_settings settings
    where settings.channel = 'line_order_submitted'
      and settings.is_enabled
  ) then
    return new;
  end if;

  if new.status = 'submitted'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.submitted_at is distinct from new.submitted_at
    ) then
    insert into public.franchise_order_notification_outbox (
      order_id,
      deduplication_key,
      available_at
    ) values (
      new.id,
      new.id::text || ':submitted:' || coalesce(new.submitted_at::text, new.updated_at::text),
      now() + interval '30 seconds'
    )
    on conflict (deduplication_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_franchise_order_submitted_notification() from public;
revoke all on function public.enqueue_franchise_order_submitted_notification() from anon;
revoke all on function public.enqueue_franchise_order_submitted_notification() from authenticated;

drop trigger if exists enqueue_franchise_order_submitted_notification_trigger
on public.franchise_orders;

create trigger enqueue_franchise_order_submitted_notification_trigger
after insert or update of status, submitted_at
on public.franchise_orders
for each row
execute function public.enqueue_franchise_order_submitted_notification();

create or replace function public.claim_franchise_order_notifications(p_limit integer default 20)
returns setof public.franchise_order_notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select queue.id
    from public.franchise_order_notification_outbox queue
    where (
      queue.status in ('pending', 'failed')
      and queue.available_at <= now()
    ) or (
      queue.status = 'processing'
      and queue.locked_at < now() - interval '5 minutes'
    )
    order by queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.franchise_order_notification_outbox queue
  set status = 'processing',
      attempts = queue.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where queue.id = candidates.id
  returning queue.*;
end;
$$;

revoke all on function public.claim_franchise_order_notifications(integer) from public;
revoke all on function public.claim_franchise_order_notifications(integer) from anon;
revoke all on function public.claim_franchise_order_notifications(integer) from authenticated;
grant execute on function public.claim_franchise_order_notifications(integer) to service_role;

comment on table public.franchise_order_notification_outbox is
'Durable LINE notification queue. Order persistence never depends on LINE availability.';
