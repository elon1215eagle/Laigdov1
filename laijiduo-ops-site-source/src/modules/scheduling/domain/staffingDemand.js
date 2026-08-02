function normalizeTime(value) {
  const match = String(value || "").match(/^(\d{2}):(00|30)/);
  return match && Number(match[1]) <= 23 ? `${match[1]}:${match[2]}` : "";
}

export function buildStaffingDemandRule(payload = {}) {
  const rule = {
    id: payload.id || "",
    store_code: String(payload.store_code || payload.storeCode || ""),
    rule_type: String(payload.rule_type || payload.ruleType || "baseline"),
    weekday: payload.weekday === "" || payload.weekday == null ? null : Number(payload.weekday),
    special_date: String(payload.special_date || payload.specialDate || "") || null,
    start_time: normalizeTime(payload.start_time || payload.startTime),
    end_time: normalizeTime(payload.end_time || payload.endTime),
    required_count: Number(payload.required_count ?? payload.requiredCount ?? 0),
    is_active: payload.is_active !== false,
  };
  if (!rule.store_code) return { valid: false, message: "請選擇門店" };
  if (!["baseline", "weekday", "special"].includes(rule.rule_type)) return { valid: false, message: "需求規則類型不正確" };
  if (!rule.start_time || !rule.end_time || rule.end_time <= rule.start_time) return { valid: false, message: "需求時段起迄不正確" };
  if (!Number.isInteger(rule.required_count) || rule.required_count < 0) return { valid: false, message: "需求人力須為零以上整數" };
  if (rule.rule_type === "weekday" && (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6)) return { valid: false, message: "請選擇星期" };
  if (rule.rule_type === "special" && !/^\d{4}-\d{2}-\d{2}$/.test(rule.special_date || "")) return { valid: false, message: "請選擇特殊日期" };
  return { valid: true, payload: rule };
}

export function resolveStaffingDemand(rules = [], { storeCode, date, time }) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const active = rules.filter((row) => row.is_active !== false && (row.store_code || row.storeCode) === storeCode)
    .filter((row) => normalizeTime(row.start_time || row.startTime) <= time && normalizeTime(row.end_time || row.endTime) > time);
  const special = active.find((row) => (row.rule_type || row.ruleType) === "special" && (row.special_date || row.specialDate) === date);
  const weekdayRule = active.find((row) => (row.rule_type || row.ruleType) === "weekday" && Number(row.weekday) === weekday);
  const baseline = active.find((row) => (row.rule_type || row.ruleType) === "baseline");
  return Number((special || weekdayRule || baseline)?.required_count ?? (special || weekdayRule || baseline)?.requiredCount ?? 0);
}
