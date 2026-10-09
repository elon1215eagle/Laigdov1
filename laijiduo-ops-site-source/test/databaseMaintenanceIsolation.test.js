import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyOperationsDatabase } from './helpers/dailyOperationsDatabase.js';

test('isolated current-month reporting baseline with previous-month backfill', async t => {
  const { db, stores, product, date } = await createDailyOperationsDatabase({ currentPolicies: true });
  const manager = '00000000-0000-4000-8000-000000000001';
  const payload = day => ({ store_id: stores[0].id, report_date: day, submitted_by: manager,
    opened_to_1400_revenue: 100, status: 'draft' });
  async function login() {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [manager]);
    await db.exec('set role authenticated');
  }
  async function save(report, items = []) {
    return db.query('select to_jsonb(public.save_daily_operations($1::jsonb,$2::jsonb)) as report',
      [JSON.stringify(report), JSON.stringify(items)]);
  }
  try {
    const days = (await db.query("select (date_trunc('month',$1::date) - interval '1 month')::date::text as previous, (date_trunc('month',$1::date) - interval '2 months')::date::text as older", [date])).rows[0];
    await t.test('only the current three-argument RPC exists, with default arguments', async () => {
      const rows = (await db.query("select pronargs from pg_proc where proname='save_daily_operations'")).rows;
      assert.deepEqual(rows.map(r => r.pronargs), [3]);
    });
    await t.test('manager can backfill the previous month through the default-argument RPC', async () => {
      await login();
      const result = await save(payload(days.previous));
      assert.equal(result.rows[0].report.report_date, days.previous);
    });
    await t.test('older month and other-store submissions remain blocked', async () => {
      await login();
      await assert.rejects(save(payload(days.older)), error => error.code === '42501');
      await assert.rejects(save({ ...payload(date), store_id: stores[1].id }), error => error.code === '42501');
    });
    await t.test('invalid inventory rolls back report insertion', async () => {
      await login();
      await assert.rejects(save(payload(date), [{ product_id: '99999999-9999-4999-8999-999999999999', current_stock: 1 }]),
        error => error.code === '23503');
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int as n from daily_reports where report_date=$1', [date])).rows[0].n, 0);
      await login();
      await save(payload(date), [{ product_id: product.id, current_stock: 2 }]);
    });
  } finally {
    await db.close();
  }
});
