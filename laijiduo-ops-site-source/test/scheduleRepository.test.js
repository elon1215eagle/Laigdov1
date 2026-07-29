import assert from "node:assert/strict";
import test from "node:test";

import {
  createScheduleRepository,
  normalizeLeaveDays,
} from "../src/modules/scheduling/index.js";

test("休假日期會去重、排序並排除無效日期", () => {
  assert.deepEqual(normalizeLeaveDays([3, 1, 3, 0, 32, "2"]), [1, 2, 3]);
});

test("本機模式儲存月排假仍套用正式資料清理規則", async () => {
  const repository = createScheduleRepository(null);
  const saved = await repository.upsertMonthlyLeavePlan({
    period_month: "2026-07",
    staff_id: "staff-1",
    leave_days: [7, 2, 7],
    manual_leave_days: [7],
    auto_leave_days: [2],
  });

  assert.deepEqual(saved.leave_days, [2, 7]);
  assert.equal(saved.leave_type, "排休");
  assert.equal(saved.updated_by, null);
});

test("本機模式班次會正規化24小時制與跨店支援類型", async () => {
  const repository = createScheduleRepository(null);
  const saved = await repository.upsertDailyStaffShift({
    shift_date: "2026-07-29",
    staff_id: "staff-1",
    employee_name: "測試人員",
    home_store_code: "S01",
    assigned_store_code: "S09",
    start_time: "9:00",
    end_time: "18:30",
    shift_type: "support",
  });

  assert.equal(saved.start_time, "09:00");
  assert.equal(saved.end_time, "18:30");
  assert.equal(saved.assigned_store_code, "S09");
  assert.equal(saved.shift_type, "support");
});

test("資料層會阻擋不完整或反向班次", async () => {
  const repository = createScheduleRepository(null);

  await assert.rejects(
    repository.upsertDailyStaffShift({
      shift_date: "2026-07-29",
      staff_id: "staff-1",
      start_time: "18:00",
      end_time: "10:00",
    }),
    /有效的上班與下班時間/,
  );
});
