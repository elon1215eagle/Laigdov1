import assert from "node:assert/strict";
import test from "node:test";

import {
  isStoreManagerRevenueDateAllowed,
  storeManagerRevenueMinDate,
} from "../src/modules/daily-report/index.js";

test("store manager revenue access includes the current and previous calendar month", () => {
  assert.equal(storeManagerRevenueMinDate("2026-10-01"), "2026-09-01");
  assert.equal(storeManagerRevenueMinDate("2026-07-30"), "2026-06-01");
  assert.equal(isStoreManagerRevenueDateAllowed("2026-06-01", "2026-07-30"), true);
  assert.equal(isStoreManagerRevenueDateAllowed("2026-07-30", "2026-07-30"), true);
  assert.equal(isStoreManagerRevenueDateAllowed("2026-05-31", "2026-07-30"), false);
  assert.equal(isStoreManagerRevenueDateAllowed("2026-07-31", "2026-07-30"), false);
});
