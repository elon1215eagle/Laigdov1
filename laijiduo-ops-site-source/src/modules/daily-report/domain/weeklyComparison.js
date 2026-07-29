import { totalRevenue } from "./dailyReport.js";

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekRange(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  const start = addDays(dateText, 1 - day);
  return { start, end: addDays(start, 6) };
}

function weekdayLabel(dateText) {
  return new Intl.DateTimeFormat("zh-TW", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateText}T00:00:00Z`));
}

function growthPct(current, previous) {
  if (!previous && current > 0) return 100;
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

export function buildWeeklySameDayRows(
  reports = [],
  referenceDate,
  {
    resolveStoreCode = (report) => report.store_code || report.store_id || "",
    resolveStoreName = (report) => report.name || report.store_name || "",
  } = {},
) {
  const weekRange = getWeekRange(referenceDate);
  const currentWeekDates = Array.from(
    { length: 7 },
    (_, index) => addDays(weekRange.start, index),
  );
  const previousWeekDates = currentWeekDates.map((date) => addDays(date, -7));
  const reportMap = new Map(
    reports.map((report) => [`${resolveStoreCode(report)}:${report.report_date}`, report]),
  );
  const storeRows = Array.from(new Map(
    reports
      .filter((report) => resolveStoreCode(report))
      .map((report) => [resolveStoreCode(report), {
        storeCode: resolveStoreCode(report),
        storeName: resolveStoreName(report),
      }]),
  ).values()).sort((a, b) => a.storeCode.localeCompare(b.storeCode));

  return storeRows.flatMap((store) => currentWeekDates.map((currentDate, index) => {
    const previousDate = previousWeekDates[index];
    const current = reportMap.get(`${store.storeCode}:${currentDate}`);
    const previous = reportMap.get(`${store.storeCode}:${previousDate}`);
    const currentTotal = totalRevenue(current || {});
    const previousTotal = totalRevenue(previous || {});
    return {
      ...store,
      weekday: weekdayLabel(currentDate),
      currentDate,
      previousDate,
      current,
      previous,
      currentTotal,
      previousTotal,
      delta: currentTotal - previousTotal,
      growth: growthPct(currentTotal, previousTotal),
    };
  }));
}
