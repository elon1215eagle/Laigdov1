import { supabase } from "../../../lib/supabase.js";

const SETTINGS_FIELDS = [
  "store_code", "weekday_open_time", "weekday_close_time", "holiday_open_time", "holiday_close_time",
  "lunch_peak_start", "lunch_peak_end", "dinner_peak_start", "dinner_peak_end",
  "lunch_report_time", "dinner_report_time", "close_report_time", "baseline_demand", "lunch_peak_demand", "dinner_peak_demand", "effective_from", "updated_at",
].join(", ");

export async function fetchStoreOperatingConfigurations() {
  if (!supabase) return { settings: [], demands: [], audits: [], workforceViews: [], salarySettings: [] };
  const [settingsResult, demandResult, auditResult, workforceResult, salaryResult] = await Promise.all([
    supabase.from("store_operating_settings").select(SETTINGS_FIELDS).order("store_code"),
    supabase.from("store_staffing_demand_rules")
      .select("store_code, rule_type, weekday, special_date, start_time, end_time, required_count, is_active, note")
      .eq("is_active", true)
      .order("store_code"),
    supabase.from("store_operating_setting_audits")
      .select("id, store_code, change_reason, before_data, after_data, changed_at")
      .order("changed_at", { ascending: false })
      .limit(100),
    supabase.from("store_workforce_views")
      .select("store_code, view_type, is_enabled, updated_at")
      .order("store_code"),
    supabase.rpc("get_staff_role_salary_settings_secure"),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (demandResult.error) throw demandResult.error;
  if (auditResult.error) throw auditResult.error;
  if (workforceResult.error && !["PGRST205", "42P01"].includes(workforceResult.error.code)) throw workforceResult.error;
  if (salaryResult.error && !["PGRST202", "42883"].includes(salaryResult.error.code)) throw salaryResult.error;
  return {
    settings: settingsResult.data || [],
    demands: demandResult.data || [],
    audits: auditResult.data || [],
    workforceViews: workforceResult.data || [],
    salarySettings: salaryResult.data || [],
  };
}

export async function saveStoreOperatingConfiguration(storeCode, payload, reason) {
  if (!supabase) return { store: { store_code: storeCode }, settings: payload };
  const { data, error } = await supabase.rpc("save_store_operating_configuration", {
    p_store_code: storeCode,
    p_payload: payload,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function saveStoreWorkforceView(storeCode, viewType, isEnabled, reason) {
  if (!supabase) return { store_code: storeCode, view_type: viewType, is_enabled: isEnabled };
  const { data, error } = await supabase.rpc("save_store_workforce_view", {
    p_store_code: storeCode,
    p_view_type: viewType,
    p_is_enabled: Boolean(isEnabled),
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function saveStaffRoleSalarySetting(payload, reason) {
  if (!supabase) return payload;
  const { data, error } = await supabase.rpc("save_staff_role_salary_setting", {
    p_payload: payload,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}
