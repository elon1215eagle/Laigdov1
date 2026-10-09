import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../supabase/', import.meta.url);
const sql = path => readFile(new URL(path, root), 'utf8');

export async function createDailyOperationsDatabase({ currentPolicies = false } = {}) {
  // No URL, credentials or production data: this database exists only in WASM memory.
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated nologin;
      create role anon nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    // gen_random_uuid is built in; the baseline's pgcrypto extension is not needed here.
    await db.exec((await sql('schema.sql')).replace('create extension if not exists "pgcrypto";', ''));
    // Compatibility fixture for inventory columns present in the live read-only inventory.
    await db.exec(`
      alter type public.app_role add value 'coo';
      alter table public.inventory_counts
        alter column current_stock type numeric,
        alter column safety_stock type numeric,
        alter column loss_count type numeric,
        alter column incoming_count type numeric,
        add column stock_unit text,
        add column incoming_unit text,
        add column current_stock_boxes numeric not null default 0,
        add column current_stock_packs numeric not null default 0,
        add column incoming_boxes numeric not null default 0,
        add column incoming_packs numeric not null default 0;
    `);
    await db.exec(await sql('history/20260716144921_store_manager_14_day_revenue_access.sql'));
    await db.exec(await sql('history/20260729192216_save_daily_operations_atomic.sql'));
    await db.exec(await sql('migrations/20260731133904_daily_report_lock_closed_loop.sql'));
    await db.exec(await sql('migrations/20260731133908_daily_report_operational_details.sql'));
    if (currentPolicies) {
      const archive = new URL('../../docs/audits/production-migration-history/', import.meta.url);
      for (const name of [
        '20260805003227_store_manager_current_month_revenue_view.sql',
        '20261001130053_allow_store_manager_previous_month_daily_reports.sql',
      ]) {
        await db.exec(await readFile(new URL(name, archive), 'utf8'));
      }
    }
    await db.exec(`
      grant select, insert, update, delete on all tables in schema public to authenticated;
      insert into auth.users values
        ('00000000-0000-4000-8000-000000000001'),
        ('00000000-0000-4000-8000-000000000002'),
        ('00000000-0000-4000-8000-000000000003');
      insert into public.profiles (id, full_name, role, store_id)
      select '00000000-0000-4000-8000-000000000001', 'Isolated store manager', 'store_manager', id
        from public.stores order by store_code limit 1;
      insert into public.profiles (id, full_name, role)
      values ('00000000-0000-4000-8000-000000000002', 'Isolated HQ', 'admin');
    `);
    const stores = (await db.query('select id from public.stores order by store_code limit 2')).rows;
    const product = (await db.query('select id from public.products order by sort_order limit 1')).rows[0];
    const date = (await db.query('select public.current_taipei_business_date()::text as date')).rows[0].date;
    return { db, stores, product, date };
  } catch (error) {
    await db.close();
    throw error;
  }
}
