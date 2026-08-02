import { normalizeTime24, validateTimeWindow } from "../../scheduling/domain/staffingRules.js";

export const PART_TIME_ROLE = "兼職人員";
export const EMPLOYMENT_TYPE_OPTIONS = ["正職", "兼職"];
export const STAFF_ROLE_OPTIONS = ["店長", "副店長", "資深人員", "正職人員", PART_TIME_ROLE, "總部人員"];
export const WORK_CATEGORY_OPTIONS = ["門店營運", "後勤", "送貨", "總部"];
export const EMPLOYMENT_STATUS_OPTIONS = ["待到職", "在職", "留職停薪", "已離職", "停用"];

const LEGACY_TITLE_MAP = {
  正式人員: "正職人員",
  新進人員: "正職人員",
  兼職後勤: PART_TIME_ROLE,
  送貨人員: "正職人員",
};

export function inferStaffClassification(row = {}) {
  const legacyRole = String(row.role_name || row.role || "").trim();
  const roleName = String(row.staff_title || row.staffTitle || LEGACY_TITLE_MAP[legacyRole] || legacyRole || "正職人員").trim();
  const employmentType = String(row.employment_type || row.employmentType || ([PART_TIME_ROLE, "兼職後勤"].includes(legacyRole) ? "兼職" : "正職")).trim();
  const workCategory = String(row.work_category || row.workCategory || (
    legacyRole === "兼職後勤" ? "後勤" : legacyRole === "送貨人員" ? "送貨" : legacyRole === "總部人員" ? "總部" : "門店營運"
  )).trim();
  const employmentStatus = String(row.employment_status || row.employmentStatus || (row.is_active === false ? "停用" : "在職")).trim();
  return { roleName, employmentType, workCategory, employmentStatus };
}

export function normalizeStoreStaffRow(row, index = 0) {
  const weekdayStart = row.weekday_start_time || row.weekdayStartTime || row.work_start_time || row.workStartTime || "";
  const weekdayEnd = row.weekday_end_time || row.weekdayEndTime || row.work_end_time || row.workEndTime || "";
  const classification = inferStaffClassification(row);
  return {
    ...row,
    id: row.id || `staff-${index + 1}`,
    storeName: row.store_name || row.storeName || "",
    store_code: row.store_code || row.storeCode || "",
    employeeName: row.employee_name || row.employeeName || "",
    role: classification.roleName,
    role_name: classification.roleName,
    employment_type: classification.employmentType,
    employmentType: classification.employmentType,
    work_category: classification.workCategory,
    workCategory: classification.workCategory,
    employment_status: classification.employmentStatus,
    employmentStatus: classification.employmentStatus,
    auth_user_id: row.auth_user_id || row.authUserId || null,
    work_start_time: row.work_start_time || row.workStartTime || "",
    work_end_time: row.work_end_time || row.workEndTime || "",
    workStartTime: row.work_start_time || row.workStartTime || "",
    workEndTime: row.work_end_time || row.workEndTime || "",
    weekday_start_time: weekdayStart,
    weekday_end_time: weekdayEnd,
    holiday_start_time: row.holiday_start_time || row.holidayStartTime || weekdayStart,
    holiday_end_time: row.holiday_end_time || row.holidayEndTime || weekdayEnd,
    estimated_hourly_cost: row.estimated_hourly_cost ?? row.estimatedHourlyCost ?? "",
    estimated_monthly_cost: row.estimated_monthly_cost ?? row.estimatedMonthlyCost ?? "",
    sort_order: Number(row.sort_order || index + 1),
    is_active: row.is_active !== false,
  };
}

export function createStaffForm({ storeCode = "", storeName = "", roleName = "正職人員" } = {}) {
  return {
    id: "", store_code: storeCode, store_name: storeName, employee_name: "", role_name: roleName,
    employment_type: roleName === PART_TIME_ROLE ? "兼職" : "正職",
    work_category: roleName === "總部人員" ? "總部" : "門店營運",
    employment_status: "在職", auth_user_id: null,
    work_start_time: "", work_end_time: "", weekday_start_time: "", weekday_end_time: "",
    holiday_start_time: "", holiday_end_time: "", estimated_hourly_cost: "", estimated_monthly_cost: "",
    sort_order: 999, is_active: true,
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
    employment_type: normalized.employment_type,
    work_category: normalized.work_category,
    employment_status: normalized.employment_status,
    auth_user_id: normalized.auth_user_id,
    work_start_time: normalized.work_start_time,
    work_end_time: normalized.work_end_time,
    weekday_start_time: normalized.weekday_start_time,
    weekday_end_time: normalized.weekday_end_time,
    holiday_start_time: normalized.holiday_start_time,
    holiday_end_time: normalized.holiday_end_time,
    estimated_hourly_cost: normalized.estimated_hourly_cost,
    estimated_monthly_cost: normalized.estimated_monthly_cost,
    sort_order: normalized.sort_order || 999,
    is_active: normalized.is_active,
  };
}

export function buildStaffProfile(payload, { storeName = "" } = {}) {
  const classification = inferStaffClassification(payload);
  const roleName = classification.roleName;
  const employeeName = String(payload.employee_name || payload.employeeName || "").trim();
  const storeCode = String(payload.store_code || payload.storeCode || "").trim();
  const resolvedStoreName = String(storeName || payload.store_name || payload.storeName || "").trim();
  if (!employeeName) return { valid: false, message: "請輸入人員姓名" };
  if (!STAFF_ROLE_OPTIONS.includes(roleName)) return { valid: false, message: "請選擇有效職稱" };
  if (!EMPLOYMENT_TYPE_OPTIONS.includes(classification.employmentType)) return { valid: false, message: "請選擇有效僱用型態" };
  if (!WORK_CATEGORY_OPTIONS.includes(classification.workCategory)) return { valid: false, message: "請選擇有效工作類別" };
  if (!EMPLOYMENT_STATUS_OPTIONS.includes(classification.employmentStatus)) return { valid: false, message: "請選擇有效人員狀態" };
  if (!storeCode && !resolvedStoreName) return { valid: false, message: "請選擇門店" };

  const weekdayWindow = validateTimeWindow(payload.weekday_start_time, payload.weekday_end_time);
  const holidayWindow = validateTimeWindow(payload.holiday_start_time, payload.holiday_end_time);
  const isPartTime = classification.employmentType === "兼職";
  if (!weekdayWindow.valid) return { valid: false, message: `${isPartTime ? "平日" : "預設工時"}${weekdayWindow.message}` };
  if (isPartTime && !holidayWindow.valid) return { valid: false, message: `假日${holidayWindow.message}` };

  const weekdayStart = normalizeTime24(weekdayWindow.start);
  const weekdayEnd = normalizeTime24(weekdayWindow.end);
  const holidayStart = isPartTime ? normalizeTime24(holidayWindow.start) : weekdayStart;
  const holidayEnd = isPartTime ? normalizeTime24(holidayWindow.end) : weekdayEnd;
  return {
    valid: true,
    payload: {
      ...payload,
      id: payload.id || globalThis.crypto?.randomUUID?.() || String(Date.now()),
      store_code: storeCode,
      store_name: resolvedStoreName,
      employee_name: employeeName,
      role_name: roleName,
      employment_type: classification.employmentType,
      work_category: classification.workCategory,
      employment_status: classification.employmentStatus,
      auth_user_id: payload.auth_user_id || payload.authUserId || null,
      work_start_time: weekdayStart,
      work_end_time: weekdayEnd,
      weekday_start_time: weekdayStart,
      weekday_end_time: weekdayEnd,
      holiday_start_time: holidayStart,
      holiday_end_time: holidayEnd,
      estimated_hourly_cost: payload.estimated_hourly_cost === "" ? null : Number(payload.estimated_hourly_cost),
      estimated_monthly_cost: payload.estimated_monthly_cost === "" ? null : Number(payload.estimated_monthly_cost),
      sort_order: Number(payload.sort_order || 999),
      is_active: payload.is_active !== false,
    },
  };
}
