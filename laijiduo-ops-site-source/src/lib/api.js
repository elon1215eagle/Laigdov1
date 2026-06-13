import { productsSeed, storesSeed } from "./mockData";
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
      ...legacyRow
    } = row;
    return legacyRow;
  });
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
  const reports = await fetchDailyReportsRange(dateFrom, dateTo);
  const reportIds = reports.map((report) => report.id).filter(Boolean);
  const inventoryRows = await fetchInventoryCountsForReports(reportIds);
  return { reports, inventoryRows };
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

export async function upsertInventoryCounts(reportId, rows) {
  if (!supabase) return rows;
  const payload = rows.map((row) => ({ ...row, report_id: reportId }));
  const { data, error } = await supabase
    .from("inventory_counts")
    .upsert(payload, { onConflict: "report_id,product_id" })
    .select();
  if (!error) return data.map(normalizeInventoryRow);

  if (!String(error.message || "").match(/stock_unit|incoming_unit|current_stock_boxes|current_stock_packs|incoming_boxes|incoming_packs/)) {
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
    status: row.status || "待確認",
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
      status: issue.status || "待確認",
    })),
  };
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
    supervisor_name: record.supervisor || "未填寫",
    manager_name: record.manager || "",
    score: Number(record.score || 0),
    status: record.status || "待確認",
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
      category: issue.category || "其他",
      title: issue.title || "未命名問題",
      description: issue.description || "",
      suggestion: issue.suggestion || "",
      severity: issue.severity || "一般",
      due_date: issue.dueDate || null,
      status: issue.status || "待確認",
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
      supervisor_name: record.supervisor || "未填寫",
      manager_name: record.manager || "",
      score: Number(record.score || 0),
      status: record.status || "待確認",
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
      category: issue.category || "其他",
      title: issue.title || "未命名問題",
      description: issue.description || "",
      suggestion: issue.suggestion || "",
      severity: issue.severity || "一般",
      due_date: issue.dueDate || null,
      status: issue.status || "待確認",
    }));
  if (issuePayload.length) {
    const { error: issueError } = await supabase.from("store_inspection_issues").insert(issuePayload);
    if (issueError) throw issueError;
  }
  return record;
}

export { hasSupabaseConfig };
