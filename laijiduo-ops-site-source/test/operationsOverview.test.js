import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationsOverview,
  buildOperationsPriorities,
} from "../src/modules/dashboard/index.js";

const reports = [
  {
    id: "r1",
    store_id: "s1",
    store_code: "S01",
    name: "五甲店",
    updated_at_label: "14:30",
    opened_to_1400_revenue: 20000,
    revenue_1400_to_1900: 20000,
    revenue_1900_to_close: 10000,
    target: 50000,
    cash_difference: 0,
  },
  {
    store_id: "s2",
    store_code: "S02",
    name: "凱旋店",
    updated_at_label: "尚未回報",
    opened_to_1400_revenue: 10000,
    revenue_1400_to_1900: 10000,
    revenue_1900_to_close: 10000,
    target: 50000,
    cash_difference: -600,
  },
];

test("operations overview centralizes revenue, reporting and exception metrics", () => {
  const overview = buildOperationsOverview({
    reports,
    handovers: [{ status: "需追蹤", cash_status: "正常", cleaning_status: "完成" }],
    staffRoster: [{ store_code: "S01", role: "店長", is_active: true }],
    scheduleRows: [{ storeCode: "S02", storeName: "凱旋店", status: "人力不足" }],
    hqTasks: [
      { title: "逾期", status: "處理中", due_date: "2026-07-31" },
      { title: "人資", status: "待處理", due_date: "2026-08-02", scope_type: "人資" },
    ],
    anomalyRows: [
      { id: "a1", level: "提醒", due_date: "2026-08-03" },
      { id: "a2", level: "重大", due_date: "2026-08-03" },
      { id: "a3", level: "提醒", due_date: "2026-07-30" },
    ],
    today: "2026-08-01",
  });

  assert.equal(overview.total, 80000);
  assert.equal(overview.target, 100000);
  assert.equal(overview.attainmentRate, 80);
  assert.deepEqual(overview.reportedRows.map((row) => row.store_code), ["S01"]);
  assert.deepEqual(overview.unreported.map((row) => row.store_code), ["S02"]);
  assert.equal(overview.reportRate, 50);
  assert.deepEqual(overview.cashIssues.map((row) => row.store_code), ["S02"]);
  assert.deepEqual(overview.lowRevenue.map((row) => row.store_code), ["S02"]);
  assert.deepEqual(overview.shortageRows.map((row) => row.storeCode), ["S02"]);
  assert.deepEqual(overview.overdueTasks.map((row) => row.title), ["逾期"]);
  assert.deepEqual(overview.pendingHr.map((row) => row.title), ["人資"]);
  assert.deepEqual(overview.managerGaps.map((row) => row.store_code), ["S02"]);
  assert.deepEqual(overview.ranking.map((row) => row.store_code), ["S01", "S02"]);
  assert.deepEqual(overview.riskRows.map((row) => row.id), ["a3", "a2", "a1"]);
});

test("paused Nanhua store is excluded from manager gaps", () => {
  const overview = buildOperationsOverview({
    reports: [{ store_code: "S06", name: "鳳山南華店", target: 0 }],
    staffRoster: [],
  });

  assert.equal(overview.managerGaps.length, 0);
});

test("dashboard priorities keep unreported stores ahead of staffing and revenue warnings", () => {
  const overview = buildOperationsOverview({
    reports,
    scheduleRows: [{ storeCode: "S02", storeName: "凱旋店", status: "人力不足", note: "缺 1 人" }],
  });
  const priorities = buildOperationsPriorities(overview);

  assert.deepEqual(priorities.map((row) => row.type), ["尚未回報", "排班缺口", "營收未達標"]);
  assert.equal(priorities[1].message, "缺 1 人");
  assert.equal(priorities[2].attainment, 60);
});
