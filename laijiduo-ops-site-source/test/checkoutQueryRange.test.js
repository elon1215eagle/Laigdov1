import test from "node:test";
import assert from "node:assert/strict";
import { checkoutQueryRange } from "../src/modules/quick-checkout-management/domain/queryRange.js";

test("checkout includes the whole last Taipei calendar day", () => {
  for (const [day, next] of [["2026-09-10", "2026-09-11"], ["2026-09-30", "2026-10-01"], ["2026-12-31", "2027-01-01"], ["2028-02-29", "2028-03-01"]]) {
    const range = checkoutQueryRange(day, day);
    assert.equal(range.until, `${next}T00:00:00+08:00`);
    assert.equal(Date.parse(range.until) - Date.parse(range.from), 86400000);
  }
});

test("checkout rejects invalid or reversed ranges before querying", () => {
  for (const [from, to] of [["", "2026-09-10"], ["2026-02-30", "2026-03-01"], ["2026-09-11", "2026-09-10"]]) {
    assert.throws(() => checkoutQueryRange(from, to));
  }
});
