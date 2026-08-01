import test from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_ROLE_OPTIONS,
  buildStaffProfile,
  createStaffForm,
  normalizeStoreStaffRow,
  staffMemberToForm,
} from "../src/modules/hr/index.js";

test("人資主檔提供完整且不重複的職稱清單", () => {
  assert.equal(STAFF_ROLE_OPTIONS.includes("兼職人員"), true);
  assert.equal(STAFF_ROLE_OPTIONS.includes("兼職後勤"), true);
  assert.equal(STAFF_ROLE_OPTIONS.includes("送貨人員"), true);
  assert.equal(new Set(STAFF_ROLE_OPTIONS).size, STAFF_ROLE_OPTIONS.length);
});

test("兼職人員平假日預設時間正規化後可直接供排班使用", () => {
  const result = buildStaffProfile({
    store_code: "S01",
    store_name: "鳳山五甲店",
    employee_name: " 測試人員 ",
    role_name: "兼職人員",
    weekday_start_time: "10:00:00",
    weekday_end_time: "16:00:00",
    holiday_start_time: "10:00",
    holiday_end_time: "20:00",
  });
  assert.equal(result.valid, true);
  assert.equal(result.payload.employee_name, "測試人員");
  assert.equal(result.payload.work_start_time, "10:00");
  assert.equal(result.payload.weekday_end_time, "16:00");
  assert.equal(result.payload.holiday_end_time, "20:00");
});

test("兼職人員可不填預設時間，日後由單日班次覆蓋", () => {
  const result = buildStaffProfile({
    store_code: "S01",
    employee_name: "彈性班",
    role_name: "兼職人員",
  });
  assert.equal(result.valid, true);
  assert.equal(result.payload.weekday_start_time, "");
  assert.equal(result.payload.holiday_end_time, "");
});

test("兼職人員只填單側時間會被阻擋", () => {
  const result = buildStaffProfile({
    store_code: "S01",
    employee_name: "不完整班次",
    role_name: "兼職人員",
    weekday_start_time: "10:00",
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /平日/);
});

test("非兼職角色不保留兼職預設工時", () => {
  const result = buildStaffProfile({
    store_code: "S01",
    employee_name: "正式同仁",
    role_name: "正式人員",
    weekday_start_time: "10:00",
    weekday_end_time: "16:00",
  });
  assert.equal(result.valid, true);
  assert.equal(result.payload.weekday_start_time, "");
  assert.equal(result.payload.work_end_time, "");
});

test("資料庫人員列與編輯表單共用同一正規化結果", () => {
  const row = normalizeStoreStaffRow({
    id: "staff-1",
    store_code: "S01",
    store_name: "鳳山五甲店",
    employee_name: "同仁",
    role_name: "兼職人員",
    work_start_time: "12:00:00",
    work_end_time: "20:00:00",
  });
  const form = staffMemberToForm(row);
  assert.equal(form.employee_name, "同仁");
  assert.equal(form.weekday_start_time, "12:00:00");
  assert.equal(form.holiday_end_time, "20:00:00");
  assert.equal(createStaffForm({ storeCode: "S01" }).store_code, "S01");
});
