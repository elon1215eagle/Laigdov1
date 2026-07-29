import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationsDashboardService,
  enrichInventoryWithPrevious,
} from "../src/modules/daily-report/data/operationsDashboardService.js";

test("inventory usage context follows the previous report for the same store and product", () => {
  const reports = [
    { id: "r1", store_id: "s1", report_date: "2026-07-29" },
    { id: "r2", store_id: "s1", report_date: "2026-07-30" },
    { id: "r3", store_id: "s2", report_date: "2026-07-30" },
  ];
  const rows = [
    { report_id: "r2", product_id: "p1", current_stock: 6, stock_unit: "箱" },
    { report_id: "r1", product_id: "p1", current_stock: 9, stock_unit: "箱" },
    { report_id: "r3", product_id: "p1", current_stock: 4, stock_unit: "箱" },
  ];

  const enriched = enrichInventoryWithPrevious(reports, rows);
  const current = enriched.find((row) => row.report_id === "r2");
  const otherStore = enriched.find((row) => row.report_id === "r3");

  assert.equal(current.previous_stock, 9);
  assert.equal(current.previous_stock_unit, "箱");
  assert.equal(otherStore.previous_stock, 0);
});

test("dashboard service loads one context day but only returns requested dates", async () => {
  const requestedRanges = [];
  const service = createOperationsDashboardService({
    dailyReportRepository: {
      async fetchRange(dateFrom, dateTo) {
        requestedRanges.push([dateFrom, dateTo]);
        return [
          { id: "previous", store_id: "s1", report_date: "2026-07-29" },
          { id: "visible", store_id: "s1", report_date: "2026-07-30" },
        ];
      },
    },
    inventoryRepository: {
      async fetchForReports(ids) {
        assert.deepEqual(ids, ["previous", "visible"]);
        return [
          { report_id: "previous", product_id: "p1", current_stock: 8 },
          { report_id: "visible", product_id: "p1", current_stock: 5 },
        ];
      },
    },
  });

  const result = await service.fetchRange("2026-07-30", "2026-07-30");

  assert.deepEqual(requestedRanges, [["2026-07-29", "2026-07-30"]]);
  assert.deepEqual(result.reports.map((report) => report.id), ["visible"]);
  assert.equal(result.inventoryRows.length, 1);
  assert.equal(result.inventoryRows[0].previous_stock, 8);
});
