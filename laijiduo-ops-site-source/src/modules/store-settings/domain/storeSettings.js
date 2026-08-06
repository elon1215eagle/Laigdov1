const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const STORE_SETTING_TABS = [
  ["basic", "基本與狀態"],
  ["hours", "營業時間"],
  ["staffing", "人力需求"],
  ["target", "營收目標"],
  ["relation", "管理關係"],
  ["salary", "職級薪資"],
  ["audit", "異動紀錄"],
];

const nullableNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function normalizeSalarySetting(row = {}) {
  const workHours = nullableNumber(row.work_hours);
  const breakHours = nullableNumber(row.break_hours);
  return {
    ...row,
    role: row.role || row.role_name || "",
    role_name: row.role_name || row.role || "",
    salary_type: row.salary_type || (/時薪/.test(String(row.base_salary || "")) ? "hourly" : nullableNumber(row.base_salary) !== null ? "monthly" : "negotiable"),
    base_salary: nullableNumber(row.base_salary),
    hourly_rate: nullableNumber(row.hourly_rate),
    performance_bonus: nullableNumber(row.performance_bonus),
    monthly_rest_days: nullableNumber(row.monthly_rest_days),
    work_hours: workHours,
    break_hours: breakHours,
    actual_work_hours: workHours === null ? null : Math.max(0, workHours - (breakHours || 0)),
    employment_type: row.employment_type || "",
    insurance_note: row.insurance_note || "",
    is_active: row.is_active !== false,
  };
}

export function validateSalarySetting(row = {}) {
  const salary = normalizeSalarySetting(row);
  if (!salary.role_name) return "請選擇職級";
  if (!["monthly", "hourly", "negotiable"].includes(salary.salary_type)) return "請選擇薪資類型";
  for (const [value, label] of [
    [salary.base_salary, "底薪"], [salary.hourly_rate, "時薪"], [salary.performance_bonus, "績效獎金"],
    [salary.monthly_rest_days, "月休"], [salary.work_hours, "工時"], [salary.break_hours, "休息時間"],
  ]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return `${label}須為零以上數字`;
  }
  if (salary.salary_type === "monthly" && salary.base_salary === null) return "月薪制請填寫底薪";
  if (salary.salary_type === "hourly" && salary.hourly_rate === null) return "時薪制請填寫時薪";
  if (salary.work_hours !== null && salary.break_hours !== null && salary.break_hours > salary.work_hours) return "休息時間不可大於總工時";
  return "";
}

export function timeText(value, fallback = "") {
  return String(value || fallback).slice(0, 5);
}

export function createStoreSettingsDraft({ store, setting, demand, relation, fallback, workforceView }) {
  const openTime = timeText(setting?.weekday_open_time, fallback?.open_time || "10:00");
  const closeTime = timeText(setting?.weekday_close_time, fallback?.close_time || "22:00");
  const monthlyTarget = Number(store?.target_monthly_revenue || 0);
  return {
    store_code: store?.store_code || "",
    manager_name: store?.manager_name || "",
    operating_status: store?.operating_status || (store?.is_active === false ? "closed" : "active"),
    weekday_open_time: openTime,
    weekday_close_time: closeTime,
    holiday_open_time: timeText(setting?.holiday_open_time, openTime),
    holiday_close_time: timeText(setting?.holiday_close_time, closeTime),
    lunch_peak_start: timeText(setting?.lunch_peak_start, fallback?.lunch_peak?.split("-")[0] || "11:00"),
    lunch_peak_end: timeText(setting?.lunch_peak_end, fallback?.lunch_peak?.split("-")[1] || "14:00"),
    dinner_peak_start: timeText(setting?.dinner_peak_start, fallback?.dinner_peak?.split("-")[0] || "16:30"),
    dinner_peak_end: timeText(setting?.dinner_peak_end, fallback?.dinner_peak?.split("-")[1] || "19:00"),
    lunch_report_time: timeText(setting?.lunch_report_time, fallback?.lunch_report_time || "14:00"),
    dinner_report_time: timeText(setting?.dinner_report_time, fallback?.dinner_report_time || "19:00"),
    close_report_time: timeText(setting?.close_report_time, fallback?.close_report_time || closeTime),
    baseline_demand: Number(setting?.baseline_demand ?? demand?.required_count ?? relation?.demand ?? fallback?.duty_staff ?? 0),
    lunch_peak_demand: Number(setting?.lunch_peak_demand ?? demand?.required_count ?? relation?.demand ?? fallback?.duty_staff ?? 0),
    dinner_peak_demand: Number(setting?.dinner_peak_demand ?? demand?.required_count ?? relation?.demand ?? fallback?.duty_staff ?? 0),
    target_monthly_revenue: monthlyTarget,
    target_daily_revenue: Number(store?.target_daily_revenue || (monthlyTarget ? Math.round(monthlyTarget / 30) : 0)),
    effective_from: setting?.effective_from || new Date().toISOString().slice(0, 10),
    relation_group_code: relation?.code || "",
    group_demand: Number(relation?.demand || 0),
    relation_rule_note: relation?.ruleNote || "",
    backoffice_matrix_enabled: workforceView?.is_enabled === true,
  };
}

export function validateStoreSettingsDraft(draft, reason) {
  if (!draft.store_code) return "請選擇門店";
  if (String(reason || "").trim().length < 3) return "修改原因至少需要三個字";
  const times = ["weekday_open_time", "weekday_close_time", "holiday_open_time", "holiday_close_time", "lunch_peak_start", "lunch_peak_end", "dinner_peak_start", "dinner_peak_end", "lunch_report_time", "dinner_report_time", "close_report_time"];
  if (times.some((key) => !TIME_PATTERN.test(draft[key] || ""))) return "請完整填寫 24 小時制時間";
  if (draft.weekday_close_time <= draft.weekday_open_time || draft.holiday_close_time <= draft.holiday_open_time) return "打烊時間必須晚於開店時間";
  if (draft.lunch_peak_end <= draft.lunch_peak_start || draft.dinner_peak_end <= draft.dinner_peak_start) return "尖峰結束時間必須晚於開始時間";
  if (!Number.isInteger(Number(draft.baseline_demand)) || Number(draft.baseline_demand) < 0) return "需求人數須為零以上整數";
  if (!Number.isInteger(Number(draft.lunch_peak_demand)) || Number(draft.lunch_peak_demand) < 0) return "午峰需求須為零以上整數";
  if (!Number.isInteger(Number(draft.dinner_peak_demand)) || Number(draft.dinner_peak_demand) < 0) return "晚峰需求須為零以上整數";
  return "";
}

export function settingsPayload(draft) {
  const monthly = Math.max(0, Number(draft.target_monthly_revenue || 0));
  const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.effective_from || "") ? draft.effective_from : new Date().toISOString().slice(0, 10);
  const [year, month] = effectiveDate.split("-").map(Number);
  const monthDays = new Date(year, month, 0).getDate();
  return {
    ...draft,
    is_active: draft.operating_status === "active",
    baseline_demand: Number(draft.baseline_demand || 0),
    lunch_peak_demand: Number(draft.lunch_peak_demand || 0),
    dinner_peak_demand: Number(draft.dinner_peak_demand || 0),
    group_demand: Number(draft.group_demand || 0),
    target_monthly_revenue: monthly,
    target_daily_revenue: monthly ? Math.round(monthly / monthDays) : Math.max(0, Number(draft.target_daily_revenue || 0)),
  };
}

export function mergeStoreHours(fallbackRows = [], settings = [], stores = [], demands = []) {
  const settingsByCode = new Map(settings.map((row) => [row.store_code, row]));
  const demandByCode = new Map(demands.filter((row) => row.rule_type === "baseline" && row.is_active !== false).map((row) => [row.store_code, row]));
  const storeByName = new Map(stores.map((store) => [store.name, store]));
  return fallbackRows.map((row) => {
    const store = storeByName.get(row.storeName);
    const setting = settingsByCode.get(store?.store_code);
    const demand = demandByCode.get(store?.store_code);
    if (!setting && !demand) return row;
    return {
      ...row,
      open_time: timeText(setting?.weekday_open_time, row.open_time),
      close_time: timeText(setting?.weekday_close_time, row.close_time),
      lunch_peak: setting ? `${timeText(setting.lunch_peak_start)}-${timeText(setting.lunch_peak_end)}` : row.lunch_peak,
      dinner_peak: setting ? `${timeText(setting.dinner_peak_start)}-${timeText(setting.dinner_peak_end)}` : row.dinner_peak,
      lunch_report_time: timeText(setting?.lunch_report_time, row.lunch_report_time),
      dinner_report_time: timeText(setting?.dinner_report_time, row.dinner_report_time),
      close_report_time: timeText(setting?.close_report_time, row.close_report_time),
      duty_staff: String(setting?.baseline_demand ?? demand?.required_count ?? row.duty_staff),
    };
  });
}
