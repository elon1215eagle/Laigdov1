import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportRecordsCsv,
  completeReportRecordsForExport,
  reportRecordsFilename,
  sortReportRecordsForExport,
  sortStoresForReportExport,
} from "../src/modules/daily-report/application/reportRecordsExport.js";

test("report records export includes the visible operational fields and escapes notes", () => {
  const csv = buildReportRecordsCsv([{
    report_date: "2026-09-01",
    store_code: "S01",
    name: "鳳山五甲店",
    opened_to_1400_revenue: 1000,
    revenue_1400_to_1900: 2000,
    revenue_1900_to_close: 3000,
    delivery_revenue: 500,
    employee_meal_total: 120,
    scheduled_staff_count: 4,
    actual_staff_count: 3,
    staffing_variance_reason: "臨時請假",
    customer_complaint_count: 1,
    customer_complaint_detail: "餐點,延誤",
    equipment_issue: true,
    equipment_issue_detail: "炸爐異常",
    special_event: "大雨",
    cash_difference: -20,
    manager_note: "已聯絡\"維修\"",
    status: "approved",
  }]);

  assert.match(csv, /"全日總營收"/);
  assert.match(csv, /"6000"/);
  assert.match(csv, /"餐點,延誤"/);
  assert.match(csv, /"已聯絡""維修"""/);
  assert.match(csv, /"已確認"/);
});

test("report records filename carries the selected range and store", () => {
  assert.equal(
    reportRecordsFilename({ dateFrom: "2026-09-01", dateTo: "2026-09-30", storeName: "全部門店" }),
    "萊吉多門店回報-2026-09-01-2026-09-30-全部門店.csv",
  );
});

test("report records can be grouped by store or ordered by date", () => {
  const rows = [
    { id: "s02-new", store_code: "S02", report_date: "2026-09-02" },
    { id: "s01-new", store_code: "S01", report_date: "2026-09-03" },
    { id: "s01-old", store_code: "S01", report_date: "2026-09-01" },
    { id: "s10-old", store_code: "S10", report_date: "2026-09-01" },
  ];

  assert.deepEqual(
    sortReportRecordsForExport(rows, "store_date_asc").map((row) => row.id),
    ["s01-old", "s01-new", "s02-new", "s10-old"],
  );
  assert.deepEqual(
    sortReportRecordsForExport(rows, "date_asc").map((row) => row.id),
    ["s01-old", "s10-old", "s02-new", "s01-new"],
  );
  assert.deepEqual(rows.map((row) => row.id), ["s02-new", "s01-new", "s01-old", "s10-old"]);
});

test("stores follow the approved operating order", () => {
  const stores = ["S06", "S07", "S08", "S09", "S11", "S10", "S05", "S04", "S03", "S02", "S01"]
    .map((store_code) => ({ store_code }));

  assert.deepEqual(
    sortStoresForReportExport(stores).map((store) => store.store_code),
    ["S01", "S02", "S03", "S04", "S05", "S09", "S08", "S07", "S10", "S11", "S06"],
  );
});

test("export fills every store date and leaves unreported values blank", () => {
  const completed = completeReportRecordsForExport({
    rows: [{
      id: "report-1",
      store_id: "store-1",
      store_code: "S01",
      name: "五甲店",
      report_date: "2026-09-02",
      opened_to_1400_revenue: 100,
      revenue_1400_to_1900: 200,
      revenue_1900_to_close: 300,
      status: "submitted",
    }],
    stores: [
      { id: "store-1", store_code: "S01", name: "五甲店" },
      { id: "store-2", store_code: "S02", name: "凱旋店" },
    ],
    dateFrom: "2026-09-01",
    dateTo: "2026-09-03",
  });

  assert.equal(completed.length, 6);
  assert.deepEqual(completed.slice(0, 3).map((row) => row.report_date), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.equal(completed[0].missing_report, true);
  assert.equal(completed[1].id, "report-1");
  assert.equal(completed[3].store_code, "S02");

  const csv = buildReportRecordsCsv(completed);
  const missingLine = csv.split("\n").find((line) => line.includes('"2026-09-01"') && line.includes('"S01"'));
  assert.match(missingLine, /"S01","五甲店","","","",""/);
  assert.match(missingLine, /"未回報"$/);
});
