import test from 'node:test';
import assert from 'node:assert/strict';
import { readReportInputs, reportInputsReady } from '../src/modules/daily-report/data/reportReadSnapshot.js';
import { createInventoryRepository } from '../src/modules/daily-report/data/inventoryRepository.js';
import { createWasteRepository } from '../src/modules/daily-report/data/wasteRepository.js';
import { createEmployeeMealRepository } from '../src/modules/daily-report/data/employeeMealRepository.js';

const labels = ['inventory', 'previous', 'leavePlans', 'shifts', 'waste', 'meals', 'requests'];
const readers = fail => Object.fromEntries(labels.map(key => [key, { label: key, read: async () => {
  if (key === fail) throw new Error('offline');
  return [];
} }]));
test('empty but successful read sets are valid for a new report', async () => {
  assert.deepEqual(Object.keys(await readReportInputs(readers())), labels);
});
for (const key of labels) test(`failed ${key} rejects the entire editable snapshot`, async () => {
  await assert.rejects(readReportInputs(readers(key)), new RegExp(key));
});
test('null response is not an empty record set', async () => {
  await assert.rejects(readReportInputs({ stock: { label: '庫存', read: async () => null } }), /庫存/);
});
test('old date or failed request cannot unlock a new date', () => {
  assert.equal(reportInputsReady({ key: 'old', phase: 'ready' }, 'new'), false);
  assert.equal(reportInputsReady({ key: 'new', phase: 'error' }, 'new'), false);
  assert.equal(reportInputsReady({ key: 'new', phase: 'loading' }, 'new'), false);
  assert.equal(reportInputsReady({ key: 'new', phase: 'ready' }, 'new'), true);
});
test('retry requires all readers to succeed', async () => {
  await assert.rejects(readReportInputs(readers('meals')));
  const data = await readReportInputs(readers());
  assert.deepEqual(data.meals, []);
});
test('repositories reject null instead of converting it into an empty report', async () => {
  const query = { select: () => query, eq: () => query, order: () => query,
    then: resolve => Promise.resolve({ data: null }).then(resolve) };
  for (const create of [createInventoryRepository, createWasteRepository, createEmployeeMealRepository]) {
    await assert.rejects(create({ from: () => query }).fetchByReport('r1'), /不完整/);
  }
});
