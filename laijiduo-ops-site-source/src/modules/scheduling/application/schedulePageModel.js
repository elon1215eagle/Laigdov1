import { validateTimeWindow } from "../domain/staffingRules.js";

export function deriveScheduleAccess({
  isStoreScoped,
  scheduleControl,
  requestStoreCode,
}) {
  const isConfirmed = Boolean(scheduleControl?.lock?.is_confirmed);
  const ownRequest = isStoreScoped
    ? (scheduleControl?.requests || []).find((request) => request.store_code === requestStoreCode) || null
    : null;
  const storeEditApproved = ownRequest?.status === "approved";

  return {
    isConfirmed,
    ownRequest,
    storeEditApproved,
    canEdit: !isStoreScoped || !isConfirmed || storeEditApproved,
  };
}

export function scheduleLockStatusText({
  hasRemoteConfig,
  isConfirmed,
  missingTable,
}) {
  if (!hasRemoteConfig) return "本機模式未啟用總部確認";
  if (missingTable) return "尚未建立排班確認資料表";
  return isConfirmed ? "總部已確認，門店不可修改" : "尚未確認，門店可修改";
}

export function buildDailyShiftCommand({
  form,
  person,
  homeStoreCode,
}) {
  if (!person) return { valid: false, message: "請選擇兼職人員" };
  const validation = validateTimeWindow(form.start_time, form.end_time);
  if (!validation.valid || !validation.start || !validation.end) {
    return {
      valid: false,
      message: validation.message || "請輸入當日上班與下班時間",
    };
  }

  const assignedStoreCode = form.assigned_store_code || homeStoreCode;
  return {
    valid: true,
    payload: {
      ...form,
      employee_name: person.employeeName,
      home_store_code: homeStoreCode,
      assigned_store_code: assignedStoreCode,
      start_time: validation.start,
      end_time: validation.end,
      shift_type: assignedStoreCode === homeStoreCode ? "override" : "support",
    },
  };
}

export function mergeDailyShift(current, saved) {
  return [
    ...current.filter((row) => !(
      row.shift_date === saved.shift_date
      && String(row.staff_id) === String(saved.staff_id)
    )),
    saved,
  ];
}

export function removeDailyShiftById(current, shiftId) {
  return current.filter((row) => row.id !== shiftId);
}

export function buildScheduleChangeRequest({
  periodMonth,
  reason,
  storeCode,
  storeName,
}) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) return { valid: false, message: "請先填寫修改原因" };
  return {
    valid: true,
    payload: {
      period_month: periodMonth,
      store_code: storeCode,
      store_name: storeName || "",
      reason: cleanReason,
    },
  };
}
