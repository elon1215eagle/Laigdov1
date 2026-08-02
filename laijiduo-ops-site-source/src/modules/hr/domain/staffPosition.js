export const STAFF_POSITION_OPTIONS = Object.freeze([
  "店長值班", "櫃台", "炸台", "備料", "包裝", "外送", "後勤", "送貨",
]);

export function normalizeStaffPositionSkills(rows = []) {
  return rows
    .map((row) => ({
      staff_id: String(row.staff_id || row.staffId || ""),
      position_code: String(row.position_code || row.positionCode || ""),
      is_primary: row.is_primary === true || row.isPrimary === true,
    }))
    .filter((row) => row.staff_id && STAFF_POSITION_OPTIONS.includes(row.position_code));
}

export function buildStaffPositionSkillCommand(payload = {}) {
  const staffId = String(payload.staff_id || payload.staffId || "");
  const positions = [...new Set((payload.positions || []).filter((position) => STAFF_POSITION_OPTIONS.includes(position)))];
  const primaryPosition = String(payload.primary_position || payload.primaryPosition || "");
  if (!staffId) return { valid: false, message: "請選擇人員" };
  if (!positions.length) return { valid: false, message: "請至少選擇一項工作技能" };
  if (!positions.includes(primaryPosition)) return { valid: false, message: "主要崗位必須包含在工作技能中" };
  return { valid: true, payload: { staff_id: staffId, positions, primary_position: primaryPosition } };
}
