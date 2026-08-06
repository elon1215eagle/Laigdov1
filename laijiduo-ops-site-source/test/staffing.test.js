import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHalfHourStaffingMatrix,
  getPartTimeDefaultWindow,
  isScheduleExcludedRole,
  projectDailyStaffShifts,
  resolvePersonWorkWindow,
  segmentCoverageRatio,
  validateTimeWindow,
} from "../src/modules/scheduling/index.js";

test("full-time master default hours take precedence over store hours", () => {
  const window = resolvePersonWorkWindow({
    person: {
      role: "正職人員",
      weekday_start_time: "12:00",
      weekday_end_time: "20:00",
    },
    dateValue: "2026-07-29",
    store: { open_time: "10:00", close_time: "23:00" },
  });
  assert.equal(window.startTime, "12:00");
  assert.equal(window.endTime, "20:00");
});

test("full-time staff without master defaults fall back to store hours", () => {
  const window = resolvePersonWorkWindow({
    person: { role: "正職人員" },
    dateValue: "2026-07-29",
    store: { open_time: "10:00", close_time: "23:00" },
  });
  assert.equal(window.startTime, "10:00");
  assert.equal(window.endTime, "23:00");
});

const partTimer = {
  role: "兼職人員",
  weekday_start_time: "10:00",
  weekday_end_time: "16:00",
  holiday_start_time: "10:00",
  holiday_end_time: "20:00",
};

test("平日未調整時使用人資主檔平日時間", () => {
  const window = getPartTimeDefaultWindow(partTimer, "2026-07-29");
  assert.equal(window.startTime, "10:00");
  assert.equal(window.endTime, "16:00");
  assert.equal(window.source, "平日預設");
});

test("週末未調整時使用人資主檔假日時間", () => {
  const window = getPartTimeDefaultWindow(partTimer, "2026-08-01");
  assert.equal(window.startTime, "10:00");
  assert.equal(window.endTime, "20:00");
  assert.equal(window.source, "假日預設");
});

test("指定國定假日使用假日時間", () => {
  const window = getPartTimeDefaultWindow(partTimer, "2026-09-25", ["2026-09-25"]);
  assert.equal(window.source, "假日預設");
});

test("單日調整優先於主檔預設", () => {
  const window = resolvePersonWorkWindow({
    person: partTimer,
    dateValue: "2026-07-29",
    store: {},
    override: { start_time: "13:00", end_time: "21:00", shift_type: "override" },
  });
  assert.equal(window.startTime, "13:00");
  assert.equal(window.endTime, "21:00");
  assert.equal(window.source, "當日調整");
});

test("跨店支援班次標示為支援來源", () => {
  const window = resolvePersonWorkWindow({
    person: partTimer,
    dateValue: "2026-07-29",
    store: {},
    override: { start_time: "15:00", end_time: "23:00", shift_type: "support" },
  });
  assert.equal(window.source, "跨店支援");
});

test("兩個半日班依尖峰覆蓋比例計算，不直接算兩人", () => {
  const lunch = { start: 11 * 60, end: 14 * 60 };
  const first = { start: 10 * 60, end: 16 * 60 };
  const second = { start: 14 * 60, end: 20 * 60 };
  assert.equal(segmentCoverageRatio(first, lunch), 1);
  assert.equal(segmentCoverageRatio(second, lunch), 0);
});

test("允許主檔預設時間全部留空", () => {
  assert.deepEqual(validateTimeWindow("", ""), { valid: true, start: "", end: "" });
});

test("五甲矩陣以30分鐘顯示兼職重疊，不重複放大人力", () => {
  const people = [
    { id: "a", employeeName: "上午班", role: "兼職人員", store_code: "S01", weekday_start_time: "10:00", weekday_end_time: "16:00" },
    { id: "b", employeeName: "下午班", role: "兼職人員", store_code: "S01", weekday_start_time: "14:00", weekday_end_time: "20:00" },
  ];
  const rows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S01", open_time: "10:00", close_time: "20:00" },
    people,
    demand: 1,
    storeCodes: ["S01", "S06"],
  });
  assert.equal(rows.find((row) => row.startTime === "13:30").effectiveCount, 1);
  assert.equal(rows.find((row) => row.startTime === "14:00").effectiveCount, 2);
  assert.equal(rows.find((row) => row.startTime === "16:00").effectiveCount, 1);
});

test("跨店支援只計入實際工作門店", () => {
  const person = { id: "a", employeeName: "支援人員", role: "兼職人員", store_code: "S01", weekday_start_time: "10:00", weekday_end_time: "16:00" };
  const override = [{ shift_date: "2026-07-29", staff_id: "a", assigned_store_code: "S09", start_time: "15:00", end_time: "23:00", shift_type: "support" }];
  const wujiaRows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S01", open_time: "10:00", close_time: "23:00" },
    people: [person],
    overrides: override,
    storeCodes: ["S01", "S06"],
  });
  const dingshanRows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S09", open_time: "10:00", close_time: "23:00" },
    people: [person],
    overrides: override,
    storeCodes: ["S09"],
  });
  assert.equal(wujiaRows.find((row) => row.startTime === "15:00").actualCount, 0);
  assert.equal(dingshanRows.find((row) => row.startTime === "15:00").actualCount, 1);
});

test("同人同日多段班在各時段正確計入且中斷時不在班", () => {
  const person = { id: "a", employeeName: "多段班", role: "正式人員", store_code: "S01" };
  const overrides = [
    { id: "one", shift_date: "2026-07-29", staff_id: "a", assigned_store_code: "S01", start_time: "10:00", end_time: "14:00" },
    { id: "two", shift_date: "2026-07-29", staff_id: "a", assigned_store_code: "S01", start_time: "16:00", end_time: "20:00" },
  ];
  const rows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S01", open_time: "10:00", close_time: "20:00" },
    people: [person],
    overrides,
    demand: 1,
    storeCodes: ["S01"],
  });
  assert.equal(rows.find((row) => row.startTime === "10:00").actualCount, 1);
  assert.equal(rows.find((row) => row.startTime === "14:00").actualCount, 0);
  assert.equal(rows.find((row) => row.startTime === "16:00").actualCount, 1);
});

test("送貨人員完全不列入店面人力矩陣", () => {
  const rows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S01", open_time: "10:00", close_time: "11:00" },
    people: [
      { id: "a", employeeName: "正式人員", role: "正式人員", store_code: "S01" },
      {
        id: "b",
        employeeName: "兼職送貨人員",
        role: "兼職人員",
        employment_type: "兼職",
        work_category: "送貨",
        store_code: "S01",
        excludedFromStaffing: true,
      },
    ],
    demand: 2,
    storeCodes: ["S01"],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].actualCount, 1);
  assert.equal(rows[0].effectiveCount, 1);
  assert.equal(rows[0].gap, 1);
  assert.deepEqual(rows[0].peopleNames, ["正式人員"]);
});

test("工作類別為後勤時不論職稱都不列入有效人力", () => {
  assert.equal(isScheduleExcludedRole({ role: "正式人員", work_category: "後勤" }), true);
  assert.equal(isScheduleExcludedRole({ role: "兼職人員", work_category: "後勤" }), true);
  assert.equal(isScheduleExcludedRole({ role: "兼職人員", work_category: "門店營運" }), false);
  const rows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S01", open_time: "10:00", close_time: "11:00" },
    people: [
      { id: "a", employeeName: "正式人員", role: "正式人員", store_code: "S01" },
      { id: "b", employeeName: "後勤人員", role: "正式人員", work_category: "後勤", store_code: "S01", excludedFromStaffing: true },
    ],
    demand: 2,
    storeCodes: ["S01"],
  });
  assert.equal(rows[0].actualCount, 2);
  assert.equal(rows[0].effectiveCount, 1);
  assert.deepEqual(rows[0].peopleNames, ["正式人員", "後勤人員"]);
});

test("五甲門店與後勤矩陣依工作類別完全分流", () => {
  const people = [
    { id: "store", employeeName: "門店人員", role: "正式人員", work_category: "門店營運", store_code: "S01" },
    { id: "backoffice", employeeName: "後勤人員", role: "兼職人員", work_category: "後勤", store_code: "S01", weekday_start_time: "10:00", weekday_end_time: "18:00" },
    { id: "delivery", employeeName: "送貨人員", role: "兼職人員", work_category: "送貨", store_code: "S01", weekday_start_time: "10:00", weekday_end_time: "18:00" },
  ];
  const common = {
    dateValue: "2026-08-06",
    store: { code: "S01", open_time: "10:00", close_time: "11:00" },
    people,
    demand: 0,
    storeCodes: ["S01"],
  };
  const storefrontRows = buildHalfHourStaffingMatrix({ ...common, matrixMode: "storefront" });
  const backofficeRows = buildHalfHourStaffingMatrix({ ...common, matrixMode: "backoffice" });

  assert.deepEqual(storefrontRows[0].peopleNames, ["門店人員"]);
  assert.equal(storefrontRows[0].effectiveCount, 1);
  assert.deepEqual(backofficeRows[0].peopleNames, ["後勤人員"]);
  assert.equal(backofficeRows[0].actualCount, 1);
  assert.equal(backofficeRows[0].effectiveCount, 1);
});

test("統一班次投影整合正職預設、兼職預設與跨店多段班", () => {
  const people = [
    { id: "full", employeeName: "正職", role: "正職人員", store_code: "S01" },
    { id: "part", employeeName: "兼職", role: "兼職人員", store_code: "S01", weekday_start_time: "10:00", weekday_end_time: "16:00" },
  ];
  const rows = projectDailyStaffShifts({
    dateValue: "2026-07-29",
    store: { open_time: "10:00", close_time: "23:00" },
    people,
    overrides: [
      { id: "a", shift_date: "2026-07-29", staff_id: "part", home_store_code: "S01", assigned_store_code: "S09", start_time: "13:00", end_time: "17:00", shift_type: "support" },
      { id: "b", shift_date: "2026-07-29", staff_id: "part", home_store_code: "S01", assigned_store_code: "S09", start_time: "18:00", end_time: "21:00", shift_type: "support" },
    ],
  });
  assert.deepEqual(rows.map((row) => [row.staffId, row.assignedStoreCode, row.startTime, row.source]), [
    ["full", "S01", "10:00", "門店營業時間"],
    ["part", "S09", "13:00", "跨店支援"],
    ["part", "S09", "18:00", "跨店支援"],
  ]);
});

test("統一班次投影排除休假人員且不替明確班次補主檔預設", () => {
  const people = [
    { id: "leave", employeeName: "休假", role: "正職人員", store_code: "S01" },
    { id: "part", employeeName: "兼職", role: "兼職人員", store_code: "S01", weekday_start_time: "10:00", weekday_end_time: "16:00" },
  ];
  const rows = projectDailyStaffShifts({
    dateValue: "2026-07-29",
    store: { open_time: "10:00", close_time: "23:00" },
    people,
    leaveStaffIds: ["leave"],
    overrides: [
      { id: "only", shift_date: "2026-07-29", staff_id: "part", assigned_store_code: "S01", start_time: "15:00", end_time: "20:00" },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].startTime, "15:00");
});

test("人力矩陣逐時段套用需求規則而非整日固定人數", () => {
  const rows = buildHalfHourStaffingMatrix({
    dateValue: "2026-07-29",
    store: { code: "S01", open_time: "10:00", close_time: "12:00" },
    people: [],
    demand: 1,
    demandResolver: (time) => time >= "11:00" ? 3 : 1,
    storeCodes: ["S01"],
  });
  assert.equal(rows.find((row) => row.startTime === "10:30").demand, 1);
  assert.equal(rows.find((row) => row.startTime === "11:00").demand, 3);
  assert.equal(rows.find((row) => row.startTime === "11:00").gap, 3);
});
