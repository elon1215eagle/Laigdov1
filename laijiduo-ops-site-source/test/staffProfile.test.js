import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  STAFF_ROLE_OPTIONS,
  WORK_CATEGORY_OPTIONS,
  buildStaffProfile,
  createStaffForm,
  normalizeStoreStaffRow,
  staffMemberToForm,
} from "../src/modules/hr/index.js";

test("人員分類選項符合第一階段核定內容且沒有重複", () => {
  assert.deepEqual(EMPLOYMENT_TYPE_OPTIONS, ["正職", "兼職"]);
  assert.deepEqual(STAFF_ROLE_OPTIONS, ["店長", "副店長", "資深人員", "正職人員", "兼職人員", "總部人員"]);
  assert.deepEqual(WORK_CATEGORY_OPTIONS, ["門店營運", "後勤", "送貨", "總部"]);
  assert.deepEqual(EMPLOYMENT_STATUS_OPTIONS, ["待到職", "在職", "留職停薪", "已離職", "停用"]);
});

test("舊兼職後勤資料會轉成獨立分類而不遺失", () => {
  const row = normalizeStoreStaffRow({ role_name: "兼職後勤", is_active: true });
  assert.equal(row.role, "兼職人員");
  assert.equal(row.employment_type, "兼職");
  assert.equal(row.work_category, "後勤");
  assert.equal(row.employment_status, "在職");
});

test("舊送貨人員資料會保留送貨工作類別", () => {
  const row = normalizeStoreStaffRow({ role_name: "送貨人員", is_active: true });
  assert.equal(row.role, "正職人員");
  assert.equal(row.employment_type, "正職");
  assert.equal(row.work_category, "送貨");
});

test("兼職可使用不同職稱並保留平假日預設工時", () => {
  const result = buildStaffProfile({
    store_code: "S01",
    store_name: "鳳山五甲店",
    employee_name: " 測試人員 ",
    role_name: "資深人員",
    employment_type: "兼職",
    work_category: "門店營運",
    employment_status: "在職",
    weekday_start_time: "10:00:00",
    weekday_end_time: "16:00:00",
    holiday_start_time: "10:00",
    holiday_end_time: "20:00",
  });
  assert.equal(result.valid, true);
  assert.equal(result.payload.employee_name, "測試人員");
  assert.equal(result.payload.role_name, "資深人員");
  assert.equal(result.payload.employment_type, "兼職");
  assert.equal(result.payload.weekday_end_time, "16:00");
  assert.equal(result.payload.holiday_end_time, "20:00");
});

test("兼職預設工時可留空但不可只填一端", () => {
  const optional = buildStaffProfile({
    store_code: "S01", employee_name: "兼職甲", role_name: "兼職人員", employment_type: "兼職",
  });
  assert.equal(optional.valid, true);

  const invalid = buildStaffProfile({
    store_code: "S01", employee_name: "兼職乙", role_name: "兼職人員", employment_type: "兼職",
    weekday_start_time: "10:00",
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.message, /平日/);
});

test("正職不保存兼職預設工時", () => {
  const result = buildStaffProfile({
    store_code: "S01", employee_name: "正職甲", role_name: "正職人員", employment_type: "正職",
    weekday_start_time: "10:00", weekday_end_time: "16:00",
  });
  assert.equal(result.valid, true);
  assert.equal(result.payload.weekday_start_time, "");
  assert.equal(result.payload.work_end_time, "");
});

test("資料列與編輯表單使用同一套分類正規化", () => {
  const row = normalizeStoreStaffRow({
    id: "staff-1", store_code: "S01", store_name: "鳳山五甲店", employee_name: "小美",
    role_name: "兼職人員", employment_type: "兼職", work_category: "門店營運",
    employment_status: "留職停薪", work_start_time: "12:00:00", work_end_time: "20:00:00",
  });
  const form = staffMemberToForm(row);
  assert.equal(form.employee_name, "小美");
  assert.equal(form.employment_status, "留職停薪");
  assert.equal(form.weekday_start_time, "12:00:00");
  assert.equal(form.holiday_end_time, "20:00:00");
  assert.equal(createStaffForm({ storeCode: "S01" }).store_code, "S01");
});
