import { totalRevenue } from "./dailyReport.js";

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(monthText) {
  const [year, month] = monthText.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function attainment(total, target) {
  return Number(target || 0) > 0 ? (Number(total || 0) / Number(target)) * 100 : 0;
}

export function buildStoreOperationsModel({ reports = [], referenceDate, dailyTarget = 0, monthlyTarget = 0 }) {
  const month = referenceDate.slice(0, 7);
  const yesterdayDate = addDays(referenceDate, -1);
  const reportMap = new Map(reports.map((row) => [row.report_date, row]));
  const targetPerDay = Number(dailyTarget || reports.find((row) => Number(row.target || 0) > 0)?.target || 0);
  const targetForMonth = Number(monthlyTarget || reports.find((row) => Number(row.target_monthly_revenue || 0) > 0)?.target_monthly_revenue || 0);
  const dailyRows = Array.from({ length: daysInMonth(month) }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const report = reportMap.get(date) || null;
    const total = totalRevenue(report || {});
    const future = date > referenceDate;
    const submitted = Boolean(report?.id);
    return {
      date,
      report,
      total,
      target: Number(report?.target || targetPerDay || 0),
      attainment: attainment(total, Number(report?.target || targetPerDay || 0)),
      state: future ? "future" : submitted ? "reported" : date === referenceDate ? "incomplete" : "missing",
    };
  });
  const countedRows = dailyRows.filter((row) => row.date <= referenceDate && row.state === "reported");
  const monthTotal = countedRows.reduce((sum, row) => sum + row.total, 0);
  const yesterdayReport = reportMap.get(yesterdayDate) || null;
  const yesterdayTarget = Number(yesterdayReport?.target || targetPerDay || 0);
  const yesterday = {
    date: yesterdayDate,
    report: yesterdayReport,
    total: totalRevenue(yesterdayReport || {}),
    target: yesterdayTarget,
    attainment: attainment(totalRevenue(yesterdayReport || {}), yesterdayTarget),
    state: yesterdayReport?.id ? "reported" : "missing",
  };
  const remainingDays = dailyRows.filter((row) => row.date > referenceDate).length;
  const remainingAmount = Math.max(targetForMonth - monthTotal, 0);

  return {
    month,
    dailyRows,
    yesterday,
    dailyTarget: targetPerDay,
    monthlyTarget: targetForMonth,
    monthTotal,
    monthAttainment: attainment(monthTotal, targetForMonth),
    remainingAmount,
    remainingDays,
    requiredDailyAverage: remainingDays > 0 ? remainingAmount / remainingDays : remainingAmount,
  };
}
