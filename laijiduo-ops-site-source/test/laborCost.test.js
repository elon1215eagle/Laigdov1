import assert from "node:assert/strict";
import test from "node:test";

import { calculateProjectedLaborCost, estimatedHourlyCost } from "../src/modules/scheduling/index.js";

test("正職預估時薪依月薪除以30再除以8", () => {
  assert.equal(estimatedHourlyCost({ role: "正式人員" }, [{ role: "正式人員", base_salary: "42000" }]), 175);
});

test("兼職未設定預估時薪時列為待補，不套用職級月薪", () => {
  assert.equal(estimatedHourlyCost({ role: "兼職人員", employment_type: "兼職" }, []), 0);
});

test("跨店多段班成本依實際工作門店分攤", () => {
  const result = calculateProjectedLaborCost({
    people: [{ id: "p1", role: "兼職人員", employment_type: "兼職", estimated_hourly_cost: 200 }],
    projectedShifts: [
      { staffId: "p1", assignedStoreCode: "S01", start: 600, end: 840 },
      { staffId: "p1", assignedStoreCode: "S09", start: 900, end: 1200 },
    ],
  });
  assert.equal(result.totalHours, 9);
  assert.equal(result.estimatedCost, 1800);
  assert.deepEqual(result.byStore, [
    { storeCode: "S01", hours: 4, estimatedCost: 800 },
    { storeCode: "S09", hours: 5, estimatedCost: 1000 },
  ]);
});
