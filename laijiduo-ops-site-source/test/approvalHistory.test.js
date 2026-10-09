import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalHistory, sameContent, blankContent } from '../src/modules/approvals/domain.js';

test('five original operations represent one submitted edition without deleting records', () => {
  const events = ['create', 'save', 'attach', 'save', 'submit'].map((action, i) => ({ id: i + 1, action }));
  const result = approvalHistory(events);
  assert.equal(result.edition, 1);
  assert.equal(result.operations.length, 5);
  assert.deepEqual(result.milestones.map(e => e.action), ['submit']);
});
test('only resubmission increments the business edition', () => {
  const events = ['create', 'submit', 'return', 'save', 'attach', 'submit', 'approve'].map((action, i) => ({ id: i + 1, action }));
  const result = approvalHistory(events.reverse());
  assert.deepEqual(result.milestones.map(e => e.edition), [1, 1, 2, 2]);
  assert.equal(result.milestones[2].label, '重新送出申請');
  assert.equal(approvalHistory([]).edition, 0);
});
test('unchanged content ignores object key order and numeric input representation', () => {
  assert.ok(sameContent({ ...blankContent(), amount: 650 }, { amount: '650', ...Object.fromEntries(Object.entries(blankContent()).filter(([k]) => k !== 'amount')) }));
  assert.ok(!sameContent(blankContent(), { ...blankContent(), subject: 'Changed' }));
});
