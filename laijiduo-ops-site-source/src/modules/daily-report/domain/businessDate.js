export const DAILY_REPORT_CUTOFF_HOUR = 10;
export const DAILY_REPORT_TIME_ZONE = "Asia/Taipei";

function datePartsAt(date, timeZone = DAILY_REPORT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function dateTextFromUtc(date) {
  return date.toISOString().slice(0, 10);
}

export function addBusinessDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateTextFromUtc(date);
}

export function getTaipeiReportClock(date = new Date()) {
  const parts = datePartsAt(date);
  const calendarDateAsUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const calendarDate = dateTextFromUtc(calendarDateAsUtc);
  const isBeforeCutoff = parts.hour < DAILY_REPORT_CUTOFF_HOUR;
  return {
    calendarDate,
    businessDate: isBeforeCutoff ? addBusinessDays(calendarDate, -1) : calendarDate,
    hour: parts.hour,
    minute: parts.minute,
    isBeforeCutoff,
    cutoffHour: DAILY_REPORT_CUTOFF_HOUR,
    timeZone: DAILY_REPORT_TIME_ZONE,
  };
}

export function dailyReportDeadlineDate(reportDate) {
  return addBusinessDays(reportDate, 1);
}

export function overdueReportBusinessDate(clock = getTaipeiReportClock()) {
  return clock.isBeforeCutoff ? "" : addBusinessDays(clock.calendarDate, -1);
}
