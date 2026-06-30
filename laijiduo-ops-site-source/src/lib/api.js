import { handoverSeed, hqTaskSeed, performanceSeed, productsSeed, staffRosterSeed, storesSeed } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";

const STORE_FIELDS = "id, store_code, name, area, manager_name, target_daily_revenue, target_monthly_revenue, is_active";
const LEGACY_STORE_FIELDS = "id, store_code, name, area, manager_name, target_daily_revenue, is_active";
const PRODUCT_FIELDS = "id, name, unit, sort_order, is_active";
const REPORT_FIELDS = [
  "id",
  "store_id",
  "report_date",
  "opened_to_1400_revenue",
  "revenue_1400_to_1900",
  "revenue_1900_to_close",
  "cash_difference",
  "status",
  "manager_note",
  "total_revenue",
  "stores(name, area, store_code, manager_name, target_daily_revenue, target_monthly_revenue)",
].join(", ");
const LEGACY_REPORT_FIELDS = [
  "id",
  "store_id",
  "report_date",
  "opened_to_1400_revenue",
  "revenue_1400_to_1900",
  "revenue_1900_to_close",
  "cash_difference",
  "status",
  "manager_note",
  "total_revenue",
  "stores(name, area, store_code, manager_name, target_daily_revenue)",
].join(", ");
const INVENTORY_REPORT_FIELDS = [
  "report_id",
  "product_id",
  "current_stock",
  "safety_stock",
  "loss_count",
  "incoming_count",
  "stock_unit",
  "incoming_unit",
  "current_stock_boxes",
  "current_stock_packs",
  "incoming_boxes",
  "incoming_packs",
  "incoming_source",
  "transfer_note",
  "is_shortage",
  "products(name, unit, sort_order)",
].join(", ");
const LEGACY_INVENTORY_REPORT_FIELDS = [
  "report_id",
  "product_id",
  "current_stock",
  "safety_stock",
  "loss_count",
  "incoming_count",
  "incoming_source",
  "transfer_note",
  "is_shortage",
  "products(name, unit, sort_order)",
].join(", ");
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
  "sort_order",
  "is_active",
  "created_at",
  "updated_at",
].join(", ");
const MONTHLY_LEAVE_FIELDS = [
  "id",
  "period_month",
  "store_code",
  "store_name",
  "staff_id",
  "employee_name",
  "role_name",
  "leave_days",
  "manual_leave_days",
  "auto_leave_days",
  "leave_type",
  "note",
  "updated_by",
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
  return (
    Number(report.opened_to_1400_revenue || 0) +
    Number(report.revenue_1400_to_1900 || 0) +
    Number(report.revenue_1900_to_close || 0)
  );
}

export function statusLabel(status) {
  return {
    draft: "草稿",
    submitted: "待審核",
    needs_revision: "退回修改",
    approved: "已通過",
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

function normalizeInventoryRow(row) {
  return {
    ...row,
    stock_unit: row.stock_unit || row.unit || row.products?.unit || "件",
    incoming_unit: row.incoming_unit || row.unit || row.products?.unit || "件",
    current_stock_boxes: Number(row.current_stock_boxes || 0),
    current_stock_packs: Number(row.current_stock_packs || 0),
    incoming_boxes: Number(row.incoming_boxes || 0),
    incoming_packs: Number(row.incoming_packs || 0),
    incoming_source: row.incoming_source || "廠商進貨",
    transfer_note: row.transfer_note || "",
  };
}

function stripNewInventoryFields(rows) {
  return rows.map((row) => {
    const {
      stock_unit,
      incoming_unit,
      current_stock_boxes,
      current_stock_packs,
      incoming_boxes,
      incoming_packs,
      incoming_source,
      transfer_note,
      ...legacyRow
    } = row;
    return legacyRow;
  });
}

function isInventorySchemaCacheError(error) {
  const message = String(error?.message || "");
  return /schema cache|column|stock_unit|incoming_unit|current_stock_boxes|current_stock_packs|incoming_boxes|incoming_packs|incoming_source|transfer_note/.test(message);
}

export async function fetchStores() {
  if (!supabase) return storesSeed;
  const result = await supabase
    .from("stores")
    .select(STORE_FIELDS)
    .eq("is_active", true)
    .order("store_code");
  if (!result.error) return result.data;

  const legacyResult = await supabase
    .from("stores")
    .select(LEGACY_STORE_FIELDS)
    .eq("is_active", true)
    .order("store_code");
  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data;
}

function normalizeReportRow(report) {
  return {
    ...report,
    name: report.stores?.name,
    area: report.stores?.area,
    store_code: report.stores?.store_code,
    manager_name: report.stores?.manager_name,
    target: report.stores?.target_daily_revenue,
    target_monthly_revenue: report.stores?.target_monthly_revenue,
  };
}

export async function fetchDailyReports(reportDate) {
  if (!supabase) return storesSeed;
  const result = await supabase
    .from("daily_report_totals")
    .select(REPORT_FIELDS)
    .eq("report_date", reportDate)
    .order("store_id");
  if (!result.error) return result.data.map(normalizeReportRow);

  const legacyResult = await supabase
    .from("daily_report_totals")
    .select(LEGACY_REPORT_FIELDS)
    .eq("report_date", reportDate)
    .order("store_id");
  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data.map(normalizeReportRow);
}

export async function fetchDailyReportsRange(dateFrom, dateTo) {
  if (!supabase) return [];
  const result = await supabase
    .from("daily_report_totals")
    .select(REPORT_FIELDS)
    .gte("report_date", dateFrom)
    .lte("report_date", dateTo)
    .order("report_date")
    .order("store_id");
  if (!result.error) return result.data.map(normalizeReportRow);

  const legacyResult = await supabase
    .from("daily_report_totals")
    .select(LEGACY_REPORT_FIELDS)
    .gte("report_date", dateFrom)
    .lte("report_date", dateTo)
    .order("report_date")
    .order("store_id");
  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data.map(normalizeReportRow);
}

export async function fetchInventoryCounts(reportId) {
  if (!supabase || !reportId) return [];
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("report_id", reportId);
  if (error) throw error;
  return data.map(normalizeInventoryRow);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousStockFields(row) {
  return {
    previous_stock: Number(row?.current_stock || 0),
    previous_stock_boxes: Number(row?.current_stock_boxes || 0),
    previous_stock_packs: Number(row?.current_stock_packs || 0),
    previous_stock_unit: row?.stock_unit || row?.unit || row?.products?.unit || "",
  };
}

function enrichInventoryWithPrevious(reports, inventoryRows) {
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const sortedRows = inventoryRows
    .map((row) => ({ ...row, report: reportsById.get(row.report_id) }))
    .filter((row) => row.report)
    .sort((a, b) => (
      String(a.report.store_id).localeCompare(String(b.report.store_id)) ||
      String(a.product_id).localeCompare(String(b.product_id)) ||
      String(a.report.report_date).localeCompare(String(b.report.report_date))
    ));
  const latestByStoreProduct = new Map();
  return sortedRows.map((row) => {
    const key = `${row.report.store_id}-${row.product_id}`;
    const previous = latestByStoreProduct.get(key);
    latestByStoreProduct.set(key, row);
    const { report, ...cleanRow } = row;
    return {
      ...cleanRow,
      ...(previous ? previousStockFields(previous) : previousStockFields(null)),
    };
  });
}

export async function fetchPreviousInventoryCounts(storeId, reportDate) {
  if (!supabase || !storeId || !reportDate) return [];
  const previousDate = addDays(reportDate, -1);
  const reports = await fetchDailyReports(previousDate);
  const previousReport = reports.find((report) => report.store_id === storeId);
  if (!previousReport?.id) return [];
  return fetchInventoryCounts(previousReport.id);
}

export async function fetchInventoryCountsForReports(reportIds) {
  if (!supabase || !reportIds?.length) return [];
  const result = await supabase
    .from("inventory_counts")
    .select(INVENTORY_REPORT_FIELDS)
    .in("report_id", reportIds);
  const data = result.error
    ? (await supabase
      .from("inventory_counts")
      .select(LEGACY_INVENTORY_REPORT_FIELDS)
      .in("report_id", reportIds))
    : result;
  if (data.error) throw data.error;
  return data.data.map((row) => normalizeInventoryRow({
    ...row,
    name: row.products?.name,
    unit: row.products?.unit,
    sort_order: row.products?.sort_order,
  }));
}

export async function fetchHqDashboardData(dateFrom, dateTo) {
  const contextStart = addDays(dateFrom, -1);
  const contextReports = await fetchDailyReportsRange(contextStart, dateTo);
  const reportIds = contextReports.map((report) => report.id).filter(Boolean);
  const contextInventoryRows = await fetchInventoryCountsForReports(reportIds);
  const enrichedRows = enrichInventoryWithPrevious(contextReports, contextInventoryRows);
  const visibleReportIds = new Set(
    contextReports
      .filter((report) => report.report_date >= dateFrom && report.report_date <= dateTo)
      .map((report) => report.id),
  );
  return {
    reports: contextReports.filter((report) => report.report_date >= dateFrom && report.report_date <= dateTo),
    inventoryRows: enrichedRows.filter((row) => visibleReportIds.has(row.report_id)),
  };
}

export async function upsertDailyReport(payload) {
  if (!supabase) return payload;
  const { data, error } = await supabase
    .from("daily_reports")
    .upsert(payload, { onConflict: "store_id,report_date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDailyReport(reportId) {
  if (!supabase || !reportId) return;
  const { data, error } = await supabase
    .from("daily_reports")
    .delete()
    .eq("id", reportId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("資料庫未刪除任何資料，請確認帳號權限或資料狀態");
  return data;
}

export async function deleteDailyReports(reportIds) {
  const ids = reportIds?.filter(Boolean) || [];
  if (!supabase || !ids.length) return;
  const { data, error } = await supabase
    .from("daily_reports")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("資料庫未刪除任何資料，請確認帳號權限或資料狀態");
  if (data.length !== ids.length) {
    throw new Error(`資料庫僅刪除 ${data.length} 筆，與預期 ${ids.length} 筆不一致，請重新查詢後再操作`);
  }
  return data;
}

export async function upsertInventoryCounts(reportId, rows) {
  if (!supabase) return rows;
  const payload = rows.map((row) => ({ ...row, report_id: reportId }));
  const { data, error } = await supabase
    .from("inventory_counts")
    .upsert(payload, { onConflict: "report_id,product_id" })
    .select();
  if (!error) return data.map(normalizeInventoryRow);

  if (!isInventorySchemaCacheError(error)) {
    throw error;
  }

  const fallbackResult = await supabase
    .from("inventory_counts")
    .upsert(stripNewInventoryFields(payload), { onConflict: "report_id,product_id" })
    .select();
  if (fallbackResult.error) throw fallbackResult.error;
  return fallbackResult.data.map(normalizeInventoryRow);
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
    sort_order: Number(row.sort_order || index + 1),
    is_active: row.is_active !== false,
  };
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

function migrationRequiredError() {
  return new Error("資料表尚未建立，請先套用 Supabase migration_2026_06_15_handover_performance.sql");
}

function normalizeLeaveDays(days) {
  return Array.from(
    new Set((days || []).map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 31)),
  ).sort((a, b) => a - b);
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

export async function fetchMonthlyLeavePlans(periodMonth) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("monthly_leave_plans")
    .select(MONTHLY_LEAVE_FIELDS)
    .eq("period_month", periodMonth)
    .order("store_code")
    .order("employee_name");
  if (error) {
    if (isMissingSupabaseTable(error)) return [];
    throw error;
  }
  return data;
}

export async function upsertMonthlyLeavePlan(payload) {
  if (!supabase) return payload;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const { data, error } = await supabase
    .from("monthly_leave_plans")
    .upsert(
      {
        ...payload,
        leave_days: normalizeLeaveDays(payload.leave_days),
        manual_leave_days: normalizeLeaveDays(payload.manual_leave_days),
        auto_leave_days: normalizeLeaveDays(payload.auto_leave_days),
        leave_type: payload.leave_type || "排休",
        updated_by: userData.user?.id || null,
      },
      { onConflict: "period_month,staff_id" },
    )
    .select(MONTHLY_LEAVE_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertMonthlyLeavePlans(payloads) {
  if (!supabase) return payloads;
  if (!payloads.length) return [];
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const cleanPayloads = payloads.map((payload) => ({
    ...payload,
    leave_days: normalizeLeaveDays(payload.leave_days),
    manual_leave_days: normalizeLeaveDays(payload.manual_leave_days),
    auto_leave_days: normalizeLeaveDays(payload.auto_leave_days),
    leave_type: payload.leave_type || "排休",
    updated_by: userData.user?.id || null,
  }));
  const { data, error } = await supabase
    .from("monthly_leave_plans")
    .upsert(cleanPayloads, { onConflict: "period_month,staff_id" })
    .select(MONTHLY_LEAVE_FIELDS);
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
  const { data, error } = await supabase
    .from("store_staff")
    .select(STORE_STAFF_FIELDS)
    .order("store_code")
    .order("sort_order")
    .order("employee_name");
  if (error) {
    if (isMissingSupabaseTable(error)) return staffRosterSeed;
    throw error;
  }
  const savedRows = (data || []).map(normalizeStoreStaffRow);
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const inactiveIds = new Set(savedRows.filter((row) => row.is_active === false).map((row) => row.id));
  const seedRows = staffRosterSeed
    .filter((row) => !inactiveIds.has(row.id))
    .map((row, index) => savedById.get(row.id) || normalizeStoreStaffRow(row, index));
  const customRows = savedRows.filter((row) => row.is_active !== false && !staffRosterSeed.some((seed) => seed.id === row.id));
  return [...seedRows, ...customRows]
    .filter((row) => row.is_active !== false)
    .sort((a, b) => (
      String(a.store_code || "").localeCompare(String(b.store_code || "")) ||
      Number(a.sort_order || 999) - Number(b.sort_order || 999) ||
      String(a.employeeName || "").localeCompare(String(b.employeeName || ""), "zh-Hant")
    ));
}

export async function upsertStoreStaffMember(payload) {
  if (!supabase) return normalizeStoreStaffRow({ ...payload, id: payload.id || crypto.randomUUID?.() || Date.now() });
  const cleanPayload = {
    id: payload.id || crypto.randomUUID?.() || String(Date.now()),
    store_code: payload.store_code || payload.storeCode || "",
    store_name: payload.store_name || payload.storeName || "",
    employee_name: String(payload.employee_name || payload.employeeName || "").trim(),
    role_name: String(payload.role_name || payload.role || "").trim(),
    sort_order: Number(payload.sort_order || 999),
    is_active: payload.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  if (!cleanPayload.employee_name) throw new Error("請輸入人員姓名");
  if (!cleanPayload.role_name) throw new Error("請選擇職稱");
  if (!cleanPayload.store_code && !cleanPayload.store_name) throw new Error("請選擇門店");

  const { data, error } = await supabase
    .from("store_staff")
    .upsert(cleanPayload, { onConflict: "id" })
    .select(STORE_STAFF_FIELDS)
    .single();
  if (error) throw error;
  return normalizeStoreStaffRow(data);
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
