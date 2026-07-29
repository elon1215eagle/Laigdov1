export function normalizeTime24(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeToMinutes(value, fallback = 0) {
  const normalized = normalizeTime24(value);
  if (!normalized) return fallback;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

export function isWeekendDate(dateValue) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue}T12:00:00+08:00`);
  return [0, 6].includes(date.getDay());
}

export function validateTimeWindow(startTime, endTime) {
  const start = normalizeTime24(startTime);
  const end = normalizeTime24(endTime);
  if (!start && !end) return { valid: true, start: "", end: "" };
  if (!start || !end) return { valid: false, start, end, message: "上班與下班時間需同時填寫" };
  if (timeToMinutes(end) <= timeToMinutes(start)) {
    return { valid: false, start, end, message: "下班時間需晚於上班時間" };
  }
  return { valid: true, start, end };
}

export function getPartTimeDefaultWindow(person, dateValue, holidayDates = []) {
  const isHoliday = isWeekendDate(dateValue) || holidayDates.includes(dateValue);
  const weekdayStart = person.weekday_start_time || person.weekdayStartTime || person.work_start_time || person.workStartTime;
  const weekdayEnd = person.weekday_end_time || person.weekdayEndTime || person.work_end_time || person.workEndTime;
  const holidayStart = person.holiday_start_time || person.holidayStartTime || weekdayStart;
  const holidayEnd = person.holiday_end_time || person.holidayEndTime || weekdayEnd;
  const start = normalizeTime24(isHoliday ? holidayStart : weekdayStart);
  const end = normalizeTime24(isHoliday ? holidayEnd : weekdayEnd);
  const validation = validateTimeWindow(start, end);
  if (!validation.valid || !start || !end) return null;
  return {
    start: timeToMinutes(start),
    end: timeToMinutes(end),
    startTime: start,
    endTime: end,
    source: isHoliday ? "假日預設" : "平日預設",
  };
}

export function resolvePersonWorkWindow({
  person,
  dateValue,
  store,
  override = null,
  holidayDates = [],
}) {
  if (override) {
    const validation = validateTimeWindow(override.start_time, override.end_time);
    if (!validation.valid || !validation.start || !validation.end) return null;
    return {
      start: timeToMinutes(validation.start),
      end: timeToMinutes(validation.end),
      startTime: validation.start,
      endTime: validation.end,
      source: override.shift_type === "support" ? "跨店支援" : "當日調整",
    };
  }
  if (person.role === "兼職人員") return getPartTimeDefaultWindow(person, dateValue, holidayDates);
  return {
    start: timeToMinutes(store.open_time, 0),
    end: timeToMinutes(store.close_time, 24 * 60),
    startTime: normalizeTime24(store.open_time),
    endTime: normalizeTime24(store.close_time),
    source: "門店營業時間",
  };
}

export function segmentCoverageRatio(window, segment) {
  if (!window || segment.end <= segment.start) return 0;
  const overlap = Math.max(0, Math.min(window.end, segment.end) - Math.max(window.start, segment.start));
  return overlap / (segment.end - segment.start);
}

