import assert from "node:assert/strict";
import test from "node:test";

import {
  isStoreManagerRevenueDateAllowed,
  storeManagerRevenueMinDate,
} from "../src/modules/daily-report/index.js";

test("store manager revenue access includes today and the preceding thirteen days", () => {
  assert.equal(storeManagerRevenueMinDate("2026-07-30"), "2026-07-17");
  assert.equal(isStoreManagerRevenueDateAllowed("2026-07-17", "2026-07-30"), true);
  assert.equal(isStoreManagerRevenueDateAllowed("2026-07-30", "2026-07-30"), true);
  assert.equal(isStoreManagerRevenueDateAllowed("2026-07-16", "2026-07-30"), false);
  assert.equal(isStoreManagerRevenueDateAllowed("2026-07-31", "2026-07-30"), false);
});
