import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonalScheduleSnapshot,
  buildPrintableScheduleHtml,
  buildScheduleExportModel,
  personalScheduleExpiry,
} from "../src/modules/scheduling/index.js";

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

test("個人班表只包含本人日期、時段、門店及職稱", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08", version: 4,
    drafts: { "2026-08:p1": { dates: "2" }, "2026-08:p2": { dates: "3" } },
    storeGroups: [{
      code: "S01", name: "五甲店", sourceCodes: ["S01"], open_time: "10:00", close_time: "23:00",
      staff: [
        { id: "p1", employeeName: "本人", role: "兼職人員", employment_type: "兼職", store_code: "S01", weekday_start_time: "12:00", weekday_end_time: "20:00", holiday_start_time: "10:00", holiday_end_time: "20:00" },
        { id: "p2", employeeName: "他人", role: "正職人員", store_code: "S01" },
      ],
    }],
    dailyShifts: [
      { shift_date: "2026-08-04", staff_id: "p1", employee_name: "本人", home_store_code: "S01", assigned_store_code: "S09", start_time: "13:00", end_time: "21:00", shift_type: "support" },
      { shift_date: "2026-08-04", staff_id: "p2", employee_name: "他人", home_store_code: "S01", assigned_store_code: "S01", start_time: "10:00", end_time: "23:00" },
    ],
  });
  const snapshot = buildPersonalScheduleSnapshot(model, "p1");
  assert.equal(snapshot.employee_name, "本人");
  assert.equal(JSON.stringify(snapshot).includes("他人"), false);
  assert.equal(snapshot.rows.find((row) => row.date === "2026-08-02").status, "leave");
  assert.deepEqual(snapshot.rows.find((row) => row.date === "2026-08-04").shifts[0], {
    start_time: "13:00", end_time: "21:00", store_code: "S09", shift_type: "support",
  });
});

test("個人班表預設於月份結束後七天台北時間失效", () => {
  assert.equal(personalScheduleExpiry("2026-08"), "2026-09-07T15:59:59.999Z");
});
