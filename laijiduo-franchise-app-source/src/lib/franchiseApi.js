import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const demoStores = [
  { id: "demo-store-1", store_code: "F001", name: "加盟五甲示範店", owner_name: "加盟主A", area: "高雄", is_active: true },
  { id: "demo-store-2", store_code: "F002", name: "加盟屏東示範店", owner_name: "加盟主B", area: "屏東", is_active: true },
];

const demoProducts = [
  ["demo-p01", "雞翅", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 1],
  ["demo-p02", "雞腿", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 2],
  ["demo-p03", "雞排", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 3],
  ["demo-p04", "腿排", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 4],
  ["demo-p05", "雞米花", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 5],
  ["demo-p06", "三角骨", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 6],
  ["demo-p07", "雞脖子", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 1, 7],
  ["demo-p08", "地瓜", "主商品", ["箱", "大包", "小包"], "箱", "主商品依總部進貨規格選箱/大包/小包", 2, 8],
  ["demo-p09", "米血", "固定包裝", ["包"], "包", "固定以包統計", 5, 9],
  ["demo-p10", "花枝丸", "固定包裝", ["包"], "包", "固定以包統計", 5, 10],
  ["demo-p11", "熱狗", "固定包裝", ["包"], "包", "固定以包統計", 5, 11],
  ["demo-p12", "雞塊", "固定包裝", ["包"], "包", "固定以包統計", 5, 12],
  ["demo-p13", "黑輪", "固定包裝", ["包"], "包", "固定以包統計", 5, 13],
  ["demo-p14", "雞皮", "特殊單位", ["串"], "串", "固定以串統計", 20, 14],
  ["demo-p15", "炸油", "油品", ["桶"], "桶", "固定以桶統計", 1, 15],
  ["demo-p16", "湯翅粉", "粉類", ["箱", "包"], "包", "1箱 = 10包", 10, 16],
  ["demo-p17", "醃粉", "粉類", ["箱", "包"], "包", "1箱 = 10包", 10, 17],
  ["demo-p18", "薯脆粉", "粉類", ["箱", "包"], "包", "1箱 = 10包", 10, 18],
].map(([id, name, category, allowed_units, default_unit, conversion_note, default_threshold_qty, sort_order]) => ({
  id,
  product_code: id.replace("demo-", "").toUpperCase(),
  name,
  category,
  allowed_units,
  default_unit,
  conversion_note,
  default_threshold_qty,
  sort_order,
  is_active: true,
}));

const demoReports = [];
const demoItems = [];

function isMissingInventoryTable(error) {
  return ["42P01", "42703", "PGRST200", "PGRST205", "PGRST204"].includes(error?.code);
}

function normalizeRole(role) {
  if (["coo", "franchise_coo"].includes(role)) return "franchise_coo";
  if (["cfo", "franchise_cfo"].includes(role)) return "franchise_cfo";
  if (["hq", "admin", "franchise_admin", "franchise_hq"].includes(role)) return "franchise_admin";
  return role || "franchise_owner";
}

export async function signIn(email, password) {
  if (!supabase) return { user: { email } };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSessionProfile() {
  if (!supabase) {
    return {
      id: "demo-franchise-user",
      full_name: "加盟系統總部",
      role: "franchise_admin",
      franchise_store_id: null,
      is_active: true,
    };
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("franchise_profiles")
    .select("id, full_name, role, franchise_store_id, is_active")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (data) return { ...data, role: normalizeRole(data.role) };

  return {
    id: user.id,
    full_name: user.email || "未綁定加盟帳號",
    role: "franchise_owner",
    franchise_store_id: null,
    is_active: true,
  };
}

export async function fetchFranchiseStores() {
  if (!supabase) return demoStores;
  const { data, error } = await supabase
    .from("franchise_stores")
    .select("id, store_code, name, owner_name, area, is_active")
    .eq("is_active", true)
    .order("store_code");
  if (error) throw error;
  return data || [];
}

export async function fetchInventoryProducts() {
  if (!supabase) return demoProducts;
  const { data, error } = await supabase
    .from("franchise_inventory_products")
    .select("id, product_code, name, category, allowed_units, default_unit, conversion_note, default_threshold_qty, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order");
  if (error) {
    if (isMissingInventoryTable(error)) return demoProducts;
    throw error;
  }
  return data || [];
}

export async function fetchInventoryReport({ storeId, date }) {
  if (!storeId || !date) return null;
  if (!supabase) {
    const report = demoReports.find((row) => row.franchise_store_id === storeId && row.report_date === date);
    if (!report) return null;
    return { ...report, items: demoItems.filter((item) => item.report_id === report.id) };
  }
  const { data: report, error } = await supabase
    .from("franchise_inventory_reports")
    .select("*")
    .eq("franchise_store_id", storeId)
    .eq("report_date", date)
    .maybeSingle();
  if (error) {
    if (isMissingInventoryTable(error)) return null;
    throw error;
  }
  if (!report) return null;
  const { data: items, error: itemsError } = await supabase
    .from("franchise_inventory_items")
    .select("*, product:franchise_inventory_products(*)")
    .eq("report_id", report.id);
  if (itemsError) throw itemsError;
  return { ...report, items: items || [] };
}

export async function fetchInventoryRange({ storeId = "", from, to }) {
  if (!supabase) {
    const reports = demoReports.filter((row) => (!storeId || row.franchise_store_id === storeId) && row.report_date >= from && row.report_date <= to);
    const reportIds = new Set(reports.map((row) => row.id));
    return { reports, items: demoItems.filter((item) => reportIds.has(item.report_id)) };
  }
  let reportsQuery = supabase
    .from("franchise_inventory_reports")
    .select("*, store:franchise_stores(store_code,name,area,owner_name)")
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: false });
  if (storeId) reportsQuery = reportsQuery.eq("franchise_store_id", storeId);
  const { data: reports, error } = await reportsQuery;
  if (error) {
    if (isMissingInventoryTable(error)) return { reports: [], items: [] };
    throw error;
  }
  const reportIds = (reports || []).map((row) => row.id);
  if (!reportIds.length) return { reports: reports || [], items: [] };
  const { data: items, error: itemsError } = await supabase
    .from("franchise_inventory_items")
    .select("*, product:franchise_inventory_products(*)")
    .in("report_id", reportIds);
  if (itemsError) throw itemsError;
  const reportById = new Map((reports || []).map((row) => [row.id, row]));
  return {
    reports: reports || [],
    items: (items || []).map((item) => ({
      ...item,
      store_name: reportById.get(item.report_id)?.store?.name,
    })),
  };
}

export async function upsertInventoryReport(payload) {
  if (!supabase) {
    const existingIndex = demoReports.findIndex((row) => row.franchise_store_id === payload.franchise_store_id && row.report_date === payload.report_date);
    const report = {
      id: existingIndex >= 0 ? demoReports[existingIndex].id : `demo-report-${Date.now()}`,
      franchise_store_id: payload.franchise_store_id,
      report_date: payload.report_date,
      note: payload.note || "",
      status: "submitted",
      submitted_at: new Date().toISOString(),
    };
    if (existingIndex >= 0) demoReports[existingIndex] = report;
    else demoReports.push(report);
    for (let index = demoItems.length - 1; index >= 0; index -= 1) {
      if (demoItems[index].report_id === report.id) demoItems.splice(index, 1);
    }
    payload.items.forEach((item) => demoItems.push({ id: `demo-item-${Date.now()}-${item.product_id}`, report_id: report.id, ...item }));
    return report;
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data: report, error } = await supabase
    .from("franchise_inventory_reports")
    .upsert(
      {
        franchise_store_id: payload.franchise_store_id,
        report_date: payload.report_date,
        note: payload.note || "",
        status: "submitted",
        submitted_by: userData.user?.id || null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "franchise_store_id,report_date" },
    )
    .select()
    .single();
  if (error) throw error;

  const cleanItems = (payload.items || []).map((item) => ({
    report_id: report.id,
    product_id: item.product_id,
    previous_qty: Number(item.previous_qty || 0),
    previous_unit: item.previous_unit || item.product?.default_unit || "包",
    incoming_qty: Number(item.incoming_qty || 0),
    incoming_unit: item.incoming_unit || item.product?.default_unit || "包",
    current_qty: Number(item.current_qty || 0),
    current_unit: item.current_unit || item.product?.default_unit || "包",
    waste_qty: Number(item.waste_qty || 0),
    waste_unit: item.waste_unit || item.product?.default_unit || "包",
    threshold_qty: Number(item.threshold_qty || item.product?.default_threshold_qty || 0),
    threshold_unit: item.threshold_unit || item.product?.default_unit || "包",
    note: item.note || "",
  }));

  const { error: deleteError } = await supabase
    .from("franchise_inventory_items")
    .delete()
    .eq("report_id", report.id);
  if (deleteError) throw deleteError;

  if (cleanItems.length) {
    const { error: insertError } = await supabase
      .from("franchise_inventory_items")
      .insert(cleanItems);
    if (insertError) throw insertError;
  }
  return report;
}
