import { isScheduleExcludedRole } from "../../scheduling/index.js";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export const EMPLOYEE_MEAL_ITEMS = Object.freeze([
  { code: "chicken_wing", name: "雞翅", unitPrice: 20 },
  { code: "chicken_leg", name: "雞腿", unitPrice: 35 },
  { code: "thigh_steak", name: "腿排", unitPrice: 40 },
  { code: "chicken_cutlet", name: "雞排", unitPrice: 65 },
  { code: "popcorn_chicken_small", name: "雞米花小份", unitPrice: 60 },
  { code: "popcorn_chicken_large", name: "雞米花大份", unitPrice: 100 },
  { code: "triangle_bone", name: "三角骨", unitPrice: 50 },
  { code: "chicken_skin", name: "雞皮", unitPrice: 20 },
  { code: "plum_sweet_potato_small", name: "甘梅地瓜小份", unitPrice: 30 },
  { code: "plum_sweet_potato_large", name: "甘梅地瓜大份", unitPrice: 50 },
  { code: "squid_ball", name: "花枝丸", unitPrice: 30 },
  { code: "chicken_nuggets", name: "麥克雞塊", unitPrice: 30 },
  { code: "rice_blood", name: "米血", unitPrice: 15 },
]);

export function createEmployeeMealRows(savedRows = []) {
  const savedByCode = new Map(savedRows.map((row) => [row.item_code, row]));
  return EMPLOYEE_MEAL_ITEMS.map((item) => {
    const saved = savedByCode.get(item.code);
    const quantity = Math.max(0, Math.floor(toNumber(saved?.quantity)));
    return {
      item_code: item.code,
      item_name: item.name,
      unit_price: item.unitPrice,
      quantity,
      subtotal: quantity * item.unitPrice,
    };
  });
}

export function normalizeEmployeeMealItems(rows = []) {
  const allowedItems = new Map(EMPLOYEE_MEAL_ITEMS.map((item) => [item.code, item]));
  return rows.flatMap((row) => {
    const item = allowedItems.get(row.item_code);
    const quantity = Math.max(0, Math.floor(toNumber(row.quantity)));
    if (!item || quantity <= 0) return [];
    return [{
      item_code: item.code,
      item_name: item.name,
      unit_price: item.unitPrice,
      quantity,
      subtotal: quantity * item.unitPrice,
    }];
  });
}

export function employeeMealTotal(rows = []) {
  return normalizeEmployeeMealItems(rows)
    .reduce((total, row) => total + row.subtotal, 0);
}

function personRole(person) {
  return person.role_name || person.role || "";
}

function personStoreCode(person) {
  return person.store_code || person.storeCode || "";
}

export function calculateScheduledHeadcount({
  staff = [],
  leavePlans = [],
  shifts = [],
  storeCode,
  storeCodes = [],
  storeName = "",
  reportDate,
}) {
  const targetStoreCodes = new Set([storeCode, ...storeCodes].filter(Boolean));
  const reportDay = Number(String(reportDate || "").slice(-2));
  const leaveStaffIds = new Set(
    leavePlans
      .filter((plan) => (plan.leave_days || []).map(Number).includes(reportDay))
      .map((plan) => String(plan.staff_id)),
  );
  const shiftByStaff = new Map(
    shifts
      .filter((shift) => shift.shift_date === reportDate)
      .map((shift) => [String(shift.staff_id), shift]),
  );

  return staff.filter((person) => {
    if (person.is_active === false || isScheduleExcludedRole({ role: personRole(person) })) return false;
    if (leaveStaffIds.has(String(person.id))) return false;
    const shift = shiftByStaff.get(String(person.id));
    const assignedStoreCode = shift?.assigned_store_code || personStoreCode(person);
    const assignedStoreName = person.store_name || person.storeName || "";
    return targetStoreCodes.has(assignedStoreCode)
      || (!assignedStoreCode && assignedStoreName === storeName);
  }).length;
}

export function normalizeWasteItems(items = []) {
  return items
    .map((item) => ({
      product_id: item.product_id || null,
      item_name: String(item.item_name || "").trim(),
      quantity: Math.round(Math.max(0, toNumber(item.quantity)) * 100) / 100,
      unit: String(item.unit || "").trim(),
      reason: String(item.reason || "").trim(),
    }))
    .filter((item) => item.item_name && item.quantity > 0);
}

export function buildOperationalDetailsPayload(form = {}, scheduledHeadcount = 0, employeeMeals = []) {
  const actualHeadcount = Math.max(0, Math.round(toNumber(
    form.actual_staff_count,
    scheduledHeadcount,
  )));
  const customerComplaintCount = Math.max(0, Math.round(toNumber(form.customer_complaint_count)));
  const equipmentIssue = Boolean(form.equipment_issue);
  const deliveryRevenue = Math.max(0, toNumber(form.delivery_revenue));
  const fullDayRevenue = Math.max(0, toNumber(form.full_day_revenue));

  if (deliveryRevenue > fullDayRevenue) {
    throw new Error("外送總營收不可高於全日總營收");
  }
  if (actualHeadcount !== scheduledHeadcount && !String(form.staffing_variance_reason || "").trim()) {
    throw new Error("實際上班人數與班表不同時，請填寫差異原因");
  }
  if (customerComplaintCount > 0 && !String(form.customer_complaint_detail || "").trim()) {
    throw new Error("有客訴件數時，請填寫客訴內容");
  }
  if (equipmentIssue && !String(form.equipment_issue_detail || "").trim()) {
    throw new Error("設備異常時，請填寫異常內容");
  }

  return {
    delivery_revenue: deliveryRevenue,
    scheduled_staff_count: Math.max(0, Math.round(toNumber(scheduledHeadcount))),
    actual_staff_count: actualHeadcount,
    staffing_variance_reason: String(form.staffing_variance_reason || "").trim(),
    customer_complaint_count: customerComplaintCount,
    customer_complaint_detail: String(form.customer_complaint_detail || "").trim(),
    equipment_issue: equipmentIssue,
    equipment_issue_detail: String(form.equipment_issue_detail || "").trim(),
    special_event: String(form.special_event || "").trim(),
    employee_meal_total: employeeMealTotal(employeeMeals),
  };
}
