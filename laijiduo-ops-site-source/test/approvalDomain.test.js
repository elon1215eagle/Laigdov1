import test from 'node:test';
import assert from 'node:assert/strict';
import { permissions, validateContent, blankContent, exportCsv } from '../src/modules/approvals/domain.js';
import { canAccessModule, defaultModuleForRole } from '../src/modules/access/domain/roleAccess.js';
const cfo = { id: 'cfo-id', role: 'cfo', is_active: true };
test('CFO can review own pending request, not drafts or closed requests', () => {
  assert.equal(permissions(cfo, { owner_id: cfo.id, state: 'pending' }).review, true);
  for (const state of ['draft', 'returned', 'approved', 'withdrawn']) assert.equal(permissions(cfo, { owner_id: cfo.id, state }).review, false);
  assert.equal(defaultModuleForRole('cfo'), 'approvals');
});
test('approval access fails closed for stores, external roles and inactive accounts', () => {
  for (const role of ['store_manager', 'franchise_admin', '', 'unknown']) {
    assert.equal(permissions({ ...cfo, role }).allowed, false);
    assert.equal(canAccessModule(role, 'approvals'), false);
  }
  assert.equal(permissions({ ...cfo, is_active: false }).allowed, false);
});
test('other headquarters roles may submit but never approve', () => {
  for (const role of ['ceo','coo','general_affairs','supervisor','cso','hq','admin']) {
    const profile = { ...cfo, role };
    assert.equal(permissions(profile, { owner_id: profile.id, state: 'pending' }).review, false);
    assert.equal(permissions(profile, { owner_id: profile.id, state: 'returned' }).edit, true);
    assert.equal(permissions(profile, { owner_id: 'another', state: 'draft' }).edit, false);
  }
});
test('closed cases cannot be changed or withdrawn', () => {
  const result = permissions(cfo, { owner_id: cfo.id, state: 'approved' });
  assert.equal(result.edit, false); assert.equal(result.withdraw, false);
});
test('amount validation rejects invalid or over-precise values', () => {
  const valid = { ...blankContent(), subject: '設備', payee: '廠商', amount: '123.45' };
  assert.equal(validateContent(valid), '');
  for (const amount of ['0', '-1', '1.234', 'Infinity', '1e6', '1000000000', '']) assert.ok(validateContent({ ...valid, amount }));
  assert.ok(validateContent({ ...valid, subject: ' ' }));
});
test('export preserves UTF-8 labels and neutralizes spreadsheet formulas', () => {
  const csv = exportCsv([{ number: 1, content: { ...blankContent(), subject: '=cmd', payee: '"廠商"', amount: '500' }, owner_name: '總務', state: 'approved', created_at: '2026-09-09T00:00:00Z', closed_at: '2026-09-09T01:00:00Z' }]);
  assert.ok(csv.startsWith('\ufeff')); assert.ok(csv.includes("'=cmd")); assert.ok(csv.includes('核准結案'));
});
