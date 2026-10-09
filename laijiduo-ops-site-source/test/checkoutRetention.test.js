import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickCheckoutModule } from '../src/modules/quick-checkout/application/quickCheckoutModule.js';

test('existing workspace is never overwritten by setup', async () => {
  let writes = 0;
  const module = createQuickCheckoutModule({ products: [], adapter: { loadWorkspace: async () => ({ orders: [] }), saveWorkspace: async () => writes++ } });
  await assert.rejects(module.startWorkspace({}), /不可覆蓋/);
  assert.equal(writes, 0);
});

test('reset refuses active orders and refuses to clear when load fails', async () => {
  for (const load of [async () => ({ orders: [{ status: 'draft' }] }), async () => { throw new Error('offline'); }]) {
    let clears = 0;
    const module = createQuickCheckoutModule({ products: [], adapter: { loadWorkspace: load, clearWorkspace: async () => clears++ } });
    await assert.rejects(module.reset());
    assert.equal(clears, 0);
  }
});
