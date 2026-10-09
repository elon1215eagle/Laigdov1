import test from 'node:test';
import assert from 'node:assert/strict';
import { componentDatabase, actor, owner, hqId } from './helpers/maintenanceComponentDatabase.js';

test('isolated checkout device and workspace contracts', async t => {
  const db = await componentDatabase('checkout');
  t.after(() => db.close());
  const create = async code => (await db.query(
    'select public.quick_checkout_create_device($1,$2) as result', [code, 'Test device'])).rows[0].result;
  const save = (token, workspace) => db.query('select public.quick_checkout_save_workspace($1,$2::jsonb)',
    [token, JSON.stringify(workspace)]);
  const load = async token => (await db.query('select public.quick_checkout_load_workspace($1) as result', [token])).rows[0].result.workspace;
  const order = { id: 'isolated-order', status: 'completed', lines: [
    {productCode: 'chicken_wing', productName: 'Test wing', unitPrice: 20, quantity: 2},
  ] };
  await actor(db);
  let first, second;
  await t.test('manager binds own store; cross-store binding denied', async () => {
    await assert.rejects(create('T02'), /not authorized/);
    first = await create('T01');
    assert.equal(first.storeCode, 'T01');
    await owner(db);
    const hash = (await db.query('select token_hash from quick_checkout_devices where id=$1', [first.deviceId])).rows[0].token_hash;
    assert.notEqual(hash, first.deviceToken);
    await actor(db, hqId);
    second = await create('T02');
  });
  await t.test('anonymous tables, resolver and binding RPC inaccessible', async () => {
    await actor(db, '', 'anon');
    await assert.rejects(db.query('select * from quick_checkout_devices'), /permission denied/);
    await assert.rejects(db.query('select quick_checkout_resolve_device($1)', [first.deviceToken]), /permission denied/);
    await assert.rejects(create('T01'), /permission denied/);
  });
  await t.test('token workspace derives store server-side and isolates devices', async () => {
    await save(second.deviceToken, {marker: 'second'});
    await save(first.deviceToken, {storeCode: 'T02', storeName: 'Forged', orders: [order]});
    const result = await load(first.deviceToken);
    assert.equal(result.storeCode, 'T01');
    assert.equal(result.storeName, 'Test store one');
    assert.equal((await load(second.deviceToken)).marker, 'second');
  });
  await t.test('invalid, short, nonobject and oversized payloads denied', async () => {
    await assert.rejects(load('invalid'), /invalid or revoked/);
    await assert.rejects(load('x'.repeat(64)), /invalid or revoked/);
    await assert.rejects(save(first.deviceToken, []), /JSON object/);
    await assert.rejects(save(first.deviceToken, {large: 'x'.repeat(1048577)}), /size limit/);
  });
  await t.test('constraint failure atomically preserves workspace and orders', async () => {
    const before = await load(first.deviceToken);
    await assert.rejects(save(first.deviceToken, {orders: [{...order, id: 'invalid-order', discount: {amount: 999}}]}), /check constraint/);
    assert.deepEqual(await load(first.deviceToken), before);
    await owner(db);
    assert.equal((await db.query('select count(*)::int as n from quick_checkout_orders')).rows[0].n, 1);
    await actor(db, '', 'anon');
  });
  await t.test('resend cannot rewrite finalized normalized order or lines', async () => {
    await save(first.deviceToken, {orders: [{...order, status: 'draft', lines: []}]});
    await owner(db);
    assert.deepEqual((await db.query('select status,subtotal,total from quick_checkout_orders')).rows,
      [{status: 'completed', subtotal: 40, total: 40}]);
    assert.equal((await db.query('select count(*)::int as n from quick_checkout_order_lines')).rows[0].n, 1);
    await assert.rejects(db.query("update quick_checkout_orders set status='draft'"), /immutable/);
  });
  await t.test('manager RLS cannot read another store order', async () => {
    await actor(db, '', 'anon');
    await save(second.deviceToken, {orders: [{...order, id: 'second-order'}]});
    await actor(db);
    assert.equal((await db.query('select count(*)::int as n from quick_checkout_orders')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from quick_checkout_order_lines')).rows[0].n, 1);
  });
  await t.test('clear is device-scoped and retains normalized order history', async () => {
    await actor(db, '', 'anon');
    await db.query('select quick_checkout_clear_workspace($1)', [first.deviceToken]);
    assert.equal(await load(first.deviceToken), null);
    assert.equal((await load(second.deviceToken)).storeCode, 'T02');
    await owner(db);
    assert.equal((await db.query('select count(*)::int as n from quick_checkout_orders')).rows[0].n, 2);
  });
  await t.test('revoked device cannot load, save or clear', async () => {
    await db.query('update quick_checkout_devices set is_active=false,revoked_at=now() where id=$1', [first.deviceId]);
    await actor(db, '', 'anon');
    await assert.rejects(load(first.deviceToken), /invalid or revoked/);
    await assert.rejects(save(first.deviceToken, {}), /invalid or revoked/);
    await assert.rejects(db.query('select quick_checkout_clear_workspace($1)', [first.deviceToken]), /invalid or revoked/);
  });
});
