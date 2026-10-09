import { useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig } from "../../../lib/api";
import { isOperationalStoreStaff, isStoreLeadershipRole } from "../../hr";
import { STORE_RELATION_GROUPS } from "../../../lib/storeScope";
import { WUJIA_BACKOFFICE_UNIT_CODE, WUJIA_STOREFRONT_UNIT_CODE, buildHalfHourStaffingMatrix, buildPersonalScheduleSnapshot, buildScheduleExcelXml, buildScheduleExportModel, buildDailyShiftCommand, buildScheduleChangeRequest, buildStaffingSegments, buildWujiaScheduleUnits, calculateProjectedLaborCost, calculateDailyStaffing, deriveScheduleAccess, findOverlappingShift, isEffectiveScheduleStaff, isScheduleExcludedRole, isWujiaBackofficeStaff, mergeDailyShift, normalizeStoreScopedScheduleCode, projectDailyStaffShifts, personalScheduleExpiry, resolveStaffingDemand, renderScheduleCanvas, removeDailyShiftById, scheduleApprovalAllows, scheduleGroupForStore, scheduleLockStatusText, sortTemporarySupportRows, supportVisibleGroupsForTemporarySupport } from "..";
import { confirmMonthlySchedule, deleteDailyStaffShift, fetchDailyStaffShifts, fetchMonthlyLeavePlans, fetchMonthlyScheduleControl, fetchPersonalScheduleLinks, fetchStaffingDemandRules, fetchTemporarySupportSummary, reviewMonthlyScheduleChangeRequest, reviewSupportShiftRequest, issuePersonalScheduleLink, revokePersonalScheduleLink, setWorkforceRolloutMode, submitMonthlyScheduleChangeRequest, submitSupportShiftRequest, unlockMonthlySchedule, upsertDailyStaffShift, upsertMonthlyLeavePlan, upsertMonthlyLeavePlans, fetchStandardShiftTemplates, upsertStandardShiftTemplate, archiveStandardShiftTemplate, fetchLeavePlanAudit, fetchStaffingDemandChangeRequests, submitStaffingDemandChangeRequest, reviewStaffingDemandChangeRequest } from "../supabase";
import { isLeaveDay, leaveDraftKey, parseLeaveDays, canonicalStoreCode, displayStoreName, today, daysInMonth, countLeaveDays, getSuggestedRestDays, getLeaveStatus, hasSixDayWorkViolation, formatTime24, firstSixDayWorkViolationWindow, money, taskTone, findStoreScopedRecord, Metric } from "../../../components/operationalPageSupport.jsx";

function downloadExcelFile(xml, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function secureRandomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const leavePlannerStorageKey = "laijiduo-monthly-leave-planner";

function formatLeaveDays(month, days) {
  const monthNumber = Number(month.slice(5, 7));
  return days.map((day) => `${monthNumber}/${day}`).join("、");
}

function leaveDaySource(draft, day) {
  if (isLeaveDay(draft.autoDays, day)) return "auto";
  if (isLeaveDay(draft.manualDays, day)) return "manual";
  if (isLeaveDay(draft.dates, day)) return "manual";
  return "";
}

const scheduleDayStatusOptions = ["休", "例", "國", "事假", "休出", "國出", "特"];

const nonWorkingDayStatuses = new Set(["休", "例", "國", "事假", "特"]);

function scheduleDayStatus(draft = {}, day) {
  const status = draft.dayStatuses?.[day] || draft.dayStatuses?.[String(day)];
  if (scheduleDayStatusOptions.includes(status)) return status;
  return isLeaveDay(draft.dates, day) ? "休" : "";
}

const leaveTypeOptions = ["排休", "特休", "事假", "病假", "其他"];

function staffingCountText(value) {
  return Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function calculateStoreStaffingForDay(store, drafts, leaveMonth, day, dailyShifts = [], allStaff = store.staff) {
  const dateValue = `${leaveMonth}-${String(day).padStart(2, "0")}`;
  const leaveStaffIds = allStaff
    .filter((person) => isLeaveDay(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates, day))
    .map((person) => person.id);
  const result = calculateDailyStaffing({
    dateValue,
    store,
    people: allStaff,
    overrides: dailyShifts,
    leaveStaffIds,
    storeCodes: store.sourceCodes,
    demand: store.demand,
  });
  return {
    ...result,
    offCount: Math.max(store.staff.length - result.workingPeopleCount, 0),
  };
}

function buildLeavePlanPayload({ month, person, dates, manualDates, autoDates, dayStatuses = {}, leaveType = "排休", note = "" }) {
  const parsedDates = parseLeaveDays(dates);
  const parsedManualDays = manualDates === undefined ? parsedDates : parseLeaveDays(manualDates);
  const parsedAutoDays = autoDates === undefined ? [] : parseLeaveDays(autoDates);
  return {
    period_month: month,
    store_code: canonicalStoreCode(person),
    store_name: displayStoreName(person),
    staff_id: person.id,
    employee_name: person.employeeName,
    role_name: person.role,
    leave_days: parsedDates,
    manual_leave_days: parsedManualDays.filter((day) => parsedDates.includes(day)),
    auto_leave_days: parsedAutoDays.filter((day) => parsedDates.includes(day)),
    day_statuses: dayStatuses,
    leave_type: leaveType,
    note,
  };
}

function MonthlyLeavePlanner({
  allowedStoreCode = "",
  allowedStoreName = "",
  isStoreScoped = false,
  staffRoster,
  salaryRows,
  canViewSalary = false,
  storeHours,
  storeRelationGroups = STORE_RELATION_GROUPS,
  workforceViews = [],
  onNotify,
}) {
  const [leaveMonth, setLeaveMonth] = useState(today.slice(0, 7));
  const [storeFilter, setStoreFilter] = useState(allowedStoreCode || "all");
  const [wujiaUnitView, setWujiaUnitView] = useState("storefront");
  const [matrixGroupCode, setMatrixGroupCode] = useState("");
  const [matrixMode, setMatrixMode] = useState("storefront");
  const [supportDate, setSupportDate] = useState(today.slice(0, 7) === today.slice(0, 7) ? today : `${today.slice(0, 7)}-01`);
  const [syncState, setSyncState] = useState(hasSupabaseConfig ? "同步中" : "本機模式");
  const [uploadingCode, setUploadingCode] = useState("");
  const [scheduleControl, setScheduleControl] = useState({ lock: null, requests: [], supportRequests: [], missingTable: false });
  const [controlLoading, setControlLoading] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const [requestScope, setRequestScope] = useState({ type: "date", date: today, staffId: "", shiftId: "" });
  const [reviewNote, setReviewNote] = useState("");
  const [remoteSupportRows, setRemoteSupportRows] = useState(null);
  const [dailyShifts, setDailyShifts] = useState([]);
  const [staffingDemandRules, setStaffingDemandRules] = useState([]);
  const [personalLinks, setPersonalLinks] = useState([]);
  const [personalLinkStaffId, setPersonalLinkStaffId] = useState("");
  const [issuedPersonalLink, setIssuedPersonalLink] = useState("");
  const [personalLinkSaving, setPersonalLinkSaving] = useState(false);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [templateForm, setTemplateForm] = useState({ id: "", name: "", start_time: "", end_time: "" });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [leaveAuditRows, setLeaveAuditRows] = useState([]);
  const [demandRequests, setDemandRequests] = useState([]);
  const [demandRequestForm, setDemandRequestForm] = useState({
    start_time: "11:00", end_time: "14:00", required_count: 1, reason: "",
  });
  const [shiftForm, setShiftForm] = useState({
    id: "",
    shift_date: today,
    staff_id: "",
    assigned_store_code: "",
    start_time: "",
    end_time: "",
    note: "",
  });
  const [drafts, setDrafts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(leavePlannerStorageKey) || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(leavePlannerStorageKey, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    let active = true;
    async function loadLeavePlans() {
      if (!hasSupabaseConfig) return;
      setSyncState("同步中");
      try {
        const rows = await fetchMonthlyLeavePlans(leaveMonth);
        if (!active) return;
        setDrafts((current) => {
          const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${leaveMonth}:`)));
          rows.forEach((row) => {
            next[leaveDraftKey(row.period_month, row.staff_id)] = {
              dates: formatLeaveDays(row.period_month, row.leave_days || []),
              manualDays: formatLeaveDays(row.period_month, row.manual_leave_days || row.leave_days || []),
              autoDays: formatLeaveDays(row.period_month, row.auto_leave_days || []),
              dayStatuses: row.day_statuses || {},
              leaveType: row.leave_type || "排休",
              note: row.note || "",
            };
          });
          return next;
        });
        setSyncState(rows.length ? "已同步" : "尚無資料");
      } catch (error) {
        if (!active) return;
        setSyncState("同步失敗");
        onNotify?.(`排假同步失敗：${error.message}`);
      }
    }
    loadLeavePlans();
    return () => {
      active = false;
    };
  }, [leaveMonth]);

  async function loadScheduleControl() {
    if (!hasSupabaseConfig) return;
    setControlLoading(true);
    try {
      const data = await fetchMonthlyScheduleControl(leaveMonth);
      setScheduleControl(data);
    } catch (error) {
      onNotify?.(`排班確認狀態讀取失敗：${error.message}`);
    } finally {
      setControlLoading(false);
    }
  }

  useEffect(() => {
    loadScheduleControl();
  }, [leaveMonth]);

  async function refreshPersonalLinks() {
    if (!hasSupabaseConfig) return setPersonalLinks([]);
    try {
      setPersonalLinks(await fetchPersonalScheduleLinks(leaveMonth));
    } catch (error) {
      onNotify?.(`個人班表連結讀取失敗：${error.message}`);
    }
  }

  useEffect(() => {
    refreshPersonalLinks();
    setIssuedPersonalLink("");
  }, [leaveMonth]);

  async function refreshDailyShifts() {
    if (!hasSupabaseConfig) {
      try {
        setDailyShifts(JSON.parse(localStorage.getItem(`daily-staff-shifts:${leaveMonth}`) || "[]"));
      } catch {
        setDailyShifts([]);
      }
      return;
    }
    try {
      setDailyShifts(await fetchDailyStaffShifts(leaveMonth));
    } catch (error) {
      onNotify?.(`單日班次讀取失敗：${error.message}`);
    }
  }

  useEffect(() => {
    refreshDailyShifts();
  }, [leaveMonth]);

  async function refreshShiftTemplates() {
    try {
      setShiftTemplates(await fetchStandardShiftTemplates());
    } catch (error) {
      onNotify?.(`標準班次讀取失敗：${error.message}`);
    }
  }

  useEffect(() => {
    refreshShiftTemplates();
  }, []);

  async function refreshWorkforceRequests() {
    try {
      const [auditRows, requestRows] = await Promise.all([
        isStoreScoped ? Promise.resolve([]) : fetchLeavePlanAudit(leaveMonth),
        fetchStaffingDemandChangeRequests(),
      ]);
      setLeaveAuditRows(auditRows);
      setDemandRequests(requestRows);
    } catch (error) {
      onNotify?.(`排班稽核資料讀取失敗：${error.message}`);
    }
  }

  useEffect(() => {
    refreshWorkforceRequests();
  }, [leaveMonth, isStoreScoped]);

  async function submitDemandRequest(event) {
    event.preventDefault();
    const storeCode = normalizeStoreScopedScheduleCode(allowedStoreCode);
    if (!storeCode || demandRequestForm.reason.trim().length < 3) return onNotify?.("請填寫至少 3 個字的調整原因");
    try {
      await submitStaffingDemandChangeRequest({
        store_code: storeCode,
        reason: demandRequestForm.reason,
        proposed_rule: {
          rule_type: "special",
          special_date: supportDate,
          start_time: demandRequestForm.start_time,
          end_time: demandRequestForm.end_time,
          required_count: Number(demandRequestForm.required_count),
        },
      });
      setDemandRequestForm({ start_time: "11:00", end_time: "14:00", required_count: 1, reason: "" });
      await refreshWorkforceRequests();
      onNotify?.("人力需求調整申請已送出");
    } catch (error) {
      onNotify?.(`人力需求申請失敗：${error.message}`);
    }
  }

  async function reviewDemandRequest(request, status) {
    try {
      await reviewStaffingDemandChangeRequest(request.id, status, reviewNote);
      await Promise.all([refreshWorkforceRequests(), fetchStaffingDemandRules().then(setStaffingDemandRules)]);
      onNotify?.(status === "approved" ? "人力需求已核准並套用" : "人力需求申請已退回");
    } catch (error) {
      onNotify?.(`人力需求審核失敗：${error.message}`);
    }
  }

  async function saveShiftTemplate(event) {
    event.preventDefault();
    setTemplateSaving(true);
    try {
      await upsertStandardShiftTemplate(templateForm);
      setTemplateForm({ id: "", name: "", start_time: "", end_time: "" });
      await refreshShiftTemplates();
      onNotify?.("標準班次已儲存");
    } catch (error) {
      onNotify?.(`標準班次儲存失敗：${error.message}`);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function removeShiftTemplate(template) {
    if (!window.confirm(`停用標準班次「${template.name}」？`)) return;
    try {
      await archiveStandardShiftTemplate(template.id);
      await refreshShiftTemplates();
      onNotify?.("標準班次已停用");
    } catch (error) {
      onNotify?.(`標準班次停用失敗：${error.message}`);
    }
  }

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    fetchStaffingDemandRules().then(setStaffingDemandRules).catch((error) => {
      onNotify?.(`人力需求規則讀取失敗：${error.message}`);
    });
  }, []);

  useEffect(() => {
    if (!supportDate.startsWith(leaveMonth)) setSupportDate(`${leaveMonth}-01`);
  }, [leaveMonth, supportDate]);

  useEffect(() => {
    let active = true;
    async function loadTemporarySupportSummary() {
      if (!hasSupabaseConfig || !isStoreScoped) {
        setRemoteSupportRows(null);
        return;
      }
      try {
        const rows = await fetchTemporarySupportSummary(supportDate);
        if (active) setRemoteSupportRows(rows);
      } catch (error) {
        if (!active) return;
        setRemoteSupportRows(null);
        onNotify?.(`臨時支援摘要讀取失敗：${error.message}`);
      }
    }
    loadTemporarySupportSummary();
    return () => {
      active = false;
    };
  }, [isStoreScoped, supportDate]);

  const monthDays = useMemo(() => Array.from({ length: daysInMonth(`${leaveMonth}-01`) }, (_, index) => index + 1), [leaveMonth]);
  const scheduleStaff = useMemo(
    () =>
      staffRoster
        .filter(isEffectiveScheduleStaff)
        .sort((a, b) => `${displayStoreName(a)}-${a.role}-${a.employeeName}`.localeCompare(`${displayStoreName(b)}-${b.role}-${b.employeeName}`, "zh-Hant")),
    [staffRoster],
  );
  const storeOptions = useMemo(() => {
    const options = scheduleStaff.map((row) => ({
      code: canonicalStoreCode(row),
      name: displayStoreName(row),
    }));
    return options.filter((row, index, rows) => row.code && rows.findIndex((item) => item.code === row.code) === index);
  }, [scheduleStaff]);
  const storeDemandMap = useMemo(
    () => new Map(storeHours.map((row) => [canonicalStoreCode(row), Number(row.duty_staff || 0)])),
    [storeHours],
  );
  const storeHourMap = useMemo(
    () => new Map(storeHours.map((row) => [canonicalStoreCode(row), row])),
    [storeHours],
  );
  const wujiaBackofficeEnabled = workforceViews.some(
    (row) => row.store_code === "S01" && row.view_type === "backoffice" && row.is_enabled,
  );
  const effectiveStoreRelationGroups = storeRelationGroups?.length
    ? storeRelationGroups
    : STORE_RELATION_GROUPS;
  const allStoreGroups = useMemo(
    () => {
      const groups = new Map();
      storeOptions.forEach((store) => {
        const ruleGroup = scheduleGroupForStore(
          { ...store, ...(storeHourMap.get(store.code) || {}), demand: storeDemandMap.get(store.code) || 0 },
          effectiveStoreRelationGroups,
        );
        if (!groups.has(ruleGroup.code)) {
          groups.set(ruleGroup.code, {
            ...ruleGroup,
            staff: scheduleStaff.filter((person) => ruleGroup.sourceCodes.includes(canonicalStoreCode(person))),
          });
        }
      });
      return Array.from(groups.values())
        .flatMap((group) => buildWujiaScheduleUnits(group, staffRoster))
        .filter((store) => store.staff.length);
    },
    [effectiveStoreRelationGroups, scheduleStaff, staffRoster, storeDemandMap, storeHourMap, storeOptions],
  );
  const allowedGroupCode = useMemo(() => {
    if (!allowedStoreCode) return "";
    const scheduleStoreCode = isStoreScoped ? normalizeStoreScopedScheduleCode(allowedStoreCode) : allowedStoreCode;
    const selectedOption = storeOptions.find((store) => store.code === scheduleStoreCode);
    return scheduleGroupForStore(
      {
        code: scheduleStoreCode,
        name: selectedOption?.name || "",
        ...(storeHourMap.get(scheduleStoreCode) || {}),
        demand: storeDemandMap.get(scheduleStoreCode) || 0,
      },
      effectiveStoreRelationGroups,
    ).code;
  }, [allowedStoreCode, effectiveStoreRelationGroups, isStoreScoped, storeDemandMap, storeHourMap, storeOptions]);

  useEffect(() => {
    if (isStoreScoped && allowedGroupCode) setStoreFilter(allowedGroupCode);
  }, [allowedGroupCode, isStoreScoped]);

  const storeGroups = useMemo(
    () => allStoreGroups.filter((store) => {
      if (isStoreScoped) {
        if (!allowedGroupCode) return false;
        if (store.code === allowedGroupCode) return true;
        return allowedStoreCode === "S01" && store.accessGroupCode === allowedGroupCode;
      }
      return storeFilter === "all" || store.code === storeFilter || store.accessGroupCode === storeFilter;
    }),
    [allStoreGroups, allowedGroupCode, allowedStoreCode, isStoreScoped, storeFilter],
  );
  const showWujiaUnitTabs = storeGroups.some((store) => store.code === WUJIA_BACKOFFICE_UNIT_CODE)
    && (isStoreScoped || storeFilter === WUJIA_STOREFRONT_UNIT_CODE);
  const calendarStoreGroups = showWujiaUnitTabs
    ? storeGroups.filter((store) => store.code === (wujiaUnitView === "backoffice" ? WUJIA_BACKOFFICE_UNIT_CODE : WUJIA_STOREFRONT_UNIT_CODE))
    : storeGroups;
  const plannerRows = useMemo(() => storeGroups.flatMap((store) => store.staff), [storeGroups]);
  const allPlannerRows = useMemo(() => {
    const rows = allStoreGroups.flatMap((store) => store.staff);
    return rows.filter((person, index) => rows.findIndex((candidate) => String(candidate.id) === String(person.id)) === index);
  }, [allStoreGroups]);
  const supportDay = Number(supportDate.slice(8, 10));
  const supportSourceGroups = useMemo(
    () => (isStoreScoped ? supportVisibleGroupsForTemporarySupport(allStoreGroups) : allStoreGroups)
      .filter((store) => store.allowTemporarySupport !== false),
    [allStoreGroups, isStoreScoped],
  );
  const calculatedSupportRows = supportSourceGroups
    .map((store) => {
      const staffing = calculateStoreStaffingForDay(store, drafts, leaveMonth, supportDay, dailyShifts, scheduleStaff);
      return {
        ...store,
        ...staffing,
      };
    });
  const supportRows = sortTemporarySupportRows(isStoreScoped && remoteSupportRows !== null
    ? remoteSupportRows
    : calculatedSupportRows);
  const currentScheduleRequestCode = storeGroups[0]?.code || allowedGroupCode || normalizeStoreScopedScheduleCode(allowedStoreCode);
  const {
    isConfirmed: isScheduleConfirmed,
    ownRequest: ownScheduleRequest,
    storeEditApproved,
    canEdit: canEditSchedule,
  } = deriveScheduleAccess({
    isStoreScoped,
    scheduleControl,
    requestStoreCode: currentScheduleRequestCode,
  });
  const canBulkEditSchedule = !isStoreScoped || !isScheduleConfirmed;
  const editableScheduleStaff = isStoreScoped ? plannerRows : allPlannerRows;
  const selectedShiftPerson = editableScheduleStaff.find((person) => String(person.id) === String(shiftForm.staff_id));
  const visibleDailyShifts = dailyShifts.filter((shift) => (
    !isStoreScoped || plannerRows.some((person) => String(person.id) === String(shift.staff_id))
  ));
  const matrixGroups = (isStoreScoped ? storeGroups : allStoreGroups).filter((store) => !store.scheduleOnly);
  const selectedMatrixGroup = matrixGroups.find((store) => store.code === (
    isStoreScoped ? allowedGroupCode : (storeFilter !== "all" ? storeFilter : matrixGroupCode)
  )) || matrixGroups[0];
  const matrixStoreCode = selectedMatrixGroup?.sourceCodes?.[0] || selectedMatrixGroup?.code || "";
  const matrixDay = Number(supportDate.slice(8, 10));
  const matrixLeaveStaffIds = staffRoster
    .filter((person) => isLeaveDay(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates, matrixDay))
    .map((person) => person.id);
  const storefrontMatrixRows = selectedMatrixGroup && supportDate.startsWith(leaveMonth)
    ? buildHalfHourStaffingMatrix({
        dateValue: supportDate,
        store: {
          ...(storeHourMap.get(matrixStoreCode) || {}),
          code: matrixStoreCode,
          store_code: matrixStoreCode,
          open_time: storeHourMap.get(matrixStoreCode)?.open_time || "10:00",
          close_time: storeHourMap.get(matrixStoreCode)?.close_time || storeHourMap.get(matrixStoreCode)?.close_report_time || "23:00",
        },
        people: staffRoster.map((person) => ({
          ...person,
          excludedFromStaffing: isScheduleExcludedRole(person),
        })),
        overrides: dailyShifts,
        leaveStaffIds: matrixLeaveStaffIds,
        demand: selectedMatrixGroup.demand || storeDemandMap.get(matrixStoreCode) || 0,
        demandResolver: staffingDemandRules.length
          ? (time) => resolveStaffingDemand(staffingDemandRules, { storeCode: matrixStoreCode, date: supportDate, time })
          : null,
        storeCodes: selectedMatrixGroup.sourceCodes,
        matrixMode: "storefront",
      })
    : [];
  const backofficeEnabled = Boolean(
    selectedMatrixGroup?.sourceCodes?.includes("S01")
    && wujiaBackofficeEnabled,
  );
  const backofficeStore = storeHourMap.get("S01") || {};
  const backofficeMatrixRows = backofficeEnabled && supportDate.startsWith(leaveMonth)
    ? buildHalfHourStaffingMatrix({
        dateValue: supportDate,
        store: {
          ...backofficeStore,
          code: "S01",
          store_code: "S01",
          open_time: backofficeStore.open_time || "10:00",
          close_time: backofficeStore.close_time || backofficeStore.close_report_time || "23:00",
        },
        people: staffRoster,
        overrides: dailyShifts,
        leaveStaffIds: matrixLeaveStaffIds,
        demand: 0,
        storeCodes: ["S01"],
        matrixMode: "backoffice",
      })
    : [];
  const matrixRows = matrixMode === "backoffice" && backofficeEnabled ? backofficeMatrixRows : storefrontMatrixRows;
  const matrixProjectedShifts = selectedMatrixGroup && supportDate.startsWith(leaveMonth)
    ? projectDailyStaffShifts({
        dateValue: supportDate,
        store: {
          ...(storeHourMap.get(matrixStoreCode) || {}),
          open_time: storeHourMap.get(matrixStoreCode)?.open_time || "10:00",
          close_time: storeHourMap.get(matrixStoreCode)?.close_time || storeHourMap.get(matrixStoreCode)?.close_report_time || "23:00",
        },
        people: staffRoster,
        overrides: dailyShifts,
        leaveStaffIds: matrixLeaveStaffIds,
      }).filter((shift) => selectedMatrixGroup.sourceCodes.includes(shift.assignedStoreCode))
    : [];
  const matrixLaborCost = calculateProjectedLaborCost({
    projectedShifts: matrixProjectedShifts,
    people: staffRoster,
    salaryRows,
  });
  const scheduleExportModel = buildScheduleExportModel({
    periodMonth: leaveMonth,
    storeGroups,
    drafts,
    dailyShifts,
    version: scheduleControl.lock?.schedule_version || 1,
    needsReconfirmation: scheduleControl.lock?.needs_reconfirmation,
  });

  async function createPersonalScheduleLink() {
    if (!hasSupabaseConfig) return onNotify?.("個人班表連結需在開發 Supabase 驗收環境測試");
    if (!isScheduleConfirmed || scheduleControl.lock?.needs_reconfirmation) return onNotify?.("請先由總部確認最新班表版本");
    if (!personalLinkStaffId) return onNotify?.("請選擇要發行個人班表的人員");
    setPersonalLinkSaving(true);
    try {
      const snapshot = buildPersonalScheduleSnapshot(scheduleExportModel, personalLinkStaffId);
      const token = secureRandomToken();
      const tokenHash = await sha256Hex(token);
      await issuePersonalScheduleLink({
        period_month: leaveMonth,
        schedule_version: scheduleExportModel.version,
        staff_id: personalLinkStaffId,
        employee_name: snapshot.employee_name,
        home_store_code: snapshot.home_store_code,
        role_name: snapshot.role_name,
        token_hash: tokenHash,
        schedule_payload: snapshot,
        expires_at: personalScheduleExpiry(leaveMonth),
      });
      const url = `${window.location.origin}${window.location.pathname}?schedule=${encodeURIComponent(token)}`;
      setIssuedPersonalLink(url);
      await refreshPersonalLinks();
      try {
        await navigator.clipboard.writeText(url);
        onNotify?.("個人班表連結已建立並複製");
      } catch {
        onNotify?.("個人班表連結已建立，請由下方欄位複製");
      }
    } catch (error) {
      onNotify?.(`個人班表連結建立失敗：${error.message}`);
    } finally {
      setPersonalLinkSaving(false);
    }
  }

  async function revokeScheduleLink(link) {
    if (!window.confirm(`確定撤銷 ${link.employee_name} 的 V${link.schedule_version} 個人班表連結？`)) return;
    try {
      await revokePersonalScheduleLink(link.id);
      await refreshPersonalLinks();
      onNotify?.("個人班表連結已撤銷");
    } catch (error) {
      onNotify?.(`撤銷失敗：${error.message}`);
    }
  }

  const matrixGapRows = matrixRows.filter((row) => row.gap > 0);
  const matrixPeakGapRows = matrixGapRows.filter((row) => row.isPeak);
  const lockStatusText = scheduleLockStatusText({
    hasRemoteConfig: hasSupabaseConfig,
    isConfirmed: isScheduleConfirmed,
    missingTable: scheduleControl.missingTable,
  });
  const filledCount = plannerRows.filter((row) => countLeaveDays(drafts[leaveDraftKey(leaveMonth, row.id)]?.dates)).length;
  const totalLeaveDays = plannerRows.reduce((sum, row) => sum + countLeaveDays(drafts[leaveDraftKey(leaveMonth, row.id)]?.dates), 0);
  const overLimitCount = plannerRows.filter((row) => {
    const restDays = getSuggestedRestDays(row.role, salaryRows);
    return getLeaveStatus(drafts[leaveDraftKey(leaveMonth, row.id)]?.dates, restDays) === "超休";
  }).length;
  const workViolationCount = plannerRows.filter((row) => {
    const dates = drafts[leaveDraftKey(leaveMonth, row.id)]?.dates;
    return countLeaveDays(dates) > 0 && hasSixDayWorkViolation(parseLeaveDays(dates), monthDays);
  }).length;
  const scopedStoreLabel = isStoreScoped && storeGroups[0]
    ? (
        storeGroups[0].code !== allowedStoreCode
          ? `登入門店 ${allowedStoreCode} ${allowedStoreName || ""}，排假表 ${storeGroups[0].code} ${storeGroups[0].name}`
          : `${storeGroups[0].code} ${storeGroups[0].name}`
      )
    : (isStoreScoped ? allowedStoreCode || "未綁定門店" : "");

  function resetShiftForm(dateValue = shiftForm.shift_date || supportDate) {
    setShiftForm({
      id: "",
      shift_date: dateValue,
      staff_id: "",
      assigned_store_code: "",
      start_time: "",
      end_time: "",
      note: "",
    });
  }

  async function scheduleImageFile() {
    const canvas = renderScheduleCanvas(scheduleExportModel);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("班表圖片產生失敗");
    const scopeName = storeFilter === "all"
      ? "全部門店"
      : storeGroups.map((store) => store.code).join("-") || "班表";
    return new File([blob], `萊吉多-${leaveMonth}-${scopeName}-班表-V${scheduleExportModel.version}.png`, { type: "image/png" });
  }

  async function downloadScheduleImage() {
    try {
      const file = await scheduleImageFile();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onNotify?.(error.message);
    }
  }

  async function shareScheduleImage() {
    try {
      const file = await scheduleImageFile();
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `萊吉多 ${leaveMonth} 班表`, text: `班表 V${scheduleExportModel.version}`, files: [file] });
      } else {
        await downloadScheduleImage();
        onNotify?.("此裝置不支援直接分享，已下載圖片，可傳送至 LINE 群組");
      }
    } catch (error) {
      if (error.name !== "AbortError") onNotify?.(`分享失敗：${error.message}`);
    }
  }

  async function saveDailyShift(event) {
    event.preventDefault();
    const shiftScopeAllowed = !isStoreScoped || !isScheduleConfirmed || scheduleApprovalAllows(ownScheduleRequest, {
      date: shiftForm.shift_date,
      staffId: shiftForm.staff_id,
      shiftId: shiftForm.id || null,
    });
    if (!shiftScopeAllowed) {
      onNotify?.("總部已確認排班，需先取得修改核可");
      return;
    }
    const person = editableScheduleStaff.find((row) => String(row.id) === String(shiftForm.staff_id));
    const command = buildDailyShiftCommand({
      form: shiftForm,
      person,
      homeStoreCode: person ? canonicalStoreCode(person) : "",
    });
    if (!command.valid) {
      onNotify?.(command.message);
      return;
    }
    const payload = command.payload;
    const overlap = findOverlappingShift(payload, dailyShifts);
    if (overlap) {
      onNotify?.(`班次與 ${formatTime24(overlap.start_time)}–${formatTime24(overlap.end_time)} 重疊，請調整時間`);
      return;
    }
    setShiftSaving(true);
    try {
      if (isStoreScoped && payload.shift_type === "support") {
        await submitSupportShiftRequest(payload);
        resetShiftForm(payload.shift_date);
        await loadScheduleControl();
        onNotify?.("跨店支援申請已送出，總部核准後會自動寫入雙方班表");
        return;
      }
      const saved = await upsertDailyStaffShift(payload);
      setDailyShifts((current) => {
        const next = mergeDailyShift(current, saved);
        if (!hasSupabaseConfig) localStorage.setItem(`daily-staff-shifts:${leaveMonth}`, JSON.stringify(next));
        return next;
      });
      resetShiftForm(saved.shift_date);
      onNotify?.(payload.shift_type === "support" ? "跨店支援班次已儲存" : "當日班次已儲存");
    } catch (error) {
      onNotify?.(`單日班次儲存失敗：${error.message}`);
    } finally {
      setShiftSaving(false);
    }
  }

  async function removeDailyShift(shift) {
    const shiftScopeAllowed = !isStoreScoped || !isScheduleConfirmed || scheduleApprovalAllows(ownScheduleRequest, {
      date: shift.shift_date, staffId: shift.staff_id, shiftId: shift.id,
    });
    if (!shiftScopeAllowed) return onNotify?.("此班次不在總部核可的修改範圍內");
    if (!window.confirm(`刪除 ${shift.employee_name} ${shift.shift_date} ${formatTime24(shift.start_time)}–${formatTime24(shift.end_time)} 班次？`)) return;
    try {
      await deleteDailyStaffShift(shift.id);
      setDailyShifts((current) => {
        const next = removeDailyShiftById(current, shift.id);
        if (!hasSupabaseConfig) localStorage.setItem(`daily-staff-shifts:${leaveMonth}`, JSON.stringify(next));
        return next;
      });
      onNotify?.("已恢復使用人資主檔預設時間");
    } catch (error) {
      onNotify?.(`恢復預設時間失敗：${error.message}`);
    }
  }

  async function confirmSchedule() {
    try {
      await confirmMonthlySchedule(leaveMonth, "總部確認排班");
      await loadScheduleControl();
      onNotify?.(`${leaveMonth} 排班已由總部確認，門店已鎖定修改`);
    } catch (error) {
      onNotify?.(`總部確認失敗：${error.message}`);
    }
  }

  async function unlockSchedule() {
    try {
      await unlockMonthlySchedule(leaveMonth, "總部解除確認");
      await loadScheduleControl();
      onNotify?.(`${leaveMonth} 已解除確認，門店可修改`);
    } catch (error) {
      onNotify?.(`解除確認失敗：${error.message}`);
    }
  }

  async function submitChangeRequest() {
    const command = buildScheduleChangeRequest({
      periodMonth: leaveMonth,
      reason: requestReason,
      scopeType: requestScope.type,
      storeCode: currentScheduleRequestCode,
      storeName: storeGroups[0]?.name || allowedStoreName || "",
      targetDate: requestScope.date,
      targetStaffId: requestScope.staffId,
      targetShiftId: requestScope.shiftId,
    });
    if (!command.valid) {
      onNotify?.(command.message);
      return;
    }
    try {
      await submitMonthlyScheduleChangeRequest(command.payload);
      setRequestReason("");
      await loadScheduleControl();
      onNotify?.("修改申請已送出，待總部核可");
    } catch (error) {
      onNotify?.(`修改申請送出失敗：${error.message}`);
    }
  }

  async function reviewChangeRequest(request, status) {
    try {
      await reviewMonthlyScheduleChangeRequest(request.id, status, reviewNote);
      setReviewNote("");
      await loadScheduleControl();
      onNotify?.(status === "approved" ? `${request.store_name} 已開放修改` : `${request.store_name} 申請已處理`);
    } catch (error) {
      onNotify?.(`申請處理失敗：${error.message}`);
    }
  }

  async function reviewSupportRequest(request, status) {
    try {
      await reviewSupportShiftRequest(request.id, status, reviewNote);
      setReviewNote("");
      await Promise.all([loadScheduleControl(), refreshDailyShifts()]);
      onNotify?.(status === "approved" ? `${request.employee_name} 跨店支援已核准並寫入班表` : "跨店支援申請已退回");
    } catch (error) {
      onNotify?.(`跨店支援處理失敗：${error.message}`);
    }
  }

  async function changeRolloutMode(mode) {
    if (mode === "new" && !window.confirm(`確認從 ${leaveMonth} 起切換為新版人力排班模組？此動作會留下稽核紀錄。`)) return;
    try {
      await setWorkforceRolloutMode(mode, mode === "new" ? leaveMonth : null, mode === "new" ? "總部完成驗收後切換" : "維持平行驗收");
      await loadScheduleControl();
      onNotify?.(mode === "new" ? `已設定 ${leaveMonth} 起使用新版人力排班模組` : "已維持平行驗收模式");
    } catch (error) {
      onNotify?.(`安全切換失敗：${error.message}`);
    }
  }

  const updateDraft = (staffId, field, value) => {
    if (!canEditStaffSchedule(staffId)) return;
    const key = leaveDraftKey(leaveMonth, staffId);
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  };

  const saveDraft = async (person, draft) => {
    if (!canEditStaffSchedule(person?.id)) return;
    if (!person || !hasSupabaseConfig) return;
    try {
      setSyncState("儲存中");
      await upsertMonthlyLeavePlan(buildLeavePlanPayload({
        month: leaveMonth,
        person,
        dates: draft.dates || "",
        manualDates: draft.manualDays || draft.dates || "",
        autoDates: draft.autoDays || "",
        dayStatuses: draft.dayStatuses || {},
        leaveType: draft.leaveType || "排休",
        note: draft.note || "",
      }));
      setSyncState("已同步");
    } catch (error) {
      setSyncState("同步失敗");
      onNotify?.(`排假儲存失敗：${error.message}`);
    }
  };

  function canEditStaffSchedule(staffId) {
    return !isStoreScoped || !isScheduleConfirmed || scheduleApprovalAllows(ownScheduleRequest, { staffId });
  }

  const buildStoreUploadPayloads = (store, sourceDrafts = drafts) => store.staff.map((person) => {
    const draft = sourceDrafts[leaveDraftKey(leaveMonth, person.id)] || {};
    return buildLeavePlanPayload({
      month: leaveMonth,
      person,
      dates: draft.dates || "",
      manualDates: draft.manualDays || draft.dates || "",
      autoDates: draft.autoDays || "",
      dayStatuses: draft.dayStatuses || {},
      leaveType: draft.leaveType || "排休",
      note: draft.note || "",
    });
  });

  const uploadStore = async (store, sourceDrafts = drafts, successText = "") => {
    if (!canEditSchedule) {
      onNotify?.("總部已確認排班，門店需先送修改申請並核可後才能修改");
      return false;
    }
    if (!store?.staff?.length) {
      onNotify?.("此門店目前沒有可上傳的排假人員");
      return false;
    }
    if (!hasSupabaseConfig) {
      setSyncState("本機模式");
      onNotify?.(`${store.name} 排假已暫存在本機；正式上傳需連線 Supabase`);
      return true;
    }
    try {
      setUploadingCode(store.code);
      setSyncState("上傳中");
      await upsertMonthlyLeavePlans(buildStoreUploadPayloads(store, sourceDrafts));
      setSyncState("已同步");
      onNotify?.(successText || `${store.name} ${leaveMonth} 排假已上傳完成`);
      return true;
    } catch (error) {
      setSyncState("同步失敗");
      onNotify?.(`${store.name} 排假上傳失敗：${error.message}`);
      return false;
    } finally {
      setUploadingCode("");
    }
  };

  const uploadVisibleStores = async () => {
    if (!canEditSchedule) {
      onNotify?.("總部已確認排班，門店需先送修改申請並核可後才能修改");
      return false;
    }
    if (!storeGroups.length) {
      onNotify?.("目前沒有可上傳的門店排假表");
      return false;
    }
    if (storeGroups.length === 1) {
      return uploadStore(storeGroups[0], drafts, `${storeGroups[0].name} ${leaveMonth} 排假已上傳完成`);
    }
    if (!hasSupabaseConfig) {
      setSyncState("本機模式");
      onNotify?.("目前為本機模式，排假已暫存在此瀏覽器");
      return true;
    }
    try {
      setUploadingCode("all");
      setSyncState("上傳中");
      await upsertMonthlyLeavePlans(storeGroups.flatMap((store) => buildStoreUploadPayloads(store)));
      setSyncState("已同步");
      onNotify?.(`${leaveMonth} 目前顯示門店排假已全部上傳完成`);
      return true;
    } catch (error) {
      setSyncState("同步失敗");
      onNotify?.(`排假上傳失敗：${error.message}`);
      return false;
    } finally {
      setUploadingCode("");
    }
  };

  const toggleLeaveDay = (staffId, day, status = "休") => {
    if (!canEditSchedule) {
      onNotify?.("總部已確認排班，門店需先送修改申請並核可後才能修改");
      return;
    }
    const key = leaveDraftKey(leaveMonth, staffId);
    const person = staffRoster.find((row) => row.id === staffId);
    setDrafts((current) => {
      const currentDraft = current[key] || {};
      const leaveDays = parseLeaveDays(currentDraft.dates);
      const manualDays = parseLeaveDays(currentDraft.manualDays);
      const autoDays = parseLeaveDays(currentDraft.autoDays);
      const isNonWorking = nonWorkingDayStatuses.has(status);
      const nextDays = isNonWorking ? [...leaveDays.filter((item) => item !== day), day].sort((a, b) => a - b) : leaveDays.filter((item) => item !== day);
      const nextManualDays = isNonWorking ? [...manualDays.filter((item) => item !== day), day].sort((a, b) => a - b) : manualDays.filter((item) => item !== day);
      const nextAutoDays = autoDays.filter((item) => item !== day);
      const nextStatuses = { ...(currentDraft.dayStatuses || {}) };
      if (status) nextStatuses[day] = status;
      else delete nextStatuses[day];
      const nextDraft = {
        ...currentDraft,
        dates: formatLeaveDays(leaveMonth, nextDays),
        manualDays: formatLeaveDays(leaveMonth, nextManualDays),
        autoDays: formatLeaveDays(leaveMonth, nextAutoDays),
        dayStatuses: nextStatuses,
      };
      saveDraft(person, nextDraft);
      return {
        ...current,
        [key]: nextDraft,
      };
    });
  };

  const autoArrangeStore = (store) => {
    if (!canEditSchedule) {
      onNotify?.("總部已確認排班，門店需先送修改申請並核可後才能修改");
      return;
    }
    const maxOffPerDay = Math.max(store.staff.length - store.demand, 0);
    if (!maxOffPerDay) return;

    const assignments = new Map(store.staff.map((person) => [person.id, parseLeaveDays(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates)]));
    const remaining = new Map(store.staff.map((person) => [person.id, Math.max((getSuggestedRestDays(person.role, salaryRows) || 0) - (assignments.get(person.id)?.length || 0), 0)]));
    const offByDay = new Map(monthDays.map((day) => [day, 0]));
    store.staff.forEach((person) => {
      (assignments.get(person.id) || []).forEach((day) => {
        if (offByDay.has(day)) offByDay.set(day, (offByDay.get(day) || 0) + 1);
      });
    });
    const totalTargets = Array.from(remaining.values()).reduce((sum, value) => sum + value, 0);
    const maxAssignable = monthDays.reduce((sum, day) => sum + Math.max(maxOffPerDay - (offByDay.get(day) || 0), 0), 0);
    const rounds = Math.min(totalTargets, maxAssignable);

    const canAssign = (person, day) => {
      const assignedDays = assignments.get(person.id) || [];
      return !assignedDays.includes(day) && (offByDay.get(day) || 0) < maxOffPerDay;
    };

    store.staff.forEach((person) => {
      const target = getSuggestedRestDays(person.role, salaryRows) || 0;
      if (!target) return;
      const windows = [
        [1, 7],
        [8, 14],
        [15, 21],
        [22, 28],
        [29, monthDays.length],
      ].filter(([start]) => start <= monthDays.length);
      windows.forEach(([start, end]) => {
        if ((remaining.get(person.id) || 0) <= 0) return;
        const assignedDays = assignments.get(person.id) || [];
        if (assignedDays.some((day) => day >= start && day <= end)) return;
        const day = monthDays
          .filter((item) => item >= start && item <= end && canAssign(person, item))
          .sort((a, b) => (offByDay.get(a) || 0) - (offByDay.get(b) || 0) || a - b)[0];
        if (!day) return;
        assignments.set(person.id, [...assignedDays, day].sort((a, b) => a - b));
        remaining.set(person.id, (remaining.get(person.id) || 0) - 1);
        offByDay.set(day, (offByDay.get(day) || 0) + 1);
      });
    });

    let repaired = true;
    while (repaired) {
      repaired = false;
      for (const person of store.staff) {
        if ((remaining.get(person.id) || 0) <= 0) continue;
        const assignedDays = assignments.get(person.id) || [];
        const violationWindow = firstSixDayWorkViolationWindow(assignedDays, monthDays);
        if (!violationWindow) continue;
        const [start, end] = violationWindow;
        const day = monthDays
          .filter((item) => item >= start && item <= end && canAssign(person, item))
          .sort((a, b) => (offByDay.get(a) || 0) - (offByDay.get(b) || 0) || Math.abs(a - (start + 3)) - Math.abs(b - (start + 3)))[0];
        if (!day) continue;
        assignments.set(person.id, [...assignedDays, day].sort((a, b) => a - b));
        remaining.set(person.id, (remaining.get(person.id) || 0) - 1);
        offByDay.set(day, (offByDay.get(day) || 0) + 1);
        repaired = true;
      }
    }

    for (let index = 0; index < rounds; index += 1) {
      const candidates = store.staff
        .filter((person) => (remaining.get(person.id) || 0) > 0)
        .sort((a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0));
      const dayCandidates = monthDays
        .filter((day) => (offByDay.get(day) || 0) < maxOffPerDay)
        .sort((a, b) => (offByDay.get(a) || 0) - (offByDay.get(b) || 0) || a - b);
      if (!candidates.length || !dayCandidates.length) break;

      const person = candidates.find((candidate) => dayCandidates.some((day) => canAssign(candidate, day))) || candidates[0];
      const assignedDays = assignments.get(person.id) || [];
      const day = dayCandidates.find((item) => canAssign(person, item) && !assignedDays.includes(item - 1) && !assignedDays.includes(item + 1))
        || dayCandidates.find((item) => canAssign(person, item));
      if (!day) break;

      assignments.set(person.id, [...assignedDays, day].sort((a, b) => a - b));
      remaining.set(person.id, (remaining.get(person.id) || 0) - 1);
      offByDay.set(day, (offByDay.get(day) || 0) + 1);
    }

    setDrafts((current) => {
      const next = { ...current };
      store.staff.forEach((person) => {
        const key = leaveDraftKey(leaveMonth, person.id);
        const currentDraft = next[key] || {};
        const finalDays = assignments.get(person.id) || [];
        const manualDays = parseLeaveDays(currentDraft.manualDays).filter((day) => finalDays.includes(day));
        const autoDays = finalDays.filter((day) => !manualDays.includes(day));
        next[key] = {
          ...currentDraft,
          dates: formatLeaveDays(leaveMonth, finalDays),
          manualDays: formatLeaveDays(leaveMonth, manualDays),
          autoDays: formatLeaveDays(leaveMonth, autoDays),
        };
      });
      return next;
    });
    if (hasSupabaseConfig) {
      setSyncState("儲存中");
      upsertMonthlyLeavePlans(store.staff.map((person) => buildLeavePlanPayload({
        month: leaveMonth,
        person,
        dates: formatLeaveDays(leaveMonth, assignments.get(person.id) || []),
        manualDates: drafts[leaveDraftKey(leaveMonth, person.id)]?.manualDays || "",
        autoDates: formatLeaveDays(leaveMonth, (assignments.get(person.id) || []).filter((day) => !parseLeaveDays(drafts[leaveDraftKey(leaveMonth, person.id)]?.manualDays).includes(day))),
        leaveType: drafts[leaveDraftKey(leaveMonth, person.id)]?.leaveType || "排休",
        note: drafts[leaveDraftKey(leaveMonth, person.id)]?.note || "",
      })))
        .then(() => {
          setSyncState("已同步");
          onNotify?.(`${store.name} 一鍵排休已儲存`);
        })
        .catch((error) => {
          setSyncState("同步失敗");
          onNotify?.(`一鍵排休儲存失敗：${error.message}`);
        });
    }
  };

  const clearStore = (store) => {
    if (!canEditSchedule) {
      onNotify?.("總部已確認排班，門店需先送修改申請並核可後才能修改");
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      store.staff.forEach((person) => {
        const key = leaveDraftKey(leaveMonth, person.id);
        next[key] = {
          ...next[key],
          dates: "",
          manualDays: "",
          autoDays: "",
        };
      });
      return next;
    });
    if (hasSupabaseConfig) {
      setSyncState("儲存中");
      upsertMonthlyLeavePlans(store.staff.map((person) => buildLeavePlanPayload({
        month: leaveMonth,
        person,
        dates: "",
        manualDates: "",
        autoDates: "",
        leaveType: drafts[leaveDraftKey(leaveMonth, person.id)]?.leaveType || "排休",
        note: drafts[leaveDraftKey(leaveMonth, person.id)]?.note || "",
      })))
        .then(() => {
          setSyncState("已同步");
          onNotify?.(`${store.name} 排假已清空並上傳`);
        })
        .catch((error) => {
          setSyncState("同步失敗");
          onNotify?.(`清空本店儲存失敗：${error.message}`);
        });
    }
  };

  const clearMonth = () => {
    if (!canEditSchedule) return;
    if (!window.confirm(`確定清空 ${leaveMonth} 的排假填寫資料？`)) return;
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${leaveMonth}:`))),
    );
    if (hasSupabaseConfig) {
      setSyncState("儲存中");
      upsertMonthlyLeavePlans(plannerRows.map((person) => buildLeavePlanPayload({
        month: leaveMonth,
        person,
        dates: "",
        manualDates: "",
        autoDates: "",
        leaveType: "排休",
        note: "",
      })))
        .then(() => {
          setSyncState("已同步");
          onNotify?.(`${leaveMonth} 排假已清空並上傳`);
        })
        .catch((error) => {
          setSyncState("同步失敗");
          onNotify?.(`清空本月儲存失敗：${error.message}`);
        });
    }
  };

  const leaveCalendarView = (
    <div className="store-leave-stack">
      {!storeGroups.length && (
        <section className="panel empty-module">
          <div className="panel-head">
            <div>
              <h2>尚未找到可排假門店</h2>
              <p>目前帳號未對應到門店代碼，請由總部確認 profiles 的 store_id 或 store_code 是否已連到正確門店。</p>
            </div>
          </div>
        </section>
      )}
      {calendarStoreGroups.map((store) => (
        <StoreLeaveCalendar
          dailyShifts={dailyShifts}
          drafts={drafts}
          key={store.code}
          leaveMonth={leaveMonth}
          monthDays={monthDays}
          salaryRows={salaryRows}
          saveDraft={saveDraft}
          scheduleStaff={scheduleStaff}
          store={store}
          autoArrangeStore={autoArrangeStore}
          clearStore={clearStore}
          isUploading={uploadingCode === store.code}
          toggleLeaveDay={toggleLeaveDay}
          updateDraft={updateDraft}
          uploadStore={uploadStore}
          canEditSchedule={canEditSchedule}
          canEditStaffSchedule={canEditStaffSchedule}
          canBulkEditSchedule={canBulkEditSchedule}
        />
      ))}
    </div>
  );

  return (
    <>
      <section className="panel wide support-panel schedule-support-panel">
        <label>
          臨時支援日期
          <input type="date" value={supportDate} min={`${leaveMonth}-01`} max={`${leaveMonth}-${String(monthDays.length).padStart(2, "0")}`} onChange={(event) => setSupportDate(event.target.value)} />
        </label>
        <div className="support-list">
          {supportRows.map((store) => (
            <div className={`support-card ${store.surplus < 0 ? "bad" : store.surplus > 0 ? "good" : ""}`} key={store.code}>
              <strong>{store.code} {store.name}</strong>
              <span>有效 {staffingCountText(store.effectiveCount)} / 需求 {store.demand}</span>
              <span>{store.segmentRows.map((segment) => `${segment.label} ${staffingCountText(segment.count)}`).join(" · ")}</span>
              {store.partTimeMissingHours > 0 && <span className="warn-text">兼職 {store.partTimeMissingHours} 人未填工時</span>}
              <em>{store.surplus > 0 ? `可支援 ${staffingCountText(store.surplus)} 人` : store.surplus < 0 ? `缺 ${staffingCountText(Math.abs(store.surplus))} 人` : "剛好滿編"}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="panel wide leave-planner">
      <div className="panel-head">
        <div>
          <h2>每月各店排假表</h2>
          <p>依門店分表排假；最多連續工作 6 天，先點預定休假，再由一鍵排休補足月休與人力需求。</p>
        </div>
        <div className="panel-actions leave-planner-actions">
          <button className="primary" type="button" onClick={uploadVisibleStores} disabled={!canBulkEditSchedule || !storeGroups.length || uploadingCode === "all"}>
            {uploadingCode === "all" ? "上傳中..." : "上傳目前排假"}
          </button>
          <button type="button" onClick={() => downloadExcelFile(buildScheduleExcelXml(scheduleExportModel), `萊吉多${leaveMonth}排假表.xls`)}>
            匯出排假
          </button>
          <button type="button" onClick={downloadScheduleImage}>下載圖片</button>
          {!isStoreScoped && <button className="muted-clear-action" type="button" onClick={clearMonth} disabled={!canBulkEditSchedule}>清空本月</button>}
        </div>
      </div>

      <section className="personal-link-panel">
        <div>
          <strong>個人班表連結</strong>
        </div>
        <div className="personal-link-actions">
          <label>
            人員
            <select value={personalLinkStaffId} onChange={(event) => setPersonalLinkStaffId(event.target.value)}>
              <option value="">請選擇人員</option>
              {plannerRows.map((person) => <option key={person.id} value={person.id}>{canonicalStoreCode(person)} {person.employeeName}</option>)}
            </select>
          </label>
          <button className="primary" type="button" onClick={createPersonalScheduleLink} disabled={personalLinkSaving || !isScheduleConfirmed || scheduleControl.lock?.needs_reconfirmation}>
            {personalLinkSaving ? "建立中..." : "建立連結"}
          </button>
        </div>
        {issuedPersonalLink && <label className="issued-personal-link">剛建立的網址<input readOnly value={issuedPersonalLink} onFocus={(event) => event.target.select()} /></label>}
        {personalLinks.length > 0 && (
          <div className="table-wrap compact">
            <table>
              <thead><tr><th>人員</th><th>門店</th><th>版本</th><th>有效期限</th><th>狀態</th><th>操作</th></tr></thead>
              <tbody>{personalLinks.map((link) => {
                const expired = new Date(link.expires_at).getTime() <= Date.now();
                const status = link.revoked_at ? "已撤銷" : expired ? "已失效" : link.schedule_version < scheduleExportModel.version ? "已有新版" : "有效";
                return <tr key={link.id}>
                  <td>{link.employee_name}</td><td>{link.home_store_code}</td><td>V{link.schedule_version}</td>
                  <td>{new Date(link.expires_at).toLocaleString("zh-TW")}</td><td>{status}</td>
                  <td><button type="button" disabled={Boolean(link.revoked_at)} onClick={() => revokeScheduleLink(link)}>撤銷</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`schedule-control-panel ${isScheduleConfirmed ? "locked" : ""}`}>
        <div>
          <span>排班確認狀態</span>
          <strong>{lockStatusText}</strong>
          {scheduleControl.lock?.confirmed_at && <p>確認時間：{new Date(scheduleControl.lock.confirmed_at).toLocaleString("zh-TW")}</p>}
          {scheduleControl.lock?.needs_reconfirmation && <p className="warn-text">班表已有核准異動，請總部重新確認最新版本。</p>}
          {scheduleControl.missingTable && <p>請先執行 Supabase migration，才會正式啟用跨裝置鎖版。</p>}
        </div>
        {!isStoreScoped ? (
          <div className="schedule-control-actions">
            <button className="primary" type="button" onClick={confirmSchedule} disabled={controlLoading || scheduleControl.missingTable}>
              {isScheduleConfirmed ? "再次確認並鎖定" : "總部確認排班"}
            </button>
            <button type="button" onClick={unlockSchedule} disabled={controlLoading || scheduleControl.missingTable}>解除確認</button>
          </div>
        ) : isScheduleConfirmed && !storeEditApproved ? (
          <div className="schedule-request-box">
            <div className="schedule-request-fields">
              <label>
                修改範圍
                <select value={requestScope.type} onChange={(event) => setRequestScope({ type: event.target.value, date: supportDate, staffId: "", shiftId: "" })}>
                  <option value="date">指定日期</option>
                  <option value="staff">指定人員</option>
                  <option value="shift">指定班次</option>
                </select>
              </label>
              {requestScope.type === "date" && (
                <label>日期<input type="date" value={requestScope.date} onChange={(event) => setRequestScope({ ...requestScope, date: event.target.value })} /></label>
              )}
              {requestScope.type === "staff" && (
                <label>人員<select value={requestScope.staffId} onChange={(event) => setRequestScope({ ...requestScope, staffId: event.target.value })}>
                  <option value="">請選擇</option>
                  {plannerRows.map((person) => <option key={person.id} value={person.id}>{person.employeeName}</option>)}
                </select></label>
              )}
              {requestScope.type === "shift" && (
                <label>班次<select value={requestScope.shiftId} onChange={(event) => setRequestScope({ ...requestScope, shiftId: event.target.value })}>
                  <option value="">請選擇</option>
                  {visibleDailyShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.shift_date} {shift.employee_name} {formatTime24(shift.start_time)}–{formatTime24(shift.end_time)}</option>)}</select></label>
              )}
            </div>
            <textarea
              value={requestReason}
              onChange={(event) => setRequestReason(event.target.value)}
              placeholder="請說明需修改排班的原因，例如：臨時請假、人力異動、總部支援調整。"
            />
            <button className="primary" type="button" onClick={submitChangeRequest} disabled={controlLoading || scheduleControl.missingTable}>
              送出修改申請
            </button>
            {ownScheduleRequest && <small>目前申請狀態：{ownScheduleRequest.status === "pending" ? "待總部核可" : ownScheduleRequest.status === "rejected" ? "已退回" : ownScheduleRequest.status}</small>}
          </div>
        ) : isScheduleConfirmed && storeEditApproved ? (
          <div className="schedule-approved-box">
            <strong>總部已核可本店修改</strong>
            <p>限核可範圍使用一次，最晚 24 小時內完成；修改後會自動重新鎖定。</p>
          </div>
        ) : null}
      </section>

      {!isStoreScoped && scheduleControl.requests.length > 0 && (
        <section className="schedule-request-review">
          <div className="panel-head compact-head">
            <div>
              <h3>門店修改申請</h3>
              <p>核可後，該店可在已確認月份中自行修改；總部完成覆核後可再次確認鎖定。</p>
            </div>
          </div>
          <label>
            總部備註
            <input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="可填寫核可或退回原因" />
          </label>
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr><th>門店</th><th>狀態</th><th>原因</th><th>時間</th><th>操作</th></tr>
              </thead>
              <tbody>
                {scheduleControl.requests.map((request) => (
                  <tr key={request.id}>
                    <td><strong>{request.store_name}</strong><span>{request.store_code}</span></td>
                    <td><span className={`chip ${request.status === "approved" ? "good" : request.status === "pending" ? "warn" : ""}`}>{request.status}</span></td>
                    <td>{request.reason || "-"}<small>{request.scope_type === "date" ? `日期 ${request.target_date}` : request.scope_type === "staff" ? `人員 ${request.target_staff_id}` : `班次 ${request.target_shift_id}`}</small></td>
                    <td>{new Date(request.updated_at || request.created_at).toLocaleString("zh-TW")}</td>
                    <td>
                      <div className="inline-actions">
                        <button
                          type="button"
                          onClick={() => reviewChangeRequest(request, "approved")}
                          disabled={request.status === "approved" || request.status === "closed"}
                        >
                          核可
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewChangeRequest(request, "rejected")}
                          disabled={request.status === "closed"}
                        >
                          退回
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewChangeRequest(request, "closed")}
                          disabled={request.status === "closed"}
                        >
                          關閉
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {scheduleControl.supportRequests?.length > 0 && (
        <section className="schedule-request-review">
          <div className="panel-head compact-head">
            <div>
              <h3>跨店支援申請</h3>
              <p>門店只能提出申請；總部核准後，系統才會把班次正式寫入原店與支援店。</p>
            </div>
          </div>
          <div className="table-wrap compact">
            <table>
              <thead><tr><th>日期</th><th>人員</th><th>支援流向</th><th>時間</th><th>原因</th><th>狀態</th>{!isStoreScoped && <th>操作</th>}</tr></thead>
              <tbody>
                {scheduleControl.supportRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.shift_date}</td>
                    <td>{request.employee_name}</td>
                    <td>{request.home_store_code} → {request.assigned_store_code}</td>
                    <td>{formatTime24(request.start_time)}–{formatTime24(request.end_time)}</td>
                    <td>{request.note || "-"}</td>
                    <td><span className={`chip ${request.status === "approved" ? "good" : request.status === "pending" ? "warn" : ""}`}>{request.status === "pending" ? "待總部核准" : request.status === "approved" ? "已核准" : request.status === "rejected" ? "已退回" : "已取消"}</span></td>
                    {!isStoreScoped && <td><div className="inline-actions">
                      <button type="button" disabled={request.status !== "pending"} onClick={() => reviewSupportRequest(request, "approved")}>核准支援</button>
                      <button type="button" disabled={request.status !== "pending"} onClick={() => reviewSupportRequest(request, "rejected")}>退回</button>
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="leave-toolbar">
        <label>
          排假月份
          <input type="month" value={leaveMonth} onChange={(event) => setLeaveMonth(event.target.value)} />
        </label>
        {isStoreScoped ? (
          <label>
            門店
            <div className="readonly-field">{scopedStoreLabel}</div>
          </label>
        ) : (
          <label>
            門店
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="all">全部門店</option>
              {allStoreGroups.filter((row) => !row.accessGroupCode).map((row) => (
                <option value={row.code} key={row.code}>{row.code} {row.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="leave-summary">
          <span><strong>{plannerRows.length}</strong> 人需確認</span>
          <span><strong>{filledCount}</strong> 人已填</span>
          <span><strong>{plannerRows.length - filledCount}</strong> 人未填</span>
          <span><strong>{totalLeaveDays}</strong> 天排休</span>
          <span className={overLimitCount ? "negative" : ""}><strong>{overLimitCount}</strong> 人超休</span>
          <span className={workViolationCount ? "negative" : ""}><strong>{workViolationCount}</strong> 連勤提醒</span>
          <span><strong>{syncState}</strong></span>
        </div>
      </div>

      {showWujiaUnitTabs && (
        <div className="segments schedule-unit-tabs" role="tablist" aria-label="五甲排班單位">
          <button
            className={wujiaUnitView === "storefront" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={wujiaUnitView === "storefront"}
            onClick={() => setWujiaUnitView("storefront")}
          >
            五甲門市（含南華人員）
          </button>
          <button
            className={wujiaUnitView === "backoffice" ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={wujiaUnitView === "backoffice"}
            onClick={() => setWujiaUnitView("backoffice")}
          >
            五甲後勤
          </button>
        </div>
      )}

      {leaveCalendarView}

      {false && (
      <>
      <details className="daily-shift-editor collapsible-form">
        <summary className="collapsible-form-summary">
          <div>
            <h3>人力需求調整</h3>
          </div>
          <span className="collapsible-form-action">展開</span>
        </summary>
        <p className="collapsible-form-description">{isStoreScoped ? "門店提出指定日期與時段的人力需求，總部核准後才會正式套用。" : "審核門店提出的人力需求；核准後自動寫入人力矩陣規則。"}</p>
        {isStoreScoped ? (
          <form className="daily-shift-form" onSubmit={submitDemandRequest}>
            <label>適用日期<input type="date" value={supportDate} onChange={(event) => setSupportDate(event.target.value)} /></label>
            <label>開始時間<input type="time" step="1800" value={demandRequestForm.start_time} onChange={(event) => setDemandRequestForm({ ...demandRequestForm, start_time: event.target.value })} /></label>
            <label>結束時間<input type="time" step="1800" value={demandRequestForm.end_time} onChange={(event) => setDemandRequestForm({ ...demandRequestForm, end_time: event.target.value })} /></label>
            <label>需求人數<input type="number" min="0" step="1" value={demandRequestForm.required_count} onChange={(event) => setDemandRequestForm({ ...demandRequestForm, required_count: event.target.value })} /></label>
            <label>調整原因<input value={demandRequestForm.reason} onChange={(event) => setDemandRequestForm({ ...demandRequestForm, reason: event.target.value })} placeholder="例如：活動訂單增加" /></label>
            <div className="staff-admin-actions"><button className="primary" type="submit">送出調整申請</button></div>
          </form>
        ) : demandRequests.length > 0 ? (
          <div className="table-wrap compact"><table>
            <thead><tr><th>門店</th><th>日期／時段</th><th>需求</th><th>原因</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>{demandRequests.map((request) => {
              const rule = request.proposed_rule || {};
              return <tr key={request.id}>
                <td>{request.store_code}</td>
                <td>{rule.special_date || "-"}<small>{rule.start_time}–{rule.end_time}</small></td>
                <td>{rule.required_count} 人</td><td>{request.reason}</td><td>{request.status}</td>
                <td><div className="inline-actions"><button type="button" disabled={request.status !== "pending"} onClick={() => reviewDemandRequest(request, "approved")}>核准</button><button type="button" disabled={request.status !== "pending"} onClick={() => reviewDemandRequest(request, "rejected")}>退回</button></div></td>
              </tr>;
            })}</tbody>
          </table></div>
        ) : <p className="form-help">目前沒有待處理的人力需求申請。</p>}
      </details>

      {!isStoreScoped && leaveAuditRows.length > 0 && (
        <details className="daily-shift-editor collapsible-form">
          <summary className="collapsible-form-summary">
            <div>
              <h3>排假異動紀錄</h3>
              <p>共 {leaveAuditRows.length} 筆，保留修改前後內容、原因、操作者與時間，供總部追溯。</p>
            </div>
            <span className="collapsible-form-action">展開</span>
          </summary>
          <div className="table-wrap compact"><table>
            <thead><tr><th>時間</th><th>門店</th><th>人員</th><th>動作</th><th>原因</th><th>休假日變更</th></tr></thead>
            <tbody>{leaveAuditRows.map((row) => <tr key={row.id}>
              <td>{new Date(row.changed_at).toLocaleString("zh-TW")}</td><td>{row.store_code}</td>
              <td>{row.after_data?.employee_name || row.before_data?.employee_name || row.staff_id}</td>
              <td>{row.action === "insert" ? "新增" : row.action === "delete" ? "刪除" : "修改"}</td>
              <td>{row.reason}</td>
              <td>{(row.before_data?.leave_days || []).join("、") || "-"} → {(row.after_data?.leave_days || []).join("、") || "-"}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      )}

      <details className="daily-shift-editor collapsible-form">
        <summary className="collapsible-form-summary">
          <div>
            <h3>單日多段班次調整</h3>
          </div>
          <span className="collapsible-form-action">展開</span>
        </summary>
        <p className="collapsible-form-description">同一天可新增多段班次，時間不可重疊；兼職未設定時自動使用人資主檔平日／假日時間。</p>
        <form className="daily-shift-form" onSubmit={saveDailyShift}>
          <label>
            標準班次
            <select value="" onChange={(event) => {
              const template = shiftTemplates.find((row) => row.id === event.target.value);
              if (template) setShiftForm({ ...shiftForm, start_time: formatTime24(template.start_time), end_time: formatTime24(template.end_time) });
            }}>
              <option value="">自訂班次</option>
              {shiftTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} {formatTime24(template.start_time)}–{formatTime24(template.end_time)}</option>)}
            </select>
          </label>
          <label>
            日期
            <input
              type="date"
              min={`${leaveMonth}-01`}
              max={`${leaveMonth}-${String(monthDays.length).padStart(2, "0")}`}
              value={shiftForm.shift_date}
              onChange={(event) => setShiftForm({ ...shiftForm, shift_date: event.target.value })}
            />
          </label>
          <label>
            排班人員
            <select
              value={shiftForm.staff_id}
              onChange={(event) => {
                const person = editableScheduleStaff.find((row) => String(row.id) === event.target.value);
                setShiftForm({
                  ...shiftForm,
                  staff_id: event.target.value,
                  assigned_store_code: canonicalStoreCode(person),
                });
              }}
            >
              <option value="">請選擇</option>
              {editableScheduleStaff.map((person) => (
                <option key={person.id} value={person.id}>{canonicalStoreCode(person)} {person.employeeName}</option>
              ))}
            </select>
          </label>
          <label>
            實際工作門店
            <select
              value={shiftForm.assigned_store_code}
              disabled={isWujiaBackofficeStaff(selectedShiftPerson)}
              onChange={(event) => setShiftForm({ ...shiftForm, assigned_store_code: event.target.value })}
            >
              <option value="">依原門店</option>
              {(isWujiaBackofficeStaff(selectedShiftPerson)
                ? storeOptions.filter((store) => store.code === "S01")
                : storeOptions
              ).map((store) => <option value={store.code} key={store.code}>{store.code} {store.name}</option>)}
            </select>
            {isWujiaBackofficeStaff(selectedShiftPerson) && <small>五甲後勤僅能安排在五甲，不開放跨店支援。</small>}
          </label>
          <label>
            上班
            <input type="time" lang="en-GB" step="900" value={shiftForm.start_time} onChange={(event) => setShiftForm({ ...shiftForm, start_time: formatTime24(event.target.value) })} />
          </label>
          <label>
            下班
            <input type="time" lang="en-GB" step="900" value={shiftForm.end_time} onChange={(event) => setShiftForm({ ...shiftForm, end_time: formatTime24(event.target.value) })} />
          </label>
          <label>
            原因／備註
            <input value={shiftForm.note} onChange={(event) => setShiftForm({ ...shiftForm, note: event.target.value })} placeholder="例：鼎山支援、延長一小時" />
          </label>
          <div className="staff-admin-actions">
            <button className="primary" type="submit" disabled={!canEditSchedule || shiftSaving}>{shiftSaving ? "儲存中" : "儲存當日班次"}</button>
            <button type="button" onClick={() => resetShiftForm(supportDate)}>清除輸入</button>
          </div>
        </form>
        {visibleDailyShifts.length > 0 && (
          <div className="table-wrap compact">
            <table>
              <thead><tr><th>日期</th><th>人員</th><th>工作門店</th><th>時間</th><th>類型</th><th>備註</th><th>操作</th></tr></thead>
              <tbody>
                {visibleDailyShifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>{shift.shift_date}</td>
                    <td>{shift.employee_name}</td>
                    <td>{shift.assigned_store_code}</td>
                    <td>{formatTime24(shift.start_time)}–{formatTime24(shift.end_time)}</td>
                    <td><span className={`chip ${shift.shift_type === "support" ? "warn" : "good"}`}>{shift.shift_type === "support" ? "跨店支援" : "當日調整"}</span></td>
                    <td>{shift.note || "-"}</td>
                    <td><button type="button" disabled={!canEditSchedule} onClick={() => removeDailyShift(shift)}>刪除此段</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {!isStoreScoped && (
        <details className="daily-shift-editor collapsible-form">
          <summary className="collapsible-form-summary"><div><h3>標準班次模板</h3><p>總部維護常用班次；門店套用後仍可依當日需要調整為 15 分鐘單位。</p></div><span className="collapsible-form-action">展開</span></summary>
          <form className="daily-shift-form" onSubmit={saveShiftTemplate}>
            <label>班次名稱<input value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} placeholder="例如：早班" /></label>
            <label>開始時間<input type="time" lang="en-GB" step="900" value={templateForm.start_time} onChange={(event) => setTemplateForm({ ...templateForm, start_time: formatTime24(event.target.value) })} /></label>
            <label>結束時間<input type="time" lang="en-GB" step="900" value={templateForm.end_time} onChange={(event) => setTemplateForm({ ...templateForm, end_time: formatTime24(event.target.value) })} /></label>
            <div className="staff-admin-actions"><button className="primary" type="submit" disabled={templateSaving}>{templateSaving ? "儲存中" : "儲存模板"}</button></div>
          </form>
          {shiftTemplates.length > 0 && <div className="table-wrap compact"><table><thead><tr><th>名稱</th><th>時間</th><th>操作</th></tr></thead><tbody>{shiftTemplates.map((template) => <tr key={template.id}><td>{template.name}</td><td>{formatTime24(template.start_time)}–{formatTime24(template.end_time)}</td><td><div className="inline-actions"><button type="button" onClick={() => setTemplateForm({ id: template.id, name: template.name, start_time: formatTime24(template.start_time), end_time: formatTime24(template.end_time) })}>編輯</button><button type="button" onClick={() => removeShiftTemplate(template)}>停用</button></div></td></tr>)}</tbody></table></div>}
        </details>
      )}

      {selectedMatrixGroup && (
        <details className="staffing-matrix collapsible-form">
          <summary className="collapsible-form-summary">
            <div>
              <h3>{matrixMode === "backoffice" && backofficeEnabled ? "五甲後勤人力矩陣" : `${selectedMatrixGroup.name}門店人力矩陣`}</h3>
            </div>
            <span className="collapsible-form-action">展開</span>
          </summary>
          <p className="collapsible-form-description">{supportDate}，{matrixMode === "backoffice" && backofficeEnabled ? "每 30 分鐘顯示五甲後勤實際在班配置。" : "每 30 分鐘核對門店營運人員、需求與缺口；不含後勤及配送人員。"}</p>
          <div className="panel-head">
            <div className="matrix-summary">
              {backofficeEnabled && <div className="segments compact matrix-mode-switch"><button type="button" className={matrixMode === "storefront" ? "active" : ""} onClick={() => setMatrixMode("storefront")}>門店營運人力</button><button type="button" className={matrixMode === "backoffice" ? "active" : ""} onClick={() => setMatrixMode("backoffice")}>五甲後勤人力</button></div>}
              {!isStoreScoped && storeFilter === "all" && (
                <label>
                  查看門店
                  <select value={selectedMatrixGroup.code} onChange={(event) => setMatrixGroupCode(event.target.value)}>
                    {matrixGroups.map((group) => <option key={group.code} value={group.code}>{group.code} {group.name}</option>)}
                  </select>
                </label>
              )}
              {matrixMode === "storefront" && <span className={matrixPeakGapRows.length ? "negative" : "positive"}><strong>{matrixPeakGapRows.length}</strong> 個尖峰缺口</span>}
              {matrixMode === "storefront" && <span><strong>{matrixGapRows.length}</strong> 個全日缺口</span>}
              {matrixMode === "backoffice" && <span><strong>{Math.max(0, ...matrixRows.map((row) => row.actualCount))}</strong> 人最高同時在班</span>}
              {matrixMode === "storefront" && canViewSalary && <span><strong>{matrixLaborCost.totalHours.toFixed(1)}</strong> 預估工時</span>}
              {matrixMode === "storefront" && canViewSalary && <span><strong>{money(Math.round(matrixLaborCost.estimatedCost))}</strong> 排班預估</span>}
              {matrixMode === "storefront" && canViewSalary && matrixLaborCost.missingCostStaffCount > 0 && <span className="warn-text"><strong>{matrixLaborCost.missingCostStaffCount}</strong> 人成本待補</span>}
            </div>
          </div>
          <div className="table-wrap staffing-matrix-wrap">
            {matrixMode === "backoffice" && backofficeEnabled ? <table className="backoffice-matrix-table">
              <thead><tr><th>時段</th><th>後勤在班</th><th>後勤在班名單</th></tr></thead>
              <tbody>
                {matrixRows.map((row) => <tr key={row.startTime}><td><strong>{row.startTime}–{row.endTime}</strong></td><td>{row.actualCount}</td><td className="matrix-name-list">{row.peopleNames.join("、") || "無人在班"}</td></tr>)}
                {!matrixRows.length && <tr><td colSpan="3">目前沒有五甲後勤班次，請確認人資主檔與當日班表。</td></tr>}
              </tbody>
            </table> : <table>
              <thead>
                <tr>
                  <th>時段</th>
                  <th>餐期</th>
                  <th>實際在班</th>
                  <th>有效人力</th>
                  <th>需求人力</th>
                  <th>缺口</th>
                  <th>在班名單</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr className={`${row.isPeak ? "peak-row" : ""} ${row.gap > 0 ? "gap-row" : ""}`} key={row.startTime}>
                    <td><strong>{row.startTime}–{row.endTime}</strong></td>
                    <td>{row.peakLabel || "離峰"}</td>
                    <td>{row.actualCount}</td>
                    <td>{row.effectiveCount}</td>
                    <td>{row.demand}</td>
                    <td className={row.gap > 0 ? "negative" : "positive"}>{row.gap > 0 ? `缺 ${row.gap}` : row.surplus > 0 ? `多 ${row.surplus}` : "足額"}</td>
                    <td className="matrix-name-list">{row.peopleNames.join("、") || "無人在班"}</td>
                  </tr>
                ))}
                {!matrixRows.length && <tr><td colSpan="7">目前無法建立時段人力矩陣，請確認營業時間與人員主檔。</td></tr>}
              </tbody>
            </table>}
          </div>
        </details>
      )}
      </>
      )}

      </section>
    </>
  );
}

function StoreLeaveCalendar({ autoArrangeStore, canBulkEditSchedule, canEditSchedule, canEditStaffSchedule, clearStore, dailyShifts, drafts, isUploading, leaveMonth, monthDays, salaryRows, saveDraft, scheduleStaff, store, toggleLeaveDay, updateDraft, uploadStore }) {
  const [leaveActionTarget, setLeaveActionTarget] = useState(null);
  const totalLeaveDays = store.staff.reduce((sum, person) => sum + countLeaveDays(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates), 0);
  const maxOffPerDay = Math.max(store.staff.length - store.demand, 0);

  const applyLeaveAction = (action) => {
    if (!leaveActionTarget) return;
    const { person, day } = leaveActionTarget;
    toggleLeaveDay(person.id, day, action === "clear" ? "" : action);
    setLeaveActionTarget(null);
  };

  return (
    <div className="store-leave-card">
      <div className="store-leave-head">
        <div>
          <h3><span className="code-chip">{store.code}</span> {store.name}</h3>
          {store.scheduleOnly
            ? <p>{store.staff.length} 人列入後勤排班，本月已排休 {totalLeaveDays} 天。{store.ruleNote}</p>
            : <p>{store.staff.length} 人計入排班，門店每日需求 {store.demand} 人，每日最多可排休 {maxOffPerDay} 人，本月已排休 {totalLeaveDays} 天。{store.ruleNote}</p>}
        </div>
        <div className="panel-actions store-leave-actions">
          <button className="primary" type="button" onClick={() => uploadStore(store)} disabled={!canBulkEditSchedule || isUploading}>
            {isUploading ? "上傳中..." : store.scheduleOnly ? "上傳本單位排假" : "上傳本店排假"}
          </button>
          {!store.scheduleOnly && <button type="button" onClick={() => autoArrangeStore(store)} disabled={!canBulkEditSchedule || !maxOffPerDay}>一鍵平均排休</button>}
          <button className="muted-clear-action" type="button" onClick={() => clearStore(store)} disabled={!canBulkEditSchedule}>{store.scheduleOnly ? "清空本單位" : "清空本店"}</button>
        </div>
      </div>
      {!canEditSchedule && (
        <p className="leave-calendar-lock-note">本月班表已由總部確認。門店如需調整，請先在上方送出修改申請，核可後即可點選休假日期。</p>
      )}
      <div className="table-wrap leave-calendar-wrap">
        <table className="leave-calendar-table">
          <thead>
            <tr>
              <th className="leave-staff-col">人員</th>
              {monthDays.map((day) => {
                const date = new Date(`${leaveMonth}-${String(day).padStart(2, "0")}T00:00:00`);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return <th className={isWeekend ? "weekend" : ""} key={day}>{day}</th>;
              })}
              <th>計</th>
              <th>月休</th>
              <th>假別</th>
              <th>狀態</th>
              <th className="leave-note-col">備註</th>
            </tr>
          </thead>
          <tbody>
            {store.staff.map((person) => {
              const key = leaveDraftKey(leaveMonth, person.id);
              const draft = drafts[key] || {};
              const restDays = getSuggestedRestDays(person.role, salaryRows);
              const leaveDays = countLeaveDays(draft.dates);
              const status = getLeaveStatus(draft.dates, restDays, monthDays);
              const canEditPerson = canEditStaffSchedule(person.id);
              return (
                <tr key={person.id}>
                  <th className="leave-staff-col">
                    <strong>{person.employeeName}</strong>
                    <span>{person.role}</span>
                    {(person.weekday_start_time || person.work_start_time || person.weekday_end_time || person.work_end_time) && (
                      <span>
                        {person.employment_type === "兼職" ? "平 " : "預設 "}
                        {formatTime24(person.weekday_start_time || person.work_start_time) || "未填"}–{formatTime24(person.weekday_end_time || person.work_end_time) || "未填"}
                        {person.employment_type === "兼職" && (
                          <> / 假 {formatTime24(person.holiday_start_time || person.weekday_start_time || person.work_start_time) || "未填"}–{formatTime24(person.holiday_end_time || person.weekday_end_time || person.work_end_time) || "未填"}</>
                        )}
                      </span>
                    )}
                  </th>
                  {monthDays.map((day) => {
                    const dayStatus = scheduleDayStatus(draft, day);
                    const checked = Boolean(dayStatus);
                    const source = nonWorkingDayStatuses.has(dayStatus) ? leaveDaySource(draft, day) : "working";
                    return (
                      <td className="leave-day-cell" key={day}>
                        <button
                          aria-label={`${person.employeeName} ${day}日${checked ? "取消休假" : "排休"}`}
                          className={checked ? `leave-dot on ${source}` : "leave-dot"}
                          type="button"
                          disabled={!canEditPerson}
                          onClick={() => setLeaveActionTarget({ person, day, checked })}
                        >
                          {dayStatus}
                        </button>
                      </td>
                    );
                  })}
                  <td className="leave-total">{leaveDays}</td>
                  <td>{restDays || "-"}</td>
                  <td>
                    <select
                      className="leave-type-select"
                      value={draft.leaveType || "排休"}
                      disabled={!canEditPerson}
                      onChange={(event) => {
                        const nextDraft = { ...draft, leaveType: event.target.value };
                        updateDraft(person.id, "leaveType", event.target.value);
                        saveDraft(person, nextDraft);
                      }}
                    >
                      {leaveTypeOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  </td>
                  <td><span className={`chip ${taskTone(status)}`}>{status}</span></td>
                  <td>
                    <input
                      className="table-input leave-note-input"
                      value={draft.note || ""}
                      disabled={!canEditPerson}
                      onChange={(event) => updateDraft(person.id, "note", event.target.value)}
                      onBlur={(event) => saveDraft(person, { ...draft, note: event.target.value })}
                      placeholder="代班、禁休"
                    />
                  </td>
                </tr>
              );
            })}
            {!store.scheduleOnly && (
              <StoreLeaveSummaryRows
                dailyShifts={dailyShifts}
                drafts={drafts}
                leaveMonth={leaveMonth}
                monthDays={monthDays}
                scheduleStaff={scheduleStaff}
                store={store}
              />
            )}
          </tbody>
        </table>
      </div>
      {leaveActionTarget && (
        <div className="leave-action-backdrop" role="presentation" onClick={() => setLeaveActionTarget(null)}>
          <section
            aria-labelledby={`leave-action-title-${store.code}`}
            aria-modal="true"
            className="leave-action-sheet"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="leave-action-heading">
              <div>
                <small>{store.code} {store.name}</small>
                <h4 id={`leave-action-title-${store.code}`}>{leaveActionTarget.person.employeeName}｜{Number(leaveMonth.slice(5))}月{leaveActionTarget.day}日</h4>
              </div>
              <button aria-label="關閉排休操作" className="leave-action-close" type="button" onClick={() => setLeaveActionTarget(null)}>×</button>
            </div>
            <p>紅字為未出勤；藍字為假日出勤並計入有效人力。</p>
            <div className="leave-action-options">
              {scheduleDayStatusOptions.map((status) => (
                <button className={nonWorkingDayStatuses.has(status) ? "leave-action-rest" : "leave-action-work"} type="button" key={status} onClick={() => applyLeaveAction(status)}>{status}</button>
              ))}
              <button type="button" onClick={() => applyLeaveAction("clear")}>清除<span>恢復未設定</span></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StoreLeaveSummaryRows({ dailyShifts, drafts, leaveMonth, monthDays, scheduleStaff, store }) {
  const dailyRows = monthDays.map((day) => {
    const staffing = calculateStoreStaffingForDay(store, drafts, leaveMonth, day, dailyShifts, scheduleStaff);
    return {
      day,
      ...staffing,
    };
  });
  const segmentTemplates = buildStaffingSegments(store);

  return (
    <>
      <tr className="leave-summary-row staff-count">
        <th className="leave-staff-col">實際上班</th>
        {dailyRows.map((row) => <td key={row.day}>{row.workingPeopleCount}</td>)}
        <td>{dailyRows.reduce((sum, row) => sum + row.offCount, 0)}</td>
        <td colSpan="4" />
      </tr>
      {segmentTemplates.map((segment) => (
        <tr className="leave-summary-row staff-count" key={segment.key}>
          <th className="leave-staff-col">{segment.label}人力</th>
          {dailyRows.map((row) => {
            const segmentRow = row.segmentRows.find((item) => item.key === segment.key);
            return <td key={row.day}>{staffingCountText(segmentRow?.count || 0)}</td>;
          })}
          <td />
          <td colSpan="4" />
        </tr>
      ))}
      <tr className="leave-summary-row staff-count">
        <th className="leave-staff-col">有效人力</th>
        {dailyRows.map((row) => <td key={row.day}>{staffingCountText(row.effectiveCount)}</td>)}
        <td />
        <td colSpan="4" />
      </tr>
      <tr className="leave-summary-row demand-count">
        <th className="leave-staff-col">店面需求</th>
        {dailyRows.map((row) => <td key={row.day}>{store.demand}</td>)}
        <td />
        <td colSpan="4" />
      </tr>
      <tr className="leave-summary-row surplus-count">
        <th className="leave-staff-col">缺口小計</th>
        {dailyRows.map((row) => (
          <td className={row.surplus < 0 ? "negative" : row.surplus > 0 ? "positive" : ""} key={row.day}>{staffingCountText(row.surplus)}</td>
        ))}
        <td />
        <td colSpan="4" />
      </tr>
    </>
  );
}

function ScheduleModule({
  currentRole,
  scheduleRows,
  selectedReport,
  selectedStoreId,
  storeHours,
  staffRoster,
  salaryRows,
  stores,
  profile,
  storeRelationGroups,
  workforceViews,
  onNotify,
  canViewSalary,
}) {
  const operationalStaffRoster = useMemo(() => staffRoster.filter(isOperationalStoreStaff), [staffRoster]);
  const isStoreScoped = currentRole === "store_manager";
  const selectedStoreRecord = isStoreScoped
    ? (
        findStoreScopedRecord(stores, profile?.store_id) ||
        findStoreScopedRecord(stores, profile?.store_code) ||
        findStoreScopedRecord(stores, selectedStoreId) ||
        selectedReport
      )
    : null;
  const selectedStoreCode = isStoreScoped
    ? (
        normalizeStoreScopedScheduleCode(canonicalStoreCode(selectedStoreRecord)) ||
        normalizeStoreScopedScheduleCode(canonicalStoreCode(selectedReport))
      )
      : "";

  const selectedStoreName = isStoreScoped
    ? (
        selectedStoreCode === "S05"
          ? "前鎮隆興店"
          : displayStoreName(selectedStoreRecord || selectedReport)
      )
    : "";
  const scopedScheduleRows = isStoreScoped
    ? (selectedStoreCode ? scheduleRows.filter((row) => canonicalStoreCode(row) === selectedStoreCode) : [])
    : scheduleRows;
  const scopedStaffRoster = isStoreScoped
    ? (selectedStoreCode ? operationalStaffRoster.filter((row) => canonicalStoreCode(row) === selectedStoreCode) : [])
    : operationalStaffRoster;
  const uniqueStatusStores = (status) => Array.from(new Map(
    scopedScheduleRows
      .filter((row) => row.status === status)
      .map((row) => [canonicalStoreCode(row) || row.storeName, row]),
  ).values());
  const shortageStores = uniqueStatusStores("人力不足");
  const closedStores = uniqueStatusStores("暫停營業");
  const managerCount = new Set(
    scopedStaffRoster
      .filter((row) => isStoreLeadershipRole(row.role))
      .map((row) => row.storeName),
  ).size;
  return (
    <div className="workspace module-grid">
      <section className="kpi-strip schedule-kpi-strip schedule-status-strip">
        <Metric label="有主管門店" value={`${managerCount} 店`} detail="委任店經理亦列入計算" />
        <Metric label="暫停營業門店" value={`${closedStores.length} 店`} detail={closedStores[0]?.storeName || "目前無暫停門店"} tone={closedStores.length ? "warn" : "good"} />
        <Metric label="尖峰缺員門店" value={`${shortageStores.length} 店`} detail={shortageStores[0]?.storeName || "目前無缺員"} tone={shortageStores.length ? "bad" : "good"} />
      </section>

      <MonthlyLeavePlanner
        allowedStoreCode={selectedStoreCode}
        allowedStoreName={selectedStoreName}
        isStoreScoped={isStoreScoped}
        staffRoster={operationalStaffRoster}
        salaryRows={salaryRows}
        canViewSalary={canViewSalary}
        storeHours={storeHours}
        storeRelationGroups={storeRelationGroups}
        workforceViews={workforceViews}
        onNotify={onNotify}
      />

    </div>
  );
}

export { downloadExcelFile, secureRandomToken, sha256Hex, leavePlannerStorageKey, formatLeaveDays, leaveDaySource, scheduleDayStatusOptions, nonWorkingDayStatuses, scheduleDayStatus, leaveTypeOptions, staffingCountText, calculateStoreStaffingForDay, buildLeavePlanPayload, MonthlyLeavePlanner, StoreLeaveCalendar, StoreLeaveSummaryRows, ScheduleModule };
