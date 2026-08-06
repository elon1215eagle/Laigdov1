import { totalRevenue } from "../../daily-report/index.js";

const UNREPORTED_LABEL = "尚未回報";

function defaultStoreCode(row = {}) {
  return row.store_code || row.storeCode || row.stores?.store_code || "";
}

function isOverdue(dateText, today) {
  return Boolean(dateText && today && dateText < today);
}

export function hasSubmittedOperationsReport(report) {
  return Boolean(report?.id && report?.updated_at_label !== UNREPORTED_LABEL);
}

export function buildOperationsOverview({
  reports = [],
  handovers = [],
  staffRoster = [],
  scheduleRows = [],
  hqTasks = [],
  anomalyRows = [],
  today = "",
  resolveStoreCode = defaultStoreCode,
}) {
  const reportedRows = reports.filter(hasSubmittedOperationsReport);
  const unreported = reports.filter((report) => !hasSubmittedOperationsReport(report));
  const total = reports.reduce((sum, report) => sum + totalRevenue(report), 0);
  const target = reports.reduce((sum, report) => sum + Number(report.target || 0), 0);
  const cashIssues = reports.filter((report) => Math.abs(Number(report.cash_difference || 0)) >= 500);
  const lowRevenue = reports.filter((report) => totalRevenue(report) < Number(report.target || 0) * 0.8);
  const shortageRows = scheduleRows.filter((row) => row.status === "人力不足");
  const overdueTasks = hqTasks.filter((row) => row.status !== "已完成" && isOverdue(row.due_date, today));
  const handoverIssues = handovers.filter(
    (row) => row.status === "需追蹤" || row.cash_status !== "正常" || row.cleaning_status !== "完成",
  );
  const pendingHr = hqTasks.filter(
    (row) => row.status !== "已完成" && (row.scope_type === "人資" || row.task_type === "人資異動"),
  );
  const activeStaff = staffRoster.filter((row) => row.is_active !== false);
  const managerStoreCodes = new Set(
    activeStaff
      .filter((row) => row.role === "店長" || row.role === "副店長")
      .map(resolveStoreCode)
      .filter(Boolean),
  );
  const managerGaps = reports.filter(
    (report) => report.operating_status !== "suspended" && report.is_active !== false && !managerStoreCodes.has(resolveStoreCode(report)),
  );
  const ranking = reports
    .map((report) => ({
      ...report,
      attainment: (totalRevenue(report) / Math.max(1, Number(report.target || 0))) * 100,
    }))
    .sort((a, b) => b.attainment - a.attainment);
  const riskRows = [...anomalyRows]
    .sort((a, b) => {
      const levelScore = (row) => (row.level === "重大" ? 3 : 1) + (isOverdue(row.due_date, today) ? 2 : 0);
      return levelScore(b) - levelScore(a) || String(a.due_date || "").localeCompare(String(b.due_date || ""));
    })
    .slice(0, 6);

  return {
    total,
    target,
    attainmentRate: (total / Math.max(1, target)) * 100,
    achievedRows: reports.filter((report) => totalRevenue(report) >= Number(report.target || 0)),
    reportedRows,
    reportRate: (reportedRows.length / Math.max(1, reports.length)) * 100,
    unreported,
    cashIssues,
    lowRevenue,
    shortageRows,
    overdueTasks,
    handoverIssues,
    pendingHr,
    managerGaps,
    activeStaff,
    ranking,
    riskRows,
  };
}

export function buildOperationsPriorities(summary) {
  return [
    ...summary.unreported.map((row) => ({
      id: `unreported-${row.store_id || row.id}`,
      store_id: row.store_id || row.id,
      storeName: row.name,
      type: "尚未回報",
      level: "重大",
      message: "今日營運回報尚未送出",
    })),
    ...summary.shortageRows.map((row) => ({
      id: `schedule-${row.storeCode || row.storeName}`,
      store_code: row.storeCode,
      storeName: row.storeName,
      type: "排班缺口",
      level: "提醒",
      message: row.note || "門店人力需求需確認",
    })),
    ...summary.lowRevenue.map((row) => ({
      id: `low-revenue-${row.store_id || row.id}`,
      store_id: row.store_id || row.id,
      storeName: row.name,
      type: "營收未達標",
      level: "提醒",
      attainment: (totalRevenue(row) / Math.max(1, Number(row.target || 0))) * 100,
    })),
  ];
}
