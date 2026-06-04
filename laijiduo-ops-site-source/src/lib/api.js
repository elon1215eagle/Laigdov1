import { productsSeed, storesSeed } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";

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
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data.map((product) => ({
    ...product,
    current_stock: 0,
    safety_stock: 0,
    loss_count: 0,
    incoming_count: 0,
    transfer_note: "",
  }));
}

export async function fetchStores() {
  if (!supabase) return storesSeed;
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("is_active", true)
    .order("store_code");
  if (error) throw error;
  return data;
}

export async function fetchDailyReports(reportDate) {
  if (!supabase) return storesSeed;
  const { data, error } = await supabase
    .from("daily_report_totals")
    .select("*, stores(name, area, store_code, manager_name, target_daily_revenue)")
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

export async function fetchInventoryCounts(reportId) {
  if (!supabase || !reportId) return [];
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("*")
    .eq("report_id", reportId);
  if (error) throw error;
  return data;
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

export { hasSupabaseConfig };
