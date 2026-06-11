import { productsSeed, storesSeed } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";

const STORE_FIELDS = "id, store_code, name, area, manager_name, target_daily_revenue, is_active";
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
  "stores(name, area, store_code, manager_name, target_daily_revenue)",
].join(", ");
const INVENTORY_REPORT_FIELDS = [
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
    needs_revision: "需修改",
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

export async function fetchProducts() {
  if (!supabase) return productsSeed;
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data.map((product) => ({
    ...product,
    current_stock: 0,
    safety_stock: 0,
    loss_count: 0,
    incoming_count: 0,
    incoming_source: "廠商進貨",
    transfer_note: "",
  }));
}

function normalizeInventoryRow(row) {
  const note = row.transfer_note || "";
  const sourceMatch = note.match(/^來源：(廠商進貨|門店調貨)(?:｜(.*))?$/);
  return {
    ...row,
    incoming_source: row.incoming_source || sourceMatch?.[1] || "廠商進貨",
    transfer_note: sourceMatch ? sourceMatch[2] || "" : note,
  };
}

function fallbackIncomingSourceRows(rows) {
  return rows.map(({ incoming_source, transfer_note, ...row }) => ({
    ...row,
    transfer_note: `來源：${incoming_source || "廠商進貨"}${transfer_note ? `｜${transfer_note}` : ""}`,
  }));
}

export async function fetchStores() {
  if (!supabase) return storesSeed;
  const { data, error } = await supabase
    .from("stores")
    .select(STORE_FIELDS)
    .eq("is_active", true)
    .order("store_code");
  if (error) throw error;
  return data;
}

export async function fetchDailyReports(reportDate) {
  if (!supabase) return storesSeed;
  const { data, error } = await supabase
    .from("daily_report_totals")
    .select(REPORT_FIELDS)
    .eq("report_date", reportDate)
    .order("store_id");
  if (error) throw error;
  return data.map((report) => ({
    ...report,
    name: report.stores?.name,
    area: report.stores?.area,
    store_code: report.stores?.store_code,
    manager_name: report.stores?.manager_name,
    target: report.stores?.target_daily_revenue,
  }));
}

export async function fetchDailyReportsRange(dateFrom, dateTo) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("daily_report_totals")
    .select(REPORT_FIELDS)
    .gte("report_date", dateFrom)
    .lte("report_date", dateTo)
    .order("report_date")
    .order("store_id");
  if (error) throw error;
  return data.map((report) => ({
    ...report,
    name: report.stores?.name,
    area: report.stores?.area,
    store_code: report.stores?.store_code,
    manager_name: report.stores?.manager_name,
    target: report.stores?.target_daily_revenue,
  }));
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
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(INVENTORY_REPORT_FIELDS)
    .in("report_id", reportIds);
  if (error) throw error;
  return data.map((row) => normalizeInventoryRow({
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
  if (!String(error.message || "").includes("incoming_source")) throw error;

  const fallbackPayload = fallbackIncomingSourceRows(payload);
  const fallbackResult = await supabase
    .from("inventory_counts")
    .upsert(fallbackPayload, { onConflict: "report_id,product_id" })
    .select();
  if (fallbackResult.error) throw fallbackResult.error;
  return fallbackResult.data.map(normalizeInventoryRow);
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

export { hasSupabaseConfig };
