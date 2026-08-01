import { normalizeTime24, validateTimeWindow } from "../../scheduling/domain/staffingRules.js";

export const PART_TIME_ROLE = "兼職人員";
export const STAFF_ROLE_OPTIONS = ["店長", "副店長", "資深人員", "正式人員", "新進人員", PART_TIME_ROLE, "兼職後勤", "送貨人員"];

export function normalizeStoreStaffRow(row, index = 0) {
  const weekdayStart = row.weekday_start_time || row.weekdayStartTime || row.work_start_time || row.workStartTime || "";
  const weekdayEnd = row.weekday_end_time || row.weekdayEndTime || row.work_end_time || row.workEndTime || "";
  return {
    ...row,
    id: row.id || `staff-${index + 1}`,
    storeName: row.store_name || row.storeName || "",
    store_code: row.store_code || row.storeCode || "",
    employeeName: row.employee_name || row.employeeName || "",
    role: row.role_name || row.role || "",
    work_start_time: row.work_start_time || row.workStartTime || "",
    work_end_time: row.work_end_time || row.workEndTime || "",
    workStartTime: row.work_start_time || row.workStartTime || "",
    workEndTime: row.work_end_time || row.workEndTime || "",
    weekday_start_time: weekdayStart,
    weekday_end_time: weekdayEnd,
    holiday_start_time: row.holiday_start_time || row.holidayStartTime || weekdayStart,
    holiday_end_time: row.holiday_end_time || row.holidayEndTime || weekdayEnd,
    sort_order: Number(row.sort_order || index + 1),
    is_active: row.is_active !== false,
  };
}

export function createStaffForm({ storeCode = "", storeName = "", roleName = "" } = {}) {
  return {
    id: "", store_code: storeCode, store_name: storeName, employee_name: "", role_name: roleName,
    work_start_time: "", work_end_time: "", weekday_start_time: "", weekday_end_time: "",
    holiday_start_time: "", holiday_end_time: "", sort_order: 999, is_active: true,
  };
}

export function staffMemberToForm(row, { storeCode = "", storeName = "" } = {}) {
  const normalized = normalizeStoreStaffRow(row);
  return {
    id: normalized.id,
    store_code: storeCode || normalized.store_code,
    store_name: storeName || normalized.storeName,
    employee_name: normalized.employeeName,
    role_name: normalized.role,
    work_start_time: normalized.work_start_time,
    work_end_time: normalized.work_end_time,
    weekday_start_time: normalized.weekday_start_time,
    weekday_end_time: normalized.weekday_end_time,
    holiday_start_time: normalized.holiday_start_time,
    holiday_end_time: normalized.holiday_end_time,
    sort_order: normalized.sort_order || 999,
    is_active: normalized.is_active,
  };
}

export function buildStaffProfile(payload, { storeName = "" } = {}) {
  const roleName = String(payload.role_name || payload.role || "").trim();
  const employeeName = String(payload.employee_name || payload.employeeName || "").trim();
  const storeCode = String(payload.store_code || payload.storeCode || "").trim();
  const resolvedStoreName = String(storeName || payload.store_name || payload.storeName || "").trim();
  if (!employeeName) return { valid: false, message: "請輸入人員姓名" };
  if (!roleName) return { valid: false, message: "請選擇職稱" };
  if (!storeCode && !resolvedStoreName) return { valid: false, message: "請選擇門店" };

  const weekdayWindow = validateTimeWindow(payload.weekday_start_time, payload.weekday_end_time);
  const holidayWindow = validateTimeWindow(payload.holiday_start_time, payload.holiday_end_time);
  if (roleName === PART_TIME_ROLE && !weekdayWindow.valid) return { valid: false, message: `平日${weekdayWindow.message}` };
  if (roleName === PART_TIME_ROLE && !holidayWindow.valid) return { valid: false, message: `假日${holidayWindow.message}` };

  const weekdayStart = roleName === PART_TIME_ROLE ? normalizeTime24(weekdayWindow.start) : "";
  const weekdayEnd = roleName === PART_TIME_ROLE ? normalizeTime24(weekdayWindow.end) : "";
  const holidayStart = roleName === PART_TIME_ROLE ? normalizeTime24(holidayWindow.start) : "";
  const holidayEnd = roleName === PART_TIME_ROLE ? normalizeTime24(holidayWindow.end) : "";
  return {
    valid: true,
    payload: {
      ...payload,
      id: payload.id || globalThis.crypto?.randomUUID?.() || String(Date.now()),
      store_code: storeCode,
      store_name: resolvedStoreName,
      employee_name: employeeName,
      role_name: roleName,
      work_start_time: weekdayStart,
      work_end_time: weekdayEnd,
      weekday_start_time: weekdayStart,
      weekday_end_time: weekdayEnd,
      holiday_start_time: holidayStart,
      holiday_end_time: holidayEnd,
      sort_order: Number(payload.sort_order || 999),
      is_active: payload.is_active !== false,
    },
  };
}
