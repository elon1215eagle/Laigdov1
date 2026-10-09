import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoreWeeklyComparisonRows,
  buildWeeklySameDayRows,
  buildWeeklyStoreGroups,
} from "../src/modules/daily-report/index.js";

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

test("store weekly comparison excludes dates that have not been reported this week", () => {
  const reports = [
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-08-03",
      opened_to_1400_revenue: 100,
    },
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-08-04",
      opened_to_1400_revenue: 200,
    },
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-08-10",
      opened_to_1400_revenue: 150,
    },
  ];

  const rows = buildStoreWeeklyComparisonRows(reports, "2026-08-10");

  assert.deepEqual(rows.map((row) => row.currentDate), ["2026-08-10"]);
  assert.equal(rows[0].growth, 50);
});

test("store weekly comparison falls back to the latest reported week", () => {
  const reports = [
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-07-27",
      opened_to_1400_revenue: 100,
    },
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-08-03",
      opened_to_1400_revenue: 150,
    },
    {
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-08-09",
      opened_to_1400_revenue: 300,
    },
  ];

  const rows = buildStoreWeeklyComparisonRows(reports, "2026-08-10");

  assert.deepEqual(rows.map((row) => row.currentDate), ["2026-08-03", "2026-08-09"]);
  assert.equal(rows[0].comparisonPeriod, "latest");
  assert.equal(rows[0].growth, 50);
});

test("headquarters comparison groups rows by store and summarizes reported days", () => {
  const groups = buildWeeklyStoreGroups([
    { storeCode: "S01", storeName: "五甲", current: {}, previous: {}, currentTotal: 120, previousTotal: 100 },
    { storeCode: "S01", storeName: "五甲", current: null, previous: {}, currentTotal: 0, previousTotal: 80 },
    { storeCode: "S02", storeName: "凱旋", current: {}, previous: null, currentTotal: 50, previousTotal: 0 },
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    storeCode: "S01",
    storeName: "五甲",
    rows: [
      { storeCode: "S01", storeName: "五甲", current: {}, previous: {}, currentTotal: 120, previousTotal: 100 },
      { storeCode: "S01", storeName: "五甲", current: null, previous: {}, currentTotal: 0, previousTotal: 80 },
    ],
    currentTotal: 120,
    previousTotal: 180,
    currentCount: 1,
    previousCount: 2,
    delta: -60,
    growth: -33.33333333333333,
    comparisonReady: true,
  });
  assert.equal(groups[1].comparisonReady, false);
});
