import test from "node:test";
import assert from "node:assert/strict";
import { readOrderPages } from "../src/modules/quick-checkout-management/data/orderPages.js";

test("management reads more than 1000 orders without silently truncating totals", async () => {
  const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const result = await readOrderPages(() => ({ range: async (from, to) => ({ data: all.slice(from, to + 1) }) }));
  assert.deepEqual(result.data, all);
});

test("failed later pages reject instead of displaying partial totals", async () => {
  await assert.rejects(readOrderPages(() => ({ range: async (from) => from === 0
    ? { data: Array.from({ length: 500 }, (_, id) => ({ id })) }
    : { error: { message: "offline" } } })), /offline/);
});
