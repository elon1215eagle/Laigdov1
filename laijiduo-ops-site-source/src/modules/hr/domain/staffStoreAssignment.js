function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function normalizeStaffStoreAssignment(row = {}) {
  return {
    ...row,
    id: row.id || "",
    staff_id: String(row.staff_id || row.staffId || ""),
    store_code: String(row.store_code || row.storeCode || ""),
    effective_from: normalizeDate(row.effective_from || row.effectiveFrom),
    effective_to: normalizeDate(row.effective_to || row.effectiveTo) || null,
    reason: String(row.reason || "").trim(),
    created_by: row.created_by || row.createdBy || null,
  };
}

export function buildStaffStoreTransfer(payload = {}) {
  const assignment = normalizeStaffStoreAssignment(payload);
  if (!assignment.staff_id) return { valid: false, message: "請選擇人員" };
  if (!assignment.store_code) return { valid: false, message: "請選擇新歸屬門店" };
  if (!assignment.effective_from) return { valid: false, message: "請輸入調店生效日" };
  if (assignment.effective_to && assignment.effective_to < assignment.effective_from) {
    return { valid: false, message: "歸屬結束日不可早於生效日" };
  }
  if (assignment.reason.length < 2) return { valid: false, message: "請填寫調店原因" };
  return { valid: true, payload: assignment };
}

export function assignmentContainsDate(assignment, targetDate) {
  const row = normalizeStaffStoreAssignment(assignment);
  const date = normalizeDate(targetDate);
  return Boolean(date && row.effective_from && row.effective_from <= date && (!row.effective_to || row.effective_to >= date));
}

export function resolveStaffStoreAtDate(staff, assignments = [], targetDate = "") {
  const staffId = String(staff?.id || staff?.staff_id || "");
  const match = assignments
    .map(normalizeStaffStoreAssignment)
    .filter((row) => row.staff_id === staffId && assignmentContainsDate(row, targetDate))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  return match?.store_code || staff?.store_code || staff?.storeCode || "";
}

export function hasAssignmentOverlap(candidate, assignments = []) {
  const next = normalizeStaffStoreAssignment(candidate);
  const nextEnd = next.effective_to || "9999-12-31";
  return assignments.map(normalizeStaffStoreAssignment).some((row) => (
    row.staff_id === next.staff_id
    && row.id !== next.id
    && row.effective_from <= nextEnd
    && (row.effective_to || "9999-12-31") >= next.effective_from
  ));
}
