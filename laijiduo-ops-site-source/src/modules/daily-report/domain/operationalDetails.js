import { isScheduleExcludedRole } from "../../scheduling/index.js";

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

export function buildOperationalDetailsPayload(form = {}, scheduledHeadcount = 0) {
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
  };
}
