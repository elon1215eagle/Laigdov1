import assert from "node:assert/strict";
import test from "node:test";

import { buildWeeklySameDayRows } from "../src/modules/daily-report/index.js";

test("weekly comparison aligns the same weekday across two weeks", () => {
  const reports = [
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-07-20",
      opened_to_1400_revenue: 100,
      revenue_1400_to_1900: 100,
      revenue_1900_to_close: 100,
    },
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-07-27",
      opened_to_1400_revenue: 150,
      revenue_1400_to_1900: 150,
      revenue_1900_to_close: 150,
    },
  ];

  const rows = buildWeeklySameDayRows(reports, "2026-07-30");
  const monday = rows.find((row) => row.currentDate === "2026-07-27");

  assert.equal(monday.previousDate, "2026-07-20");
  assert.equal(monday.currentTotal, 450);
  assert.equal(monday.previousTotal, 300);
  assert.equal(monday.delta, 150);
  assert.equal(monday.growth, 50);
});

test("new revenue with no prior-week value reports one hundred percent growth", () => {
  const rows = buildWeeklySameDayRows([{
    store_code: "S01",
    name: "五甲店",
    report_date: "2026-07-28",
    opened_to_1400_revenue: 100,
  }], "2026-07-30");
  const tuesday = rows.find((row) => row.currentDate === "2026-07-28");

  assert.equal(tuesday.previousTotal, 0);
  assert.equal(tuesday.growth, 100);
});
