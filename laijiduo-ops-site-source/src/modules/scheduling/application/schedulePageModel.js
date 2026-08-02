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
  const storeEditApproved = ownRequest?.status === "approved"
    && !ownRequest.used_at
    && (!ownRequest.approved_until || new Date(ownRequest.approved_until).getTime() > Date.now());

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
  if (!person) return { valid: false, message: "請選擇排班人員" };
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
    ...current.filter((row) => String(row.id) !== String(saved.id)),
    saved,
  ];
}

export function removeDailyShiftById(current, shiftId) {
  return current.filter((row) => row.id !== shiftId);
}

export function buildScheduleChangeRequest({
  periodMonth,
  reason,
  scopeType,
  storeCode,
  storeName,
  targetDate = null,
  targetStaffId = null,
  targetShiftId = null,
}) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) return { valid: false, message: "請先填寫修改原因" };
  if (scopeType === "date" && !targetDate) return { valid: false, message: "請選擇要修改的日期" };
  if (scopeType === "staff" && !targetStaffId) return { valid: false, message: "請選擇要修改的人員" };
  if (scopeType === "shift" && !targetShiftId) return { valid: false, message: "請選擇要修改的班次" };
  if (!["date", "staff", "shift"].includes(scopeType)) return { valid: false, message: "請選擇修改範圍" };
  return {
    valid: true,
    payload: {
      period_month: periodMonth,
      store_code: storeCode,
      store_name: storeName || "",
      reason: cleanReason,
      scope_type: scopeType,
      target_date: scopeType === "date" ? targetDate : null,
      target_staff_id: scopeType === "staff" ? targetStaffId : null,
      target_shift_id: scopeType === "shift" ? targetShiftId : null,
    },
  };
}

export function scheduleApprovalAllows(request, { date = null, staffId = null, shiftId = null } = {}) {
  if (!request || request.status !== "approved" || request.used_at) return false;
  if (request.approved_until && new Date(request.approved_until).getTime() <= Date.now()) return false;
  if (request.scope_type === "date") return request.target_date === date;
  if (request.scope_type === "staff") return String(request.target_staff_id) === String(staffId);
  if (request.scope_type === "shift") return String(request.target_shift_id) === String(shiftId);
  return false;
}
