import test from "node:test";
import assert from "node:assert/strict";
import {
  getPartTimeDefaultWindow,
  resolvePersonWorkWindow,
  segmentCoverageRatio,
  validateTimeWindow,
} from "../src/lib/staffing.js";

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

