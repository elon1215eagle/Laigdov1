import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDailyStaffing,
  isScheduleExcludedRole,
  scheduleGroupForStore,
} from "../src/modules/scheduling/index.js";
import { STORE_RELATION_GROUPS } from "../src/lib/storeScope.js";

test("排班群組只把五甲與南華合併在排班範圍", () => {
  const group = scheduleGroupForStore({
    code: "S01",
    name: "鳳山五甲店",
    demand: 5,
    open_time: "10:00",
    close_time: "23:00",
  }, STORE_RELATION_GROUPS);
  assert.equal(group.code, "S01-S06");
  assert.deepEqual(group.sourceCodes, ["S01", "S06"]);
});

test("兼職後勤與送貨角色不列入有效排班", () => {
  assert.equal(isScheduleExcludedRole({ role: "兼職後勤" }), true);
  assert.equal(isScheduleExcludedRole({ role: "送貨人員" }), true);
  assert.equal(isScheduleExcludedRole({ role: "兼職人員", employment_type: "兼職", work_category: "送貨" }), true);
  assert.equal(isScheduleExcludedRole({ role: "兼職人員" }), false);
});

test("單日支援會從原店移出並計入支援店", () => {
  const person = {
    id: "staff-1",
    employeeName: "支援人員",
    role: "兼職人員",
    store_code: "S01",
    weekday_start_time: "10:00",
    weekday_end_time: "20:00",
  };
  const overrides = [{
    shift_date: "2026-07-29",
    staff_id: "staff-1",
    assigned_store_code: "S09",
    start_time: "15:00",
    end_time: "23:00",
    shift_type: "support",
  }];
  const common = {
    dateValue: "2026-07-29",
    people: [person],
    overrides,
    store: {
      open_time: "10:00",
      close_time: "23:00",
      dinner_report_time: "19:00",
      close_report_time: "23:00",
    },
  };
  const home = calculateDailyStaffing({ ...common, storeCodes: ["S01", "S06"], demand: 1 });
  const support = calculateDailyStaffing({ ...common, storeCodes: ["S09"], demand: 1 });
  assert.equal(home.workingPeopleCount, 0);
  assert.equal(support.workingPeopleCount, 1);
});
