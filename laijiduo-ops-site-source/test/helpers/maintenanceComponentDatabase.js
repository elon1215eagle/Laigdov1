import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const managerId = '00000000-0000-4000-8000-000000000001';
export const hqId = '00000000-0000-4000-8000-000000000002';
export const otherManagerId = '00000000-0000-4000-8000-000000000003';
const root = new URL('../../', import.meta.url);

export async function actor(db, id = managerId, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  if (!['authenticated', 'anon'].includes(role)) throw new Error('Unsupported test role');
  await db.exec(`set role ${role}`);
}

export async function owner(db) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

// Synthetic dependencies only. Exact policy/RPC SQL is loaded without rewriting it.
export async function componentDatabase(component) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated nologin; create role anon nologin; create role service_role nologin;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated, anon;
      create table public.stores(id uuid primary key default gen_random_uuid(),
        store_code text unique, name text, is_active boolean default true, operating_status text default 'active');
      create table public.profiles(id uuid primary key references auth.users(id),
        role text, store_id uuid references public.stores(id), is_active boolean default true);
      create function public.current_profile_role() returns text language sql stable security definer as
        $$select role from public.profiles where id=auth.uid() and is_active$$;
      create function public.current_profile_store_id() returns uuid language sql stable security definer as
        $$select store_id from public.profiles where id=auth.uid() and is_active$$;
      insert into auth.users values ('${managerId}'), ('${hqId}'), ('${otherManagerId}');
      insert into public.stores(store_code,name) values ('T01','Test store one'),('T02','Test store two');
      insert into public.profiles select '${managerId}','store_manager',id,true from public.stores where store_code='T01';
      insert into public.profiles select '${otherManagerId}','store_manager',id,true from public.stores where store_code='T02';
      insert into public.profiles(id,role) values ('${hqId}','admin');
      grant select on public.stores, public.profiles to authenticated;
    `);
    let paths;
    if (component === 'checkout') {
      // PGlite has SHA256 but not pgcrypto. Random bytes are a test stub, NOT a crypto audit.
      await db.exec(`
        create schema extensions;
        create function extensions.digest(text,text) returns bytea language sql immutable as
          $$select sha256(convert_to($1,'UTF8')) where $2='sha256'$$;
        create function extensions.gen_random_bytes(integer) returns bytea language sql volatile as
          $$select decode(substr(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),1,$1*2),'hex')$$;
      `);
      paths = [
        'supabase/migrations/20260826141823_quick_checkout_data_model.sql',
        'supabase/migrations/20260826142108_quick_checkout_device_rpc.sql',
        'supabase/migrations/20260826143955_quick_checkout_workspace_sync.sql',
      ];
    } else if (component === 'schedule') {
      await db.exec(`
        create table public.store_staff(id text primary key);
        insert into public.store_staff values ('staff-one'),('staff-two');
        create table public.store_relation_groups(id uuid primary key,group_code text,
          coordinating_store_code text,schedule_shared boolean,is_active boolean);
        create table public.store_relation_group_members(group_id uuid,store_code text);
        create table public.monthly_leave_plans(id uuid primary key default gen_random_uuid(),
          period_month text,store_code text,store_name text,staff_id text references public.store_staff(id),
          employee_name text,role_name text,leave_days integer[],manual_leave_days integer[],auto_leave_days integer[],
          leave_type text,note text,updated_by uuid,updated_at timestamptz default now(),unique(period_month,staff_id));
        create table public.daily_staff_shifts(id uuid primary key default gen_random_uuid(),
          shift_date date,staff_id text,employee_name text,home_store_code text,assigned_store_code text,
          start_time time,end_time time,shift_type text,note text,created_by uuid,updated_at timestamptz);
        create table public.monthly_schedule_locks(period_month text primary key,is_confirmed boolean);
        create table public.monthly_schedule_change_requests(id uuid primary key default gen_random_uuid(),
          period_month text,store_code text,requested_by uuid,status text,review_note text default '',updated_at timestamptz);
        alter table public.monthly_leave_plans enable row level security;
        alter table public.daily_staff_shifts enable row level security;
        alter table public.monthly_schedule_locks enable row level security;
        alter table public.monthly_schedule_change_requests enable row level security;
        grant select,insert,update,delete on public.monthly_leave_plans,public.daily_staff_shifts to authenticated;
        grant select on public.store_relation_groups,public.store_relation_group_members to authenticated;
      `);
      paths = [
        'docs/audits/production-migration-history/20260729053938_schedule_lock_closed_loop.sql',
        'docs/audits/production-migration-history/20260729061002_schedule_group_change_requests.sql',
        'docs/audits/production-migration-history/20260802141915_scoped_schedule_change_approvals.sql',
        'docs/audits/production-migration-history/20260802141922_workforce_safe_cutover_control.sql',
        'docs/audits/production-migration-history/20260802141935_enforce_workforce_single_writer.sql',
        'supabase/migrations/20260829044859_add_monthly_schedule_day_statuses.sql',
      ];
    } else throw new Error('Unknown isolated component');
    for (const path of paths) await db.exec(await readFile(new URL(path, root), 'utf8'));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
