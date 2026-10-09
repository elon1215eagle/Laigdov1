import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabasePlan, normalizedHash } from '../maintenance/check-database-plan.mjs';

test('maintenance plan validates archives and excludes historical deployment hazards', async () => {
  assert.deepEqual(await checkDatabasePlan(), {
    local_sources_verified: 8, history_only: 3, archives_verified: 100,
    production_ready: false, network_used: false,
  });
});

test('maintenance entry rejects production and arbitrary remote modes before reading files', async () => {
  for (const mode of ['production', 'https://example.com', 'linked']) {
    await assert.rejects(checkDatabasePlan({ mode, root: 'not-a-real-directory' }), /Production deployment is blocked/);
  }
});

test('source normalization preserves internal SQL, strings and comments', () => {
  assert.equal(normalizedHash('\uFEFFselect 1;\r\n'), normalizedHash('select 1;'));
  assert.notEqual(normalizedHash("select 'a  b';"), normalizedHash("select 'a b';"));
  assert.notEqual(normalizedHash('select 1; -- guard'), normalizedHash('select 1;'));
});
