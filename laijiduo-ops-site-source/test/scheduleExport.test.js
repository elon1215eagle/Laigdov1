import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonalScheduleSnapshot,
  buildPrintableScheduleHtml,
  buildScheduleExcelXml,
  buildScheduleExportModel,
  buildStoreDailyStaffingSummary,
  personalScheduleExpiry,
  selectScheduleImageStores,
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

test("班表輸出可解析正式畫面的月份日期格式", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08",
    drafts: { "2026-08:p1": { dates: "8/5、8/10、8/15" } },
    storeGroups: [{
      code: "S08",
      name: "三民義華店",
      sourceCodes: ["S08"],
      staff: [{ id: "p1", employeeName: "測試人員", role: "正式人員" }],
    }],
  });

  assert.deepEqual(model.stores[0].staff[0].leaveDays, [5, 10, 15]);
  assert.equal((buildPrintableScheduleHtml(model).match(/class="leave"/g) || []).length, 3);
});

test("總部下載圖片選全部門店時保留所有門店，選單店時只輸出該店", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08",
    drafts: {},
    storeGroups: [
      { code: "S07", name: "三民大昌店", sourceCodes: ["S07"], staff: [] },
      { code: "S08", name: "三民義華店", sourceCodes: ["S08"], staff: [] },
    ],
  });

  assert.deepEqual(selectScheduleImageStores(model).map((store) => store.code), ["S07", "S08"]);
  assert.deepEqual(selectScheduleImageStores(model, "S08").map((store) => store.code), ["S08"]);
});

test("排假輸出標記週末並計算每日有效人力、需求與缺口", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08",
    drafts: { "2026-08:p1": { dates: "1" } },
    storeGroups: [{
      code: "S08", name: "三民義華店", sourceCodes: ["S08"], demand: 2,
      staff: [
        { id: "p1", employeeName: "甲", role: "正式人員" },
        { id: "p2", employeeName: "乙", role: "正式人員" },
        { id: "p3", employeeName: "丙", role: "正式人員" },
      ],
    }],
  });
  assert.ok(model.weekendDays.includes(1));
  assert.deepEqual(buildStoreDailyStaffingSummary(model, model.stores[0])[0], { day: 1, effective: 2, demand: 2, balance: 0 });
  assert.deepEqual(buildStoreDailyStaffingSummary(model, model.stores[0])[1], { day: 2, effective: 3, demand: 2, balance: 1 });
});

test("Excel 排假表保留紅色休假、週末、三列人力摘要及門店空白列", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08",
    drafts: { "2026-08:p1": { dates: "1" } },
    storeGroups: [
      { code: "S07", name: "三民大昌店", sourceCodes: ["S07"], demand: 3, staff: [{ id: "p1", employeeName: "甲", role: "正式人員" }] },
      { code: "S08", name: "三民義華店", sourceCodes: ["S08"], demand: 2, staff: [] },
    ],
  });
  const xml = buildScheduleExcelXml(model);
  assert.match(xml, /ss:StyleID="Weekend"/);
  assert.match(xml, /ss:StyleID="Leave"/);
  assert.match(xml, /有效人力/);
  assert.match(xml, /店面需求/);
  assert.match(xml, /缺口小計/);
  assert.match(xml, /<Row\/><Row ss:Height="37\.5"><Cell ss:StyleID="StoreTitle"/);
  assert.match(xml, /<Column ss:Width="187\.5"\/>/);
  assert.equal((xml.match(/<Column ss:Width="52\.5"\/>/g) || []).length, 31);
  assert.match(xml, /<Row ss:Height="37\.5"><Cell ss:StyleID="StoreTitle"/);
  assert.match(xml, /<Row ss:Height="30"><Cell ss:StyleID="Header"/);
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

test("個人班表沒有正式班次時不得用主檔或營業時間虛構上班資料", () => {
  const model = buildScheduleExportModel({
    periodMonth: "2026-08",
    storeGroups: [{
      code: "S08",
      name: "三民義華店",
      sourceCodes: ["S08"],
      open_time: "09:30",
      close_time: "22:30",
      staff: [{
        id: "p1",
        employeeName: "測試人員",
        role: "正式人員",
        employment_type: "正職",
        store_code: "S08",
        weekday_start_time: "10:00",
        weekday_end_time: "20:00",
      }],
    }],
    drafts: {},
    dailyShifts: [],
  });

  const snapshot = buildPersonalScheduleSnapshot(model, "p1");
  assert.equal(snapshot.rows[0].status, "unscheduled");
  assert.deepEqual(snapshot.rows[0].shifts, []);
});
