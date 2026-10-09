import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsStockPickup, directStore, draftError, permissions, productAllowsRoute, quantityChanged, validQuantity } from '../src/modules/transfers/domain.js';
test('stock pickup is an opt-in annotation for meat and sweet potato only',()=>{
  assert.equal(allowsStockPickup({category:'肉品',name:'雞腿'}),true);
  assert.equal(allowsStockPickup({category:'點心',name:'地瓜'}),true);
  assert.equal(allowsStockPickup({category:'點心',name:'花枝丸'}),false);
  assert.equal(allowsStockPickup({category:'五金',name:'手套'}),false);
});
test('pork chop allows only Wujia to Kaixuan or Yihua', () => {
  const product = { active: true, stores: ['S01','S02','S08'], sender_stores: ['S01'], receiver_stores: ['S02','S08'] };
  assert.equal(productAllowsRoute(product,'S01','S02'), true);
  assert.equal(productAllowsRoute(product,'S01','S08'), true);
  for (const [sender,receiver] of [['S02','S01'],['S08','S02'],['S01','S03'],['S01','S01']]) assert.equal(productAllowsRoute(product,sender,receiver), false);
  assert.equal(productAllowsRoute({ active:true, stores:['S01','S02'] },'S02','S01'), true);
});
test('transfer scope is direct stores only', () => {
  for (const x of ['S01', 'S11']) assert.equal(directStore(x), true);
  for (const x of ['F01', 'S12', '', 'S001']) assert.equal(directStore(x), false);
});
test('HQ is outbound only and still respects product recipient restrictions', () => {
  const product={active:true,stores:['S01','S02'],sender_stores:['HQ','S01'],receiver_stores:['S02']};
  assert.equal(productAllowsRoute(product,'HQ','S02'),true);
  assert.equal(productAllowsRoute(product,'HQ','S01'),false);
  assert.equal(productAllowsRoute(product,'S02','HQ'),false);
  assert.equal(productAllowsRoute({...product,sender_stores:['S01']},'HQ','S02'),false);
  const draft={receiver:'S02',sender:'HQ',date:'2026-09-10',lines:[{product_id:'a',unit:'公斤',quantity:0.125}]};
  assert.equal(draftError(draft),'');
  assert.ok(draftError({...draft,receiver:'HQ',sender:'S02'}));
  assert.equal(permissions({store:'S02'}, {sender:'HQ',receiver:'S02',status:'requested',data:{}}).ship,false);
});
test('quantities disallow blank, infinite, negative and excess precision', () => {
  for (const x of ['', ' ', 'NaN', Infinity, -1, 0, 1.0001, 1000001]) assert.equal(validQuantity(x), false);
  for (const x of [0.001, 0.123, 1, 1000000]) assert.equal(validQuantity(x), true);
  assert.equal(validQuantity(0, true), true);
});
test('one product one unit and no source equals destination', () => {
  const draft = { receiver: 'S01', sender: 'S02', date: '2026-09-09', lines: [{ product_id: 'a', unit: '箱', quantity: 1 }] };
  assert.equal(draftError(draft), '');
  assert.ok(draftError({ ...draft, sender: 'S01' }));
  assert.ok(draftError({ ...draft, lines: [...draft.lines, { ...draft.lines[0], unit: '包' }] }));
  assert.ok(draftError({ ...draft, lines: [{ ...draft.lines[0], unit: '' }] }));
});
test('sender ships, receiver receives, unrelated stores have no actions', () => {
  const row = { sender: 'S01', receiver: 'S02', status: 'requested', data: {} };
  assert.equal(permissions({ store: 'S01' }, row).ship, true);
  assert.equal(permissions({ store: 'S02' }, row).ship, false);
  assert.equal(permissions({ store: 'S02' }, { ...row, status: 'shipped' }).receive, true);
  assert.equal(Object.values(permissions({ store: 'S03' }, row)).some(Boolean), false);
  assert.equal(permissions({ is_hq: true }, row).ship, true);
});
test('completed documents immutable except HQ audit note', () => {
  const row = { sender: 'S01', receiver: 'S02', status: 'completed', data: {} };
  assert.equal(Object.values(permissions({ store: 'S01' }, row)).some(Boolean), false);
  assert.deepEqual(Object.keys(permissions({ is_hq: true }, row)).filter(k => permissions({ is_hq: true }, row)[k]), ['correction_note']);
});
test('receipt compares raw quantities without unit conversion', () => {
  assert.equal(quantityChanged([{ product_id: 'a', quantity: 1 }], [{ product_id: 'a', quantity: '1' }]), false);
  assert.equal(quantityChanged([{ product_id: 'a', quantity: 1 }], [{ product_id: 'a', quantity: 3 }]), true);
});
