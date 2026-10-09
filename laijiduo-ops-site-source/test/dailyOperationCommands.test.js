import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyOperationCommands } from '../src/modules/daily-report/application/dailyOperationCommands.js';

const input = () => ({ expectedVersion: 2, reason: '修正回報', report: { store_id: 'S01', report_date: '2026-09-10' } });
const result = { requestId: 'request-1', version: 3, report: { id: 'report-1' } };
function setup(repository) {
  const records = new Map();
  const journal = { put: async entry => records.set(entry.command.requestId, structuredClone(entry)),
    get: async id => structuredClone(records.get(id)) };
  const options = { repository, journal, newId: () => 'request-1' };
  return { module: createDailyOperationCommands(options), records, options };
}

test('daily command freezes input and excludes client identity', async () => {
  let sent;
  const { module } = setup({ submit: async command => { sent = command; return result; } });
  const draft = input();
  draft.report.submitted_by = 'untrusted';
  const id = await module.prepare(draft);
  draft.report.store_id = 'S02';
  assert.equal((await module.send(id)).state, 'succeeded');
  assert.equal(sent.report.store_id, 'S01');
  assert.equal(Object.hasOwn(sent.report, 'submitted_by'), false);
});

test('double click sends one command and a completed request is not sent again', async () => {
  let calls = 0;
  const { module } = setup({ submit: async () => { calls++; return result; } });
  const id = await module.prepare(input());
  await Promise.all([module.send(id), module.send(id)]);
  await module.send(id);
  assert.equal(calls, 1);
});

test('timeout can be reconciled after module recreation without another write', async () => {
  let writes = 0;
  const { module, options } = setup({ submit: async () => { writes++; throw new Error('offline'); }, lookup: async () => result });
  const id = await module.prepare(input());
  assert.equal((await module.send(id)).state, 'pending');
  assert.equal((await createDailyOperationCommands(options).reconcile(id)).state, 'succeeded');
  assert.equal(writes, 1);
});

test('not found remains pending and explicit retry reuses the original command', async () => {
  const sent = [];
  const { module } = setup({ submit: async command => { sent.push(command); throw new Error('timeout'); }, lookup: async () => null });
  const id = await module.prepare(input());
  await module.send(id);
  assert.equal((await module.reconcile(id)).state, 'pending');
  await module.send(id);
  assert.deepEqual(sent[0], sent[1]);
});

test('version conflict preserves input and cannot be blindly retried', async () => {
  let calls = 0;
  const { module } = setup({ submit: async () => { calls++; throw { code: 'version_conflict' }; } });
  const id = await module.prepare(input());
  const response = await module.send(id);
  assert.equal(response.state, 'rejected');
  assert.deepEqual(response.command.report, input().report);
  await module.send(id);
  assert.equal(calls, 1);
});

test('journal failure prevents a network write', async () => {
  let writes = 0;
  const { module, options } = setup({ submit: async () => { writes++; return result; } });
  const id = await module.prepare(input());
  options.journal.put = async () => { throw new Error('storage full'); };
  await assert.rejects(module.send(id), /storage full/);
  assert.equal(writes, 0);
});

test('invalid response is pending, not a successful save', async () => {
  const { module } = setup({ submit: async () => ({ ...result, requestId: 'wrong' }) });
  const id = await module.prepare(input());
  assert.equal((await module.send(id)).state, 'pending');
});

test('invalid version or absent reason prevents preparing a command', async () => {
  const { module } = setup({});
  await assert.rejects(module.prepare({ ...input(), expectedVersion: -1 }), /版本/);
  await assert.rejects(module.prepare({ ...input(), reason: '' }), /原因/);
});
