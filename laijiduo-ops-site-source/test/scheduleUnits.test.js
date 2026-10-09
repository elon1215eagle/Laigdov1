import assert from "node:assert/strict";
import test from "node:test";
import {
  WUJIA_BACKOFFICE_UNIT_CODE,
  buildWujiaScheduleUnits,
  isWujiaBackofficeStaff,
  scheduleUnitAllowsStaffAssignment,
} from "../src/modules/scheduling/index.js";

const group = {
  code: "S01-S06",
  name: "鳳山五甲店 + 鳳山南華店",
  sourceCodes: ["S01", "S06"],
  demand: 7,
  staff: [
    { id: "front", store_code: "S01", employeeName: "五甲門市", work_category: "門店營運" },
    { id: "nanhua", store_code: "S06", employeeName: "南華人員", work_category: "門店營運" },
  ],
};

test("五甲排班分為門市與封閉後勤，南華仍留在五甲門市", () => {
  const units = buildWujiaScheduleUnits(group, [
    ...group.staff,
    { id: "back", store_code: "S01", employeeName: "後勤人員", work_category: "後勤" },
    { id: "delivery", store_code: "S01", employeeName: "送貨人員", work_category: "送貨" },
  ]);

  assert.equal(units.length, 2);
  assert.equal(units[0].name, "五甲門市（含南華人員）");
  assert.deepEqual(units[0].staff.map((person) => person.id), ["front", "nanhua"]);
  assert.equal(units[1].code, WUJIA_BACKOFFICE_UNIT_CODE);
  assert.deepEqual(units[1].staff.map((person) => person.id), ["back"]);
  assert.equal(units[1].scheduleOnly, true);
  assert.equal(units[1].allowTemporarySupport, false);
});

test("五甲後勤只能排在五甲，不能跨店支援", () => {
  const person = { store_code: "S01", work_category: "後勤" };
  assert.equal(scheduleUnitAllowsStaffAssignment(person, "S01"), true);
  assert.equal(scheduleUnitAllowsStaffAssignment(person, "S06"), false);
  assert.equal(scheduleUnitAllowsStaffAssignment(person, "S09"), false);
});

test("舊版兼職後勤資料沒有工作類別時仍歸入五甲後勤", () => {
  assert.equal(isWujiaBackofficeStaff({ store_code: "S01", role: "兼職後勤" }), true);
  assert.equal(isWujiaBackofficeStaff({ storeName: "鳳山五甲店", role: "兼職後勤" }), true);
  assert.equal(isWujiaBackofficeStaff({ store_code: "S01", role: "送貨人員" }), false);
});
