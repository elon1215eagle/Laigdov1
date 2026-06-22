import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const demoStores = [
  {
    id: "demo-franchise-store",
    store_code: "F001",
    name: "加盟示範店",
    owner_name: "加盟主",
    area: "示範區",
    is_active: true,
  },
];

const demoReports = [];
const demoExpenses = [];

const demoProfile = {
  id: "demo-franchise-user",
  full_name: "加盟店管理者",
  role: "franchise_owner",
  franchise_store_id: "demo-franchise-store",
  is_active: true,
};

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
  if (!supabase) return demoProfile;
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
  if (data) return data;

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

export async function fetchMonthlySummary({ storeId, from, to }) {
  if (!supabase) {
    return {
      reports: demoReports.filter((row) => row.report_date >= from && row.report_date <= to),
    };
  }
  if (!storeId) return { reports: [] };
  const { data, error } = await supabase
    .from("franchise_daily_reports")
    .select("*")
    .eq("franchise_store_id", storeId)
    .gte("report_date", from)
    .lte("report_date", to)
    .order("report_date", { ascending: false });
  if (error) throw error;
  return { reports: data || [] };
}

export async function fetchExpenses({ storeId, from, to }) {
  if (!supabase) {
    return demoExpenses.filter((row) => row.expense_date >= from && row.expense_date <= to);
  }
  if (!storeId) return [];
  const { data, error } = await supabase
    .from("franchise_expenses")
    .select("*")
    .eq("franchise_store_id", storeId)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertDailyReport(payload) {
  const closeRevenue = Math.max(
    0,
    Number(payload.full_day_revenue || 0) -
      Number(payload.opened_to_1400_revenue || 0) -
      Number(payload.revenue_1400_to_1900 || 0),
  );

  if (!supabase) {
    const existingIndex = demoReports.findIndex(
      (row) => row.franchise_store_id === payload.franchise_store_id && row.report_date === payload.report_date,
    );
    const row = { id: `demo-report-${payload.report_date}`, ...payload, revenue_1900_to_close: closeRevenue };
    if (existingIndex >= 0) demoReports[existingIndex] = row;
    else demoReports.push(row);
    return row;
  }

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("franchise_daily_reports")
    .upsert(
      {
        ...payload,
        revenue_1900_to_close: closeRevenue,
        submitted_by: userData.user?.id || null,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "franchise_store_id,report_date" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createExpense(payload) {
  if (!supabase) {
    const row = { id: `demo-expense-${Date.now()}`, ...payload };
    demoExpenses.push(row);
    return row;
  }
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("franchise_expenses")
    .insert({ ...payload, created_by: userData.user?.id || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}
