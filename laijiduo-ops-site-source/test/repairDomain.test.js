import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadRepair, repairActions, repairDraftError, transitionRepair, repairSummary, validRepairCost, repairCostLabel } from '../src/modules/repairs/domain.js';

const hq = { active: true, manageRepairs: true };
const store = { active: true, store: 'S01' };
const other = { active: true, store: 'S02' };
const ticket = { id: 'test', store: 'S01', status: 'pending', version: 1 };
const act = (row, action, actor, note = '驗證流程') => transitionRepair(row, { action, version: row.version, note }, actor);

test('repair lifecycle requires store confirmation and preserves original input', () => {
  const started = act(ticket, 'start', hq);
  const finished = act(started, 'finish', hq);
  assert.equal(finished.status, 'awaiting_confirmation');
  assert.throws(() => act(finished, 'confirm', hq));
  assert.equal(act(finished, 'confirm', store).status, 'completed');
  assert.deepEqual(ticket, { id: 'test', store: 'S01', status: 'pending', version: 1 });
});
test('unresolved repair returns to processing on the same ticket', () => {
  const finished = act(act(ticket, 'start', hq), 'finish', hq);
  const rejected = act(finished, 'reject', store);
  assert.equal(rejected.id, ticket.id);
  assert.equal(rejected.status, 'processing');
  assert.equal(act(act(rejected, 'finish', hq), 'confirm', store).status, 'completed');
});
test('cross-store, inactive and unknown actors are denied', () => {
  for (const actor of [other, { ...hq, active: false }, {}, null]) {
    assert.equal(canReadRepair(actor, ticket), false);
    assert.deepEqual(repairActions(actor, ticket), []);
    assert.throws(() => act(ticket, 'start', actor));
  }
  assert.throws(() => act(ticket, 'start', store));
});
test('old versions and missing reasons are refused', () => {
  assert.throws(() => transitionRepair(ticket, { action: 'start', version: 0, note: '開始' }, hq));
  for (const note of ['', ' ', 'x'.repeat(2001)]) assert.throws(() => act(ticket, 'start', hq, note));
});
test('withdrawal retains ticket; terminal state cannot be directly changed or deleted', () => {
  const withdrawn = act(ticket, 'withdraw', store);
  assert.equal(withdrawn.id, ticket.id);
  assert.equal(withdrawn.status, 'withdrawn');
  assert.deepEqual(repairActions(hq, withdrawn), []);
  const completed = { ...ticket, status: 'completed' };
  assert.deepEqual(repairActions(hq, completed), ['update_cost', 'comment']);
  for (const action of ['delete', 'start', 'withdraw', 'finish']) assert.throws(() => act(completed, action, hq));
  assert.equal(act(completed, 'comment', store).status, 'completed');
});
test('cost distinguishes zero from missing and rejects excessive precision', () => {
  for (const value of ['',null,'0','1500.50']) assert.equal(validRepairCost(value),true);
  for (const value of ['-1','NaN','1e3','1.001','10000000000']) assert.equal(validRepairCost(value),false);
  assert.equal(repairCostLabel(null),'未填');assert.equal(repairCostLabel(0),'NT$ 0');
});
test('draft validates categories, urgency and lengths without requiring a photo', () => {
  const draft = { store: 'S01', category: '冰箱', description: '無法冷藏', urgency: 'business', contact: '', phone: '' };
  assert.equal(repairDraftError(draft), '');
  for (const change of [{ store: 'F01' }, { category: '未知' }, { description: '' }, { urgency: 'unknown' }, { phone: 'x'.repeat(41) }]) {
    assert.notEqual(repairDraftError({ ...draft, ...change }), '');
  }
});
test('summary counts all rows and keeps withdrawn separate', () => {
  const rows = Array.from({ length: 1001 }, () => ticket);
  assert.equal(repairSummary(rows).pending, 1001);
  assert.equal(repairSummary([{ status: 'withdrawn' }]).completed, 0);
  assert.throws(() => repairSummary([{ status: 'unknown' }]));
});
