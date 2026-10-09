import { hasSupabaseConfig, supabase } from "../../../lib/supabase.js";
import { normalizeAccountSummaryRow } from "../domain/accountSummary.js";

export async function fetchCrossAppAccounts() {
  if (!hasSupabaseConfig || !supabase) throw new Error("尚未設定 Supabase，無法載入正式帳號資料");
  const { data, error } = await supabase.rpc("get_cross_app_account_summary");
  if (error?.code === "42501" || error?.message?.includes("account_management_forbidden")) {
    throw new Error("此帳號沒有跨 APP 帳號管理權限");
  }
  if (error) throw new Error(`帳號資料載入失敗：${error.message}`);
  return (data || []).map(normalizeAccountSummaryRow);
}
