import { getTaipeiReportClock } from "../modules/daily-report/domain/businessDate.js";
import { isStoreLeadershipRole } from "../modules/hr";
import { storesSeed } from "../lib/mockData";
import { createStoreDirectory } from "../lib/storeScope";

const reportClock = getTaipeiReportClock();

const today = reportClock.businessDate;

const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;

const storeDirectory = createStoreDirectory(storesSeed);

const {
  canonicalStoreCode,
  displayStoreName,
  findStoreScopedRecord,
  resolveStoreCodeFromRef,
} = storeDirectory;

function daysInMonth(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function taskTone(value = "") {
  if (["已完成", "足夠", "正常", "已納入制度", "已填", "低"].includes(value)) return "good";
  if (["高", "人力不足", "需輔導", "重大", "超休", "連勤過長"].includes(value)) return "bad";
  if (["中", "待處理", "進行中", "待覆核", "試用觀察", "待總部覆核", "改善中", "待招募", "暫停", "暫停營業", "未填", "不足"].includes(value)) return "warn";
  return "neutral";
}

function countLeaveDays(value = "") {
  return parseLeaveDays(value).length;
}

function leaveDraftKey(month, staffId) {
  return `${month}:${staffId}`;
}

function parseLeaveDays(value = "") {
  return Array.from(
    new Set(
      String(value)
        .split(/[、,，\s]+/)
        .map((item) => {
          const match = item.match(/(\d{1,2})(?!.*\d)/);
          return match ? Number(match[1]) : null;
        })
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31),
    ),
  ).sort((a, b) => a - b);
}

function isLeaveDay(value, day) {
  return parseLeaveDays(value).includes(day);
}

function formatTime24(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function hasSixDayWorkViolation(leaveDays, monthDays) {
  return Boolean(firstSixDayWorkViolationWindow(leaveDays, monthDays));
}

function firstSixDayWorkViolationWindow(leaveDays, monthDays) {
  const leaveSet = new Set(leaveDays);
  for (let start = 1; start <= Math.max(1, monthDays.length - 6); start += 1) {
    const hasRest = Array.from({ length: 7 }, (_, index) => start + index).some((day) => leaveSet.has(day));
    if (!hasRest) return [start, start + 6];
  }
  return null;
}

function getMonthlyRestDays(role, salaryRows) {
  const salaryRow = salaryRows.find((row) => row.role === role);
  const restDays = Number(salaryRow?.monthly_rest_days || 0);
  return Number.isFinite(restDays) && restDays > 0 ? restDays : null;
}

function getSuggestedRestDays(role, salaryRows) {
  const restDays = getMonthlyRestDays(role, salaryRows);
  if (restDays) return restDays;
  if (isStoreLeadershipRole(role)) return 7;
  return null;
}

function getLeaveStatus(dateText, restDays, monthDays = []) {
  const dayCount = countLeaveDays(dateText);
  if (!dayCount) return "未填";
  if (monthDays.length && hasSixDayWorkViolation(parseLeaveDays(dateText), monthDays)) return "連勤過長";
  if (restDays && dayCount > restDays) return "超休";
  if (restDays && dayCount < restDays) return "不足";
  return "已填";
}

function Metric({ label, value, detail, tone: metricTone = "neutral" }) {
  return (
    <div className={`metric ${metricTone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

export { reportClock, today, money, storeDirectory, canonicalStoreCode, displayStoreName, findStoreScopedRecord, resolveStoreCodeFromRef, daysInMonth, taskTone, countLeaveDays, leaveDraftKey, parseLeaveDays, isLeaveDay, formatTime24, hasSixDayWorkViolation, firstSixDayWorkViolationWindow, getMonthlyRestDays, getSuggestedRestDays, getLeaveStatus, Metric };
