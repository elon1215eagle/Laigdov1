import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyShiftCommand,
  buildScheduleChangeRequest,
  deriveScheduleAccess,
  findOverlappingShift,
  mergeDailyShift,
  scheduleLockStatusText,
} from "../src/modules/scheduling/index.js";

test("總部未確認時門店可修改排班", () => {
  const access = deriveScheduleAccess({
    isStoreScoped: true,
    requestStoreCode: "S01-S06",
    scheduleControl: { lock: { is_confirmed: false }, requests: [] },
  });
  assert.equal(access.canEdit, true);
});

test("總部確認後門店鎖定，核可申請後才可修改", () => {
  const locked = deriveScheduleAccess({
    isStoreScoped: true,
    requestStoreCode: "S01-S06",
    scheduleControl: { lock: { is_confirmed: true }, requests: [] },
  });
  const approved = deriveScheduleAccess({
    isStoreScoped: true,
    requestStoreCode: "S01-S06",
    scheduleControl: {
      lock: { is_confirmed: true },
      requests: [{ store_code: "S01-S06", status: "approved" }],
    },
  });
  assert.equal(locked.canEdit, false);
  assert.equal(approved.canEdit, true);
});

test("總部帳號不受門店鎖定限制", () => {
  const access = deriveScheduleAccess({
    isStoreScoped: false,
    requestStoreCode: "",
    scheduleControl: { lock: { is_confirmed: true }, requests: [] },
  });
  assert.equal(access.canEdit, true);
});

test("跨店班次命令正規化時間並標示支援", () => {
  const command = buildDailyShiftCommand({
    form: {
      shift_date: "2026-07-29",
      staff_id: "staff-1",
      assigned_store_code: "S09",
      start_time: "9:00",
      end_time: "18:30",
    },
    person: { employeeName: "測試人員" },
    homeStoreCode: "S01",
  });
  assert.equal(command.valid, true);
  assert.equal(command.payload.start_time, "09:00");
  assert.equal(command.payload.shift_type, "support");
});

test("同人同日不同班次可同時保留", () => {
  const merged = mergeDailyShift(
    [{ id: "old", shift_date: "2026-07-29", staff_id: "staff-1" }],
    { id: "new", shift_date: "2026-07-29", staff_id: "staff-1" },
  );
  assert.deepEqual(merged.map((row) => row.id), ["old", "new"]);
});

test("編輯同一班次時只取代相同 id", () => {
  const merged = mergeDailyShift(
    [{ id: "same", shift_date: "2026-07-29", staff_id: "staff-1", note: "舊" }],
    { id: "same", shift_date: "2026-07-29", staff_id: "staff-1", note: "新" },
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].note, "新");
});

test("同人同日相鄰班次可建立，重疊班次會被辨識", () => {
  const existing = [{
    id: "morning", shift_date: "2026-07-29", staff_id: "staff-1", start_time: "10:00", end_time: "14:00",
  }];
  assert.equal(findOverlappingShift({
    id: "afternoon", shift_date: "2026-07-29", staff_id: "staff-1", start_time: "14:00", end_time: "20:00",
  }, existing), null);
  assert.equal(findOverlappingShift({
    id: "overlap", shift_date: "2026-07-29", staff_id: "staff-1", start_time: "13:30", end_time: "20:00",
  }, existing)?.id, "morning");
});

test("修改申請需有原因並產生標準命令", () => {
  const empty = buildScheduleChangeRequest({
    periodMonth: "2026-07",
    reason: "  ",
    storeCode: "S01-S06",
    storeName: "鳳山五甲店 + 鳳山南華店",
  });
  const valid = buildScheduleChangeRequest({
    periodMonth: "2026-07",
    reason: " 調整兼職支援時段 ",
    storeCode: "S01-S06",
    storeName: "鳳山五甲店 + 鳳山南華店",
  });
  assert.equal(empty.valid, false);
  assert.equal(valid.payload.reason, "調整兼職支援時段");
});

test("排班確認狀態文字依環境與鎖定狀態產生", () => {
  assert.equal(scheduleLockStatusText({
    hasRemoteConfig: false,
    isConfirmed: false,
    missingTable: false,
  }), "本機模式未啟用總部確認");
  assert.equal(scheduleLockStatusText({
    hasRemoteConfig: true,
    isConfirmed: true,
    missingTable: false,
  }), "總部已確認，門店不可修改");
});
