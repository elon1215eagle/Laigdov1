import test from "node:test";
import assert from "node:assert/strict";

import { buildStoreOperationsModel } from "../src/modules/daily-report/index.js";

test("門店營運視圖建立本月完整日期、昨日摘要與月目標進度", () => {
  const model = buildStoreOperationsModel({
    referenceDate: "2026-08-05",
    dailyTarget: 30000,
    monthlyTarget: 930000,
    reports: [
      { id: "a", report_date: "2026-08-01", opened_to_1400_revenue: 5000, revenue_1400_to_1900: 10000, revenue_1900_to_close: 15000 },
      { id: "b", report_date: "2026-08-04", opened_to_1400_revenue: 6000, revenue_1400_to_1900: 11000, revenue_1900_to_close: 16000 },
    ],
  });

  assert.equal(model.dailyRows.length, 31);
  assert.equal(model.dailyRows[0].date, "2026-08-01");
  assert.equal(model.dailyRows.at(-1).date, "2026-08-31");
  assert.equal(model.yesterday.date, "2026-08-04");
  assert.equal(model.yesterday.total, 33000);
  assert.equal(model.monthTotal, 63000);
  assert.equal(model.remainingDays, 26);
  assert.equal(model.dailyRows.find((row) => row.date === "2026-08-03").state, "missing");
  assert.equal(model.dailyRows.find((row) => row.date === "2026-08-05").state, "incomplete");
  assert.equal(model.dailyRows.find((row) => row.date === "2026-08-06").state, "future");
});

test("每月一日仍可顯示上月最後一天的昨日營收", () => {
  const model = buildStoreOperationsModel({
    referenceDate: "2026-08-01",
    dailyTarget: 30000,
    monthlyTarget: 930000,
    reports: [{ id: "previous", report_date: "2026-07-31", opened_to_1400_revenue: 6000, revenue_1400_to_1900: 12000, revenue_1900_to_close: 14000 }],
  });
  assert.equal(model.yesterday.date, "2026-07-31");
  assert.equal(model.yesterday.total, 32000);
  assert.equal(model.yesterday.attainment, 32000 / 30000 * 100);
});
