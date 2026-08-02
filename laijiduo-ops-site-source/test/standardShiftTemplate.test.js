import assert from "node:assert/strict";
import test from "node:test";

import { createScheduleRepository } from "../src/modules/scheduling/index.js";

test("標準班次模板正規化時間並限制十五分鐘刻度", async () => {
  const repository = createScheduleRepository(null);
  const saved = await repository.upsertStandardShiftTemplate({
    name: "早班",
    start_time: "9:00",
    end_time: "16:15",
  });

  assert.equal(saved.start_time, "09:00");
  assert.equal(saved.end_time, "16:15");

  await assert.rejects(
    repository.upsertStandardShiftTemplate({
      name: "錯誤班次",
      start_time: "10:10",
      end_time: "16:00",
    }),
    /15 分鐘/,
  );
});

test("單日自訂班次同樣限制十五分鐘刻度", async () => {
  const repository = createScheduleRepository(null);
  await assert.rejects(
    repository.upsertDailyStaffShift({
      shift_date: "2026-08-03",
      staff_id: "staff-1",
      start_time: "10:10",
      end_time: "16:00",
    }),
    /15 分鐘/,
  );
});
