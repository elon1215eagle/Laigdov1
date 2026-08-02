import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintableScheduleHtml, buildScheduleExportModel } from "../src/modules/scheduling/index.js";

test("班表輸出模型保留版本、門店、休假與特殊班次", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08", version: 3, needsReconfirmation: true,
    generatedAt: "2026-08-02T12:00:00Z",
    drafts: { "2026-08:p1": { dates: "1, 3" } },
    storeGroups: [{ code: "S01", name: "五甲店", sourceCodes: ["S01"], staff: [{ id: "p1", employeeName: "測試", role: "正職人員" }] }],
    dailyShifts: [{ shift_date: "2026-08-03", employee_name: "測試", home_store_code: "S01", assigned_store_code: "S09", start_time: "10:00", end_time: "14:00" }],
  });
  assert.deepEqual(model.stores[0].staff[0].leaveDays, [1, 3]);
  const html = buildPrintableScheduleHtml(model);
  assert.match(html, /版本 V3/);
  assert.match(html, /異動後待總部重新確認/);
  assert.match(html, /S01 → S09/);
});
