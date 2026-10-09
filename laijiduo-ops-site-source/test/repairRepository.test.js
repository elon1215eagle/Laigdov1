import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairRepository } from '../src/modules/repairs/repository.js';
test('missing backend never returns fake success', async () => {
  await assert.rejects(createRepairRepository(null).list());
  await assert.rejects(createRepairRepository({ rpc: async () => ({ error: { code: 'PGRST202' } }) }).list(), /尚未啟用/);
});
test('partial data is refused', async () => {
  for (const data of [null, {}, { actor: {}, rows: [], stores: [] }]) {
    await assert.rejects(createRepairRepository({ rpc: async () => ({ data }) }).list(), /不完整/);
  }
});
test('reads only through the repair RPC', async () => {
  const data = { actor: { active: true }, rows: [], stores: [], complete: true };
  const repo = createRepairRepository({ rpc: async (name, args) => {
    assert.equal(name, 'ops_repair_api'); assert.equal(args.p_action, 'list'); return { data };
  } });
  assert.equal(await repo.list(), data);
  assert.equal(repo.save, undefined);
});
