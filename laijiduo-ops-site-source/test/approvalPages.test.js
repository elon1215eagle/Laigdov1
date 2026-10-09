import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllPages } from '../src/modules/approvals/readAllPages.js';

test('approval history reads beyond one thousand records', async () => {
  const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
  assert.deepEqual(await readAllPages(async (start, end) => ({ data: source.slice(start, end + 1) })), source);
});

test('approval history rejects incomplete results instead of returning partial history', async () => {
  await assert.rejects(readAllPages(async (start) => start === 0
    ? { data: [{ id: 1 }] }
    : { error: { message: 'offline' } }, 1), /offline/);
  await assert.rejects(readAllPages(async () => ({ data: null })), /Incomplete/);
});
