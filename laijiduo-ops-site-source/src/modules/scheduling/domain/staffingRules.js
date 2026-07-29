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

export function isDeliveryStaff(person) {
  return /外送|送貨|配送/.test(String(person.role || ""));
}

export function isScheduleExcludedRole(person) {
  return ["兼職後勤", "送貨人員"].includes(String(person.role || "")) || isDeliveryStaff(person);
}

export function isEffectiveScheduleStaff(person) {
  return !isScheduleExcludedRole(person);
}

export function buildStaffingSegments(store) {
  return [
    { key: "lunchPeak", label: "午峰", start: timeToMinutes("11:00"), end: timeToMinutes("14:00"), critical: true },
    { key: "dinnerPeak", label: "晚峰", start: timeToMinutes("16:30"), end: timeToMinutes("19:00"), critical: true },
    {
      key: "closing",
      label: "打烊段",
      start: timeToMinutes(store.dinner_report_time, 19 * 60),
      end: timeToMinutes(store.close_report_time || store.close_time, 22 * 60),
      critical: false,
    },
  ].filter((segment) => segment.end > segment.start);
}

export function calculateDailyStaffing({
  dateValue,
  store,
  people,
  overrides = [],
  leaveStaffIds = [],
  storeCodes = [],
  demand = store.demand,
}) {
  const targetCodes = storeCodes.length ? storeCodes : store.sourceCodes || [store.code];
  const leaveIds = new Set(leaveStaffIds.map(String));
  const shiftByStaff = new Map(
    overrides.filter((shift) => shift.shift_date === dateValue).map((shift) => [String(shift.staff_id), shift]),
  );
  const workingPeople = people.filter((person) => {
    if (leaveIds.has(String(person.id))) return false;
    const override = shiftByStaff.get(String(person.id));
    const assignedStoreCode = override?.assigned_store_code || person.store_code || person.storeCode;
    return targetCodes.includes(assignedStoreCode);
  });
  const segmentRows = buildStaffingSegments(store).map((segment) => ({
    ...segment,
    count: workingPeople.reduce((sum, person) => {
      const override = shiftByStaff.get(String(person.id));
      const window = resolvePersonWorkWindow({ person, store, dateValue, override });
      return sum + segmentCoverageRatio(window, segment);
    }, 0),
  }));
  const criticalRows = segmentRows.filter((segment) => segment.critical);
  const effectiveCount = criticalRows.length ? Math.min(...criticalRows.map((segment) => segment.count)) : workingPeople.length;
  const partTimeMissingHours = workingPeople.filter((person) => {
    if (person.role !== "兼職人員") return false;
    return !resolvePersonWorkWindow({
      person,
      store,
      dateValue,
      override: shiftByStaff.get(String(person.id)),
    });
  }).length;
  return {
    workingPeopleCount: workingPeople.length,
    segmentRows,
    effectiveCount,
    partTimeMissingHours,
    surplus: effectiveCount - Number(demand || 0),
  };
}

export function buildHalfHourStaffingMatrix({
  dateValue,
  store,
  people,
  overrides = [],
  leaveStaffIds = [],
  demand = 0,
  storeCodes = [],
  holidayDates = [],
}) {
  const start = timeToMinutes(store.open_time, 10 * 60);
  const end = timeToMinutes(store.close_time || store.close_report_time, 23 * 60);
  const targetCodes = storeCodes.length ? storeCodes : [store.store_code || store.code].filter(Boolean);
  const overrideByStaff = new Map(
    overrides.filter((row) => row.shift_date === dateValue).map((row) => [String(row.staff_id), row]),
  );
  const leaveIds = new Set(leaveStaffIds.map(String));
  const rows = [];

  for (let slotStart = start; slotStart < end; slotStart += 30) {
    const slotEnd = Math.min(slotStart + 30, end);
    const presentPeople = people.filter((person) => {
      if (leaveIds.has(String(person.id))) return false;
      const override = overrideByStaff.get(String(person.id));
      const assignedStoreCode = override?.assigned_store_code || person.store_code || person.storeCode;
      if (!targetCodes.includes(assignedStoreCode)) return false;
      const window = resolvePersonWorkWindow({ person, dateValue, store, override, holidayDates });
      return Boolean(window) && window.start <= slotStart && window.end >= slotEnd;
    });
    const effectivePeople = presentPeople.filter((person) => !person.excludedFromStaffing);
    const isLunchPeak = slotStart < 14 * 60 && slotEnd > 11 * 60;
    const isDinnerPeak = slotStart < 19 * 60 && slotEnd > 16 * 60 + 30;
    rows.push({
      startTime: minutesToTime(slotStart),
      endTime: minutesToTime(slotEnd),
      actualCount: presentPeople.length,
      effectiveCount: effectivePeople.length,
      demand: Number(demand || 0),
      gap: Math.max(Number(demand || 0) - effectivePeople.length, 0),
      surplus: Math.max(effectivePeople.length - Number(demand || 0), 0),
      isPeak: isLunchPeak || isDinnerPeak,
      peakLabel: isLunchPeak ? "午峰" : isDinnerPeak ? "晚峰" : "",
      peopleNames: presentPeople.map((person) => person.employeeName || person.employee_name || "").filter(Boolean),
      effectivePeopleNames: effectivePeople.map((person) => person.employeeName || person.employee_name || "").filter(Boolean),
    });
  }
  return rows;
}

export function minutesToTime(value) {
  const normalized = Math.max(0, Number(value || 0));
  const hour = Math.floor(normalized / 60) % 24;
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
