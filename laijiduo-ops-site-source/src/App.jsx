import { useEffect, useMemo, useState } from "react";
import {
  defaultSecuritySettings,
  deleteDailyReport,
  deleteDailyReports,
  fetchDailyReports,
  fetchDailyReportChangeRequests,
  fetchDailyReportsRange,
  fetchHandovers,
  fetchHqDashboardData,
  fetchHqTasks,
  fetchInventoryCounts,
  fetchPreviousInventoryCounts,
  fetchProducts,
  fetchSecuritySettings,
  fetchStaffPerformance,
  fetchStaffPositionSkills,
  fetchStaffStoreAssignments,
  fetchStoreRelationGroups,
  fetchStoreStaff,
  fetchStores,
  getSessionProfile,
  hasSupabaseConfig,
  reviewReport,
  reviewDailyReportChangeRequest,
  recordStaffStoreTransfer,
  saveDailyOperations,
  saveStaffPositionSkills,
  signIn,
  signOut,
  statusLabel,
  updateStoreMonthlyTarget,
  upsertHandover,
  upsertHqTask,
  upsertSecuritySettings,
  upsertStaffPerformance,
  upsertStoreStaffMember,
  deleteStoreStaffMember,
} from "./lib/api";
import {
  STORE_MANAGER_REVENUE_LOOKBACK_DAYS,
  buildDailyReportPayload,
  buildWeeklySameDayRows as buildWeeklyComparisonRows,
  deriveRevenueBreakdown,
  isStoreManagerRevenueDateAllowed,
  totalRevenue,
} from "./modules/daily-report";
import { StoreReportPage } from "./modules/daily-report/components";
import {
  buildOperationsOverview,
  buildOperationsPriorities,
  hasSubmittedOperationsReport as hasSubmittedReport,
} from "./modules/dashboard";
import {
  PRODUCT_ORDER,
  blankInventoryProduct,
  buildInventorySaveRows,
  defaultUnitForProduct,
  displayUnitForProduct,
  mergeInventoryRows,
  productKind,
  toManagementQuantity,
  usageCount,
} from "./modules/inventory";
import {
  IncomingEditor,
  InventoryEditor,
  formatInventoryAmount,
} from "./modules/inventory/components";
import {
  MODULE_GROUPS,
  ROLE_LABELS,
  appViewForRole,
  canAccessModule,
  canEditMonthlyTargets,
  canExportRole,
  canManageDailyReportData,
  canConfirmDailyReports,
  canManageSecurity,
  defaultModuleForRole,
  modulesForRole,
  profileRole,
  visibleViewModesForRole,
} from "./modules/access";
import {
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  STAFF_ROLE_OPTIONS,
  STAFF_POSITION_OPTIONS,
  WORK_CATEGORY_OPTIONS,
  buildStaffProfile,
  createStaffForm,
  staffMemberToForm,
} from "./modules/hr";
import {
  handoverSeed,
  hrChangeSeed,
  hqTaskSeed,
  hqSystemSeed,
  performanceSeed,
  productsSeed,
  salaryStructureSeed,
  scheduleSeed,
  staffRosterSeed,
  storeHoursSeed,
  storesSeed,
} from "./lib/mockData";
import {
  STORE_RELATION_GROUPS,
  createStoreDirectory,
  mergeStoreRelationGroups,
  normalizeStoreName,
} from "./lib/storeScope";
import {
  buildHalfHourStaffingMatrix,
  buildPersonalScheduleSnapshot,
  buildPrintableScheduleHtml,
  buildScheduleExportModel,
  buildDailyShiftCommand,
  buildScheduleChangeRequest,
  buildStaffingSegments,
  calculateProjectedLaborCost,
  calculateDailyStaffing,
  deriveScheduleAccess,
  findOverlappingShift,
  isEffectiveScheduleStaff,
  isScheduleExcludedRole,
  mergeDailyShift,
  normalizeStoreScopedScheduleCode,
  projectDailyStaffShifts,
  personalScheduleExpiry,
  resolveStaffingDemand,
  renderScheduleStoreCanvas,
  removeDailyShiftById,
  scheduleApprovalAllows,
  scheduleGroupForStore,
  scheduleLockStatusText,
  supportVisibleGroupsForTemporarySupport,
  validateTimeWindow,
} from "./modules/scheduling";
import {
  confirmMonthlySchedule,
  deleteDailyStaffShift,
  fetchDailyStaffShifts,
  fetchMonthlyLeavePlans,
  fetchMonthlyScheduleControl,
  fetchPersonalScheduleByToken,
  fetchPersonalScheduleLinks,
  fetchStaffingDemandRules,
  fetchTemporarySupportSummary,
  reviewMonthlyScheduleChangeRequest,
  reviewSupportShiftRequest,
  issuePersonalScheduleLink,
  revokePersonalScheduleLink,
  setWorkforceRolloutMode,
  submitMonthlyScheduleChangeRequest,
  submitSupportShiftRequest,
  unlockMonthlySchedule,
  upsertDailyStaffShift,
  upsertMonthlyLeavePlan,
  upsertMonthlyLeavePlans,
  fetchStandardShiftTemplates,
  upsertStandardShiftTemplate,
  archiveStandardShiftTemplate,
} from "./modules/scheduling/supabase";
import { InspectionApp } from "./InspectionApp";

const taipeiDateTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
}).formatToParts(new Date());

function getPart(parts, type) {
  return Number(parts.find((part) => part.type === type)?.value || 0);
}

function formatDateFromUtc(date) {
  return date.toISOString().slice(0, 10);
}

function getTaipeiBusinessDate(parts = taipeiDateTimeParts) {
  const year = getPart(parts, "year");
  const month = getPart(parts, "month");
  const day = getPart(parts, "day");
  const hour = getPart(parts, "hour");
  const taipeiDateAsUtc = Date.UTC(year, month - 1, day);
  const businessDate = hour < 6 ? new Date(taipeiDateAsUtc - 86400000) : new Date(taipeiDateAsUtc);
  return formatDateFromUtc(businessDate);
}

const today = getTaipeiBusinessDate();
const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
const numberText = (value, digits = 2) => Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: digits });
const pct = (value) => `${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;
const storeDirectory = createStoreDirectory(storesSeed);
const {
  canonicalStoreCode,
  displayStoreName,
  findStoreScopedRecord,
  resolveStoreCodeFromRef,
} = storeDirectory;

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

function getMonthRange(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function daysInMonth(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function getFourWeekRanges(dateText) {
  const current = getWeekRange(dateText);
  return [3, 2, 1, 0].map((offset) => {
    const start = addDays(current.start, -7 * offset);
    return { start, end: addDays(start, 6), label: `${start} 至 ${addDays(start, 6)}` };
  });
}

function tone(status) {
  if (status === "approved") return "good";
  if (status === "submitted") return "warn";
  return "bad";
}

function isBlankNumber(value) {
  return value === "" || value === null || value === undefined;
}

function numericInputValue(value) {
  return isBlankNumber(value) ? "" : value;
}

function numericValue(value) {
  return isBlankNumber(value) ? 0 : Number(value);
}

function normalizeReport(store, report) {
  const monthlyTarget = report?.target_monthly_revenue ?? store.target_monthly_revenue ?? 0;
  const dailyTarget = monthlyTarget ? Math.round(Number(monthlyTarget) / daysInMonth(today)) : store.target || store.target_daily_revenue || 65000;
  return {
    ...store,
    ...report,
    store_id: report?.store_id || store.id,
    report_date: report?.report_date || today,
    opened_to_1400_revenue: report?.opened_to_1400_revenue ?? store.opened_to_1400_revenue ?? 0,
    revenue_1400_to_1900: report?.revenue_1400_to_1900 ?? store.revenue_1400_to_1900 ?? 0,
    revenue_1900_to_close: report?.revenue_1900_to_close ?? store.revenue_1900_to_close ?? 0,
    status: report?.status || store.status || "draft",
    cash_difference: report?.cash_difference ?? store.cash_difference ?? null,
    target: dailyTarget,
    target_monthly_revenue: monthlyTarget,
    manager_name: store.manager_name || "店長",
    inventory_status: store.inventory_status || "正常",
    updated_at_label: store.updated_at_label || "尚未回報",
  };
}

export function App() {
  const personalScheduleToken = new URLSearchParams(window.location.search).get("schedule");
  return personalScheduleToken
    ? <PersonalSchedulePublicPage token={personalScheduleToken} />
    : <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [activeModule, setActiveModule] = useState("ops");
  const [inspectionGateOpen, setInspectionGateOpen] = useState(false);
  const [inspectionPassword, setInspectionPassword] = useState("");
  const [reportDate, setReportDate] = useState(today);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("entry");
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [reports, setReports] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [performanceRows, setPerformanceRows] = useState([]);
  const [hqTasks, setHqTasks] = useState([]);
  const [staffRoster, setStaffRoster] = useState([]);
  const [storeRelationGroups, setStoreRelationGroups] = useState(STORE_RELATION_GROUPS);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [securitySettings, setSecuritySettings] = useState(defaultSecuritySettings);

  function clearWorkspaceState() {
    setStores([]);
    setProducts([]);
    setReports([]);
    setHandovers([]);
    setPerformanceRows([]);
    setHqTasks([]);
    setStaffRoster([]);
    setStoreRelationGroups(STORE_RELATION_GROUPS);
    setSelectedStoreId("");
  }

  function loadDemoWorkspace() {
    setSecuritySettings(defaultSecuritySettings);
    setStores(storesSeed);
    setProducts(productsSeed);
    setReports(storesSeed.map((store) => normalizeReport(store)));
    setHandovers(handoverSeed);
    setPerformanceRows(performanceSeed);
    setHqTasks(hqTaskSeed);
    setStaffRoster(staffRosterSeed);
    setStoreRelationGroups(STORE_RELATION_GROUPS);
  }

  async function loadWorkspace(nextProfile = profile, preferredStoreId = selectedStoreId, preferredReportDate = reportDate) {
    const [storeRows, productRows, reportRows, handoverRows, performanceData, taskRows, staffRows, relationGroups] = await Promise.all([
      fetchStores(),
      fetchProducts(),
      fetchDailyReports(preferredReportDate),
      fetchHandovers(today),
      fetchStaffPerformance(new Date().toISOString().slice(0, 7)),
      fetchHqTasks(),
      fetchStoreStaff(),
      fetchStoreRelationGroups(),
    ]);
    setStores(storeRows);
    setProducts(productRows);
    setHandovers(handoverRows);
    setPerformanceRows(performanceData);
    setHqTasks(taskRows);
    setStaffRoster(staffRows);
    setStoreRelationGroups(mergeStoreRelationGroups(relationGroups));
    const nextStoreId = nextProfile?.role === "store_manager"
      ? (nextProfile?.store_id || nextProfile?.store_code || "")
      : (nextProfile?.store_id || nextProfile?.store_code || preferredStoreId || storeRows[0]?.id || "");
    setSelectedStoreId(nextStoreId);

    const byStore = new Map(reportRows.map((report) => [report.store_id || report.id, report]));
    setReports(storeRows.map((store) => normalizeReport(store, byStore.get(store.id))));
  }

  useEffect(() => {
    async function boot() {
      try {
        if (hasSupabaseConfig) {
          const sessionProfile = await getSessionProfile();
          setProfile(sessionProfile);
          if (!sessionProfile) return;

          const nextSecuritySettings = await fetchSecuritySettings();
          setSecuritySettings(nextSecuritySettings);
          setRole(appViewForRole(sessionProfile.role));
          setActiveModule(defaultModuleForRole(sessionProfile.role));
          if (nextSecuritySettings.is_fault_mode && !canManageSecurity(sessionProfile.role)) {
            clearWorkspaceState();
            return;
          }
          await loadWorkspace(sessionProfile);
        } else {
          setProfile(null);
          setRole("entry");
          setSelectedStoreId("");
          loadDemoWorkspace();
        }
      } catch (error) {
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  const currentRole = profileRole(profile);
  const selectedReport = findStoreScopedRecord(reports, selectedStoreId) || (currentRole === "store_manager" ? null : reports[0]);
  const activeModuleAllowed = canAccessModule(currentRole, activeModule);

  useEffect(() => {
    if (!profile || role === "entry") return;
    if (!canAccessModule(currentRole, activeModule)) {
      setActiveModule(defaultModuleForRole(currentRole));
    }
  }, [activeModule, currentRole, profile, role]);

  if (activeModule === "inspection" && activeModuleAllowed) {
    return <InspectionApp onBack={() => setActiveModule("ops")} />;
  }

  function requestInspectionAccess() {
    if (!canAccessModule(currentRole, "inspection")) {
      show("此角色無巡檢管理權限");
      return;
    }
    setInspectionPassword("");
    setInspectionGateOpen(true);
  }

  function confirmInspectionAccess() {
    if (inspectionPassword === "8599") {
      setInspectionGateOpen(false);
      setActiveModule("inspection");
      return;
    }
    show("巡檢管理密碼錯誤");
  }

  async function handleLogin(email, password) {
    setLoading(true);
    try {
      if (!hasSupabaseConfig) {
        if (password !== "demo") throw new Error("本機驗收密碼為 demo");
        const accountCode = String(email || "").split("@")[0].trim().toUpperCase();
        if (accountCode === "HQ") {
          const nextProfile = {
            id: "demo-hq",
            full_name: "總部驗收帳號",
            role: "hq",
            store_id: null,
            store_code: "",
          };
          setProfile(nextProfile);
          setRole("hq");
          setActiveModule(defaultModuleForRole(nextProfile.role));
          setSelectedStoreId(storesSeed[0]?.id || "");
          setMessage("");
          return;
        }
        const store = storesSeed.find((row) => canonicalStoreCode(row) === accountCode);
        if (!store) throw new Error("請選擇有效的本機驗收帳號");
        const nextProfile = {
          id: `demo-${accountCode.toLowerCase()}`,
          full_name: `${store.name} 店長`,
          role: "store_manager",
          store_id: store.id,
          store_code: accountCode,
        };
        setProfile(nextProfile);
        setRole("store");
        setActiveModule(defaultModuleForRole(nextProfile.role));
        setSelectedStoreId(store.id);
        setMessage("");
        return;
      }
      await signIn(email, password);
      const nextProfile = await getSessionProfile();
      const nextSecuritySettings = await fetchSecuritySettings();
      setProfile(nextProfile);
      setSecuritySettings(nextSecuritySettings);
      setRole(appViewForRole(nextProfile.role));
      setActiveModule(defaultModuleForRole(nextProfile.role));
      if (nextSecuritySettings.is_fault_mode && !canManageSecurity(nextProfile.role)) {
        clearWorkspaceState();
        return;
      }
      await loadWorkspace(nextProfile);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.warn("Sign out failed, forcing local logout.", error);
    }
    setProfile(null);
    setRole("entry");
    clearWorkspaceState();
    if (!hasSupabaseConfig) loadDemoWorkspace();
    setSecuritySettings(defaultSecuritySettings);
    setMessage("");
  }

  function show(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2000);
  }

  function openModule(moduleName) {
    if (!canAccessModule(currentRole, moduleName)) {
      show("此角色無此模組權限");
      return;
    }
    if ((moduleName === "handover" || moduleName === "performance") && !selectedStoreId && stores[0]?.id) {
      setSelectedStoreId(stores[0].id);
    }
    setActiveModule(moduleName);
  }

  async function changeReportDate(nextDate, authCode = "") {
    if (!nextDate) return false;
    if (currentRole === "store_manager" && !isStoreManagerRevenueDateAllowed(nextDate, today)) {
      show(`店長帳號僅可查閱最近 ${STORE_MANAGER_REVENUE_LOOKBACK_DAYS} 天營收資料`);
      return false;
    }
    if (nextDate < today && authCode !== "8599") {
      show("過往日期需輸入認證碼 8599");
      return false;
    }
    setLoading(true);
    try {
      setReportDate(nextDate);
      await loadWorkspace(profile, selectedStoreId, nextDate);
      show(nextDate < today ? "已解鎖過往日期回報" : "已切換回今日回報");
      return true;
    } catch (error) {
      show(`切換日期失敗：${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function saveReport(
    form,
    inventoryRows,
    wasteRows,
    scheduledHeadcount,
    employeeMealRows,
  ) {
    if (!selectedReport?.store_id) {
      show("送出失敗：此帳號尚未綁定門店，請總部確認門店權限");
      return false;
    }
    try {
      const payload = buildDailyReportPayload({
        storeId: selectedReport.store_id,
        reportDate,
        form,
        submittedAt: new Date().toISOString(),
        submittedBy: profile?.id,
        scheduledHeadcount,
        employeeMeals: employeeMealRows,
      });
      await saveDailyOperations(
        payload,
        buildInventorySaveRows(inventoryRows),
        wasteRows,
        employeeMealRows,
      );
      await loadWorkspace(profile, selectedReport.store_id, reportDate);
      show("每日營運回報已上傳完成");
      return true;
    } catch (error) {
      show(`送出失敗：${error.message}`);
      return false;
    }
  }

  async function saveHqDailyReport(report, form, inventoryRows) {
    if (!canManageDailyReportData(currentRole)) {
      show("此帳號沒有總部修改每日資料權限");
      return false;
    }
    if (!report?.store_id) {
      show("請先選擇要修改的門店紀錄");
      return false;
    }
    try {
      const payload = buildDailyReportPayload({
        storeId: report.store_id,
        reportDate: report.report_date || reportDate,
        form,
        submittedAt: new Date().toISOString(),
        submittedBy: profile?.id,
        scheduledHeadcount: Number(report.scheduled_staff_count || 0),
      });
      await saveDailyOperations(payload, buildInventorySaveRows(inventoryRows));
      await loadWorkspace(profile, report.store_id, reportDate);
      show("總部資料已儲存");
      return true;
    } catch (error) {
      show(`總部資料儲存失敗：${error.message}`);
      return false;
    }
  }

  async function clearHqDailyReport(report) {
    if (!canManageDailyReportData(currentRole)) {
      show("此帳號沒有總部清除每日資料權限");
      return false;
    }
    if (!report?.id) {
      show("此筆尚無回報資料可清除");
      return false;
    }
    if (!window.confirm(`確定清除 ${report.name} ${report.report_date} 的每日營運回報與庫存紀錄？`)) return false;
    try {
      await deleteDailyReport(report.id);
      await loadWorkspace(profile, report.store_id, reportDate);
      show("每日營運資料已清除");
      return true;
    } catch (error) {
      show(`清除失敗：${error.message}`);
      return false;
    }
  }

  async function clearHqDailyReports(reportRows) {
    if (!canManageDailyReportData(currentRole)) {
      show("此帳號沒有總部清除每日資料權限");
      return false;
    }
    const targets = (reportRows || []).filter((row) => row.id);
    if (!targets.length) {
      show("目前查詢範圍沒有可清除的回報資料");
      return false;
    }
    const storeNames = Array.from(new Set(targets.map((row) => row.name))).slice(0, 5).join("、");
    if (!window.confirm(`確定一鍵清除目前查詢範圍的 ${targets.length} 筆每日營運回報？包含：${storeNames}${targets.length > 5 ? "..." : ""}`)) return false;
    try {
      await deleteDailyReports(targets.map((row) => row.id));
      await loadWorkspace(profile, selectedStoreId, reportDate);
      show(`已一鍵清除 ${targets.length} 筆每日營運資料`);
      return true;
    } catch (error) {
      show(`一鍵清除失敗：${error.message}`);
      return false;
    }
  }

  async function saveHandover(form) {
    if (!selectedReport?.store_id) {
      show("請先選擇門店");
      return false;
    }
    try {
      const payload = {
        ...form,
        store_id: selectedReport.store_id,
        handover_date: today,
        created_by: profile?.id,
      };
      await upsertHandover(payload);
      const nextRows = await fetchHandovers(today);
      setHandovers(nextRows);
      show("交接紀錄已儲存完成");
      return true;
    } catch (error) {
      show(`交接儲存失敗：${error.message}`);
      return false;
    }
  }

  async function savePerformance(form) {
    try {
      const payload = {
        ...form,
        late_count: Number(form.late_count || 0),
        leave_count: Number(form.leave_count || 0),
        absence_count: Number(form.absence_count || 0),
        service_delay_count: Number(form.service_delay_count || 0),
        score: Number(form.score || 0),
        bonus_adjustment: Number(form.bonus_adjustment || 0),
        created_by: profile?.id,
      };
      await upsertStaffPerformance(payload);
      const nextRows = await fetchStaffPerformance(payload.period_month || new Date().toISOString().slice(0, 7));
      setPerformanceRows(nextRows);
      show("人員績效已儲存完成");
      return true;
    } catch (error) {
      show(`績效儲存失敗：${error.message}`);
      return false;
    }
  }

  async function saveHqTask(form) {
    try {
      await upsertHqTask(form);
      const nextRows = await fetchHqTasks();
      setHqTasks(nextRows);
      show("任務已儲存完成");
      return true;
    } catch (error) {
      show(`任務儲存失敗：${error.message}`);
      return false;
    }
  }

  async function saveSecuritySettings(form) {
    if (!canManageSecurity(currentRole)) {
      show("只有 CEO 與 COO 可操作系統安全");
      return false;
    }
    try {
      const saved = await upsertSecuritySettings(form);
      setSecuritySettings(saved);
      show(saved.is_fault_mode ? "系統安全設定已儲存完成，資料故障顯示已啟動" : "系統安全設定已儲存完成，資料故障顯示已解除");
      return true;
    } catch (error) {
      show(`系統安全設定失敗：${error.message}`);
      return false;
    }
  }

  async function handleReview(action, status, targetReport = selectedReport) {
    if (!targetReport?.id) {
      show("此門店尚未送出回報，無法審核");
      return false;
    }
    try {
      await reviewReport(targetReport.id, action, "", status);
      await loadWorkspace(profile, targetReport.store_id, targetReport.report_date || reportDate);
      show("營運審核已完成");
      return true;
    } catch (error) {
      show(`營運審核失敗：${error.message}`);
      return false;
    }
  }

  async function saveStaffMember(form) {
    try {
      await upsertStoreStaffMember(form);
      const nextRows = await fetchStoreStaff();
      setStaffRoster(nextRows);
      show("人員主檔已更新，排假表已同步使用最新名單");
      return true;
    } catch (error) {
      show(`人員主檔儲存失敗：${error.message}`);
      return false;
    }
  }

  async function removeStaffMember(staffMember) {
    if (!staffMember?.id && !staffMember) return false;
    try {
      await deleteStoreStaffMember(staffMember);
      const nextRows = await fetchStoreStaff();
      setStaffRoster(nextRows);
      show("人員已停用，排假表已同步更新");
      return true;
    } catch (error) {
      show(`人員停用失敗：${error.message}`);
      return false;
    }
  }

  async function transferStaffMember(command) {
    try {
      await recordStaffStoreTransfer(command);
      const nextRows = await fetchStoreStaff();
      setStaffRoster(nextRows);
      show("人員調店已生效，歷史歸屬已保留");
      return true;
    } catch (error) {
      show(`人員調店失敗：${error.message}`);
      return false;
    }
  }

  async function syncWorkspace() {
    setLoading(true);
    try {
      const nextSecuritySettings = await fetchSecuritySettings();
      setSecuritySettings(nextSecuritySettings);
      if (nextSecuritySettings.is_fault_mode && !canManageSecurity(currentRole)) {
        clearWorkspaceState();
        show("系統安全模式已啟動");
        return;
      }
      await loadWorkspace(profile);
      show("資料已同步完成");
    } catch (error) {
      show(`同步失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportReports() {
    try {
      const weekRange = getWeekRange(today);
      const monthRange = getMonthRange(today);
      const { reports: monthReports, inventoryRows } = await fetchHqDashboardData(monthRange.start, monthRange.end);
      const periodReports = monthReports.length ? monthReports : reports;
      const csv = buildOperationsCsv({ reports, periodReports, inventoryRows, products, weekRange, monthRange });
      downloadTextFile(csv, `萊吉多營運回報-${today}.csv`);
      show("報表已匯出完成");
    } catch (error) {
      show(`匯出失敗：${error.message}`);
    }
  }

  if (loading) return <main className="loading">載入中...</main>;

  if (!profile) {
    return <LoginScreen onLogin={handleLogin} message={message} demoMode={!hasSupabaseConfig} stores={stores} />;
  }

  if (securitySettings.is_fault_mode && !canManageSecurity(currentRole)) {
    return (
      <SystemFaultScreen
        title={securitySettings.fault_title}
        message={securitySettings.fault_message}
        onSignOut={handleSignOut}
      />
    );
  }

  if (role === "entry") {
    return (
      <EntryScreen
        stores={stores}
        onSelectStore={(storeId) => {
          setSelectedStoreId(storeId);
          setRole("store");
        }}
        onRole={setRole}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        role={role}
        profile={profile}
        profileRole={currentRole}
        stores={stores}
        selectedStoreId={selectedStoreId}
        activeModule={activeModule}
        setActiveModule={openModule}
        setRole={setRole}
        setSelectedStoreId={setSelectedStoreId}
        onInspection={requestInspectionAccess}
        onSignOut={handleSignOut}
      />
      <main className="content">
        <TopBar activeModule={activeModule} reportDate={reportDate} role={role} profileRole={currentRole} report={selectedReport} onSync={syncWorkspace} onExport={exportReports} />
        {!hasSupabaseConfig && (
          <div className="notice">目前使用示範資料。部署後請在 Vercel 設定 Supabase 環境變數，即可切換為正式資料。</div>
        )}
        {!activeModuleAllowed && <AccessDeniedModule roleName={currentRole} />}
        {activeModuleAllowed && activeModule === "ops" && role === "hq" && (
          <HqDashboard
            currentRole={currentRole}
            reports={reports}
            products={products}
            handovers={handovers}
            performanceRows={performanceRows}
            staffRoster={staffRoster}
            scheduleRows={scheduleSeed}
            hqTasks={hqTasks}
            securitySettings={securitySettings}
            canEditTargets={canEditMonthlyTargets(currentRole)}
            canManageReports={canManageDailyReportData(currentRole)}
            canConfirmReports={canConfirmDailyReports(currentRole)}
            onSelect={setSelectedStoreId}
            onOpenModule={openModule}
            onSaveReport={saveHqDailyReport}
            onDeleteReport={clearHqDailyReport}
            onBulkDeleteReports={clearHqDailyReports}
            onNotify={show}
          />
        )}
        {activeModuleAllowed && activeModule === "ops" && role === "store" && selectedReport && (
          <StoreReportPage
            report={selectedReport}
            reportDate={reportDate}
            products={products}
            currentRole={currentRole}
            staffRoster={staffRoster}
            today={today}
            onDateChange={changeReportDate}
            onSave={saveReport}
          />
        )}
        {activeModuleAllowed && activeModule === "ops" && role === "review" && selectedReport && (
          <>
            <SupervisorOpsHome
              currentRole={currentRole}
              reports={reports}
              handovers={handovers}
              performanceRows={performanceRows}
              staffRoster={staffRoster}
              scheduleRows={scheduleSeed}
              hqTasks={hqTasks}
              onOpenModule={openModule}
              onSelect={setSelectedStoreId}
            />
            <ReviewConsole
              reports={reports}
              report={selectedReport}
              products={products}
              onSelect={setSelectedStoreId}
              onReview={handleReview}
            />
          </>
        )}
        {activeModuleAllowed && activeModule === "handover" && (
          selectedReport ? (
            <HandoverModule report={selectedReport} handovers={handovers} onSave={saveHandover} />
          ) : (
            <section className="panel empty-module">
              <div className="panel-head">
                <div>
                  <h2>交接管理</h2>
                  <p>請先選擇門店後，再建立交接紀錄。</p>
                </div>
              </div>
            </section>
          )
        )}
        {activeModuleAllowed && activeModule === "performance" && (
          <PerformanceModule stores={stores} selectedStoreId={selectedStoreId} rows={performanceRows} onSave={savePerformance} />
        )}
        {activeModuleAllowed && activeModule === "hr" && (
          <HrMasterModule
            stores={stores}
            selectedStoreId={selectedStoreId}
            salaryRows={salaryStructureSeed}
            storeHours={storeHoursSeed}
            staffRoster={staffRoster}
            currentRole={currentRole}
            onSaveStaffMember={saveStaffMember}
            onDeleteStaffMember={removeStaffMember}
            onTransferStaffMember={transferStaffMember}
          />
        )}
        {activeModuleAllowed && activeModule === "system" && (
          <ManagementSystemModule systems={hqSystemSeed} />
        )}
        {activeModuleAllowed && activeModule === "security" && (
          <SecurityModule settings={securitySettings} onSave={saveSecuritySettings} />
        )}
        {activeModuleAllowed && activeModule === "schedule" && (
          <ScheduleModule
            scheduleRows={scheduleSeed}
            storeHours={storeHoursSeed}
            staffRoster={staffRoster}
            salaryRows={salaryStructureSeed}
            stores={stores}
            profile={profile}
            selectedStoreId={selectedStoreId}
            selectedReport={selectedReport}
            currentRole={currentRole}
            storeRelationGroups={storeRelationGroups}
            onNotify={show}
          />
        )}
        {activeModuleAllowed && activeModule === "tasks" && (
          <HqTaskDispatchModule tasks={hqTasks} stores={stores} selectedStoreId={selectedStoreId} onSave={saveHqTask} />
        )}
        {activeModuleAllowed && activeModule === "hrFlow" && (
          <HrFlowModule changes={hrChangeSeed} salaryRows={salaryStructureSeed} />
        )}
        {activeModuleAllowed && activeModule === "anomaly" && (
          <AnomalyCenterModule
            reports={reports}
            handovers={handovers}
            performanceRows={performanceRows}
            staffRoster={staffRoster}
            scheduleRows={scheduleSeed}
            hqTasks={hqTasks}
            onSelect={setSelectedStoreId}
          />
        )}
      </main>
      {inspectionGateOpen && (
        <InspectionPasswordDialog
          password={inspectionPassword}
          setPassword={setInspectionPassword}
          onCancel={() => setInspectionGateOpen(false)}
          onConfirm={confirmInspectionAccess}
        />
      )}
      {message && <div className="toast show" role="alert" aria-live="assertive">{message}</div>}
    </div>
  );
}

function SystemFaultScreen({ title, message, onSignOut }) {
  return (
    <main className="fault-screen">
      <section className="fault-card">
        <div className="brand-mark">萊</div>
        <h1>{title || defaultSecuritySettings.fault_title}</h1>
        <p>{message || defaultSecuritySettings.fault_message}</p>
        <button onClick={onSignOut}>重新登入</button>
      </section>
    </main>
  );
}

function SecurityModule({ settings, onSave }) {
  const [form, setForm] = useState({ ...defaultSecuritySettings, ...settings });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ ...defaultSecuritySettings, ...settings });
  }, [settings]);

  async function submit(nextPatch = {}) {
    setSaving(true);
    const nextForm = { ...form, ...nextPatch };
    const ok = await onSave(nextForm);
    if (ok) setForm(nextForm);
    setSaving(false);
  }

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric
          label="目前狀態"
          value={form.is_fault_mode ? "保護中" : "正常"}
          detail={form.is_fault_mode ? "一般角色只顯示故障訊息" : "所有角色依權限正常使用"}
          tone={form.is_fault_mode ? "bad" : "good"}
        />
        <Metric label="操作權限" value="CEO / COO" detail="其他職級不可操作" />
        <Metric label="顯示文字" value={form.fault_title || "資料故障"} detail={form.fault_message || "請洽系統管理員"} tone="warn" />
      </section>

      <section className="panel module-form security-panel">
        <div className="panel-head">
          <div>
            <h2>系統安全模式</h2>
            <p>緊急情況可遮蔽營收、交接、稽核、人員績效等營運資料；只有 CEO 與 COO 可啟動或解除。</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            安全狀態
            <select
              value={form.is_fault_mode ? "on" : "off"}
              onChange={(event) => setForm({ ...form, is_fault_mode: event.target.value === "on" })}
            >
              <option value="off">正常開放</option>
              <option value="on">啟動資料故障顯示</option>
            </select>
          </label>
          <label>
            顯示標題
            <input value={form.fault_title} onChange={(event) => setForm({ ...form, fault_title: event.target.value })} />
          </label>
          <label className="wide-field">
            顯示訊息
            <input value={form.fault_message} onChange={(event) => setForm({ ...form, fault_message: event.target.value })} />
          </label>
        </div>
        <div className="security-preview">
          <span>一般角色畫面預覽</span>
          <strong>{form.fault_title || defaultSecuritySettings.fault_title}</strong>
          <p>{form.fault_message || defaultSecuritySettings.fault_message}</p>
        </div>
        <div className="security-actions">
          <button onClick={() => submit({ is_fault_mode: false })} disabled={saving}>解除資料故障顯示</button>
          <button className="danger" onClick={() => submit({ is_fault_mode: true })} disabled={saving}>啟動資料故障顯示</button>
          <button className="primary" onClick={() => submit()} disabled={saving}>{saving ? "儲存中..." : "儲存設定"}</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>權限規則</h2>
            <p>此功能設計為緊急資料遮蔽，不提供店長、督導、行政、總務、財務操作。</p>
          </div>
        </div>
        <div className="flow-list">
          <span><strong>CEO / COO</strong>：可查看系統安全、啟動、解除與調整顯示文字。</span>
          <span><strong>其他職級</strong>：安全模式啟動時，不載入營運資料，只看到故障訊息。</span>
          <span><strong>資料庫限制</strong>：Supabase RLS 僅允許 CEO / COO 寫入安全設定。</span>
        </div>
      </section>
    </div>
  );
}

function InspectionPasswordDialog({ password, setPassword, onCancel, onConfirm }) {
  return (
    <div className="modal-backdrop">
      <section className="password-dialog">
        <div className="panel-head">
          <div>
            <h2>巡檢管理密碼</h2>
            <p>請輸入授權密碼後進入巡檢管理。</p>
          </div>
        </div>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={password}
          placeholder="請輸入密碼"
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm();
            if (event.key === "Escape") onCancel();
          }}
        />
        <div className="dialog-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={onConfirm}>進入</button>
        </div>
      </section>
    </div>
  );
}

function PersonalSchedulePublicPage({ token }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPersonalScheduleByToken(token)
      .then((data) => {
        if (active) setResult(data || { status: "not_found" });
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (error) return <main className="personal-schedule-page"><section className="personal-schedule-card"><h1>個人班表無法讀取</h1><p>{error}</p></section></main>;
  if (!result) return <main className="loading">個人班表載入中...</main>;
  if (result.status !== "active" || !result.schedule) {
    const message = result.status === "revoked" ? "此連結已由門店或總部撤銷。" : result.status === "expired" ? "此連結已超過有效期限。" : "找不到此個人班表連結。";
    return <main className="personal-schedule-page"><section className="personal-schedule-card"><div className="brand-mark">萊</div><h1>個人班表已失效</h1><p>{message}</p></section></main>;
  }

  const schedule = result.schedule;
  return (
    <main className="personal-schedule-page">
      <section className="personal-schedule-card">
        <div className="personal-schedule-head">
          <div><div className="brand-mark">萊</div><h1>{schedule.employee_name} 個人班表</h1></div>
          <span className="chip good">{schedule.period_month} · V{result.schedule_version}</span>
        </div>
        <p>{schedule.home_store_code} · {schedule.role_name || "門店人員"} · 有效至 {new Date(result.expires_at).toLocaleString("zh-TW")}</p>
        {result.has_newer_version && <div className="notice">此班表已有新版，請向店長取得最新連結。</div>}
        <div className="personal-schedule-list">
          {schedule.rows.map((row) => (
            <article className={`personal-schedule-row ${row.status}`} key={row.date}>
              <div><strong>{row.date.slice(5).replace("-", "/")}</strong><span>{new Intl.DateTimeFormat("zh-TW", { weekday: "short", timeZone: "UTC" }).format(new Date(`${row.date}T00:00:00Z`))}</span></div>
              <em>{row.label}</em>
              <div className="personal-shifts">
                {row.shifts.map((shift, index) => <span key={`${row.date}-${index}`}><strong>{shift.start_time}–{shift.end_time}</strong><small>{shift.store_code}</small></span>)}
                {!row.shifts.length && <span>-</span>}
              </div>
            </article>
          ))}
        </div>
        <small>本頁僅顯示本人班表，不包含其他員工或薪資資料。</small>
      </section>
    </main>
  );
}

function LoginScreen({ onLogin, message, demoMode = false, stores = [] }) {
  const [email, setEmail] = useState(demoMode ? "S01@demo.local" : "");
  const [password, setPassword] = useState(demoMode ? "demo" : "");
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand-mark">萊</div>
        <h1>萊吉多營運回報</h1>
        <p>{demoMode ? "本機驗收模式，登入後依帳號限制可查看的門店。" : "請使用 Supabase Auth 建立的帳號登入。"}</p>
        {demoMode && (
          <label>
            驗收身份
            <select value={email} onChange={(event) => setEmail(event.target.value)}>
              <option value="HQ@demo.local">總部</option>
              {stores.map((store) => (
                <option value={`${canonicalStoreCode(store)}@demo.local`} key={store.id}>{canonicalStoreCode(store)} {store.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Email
          <input value={email} readOnly={demoMode} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          密碼
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="primary" onClick={() => onLogin(email, password)}>登入</button>
        {message && <p className="error">{message}</p>}
      </section>
    </main>
  );
}

function EntryScreen({ stores, onSelectStore, onRole }) {
  return (
    <main className="entry-screen">
      <section className="entry-copy">
        <div className="brand-mark">萊</div>
        <h1>萊吉多營運回報入口</h1>
        <p>門店回報營收、庫存與差異，總部可即時查看每日營運狀況。</p>
        <label>
          選擇門店
          <select onChange={(event) => onSelectStore(event.target.value)} defaultValue="">
            <option value="" disabled>請選擇門店</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </label>
        <div className="entry-actions">
          <button className="primary" onClick={() => onRole("hq")}>總部儀表板</button>
        </div>
      </section>
      <section className="entry-panels">
        <Info title="門店回報" text="依 14:00、19:00、打烊三個時段填寫營收，並補上現金差異與備註。" />
        <Info title="總部總覽" text="快速查看各門店營收、達成率、庫存狀態與目標進度。" />
        <Info title="排班與人員" text="維護門店人員資料，支援排假與人力需求判讀。" />
      </section>
    </main>
  );
}

function Sidebar({
  role,
  profile,
  profileRole: currentRole,
  stores,
  selectedStoreId,
  activeModule,
  setActiveModule,
  setRole,
  setSelectedStoreId,
  onInspection,
  onSignOut,
}) {
  const isStoreManager = profile?.role === "store_manager";
  const allowedViewModes = visibleViewModesForRole(currentRole);
  const selectedStore = stores.find((store) => store.id === selectedStoreId || store.store_id === selectedStoreId || store.store_code === selectedStoreId);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">萊</div>
        <div>
          <strong>萊吉多營運回報</strong>
          <span>門店營運管理</span>
        </div>
      </div>
      {!isStoreManager && allowedViewModes.length > 1 && (
        <div className="role-switcher">
          {[
            ["hq", "總部"],
            ["store", "門店"],
            ["review", "營運審核"],
            ["inspection", "巡檢管理"],
          ].filter(([key]) => allowedViewModes.includes(key)).map(([key, label]) => (
            <button
              key={key}
              className={role === key ? "active" : ""}
              onClick={() => {
                if (key === "inspection") {
                  onInspection();
                  return;
                }
                setActiveModule("ops");
                setRole(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {isStoreManager ? (
        <div className="store-scope-card">
          <span>目前門店</span>
          <strong>{selectedStore?.name || profile?.store_code || "已綁定門店"}</strong>
          <p>僅可查看與操作本店資料</p>
        </div>
      ) : (
        <>
          <label className="field-label">門店</label>
          <select
            value={selectedStoreId}
            onChange={(event) => setSelectedStoreId(event.target.value)}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </>
      )}
      <nav className="side-nav">
        {MODULE_GROUPS.map((group) => (
          <NavGroup
            key={group.title}
            title={group.title}
            items={group.items}
            activeModule={activeModule}
            allowedModules={modulesForRole(currentRole)}
            onSelect={(moduleName) => (moduleName === "inspection" ? onInspection() : setActiveModule(moduleName))}
          />
        ))}
      </nav>
      <div className="sidebar-note">
        <span>{profile?.full_name || "示範使用者"}</span>
        <strong>{ROLE_LABELS[currentRole] || currentRole}</strong>
        <p>正式部署後，角色與可查看門店會由 Supabase Auth 與 profiles 資料表控制。</p>
      </div>
      <button onClick={onSignOut}>登出 / 回登入頁</button>
    </aside>
  );
}

function NavGroup({ title, items, activeModule, allowedModules, onSelect }) {
  const visibleItems = items.filter(([key]) => allowedModules.includes(key));
  if (!visibleItems.length) return null;
  return (
    <div className="nav-group">
      <span>{title}</span>
      {visibleItems.map(([key, label]) => (
        <button key={key} className={activeModule === key ? "active" : ""} onClick={() => onSelect(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function TopBar({ activeModule, reportDate, role, profileRole: currentRole, report, onSync, onExport }) {
  const titleMap = {
    handover: "門市交接管理",
    performance: "人員績效管理",
    hr: "人資主檔管理",
    system: "總部制度中心",
    schedule: "排班管理",
    tasks: "總部任務派遣",
    hrFlow: "人資異動流程",
    anomaly: "總部異常中心",
  };
  const title = titleMap[activeModule] || (role === "hq" ? "總部營運總覽" : role === "store" ? "門店每日回報" : "門店回報審核台");
  return (
    <header className="topbar">
      <div>
        <p>營業日 {reportDate || today} · {report?.area || "全區"} · {report?.name || "尚未選擇門店"}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        {canExportRole(currentRole) && <button onClick={onExport}>匯出 CSV</button>}
        <button className="primary" onClick={onSync}>同步資料</button>
      </div>
    </header>
  );
}

function AccessDeniedModule({ roleName }) {
  return (
    <section className="panel empty-module">
      <div className="panel-head">
        <div>
          <h2>權限不足</h2>
          <p>{ROLE_LABELS[roleName] || roleName} 無法查看此模組，請由營運長或系統管理員調整權限。</p>
        </div>
      </div>
    </section>
  );
}

function RoleHomePanel({ roleName, summary, reports, anomalyRows, securitySettings, onSelect, onOpenModule }) {
  const roleMeta = {
    ceo: {
      title: "執行長今日總覽",
      subtitle: "先看品牌營運健康度、重大風險與資料安全狀態。",
      metrics: [
        ["品牌營收", money(summary.total), `達成 ${pct((summary.total / Math.max(1, summary.target)) * 100)}`, "hot"],
        ["重大風險", `${summary.riskRows.filter((row) => row.level === "重大").length} 件`, summary.riskRows[0]?.storeName || "目前穩定", "bad"],
        ["回報完成率", pct(summary.reportRate), `${summary.reportedRows.length}/${reports.length} 店`, "good"],
        ["資料遮蔽", securitySettings?.is_fault_mode ? "已啟動" : "未啟動", "CEO/COO 可操作", securitySettings?.is_fault_mode ? "bad" : "good"],
      ],
      actions: [["查看異常", "anomaly"], ["系統安全", "security"], ["營收總覽", "ops"]],
    },
    coo: {
      title: "管理層營運指揮中心",
      subtitle: "優先處理逾期異常、巡檢缺失、任務追蹤與排班缺口。",
      metrics: [
        ["逾期任務", `${summary.overdueTasks.length} 件`, summary.overdueTasks[0]?.title || "無逾期", summary.overdueTasks.length ? "bad" : "good"],
        ["排班缺口", `${summary.shortageRows.length} 筆`, summary.shortageRows[0]?.storeName || "目前足夠", summary.shortageRows.length ? "bad" : "good"],
        ["交接追蹤", `${summary.handoverIssues.length} 筆`, "現金、清潔、待辦", summary.handoverIssues.length ? "warn" : "good"],
        ["低達成店", `${summary.lowRevenue.length} 店`, summary.lowRevenue[0]?.name || "無", summary.lowRevenue.length ? "warn" : "good"],
      ],
      actions: [["異常中心", "anomaly"], ["任務派遣", "tasks"], ["排班管理", "schedule"]],
    },
    cfo: {
      title: "財務長營收與現金風險",
      subtitle: "聚焦營收達成、現金差異與報表資料完整性。",
      metrics: [
        ["今日營收", money(summary.total), `目標 ${money(summary.target)}`, "hot"],
        ["現金差異", `${summary.cashIssues.length} 店`, summary.cashIssues[0]?.name || "未見重大差異", summary.cashIssues.length ? "bad" : "good"],
        ["未回報", `${summary.unreported.length} 店`, summary.unreported[0]?.name || "已完成", summary.unreported.length ? "warn" : "good"],
        ["回報完成率", pct(summary.reportRate), "財務報表可信度", summary.reportRate >= 90 ? "good" : "warn"],
      ],
      actions: [["營收總覽", "ops"], ["異常中心", "anomaly"], ["制度中心", "system"]],
    },
    cso: {
      title: "督導長今日待辦",
      subtitle: "先處理門店異常、巡檢改善、排班支援與督導任務。",
      metrics: [
        ["督導異常", `${anomalyRows.filter((row) => row.owner.includes("督導")).length} 件`, "需督導介入", "warn"],
        ["排班支援", `${summary.shortageRows.length} 筆`, summary.shortageRows[0]?.storeName || "無", summary.shortageRows.length ? "bad" : "good"],
        ["交接缺失", `${summary.handoverIssues.length} 筆`, "未結案事項", summary.handoverIssues.length ? "warn" : "good"],
        ["任務逾期", `${summary.overdueTasks.length} 件`, summary.overdueTasks[0]?.assignee_name || "無", summary.overdueTasks.length ? "bad" : "good"],
      ],
      actions: [["巡檢管理", "inspection"], ["異常中心", "anomaly"], ["任務派遣", "tasks"]],
    },
    supervisor: {
      title: "督導今日巡店工作台",
      subtitle: "從待改善、缺報與交接異常開始處理。",
      metrics: [
        ["待改善", `${summary.riskRows.length} 件`, summary.riskRows[0]?.storeName || "目前無", summary.riskRows.length ? "warn" : "good"],
        ["未回報店", `${summary.unreported.length} 店`, summary.unreported[0]?.name || "已完成", summary.unreported.length ? "warn" : "good"],
        ["交接追蹤", `${summary.handoverIssues.length} 筆`, "店長需補充", summary.handoverIssues.length ? "warn" : "good"],
        ["排班缺口", `${summary.shortageRows.length} 筆`, "需協調代班", summary.shortageRows.length ? "bad" : "good"],
      ],
      actions: [["巡檢管理", "inspection"], ["異常中心", "anomaly"], ["排班管理", "schedule"]],
    },
    general_affairs: {
      title: "總務 / 人資處理台",
      subtitle: "先看人員主檔、排班處理、人資異動與行政任務。",
      metrics: [
        ["人員主檔", `${summary.activeStaff.length} 人`, "連動排班與排休", "good"],
        ["人資待辦", `${summary.pendingHr.length} 件`, summary.pendingHr[0]?.title || "無", summary.pendingHr.length ? "warn" : "good"],
        ["主管缺口", `${summary.managerGaps.length} 店`, summary.managerGaps[0]?.name || "無", summary.managerGaps.length ? "bad" : "good"],
        ["排班缺口", `${summary.shortageRows.length} 筆`, "需補人或支援", summary.shortageRows.length ? "bad" : "good"],
      ],
      actions: [["人資主檔", "hr"], ["人資異動", "hrFlow"], ["排班管理", "schedule"]],
    },
  };
  const meta = roleMeta[roleName] || roleMeta.coo;
  const visibleActions = meta.actions.filter(([, moduleName]) => canAccessModule(roleName, moduleName));
  const displayMetrics = [
    ["今日營收", money(summary.total), `目標 ${money(summary.target)}`, "hot"],
    ["回報完成率", pct(summary.reportRate), `${summary.reportedRows.length}/${reports.length} 門店`, summary.reportRate >= 90 ? "good" : "warn"],
    ["排班缺口", `${summary.shortageRows.length} 筆`, summary.shortageRows[0]?.storeName || "目前足夠", summary.shortageRows.length ? "bad" : "good"],
    ["人員主檔", `${summary.activeStaff.length} 人`, "支援排班與門店管理", "good"],
  ];
  const priorityRows = buildOperationsPriorities(summary).map((row) => ({
    ...row,
    message: row.message || `目前達成率 ${pct(row.attainment)}`,
  }));

  return (
    <section className="panel wide role-home">
      <div className="panel-head">
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}</p>
        </div>
        <div className="role-actions">
          {visibleActions.map(([label, moduleName]) => (
            <button key={label} type="button" onClick={() => onOpenModule?.(moduleName)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="summary-grid role-summary">
        {displayMetrics.map(([label, value, detail, itemTone]) => (
          <Metric key={label} label={label} value={value} detail={detail} tone={itemTone} />
        ))}
      </div>
      <div className="role-home-grid">
        <div>
          <h3>今日優先處理</h3>
          <div className="priority-list">
            {priorityRows.slice(0, 5).map((row) => (
              <button key={row.id} type="button" className="priority-item" onClick={() => onSelect?.(row.store_id || reportForStoreCode(reports, row.store_code)?.store_id)}>
                <span className={`chip ${row.level === "重大" ? "bad" : "warn"}`}>{row.level}</span>
                <strong>{row.storeName}</strong>
                <em>{row.type}</em>
                <small>{row.message}</small>
              </button>
            ))}
            {!priorityRows.length && <div className="empty-state">目前核心回報、排班與營收狀況正常。</div>}
          </div>
        </div>
        <div>
          <h3>門店達成率排名</h3>
          <div className="rank-list">
            {summary.ranking.slice(0, 6).map((row, index) => (
              <button key={row.store_id || row.id} type="button" className="rank-row" onClick={() => onSelect?.(row.store_id)}>
                <span>{index + 1}</span>
                <strong>{row.name}</strong>
                <Progress value={row.attainment} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SupervisorOpsHome({ currentRole, reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks, onOpenModule, onSelect }) {
  const anomalyRows = useMemo(
    () => buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks }),
    [reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks],
  );
  const summary = useMemo(
    () => buildOperationsOverview({
      reports,
      handovers,
      staffRoster,
      scheduleRows,
      hqTasks,
      anomalyRows,
      today,
      resolveStoreCode: canonicalStoreCode,
    }),
    [reports, handovers, staffRoster, scheduleRows, hqTasks, anomalyRows],
  );

  return (
    <div className="workspace hq-grid">
      <RoleHomePanel
        roleName={currentRole}
        summary={summary}
        reports={reports}
        anomalyRows={anomalyRows}
        securitySettings={defaultSecuritySettings}
        onSelect={onSelect}
        onOpenModule={onOpenModule}
      />
    </div>
  );
}

function HqDashboard({
  currentRole,
  reports,
  products,
  handovers,
  performanceRows,
  staffRoster,
  scheduleRows,
  hqTasks,
  securitySettings,
  canEditTargets,
  canManageReports,
  canConfirmReports,
  onSelect,
  onOpenModule,
  onSaveReport,
  onDeleteReport,
  onBulkDeleteReports,
  onNotify,
}) {
  const [periodRows, setPeriodRows] = useState([]);
  const [usageRows, setUsageRows] = useState([]);
  const [targetDrafts, setTargetDrafts] = useState({});
  const [targetMessage, setTargetMessage] = useState("");
  const [savingTargetId, setSavingTargetId] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const weekRange = useMemo(() => getWeekRange(today), []);
  const monthRange = useMemo(() => getMonthRange(today), []);
  const fourWeekRanges = useMemo(() => getFourWeekRanges(today), []);
  const periodStart = [monthRange.start, fourWeekRanges[0].start].sort()[0];

  useEffect(() => {
    let active = true;
    async function loadPeriodData() {
      try {
        const { reports: rows, inventoryRows } = await fetchHqDashboardData(periodStart, today);
        if (!active) return;
        setPeriodRows(rows);
        setUsageRows(inventoryRows);
      } catch {
        if (active) {
          setPeriodRows(reports);
          setUsageRows([]);
        }
      }
    }
    loadPeriodData();
    return () => {
      active = false;
    };
  }, [periodStart, reports, refreshToken]);

  useEffect(() => {
    setTargetDrafts(
      Object.fromEntries(
        reports.map((report) => [
          report.store_id,
          report.target_monthly_revenue || Number(report.target || 0) * daysInMonth(today),
        ]),
      ),
    );
  }, [reports]);

  const revenueSummary = useMemo(() => buildRevenueSummary(periodRows.length ? periodRows : reports), [periodRows, reports]);
  const usageSummary = useMemo(() => buildUsageSummary(reports, products, periodRows, usageRows), [reports, products, periodRows, usageRows]);
  const dailyRevenueRows = useMemo(() => buildDailyRevenueRows(periodRows.length ? periodRows : reports), [periodRows, reports]);
  const weeklyRevenueRows = useMemo(() => buildWeeklyRevenueRows(periodRows.length ? periodRows : reports, fourWeekRanges), [periodRows, reports, fourWeekRanges]);
  const weeklyComparisonRows = useMemo(() => buildWeeklySameDayRows(periodRows.length ? periodRows : reports, today), [periodRows, reports]);
  const usageMatrix = useMemo(() => buildUsageMatrix(usageSummary.rows), [usageSummary.rows]);
  const dataQuality = useMemo(() => buildDataQualitySummary(reports, handovers, performanceRows), [reports, handovers, performanceRows]);
  const anomalyRows = useMemo(
    () => buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks }),
    [reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks],
  );
  const opsSummary = useMemo(
    () => buildOperationsOverview({
      reports,
      handovers,
      staffRoster,
      scheduleRows,
      hqTasks,
      anomalyRows,
      today,
      resolveStoreCode: canonicalStoreCode,
    }),
    [reports, handovers, staffRoster, scheduleRows, hqTasks, anomalyRows],
  );

  async function saveMonthlyTarget(report) {
    if (!canEditTargets) {
      setTargetMessage("此角色無營業目標調整權限");
      return;
    }
    const monthlyTarget = Number(targetDrafts[report.store_id] || 0);
    const dailyTarget = monthlyTarget / daysInMonth(today);
    setSavingTargetId(report.store_id);
    setTargetMessage("");
    try {
      await updateStoreMonthlyTarget(report.store_id, monthlyTarget, dailyTarget);
      setTargetMessage(`${report.name} 月目標已更新，日目標 ${money(dailyTarget)}`);
    } catch (error) {
      setTargetMessage(`目標更新失敗：${error.message}`);
    } finally {
      setSavingTargetId("");
    }
  }

  return (
    <div className="workspace hq-grid">
      <RoleHomePanel
        roleName={currentRole}
        summary={opsSummary}
        reports={reports}
        anomalyRows={anomalyRows}
        securitySettings={securitySettings}
        onSelect={onSelect}
        onOpenModule={onOpenModule}
      />
      <section className="kpi-strip">
        <Metric label="今日總營收" value={money(opsSummary.total)} detail={`目標 ${money(opsSummary.target)}`} tone="hot" />
        <Metric label="整體達成率" value={pct(opsSummary.attainmentRate)} detail="依今日目標計算" />
        <Metric label="已送出" value={`${opsSummary.reportedRows.length} 間`} detail="今日已有回報紀錄" tone="good" />
        <Metric label="未回報" value={`${opsSummary.unreported.length} 間`} detail="提醒門店完成日報" tone="warn" />
        <Metric label="已達標" value={`${opsSummary.achievedRows.length} 間`} detail="營收高於目標" tone="good" />
      </section>
      <HqOperationsView rows={weeklyComparisonRows} />
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>營收與使用量彙總</h2>
            <p>週統計為週一至週日；月統計為本月。</p>
          </div>
        </div>
        <div className="summary-grid">
          <Metric label="每日營收" value={money(revenueSummary.daily)} detail={`營業日 ${today}`} tone="hot" />
          <Metric label="一週營收" value={money(revenueSummary.week)} detail={`${weekRange.start} 至 ${weekRange.end}`} />
          <Metric label="當月營收" value={money(revenueSummary.month)} detail={`${monthRange.start} 至 ${monthRange.end}`} />
          <Metric label="每日使用量" value={`${usageSummary.daily} 件`} detail="昨日庫存 - 今日庫存" tone="warn" />
          <Metric label="一週使用量" value={`${usageSummary.week} 件`} detail="週一至週日" />
          <Metric label="當月使用量" value={`${usageSummary.month} 件`} detail="本月累計" />
        </div>
      </section>
      <HqReportRecords
        reports={periodRows.length ? periodRows : reports}
        products={products}
        canManageReports={canManageReports}
        canConfirmReports={canConfirmReports}
        onSelect={onSelect}
        onSaveReport={onSaveReport}
        onDeleteReport={onDeleteReport}
        onBulkDeleteReports={onBulkDeleteReports}
        onNotify={onNotify}
        onRefresh={() => setRefreshToken((value) => value + 1)}
      />
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>本月營業額目標設定</h2>
            <p>{canEditTargets ? "輸入各店本月目標，系統自動換算每日目標，供達成率與週會檢討使用。" : "此角色可查看目標與達成率，但不可調整營業目標。"}</p>
          </div>
          {targetMessage && <span className="chip warn">{targetMessage}</span>}
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr>
                <th>門店</th>
                <th>本月目標</th>
                <th>每日目標</th>
                <th>今日營收</th>
                <th>今日達成率</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const monthlyTarget = Number(targetDrafts[report.store_id] || 0);
                const dailyTarget = monthlyTarget / daysInMonth(today);
                return (
                  <tr key={`target-${report.store_id}`}>
                    <td><strong>{report.name}</strong><span>{report.manager_name || report.store_code}</span></td>
                    <td>
                      <input
                        className="table-input"
                        type="number"
                        value={targetDrafts[report.store_id] || 0}
                        disabled={!canEditTargets}
                        onChange={(event) => setTargetDrafts({ ...targetDrafts, [report.store_id]: event.target.value })}
                      />
                    </td>
                    <td>{money(dailyTarget)}</td>
                    <td>{money(totalRevenue(report))}</td>
                    <td><Progress value={(totalRevenue(report) / Math.max(1, dailyTarget)) * 100} /></td>
                    <td>{canEditTargets ? <button disabled={savingTargetId === report.store_id} onClick={() => saveMonthlyTarget(report)}>儲存</button> : <span className="chip neutral">唯讀</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>每日營收情況</h2>
            <p>依日期列出各店 14:00、19:00、打烊與全日總營收，點選門店可進入明細。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>門店</th>
                <th>日期</th>
                <th>14:00</th>
                <th>19:00</th>
                <th>打烊</th>
                <th>總營收</th>
                <th>達成率</th>
                <th>庫存</th>
                <th>現金差異</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {dailyRevenueRows.map((report) => (
                <tr key={`${report.store_id}-${report.report_date}`} onClick={() => onSelect(report.store_id)}>
                  <td><strong>{report.name}</strong><span>{report.manager_name || report.store_code}</span></td>
                  <td>{report.report_date}</td>
                  <td>{money(report.opened_to_1400_revenue)}</td>
                  <td>{money(report.revenue_1400_to_1900)}</td>
                  <td>{money(report.revenue_1900_to_close)}</td>
                  <td><strong>{money(totalRevenue(report))}</strong></td>
                  <td><Progress value={(totalRevenue(report) / report.target) * 100} /></td>
                  <td>{report.inventory_status}</td>
                  <td className={report.cash_difference < 0 ? "negative" : ""}>{report.cash_difference ?? "未填"}</td>
                  <td><span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>近四週週營收對比</h2>
            <p>週一至週日彙總，含 14:00、19:00、打烊、全日營收與較前週增減。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>週別</th>
                <th>門店</th>
                <th>14:00</th>
                <th>19:00</th>
                <th>打烊</th>
                <th>全日營收</th>
                <th>較前週</th>
              </tr>
            </thead>
            <tbody>
              {weeklyRevenueRows.map((row) => (
                <tr key={`${row.storeId}-${row.weekStart}`}>
                  <td>{row.weekLabel}</td>
                  <td><strong>{row.storeName}</strong></td>
                  <td>{money(row.opened_to_1400_revenue)}</td>
                  <td>{money(row.revenue_1400_to_1900)}</td>
                  <td>{money(row.revenue_1900_to_close)}</td>
                  <td><strong>{money(row.total)}</strong></td>
                  <td className={row.growth < 0 ? "negative" : "positive"}>{row.growthLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>各門市產品使用量</h2>
            <p>以品項為主比較各店使用量；高於同品項平均 20% 標示強，低於平均 20% 標示弱。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr>
                <th>品項</th>
                <th>單位</th>
                {usageMatrix.stores.map((storeName) => <th key={storeName}>{storeName}</th>)}
                <th>最高店</th>
                <th>最低店</th>
              </tr>
            </thead>
            <tbody>
              {usageMatrix.products.map((row) => (
                <tr key={row.productName}>
                  <td><strong>{row.productName}</strong></td>
                  <td>{row.unit}</td>
                  {usageMatrix.stores.map((storeName) => (
                    <td key={`${row.productName}-${storeName}`} className={row.cells[storeName]?.tone || ""}>
                      {numberText(row.cells[storeName]?.value || 0)}
                    </td>
                  ))}
                  <td>{row.bestStore || "-"}</td>
                  <td>{row.weakStore || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HqOperationsView({ rows }) {
  const visibleRows = rows.filter((row) => row.currentTotal || row.previousTotal).slice(0, 80);
  return (
    <section className="panel wide">
      <div className="panel-head">
        <div>
          <h2>營運視圖</h2>
          <p>各店本週同星期對比上週同星期，快速看出哪一天成長、哪一天下滑。</p>
        </div>
      </div>
      <div className="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>門店</th>
              <th>星期</th>
              <th>本週日期</th>
              <th>本週 14:00</th>
              <th>本週 19:00</th>
              <th>本週打烊</th>
              <th>本週總額</th>
              <th>上週日期</th>
              <th>上週 14:00</th>
              <th>上週 19:00</th>
              <th>上週打烊</th>
              <th>上週總額</th>
              <th>總額差</th>
              <th>成長率</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.storeCode}-${row.currentDate}`}>
                <td><strong>{row.storeName}</strong><span>{row.storeCode}</span></td>
                <td>{row.weekday}</td>
                <td>{row.currentDate}</td>
                <td>{money(row.current?.opened_to_1400_revenue)}</td>
                <td>{money(row.current?.revenue_1400_to_1900)}</td>
                <td>{money(row.current?.revenue_1900_to_close)}</td>
                <td>{money(row.currentTotal)}</td>
                <td>{row.previousDate}</td>
                <td>{money(row.previous?.opened_to_1400_revenue)}</td>
                <td>{money(row.previous?.revenue_1400_to_1900)}</td>
                <td>{money(row.previous?.revenue_1900_to_close)}</td>
                <td>{money(row.previousTotal)}</td>
                <td className={row.delta < 0 ? "negative" : row.delta > 0 ? "positive" : ""}>{money(row.delta)}</td>
                <td><span className={`chip ${revenueDeltaTone(row.delta)}`}>{pct(row.growth)}</span></td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td colSpan="14">目前尚無足夠資料可做週對週同日比較。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HqReportRecords({
  reports,
  products,
  canManageReports,
  canConfirmReports,
  onSelect,
  onSaveReport,
  onDeleteReport,
  onBulkDeleteReports,
  onNotify,
  onRefresh,
}) {
  const defaultMonth = getMonthRange(today);
  const [dateFrom, setDateFrom] = useState(defaultMonth.start);
  const [dateTo, setDateTo] = useState(today);
  const [storeFilter, setStoreFilter] = useState("all");
  const [records, setRecords] = useState(reports);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [tab, setTab] = useState("sales");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeRequests, setChangeRequests] = useState([]);
  const [workflowBusyId, setWorkflowBusyId] = useState("");

  useEffect(() => {
    setRecords(reports);
  }, [reports]);

  useEffect(() => {
    let active = true;
    async function loadChangeRequests() {
      try {
        const rows = await fetchDailyReportChangeRequests(reports.map((report) => report.id));
        if (active) setChangeRequests(rows);
      } catch {
        if (active) setChangeRequests([]);
      }
    }
    loadChangeRequests();
    return () => {
      active = false;
    };
  }, [reports]);

  async function loadRecords() {
    setLoading(true);
    try {
      const { reports: rows } = await fetchHqDashboardData(dateFrom, dateTo);
      setRecords(rows);
      setChangeRequests(await fetchDailyReportChangeRequests(rows.map((report) => report.id)));
      onNotify?.("各門店回報紀錄已更新");
    } catch (error) {
      onNotify?.(`回報紀錄讀取失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function confirmReport(report) {
    if (!canConfirmReports || !report?.id || report.status !== "submitted") return;
    setWorkflowBusyId(report.id);
    try {
      await reviewReport(report.id, "approve", "總部確認並鎖定", "approved");
      setRecords((rows) => rows.map((row) => (
        row.id === report.id ? { ...row, status: "approved" } : row
      )));
      onNotify?.(`${report.name} ${report.report_date} 已確認並鎖定`);
      onRefresh?.();
    } catch (error) {
      onNotify?.(`確認失敗：${error.message}`);
    } finally {
      setWorkflowBusyId("");
    }
  }

  async function reviewChangeRequest(request, decision) {
    if (!canConfirmReports) return;
    setWorkflowBusyId(request.id);
    try {
      const reviewNote = decision === "approved" ? "核准門店修改" : "維持總部確認資料";
      await reviewDailyReportChangeRequest(request.id, decision, reviewNote);
      setChangeRequests((rows) => rows.map((row) => (
        row.id === request.id ? { ...row, status: decision, review_note: reviewNote } : row
      )));
      if (decision === "approved") {
        setRecords((rows) => rows.map((row) => (
          row.id === request.report_id ? { ...row, status: "needs_revision" } : row
        )));
      }
      onNotify?.(decision === "approved" ? "修改申請已核准，門店可重新填寫" : "修改申請已駁回");
      onRefresh?.();
    } catch (error) {
      onNotify?.(`申請處理失敗：${error.message}`);
    } finally {
      setWorkflowBusyId("");
    }
  }

  async function openEdit(report) {
    if (!report?.id) {
      onNotify?.("此門店尚無回報資料可修改");
      return;
    }
    setSelected(report);
    setTab("sales");
    setForm({
      opened_to_1400_revenue: report.opened_to_1400_revenue ?? "",
      revenue_1400_to_1900: report.revenue_1400_to_1900 ?? "",
      full_day_revenue: totalRevenue(report) || "",
      cash_difference: report.cash_difference ?? "",
      manager_note: report.manager_note || "",
      delivery_revenue: report.delivery_revenue ?? 0,
      actual_staff_count: report.actual_staff_count ?? report.scheduled_staff_count ?? 0,
      staffing_variance_reason: report.staffing_variance_reason || "",
      customer_complaint_count: report.customer_complaint_count ?? 0,
      customer_complaint_detail: report.customer_complaint_detail || "",
      equipment_issue: Boolean(report.equipment_issue),
      equipment_issue_detail: report.equipment_issue_detail || "",
      special_event: report.special_event || "",
    });
    setInventory(products.map(blankInventoryProduct));
    try {
      const [savedRows, previousRows] = await Promise.all([
        fetchInventoryCounts(report.id),
        fetchPreviousInventoryCounts(report.store_id, report.report_date),
      ]);
      setInventory(mergeInventoryRows(products, savedRows, previousRows));
    } catch (error) {
      onNotify?.(`庫存資料讀取失敗：${error.message}`);
    }
  }

  async function saveSelected() {
    if (!selected || !form) return;
    setSaving(true);
    try {
      const ok = await onSaveReport(selected, form, inventory);
      if (ok) {
        setSelected(null);
        await loadRecords();
        onRefresh?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function clearSelected(report) {
    const ok = await onDeleteReport(report);
    if (ok) {
      setRecords((currentRows) => currentRows.filter((row) => row.id !== report.id));
      if (selected?.id === report.id) {
        setSelected(null);
        setForm(null);
        setInventory([]);
      }
      onRefresh?.();
    }
  }

  async function clearVisibleRecords() {
    if (!canManageReports) {
      onNotify?.("此帳號沒有總部清除每日資料權限");
      return;
    }
    const targetIds = new Set(visibleRows.map((row) => row.id).filter(Boolean));
    const ok = await onBulkDeleteReports?.(visibleRows);
    if (ok) {
      setRecords((currentRows) => currentRows.filter((row) => !targetIds.has(row.id)));
      if (selected?.id && targetIds.has(selected.id)) {
        setSelected(null);
        setForm(null);
        setInventory([]);
      }
      onRefresh?.();
    }
  }

  const storeOptions = Array.from(new Map(records.map((row) => [row.store_id, row.name])).entries());
  const pendingChangeRequests = changeRequests.filter((request) => request.status === "pending");
  const visibleRows = buildDailyRevenueRows(records)
    .filter((row) => storeFilter === "all" || row.store_id === storeFilter);
  const computedCloseRevenue = form
    ? Math.max(0, numericValue(form.full_day_revenue) - numericValue(form.opened_to_1400_revenue) - numericValue(form.revenue_1400_to_1900))
    : 0;
  const revenueInvalid = form
    ? numericValue(form.full_day_revenue) < numericValue(form.opened_to_1400_revenue) + numericValue(form.revenue_1400_to_1900)
    : false;

  return (
    <section className="panel wide hq-report-records">
      <div className="panel-head">
        <div>
          <h2>各門店回報紀錄</h2>
          <p>總部可查詢各門店每日營收、庫存、調貨紀錄，並依權限修改或清除單日資料。</p>
        </div>
        <span className="chip neutral">使用量 = 昨日庫存 - 今日庫存</span>
      </div>
      <div className="record-toolbar">
        <label>
          起日
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          迄日
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <label>
          門店
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
            <option value="all">全部門店</option>
            {storeOptions.map(([storeId, storeName]) => <option key={storeId} value={storeId}>{storeName}</option>)}
          </select>
        </label>
        <button className="primary" onClick={loadRecords} disabled={loading}>{loading ? "讀取中..." : "查詢紀錄"}</button>
        <button className="danger" onClick={clearVisibleRecords} disabled={!canManageReports || !visibleRows.some((row) => row.id)}>一鍵清除</button>
      </div>
      {pendingChangeRequests.length > 0 && (
        <div className="daily-change-request-list">
          <div className="panel-head">
            <div>
              <h3>門店修改申請</h3>
              <p>核准後門店可重新填寫；重新送出後仍需總部再次確認。</p>
            </div>
            <span className="chip warn">{pendingChangeRequests.length} 筆待處理</span>
          </div>
          {pendingChangeRequests.map((request) => {
            const targetReport = records.find((report) => report.id === request.report_id);
            return (
              <div className="daily-change-request-row" key={request.id}>
                <div>
                  <strong>{targetReport?.name || "門店回報"}</strong>
                  <span>{targetReport?.report_date || ""}</span>
                  <p>{request.reason}</p>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={!canConfirmReports || workflowBusyId === request.id}
                    onClick={() => reviewChangeRequest(request, "approved")}
                  >
                    核准修改
                  </button>
                  <button
                    type="button"
                    disabled={!canConfirmReports || workflowBusyId === request.id}
                    onClick={() => reviewChangeRequest(request, "rejected")}
                  >
                    駁回
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>門店</th>
              <th>14:00</th>
              <th>19:00</th>
              <th>打烊</th>
              <th>總營收</th>
              <th>外送</th>
              <th>員工餐</th>
              <th>人力</th>
              <th>客訴</th>
              <th>設備／事件</th>
              <th>現金差異</th>
              <th>狀態</th>
              <th>總部操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((report) => (
              <tr key={`${report.store_id}-${report.report_date}`} onClick={() => onSelect?.(report.store_id)}>
                <td>{report.report_date}</td>
                <td><strong>{report.name}</strong><span>{report.store_code || report.manager_name}</span></td>
                <td>{money(report.opened_to_1400_revenue)}</td>
                <td>{money(report.revenue_1400_to_1900)}</td>
                <td>{money(report.revenue_1900_to_close)}</td>
                <td><strong>{money(totalRevenue(report))}</strong></td>
                <td>{money(report.delivery_revenue)}</td>
                <td>{money(report.employee_meal_total)}</td>
                <td>
                  <strong>{Number(report.actual_staff_count || 0)} 人</strong>
                  <span>班表 {Number(report.scheduled_staff_count || 0)} 人</span>
                </td>
                <td className={Number(report.customer_complaint_count || 0) > 0 ? "negative" : ""}>
                  {Number(report.customer_complaint_count || 0)} 件
                </td>
                <td>
                  {report.equipment_issue ? <span className="chip warn">設備異常</span> : null}
                  {report.special_event ? <span className="chip neutral">特殊事件</span> : null}
                  {!report.equipment_issue && !report.special_event ? "-" : null}
                </td>
                <td className={report.cash_difference < 0 ? "negative" : ""}>{report.cash_difference ?? "-"}</td>
                <td><span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span></td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={!canConfirmReports || report.status !== "submitted" || workflowBusyId === report.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      confirmReport(report);
                    }}
                  >
                    {report.status === "approved" ? "已鎖定" : "確認鎖定"}
                  </button>
                  <button type="button" disabled={!canManageReports || !report.id} onClick={(event) => { event.stopPropagation(); openEdit(report); }}>修改</button>
                  <button type="button" className="danger" disabled={!canManageReports || !report.id} onClick={(event) => { event.stopPropagation(); clearSelected(report); }}>清除</button>
                </td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td colSpan="13">目前查無回報紀錄</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && form && (
        <div className="modal-backdrop">
          <section className="report-edit-dialog">
            <div className="panel-head">
              <div>
                <h2>{selected.name} {selected.report_date}</h2>
                <p>庫存為當日盤點後剩餘數，調貨/進貨僅作來源紀錄，使用量由昨日庫存減今日庫存。</p>
              </div>
              <button type="button" onClick={() => setSelected(null)}>關閉</button>
            </div>
            <div className="segments">
              <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>營收</button>
              <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>庫存</button>
              <button className={tab === "incoming" ? "active" : ""} onClick={() => setTab("incoming")}>調貨/進貨</button>
            </div>
            {tab === "sales" ? (
              <div className="mobile-stack">
                <RevenueInput label="14:00" helper="開店至 14:00" value={form.opened_to_1400_revenue} onChange={(value) => setForm({ ...form, opened_to_1400_revenue: value })} />
                <RevenueInput label="19:00" helper="14:00 至 19:00" value={form.revenue_1400_to_1900} onChange={(value) => setForm({ ...form, revenue_1400_to_1900: value })} />
                <RevenueInput label="全日總營收" helper="當日打烊總營收" value={form.full_day_revenue} onChange={(value) => setForm({ ...form, full_day_revenue: value })} />
                <div className="input-card calculated-card">
                  <span>19:00 後至打烊<small>全日總營收 - 14:00 - 19:00</small></span>
                  <strong>{money(computedCloseRevenue)}</strong>
                </div>
                <RevenueInput label="現金差異" helper="盤點現金差異" value={form.cash_difference} onChange={(value) => setForm({ ...form, cash_difference: value })} />
                <label className="note-box">
                  <span>門店備註</span>
                  <textarea value={form.manager_note} onChange={(event) => setForm({ ...form, manager_note: event.target.value })} />
                </label>
                {revenueInvalid && <div className="alert-line danger">全日總營收不可小於 14:00 與 19:00 加總。</div>}
              </div>
            ) : tab === "inventory" ? (
              <InventoryEditor rows={inventory} onChange={setInventory} />
            ) : (
              <IncomingEditor rows={inventory} onChange={setInventory} />
            )}
            <div className="dialog-actions">
              <button type="button" onClick={() => setSelected(null)}>取消</button>
              <button type="button" className="primary" disabled={saving || revenueInvalid} onClick={saveSelected}>{saving ? "儲存中..." : "儲存修改"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function buildRevenueSummary(rows) {
  const weekRange = getWeekRange(today);
  const monthRange = getMonthRange(today);
  return rows.reduce(
    (summary, report) => {
      const revenue = totalRevenue(report);
      if (report.report_date === today) summary.daily += revenue;
      if (report.report_date >= weekRange.start && report.report_date <= weekRange.end) summary.week += revenue;
      if (report.report_date >= monthRange.start && report.report_date <= monthRange.end) summary.month += revenue;
      return summary;
    },
    { daily: 0, week: 0, month: 0 },
  );
}

function buildDailyRevenueRows(rows) {
  return [...rows].sort((a, b) => {
    const dateCompare = String(b.report_date || "").localeCompare(String(a.report_date || ""));
    if (dateCompare) return dateCompare;
    return String(a.store_code || a.name || "").localeCompare(String(b.store_code || b.name || ""), "zh-Hant");
  });
}

function buildWeeklyRevenueRows(rows, weekRanges) {
  const byStoreWeek = new Map();
  const weekByDate = new Map();
  weekRanges.forEach((week) => {
    for (let date = week.start; date <= week.end; date = addDays(date, 1)) {
      weekByDate.set(date, week);
    }
  });

  rows.forEach((report) => {
    const week = weekByDate.get(report.report_date);
    if (!week) return;
    const storeId = report.store_id || report.id || report.store_code;
    const key = `${storeId}-${week.start}`;
    if (!byStoreWeek.has(key)) {
      byStoreWeek.set(key, {
        storeId,
        storeName: report.name,
        storeCode: report.store_code,
        weekStart: week.start,
        weekLabel: week.label,
        opened_to_1400_revenue: 0,
        revenue_1400_to_1900: 0,
        revenue_1900_to_close: 0,
        total: 0,
      });
    }
    const item = byStoreWeek.get(key);
    item.opened_to_1400_revenue += Number(report.opened_to_1400_revenue || 0);
    item.revenue_1400_to_1900 += Number(report.revenue_1400_to_1900 || 0);
    item.revenue_1900_to_close += Number(report.revenue_1900_to_close || 0);
    item.total += totalRevenue(report);
  });

  const rowsOut = Array.from(byStoreWeek.values()).sort((a, b) => (
    String(b.weekStart).localeCompare(String(a.weekStart)) ||
    String(a.storeCode || a.storeName || "").localeCompare(String(b.storeCode || b.storeName || ""), "zh-Hant")
  ));
  const previousByStore = new Map();
  return rowsOut
    .slice()
    .sort((a, b) => String(a.weekStart).localeCompare(String(b.weekStart)))
    .map((row) => {
      const previous = previousByStore.get(row.storeId);
      const growth = previous ? ((row.total - previous.total) / Math.max(1, previous.total)) * 100 : null;
      previousByStore.set(row.storeId, row);
      return {
        ...row,
        growth,
        growthLabel: growth === null ? "首週" : `${growth >= 0 ? "+" : ""}${pct(growth)}`,
      };
    })
    .sort((a, b) => (
      String(b.weekStart).localeCompare(String(a.weekStart)) ||
      String(a.storeCode || a.storeName || "").localeCompare(String(b.storeCode || b.storeName || ""), "zh-Hant")
    ));
}

function buildUsageMatrix(rows) {
  const stores = Array.from(new Set(rows.map((row) => row.storeName))).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const byProduct = new Map();
  rows.forEach((row) => {
    if (!byProduct.has(row.productName)) {
      byProduct.set(row.productName, {
        productName: row.productName,
        unit: displayUnitForProduct(row.productName),
        cells: {},
      });
    }
    byProduct.get(row.productName).cells[row.storeName] = Number(row.month || row.week || row.daily || 0);
  });

  return {
    stores,
    products: Array.from(byProduct.values())
      .sort((a, b) => PRODUCT_ORDER.indexOf(a.productName) - PRODUCT_ORDER.indexOf(b.productName))
      .map((product) => {
        const values = stores.map((storeName) => Number(product.cells[storeName] || 0));
        const activeValues = values.filter((value) => value > 0);
        const average = activeValues.length ? activeValues.reduce((sum, value) => sum + value, 0) / activeValues.length : 0;
        let bestStore = "";
        let weakStore = "";
        let bestValue = -Infinity;
        let weakValue = Infinity;
        const cells = {};
        stores.forEach((storeName) => {
          const value = Number(product.cells[storeName] || 0);
          if (value > bestValue) {
            bestValue = value;
            bestStore = storeName;
          }
          if (value < weakValue) {
            weakValue = value;
            weakStore = storeName;
          }
          cells[storeName] = {
            value,
            tone: average && value >= average * 1.2 ? "usage-strong" : average && value <= average * 0.8 ? "usage-weak" : "",
          };
        });
        return { ...product, cells, bestStore, weakStore };
      }),
  };
}

function buildDataQualitySummary(reports, handovers = [], performanceRows = []) {
  const issues = [];
  reports.forEach((report) => {
    const revenue = totalRevenue(report);
    const storeId = report.store_id || report.id;
    if (report.status === "draft" || !report.id) {
      issues.push({ storeId, storeName: report.name, level: "bad", type: "缺報", message: "今日尚未完成每日回報" });
    }
    if (report.status === "submitted") {
      issues.push({ storeId, storeName: report.name, level: "warn", type: "待審核", message: "已送出但尚未完成營運審核" });
    }
    if (report.status === "follow_up" || report.status === "needs_revision") {
      issues.push({ storeId, storeName: report.name, level: "bad", type: "待追蹤", message: "此店回報需追蹤或退回修改" });
    }
    if (!Number(report.target || 0) || !Number(report.target_monthly_revenue || 0)) {
      issues.push({ storeId, storeName: report.name, level: "warn", type: "目標未完整", message: "月目標或日目標尚未完整設定" });
    }
    if (revenue <= 0 && report.status !== "draft") {
      issues.push({ storeId, storeName: report.name, level: "bad", type: "營收異常", message: "已回報但全日營收為 0" });
    }
    if (Number(report.revenue_1900_to_close || 0) < 0) {
      issues.push({ storeId, storeName: report.name, level: "bad", type: "營收倒算異常", message: "19:00 至打烊營收小於 0，需重填全日總營收" });
    }
    if (Math.abs(Number(report.cash_difference || 0)) >= 500) {
      issues.push({ storeId, storeName: report.name, level: "warn", type: "現金差異", message: `現金差異 ${report.cash_difference}，需店長說明` });
    }
  });
  handovers.forEach((handover) => {
    const storeId = handover.store_id;
    if (handover.status === "需追蹤") {
      issues.push({ storeId, storeName: handover.storeName, level: "bad", type: "交接追蹤", message: `${handover.shift_type} 交接仍有待辦或異常` });
    }
    if (handover.cash_status && handover.cash_status !== "正常") {
      issues.push({ storeId, storeName: handover.storeName, level: "warn", type: "交接現金", message: `${handover.shift_type} 現金狀態：${handover.cash_status}` });
    }
    if (handover.cleaning_status && handover.cleaning_status !== "完成") {
      issues.push({ storeId, storeName: handover.storeName, level: "warn", type: "清潔未完", message: `${handover.shift_type} 清潔狀態：${handover.cleaning_status}` });
    }
  });
  performanceRows.forEach((row) => {
    const storeId = row.store_id;
    if (Number(row.score || 0) < 80 || row.status === "需輔導") {
      issues.push({ storeId, storeName: row.storeName, level: "bad", type: "績效輔導", message: `${row.employee_name} ${row.score} 分，需排定改善追蹤` });
    } else if (Number(row.score || 0) < 85 || row.status === "提醒") {
      issues.push({ storeId, storeName: row.storeName, level: "warn", type: "績效提醒", message: `${row.employee_name} ${row.score} 分，建議店長先約談` });
    }
  });
  return {
    issues,
    missing: issues.filter((issue) => issue.type === "缺報").length,
    critical: issues.filter((issue) => issue.level === "bad").length,
    warning: issues.filter((issue) => issue.level === "warn").length,
  };
}

function DataQualityPanel({ summary, onSelect }) {
  return (
    <section className="panel wide data-quality-panel">
      <div className="panel-head">
        <div>
          <h2>資料完整性稽核</h2>
          <p>總部每日先看這裡，優先處理缺報、未審核、待追蹤與異常數據。</p>
        </div>
        <div className="data-quality-stats">
          <span>缺報 {summary.missing}</span>
          <span>重大 {summary.critical}</span>
          <span>提醒 {summary.warning}</span>
        </div>
      </div>
      <div className="quality-list">
        {summary.issues.slice(0, 8).map((issue, index) => (
          <button className={`quality-item ${issue.level}`} key={`${issue.storeId}-${issue.type}-${index}`} onClick={() => onSelect(issue.storeId)}>
            <span>{issue.type}</span>
            <strong>{issue.storeName}</strong>
            <em>{issue.message}</em>
          </button>
        ))}
        {!summary.issues.length && <div className="quality-empty">今日資料完整，暫無重大缺漏。</div>}
      </div>
    </section>
  );
}

function isNamedProductName(name) {
  return Boolean(name && name !== "未命名品項");
}

function downloadTextFile(text, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function csvSection(title, headers, rows) {
  return [
    [title],
    headers,
    ...rows,
    [],
  ].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function buildOperationsCsv({ reports, periodReports, inventoryRows, products, weekRange, monthRange }) {
  const activePeriodReports = periodReports.length ? periodReports : reports;
  const dailyReports = activePeriodReports.filter((report) => report.report_date === today);
  const weeklyReports = activePeriodReports.filter((report) => report.report_date >= weekRange.start && report.report_date <= weekRange.end);
  const monthlyReports = activePeriodReports.filter((report) => report.report_date >= monthRange.start && report.report_date <= monthRange.end);
  const productNames = new Map(products.map((product) => [product.id, product.name]));

  const revenueHeaders = ["期間", "日期範圍", "門店代碼", "門店", "店長", "14:00營收", "19:00營收", "打烊營收", "總營收", "現金差異", "回報天數", "狀態"];
  const dailyRevenueRows = dailyReports.map((report) => revenueRow("每日", today, report));
  const weeklyRevenueRows = aggregateRevenueByStore(weeklyReports).map((row) => aggregateRevenueRow("每週", `${weekRange.start} 至 ${weekRange.end}`, row));
  const monthlyRevenueRows = aggregateRevenueByStore(monthlyReports).map((row) => aggregateRevenueRow("每月", `${monthRange.start} 至 ${monthRange.end}`, row));

  const usageHeaders = ["期間", "日期範圍", "日期", "門店", "品項", "調貨/進貨", "來源", "昨日庫存", "今日盤點庫存", "報廢", "使用量", "備註"];
  const dailyUsageRows = buildUsageDetailRows({
    label: "每日",
    rangeLabel: today,
    reports: dailyReports,
    inventoryRows,
    productNames,
    aggregate: false,
  });
  const weeklyUsageRows = buildUsageDetailRows({
    label: "每週",
    rangeLabel: `${weekRange.start} 至 ${weekRange.end}`,
    reports: weeklyReports,
    inventoryRows,
    productNames,
    aggregate: true,
  });
  const monthlyUsageRows = buildUsageDetailRows({
    label: "每月",
    rangeLabel: `${monthRange.start} 至 ${monthRange.end}`,
    reports: monthlyReports,
    inventoryRows,
    productNames,
    aggregate: true,
  });

  return [
    csvSection("營收：每日各店", revenueHeaders, dailyRevenueRows),
    csvSection("營收：每週各店", revenueHeaders, weeklyRevenueRows),
    csvSection("營收：每月各店", revenueHeaders, monthlyRevenueRows),
    csvSection("使用量：每日各店", usageHeaders, dailyUsageRows),
    csvSection("使用量：每週各店", usageHeaders, weeklyUsageRows),
    csvSection("使用量：每月各店", usageHeaders, monthlyUsageRows),
  ].join("\n");
}

function revenueRow(label, rangeLabel, report) {
  return [
    label,
    rangeLabel,
    report.store_code,
    report.name,
    report.manager_name,
    report.opened_to_1400_revenue,
    report.revenue_1400_to_1900,
    report.revenue_1900_to_close,
    totalRevenue(report),
    report.cash_difference ?? "",
    1,
    statusLabel(report.status),
  ];
}

function aggregateRevenueByStore(rows) {
  const byStore = new Map();
  rows.forEach((report) => {
    const key = report.store_id || report.id || report.store_code;
    if (!byStore.has(key)) {
      byStore.set(key, {
        ...report,
        opened_to_1400_revenue: 0,
        revenue_1400_to_1900: 0,
        revenue_1900_to_close: 0,
        cash_difference: 0,
        days: new Set(),
      });
    }
    const item = byStore.get(key);
    item.opened_to_1400_revenue += Number(report.opened_to_1400_revenue || 0);
    item.revenue_1400_to_1900 += Number(report.revenue_1400_to_1900 || 0);
    item.revenue_1900_to_close += Number(report.revenue_1900_to_close || 0);
    item.cash_difference += Number(report.cash_difference || 0);
    item.days.add(report.report_date);
  });
  return Array.from(byStore.values());
}

function aggregateRevenueRow(label, rangeLabel, row) {
  return [
    label,
    rangeLabel,
    row.store_code,
    row.name,
    row.manager_name,
    row.opened_to_1400_revenue,
    row.revenue_1400_to_1900,
    row.revenue_1900_to_close,
    totalRevenue(row),
    row.cash_difference,
    row.days.size,
    "",
  ];
}

function buildUsageDetailRows({ label, rangeLabel, reports, inventoryRows, productNames, aggregate }) {
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const relevantRows = inventoryRows
    .map((row) => ({ row, report: reportsById.get(row.report_id) }))
    .filter(({ row, report }) => report && isNamedProductName(row.name || productNames.get(row.product_id)));

  if (!aggregate) {
    return relevantRows.map(({ row, report }) => {
      const productName = row.name || productNames.get(row.product_id);
      return [
        label,
        rangeLabel,
        report.report_date,
        report.name,
        productName,
        Number(row.incoming_count || 0),
        row.incoming_source || "廠商進貨",
        toManagementQuantity(row, "previous_stock"),
        toManagementQuantity(row, "current_stock"),
        Number(row.loss_count || 0),
        usageCount(row),
        row.transfer_note || "",
      ];
    });
  }

  const byStoreProduct = new Map();
  relevantRows.forEach(({ row, report }) => {
    const productName = row.name || productNames.get(row.product_id);
    const key = `${report.store_id || report.id}-${row.product_id}`;
    if (!byStoreProduct.has(key)) {
      byStoreProduct.set(key, {
        latestDate: "",
        storeName: report.name,
        productName,
        incoming: 0,
        sourceSet: new Set(),
        currentStock: 0,
        previousStock: 0,
        loss: 0,
        usage: 0,
        noteSet: new Set(),
      });
    }
    const item = byStoreProduct.get(key);
    item.incoming += Number(row.incoming_count || 0);
    item.loss += Number(row.loss_count || 0);
    item.usage += usageCount(row);
    item.previousStock += toManagementQuantity(row, "previous_stock");
    if (row.incoming_source) item.sourceSet.add(row.incoming_source);
    if (row.transfer_note) item.noteSet.add(row.transfer_note);
    if (!item.latestDate || report.report_date >= item.latestDate) {
      item.latestDate = report.report_date;
      item.currentStock = toManagementQuantity(row, "current_stock");
    }
  });

  return Array.from(byStoreProduct.values()).map((item) => [
    label,
    rangeLabel,
    item.latestDate,
    item.storeName,
    item.productName,
    item.incoming,
    Array.from(item.sourceSet).join(" / ") || "廠商進貨",
    item.previousStock,
    item.currentStock,
    item.loss,
    item.usage,
    Array.from(item.noteSet).join("；"),
  ]);
}

function buildUsageSummary(dailyReports, products, periodReports, inventoryRows) {
  const weekRange = getWeekRange(today);
  const monthRange = getMonthRange(today);
  const reportsById = new Map((periodReports.length ? periodReports : dailyReports).map((report) => [report.id, report]));
  const storeNames = new Map(dailyReports.map((report) => [report.store_id || report.id, report.name]));
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const rowsByKey = new Map();
  const summary = { daily: 0, week: 0, month: 0, rows: [] };

  inventoryRows.forEach((row) => {
    const report = reportsById.get(row.report_id);
    if (!report) return;
    const productName = row.name || productNames.get(row.product_id);
    if (!isNamedProductName(productName)) return;
    const amount = usageCount(row);
    const storeId = report.store_id || report.id;
    const productId = row.product_id;
    const key = `${storeId}-${productId}`;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        storeId,
        productId,
        storeName: report.name || storeNames.get(storeId) || "未命名門店",
        productName,
        daily: 0,
        week: 0,
        month: 0,
      });
    }
    const item = rowsByKey.get(key);
    if (report.report_date === today) {
      item.daily += amount;
      summary.daily += amount;
    }
    if (report.report_date >= weekRange.start && report.report_date <= weekRange.end) {
      item.week += amount;
      summary.week += amount;
    }
    if (report.report_date >= monthRange.start && report.report_date <= monthRange.end) {
      item.month += amount;
      summary.month += amount;
    }
  });

  summary.rows = Array.from(rowsByKey.values()).sort((a, b) => a.storeName.localeCompare(b.storeName, "zh-Hant") || a.productName.localeCompare(b.productName, "zh-Hant"));
  return summary;
}

function performanceGrade(score) {
  const value = Number(score || 0);
  if (value >= 90) return "A";
  if (value >= 80) return "B";
  if (value >= 70) return "C";
  if (value >= 60) return "D";
  if (value >= 50) return "E";
  if (value >= 40) return "F";
  if (value >= 30) return "G";
  if (value >= 20) return "H";
  if (value >= 10) return "I";
  return "無季獎金";
}

function performanceStatus(score) {
  const value = Number(score || 0);
  if (value >= 90) return "正常";
  if (value >= 80) return "提醒";
  if (value >= 60) return "需輔導";
  return "需輔導";
}

function calculatePerformanceScore(form) {
  const lateMinutes = Number(form.late_count || 0);
  const lateDeduction = lateMinutes > 0 ? Math.ceil(lateMinutes / 5) * 2 : 0;
  const delayMinutes = Number(form.service_delay_count || 0);
  const delayDeduction = delayMinutes > 0 ? Math.ceil(delayMinutes / 5) * 2 - 1 : 0;
  const deductions =
    lateDeduction +
    Number(form.leave_count || 0) * 15 +
    Number(form.absence_count || 0) * 30 +
    delayDeduction;
  return Math.max(0, Math.min(100, 100 - deductions));
}

function performanceBonusAdjustment(score) {
  const value = Number(score || 0);
  if (value >= 90) return 0;
  if (value >= 80) return -3000;
  if (value >= 70) return -4000;
  if (value >= 60) return -5000;
  if (value >= 50) return -6000;
  if (value >= 40) return -7000;
  if (value >= 30) return -8000;
  if (value >= 20) return -9000;
  return -10000;
}

function applyPerformanceCalculation(form, patch = {}) {
  const next = { ...form, ...patch };
  const score = calculatePerformanceScore(next);
  return {
    ...next,
    score,
    grade: performanceGrade(score),
    bonus_adjustment: performanceBonusAdjustment(score),
    status: performanceStatus(score),
  };
}

function HrMasterModule({ stores, selectedStoreId, salaryRows, storeHours, staffRoster, currentRole, onSaveStaffMember, onDeleteStaffMember, onTransferStaffMember }) {
  const selectedStore = stores.find((store) => store.store_id === selectedStoreId || store.id === selectedStoreId);
  const normalizedSelectedName = normalizeStoreName(selectedStore?.name);
  const selectedStoreName = storeHours.find((row) => normalizeStoreName(row.storeName) === normalizedSelectedName)?.storeName || storeHours[0]?.storeName || "";
  const rosterByStore = staffRoster.filter((row) => normalizeStoreName(row.storeName) === normalizeStoreName(selectedStoreName));
  const managers = staffRoster.filter((row) => row.role === "店長" || row.role === "副店長");
  const activeStoreNames = storeHours.filter((row) => row.storeName !== "鳳山南華店").map((row) => row.storeName);
  const uncoveredStores = activeStoreNames.filter((storeName) => !managers.some((row) => normalizeStoreName(row.storeName) === normalizeStoreName(storeName)));
  const byRole = salaryRows.map((salary) => ({
    ...salary,
    count: staffRoster.filter((row) => row.role === salary.role || (salary.role === "送貨人員" && row.role === "送貨人員")).length,
  }));

  const editableStaffRoles = ["ceo", "coo", "cfo", "admin", "hq", "cso", "general_affairs"];
  const canEditStaff = editableStaffRoles.includes(currentRole);
  const storeOptions = useMemo(() => {
    const fromStores = stores.map((store) => ({ store_code: canonicalStoreCode(store), name: store.name }));
    const fromHours = storeHours.map((store) => ({ store_code: canonicalStoreCode(store), name: store.storeName }));
    return [...fromStores, ...fromHours]
      .filter((store) => store.store_code && store.name)
      .filter((store, index, rows) => rows.findIndex((item) => item.store_code === store.store_code) === index)
      .sort((a, b) => a.store_code.localeCompare(b.store_code));
  }, [stores, storeHours]);
  const roleOptions = useMemo(() => {
    return STAFF_ROLE_OPTIONS;
  }, []);
  const defaultStoreCode = canonicalStoreCode(selectedStore) || canonicalStoreCode({ storeName: selectedStoreName }) || storeOptions[0]?.store_code || "";
  const defaultStoreName = storeOptions.find((store) => store.store_code === defaultStoreCode)?.name || selectedStoreName || storeOptions[0]?.name || "";
  const [staffForm, setStaffForm] = useState(() => createStaffForm({
    storeCode: defaultStoreCode,
    storeName: defaultStoreName,
    roleName: roleOptions[0] || "",
  }));
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [staffSkills, setStaffSkills] = useState([]);
  const [skillForm, setSkillForm] = useState({ staff_id: "", positions: [], primary_position: "" });
  const [transferForm, setTransferForm] = useState({ staff_id: "", store_code: "", effective_from: "", reason: "" });

  useEffect(() => {
    let active = true;
    fetchStaffStoreAssignments()
      .then((rows) => { if (active) setStaffAssignments(rows); })
      .catch(() => { if (active) setStaffAssignments([]); });
    fetchStaffPositionSkills()
      .then((rows) => { if (active) setStaffSkills(rows); })
      .catch(() => { if (active) setStaffSkills([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (staffForm.store_code || !defaultStoreCode) return;
    setStaffForm((current) => ({ ...current, store_code: defaultStoreCode, store_name: defaultStoreName }));
  }, [defaultStoreCode, defaultStoreName, staffForm.store_code]);

  const selectedFormStore = storeOptions.find((store) => store.store_code === staffForm.store_code);

  function resetStaffForm() {
    setStaffForm(createStaffForm({
      storeCode: defaultStoreCode,
      storeName: defaultStoreName,
      roleName: roleOptions[0] || "",
    }));
  }

  function editStaff(row) {
    const code = canonicalStoreCode(row);
    const store = storeOptions.find((item) => item.store_code === code);
    setStaffForm(staffMemberToForm(row, {
      storeCode: code,
      storeName: store?.name || displayStoreName(row),
    }));
  }

  async function submitStaffForm(event) {
    event.preventDefault();
    const profile = buildStaffProfile(staffForm, {
      storeName: selectedFormStore?.name || staffForm.store_name,
    });
    if (!profile.valid) return window.alert(profile.message);
    const saved = await onSaveStaffMember?.(profile.payload);
    if (saved) resetStaffForm();
  }

  async function deleteStaff(row) {
    if (!window.confirm("確定停用 " + row.employeeName + "？停用後排假表不會再列入此人員。")) return;
    await onDeleteStaffMember?.(row);
    if (staffForm.id === row.id) resetStaffForm();
  }

  async function submitStaffTransfer(event) {
    event.preventDefault();
    const saved = await onTransferStaffMember?.(transferForm);
    if (!saved) return;
    setStaffAssignments(await fetchStaffStoreAssignments());
    setTransferForm({ staff_id: "", store_code: "", effective_from: "", reason: "" });
  }

  async function submitStaffSkills(event) {
    event.preventDefault();
    try {
      await saveStaffPositionSkills(skillForm);
      setStaffSkills(await fetchStaffPositionSkills());
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="人員主檔" value={`${staffRoster.length} 人`} detail="來自 00AI人資.xlsx" />
        <Metric label="營運門店" value={`${activeStoreNames.length} 間`} detail="鳳山南華店暫停不列入" />
        <Metric label="有主管門店" value={`${new Set(managers.map((row) => row.storeName)).size} 間`} detail="店長或副店長" tone="good" />
        <Metric label="主管缺口" value={`${uncoveredStores.length} 間`} detail={uncoveredStores[0] || "目前無缺口"} tone={uncoveredStores.length ? "bad" : "good"} />
        <Metric label="高峰需人力" value={`${storeHours.reduce((sum, row) => sum + Number(row.duty_staff || 0), 0)} 人`} detail="各店值班人員合計" />
      </section>

            <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>總部人員主檔維護</h2>
            <p>總部可直接編輯各店人員姓名與職稱；儲存後會同步成為排假表的人員來源。</p>
          </div>
          <div className="panel-actions">
            <button type="button" onClick={resetStaffForm}>新增人員</button>
          </div>
        </div>
        {canEditStaff ? (
          <form className="staff-admin-grid" onSubmit={submitStaffForm}>
            <label>
              門店
              <select
                value={staffForm.store_code}
                onChange={(event) => {
                  const store = storeOptions.find((item) => item.store_code === event.target.value);
                  setStaffForm({ ...staffForm, store_code: event.target.value, store_name: store?.name || "" });
                }}
              >
                {storeOptions.map((store) => (
                  <option key={store.store_code} value={store.store_code}>{store.store_code} {store.name}</option>
                ))}
              </select>
            </label>
            <label>
              人員姓名
              <input value={staffForm.employee_name} onChange={(event) => setStaffForm({ ...staffForm, employee_name: event.target.value })} placeholder="輸入姓名" />
            </label>
            <label>
              僱用型態
              <select
                value={staffForm.employment_type}
                onChange={(event) => {
                  const employmentType = event.target.value;
                  setStaffForm({
                    ...staffForm,
                    employment_type: employmentType,
                    holiday_start_time: employmentType === "兼職" ? staffForm.holiday_start_time : staffForm.weekday_start_time,
                    holiday_end_time: employmentType === "兼職" ? staffForm.holiday_end_time : staffForm.weekday_end_time,
                  });
                }}
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              職稱
              <select value={staffForm.role_name} onChange={(event) => setStaffForm({ ...staffForm, role_name: event.target.value })}>
                {roleOptions.map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}
              </select>
            </label>
            <label>
              工作類別
              <select value={staffForm.work_category} onChange={(event) => setStaffForm({ ...staffForm, work_category: event.target.value })}>
                {WORK_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              人員狀態
              <select value={staffForm.employment_status} onChange={(event) => setStaffForm({ ...staffForm, employment_status: event.target.value })}>
                {EMPLOYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              {staffForm.employment_type === "兼職" ? "平日上班（選填）" : "預設上班（選填）"}
              <input type="time" lang="en-GB" step="900" value={staffForm.weekday_start_time} onChange={(event) => setStaffForm({ ...staffForm, weekday_start_time: formatTime24(event.target.value) })} />
            </label>
            <label>
              {staffForm.employment_type === "兼職" ? "平日下班（選填）" : "預設下班（選填）"}
              <input type="time" lang="en-GB" step="900" value={staffForm.weekday_end_time} onChange={(event) => setStaffForm({ ...staffForm, weekday_end_time: formatTime24(event.target.value) })} />
            </label>
            {staffForm.employment_type === "兼職" && (
              <>
                <label>
                  假日上班（選填）
                  <input type="time" lang="en-GB" step="900" value={staffForm.holiday_start_time} onChange={(event) => setStaffForm({ ...staffForm, holiday_start_time: formatTime24(event.target.value) })} />
                </label>
                <label>
                  假日下班（選填）
                  <input type="time" lang="en-GB" step="900" value={staffForm.holiday_end_time} onChange={(event) => setStaffForm({ ...staffForm, holiday_end_time: formatTime24(event.target.value) })} />
                </label>
                <p className="form-help">未設定單日班次時，系統依平日／假日預設時間計算；四個欄位皆可留空。</p>
              </>
            )}
            <label>
              預估時薪成本（選填）
              <input type="number" min="0" step="1" value={staffForm.estimated_hourly_cost} onChange={(event) => setStaffForm({ ...staffForm, estimated_hourly_cost: event.target.value })} />
            </label>
            <label>
              預估月薪成本（選填）
              <input type="number" min="0" step="1" value={staffForm.estimated_monthly_cost} onChange={(event) => setStaffForm({ ...staffForm, estimated_monthly_cost: event.target.value })} />
            </label>
            <label>
              排序
              <input type="number" min="1" value={staffForm.sort_order} onChange={(event) => setStaffForm({ ...staffForm, sort_order: event.target.value })} />
            </label>
            <div className="staff-admin-actions">
              <button className="primary" type="submit">{staffForm.id ? "儲存修改" : "新增到門店"}</button>
              {staffForm.id && <button type="button" onClick={resetStaffForm}>取消編輯</button>}
            </div>
          </form>
        ) : (
          <p className="empty-text">此帳號可查看人員主檔；新增、修改與停用需由總部授權角色操作。</p>
        )}
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>門店</th><th>人員姓名</th><th>僱用型態</th><th>職稱</th><th>工作類別</th><th>人員狀態</th><th>兼職預設工時</th><th>排序</th><th>操作</th></tr>
            </thead>
            <tbody>
              {staffRoster
                .slice()
                .sort((a, b) => `${canonicalStoreCode(a)}-${a.sort_order || 999}-${a.employeeName}`.localeCompare(`${canonicalStoreCode(b)}-${b.sort_order || 999}-${b.employeeName}`, "zh-Hant"))
                .map((row) => (
                  <tr key={row.id}>
                    <td><strong>{canonicalStoreCode(row)}</strong><span>{displayStoreName(row)}</span></td>
                    <td>{row.employeeName}</td>
                    <td>{row.employment_type}</td>
                    <td>{row.role}</td>
                    <td>{row.work_category}</td>
                    <td>{row.employment_status}</td>
                    <td>
                      {row.employment_type === "兼職" ? (
                        <>
                          <span>平日 {formatTime24(row.weekday_start_time || row.work_start_time) || "未填"}–{formatTime24(row.weekday_end_time || row.work_end_time) || "未填"}</span>
                          <span>假日 {formatTime24(row.holiday_start_time || row.weekday_start_time || row.work_start_time) || "未填"}–{formatTime24(row.holiday_end_time || row.weekday_end_time || row.work_end_time) || "未填"}</span>
                        </>
                      ) : "-"}
                    </td>
                    <td>{row.sort_order || "-"}</td>
                    <td>
                      {canEditStaff ? (
                        <div className="inline-actions">
                          <button type="button" onClick={() => editStaff(row)}>編輯</button>
                          <button type="button" onClick={() => deleteStaff(row)}>停用</button>
                        </div>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              {!staffRoster.length && <tr><td colSpan="9">尚無人員資料，請由總部新增。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>人員調店與歸屬歷程</h2>
            <p>調店依生效日建立新版本；舊門店與歷史班表不會被覆蓋。</p>
          </div>
        </div>
        {canEditStaff && (
          <form className="staff-admin-grid" onSubmit={submitStaffTransfer}>
            <label>
              人員
              <select value={transferForm.staff_id} onChange={(event) => setTransferForm({ ...transferForm, staff_id: event.target.value })} required>
                <option value="">請選擇</option>
                {staffRoster.map((row) => <option key={row.id} value={row.id}>{canonicalStoreCode(row)} {row.employeeName}</option>)}
              </select>
            </label>
            <label>
              新歸屬門店
              <select value={transferForm.store_code} onChange={(event) => setTransferForm({ ...transferForm, store_code: event.target.value })} required>
                <option value="">請選擇</option>
                {storeOptions.map((store) => <option key={store.store_code} value={store.store_code}>{store.store_code} {store.name}</option>)}
              </select>
            </label>
            <label>
              生效日
              <input type="date" value={transferForm.effective_from} onChange={(event) => setTransferForm({ ...transferForm, effective_from: event.target.value })} required />
            </label>
            <label>
              調店原因
              <input value={transferForm.reason} onChange={(event) => setTransferForm({ ...transferForm, reason: event.target.value })} placeholder="例如：營運人力調整" required />
            </label>
            <div className="staff-admin-actions"><button className="primary" type="submit">確認調店</button></div>
          </form>
        )}
        <div className="table-wrap compact">
          <table>
            <thead><tr><th>人員</th><th>歸屬門店</th><th>生效日</th><th>結束日</th><th>原因</th></tr></thead>
            <tbody>
              {staffAssignments.map((assignment) => {
                const person = staffRoster.find((row) => String(row.id) === String(assignment.staff_id));
                return <tr key={assignment.id}><td>{person?.employeeName || assignment.staff_id}</td><td>{assignment.store_code}</td><td>{assignment.effective_from}</td><td>{assignment.effective_to || "目前"}</td><td>{assignment.reason}</td></tr>;
              })}
              {!staffAssignments.length && <tr><td colSpan="5">尚無歸屬歷程；資料庫套用後會自動建立既有人員基準。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel wide">
        <div className="panel-head"><div><h2>工作崗位與員工技能</h2><p>每人可具備多項技能，主要崗位用於排班缺口判斷。</p></div></div>
        {canEditStaff && (
          <form className="staff-admin-grid" onSubmit={submitStaffSkills}>
            <label>
              人員
              <select value={skillForm.staff_id} onChange={(event) => {
                const staffId = event.target.value;
                const current = staffSkills.filter((row) => row.staff_id === staffId);
                setSkillForm({ staff_id: staffId, positions: current.map((row) => row.position_code), primary_position: current.find((row) => row.is_primary)?.position_code || "" });
              }} required>
                <option value="">請選擇</option>
                {staffRoster.map((row) => <option key={row.id} value={row.id}>{canonicalStoreCode(row)} {row.employeeName}</option>)}
              </select>
            </label>
            <div className="wide-field staff-chip-list">
              {STAFF_POSITION_OPTIONS.map((position) => (
                <label key={position} className="check-row"><input type="checkbox" checked={skillForm.positions.includes(position)} onChange={(event) => {
                  const positions = event.target.checked ? [...skillForm.positions, position] : skillForm.positions.filter((item) => item !== position);
                  setSkillForm({ ...skillForm, positions, primary_position: positions.includes(skillForm.primary_position) ? skillForm.primary_position : positions[0] || "" });
                }} /> {position}</label>
              ))}
            </div>
            <label>
              主要崗位
              <select value={skillForm.primary_position} onChange={(event) => setSkillForm({ ...skillForm, primary_position: event.target.value })} required>
                <option value="">請選擇</option>
                {skillForm.positions.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <div className="staff-admin-actions"><button className="primary" type="submit">儲存技能</button></div>
          </form>
        )}
        <div className="table-wrap compact"><table><thead><tr><th>人員</th><th>主要崗位</th><th>其他技能</th></tr></thead><tbody>
          {staffRoster.filter((person) => staffSkills.some((skill) => skill.staff_id === person.id)).map((person) => {
            const skills = staffSkills.filter((skill) => skill.staff_id === person.id);
            return <tr key={person.id}><td>{person.employeeName}</td><td>{skills.find((skill) => skill.is_primary)?.position_code || "-"}</td><td>{skills.filter((skill) => !skill.is_primary).map((skill) => skill.position_code).join("、") || "-"}</td></tr>;
          })}
          {!staffSkills.length && <tr><td colSpan="3">尚未設定員工技能。</td></tr>}
        </tbody></table></div>
      </section>
<section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>各店營業與尖峰時間</h2>
            <p>用於排班、交接、營收回報時間與督導巡店節奏。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>門店</th><th>營業時間</th><th>中午尖峰</th><th>晚上尖峰</th><th>值班人員</th><th>回報節點</th><th>管理狀態</th></tr>
            </thead>
            <tbody>
              {storeHours.map((row) => (
                <tr key={row.storeName}>
                  <td><strong>{row.storeName}</strong></td>
                  <td>{row.open_time} - {row.close_time}</td>
                  <td>{row.lunch_peak}</td>
                  <td>{row.dinner_peak}</td>
                  <td>{row.duty_staff} 人</td>
                  <td>{row.lunch_report_time} / {row.dinner_report_time} / {row.close_report_time}</td>
                  <td><span className={`chip ${row.storeName === "鳳山南華店" ? "warn" : "good"}`}>{row.storeName === "鳳山南華店" ? "暫停營業" : "營運中"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>薪資職級設定</h2>
            <p>作為招募、升遷、績效獎金與人事成本控管基準。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>職位</th><th>底薪</th><th>用工型態</th><th>保險</th><th>績效獎金</th><th>月休</th><th>實際工時</th><th>現有人數</th></tr>
            </thead>
            <tbody>
              {byRole.map((row) => (
                <tr key={row.role}>
                  <td><strong>{row.role}</strong></td>
                  <td>{row.base_salary}</td>
                  <td>{row.employment_type}</td>
                  <td>{row.insurance_note || "-"}</td>
                  <td>{row.performance_bonus || "-"}</td>
                  <td>{row.monthly_rest_days || "-"}</td>
                  <td>{row.actual_work_hours ? `${row.actual_work_hours} 小時` : "-"}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{selectedStoreName} 人員配置</h2>
            <p>選擇左側門店後，可檢查該店店長、副店長與各職級配置。</p>
          </div>
        </div>
        <div className="staff-chip-list">
          {rosterByStore.map((row) => (
            <div className="staff-chip" key={row.id}>
              <strong>{row.employeeName}</strong>
              <span>{row.role}</span>
            </div>
          ))}
          {!rosterByStore.length && <p className="empty-text">此門店目前無人員資料，需由總部補齊。</p>}
        </div>
      </section>
    </div>
  );
}

function reportForStoreCode(reports, storeCode) {
  return reports.find((report) => canonicalStoreCode(report) === storeCode);
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

const weekdayLabels = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

function buildWeeklySameDayRows(reports = [], referenceDate = today) {
  return buildWeeklyComparisonRows(reports, referenceDate, {
    resolveStoreCode: canonicalStoreCode,
    resolveStoreName: displayStoreName,
  });
}

function revenueDeltaTone(delta) {
  if (delta > 0) return "good";
  if (delta < 0) return "bad";
  return "";
}

function ManagementSystemModule({ systems }) {
  const nextBuildItems = [
    ["排班管理", "依各店營業時間、尖峰時段與值班人數建立週排班表，缺員自動提示。"],
    ["督導任務", "由督導長分派執行督導巡店、追蹤缺失、確認改善結案。"],
    ["人資異動", "新進、轉正、升遷、降階、離職資料與績效紀錄串接。"],
    ["加盟展店", "把選址、訓練、開店驗收與試營運節點做成專案流程。"],
  ];

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="制度模組" value={`${systems.length} 項`} detail="已整理可 APP 化流程" />
        <Metric label="每日節奏" value="營收 / 交接" detail="門店店長負責" tone="good" />
        <Metric label="每週節奏" value="巡檢 / 排班" detail="督導長負責" tone="warn" />
        <Metric label="每月節奏" value="績效 / 獎金" detail="總部覆核" />
        <Metric label="展店節奏" value="加盟 / 驗收" detail="總部制度化複製" tone="hot" />
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>總部管理制度矩陣</h2>
            <p>彙整既有店長 SOP、人員制度、巡檢制度、加盟展店與總部管理文件，轉成 APP 可追蹤流程。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>模組</th><th>責任人</th><th>頻率</th><th>必留證據</th><th>升級處理</th></tr>
            </thead>
            <tbody>
              {systems.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.module}</strong></td>
                  <td>{row.owner}</td>
                  <td>{row.frequency}</td>
                  <td>{row.evidence}</td>
                  <td>{row.escalation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>下一階段 APP 化清單</h2>
            <p>依可落地、可複製、可降低管理成本排序。</p>
          </div>
        </div>
        <div className="flow-list">
          {nextBuildItems.map(([title, text]) => (
            <span key={title}><strong>{title}</strong>：{text}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function taskTone(value = "") {
  if (["已完成", "足夠", "正常", "已納入制度", "已填", "低"].includes(value)) return "good";
  if (["高", "人力不足", "需輔導", "重大", "超休", "連勤過長"].includes(value)) return "bad";
  if (["中", "待處理", "進行中", "待覆核", "試用觀察", "待總部覆核", "改善中", "待招募", "暫停", "暫停營業", "未填", "不足"].includes(value)) return "warn";
  return "neutral";
}

function isOverdue(dateText) {
  return Boolean(dateText && dateText < today);
}

const leavePlannerStorageKey = "laijiduo-monthly-leave-planner";

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

function formatLeaveDays(month, days) {
  const monthNumber = Number(month.slice(5, 7));
  return days.map((day) => `${monthNumber}/${day}`).join("、");
}

function isLeaveDay(value, day) {
  return parseLeaveDays(value).includes(day);
}

function leaveDaySource(draft, day) {
  if (isLeaveDay(draft.autoDays, day)) return "auto";
  if (isLeaveDay(draft.manualDays, day)) return "manual";
  if (isLeaveDay(draft.dates, day)) return "manual";
  return "";
}

const leaveTypeOptions = ["排休", "特休", "事假", "病假", "其他"];

function timeToMinutes(value, fallback = 0) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime24(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

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

function buildLeavePlanPayload({ month, person, dates, manualDates, autoDates, leaveType = "排休", note = "" }) {
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
    leave_type: leaveType,
    note,
  };
}

function getMonthlyRestDays(role, salaryRows) {
  const salaryRow = salaryRows.find((row) => row.role === role);
  const restDays = Number(salaryRow?.monthly_rest_days || 0);
  return Number.isFinite(restDays) && restDays > 0 ? restDays : null;
}

function getSuggestedRestDays(role, salaryRows) {
  const restDays = getMonthlyRestDays(role, salaryRows);
  if (restDays) return restDays;
  if (role === "店長" || role === "副店長") return 7;
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

function buildLeavePlannerCsv({ month, rows, drafts, salaryRows }) {
  const days = Array.from({ length: daysInMonth(`${month}-01`) }, (_, index) => index + 1);
  const headers = ["月份", "門店代碼", "門店", "姓名", "職位", ...days.map((day) => `${day}日`), "休假計", "月休基準", "假別", "狀態", "備註"];
  const csvRows = rows.map((row) => {
    const key = leaveDraftKey(month, row.id);
    const draft = drafts[key] || {};
    const restDays = getSuggestedRestDays(row.role, salaryRows);
    const dates = draft.dates || "";
    return [
      month,
      canonicalStoreCode(row),
      displayStoreName(row),
      row.employeeName,
      row.role,
      ...days.map((day) => (isLeaveDay(dates, day) ? "休" : "")),
      countLeaveDays(dates),
      restDays || "",
      draft.leaveType || "排休",
      getLeaveStatus(dates, restDays, days),
      draft.note || "",
    ];
  });
  return [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function MonthlyLeavePlanner({
  allowedStoreCode = "",
  allowedStoreName = "",
  isStoreScoped = false,
  staffRoster,
  salaryRows,
  storeHours,
  storeRelationGroups = STORE_RELATION_GROUPS,
  onNotify,
}) {
  const [leaveMonth, setLeaveMonth] = useState(today.slice(0, 7));
  const [storeFilter, setStoreFilter] = useState(allowedStoreCode || "all");
  const [matrixGroupCode, setMatrixGroupCode] = useState("");
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
  const allStoreGroups = useMemo(
    () => {
      const groups = new Map();
      storeOptions.forEach((store) => {
        const ruleGroup = scheduleGroupForStore(
          { ...store, ...(storeHourMap.get(store.code) || {}), demand: storeDemandMap.get(store.code) || 0 },
          storeRelationGroups,
        );
        if (!groups.has(ruleGroup.code)) {
          groups.set(ruleGroup.code, {
            ...ruleGroup,
            staff: scheduleStaff.filter((person) => ruleGroup.sourceCodes.includes(canonicalStoreCode(person))),
          });
        }
      });
      return Array.from(groups.values()).filter((store) => store.staff.length);
    },
    [scheduleStaff, storeDemandMap, storeHourMap, storeOptions, storeRelationGroups],
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
      storeRelationGroups,
    ).code;
  }, [allowedStoreCode, isStoreScoped, storeDemandMap, storeHourMap, storeOptions, storeRelationGroups]);

  useEffect(() => {
    if (isStoreScoped && allowedGroupCode) setStoreFilter(allowedGroupCode);
  }, [allowedGroupCode, isStoreScoped]);

  const storeGroups = useMemo(
    () => allStoreGroups.filter((store) => {
      if (isStoreScoped) return allowedGroupCode ? store.code === allowedGroupCode : false;
      return storeFilter === "all" || store.code === storeFilter;
    }),
    [allStoreGroups, allowedGroupCode, isStoreScoped, storeFilter],
  );
  const plannerRows = useMemo(() => storeGroups.flatMap((store) => store.staff), [storeGroups]);
  const supportDay = Number(supportDate.slice(8, 10));
  const supportSourceGroups = useMemo(
    () => (isStoreScoped ? supportVisibleGroupsForTemporarySupport(allStoreGroups) : allStoreGroups),
    [allStoreGroups, isStoreScoped],
  );
  const calculatedSupportRows = supportSourceGroups
    .map((store) => {
      const staffing = calculateStoreStaffingForDay(store, drafts, leaveMonth, supportDay, dailyShifts, scheduleStaff);
      return {
        ...store,
        ...staffing,
      };
    })
    .sort((a, b) => {
      if (a.surplus < 0 && b.surplus >= 0) return -1;
      if (a.surplus >= 0 && b.surplus < 0) return 1;
      return b.surplus - a.surplus || a.code.localeCompare(b.code);
    });
  const supportRows = isStoreScoped && remoteSupportRows !== null
    ? remoteSupportRows
    : calculatedSupportRows;
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
  const editableScheduleStaff = isStoreScoped ? plannerRows : scheduleStaff;
  const visibleDailyShifts = dailyShifts.filter((shift) => (
    !isStoreScoped || plannerRows.some((person) => String(person.id) === String(shift.staff_id))
  ));
  const matrixGroups = isStoreScoped ? storeGroups : allStoreGroups;
  const selectedMatrixGroup = matrixGroups.find((store) => store.code === (
    isStoreScoped ? allowedGroupCode : (storeFilter !== "all" ? storeFilter : matrixGroupCode)
  )) || matrixGroups[0];
  const matrixStoreCode = selectedMatrixGroup?.sourceCodes?.[0] || selectedMatrixGroup?.code || "";
  const matrixDay = Number(supportDate.slice(8, 10));
  const matrixLeaveStaffIds = staffRoster
    .filter((person) => isLeaveDay(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates, matrixDay))
    .map((person) => person.id);
  const matrixRows = selectedMatrixGroup && supportDate.startsWith(leaveMonth)
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
      })
    : [];
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

  function printSchedule() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return onNotify?.("瀏覽器已阻擋列印視窗，請允許彈出視窗後再試一次");
    printWindow.document.open();
    printWindow.document.write(buildPrintableScheduleHtml(scheduleExportModel));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  async function scheduleImageFile() {
    const selectedIndex = Math.max(0, scheduleExportModel.stores.findIndex((store) => store.code === selectedMatrixGroup?.code));
    const canvas = renderScheduleStoreCanvas(scheduleExportModel, selectedIndex);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("班表圖片產生失敗");
    const store = scheduleExportModel.stores[selectedIndex];
    return new File([blob], `萊吉多-${leaveMonth}-${store.code}-班表-V${scheduleExportModel.version}.png`, { type: "image/png" });
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

  const toggleLeaveDay = (staffId, day) => {
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
      const nextDays = leaveDays.includes(day) ? leaveDays.filter((item) => item !== day) : [...leaveDays, day].sort((a, b) => a - b);
      const nextManualDays = leaveDays.includes(day)
        ? manualDays.filter((item) => item !== day)
        : [...manualDays.filter((item) => item !== day), day].sort((a, b) => a - b);
      const nextAutoDays = autoDays.filter((item) => item !== day);
      const nextDraft = {
        ...currentDraft,
        dates: formatLeaveDays(leaveMonth, nextDays),
        manualDays: formatLeaveDays(leaveMonth, nextManualDays),
        autoDays: formatLeaveDays(leaveMonth, nextAutoDays),
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

  return (
    <section className="panel wide leave-planner">
      <div className="panel-head">
        <div>
          <h2>每月各店排假表</h2>
          <p>依門店分表排假；最多連續工作 6 天，先點預定休假，再由一鍵排休補足月休與人力需求。</p>
        </div>
        <div className="panel-actions">
          <button className="primary" type="button" onClick={uploadVisibleStores} disabled={!canBulkEditSchedule || !storeGroups.length || uploadingCode === "all"}>
            {uploadingCode === "all" ? "上傳中..." : "上傳目前排假"}
          </button>
          <button type="button" onClick={() => downloadTextFile(buildLeavePlannerCsv({ month: leaveMonth, rows: plannerRows, drafts, salaryRows }), `萊吉多${leaveMonth}排假表.csv`)}>
            匯出排假
          </button>
          <button type="button" onClick={printSchedule}>A4／PDF</button>
          <button type="button" onClick={downloadScheduleImage}>下載圖片</button>
          <button type="button" onClick={shareScheduleImage}>分享班表</button>
          {!isStoreScoped && <button type="button" onClick={clearMonth} disabled={!canBulkEditSchedule}>清空本月</button>}
        </div>
      </div>

      <section className="personal-link-panel">
        <div>
          <strong>個人班表連結</strong>
          <p>只顯示本人日期、時間、工作門店及職稱；網址僅在建立時顯示一次。</p>
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
            {personalLinkSaving ? "建立中..." : "建立並複製連結"}
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
                {visibleDailyShifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.shift_date} {shift.employee_name} {formatTime24(shift.start_time)}–{formatTime24(shift.end_time)}</option>)}
              </select></label>
            )}
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

      {!isStoreScoped && scheduleControl.rollout && (
        <section className="schedule-control-panel">
          <div>
            <span>人力排班模組切換</span>
            <strong>{scheduleControl.rollout.rollout_mode === "new" ? `新版正式模式（${scheduleControl.rollout.cutover_month} 起）` : scheduleControl.rollout.rollout_mode === "parallel" ? "平行驗收模式" : "舊版模式"}</strong>
            <p>{scheduleControl.rollout.note || "切換紀錄由 Supabase 留存"}</p>
          </div>
          <div className="schedule-control-actions">
            <button type="button" onClick={() => changeRolloutMode("parallel")}>維持平行驗收</button>
            <button className="primary" type="button" onClick={() => changeRolloutMode("new")}>驗收完成，切換新版</button>
          </div>
        </section>
      )}

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
              {allStoreGroups.map((row) => (
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

      <section className="daily-shift-editor">
        <div className="panel-head compact-head">
          <div>
            <h3>單日多段班次調整</h3>
            <p>同一天可新增多段班次，時間不可重疊；兼職未設定時自動使用人資主檔平日／假日時間。</p>
          </div>
        </div>
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
            <select value={shiftForm.assigned_store_code} onChange={(event) => setShiftForm({ ...shiftForm, assigned_store_code: event.target.value })}>
              <option value="">依原門店</option>
              {storeOptions.map((store) => <option value={store.code} key={store.code}>{store.code} {store.name}</option>)}
            </select>
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
      </section>

      {!isStoreScoped && (
        <section className="daily-shift-editor">
          <div className="panel-head compact-head"><div><h3>標準班次模板</h3><p>總部維護常用班次；門店套用後仍可依當日需要調整為 15 分鐘單位。</p></div></div>
          <form className="daily-shift-form" onSubmit={saveShiftTemplate}>
            <label>班次名稱<input value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} placeholder="例如：早班" /></label>
            <label>開始時間<input type="time" lang="en-GB" step="900" value={templateForm.start_time} onChange={(event) => setTemplateForm({ ...templateForm, start_time: formatTime24(event.target.value) })} /></label>
            <label>結束時間<input type="time" lang="en-GB" step="900" value={templateForm.end_time} onChange={(event) => setTemplateForm({ ...templateForm, end_time: formatTime24(event.target.value) })} /></label>
            <div className="staff-admin-actions"><button className="primary" type="submit" disabled={templateSaving}>{templateSaving ? "儲存中" : "儲存模板"}</button></div>
          </form>
          {shiftTemplates.length > 0 && <div className="table-wrap compact"><table><thead><tr><th>名稱</th><th>時間</th><th>操作</th></tr></thead><tbody>{shiftTemplates.map((template) => <tr key={template.id}><td>{template.name}</td><td>{formatTime24(template.start_time)}–{formatTime24(template.end_time)}</td><td><div className="inline-actions"><button type="button" onClick={() => setTemplateForm({ id: template.id, name: template.name, start_time: formatTime24(template.start_time), end_time: formatTime24(template.end_time) })}>編輯</button><button type="button" onClick={() => removeShiftTemplate(template)}>停用</button></div></td></tr>)}</tbody></table></div>}
        </section>
      )}

      {selectedMatrixGroup && (
        <section className="staffing-matrix">
          <div className="panel-head">
            <div>
              <h3>{selectedMatrixGroup.name}時段人力矩陣</h3>
              <p>{supportDate}，每 30 分鐘核對實際在班、有效人力、需求與缺口；沿用上方臨時支援日期。</p>
            </div>
            <div className="matrix-summary">
              {!isStoreScoped && storeFilter === "all" && (
                <label>
                  查看門店
                  <select value={selectedMatrixGroup.code} onChange={(event) => setMatrixGroupCode(event.target.value)}>
                    {matrixGroups.map((group) => <option key={group.code} value={group.code}>{group.code} {group.name}</option>)}
                  </select>
                </label>
              )}
              <span className={matrixPeakGapRows.length ? "negative" : "positive"}><strong>{matrixPeakGapRows.length}</strong> 個尖峰缺口</span>
              <span><strong>{matrixGapRows.length}</strong> 個全日缺口</span>
              <span><strong>{matrixLaborCost.totalHours.toFixed(1)}</strong> 預估工時</span>
              <span><strong>{money(Math.round(matrixLaborCost.estimatedCost))}</strong> 排班預估</span>
              {matrixLaborCost.missingCostStaffCount > 0 && <span className="warn-text"><strong>{matrixLaborCost.missingCostStaffCount}</strong> 人成本待補</span>}
            </div>
          </div>
          <div className="table-wrap staffing-matrix-wrap">
            <table>
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
            </table>
          </div>
        </section>
      )}

      <div className="support-panel">
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
      </div>

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
        {storeGroups.map((store) => (
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
    </section>
  );
}

function StoreLeaveCalendar({ autoArrangeStore, canBulkEditSchedule, canEditSchedule, canEditStaffSchedule, clearStore, dailyShifts, drafts, isUploading, leaveMonth, monthDays, salaryRows, saveDraft, scheduleStaff, store, toggleLeaveDay, updateDraft, uploadStore }) {
  const totalLeaveDays = store.staff.reduce((sum, person) => sum + countLeaveDays(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates), 0);
  const maxOffPerDay = Math.max(store.staff.length - store.demand, 0);

  return (
    <div className="store-leave-card">
      <div className="store-leave-head">
        <div>
          <h3><span className="code-chip">{store.code}</span> {store.name}</h3>
          <p>{store.staff.length} 人計入排班，門店每日需求 {store.demand} 人，每日最多可排休 {maxOffPerDay} 人，本月已排休 {totalLeaveDays} 天。{store.ruleNote}</p>
        </div>
        <div className="panel-actions">
          <button className="primary" type="button" onClick={() => uploadStore(store)} disabled={!canBulkEditSchedule || isUploading}>
            {isUploading ? "上傳中..." : "上傳本店排假"}
          </button>
          <button type="button" onClick={() => autoArrangeStore(store)} disabled={!canBulkEditSchedule || !maxOffPerDay}>一鍵平均排休</button>
          <button type="button" onClick={() => clearStore(store)} disabled={!canBulkEditSchedule}>清空本店</button>
        </div>
      </div>
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
                    {person.role === "兼職人員" && (
                      <span>
                        平 {formatTime24(person.weekday_start_time || person.work_start_time) || "未填"}–{formatTime24(person.weekday_end_time || person.work_end_time) || "未填"}
                        {" / "}假 {formatTime24(person.holiday_start_time || person.weekday_start_time || person.work_start_time) || "未填"}–{formatTime24(person.holiday_end_time || person.weekday_end_time || person.work_end_time) || "未填"}
                      </span>
                    )}
                  </th>
                  {monthDays.map((day) => {
                    const checked = isLeaveDay(draft.dates, day);
                    const source = checked ? leaveDaySource(draft, day) : "";
                    return (
                      <td className="leave-day-cell" key={day}>
                        <button
                          aria-label={`${person.employeeName} ${day}日${checked ? "取消休假" : "排休"}`}
                          className={checked ? `leave-dot on ${source}` : "leave-dot"}
                          type="button"
                          disabled={!canEditPerson}
                          onClick={() => toggleLeaveDay(person.id, day)}
                        />
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
            <StoreLeaveSummaryRows
              dailyShifts={dailyShifts}
              drafts={drafts}
              leaveMonth={leaveMonth}
              monthDays={monthDays}
              scheduleStaff={scheduleStaff}
              store={store}
            />
          </tbody>
        </table>
      </div>
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
  onNotify,
}) {
  const [scheduleView, setScheduleView] = useState("week");
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
  const scopedStoreHours = isStoreScoped
    ? (selectedStoreCode ? storeHours.filter((row) => canonicalStoreCode(row) === selectedStoreCode) : [])
    : storeHours;
  const scopedStaffRoster = isStoreScoped
    ? (selectedStoreCode ? staffRoster.filter((row) => canonicalStoreCode(row) === selectedStoreCode) : [])
    : staffRoster;
  const activeRows = scopedScheduleRows.filter((row) => row.status !== "暫停營業");
  const shortageRows = scopedScheduleRows.filter((row) => row.status === "人力不足");
  const closedRows = scopedScheduleRows.filter((row) => row.status === "暫停營業");
  const managerCount = new Set(
    scopedStaffRoster
      .filter((row) => row.role === "店長" || row.role === "副店長")
      .map((row) => row.storeName),
  ).size;
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(getWeekRange(today).start, index)), []);
  const monthDays = useMemo(() => Array.from({ length: daysInMonth(today) }, (_, index) => `${today.slice(0, 8)}${String(index + 1).padStart(2, "0")}`), []);
  const viewDays = scheduleView === "week" ? weekDays : monthDays;
  const roleByName = useMemo(
    () => new Map(scopedStaffRoster.map((row) => [row.employeeName, row.role])),
    [scopedStaffRoster],
  );

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="本週班表" value={`${scopedScheduleRows.length} 筆`} detail="依營業時段自動產生" />
        <Metric label="營運班別" value={`${activeRows.length} 筆`} detail="排除暫停營業店" tone="good" />
        <Metric label="尖峰缺口" value={`${shortageRows.length} 筆`} detail={shortageRows[0]?.storeName || "目前無缺口"} tone={shortageRows.length ? "bad" : "good"} />
        <Metric label="主管覆蓋" value={`${managerCount} 店`} detail="店長或副店長可負責" />
        <Metric label="暫停營業" value={`${closedRows.length} 店`} detail={closedRows[0]?.storeName || "無"} tone={closedRows.length ? "warn" : "good"} />
      </section>

      <MonthlyLeavePlanner
        allowedStoreCode={selectedStoreCode}
        allowedStoreName={selectedStoreName}
        isStoreScoped={isStoreScoped}
        staffRoster={staffRoster}
        salaryRows={salaryRows}
        storeHours={storeHours}
        storeRelationGroups={storeRelationGroups}
        onNotify={onNotify}
      />

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>班表視圖</h2>
            <p>用週視圖看尖峰配置，用月視圖看人力風險；紅色代表缺口或需支援。</p>
          </div>
          <div className="segments compact">
            <button className={scheduleView === "week" ? "active" : ""} onClick={() => setScheduleView("week")}>週視圖</button>
            <button className={scheduleView === "month" ? "active" : ""} onClick={() => setScheduleView("month")}>月視圖</button>
          </div>
        </div>
        <div className={`schedule-calendar ${scheduleView}`}>
          {viewDays.map((day, dayIndex) => (
            <div className="schedule-day" key={day}>
              <div className="schedule-day-head">
                <strong>{day.slice(5)}</strong>
                <span>{["週日", "週一", "週二", "週三", "週四", "週五", "週六"][new Date(`${day}T00:00:00`).getDay()]}</span>
              </div>
              {(scheduleView === "week" ? scopedScheduleRows : scopedScheduleRows.filter((_, index) => index % 7 === dayIndex % 7)).slice(0, scheduleView === "week" ? 6 : 3).map((row) => {
                const gap = Number(row.required_staff || 0) - (row.assigned_staff?.length || 0);
                return (
                  <div className={`shift-card shift-${row.shift_name} ${gap > 0 || row.status === "人力不足" ? "needs-help" : ""}`} key={`${day}-${row.id}`}>
                    <span>{row.shift_name} · {row.start_time}-{row.end_time}</span>
                    <strong>{displayStoreName(row)}</strong>
                    <small>{row.assigned_staff?.slice(0, 3).map((name) => `${name}${roleByName.get(name) ? `(${roleByName.get(name)})` : ""}`).join("、") || "待排"}</small>
                    <em>{gap > 0 ? `缺 ${gap} 人` : "人力足夠"}</em>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>週排班總表</h2>
            <p>依各店營業時間、尖峰時段與值班人數控管，缺員由督導協調支援。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>代碼</th><th>門店</th><th>班別</th><th>時段</th><th>需求</th><th>已排</th><th>負責主管</th><th>狀態</th><th>處理動作</th></tr>
            </thead>
            <tbody>
              {scopedScheduleRows.map((row) => (
                <tr key={row.id}>
                  <td><span className="code-chip">{canonicalStoreCode(row)}</span></td>
                  <td><strong>{displayStoreName(row)}</strong></td>
                  <td>{row.shift_name}</td>
                  <td>{row.start_time} - {row.end_time}</td>
                  <td>{row.required_staff} 人</td>
                  <td>{row.assigned_staff.length ? row.assigned_staff.join("、") : "-"}</td>
                  <td>{row.owner}</td>
                  <td><span className={`chip ${taskTone(row.status)}`}>{row.status}</span></td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>排班規則</h2>
            <p>用於店長每週排班與總部抽查。</p>
          </div>
        </div>
        <div className="flow-list">
          <span><strong>尖峰優先</strong>：中午與晚峰須滿足各店值班人數，低峰再安排備料、清潔與補貨。</span>
          <span><strong>主管在場</strong>：每店每日至少由店長或副店長負責主要時段。</span>
          <span><strong>缺員升級</strong>：尖峰人力不足需於前一日回報督導長，執行督導協調支援。</span>
          <span><strong>暫停門店</strong>：鳳山南華店先列暫停營業，待補足主管與基本人力後再排復店。</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>門店尖峰需求</h2>
            <p>由 00AI人資.xlsx 的各店時間轉入。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>代碼</th><th>門店</th><th>營業時間</th><th>中午尖峰</th><th>晚上尖峰</th><th>值班人數</th></tr>
            </thead>
            <tbody>
              {scopedStoreHours.map((row) => (
                <tr key={row.storeName}>
                  <td><span className="code-chip">{canonicalStoreCode(row)}</span></td>
                  <td><strong>{displayStoreName(row)}</strong></td>
                  <td>{row.open_time} - {row.close_time}</td>
                  <td>{row.lunch_peak}</td>
                  <td>{row.dinner_peak}</td>
                  <td>{row.duty_staff} 人</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HqTaskDispatchModule({ tasks, stores, selectedStoreId, onSave }) {
  const [form, setForm] = useState({
    title: "",
    task_type: "總部交辦",
    scope_type: "門店",
    store_id: selectedStoreId || "",
    assignee_name: "行政",
    assignee_role: "總務/行政",
    priority: "中",
    status: "待處理",
    due_date: today,
    evidence: "",
    action: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const openRows = tasks.filter((row) => row.status !== "已完成");
  const overdueRows = openRows.filter((row) => isOverdue(row.due_date));
  const highRows = openRows.filter((row) => row.priority === "高");
  const hqRows = tasks.filter((row) => row.scope_type === "總部" || row.scope_type === "人資" || row.scope_type === "財務");

  useEffect(() => {
    if (selectedStoreId) setForm((current) => ({ ...current, store_id: selectedStoreId }));
  }, [selectedStoreId]);

  async function submit() {
    setSaving(true);
    const ok = await onSave(form);
    if (ok) {
      setForm((current) => ({
        ...current,
        title: "",
        action: "",
        evidence: "",
        note: "",
        status: "待處理",
        priority: "中",
        due_date: today,
      }));
    }
    setSaving(false);
  }

  async function quickStatus(row, status) {
    await onSave({ ...row, status });
  }

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="總任務" value={`${tasks.length} 件`} detail="總部派發與追蹤" />
        <Metric label="待處理" value={`${openRows.length} 件`} detail="需列入每日追蹤" tone={openRows.length ? "warn" : "good"} />
        <Metric label="逾期" value={`${overdueRows.length} 件`} detail={overdueRows[0]?.storeName || "無逾期"} tone={overdueRows.length ? "bad" : "good"} />
        <Metric label="高優先" value={`${highRows.length} 件`} detail="營收、人力、績效優先" tone={highRows.length ? "bad" : "good"} />
        <Metric label="總部內勤" value={`${hqRows.length} 件`} detail="行政、人資、財務、制度" />
        <Metric label="已完成" value={`${tasks.filter((row) => row.status === "已完成").length} 件`} detail="可週會複盤" tone="good" />
      </section>

      <section className="panel module-form">
        <div className="panel-head">
          <div>
            <h2>新增任務派遣</h2>
            <p>總部建立任務、指定負責人、期限、優先級與驗收證據。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="wide-field">
            任務標題
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：五甲店排休表覆核" />
          </label>
          <SelectField label="任務類型" value={form.task_type} options={["總部交辦", "人力補編", "排班稽核", "人資異動", "營收追蹤", "稽核改善", "展店籌備", "加盟支援"]} onChange={(value) => setForm({ ...form, task_type: value })} />
          <SelectField label="分類" value={form.scope_type} options={["總部", "門店", "跨店", "人資", "財務", "稽核"]} onChange={(value) => setForm({ ...form, scope_type: value })} />
          <label>
            關聯門店
            <select value={form.store_id || ""} onChange={(event) => setForm({ ...form, store_id: event.target.value })}>
              <option value="">不指定門店</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.store_code} {store.name}</option>)}
            </select>
          </label>
          <SelectField label="負責角色" value={form.assignee_role} options={["CEO", "COO", "CFO", "CSO", "執行督導", "總務/行政", "人資", "店長", "副店長", "門店人員"]} onChange={(value) => setForm({ ...form, assignee_role: value })} />
          <label>
            負責人
            <input value={form.assignee_name} onChange={(event) => setForm({ ...form, assignee_name: event.target.value })} />
          </label>
          <SelectField label="優先級" value={form.priority} options={["高", "中", "低"]} onChange={(value) => setForm({ ...form, priority: value })} />
          <SelectField label="狀態" value={form.status} options={["待處理", "進行中", "待覆核", "已完成", "暫停"]} onChange={(value) => setForm({ ...form, status: value })} />
          <label>
            期限
            <input type="date" value={form.due_date || ""} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
          </label>
          <label className="wide-field">
            下一步
            <textarea value={form.action} onChange={(event) => setForm({ ...form, action: event.target.value })} placeholder="負責人要做什麼、完成標準是什麼" />
          </label>
          <label className="wide-field">
            驗收證據
            <input value={form.evidence} onChange={(event) => setForm({ ...form, evidence: event.target.value })} placeholder="照片、表單、簽名、回報截圖、文件連結" />
          </label>
          <label className="wide-field">
            備註
            <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </label>
        </div>
        <button className="submit-button static" disabled={saving || !form.title || !form.assignee_name} onClick={submit}>{saving ? "儲存中..." : "建立任務"}</button>
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>總部任務派遣表</h2>
            <p>把缺報、交接異常、績效輔導、人力補編、行政人資事項轉成可追蹤任務。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>任務</th><th>分類</th><th>代碼</th><th>門店</th><th>負責人</th><th>期限</th><th>優先</th><th>狀態</th><th>證據</th><th>下一步</th><th>操作</th></tr>
            </thead>
            <tbody>
              {tasks.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.title || row.task_type}</strong><span>{row.task_type}</span></td>
                  <td>{row.scope_type}</td>
                  <td><span className="code-chip">{canonicalStoreCode(row)}</span></td>
                  <td>{displayStoreName(row)}</td>
                  <td><strong>{row.assignee_name || row.owner}</strong><span>{row.assignee_role}</span></td>
                  <td className={isOverdue(row.due_date) && row.status !== "已完成" ? "negative" : ""}>{row.due_date}</td>
                  <td><span className={`chip ${taskTone(row.priority)}`}>{row.priority}</span></td>
                  <td><span className={`chip ${taskTone(row.status)}`}>{row.status}</span></td>
                  <td>{row.evidence}</td>
                  <td>{row.action}</td>
                  <td>
                    <div className="inline-actions">
                      <button onClick={() => quickStatus(row, "進行中")}>進行</button>
                      <button onClick={() => quickStatus(row, "待覆核")}>覆核</button>
                      <button onClick={() => quickStatus(row, "已完成")}>完成</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!tasks.length && <tr><td colSpan="11">目前尚無任務，請由總部新增派遣事項。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HrFlowModule({ changes, salaryRows }) {
  const statusCount = (keyword) => changes.filter((row) => row.change_type.includes(keyword) || row.status.includes(keyword)).length;

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="異動案件" value={`${changes.length} 件`} detail="新進、轉正、主管、人力補編" />
        <Metric label="新進追蹤" value={`${statusCount("新進")} 件`} detail="試用期需留評核" />
        <Metric label="轉正覆核" value={`${statusCount("轉正")} 件`} detail="連動績效與出勤" tone="warn" />
        <Metric label="主管角色" value="店長 / 副店長" detail="一店至少一名主管" tone="good" />
        <Metric label="待招募" value={`${changes.filter((row) => row.status === "待招募").length} 件`} detail="南華復店前置" tone="bad" />
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>人資異動流程表</h2>
            <p>把新進、轉正、升遷、改善與補編納入總部追蹤，避免人員資料斷點。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>人員 / 案件</th><th>代碼</th><th>門店</th><th>異動類型</th><th>原職</th><th>目標職位</th><th>負責</th><th>期限</th><th>狀態</th><th>備註</th></tr>
            </thead>
            <tbody>
              {changes.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.employeeName}</strong></td>
                  <td><span className="code-chip">{canonicalStoreCode(row)}</span></td>
                  <td>{displayStoreName(row)}</td>
                  <td>{row.change_type}</td>
                  <td>{row.from_role}</td>
                  <td>{row.to_role}</td>
                  <td>{row.owner}</td>
                  <td>{row.due_date}</td>
                  <td><span className={`chip ${taskTone(row.status)}`}>{row.status}</span></td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>職級與薪資基準</h2>
            <p>異動核准前，需對齊薪資、用工型態、保險與績效獎金設定。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>職位</th><th>底薪</th><th>用工型態</th><th>保險</th><th>績效獎金</th><th>月休</th><th>實際工時</th></tr>
            </thead>
            <tbody>
              {salaryRows.map((row) => (
                <tr key={row.role}>
                  <td><strong>{row.role}</strong></td>
                  <td>{row.base_salary}</td>
                  <td>{row.employment_type}</td>
                  <td>{row.insurance_note || "-"}</td>
                  <td>{row.performance_bonus || "-"}</td>
                  <td>{row.monthly_rest_days || "-"}</td>
                  <td>{row.actual_work_hours ? `${row.actual_work_hours} 小時` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks }) {
  const quality = buildDataQualitySummary(reports, handovers, performanceRows).issues.map((issue, index) => ({
    id: `quality-${index}`,
    type: issue.type,
    category: anomalyCategory(issue.type),
    store_code: canonicalStoreCode({ storeName: issue.storeName, store_id: issue.storeId }),
    storeName: displayStoreName({ storeName: issue.storeName }),
    occurred_at: today,
    level: issue.level === "bad" ? "重大" : "提醒",
    owner: issue.type.includes("績效") ? "店長 / 督導" : "店長",
    due_date: today,
    status: "待處理",
    message: issue.message,
    next_action: issue.type.includes("現金") ? "請店長補充差異原因，財務或督導覆核。" : "由責任人補資料或提出改善說明。",
  }));
  const managerStoreCodes = new Set(
    staffRoster
      .filter((person) => person.role === "店長" || person.role === "副店長")
      .map((person) => canonicalStoreCode(person)),
  );
  const managerRows = reports
    .filter((report) => report.name !== "鳳山南華店")
    .filter((report) => !managerStoreCodes.has(canonicalStoreCode(report)))
    .map((report, index) => ({
      id: `manager-${index}`,
      type: "主管缺口",
      category: "人資異動待處理",
      store_code: canonicalStoreCode(report),
      storeName: displayStoreName(report),
      occurred_at: today,
      level: "重大",
      owner: "督導長",
      due_date: today,
      status: "待補",
      message: "營運中門店未配置店長或副店長，需立即補主管責任人",
      next_action: "由總務/人資確認人員主檔，督導長指定暫代主管。",
    }));
  const scheduleIssues = scheduleRows
    .filter((row) => row.status !== "足夠")
    .map((row) => ({
      id: `schedule-${row.id}`,
      type: "排班異常",
      category: "排班異常",
      store_code: canonicalStoreCode(row),
      storeName: displayStoreName(row),
      occurred_at: today,
      level: row.status === "人力不足" ? "重大" : "提醒",
      owner: row.status === "暫停營業" ? "督導長" : "店長 / 執行督導",
      due_date: today,
      status: row.status,
      message: `${row.shift_name} ${row.start_time}-${row.end_time}：${row.action}`,
      next_action: row.status === "人力不足" ? "前一日完成調班或跨店支援確認。" : "確認復店條件或總部決策。",
    }));
  const taskIssues = hqTasks
    .filter((row) => row.status !== "已完成")
    .map((row) => ({
      id: `task-${row.id}`,
      type: "總部任務",
      category: isOverdue(row.due_date) ? "任務逾期" : (row.scope_type === "人資" ? "人資異動待處理" : "任務追蹤"),
      store_code: canonicalStoreCode(row),
      storeName: displayStoreName(row),
      occurred_at: row.created_at?.slice?.(0, 10) || today,
      level: row.priority === "高" || isOverdue(row.due_date) ? "重大" : "提醒",
      owner: row.assignee_name || row.owner,
      due_date: row.due_date,
      status: row.status,
      message: `${row.task_type}：${row.action || row.title}`,
      next_action: isOverdue(row.due_date) ? "更新完成證據或由總部重新指定期限。" : (row.next_step || "依任務驗收證據完成回報。"),
    }));
  return [...quality, ...managerRows, ...scheduleIssues, ...taskIssues];
}

function anomalyCategory(type = "") {
  if (type.includes("營收")) return "營收異常";
  if (type.includes("現金")) return "現金差異異常";
  if (type.includes("庫存") || type.includes("補貨")) return "庫存異常";
  if (type.includes("排班") || type.includes("主管缺口")) return "排班異常";
  if (type.includes("交接") || type.includes("巡檢")) return "巡檢缺失未改善";
  if (type.includes("人資") || type.includes("績效")) return "人資異動待處理";
  if (type.includes("任務")) return "任務逾期";
  return "營運異常";
}

function AnomalyCenterModule({ reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks, onSelect }) {
  const [periodFilter, setPeriodFilter] = useState("today");
  const [storeFilter, setStoreFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const rows = buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks });
  const weekRange = useMemo(() => getWeekRange(today), []);
  const monthRange = useMemo(() => getMonthRange(today), []);
  const storeOptions = Array.from(new Map(rows.map((row) => [row.store_code, row.storeName])).entries()).filter(([code]) => code);
  const categoryOptions = Array.from(new Set(rows.map((row) => row.category))).filter(Boolean);
  const filteredRows = rows
    .filter((row) => {
      const date = row.occurred_at || row.due_date || today;
      if (periodFilter === "today" && date !== today && row.due_date !== today) return false;
      if (periodFilter === "week" && (date < weekRange.start || date > weekRange.end) && (row.due_date < weekRange.start || row.due_date > weekRange.end)) return false;
      if (periodFilter === "month" && (date < monthRange.start || date > monthRange.end) && (row.due_date < monthRange.start || row.due_date > monthRange.end)) return false;
      if (storeFilter !== "all" && row.store_code !== storeFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (levelFilter !== "all" && row.level !== levelFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const score = (row) => (row.level === "重大" ? 3 : 1) + (isOverdue(row.due_date) ? 2 : 0);
      return score(b) - score(a) || String(a.due_date).localeCompare(String(b.due_date));
    });
  const criticalRows = filteredRows.filter((row) => row.level === "重大");
  const overdueRows = filteredRows.filter((row) => isOverdue(row.due_date) && row.status !== "已完成");
  const supervisorRows = filteredRows.filter((row) => row.owner.includes("督導"));

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="異常總數" value={`${filteredRows.length} 件`} detail="依目前篩選條件" tone={filteredRows.length ? "warn" : "good"} />
        <Metric label="重大異常" value={`${criticalRows.length} 件`} detail={criticalRows[0]?.storeName || "無"} tone={criticalRows.length ? "bad" : "good"} />
        <Metric label="督導追蹤" value={`${supervisorRows.length} 件`} detail="需督導長或執行督導處理" tone="warn" />
        <Metric label="逾期事項" value={`${overdueRows.length} 件`} detail={overdueRows[0]?.storeName || "無逾期"} tone={overdueRows.length ? "bad" : "good"} />
        <Metric label="完成標準" value="證據結案" detail="回報、照片、簽名或改善紀錄" tone="good" />
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>總部異常追蹤台</h2>
            <p>總部每日先看這張表，重大異常優先派工，避免缺報、缺人、未改善累積。</p>
          </div>
        </div>
        <div className="filter-bar">
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}>
            <option value="today">今日</option>
            <option value="week">本週</option>
            <option value="month">本月</option>
            <option value="all">全部</option>
          </select>
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
            <option value="all">全部門店</option>
            {storeOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">全部異常類型</option>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="all">全部嚴重程度</option>
            <option value="重大">重大</option>
            <option value="提醒">提醒</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>等級</th><th>異常分類</th><th>發生日</th><th>門店</th><th>負責人</th><th>期限</th><th>狀態</th><th>問題與下一步</th></tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} onClick={() => onSelect?.(reportForStoreCode(reports, row.store_code)?.store_id)}>
                  <td><span className={`chip ${row.level === "重大" ? "bad" : "warn"}`}>{row.level}</span></td>
                  <td><strong>{row.category}</strong><span>{row.type}</span></td>
                  <td>{row.occurred_at || today}</td>
                  <td><strong>{row.storeName}</strong><span className="code-chip">{row.store_code}</span></td>
                  <td>{row.owner}</td>
                  <td className={isOverdue(row.due_date) ? "negative" : ""}>{row.due_date}</td>
                  <td><span className={`chip ${taskTone(row.status)}`}>{row.status}</span></td>
                  <td><strong>{row.message}</strong><span>{row.next_action}</span></td>
                </tr>
              ))}
              {!filteredRows.length && <tr><td colSpan="8">目前篩選條件下無異常，維持每日巡檢與交接稽核即可。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HandoverModule({ report, handovers, onSave }) {
  const storeRows = handovers.filter((row) => row.store_id === report.store_id);
  const handoverTemplates = {
    開店: ["現金確認", "昨日待辦", "設備開機", "備料與清潔"],
    班中: ["尖峰補貨", "現金短溢", "客訴事件", "人力支援"],
    打烊: ["現金結算", "庫存盤點", "設備關閉", "閉店清潔"],
  };
  const [form, setForm] = useState({
    shift_type: "打烊",
    cash_status: "正常",
    inventory_status: "正常",
    equipment_status: "正常",
    cleaning_status: "完成",
    customer_issue: "",
    pending_tasks: "",
    manager_name: report.manager_name || "",
    status: "已完成",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm((current) => ({ ...current, manager_name: report.manager_name || current.manager_name }));
  }, [report.manager_name]);

  async function submit() {
    setSaving(true);
    const ok = await onSave(form);
    if (ok) {
      setForm({
        shift_type: "打烊",
        cash_status: "正常",
        inventory_status: "正常",
        equipment_status: "正常",
        cleaning_status: "完成",
        customer_issue: "",
        pending_tasks: "",
        manager_name: report.manager_name || "",
        status: "已完成",
      });
    }
    setSaving(false);
  }

  function applyShiftTemplate(shiftType) {
    setForm((current) => ({
      ...current,
      shift_type: shiftType,
      pending_tasks: current.pending_tasks || handoverTemplates[shiftType].join("、"),
    }));
  }

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="今日交接" value={`${storeRows.length} 筆`} detail={report.name} />
        <Metric label="需追蹤" value={`${storeRows.filter((row) => row.status === "需追蹤").length} 筆`} detail="未結案交接事項" tone="bad" />
        <Metric label="現金異常" value={`${storeRows.filter((row) => row.cash_status !== "正常").length} 筆`} detail="需店長說明" tone="warn" />
        <Metric label="清潔未完" value={`${storeRows.filter((row) => row.cleaning_status !== "完成").length} 筆`} detail="列入巡檢追蹤" tone="warn" />
        <Metric label="完成率" value={pct((storeRows.filter((row) => row.status === "已完成").length / Math.max(1, storeRows.length)) * 100)} detail="交接紀錄完成狀態" tone="good" />
      </section>
      <section className="panel module-form">
        <div className="panel-head">
          <div>
            <h2>交接填報</h2>
            <p>{report.name} · 開店、班中、打烊交接均可登錄。</p>
          </div>
        </div>
        <div className="handover-template-row">
          {Object.entries(handoverTemplates).map(([shiftType, items]) => (
            <button
              key={shiftType}
              type="button"
              className={form.shift_type === shiftType ? "active" : ""}
              onClick={() => applyShiftTemplate(shiftType)}
            >
              <strong>{shiftType}</strong>
              <span>{items.slice(0, 2).join("、")}</span>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <SelectField label="交接時段" value={form.shift_type} options={["開店", "班中", "打烊"]} onChange={(value) => setForm({ ...form, shift_type: value })} />
          <SelectField label="現金狀態" value={form.cash_status} options={["正常", "需追蹤", "短溢待查"]} onChange={(value) => setForm({ ...form, cash_status: value, status: value === "正常" ? form.status : "需追蹤" })} />
          <SelectField label="庫存狀態" value={form.inventory_status} options={["正常", "缺料預警", "需補貨", "待盤點"]} onChange={(value) => setForm({ ...form, inventory_status: value })} />
          <SelectField label="設備狀態" value={form.equipment_status} options={["正常", "需維修", "停用待修"]} onChange={(value) => setForm({ ...form, equipment_status: value })} />
          <SelectField label="清潔狀態" value={form.cleaning_status} options={["完成", "需補強", "未完成"]} onChange={(value) => setForm({ ...form, cleaning_status: value, status: value === "完成" ? form.status : "需追蹤" })} />
          <SelectField label="交接狀態" value={form.status} options={["已完成", "需追蹤"]} onChange={(value) => setForm({ ...form, status: value })} />
          <label>
            交接人
            <input value={form.manager_name} onChange={(event) => setForm({ ...form, manager_name: event.target.value })} />
          </label>
          <label className="wide-field">
            客訴／現場事件
            <textarea value={form.customer_issue} onChange={(event) => setForm({ ...form, customer_issue: event.target.value })} />
          </label>
          <label className="wide-field">
            待辦事項
            <textarea value={form.pending_tasks} onChange={(event) => setForm({ ...form, pending_tasks: event.target.value })} />
          </label>
        </div>
        <button className="submit-button static" disabled={saving} onClick={submit}>{saving ? "儲存中..." : "儲存交接紀錄"}</button>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>今日交接紀錄</h2>
            <p>總部與督導可依狀態追蹤未結案事項。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>時段</th><th>現金</th><th>庫存</th><th>設備</th><th>清潔</th><th>狀態</th><th>待辦</th></tr>
            </thead>
            <tbody>
              {storeRows.map((row) => (
                <tr key={row.id || `${row.store_id}-${row.shift_type}`}>
                  <td><strong>{row.shift_type}</strong><span>{row.manager_name}</span></td>
                  <td>{row.cash_status}</td>
                  <td>{row.inventory_status}</td>
                  <td>{row.equipment_status}</td>
                  <td>{row.cleaning_status}</td>
                  <td><span className={`chip ${row.status === "已完成" ? "good" : "warn"}`}>{row.status}</span></td>
                  <td>{row.pending_tasks || row.customer_issue || "-"}</td>
                </tr>
              ))}
              {!storeRows.length && <tr><td colSpan="7">今日尚無交接紀錄。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PerformanceModule({ stores, selectedStoreId, rows, onSave }) {
  const [form, setForm] = useState({
    store_id: selectedStoreId || stores[0]?.id || "",
    period_month: new Date().toISOString().slice(0, 7),
    employee_name: "",
    role_name: "正式人員",
    late_count: 0,
    leave_count: 0,
    absence_count: 0,
    service_delay_count: 0,
    score: 100,
    grade: "A",
    bonus_adjustment: 0,
    status: "正常",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const avgScore = rows.length ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length : 0;
  const totalBonusAdjustment = rows.reduce((sum, row) => sum + Number(row.bonus_adjustment || 0), 0);

  useEffect(() => {
    if (selectedStoreId) setForm((current) => ({ ...current, store_id: selectedStoreId }));
  }, [selectedStoreId]);

  function updatePerformanceField(patch) {
    setForm((current) => applyPerformanceCalculation(current, patch));
  }

  async function submit() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="本月人員" value={`${rows.length} 人`} detail="已建立績效紀錄" />
        <Metric label="平均分數" value={numberText(avgScore, 1)} detail="全門市人員平均" tone={avgScore >= 85 ? "good" : "warn"} />
        <Metric label="需輔導" value={`${rows.filter((row) => row.status === "需輔導").length} 人`} detail="低於 80 分" tone="bad" />
        <Metric label="獎金調整" value={money(totalBonusAdjustment)} detail="依等第自動計算" tone={totalBonusAdjustment < 0 ? "bad" : "warn"} />
        <Metric label="遲到合計" value={`${rows.reduce((sum, row) => sum + Number(row.late_count || 0), 0)} 分`} detail="每 5 分鐘扣 2 分" />
      </section>
      <section className="panel module-form">
        <div className="panel-head">
          <div>
            <h2>新增／更新績效</h2>
            <p>可依門店、人員、月份建立績效分數與獎懲紀錄。</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            門店
            <select value={form.store_id} onChange={(event) => setForm({ ...form, store_id: event.target.value })}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label>
            月份
            <input type="month" value={form.period_month} onChange={(event) => setForm({ ...form, period_month: event.target.value })} />
          </label>
          <label>
            姓名
            <input value={form.employee_name} onChange={(event) => setForm({ ...form, employee_name: event.target.value })} />
          </label>
          <SelectField label="職位" value={form.role_name} options={["店長", "副店長", "資深人員", "正式人員", "新進人員", "兼職人員", "兼職後勤", "送貨人員"]} onChange={(value) => setForm({ ...form, role_name: value })} />
          <IntegerField label="遲到分鐘" value={form.late_count} onChange={(value) => updatePerformanceField({ late_count: value })} />
          <IntegerField label="違規請假次數" value={form.leave_count} onChange={(value) => updatePerformanceField({ leave_count: value })} />
          <IntegerField label="曠職日數" value={form.absence_count} onChange={(value) => updatePerformanceField({ absence_count: value })} />
          <IntegerField label="出餐延遲分鐘" value={form.service_delay_count} onChange={(value) => updatePerformanceField({ service_delay_count: value })} />
          <label>
            績效分數
            <input type="number" value={form.score} disabled />
          </label>
          <label>
            獎金調整
            <input type="number" value={form.bonus_adjustment} disabled />
          </label>
          <label>
            等第
            <input value={form.grade} disabled />
          </label>
          <label>
            狀態
            <input value={form.status} disabled />
          </label>
          <label className="wide-field">
            備註／改善事項
            <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </label>
        </div>
        <button className="submit-button static" disabled={saving || !form.employee_name} onClick={submit}>{saving ? "儲存中..." : "儲存績效紀錄"}</button>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>人員績效表</h2>
            <p>用於月會、獎懲、店長約談與督導追蹤。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>門店</th><th>人員</th><th>職位</th><th>分數</th><th>等第</th><th>扣分項目</th><th>獎金調整</th><th>狀態</th><th>備註</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || `${row.store_id}-${row.employee_name}`}>
                  <td>{row.storeName}</td>
                  <td><strong>{row.employee_name}</strong></td>
                  <td>{row.role_name}</td>
                  <td>{numberText(row.score, 0)}</td>
                  <td>{row.grade}</td>
                  <td>遲到 {Number(row.late_count || 0)} 分／請假 {Number(row.leave_count || 0)} 次／曠職 {Number(row.absence_count || 0)} 日／延遲 {Number(row.service_delay_count || 0)} 分</td>
                  <td className={Number(row.bonus_adjustment || 0) < 0 ? "negative" : "positive"}>{money(row.bonus_adjustment)}</td>
                  <td><span className={`chip ${row.status === "正常" ? "good" : row.status === "提醒" ? "warn" : "bad"}`}>{row.status}</span></td>
                  <td>{row.note || row.action || "-"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="9">尚無人員績效紀錄。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function IntegerField({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="1"
        inputMode="numeric"
        value={numericInputValue(value)}
        onChange={(event) => onChange(event.target.value === "" ? "" : Number.parseInt(event.target.value, 10))}
      />
    </label>
  );
}

function ReviewConsole({ reports, report, products, onSelect, onReview }) {
  const defaultMonth = getMonthRange(today);
  const [dateFrom, setDateFrom] = useState(defaultMonth.start);
  const [dateTo, setDateTo] = useState(today);
  const [storeFilter, setStoreFilter] = useState("all");
  const [records, setRecords] = useState(reports);
  const [selectedReviewReport, setSelectedReviewReport] = useState(report);
  const [inventory, setInventory] = useState(products.map(blankInventoryProduct));
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const reviewableRows = buildDailyRevenueRows(records).filter(hasSubmittedReport);
  const visibleRows = reviewableRows.filter((item) => storeFilter === "all" || item.store_id === storeFilter);
  const activeReport = selectedReviewReport?.id ? selectedReviewReport : visibleRows[0] || report;

  useEffect(() => {
    setRecords(reports);
    const nextReport = reports.find((item) => item.store_id === report?.store_id && hasSubmittedReport(item)) || reports.find(hasSubmittedReport) || report;
    setSelectedReviewReport(nextReport);
  }, [reports, report]);

  useEffect(() => {
    let active = true;
    async function loadInventory() {
      if (!activeReport?.id) {
        setInventory(products.map(blankInventoryProduct));
        return;
      }
      try {
        const [savedRows, previousRows] = await Promise.all([
          fetchInventoryCounts(activeReport.id),
          fetchPreviousInventoryCounts(activeReport.store_id, activeReport.report_date),
        ]);
        if (!active) return;
        setInventory(mergeInventoryRows(products, savedRows, previousRows));
      } catch {
        if (active) setInventory(products.map(blankInventoryProduct));
      }
    }
    loadInventory();
    return () => {
      active = false;
    };
  }, [products, activeReport?.id, activeReport?.store_id, activeReport?.report_date]);

  async function loadReviewRecords() {
    setLoading(true);
    try {
      const { reports: rows } = await fetchHqDashboardData(dateFrom, dateTo);
      const submittedRows = rows.filter(hasSubmittedReport);
      setRecords(submittedRows);
      setSelectedReviewReport(submittedRows[0] || null);
    } finally {
      setLoading(false);
    }
  }

  async function review(action, status) {
    if (!activeReport?.id) return;
    setReviewing(true);
    const ok = await onReview(action, status, activeReport);
    if (ok) {
      const nextRows = records.map((item) => item.id === activeReport.id ? { ...item, status } : item);
      setRecords(nextRows);
      setSelectedReviewReport({ ...activeReport, status });
    }
    setReviewing(false);
  }

  const storeOptions = Array.from(new Map(reviewableRows.map((row) => [row.store_id, row.name])).entries());
  const statusCounts = {
    draft: records.filter((item) => !item.id || item.status === "draft").length,
    submitted: records.filter((item) => item.status === "submitted").length,
    followUp: records.filter((item) => item.status === "follow_up" || item.status === "needs_revision").length,
    approved: records.filter((item) => item.status === "approved").length,
  };

  return (
    <div className="workspace review-grid">
      <section className="status-board">
        <Metric label="未回報" value={statusCounts.draft} detail="尚無可審資料" tone="bad" />
        <Metric label="待審核" value={statusCounts.submitted} detail="已送出待確認" tone="warn" />
        <Metric label="需追蹤" value={statusCounts.followUp} detail="退回或補件" tone="bad" />
        <Metric label="已通過" value={statusCounts.approved} detail="審核完成" tone="good" />
      </section>
      <section className="panel wide review-filter-panel">
        <div className="panel-head">
          <div>
            <h2>營運審核查詢</h2>
            <p>可查各店過往回報紀錄，選擇紀錄後進行通過、退回修正或列入追蹤。</p>
          </div>
        </div>
        <div className="record-toolbar">
          <label>起日<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>迄日<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label>
            門店
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="all">全部門店</option>
              {storeOptions.map(([storeId, storeName]) => <option key={storeId} value={storeId}>{storeName}</option>)}
            </select>
          </label>
          <button className="primary" disabled={loading} onClick={loadReviewRecords}>{loading ? "查詢中..." : "查詢審核紀錄"}</button>
        </div>
      </section>
      <section className="panel store-queue">
        <div className="panel-head"><h2>回報紀錄</h2><p>點選查看明細</p></div>
        {visibleRows.map((item) => (
          <button className={item.id === activeReport?.id ? "selected queue-item" : "queue-item"} key={item.id} onClick={() => { setSelectedReviewReport(item); onSelect(item.store_id); }}>
            <span className={`dot ${tone(item.status)}`} />
            <strong>{item.name}</strong>
            <em>{item.report_date}</em>
            <small>{statusLabel(item.status)}</small>
          </button>
        ))}
        {!visibleRows.length && <div className="empty-text">目前查無可審核回報，請調整日期或門店。</div>}
      </section>
      <section className="panel review-main">
        <div className="panel-head">
          <div>
            <h2>{activeReport?.name || "尚未選擇回報"}</h2>
            <p>{activeReport?.report_date || "-"} · {activeReport?.manager_name || "未填店長"} · 總營收 {money(totalRevenue(activeReport || {}))}</p>
          </div>
          <span className={`chip ${tone(activeReport?.status)}`}>{statusLabel(activeReport?.status)}</span>
        </div>
        <div className="checkpoint-grid">
          <Metric label="14:00" value={money(activeReport?.opened_to_1400_revenue)} detail="開店至 14:00" />
          <Metric label="19:00" value={money(activeReport?.revenue_1400_to_1900)} detail="14:00 至 19:00" />
          <Metric label="打烊" value={money(activeReport?.revenue_1900_to_close)} detail="19:00 至打烊" />
          <Metric label="總營收" value={money(totalRevenue(activeReport || {}))} detail={`達成 ${pct((totalRevenue(activeReport || {}) / Math.max(1, Number(activeReport?.target || 0))) * 100)}`} tone="hot" />
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>品項</th><th>昨日庫存</th><th>今日盤點</th><th>報廢</th><th>調貨/進貨</th><th>來源</th><th>使用量</th><th>統計單位</th><th>備註</th></tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{formatInventoryAmount(item, "previous")}</td>
                  <td>{formatInventoryAmount(item, "stock")}</td>
                  <td>{numberText(item.loss_count)}</td>
                  <td>{formatInventoryAmount(item, "incoming")}</td>
                  <td>{item.incoming_source || "廠商進貨"}</td>
                  <td><strong>{numberText(usageCount(item))}</strong></td>
                  <td>{displayUnitForProduct(item.name)}</td>
                  <td>{item.transfer_note}</td>
                </tr>
              ))}
              {!activeReport?.id && <tr><td colSpan="9">請先選擇一筆已送出的回報。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel action-rail">
        <div className="panel-head"><h2>審核動作</h2><p>請依回報資料與異常狀態處理</p></div>
        <button disabled={reviewing || !activeReport?.id} className="primary" onClick={() => review("approve", "approved")}>通過</button>
        <button disabled={reviewing || !activeReport?.id} onClick={() => review("request_revision", "needs_revision")}>退回修正</button>
        <button disabled={reviewing || !activeReport?.id} onClick={() => review("assign_follow_up", "follow_up")}>列入追蹤</button>
      </section>
    </div>
  );
}
function Info({ title, text }) {
  return (
    <div className="info-card">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
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

function Progress({ value }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
      <em>{pct(value)}</em>
    </div>
  );
}
