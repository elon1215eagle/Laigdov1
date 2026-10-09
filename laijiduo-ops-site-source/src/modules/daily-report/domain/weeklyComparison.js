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

export function buildStoreWeeklyComparisonRows(reports = [], referenceDate) {
  const currentRows = buildWeeklySameDayRows(reports, referenceDate)
    .filter((row) => Boolean(row.current));
  if (currentRows.length) {
    return currentRows.map((row) => ({ ...row, comparisonPeriod: "current" }));
  }

  const latestReportDate = reports
    .map((report) => report.report_date)
    .filter((date) => date && date <= referenceDate)
    .sort()
    .at(-1);
  if (!latestReportDate) return [];

  return buildWeeklySameDayRows(reports, latestReportDate)
    .filter((row) => Boolean(row.current))
    .map((row) => ({ ...row, comparisonPeriod: "latest" }));
}

export function buildWeeklyStoreGroups(rows = []) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = row.storeCode || row.storeName;
    if (!groups.has(key)) {
      groups.set(key, {
        storeCode: row.storeCode,
        storeName: row.storeName,
        rows: [],
        currentTotal: 0,
        previousTotal: 0,
        currentCount: 0,
        previousCount: 0,
      });
    }
    const group = groups.get(key);
    group.rows.push(row);
    if (row.current) {
      group.currentTotal += row.currentTotal;
      group.currentCount += 1;
    }
    if (row.previous) {
      group.previousTotal += row.previousTotal;
      group.previousCount += 1;
    }
  });

  return Array.from(groups.values()).map((group) => {
    const delta = group.currentTotal - group.previousTotal;
    return {
      ...group,
      delta,
      growth: growthPct(group.currentTotal, group.previousTotal),
      comparisonReady: group.currentCount > 0 && group.previousCount > 0,
    };
  });
}
