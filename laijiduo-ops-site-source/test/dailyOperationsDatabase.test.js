import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyOperationsDatabase } from './helpers/dailyOperationsDatabase.js';

test('isolated PostgreSQL daily operations transaction baseline', async t => {
  const { db, stores, product, date } = await createDailyOperationsDatabase();
  const manager = '00000000-0000-4000-8000-000000000001';
  const hq = '00000000-0000-4000-8000-000000000002';
  const external = '00000000-0000-4000-8000-000000000003';
  const report = () => ({ store_id: stores[0].id, report_date: date,
    submitted_by: manager, opened_to_1400_revenue: 100, status: 'draft' });
  const inventory = () => [{ product_id: product.id, current_stock: 3, stock_unit: '包' }];
  const meals = () => [{ item_code: 'chicken_wing', item_name: '雞翅', unit_price: 20, quantity: 2 }];
  const waste = () => [{ item_name: '雞翅', quantity: 1, unit: '支', reason: '測試' }];
  async function login(id) {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec('set role authenticated');
  }
  async function save(payload = report(), items = inventory(), losses = waste()) {
    const { rows } = await db.query('select to_jsonb(public.save_daily_operations($1::jsonb, $2::jsonb, $3::jsonb)) as report',
      [JSON.stringify(payload), JSON.stringify(items), losses === null ? null : JSON.stringify(losses)]);
    return rows[0].report;
  }
  async function snapshot() {
    await db.exec('reset role');
    return (await db.query(`select jsonb_build_object(
      'reports', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from public.daily_reports r),
      'inventory', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from public.inventory_counts r),
      'waste', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from public.daily_report_waste_items r),
      'meals', (select coalesce(jsonb_agg(to_jsonb(r) order by id), '[]') from public.daily_report_employee_meals r)
    ) as state`)).rows[0].state;
  }
  t.beforeEach(async () => {
    await db.exec('reset role; truncate public.daily_reports cascade;');
    await login(manager);
  });
  try {
    await t.test('report, inventory, waste and meals commit together', async () => {
      const saved = await save({ ...report(), employee_meals: meals() });
      assert.equal(Number(saved.employee_meal_total), 40);
      const state = await snapshot();
      for (const rows of Object.values(state)) assert.equal(rows.length, 1);
    });

    await t.test('invalid inventory foreign key rolls back a newly inserted report', async () => {
      await assert.rejects(save(report(), [{ product_id: '99999999-9999-4999-8999-999999999999' }]), e => e.code === '23503');
      const state = await snapshot();
      for (const rows of Object.values(state)) assert.equal(rows.length, 0);
    });

    await t.test('meal failure restores prior report and all replaced child rows', async () => {
      await save({ ...report(), employee_meals: meals() });
      const before = await snapshot();
      await login(manager);
      await assert.rejects(save({ ...report(), opened_to_1400_revenue: 900,
        employee_meals: [{ ...meals()[0], unit_price: 999 }] },
      [{ ...inventory()[0], current_stock: 88 }], [{ ...waste()[0], quantity: 5 }]), e => e.code === '23514');
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('omitted meal list preserves existing meals', async () => {
      await save({ ...report(), employee_meals: meals() });
      const before = await snapshot();
      await login(manager);
      await save({ ...report(), opened_to_1400_revenue: 200 }, inventory(), null);
      const after = await snapshot();
      assert.deepEqual(after.meals, before.meals);
      assert.deepEqual(after.waste, before.waste);
    });

    await t.test('store manager cannot write another store', async () => {
      await assert.rejects(save({ ...report(), store_id: stores[1].id }), e => e.code === '42501');
      assert.equal((await snapshot()).reports.length, 0);
    });

    await t.test('Auth identity without an operations profile cannot write', async () => {
      await login(external);
      await assert.rejects(save({ ...report(), submitted_by: external }), e => e.code === '42501');
      assert.equal((await snapshot()).reports.length, 0);
    });

    await t.test('inactive operations profile cannot write', async () => {
      await db.exec('reset role');
      await db.query('update public.profiles set is_active = false where id = $1', [manager]);
      await login(manager);
      try { await assert.rejects(save(), e => e.code === '42501'); }
      finally {
        await db.exec('reset role');
        await db.query('update public.profiles set is_active = true where id = $1', [manager]);
      }
    });

    await t.test('approved report cannot be overwritten by store manager', async () => {
      await save();
      await login(hq);
      await db.exec("update public.daily_reports set status = 'approved'");
      const before = await snapshot();
      await login(manager);
      await assert.rejects(save(), e => e.code === '42501');
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('same store and date upsert retains one report and one inventory row', async () => {
      const first = await save();
      const second = await save();
      assert.equal(first.id, second.id);
      const state = await snapshot();
      assert.equal(state.reports.length, 1);
      assert.equal(state.inventory.length, 1);
    });

    await t.test('documented gap: legacy RPC accepts stale payload without a version check', async () => {
      const staleDraft = { ...report(), opened_to_1400_revenue: 100 };
      await save(staleDraft);
      await save({ ...report(), opened_to_1400_revenue: 500 });
      await save(staleDraft);
      // Characterization only: this proves the missing protection, not successful concurrency safety.
      assert.equal((await snapshot()).reports[0].opened_to_1400_revenue, 100);
    });

    await t.test('documented gap: replay recreates waste rows rather than returning original result', async () => {
      await save();
      const before = await snapshot();
      await login(manager);
      await save();
      const after = await snapshot();
      assert.notEqual(after.waste[0].id, before.waste[0].id);
      assert.equal(after.reports[0].id, before.reports[0].id);
    });
  } finally {
    await db.close();
  }
});
