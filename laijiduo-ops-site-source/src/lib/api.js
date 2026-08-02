import { handoverSeed, hqTaskSeed, performanceSeed, productsSeed, staffRosterSeed, storesSeed } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";
import { totalRevenue as calculateTotalRevenue } from "../modules/daily-report";
import {
  buildStaffProfile,
  createStaffPositionRepository,
  createStaffStoreAssignmentRepository,
  normalizeStoreStaffRow as normalizeStoreStaffProfileRow,
} from "../modules/hr";
import {
  deleteDailyReport as deleteDailyReportFromRepository,
  deleteDailyReports as deleteDailyReportsFromRepository,
  fetchDailyReports as fetchDailyReportsFromRepository,
  fetchDailyReportsRange as fetchDailyReportsRangeFromRepository,
  fetchHqDashboardData as fetchHqDashboardDataFromService,
  fetchInventoryCounts as fetchInventoryCountsFromRepository,
  fetchInventoryCountsForReports as fetchInventoryCountsForReportsFromRepository,
  fetchDailyReportWasteItems as fetchDailyReportWasteItemsFromRepository,
  fetchDailyReportEmployeeMeals as fetchDailyReportEmployeeMealsFromRepository,
  fetchPreviousInventoryCounts as fetchPreviousInventoryCountsFromRepository,
  saveDailyOperations as saveDailyOperationsFromService,
  upsertDailyReport as upsertDailyReportFromRepository,
  upsertInventoryCounts as upsertInventoryCountsFromRepository,
} from "../modules/daily-report/supabase.js";

export {
  confirmMonthlySchedule,
  deleteDailyStaffShift,
  fetchDailyStaffShifts,
  fetchMonthlyLeavePlans,
  fetchMonthlyScheduleControl,
  fetchTemporarySupportSummary,
  reviewMonthlyScheduleChangeRequest,
  reviewSupportShiftRequest,
  setWorkforceRolloutMode,
  submitMonthlyScheduleChangeRequest,
  submitSupportShiftRequest,
  unlockMonthlySchedule,
  upsertDailyStaffShift,
  upsertMonthlyLeavePlan,
  upsertMonthlyLeavePlans,
  fetchStandardShiftTemplates,
  upsertStandardShiftTemplate,
  archiveStandardShiftTemplate,
  fetchLeavePlanAudit,
  fetchStaffingDemandChangeRequests,
  submitStaffingDemandChangeRequest,
  reviewStaffingDemandChangeRequest,
} from "../modules/scheduling/supabase.js";

const STORE_FIELDS = "id, store_code, name, area, manager_name, target_daily_revenue, target_monthly_revenue, operating_status, is_active";
const COMPATIBLE_STORE_FIELDS = "id, store_code, name, area, manager_name, target_daily_revenue, target_monthly_revenue, is_active";
const LEGACY_STORE_FIELDS = "id, store_code, name, area, manager_name, target_daily_revenue, is_active";
const PRODUCT_FIELDS = "id, name, unit, sort_order, is_active";
const INSPECTION_FIELDS = [
  "id",
  "store_id",
  "inspection_date",
  "supervisor_name",
  "manager_name",
  "score",
  "status",
  "summary",
  "form_data",
  "manager_signature",
  "source_type",
  "created_at",
  "stores(name, area, store_code, manager_name)",
].join(", ");
const INSPECTION_ISSUE_FIELDS = "id, inspection_id, category, title, description, suggestion, severity, due_date, status, created_at";
const HANDOVER_FIELDS = [
  "id",
  "store_id",
  "handover_date",
  "shift_type",
  "cash_status",
  "inventory_status",
  "equipment_status",
  "cleaning_status",
  "customer_issue",
  "pending_tasks",
  "manager_name",
  "status",
  "created_at",
  "stores(name, area, store_code, manager_name)",
].join(", ");
const STAFF_PERFORMANCE_FIELDS = [
  "id",
  "store_id",
  "period_month",
  "employee_name",
  "role_name",
  "late_count",
  "leave_count",
  "absence_count",
  "service_delay_count",
  "score",
  "grade",
  "bonus_adjustment",
  "status",
  "note",
  "created_at",
  "stores(name, area, store_code)",
].join(", ");
const STORE_STAFF_FIELDS = [
  "id",
  "store_code",
  "store_name",
  "employee_name",
  "role_name",
  "employment_type",
  "work_category",
  "employment_status",
  "auth_user_id",
  "work_start_time",
  "work_end_time",
  "weekday_start_time",
  "weekday_end_time",
  "holiday_start_time",
  "holiday_end_time",
  "estimated_hourly_cost",
  "estimated_monthly_cost",
  "sort_order",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");
const COMPATIBLE_STORE_STAFF_FIELDS = [
  "id",
  "store_code",
  "store_name",
  "employee_name",
  "role_name",
  "work_start_time",
  "work_end_time",
  "weekday_start_time",
  "weekday_end_time",
  "holiday_start_time",
  "holiday_end_time",
  "sort_order",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");
const WORK_TIME_COMPATIBLE_STORE_STAFF_FIELDS = [
  "id",
  "store_code",
  "store_name",
  "employee_name",
  "role_name",
  "work_start_time",
  "work_end_time",
  "sort_order",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");
const LEGACY_STORE_STAFF_FIELDS = [
  "id",
  "store_code",
  "store_name",
  "employee_name",
  "role_name",
  "sort_order",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");
const HQ_TASK_FIELDS = [
  "id",
  "title",
  "task_type",
  "scope_type",
  "store_id",
  "assignee_name",
  "assignee_role",
  "priority",
  "status",
  "due_date",
  "evidence",
  "action",
  "note",
  "created_by",
  "updated_by",
  "completed_at",
  "created_at",
  "updated_at",
  "stores(name, area, store_code, manager_name)",
].join(", ");
const SECURITY_SETTINGS_FIELDS = [
  "id",
  "is_fault_mode",
  "fault_title",
  "fault_message",
  "updated_by",
  "created_at",
  "updated_at",
].join(", ");

export const defaultSecuritySettings = {
  id: "main",
  is_fault_mode: false,
  fault_title: "資料故障",
  fault_message: "請洽系統管理員",
};


export function totalRevenue(report) {
  return calculateTotalRevenue(report);
}

export function statusLabel(status) {
  return {
    draft: "草稿",
    submitted: "待審核",
    needs_revision: "退回修改",
    approved: "總部已確認",
    follow_up: "需追蹤",
  }[status] || status;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error("尚未設定 Supabase 環境變數");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSessionProfile() {
  if (!supabase) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}

function productDefaults(product) {
  return {
    ...product,
    current_stock: 0,
    safety_stock: 0,
    loss_count: 0,
    incoming_count: 0,
    stock_unit: product.unit || "件",
    incoming_unit: product.unit || "件",
    current_stock_boxes: 0,
    current_stock_packs: 0,
    incoming_boxes: 0,
    incoming_packs: 0,
    incoming_source: "廠商進貨",
    transfer_note: "",
  };
}

export async function fetchProducts() {
  if (!supabase) return productsSeed.map(productDefaults);
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data.map(productDefaults);
}

export async function fetchStores() {
  if (!supabase) return storesSeed;
  const result = await supabase
    .from("stores")
    .select(STORE_FIELDS)
    .order("store_code");
  if (!result.error) return result.data;

  const compatibleResult = await supabase
    .from("stores")
    .select(COMPATIBLE_STORE_FIELDS)
    .order("store_code");
  if (!compatibleResult.error) return compatibleResult.data;

  const legacyResult = await supabase
    .from("stores")
    .select(LEGACY_STORE_FIELDS)
    .order("store_code");
  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data;
}

export const fetchDailyReportWasteItems = (...args) => fetchDailyReportWasteItemsFromRepository(...args);
export const fetchDailyReportEmployeeMeals = (...args) => fetchDailyReportEmployeeMealsFromRepository(...args);

export async function fetchDailyReportChangeRequests(reportIds = []) {
  const ids = reportIds.filter(Boolean);
  if (!supabase || !ids.length) return [];
  const { data, error } = await supabase
    .from("daily_report_change_requests")
    .select("*")
    .in("report_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function submitDailyReportChangeRequest(payload) {
  if (!supabase) return { id: `local-${Date.now()}`, ...payload };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const { data, error } = await supabase
    .from("daily_report_change_requests")
    .insert({ ...payload, requested_by: userData.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reviewDailyReportChangeRequest(requestId, decision, reviewNote = "") {
  if (!supabase) {
    return { id: requestId, status: decision, review_note: reviewNote };
  }
  const { data, error } = await supabase.rpc("review_daily_report_change_request", {
    request_id: requestId,
    decision,
    decision_note: reviewNote,
  });
  if (error) throw error;
  return data;
}

export async function fetchStoreRelationGroups() {
  if (!supabase) return [];
  const [{ data, error }, managementResult] = await Promise.all([
    supabase
    .from("store_relation_groups")
    .select(`
      id,
      group_code,
      group_name,
      coordinating_store_code,
      demand,
      rule_note,
      schedule_shared,
      staffing_shared,
      temporary_support_shared,
      is_active,
      store_relation_group_members(store_code)
    `)
    .eq("is_active", true)
    .order("group_code"),
    supabase
      .from("store_management_relations")
      .select("managing_store_code, managed_store_code, relationship_type, effective_from, effective_to, is_active")
      .eq("is_active", true),
  ]);
  if (error) {
    if (isMissingSupabaseTable(error)) return [];
    throw error;
  }
  const managementRows = managementResult.error && isMissingSupabaseTable(managementResult.error)
    ? []
    : managementResult.data || [];
  if (managementResult.error && !isMissingSupabaseTable(managementResult.error)) throw managementResult.error;
  const today = new Date().toISOString().slice(0, 10);
  return (data || []).map((row) => ({
    code: row.group_code,
    name: row.group_name,
    coordinatingStoreCode: row.coordinating_store_code,
    demand: Number(row.demand || 0),
    ruleNote: row.rule_note || "",
    sourceCodes: (row.store_relation_group_members || [])
      .map((member) => member.store_code)
      .filter(Boolean)
      .sort(),
    managedStoreCodes: managementRows
      .filter((relation) => relation.managing_store_code === row.coordinating_store_code)
      .filter((relation) => relation.relationship_type === "schedule_management")
      .filter((relation) => relation.effective_from <= today && (!relation.effective_to || relation.effective_to >= today))
      .map((relation) => relation.managed_store_code)
      .sort(),
    capabilities: [
      row.schedule_shared ? "schedule" : "",
      row.staffing_shared ? "staffing" : "",
      row.temporary_support_shared ? "temporary_support" : "",
    ].filter(Boolean),
  }));
}

export async function fetchDailyReports(reportDate) {
  return fetchDailyReportsFromRepository(reportDate);
}

export async function fetchDailyReportsRange(dateFrom, dateTo) {
  return fetchDailyReportsRangeFromRepository(dateFrom, dateTo);
}

export async function fetchInventoryCounts(reportId) {
  return fetchInventoryCountsFromRepository(reportId);
}

export async function fetchPreviousInventoryCounts(storeId, reportDate) {
  return fetchPreviousInventoryCountsFromRepository(storeId, reportDate);
}

export async function fetchInventoryCountsForReports(reportIds) {
  return fetchInventoryCountsForReportsFromRepository(reportIds);
}

export async function fetchHqDashboardData(dateFrom, dateTo) {
  return fetchHqDashboardDataFromService(dateFrom, dateTo);
}

export async function upsertDailyReport(payload) {
  return upsertDailyReportFromRepository(payload);
}

export async function deleteDailyReport(reportId) {
  return deleteDailyReportFromRepository(reportId);
}

export async function deleteDailyReports(reportIds) {
  return deleteDailyReportsFromRepository(reportIds);
}

export async function upsertInventoryCounts(reportId, rows) {
  return upsertInventoryCountsFromRepository(reportId, rows);
}

export async function saveDailyOperations(reportPayload, inventoryRows, wasteRows, employeeMealRows) {
  return saveDailyOperationsFromService(
    reportPayload,
    inventoryRows,
    wasteRows,
    employeeMealRows,
  );
}

export async function updateStoreMonthlyTarget(storeId, monthlyTarget, dailyTarget) {
  if (!supabase) return { storeId, monthlyTarget, dailyTarget };
  const { data, error } = await supabase
    .from("stores")
    .update({
      target_monthly_revenue: Number(monthlyTarget || 0),
      target_daily_revenue: Math.round(Number(dailyTarget || 0)),
    })
    .eq("id", storeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reviewReport(reportId, action, note, status) {
  if (!supabase) return { reportId, action, note, status };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;

  const { error: reportError } = await supabase
    .from("daily_reports")
    .update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);
  if (reportError) throw reportError;

  const { data, error } = await supabase
    .from("review_actions")
    .insert({ report_id: reportId, action, note, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function normalizeInspectionRow(row, issueRows = []) {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.stores?.name || "未命名門店",
    date: row.inspection_date,
    supervisor: row.supervisor_name || "",
    manager: row.manager_name || row.stores?.manager_name || "",
    score: Number(row.score || 0),
    maxScore: row.form_data ? undefined : 100,
    status: row.status || "已建檔",
    imageNames: [],
    images: [],
    summary: row.summary || "",
    formData: row.form_data || null,
    managerSignature: row.manager_signature || "",
    sourceType: row.source_type || "online",
    issues: issueRows.map((issue) => ({
      id: issue.id,
      category: issue.category,
      title: issue.title,
      description: issue.description || "",
      suggestion: issue.suggestion || "",
      severity: issue.severity || "一般",
      dueDate: issue.due_date || "",
      status: issue.status || "待處理",
    })),
  };
}

function normalizeHandoverRow(row) {
  return {
    ...row,
    storeName: row.stores?.name || row.storeName || "未命名門店",
    area: row.stores?.area || "",
    store_code: row.stores?.store_code || "",
    manager_name: row.manager_name || row.stores?.manager_name || "",
  };
}

function normalizePerformanceRow(row) {
  return {
    ...row,
    storeName: row.stores?.name || row.storeName || "未命名門店",
    area: row.stores?.area || "",
    store_code: row.stores?.store_code || "",
    action: row.action || performanceAction(row.score, row.bonus_adjustment),
  };
}

function normalizeStoreStaffRow(row, index = 0) {
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
    weekday_start_time: row.weekday_start_time || row.weekdayStartTime || row.work_start_time || row.workStartTime || "",
    weekday_end_time: row.weekday_end_time || row.weekdayEndTime || row.work_end_time || row.workEndTime || "",
    holiday_start_time: row.holiday_start_time || row.holidayStartTime || row.weekday_start_time || row.work_start_time || "",
    holiday_end_time: row.holiday_end_time || row.holidayEndTime || row.weekday_end_time || row.work_end_time || "",
    sort_order: Number(row.sort_order || index + 1),
    is_active: row.is_active !== false,
  };
}

function normalizeTime24(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeHqTaskRow(row) {
  return {
    ...row,
    storeName: row.stores?.name || row.storeName || (row.scope_type === "總部" ? "總部" : "未指定"),
    area: row.stores?.area || "",
    store_code: row.stores?.store_code || "",
    owner: row.assignee_name || row.owner || "",
    task_type: row.task_type || "總部交辦",
    action: row.action || row.title || "",
    evidence: row.evidence || "",
  };
}

function performanceAction(score, bonusAdjustment = 0) {
  if (Number(score || 0) >= 90) return "季獎金正常";
  if (Number(score || 0) < 80) return "需輔導改善";
  return `季獎金調整 ${Number(bonusAdjustment || 0).toLocaleString("zh-TW")}`;
}

function isMissingSupabaseTable(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST205" || message.includes("Could not find the table") || message.includes("schema cache");
}

function isMissingSupabaseColumn(error) {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" || message.includes("Could not find") || message.includes("column");
}

function migrationRequiredError() {
  return new Error("資料表尚未建立，請先套用 Supabase migration_2026_06_15_handover_performance.sql");
}

export async function fetchSecuritySettings() {
  if (!supabase) return defaultSecuritySettings;
  const { data, error } = await supabase
    .from("app_security_settings")
    .select(SECURITY_SETTINGS_FIELDS)
    .eq("id", "main")
    .maybeSingle();
  if (error) {
    if (isMissingSupabaseTable(error)) return defaultSecuritySettings;
    throw error;
  }
  return data || defaultSecuritySettings;
}

export async function upsertSecuritySettings(payload) {
  if (!supabase) return { ...defaultSecuritySettings, ...payload };
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const cleanPayload = {
    id: "main",
    is_fault_mode: Boolean(payload.is_fault_mode),
    fault_title: payload.fault_title?.trim() || defaultSecuritySettings.fault_title,
    fault_message: payload.fault_message?.trim() || defaultSecuritySettings.fault_message,
    updated_by: userData.user?.id || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("app_security_settings")
    .upsert(cleanPayload, { onConflict: "id" })
    .select(SECURITY_SETTINGS_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchHandovers(date = new Date().toISOString().slice(0, 10)) {
  if (!supabase) return handoverSeed;
  const { data, error } = await supabase
    .from("store_handovers")
    .select(HANDOVER_FIELDS)
    .eq("handover_date", date)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSupabaseTable(error)) return [];
    throw error;
  }
  return data.map(normalizeHandoverRow);
}

export async function upsertHandover(payload) {
  if (!supabase) return normalizeHandoverRow({ ...payload, id: payload.id || crypto.randomUUID?.() || Date.now() });
  const { data, error } = await supabase
    .from("store_handovers")
    .upsert(payload, { onConflict: "store_id,handover_date,shift_type" })
    .select(HANDOVER_FIELDS)
    .single();
  if (error) {
    if (isMissingSupabaseTable(error)) throw migrationRequiredError();
    throw error;
  }
  return normalizeHandoverRow(data);
}

export async function fetchStaffPerformance(periodMonth = new Date().toISOString().slice(0, 7)) {
  if (!supabase) return performanceSeed;
  const { data, error } = await supabase
    .from("staff_performance")
    .select(STAFF_PERFORMANCE_FIELDS)
    .eq("period_month", periodMonth)
    .order("score", { ascending: true });
  if (error) {
    if (isMissingSupabaseTable(error)) return [];
    throw error;
  }
  return data.map(normalizePerformanceRow);
}

export async function fetchStoreStaff() {
  if (!supabase) return staffRosterSeed;
  const secureResult = await supabase.rpc("get_store_staff_secure");
  const result = secureResult.error?.code === "PGRST202" || secureResult.error?.code === "42883"
    ? await supabase
    .from("store_staff")
    .select(STORE_STAFF_FIELDS)
    .order("store_code")
    .order("sort_order")
    .order("employee_name")
    : secureResult;
  let data = result.data;
  let error = result.error;
  if (error && isMissingSupabaseColumn(error)) {
    const compatibleResult = await supabase
      .from("store_staff")
      .select(COMPATIBLE_STORE_STAFF_FIELDS)
      .order("store_code")
      .order("sort_order")
      .order("employee_name");
    data = compatibleResult.data;
    error = compatibleResult.error;
  }
  if (error && isMissingSupabaseColumn(error)) {
    const legacyResult = await supabase
      .from("store_staff")
      .select(LEGACY_STORE_STAFF_FIELDS)
      .order("store_code")
      .order("sort_order")
      .order("employee_name");
    data = legacyResult.data;
    error = legacyResult.error;
  }
  if (error) {
    if (isMissingSupabaseTable(error)) return staffRosterSeed;
    throw error;
  }
  const savedRows = (data || []).map(normalizeStoreStaffProfileRow);
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const inactiveIds = new Set(savedRows.filter((row) => row.is_active === false).map((row) => row.id));
  const seedRows = staffRosterSeed
    .filter((row) => !inactiveIds.has(row.id))
    .map((row, index) => savedById.get(row.id) || normalizeStoreStaffProfileRow(row, index));
  const customRows = savedRows.filter((row) => row.is_active !== false && !staffRosterSeed.some((seed) => seed.id === row.id));
  return [...seedRows, ...customRows]
    .filter((row) => row.is_active !== false)
    .sort((a, b) => (
      String(a.store_code || "").localeCompare(String(b.store_code || "")) ||
      Number(a.sort_order || 999) - Number(b.sort_order || 999) ||
      String(a.employeeName || "").localeCompare(String(b.employeeName || ""), "zh-Hant")
    ));
}

export async function hasSalaryAccess() {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc("has_salary_access");
  if (error?.code === "PGRST202" || error?.code === "42883") return false;
  if (error) throw error;
  return Boolean(data);
}

export async function requestCooSalaryAccess(reason) {
  if (!supabase) return new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("request_coo_salary_access", { p_reason: reason });
  if (error) throw error;
  return data;
}

const staffStoreAssignmentRepository = createStaffStoreAssignmentRepository(supabase);
const staffPositionRepository = createStaffPositionRepository(supabase);

export async function fetchStaffStoreAssignments() {
  return staffStoreAssignmentRepository.fetchAll();
}

export async function recordStaffStoreTransfer(payload) {
  return staffStoreAssignmentRepository.recordTransfer(payload);
}

export async function fetchStaffPositionSkills() {
  return staffPositionRepository.fetchSkills();
}

export async function saveStaffPositionSkills(payload) {
  return staffPositionRepository.saveSkills(payload);
}

export async function upsertStoreStaffMember(payload) {
  const profile = buildStaffProfile(payload);
  if (!profile.valid) throw new Error(profile.message);
  payload = profile.payload;
  if (!supabase) return normalizeStoreStaffRow({ ...payload, id: payload.id || crypto.randomUUID?.() || Date.now() });
  const roleName = String(payload.role_name || payload.role || "").trim();
  const isPartTime = payload.employment_type === "兼職";
  const workStartTime = normalizeTime24(payload.work_start_time || payload.workStartTime);
  const workEndTime = normalizeTime24(payload.work_end_time || payload.workEndTime);
  const weekdayStartTime = normalizeTime24(payload.weekday_start_time || workStartTime);
  const weekdayEndTime = normalizeTime24(payload.weekday_end_time || workEndTime);
  const holidayStartTime = isPartTime ? normalizeTime24(payload.holiday_start_time || weekdayStartTime) : null;
  const holidayEndTime = isPartTime ? normalizeTime24(payload.holiday_end_time || weekdayEndTime) : null;
  const cleanPayload = {
    id: payload.id || crypto.randomUUID?.() || String(Date.now()),
    store_code: payload.store_code || payload.storeCode || "",
    store_name: payload.store_name || payload.storeName || "",
    employee_name: String(payload.employee_name || payload.employeeName || "").trim(),
    role_name: roleName,
    employment_type: payload.employment_type,
    work_category: payload.work_category,
    employment_status: payload.employment_status,
    auth_user_id: payload.auth_user_id || null,
    work_start_time: workStartTime,
    work_end_time: workEndTime,
    weekday_start_time: weekdayStartTime,
    weekday_end_time: weekdayEndTime,
    holiday_start_time: holidayStartTime || weekdayStartTime,
    holiday_end_time: holidayEndTime || weekdayEndTime,
    estimated_hourly_cost: payload.estimated_hourly_cost == null || payload.estimated_hourly_cost === "" ? null : Number(payload.estimated_hourly_cost),
    estimated_monthly_cost: payload.estimated_monthly_cost == null || payload.estimated_monthly_cost === "" ? null : Number(payload.estimated_monthly_cost),
    sort_order: Number(payload.sort_order || 999),
    is_active: payload.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  if (!cleanPayload.employee_name) throw new Error("請輸入人員姓名");
  if (!cleanPayload.role_name) throw new Error("請選擇職稱");
  if (!cleanPayload.store_code && !cleanPayload.store_name) throw new Error("請選擇門店");
  const defaultWindows = [
    [cleanPayload.weekday_start_time, cleanPayload.weekday_end_time, "平日"],
    [cleanPayload.holiday_start_time, cleanPayload.holiday_end_time, "假日"],
  ];
  for (const [start, end, label] of defaultWindows) {
    if (Boolean(start) !== Boolean(end)) throw new Error(`${label}上班與下班時間需同時填寫`);
    if (start && end <= start) throw new Error(`${label}下班時間需晚於上班時間`);
  }

  const result = await supabase
    .from("store_staff")
    .upsert(cleanPayload, { onConflict: "id" })
    .select(COMPATIBLE_STORE_STAFF_FIELDS)
    .single();
  let data = result.data;
  let error = result.error;
  if (error && isMissingSupabaseColumn(error)) {
    const {
      employment_type,
      work_category,
      employment_status,
      auth_user_id,
      estimated_hourly_cost,
      estimated_monthly_cost,
      ...compatiblePayload
    } = cleanPayload;
    const compatibleResult = await supabase
      .from("store_staff")
      .upsert(compatiblePayload, { onConflict: "id" })
      .select(COMPATIBLE_STORE_STAFF_FIELDS)
      .single();
    data = compatibleResult.data;
    error = compatibleResult.error;
  }
  if (error && isMissingSupabaseColumn(error)) {
    const {
      weekday_start_time,
      weekday_end_time,
      holiday_start_time,
      holiday_end_time,
      ...workTimeCompatiblePayload
    } = cleanPayload;
    delete workTimeCompatiblePayload.employment_type;
    delete workTimeCompatiblePayload.work_category;
    delete workTimeCompatiblePayload.employment_status;
    delete workTimeCompatiblePayload.auth_user_id;
    const compatibleResult = await supabase
      .from("store_staff")
      .upsert(workTimeCompatiblePayload, { onConflict: "id" })
      .select(WORK_TIME_COMPATIBLE_STORE_STAFF_FIELDS)
      .single();
    data = compatibleResult.data;
    error = compatibleResult.error;
  }
  if (error) throw error;
  return normalizeStoreStaffProfileRow(data);
}

export async function deleteStoreStaffMember(staffMember) {
  const staffId = typeof staffMember === "string" ? staffMember : staffMember?.id;
  if (!supabase || !staffId) return;
  const { data, error } = await supabase
    .from("store_staff")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", staffId)
    .select("id");
  if (error) throw error;
  if (!data?.length && typeof staffMember === "object") {
    const saved = await upsertStoreStaffMember({ ...staffMember, is_active: false });
    return [saved];
  }
  if (!data?.length) throw new Error("找不到要停用的人員資料");
  return data;
}

export async function upsertStaffPerformance(payload) {
  if (!supabase) return normalizePerformanceRow({ ...payload, id: payload.id || crypto.randomUUID?.() || Date.now() });
  const { data, error } = await supabase
    .from("staff_performance")
    .upsert(payload, { onConflict: "store_id,period_month,employee_name" })
    .select(STAFF_PERFORMANCE_FIELDS)
    .single();
  if (error) {
    if (isMissingSupabaseTable(error)) throw migrationRequiredError();
    throw error;
  }
  return normalizePerformanceRow(data);
}

export async function fetchHqTasks() {
  if (!supabase) return hqTaskSeed;
  const { data, error } = await supabase
    .from("hq_tasks")
    .select(HQ_TASK_FIELDS)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSupabaseTable(error)) return [];
    throw error;
  }
  return data.map(normalizeHqTaskRow);
}

export async function upsertHqTask(payload) {
  if (!supabase) return normalizeHqTaskRow({ ...payload, id: payload.id || crypto.randomUUID?.() || Date.now() });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id || null;
  const status = payload.status || "待處理";
  const cleanPayload = {
    id: payload.id || undefined,
    title: payload.title || payload.action || "總部交辦任務",
    task_type: payload.task_type || "總部交辦",
    scope_type: payload.scope_type || "門店",
    store_id: payload.store_id || null,
    assignee_name: payload.assignee_name || payload.owner || "未指定",
    assignee_role: payload.assignee_role || "未指定",
    priority: payload.priority || "中",
    status,
    due_date: payload.due_date || null,
    evidence: payload.evidence || "",
    action: payload.action || "",
    note: payload.note || "",
    completed_at: status === "已完成" ? new Date().toISOString() : null,
    created_by: payload.created_by || userId,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (!cleanPayload.id) delete cleanPayload.id;
  const { data, error } = await supabase
    .from("hq_tasks")
    .upsert(cleanPayload, { onConflict: "id" })
    .select(HQ_TASK_FIELDS)
    .single();
  if (error) throw error;
  return normalizeHqTaskRow(data);
}

export async function fetchStoreInspections() {
  if (!supabase) return null;
  const { data: inspections, error } = await supabase
    .from("store_inspections")
    .select(INSPECTION_FIELDS)
    .order("inspection_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const inspectionIds = inspections.map((inspection) => inspection.id);
  const { data: issues, error: issueError } = inspectionIds.length
    ? await supabase
      .from("store_inspection_issues")
      .select(INSPECTION_ISSUE_FIELDS)
      .in("inspection_id", inspectionIds)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (issueError) throw issueError;

  const issuesByInspection = new Map();
  issues.forEach((issue) => {
    if (!issuesByInspection.has(issue.inspection_id)) issuesByInspection.set(issue.inspection_id, []);
    issuesByInspection.get(issue.inspection_id).push(issue);
  });

  return inspections.map((inspection) => normalizeInspectionRow(inspection, issuesByInspection.get(inspection.id) || []));
}

export async function createStoreInspection(record) {
  if (!supabase) return record;
  const payload = {
    store_id: record.storeId,
    inspection_date: record.date,
    supervisor_name: record.supervisor || "總部督導",
    manager_name: record.manager || "",
    score: Number(record.score || 0),
    status: record.status || "已建檔",
    summary: record.summary || "",
    form_data: record.formData || null,
    manager_signature: record.managerSignature || "",
    source_type: record.sourceType || (record.formData ? "online" : "upload"),
  };
  const { data, error } = await supabase
    .from("store_inspections")
    .insert(payload)
    .select(INSPECTION_FIELDS)
    .single();
  if (error) throw error;

  const issuePayload = (record.issues || [])
    .filter((issue) => issue.title || issue.description || issue.suggestion)
    .map((issue) => ({
      inspection_id: data.id,
      category: issue.category || "一般",
      title: issue.title || "未命名缺失",
      description: issue.description || "",
      suggestion: issue.suggestion || "",
      severity: issue.severity || "一般",
      due_date: issue.dueDate || null,
      status: issue.status || "待處理",
    }));
  if (issuePayload.length) {
    const { error: issueError } = await supabase.from("store_inspection_issues").insert(issuePayload);
    if (issueError) throw issueError;
  }
  const rows = await fetchStoreInspections();
  return rows.find((row) => row.id === data.id) || normalizeInspectionRow(data, []);
}

export async function updateStoreInspection(record) {
  if (!supabase) return record;
  const { error } = await supabase
    .from("store_inspections")
    .update({
      inspection_date: record.date,
      supervisor_name: record.supervisor || "總部督導",
      manager_name: record.manager || "",
      score: Number(record.score || 0),
      status: record.status || "已建檔",
      summary: record.summary || "",
      form_data: record.formData || null,
      manager_signature: record.managerSignature || "",
      source_type: record.sourceType || (record.formData ? "online" : "upload"),
    })
    .eq("id", record.id);
  if (error) throw error;

  await supabase.from("store_inspection_issues").delete().eq("inspection_id", record.id);
  const issuePayload = (record.issues || [])
    .filter((issue) => issue.title || issue.description || issue.suggestion)
    .map((issue) => ({
      inspection_id: record.id,
      category: issue.category || "一般",
      title: issue.title || "未命名缺失",
      description: issue.description || "",
      suggestion: issue.suggestion || "",
      severity: issue.severity || "一般",
      due_date: issue.dueDate || null,
      status: issue.status || "待處理",
    }));
  if (issuePayload.length) {
    const { error: issueError } = await supabase.from("store_inspection_issues").insert(issuePayload);
    if (issueError) throw issueError;
  }
  return record;
}
export { hasSupabaseConfig };
