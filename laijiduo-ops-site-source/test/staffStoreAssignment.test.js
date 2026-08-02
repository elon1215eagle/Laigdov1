import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStaffStoreTransfer,
  hasAssignmentOverlap,
  resolveStaffStoreAtDate,
} from "../src/modules/hr/index.js";

test("調店命令必須包含人員、新門店、生效日與原因", () => {
  assert.equal(buildStaffStoreTransfer({}).valid, false);
  assert.equal(buildStaffStoreTransfer({ staff_id: "A", store_code: "S06", effective_from: "2026-08-01", reason: "調店" }).valid, true);
});

test("指定日期使用當日有效歸屬，不回寫改變歷史", () => {
  const staff = { id: "A", store_code: "S01" };
  const assignments = [
    { id: "old", staff_id: "A", store_code: "S01", effective_from: "1900-01-01", effective_to: "2026-07-31" },
    { id: "new", staff_id: "A", store_code: "S06", effective_from: "2026-08-01", effective_to: null },
  ];
  assert.equal(resolveStaffStoreAtDate(staff, assignments, "2026-07-15"), "S01");
  assert.equal(resolveStaffStoreAtDate(staff, assignments, "2026-08-15"), "S06");
});

test("同一人歸屬日期不可重疊", () => {
  const existing = [{ id: "old", staff_id: "A", store_code: "S01", effective_from: "1900-01-01", effective_to: "2026-07-31" }];
  assert.equal(hasAssignmentOverlap({ staff_id: "A", store_code: "S06", effective_from: "2026-08-01" }, existing), false);
  assert.equal(hasAssignmentOverlap({ staff_id: "A", store_code: "S06", effective_from: "2026-07-31" }, existing), true);
});
