import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyReportRepository } from '../src/modules/daily-report/data/dailyReportRepository.js';

function clientWith(fetchPage) {
  return { from: () => {
    let fields;
    const query = {
      select(value) { fields = value; return query; },
      eq() { return query; }, gte() { return query; }, lte() { return query; },
      order() { return query; },
      range(start, end) { return fetchPage(start, end, fields); },
    };
    return query;
  } };
}

test('daily range returns all 1201 reports', async () => {
  const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const repo = createDailyReportRepository(clientWith(async (start, end) => ({ data: source.slice(start, end + 1) })));
  const result = await repo.fetchRange('2026-01-01', '2026-12-31');
  assert.deepEqual(result.map(row => row.id), source.map(row => row.id));
});

test('daily range cannot present an incomplete page set as successful', async () => {
  let calls = 0;
  const repo = createDailyReportRepository(clientWith(async start => {
    calls++;
    return start === 0 ? { data: Array.from({ length: 500 }, (_, id) => ({ id })) }
      : { error: { code: '42501', message: 'permission denied' } };
  }));
  await assert.rejects(repo.fetchRange('2026-01-01', '2026-12-31'), error => error.code === '42501');
  assert.equal(calls, 2);
});

test('legacy daily fields are used only for missing column errors', async () => {
  const repo = createDailyReportRepository(clientWith(async (start, end, fields) =>
    fields.includes('employee_meal_total') ? { error: { code: '42703' } } : { data: [{ id: 1 }] }));
  assert.equal((await repo.fetchByDate('2026-09-10')).length, 1);
  const broken = createDailyReportRepository(clientWith(async () => ({ data: null })));
  await assert.rejects(broken.fetchByDate('2026-09-10'), /不完整/);
});
