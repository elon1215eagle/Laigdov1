const STORE_BASELINES = {
  S01: { target: 8, demand: 6, managerAuthority: "委任", note: "五甲分為門店與後勤兩組。" },
  S02: { target: 5, demand: 3, managerAuthority: "代店" },
  S03: { target: 2, demand: 2, managerAuthority: "待確認" },
  S04: { target: 3, demand: 2, managerAuthority: "委任" },
  S05: { target: 3, demand: 2, managerAuthority: "待確認" },
  S06: { target: 2, demand: 1.5, managerAuthority: "缺主管" },
  S07: { target: 4, demand: 3, managerAuthority: "代店" },
  S08: { target: 3, demand: 3, managerAuthority: "代店" },
  S09: { target: 4, demand: 3, managerAuthority: "委任" },
  S10: { target: 3.5, demand: 2, managerAuthority: "委任" },
  S11: { target: 2.5, demand: 2, managerAuthority: "委任" },
};

const STORE_OPERATION_DETAILS = {
  S01: {
    outputTime: "11:00", closingTime: "21:30",
    shifts: [["開早班", "10:00", "21:00"], ["正常班", "11:30", "22:30"], ["打烊班", "12:00", "23:00"]],
    laborUnits: [["一樓", 30, 5, 40, 4], ["二樓", 30, 3, 14, 2]],
  },
  S02: {
    outputTime: "10:30", closingTime: "21:00",
    shifts: [["開早班", "09:30", "20:30"], ["正常班", "10:30", "21:30"], ["打烊班", "11:30", "22:30"]],
    laborUnits: [["門店", 30, 5, 32, 3]],
  },
  S03: {
    outputTime: "11:30", closingTime: "21:00",
    shifts: [["開早班", "10:30", "21:30"], ["打烊班", "11:30", "22:30"]],
    laborUnits: [["門店", 30, 2, 21, 2]],
  },
  S04: {
    outputTime: "11:00", closingTime: "20:40",
    shifts: [["開早班", "10:00", "21:00"], ["打烊班", "11:30", "22:30"]],
    laborUnits: [["門店", 30, 3, 20, 2]],
  },
  S05: {
    outputTime: "11:00", closingTime: "20:30",
    shifts: [["開早班", "10:00", "21:00"], ["打烊班", "11:00", "22:00"]],
    laborUnits: [["門店", 30, 3, 19, 2]],
  },
  S06: {
    outputTime: "10:00", closingTime: "19:30",
    shifts: [["開早班", "09:00", "20:00"], ["打烊班", "10:00", "21:00"]],
    laborUnits: [["門店", 30, 0, 12, 1.5]],
  },
  S07: {
    outputTime: "10:30", closingTime: "21:00",
    shifts: [["開早班", "09:30", "20:30"], ["打烊班", "11:30", "22:30"]],
    laborUnits: [["門店", 30, 4, 25, 3]],
  },
  S08: {
    outputTime: "11:00", closingTime: "20:30",
    shifts: [["開早班", "09:30", "20:30"], ["正常班", "11:30", "22:30"], ["打烊班", "12:30", "22:30"]],
    laborUnits: [["門店", 30, 4, 26, 3]],
  },
  S09: {
    outputTime: "11:00", closingTime: "21:30",
    shifts: [["開早班", "10:00", "21:00"], ["正常班", "11:30", "22:30"], ["打烊班", "12:00", "23:00"]],
    laborUnits: [["門店", 30, 4, 26, 3]],
  },
  S10: {
    outputTime: "10:00", closingTime: "19:40",
    shifts: [["開早班", "09:00", "20:00"], ["打烊班", "10:30", "21:30"], ["後勤班", "15:00", "20:00"]],
    laborUnits: [["門店", 30, 3, 19, 2]],
  },
  S11: {
    outputTime: "10:00", closingTime: "19:20",
    shifts: [["開早班", "09:00", "20:00"], ["打烊班", "10:30", "21:30"]],
    laborUnits: [["門店", 30, 3, 19, 2]],
  },
};

const LEADERSHIP_ROLES = ["委任店經理", "店長", "代理店長", "副店長", "代理副店"];
const MANAGE_ROLES = new Set(["ceo", "coo", "cso", "general_affairs", "admin", "hq"]);

export const STAFFING_GROUP_OPTIONS = ["門店", "後勤", "送貨"];
export const STAFFING_STATUS_OPTIONS = ["在職", "待到職", "留職停薪", "已離職", "停用"];
export const MANAGER_AUTHORITY_OPTIONS = ["正式店長", "委任", "代店", "待確認", "缺主管"];

function operationDetails(storeCode) {
  const details = STORE_OPERATION_DETAILS[storeCode] || { outputTime: "", closingTime: "", shifts: [], laborUnits: [] };
  return {
    output_time: details.outputTime,
    closing_time: details.closingTime,
    shifts: details.shifts.map(([name, start_time, end_time], index) => ({ id: `${storeCode}-shift-${index + 1}`, name, start_time, end_time })),
    labor_units: details.laborUnits.map(([name, month_days, staff_equivalent, rest_days, positions], index) => ({
      id: `${storeCode}-labor-${index + 1}`, name, month_days, staff_equivalent, rest_days, positions,
    })),
  };
}

export function calculateLaborUnit(unit = {}) {
  const monthDays = Number(unit.month_days || 0);
  const staffEquivalent = Number(unit.staff_equivalent || 0);
  const restDays = Number(unit.rest_days || 0);
  const positions = Number(unit.positions || 0);
  const totalDays = monthDays * staffEquivalent;
  const workDays = totalDays - restDays;
  const requiredDays = monthDays * positions;
  return { monthDays, staffEquivalent, restDays, positions, totalDays, workDays, requiredDays, balance: workDays - requiredDays };
}

export function staffingRoleTone(role = "") {
  const value = String(role).trim();
  if (value.includes("委任店經理")) return "commissioned";
  if (value.includes("副店")) return "deputy";
  if (value.includes("店長") || value.includes("代店") || value.includes("店經理")) return "manager";
  if (value.includes("資深")) return "senior";
  if (value.includes("新進")) return "newcomer";
  if (value.includes("後勤")) return "support";
  if (value.includes("送貨") || value.includes("物流")) return "delivery";
  if (value.includes("兼職")) return "parttime";
  if (value.includes("正式")) return "regular";
  return "staff";
}

export function staffingStoreCode(value = {}) {
  return String(value.store_code || value.storeCode || value.code || "").trim().toUpperCase();
}

export function staffingStoreName(value = {}) {
  return String(value.store_name || value.storeName || value.name || "").trim();
}

export function canManageStaffingOverview(role) {
  return MANAGE_ROLES.has(String(role || ""));
}

export function canViewAllStaffingStores(role) {
  return String(role || "") !== "store_manager";
}

function staffStoreCode(row, stores) {
  const direct = staffingStoreCode(row);
  if (direct) return direct;
  const name = staffingStoreName(row);
  return staffingStoreCode(stores.find((store) => staffingStoreName(store) === name) || {});
}

function displayGroup(row) {
  const category = String(row.work_category || row.workCategory || "");
  const role = String(row.role_name || row.role || "");
  if (category === "送貨" || role.includes("送貨") || role.includes("物流")) return "送貨";
  if (category === "後勤" || role.includes("後勤")) return "後勤";
  return "門店";
}

function normalizedDisplayGroup(person) {
  const classified = displayGroup(person);
  if (classified !== "門店") return classified;
  return STAFFING_GROUP_OPTIONS.includes(person?.group) ? person.group : "門店";
}

function personStatus(row) {
  return String(row.employment_status || row.employmentStatus || (row.is_active === false ? "停用" : "在職"));
}

export function buildStaffingSnapshot({ store, stores = [], staff = [] } = {}) {
  const storeCode = staffingStoreCode(store);
  const storeName = staffingStoreName(store);
  const baseline = STORE_BASELINES[storeCode] || { target: 0, demand: 0, managerAuthority: "待確認" };
  const operations = operationDetails(storeCode);
  const rows = staff
    .filter((row) => staffStoreCode(row, stores) === storeCode || (!storeCode && staffingStoreName(row) === storeName))
    .map((row, index) => ({
      id: String(row.id || `${storeCode || "STORE"}-${index + 1}`),
      name: String(row.employee_name || row.employeeName || "未命名").trim(),
      role: String(row.role_name || row.role || "門店人員").trim(),
      group: displayGroup(row),
      employment_type: String(row.employment_type || row.employmentType || "正職"),
      status: personStatus(row),
      work_time: [row.weekday_start_time || row.work_start_time || row.workStartTime, row.weekday_end_time || row.work_end_time || row.workEndTime].filter(Boolean).join("–"),
      note: "",
      visible: row.is_active !== false,
      sort_order: Number(row.sort_order || index + 1),
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-Hant"));
  const manager = rows.find((row) => LEADERSHIP_ROLES.includes(row.role));
  return {
    schema_version: 2,
    store_code: storeCode,
    store_name: storeName,
    target_headcount: baseline.target,
    daily_demand: baseline.demand,
    manager_name: manager?.name || "",
    manager_authority: manager ? baseline.managerAuthority : "缺主管",
    note: baseline.note || "",
    ...operations,
    people: rows,
  };
}

export function normalizeStaffingSnapshot(value, fallback) {
  const source = value && typeof value === "object" ? value : fallback;
  const people = Array.isArray(source?.people) ? source.people : [];
  return {
    ...fallback,
    ...source,
    schema_version: 2,
    target_headcount: Math.max(0, Number(source?.target_headcount || 0)),
    daily_demand: Math.max(0, Number(source?.daily_demand || 0)),
    output_time: String(source?.output_time || fallback?.output_time || ""),
    closing_time: String(source?.closing_time || fallback?.closing_time || ""),
    shifts: (Array.isArray(source?.shifts) ? source.shifts : fallback?.shifts || []).map((shift, index) => ({
      id: String(shift.id || `shift-${index + 1}`),
      name: String(shift.name || "").trim(),
      start_time: String(shift.start_time || ""),
      end_time: String(shift.end_time || ""),
    })),
    labor_units: (Array.isArray(source?.labor_units) ? source.labor_units : fallback?.labor_units || []).map((unit, index) => ({
      id: String(unit.id || `labor-${index + 1}`),
      name: String(unit.name || "門店").trim(),
      month_days: Math.max(0, Number(unit.month_days || 0)),
      staff_equivalent: Math.max(0, Number(unit.staff_equivalent || 0)),
      rest_days: Math.max(0, Number(unit.rest_days || 0)),
      positions: Math.max(0, Number(unit.positions || 0)),
    })),
    people: people.map((person, index) => ({
      id: String(person.id || globalThis.crypto?.randomUUID?.() || `display-${index + 1}`),
      name: String(person.name || "").trim(),
      role: String(person.role || "門店人員").trim(),
      group: normalizedDisplayGroup(person),
      employment_type: String(person.employment_type || "正職"),
      status: STAFFING_STATUS_OPTIONS.includes(person.status) ? person.status : "在職",
      work_time: String(person.work_time || ""),
      note: String(person.note || ""),
      visible: person.visible !== false,
      sort_order: Number(person.sort_order || index + 1),
    })).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-Hant")),
  };
}

export function resolvePublishedStaffingSnapshot(value, fallback) {
  if (!value || typeof value !== "object" || !Array.isArray(value.people)) return null;
  return normalizeStaffingSnapshot(value, fallback);
}

export function resolveStaffingDraftSnapshot(draft, published, fallback) {
  const source = draft && typeof draft === "object"
    ? draft
    : published && typeof published === "object"
      ? published
      : fallback;
  return normalizeStaffingSnapshot(source, fallback);
}

export function syncStaffingSnapshotPeople(value, fallback) {
  const published = normalizeStaffingSnapshot(value, fallback);
  const current = normalizeStaffingSnapshot(fallback, fallback);
  const publishedById = new Map(published.people.map((person) => [person.id, person]));
  const currentIds = new Set(current.people.map((person) => person.id));
  const people = current.people.map((person, index) => {
    const display = publishedById.get(person.id);
    if (!display) return { ...person, sort_order: Number(person.sort_order || index + 1) };
    return {
      ...person,
      role: display.role,
      group: display.group,
      note: display.note,
      visible: display.visible,
      sort_order: display.sort_order,
    };
  });
  const manualPeople = published.people.filter((person) => person.id.startsWith("display-") && !currentIds.has(person.id));
  return {
    ...published,
    people: [...people, ...manualPeople]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-Hant")),
  };
}

export function validateStaffingSnapshot(snapshot) {
  if (!snapshot?.store_code || !snapshot?.store_name) return "缺少門店資料";
  if (!Number.isFinite(Number(snapshot.target_headcount)) || Number(snapshot.target_headcount) < 0) return "編制人數不可小於 0";
  if (!Number.isFinite(Number(snapshot.daily_demand)) || Number(snapshot.daily_demand) < 0) return "店面需求不可小於 0";
  if (!MANAGER_AUTHORITY_OPTIONS.includes(snapshot.manager_authority)) return "請選擇主管狀態";
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(snapshot.output_time || "") || !timePattern.test(snapshot.closing_time || "")) return "請完整填寫出爐與關爐時間";
  if (!Array.isArray(snapshot.shifts) || !snapshot.shifts.length || snapshot.shifts.length > 10) return "班別資料數量不正確";
  if (snapshot.shifts.some((shift) => !shift.name || shift.name.length > 30 || !timePattern.test(shift.start_time || "") || !timePattern.test(shift.end_time || ""))) return "班別名稱或時間不完整";
  if (!Array.isArray(snapshot.labor_units) || !snapshot.labor_units.length || snapshot.labor_units.length > 5) return "工時試算資料數量不正確";
  if (snapshot.labor_units.some((unit) => !unit.name || unit.name.length > 30 || ![unit.month_days, unit.staff_equivalent, unit.rest_days, unit.positions].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0))) return "工時試算資料不完整";
  if (!Array.isArray(snapshot.people) || snapshot.people.length > 100) return "人員資料數量不正確";
  if (snapshot.people.some((person) => !person.name || person.name.length > 50 || person.role.length > 50 || person.note.length > 200)) return "人員顯示資料不完整或過長";
  return "";
}

export function staffingMetrics(snapshot) {
  const visible = (snapshot?.people || []).filter((person) => person.visible !== false && person.group !== "送貨");
  const active = visible.filter((person) => person.status === "在職").length;
  const leave = visible.filter((person) => person.status === "留職停薪").length;
  const target = Number(snapshot?.target_headcount || 0);
  return { active, leave, target, gap: active - target };
}
