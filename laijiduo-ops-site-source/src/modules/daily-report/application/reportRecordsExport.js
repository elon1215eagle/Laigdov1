const HEADERS = [
  "日期",
  "門店代碼",
  "門店",
  "14:00營收",
  "19:00營收",
  "打烊營收",
  "全日總營收",
  "外送營收",
  "員工餐",
  "班表人數",
  "實際人數",
  "人力差異原因",
  "客訴件數",
  "客訴內容",
  "設備異常",
  "設備異常內容",
  "特殊事件",
  "現金差異",
  "店長備註",
  "狀態",
];

const STATUS_LABELS = {
  approved: "已確認",
  submitted: "已送出",
  needs_revision: "待修正",
  draft: "草稿",
  canceled: "已取消",
};

const storeCollator = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });
const DIRECT_STORE_ORDER = ["S01", "S02", "S03", "S04", "S05", "S09", "S08", "S07", "S10", "S11", "S06"];

function storeRank(storeCode) {
  const index = DIRECT_STORE_ORDER.indexOf(String(storeCode || "").toUpperCase());
  return index === -1 ? DIRECT_STORE_ORDER.length : index;
}

function compareStore(left, right) {
  const rankCompare = storeRank(left.store_code) - storeRank(right.store_code);
  if (rankCompare) return rankCompare;
  const leftStore = left.store_code || left.name || "";
  const rightStore = right.store_code || right.name || "";
  return storeCollator.compare(leftStore, rightStore);
}

export function sortStoresForReportExport(stores = []) {
  return [...stores].sort(compareStore);
}

export function sortReportRecordsForExport(rows = [], sortMode = "store_date_asc") {
  return [...rows].sort((left, right) => {
    const dateCompare = String(left.report_date || "").localeCompare(String(right.report_date || ""));
    if (sortMode === "date_asc") return dateCompare || compareStore(left, right);
    const storeCompare = compareStore(left, right);
    if (storeCompare) return storeCompare;
    return dateCompare;
  });
}

function dateRange(dateFrom, dateTo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom || "") || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo || "") || dateFrom > dateTo) return [];
  const dates = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function reportMatchesStore(report, store) {
  const reportKeys = [report.store_id, report.store_code].filter(Boolean).map(String);
  const storeKeys = [store.id, store.store_id, store.store_code].filter(Boolean).map(String);
  return reportKeys.some((key) => storeKeys.includes(key));
}

export function completeReportRecordsForExport({ rows = [], stores = [], dateFrom, dateTo } = {}) {
  const dates = dateRange(dateFrom, dateTo);
  if (!dates.length) return [];

  return stores.flatMap((store) => dates.map((reportDate) => {
    const existing = rows.find((report) => (
      report.report_date === reportDate && reportMatchesStore(report, store)
    ));
    if (existing) return existing;
    return {
      missing_report: true,
      report_date: reportDate,
      store_id: store.id || store.store_id || "",
      store_code: store.store_code || "",
      name: store.name || "",
      status: "unreported",
    };
  }));
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function totalRevenue(report) {
  return amount(report.opened_to_1400_revenue)
    + amount(report.revenue_1400_to_1900)
    + amount(report.revenue_1900_to_close);
}

export function buildReportRecordsCsv(rows = []) {
  const dataRows = rows.map((report) => {
    const blank = report.missing_report ? "" : null;
    return [
      report.report_date,
      report.store_code,
      report.name,
      blank ?? amount(report.opened_to_1400_revenue),
      blank ?? amount(report.revenue_1400_to_1900),
      blank ?? amount(report.revenue_1900_to_close),
      blank ?? totalRevenue(report),
      blank ?? amount(report.delivery_revenue),
      blank ?? amount(report.employee_meal_total),
      blank ?? amount(report.scheduled_staff_count),
      blank ?? amount(report.actual_staff_count),
      report.staffing_variance_reason,
      blank ?? amount(report.customer_complaint_count),
      report.customer_complaint_detail,
      report.missing_report ? "" : report.equipment_issue ? "是" : "否",
      report.equipment_issue_detail,
      report.special_event,
      report.cash_difference ?? "",
      report.manager_note,
      report.missing_report ? "未回報" : STATUS_LABELS[report.status] || report.status || "未設定",
    ];
  });

  return [HEADERS, ...dataRows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

export function reportRecordsFilename({ dateFrom, dateTo, storeName = "全部門店" }) {
  const safeStoreName = String(storeName || "全部門店").replace(/[\\/:*?"<>|]/g, "-");
  return `萊吉多門店回報-${dateFrom}-${dateTo}-${safeStoreName}.csv`;
}
