import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { readReportInputs, reportInputsReady } from "./modules/daily-report/data/reportReadSnapshot.js";
import { RevenueInput } from "./modules/daily-report/components/StoreReportPage.jsx";
import { defaultSecuritySettings, deleteDailyReport, deleteDailyReports, fetchDailyReports, fetchDailyReportChangeRequests, fetchHandovers, fetchHqDashboardData, fetchHqTasks, fetchInventoryCounts, fetchPreviousInventoryCounts, fetchProducts, fetchSecuritySettings, fetchStaffPerformance, fetchStoreRelationGroups, fetchStoreStaff, fetchStores, getSessionProfile, hasSalaryAccess, hasSupabaseConfig, reviewReport, reviewDailyReportChangeRequest, recordStaffStoreTransfer, saveDailyOperations, signIn, signOut, requestCooSalaryAccess, statusLabel, updateStoreMonthlyTarget, upsertHandover, upsertHqTask, upsertSecuritySettings, upsertStaffPerformance, upsertStoreStaffMember, deleteStoreStaffMember } from "./lib/api";
import { STORE_MANAGER_REVENUE_ACCESS_LABEL, buildDailyReportPayload, buildWeeklySameDayRows as buildWeeklyComparisonRows, buildWeeklyStoreGroups, isStoreManagerRevenueDateAllowed, totalRevenue } from "./modules/daily-report";
import { StoreReportPage } from "./modules/daily-report/components";
import { overdueReportBusinessDate } from "./modules/daily-report/domain/businessDate.js";
import { buildDailyOverviewReports, buildOperationsOverview, buildOperationsPriorities, hasSubmittedOperationsReport as hasSubmittedReport } from "./modules/dashboard";
import { PRODUCT_ORDER, blankInventoryProduct, buildInventorySaveRows, displayUnitForProduct, mergeInventoryRows, toManagementQuantity, usageCount } from "./modules/inventory";
import { IncomingEditor, InventoryEditor, formatInventoryAmount } from "./modules/inventory/components";
import { MODULE_GROUPS, ROLE_LABELS, appViewForRole, canAccessModule, canEditMonthlyTargets, canExportRole, canManageDailyReportData, canConfirmDailyReports, canManageSecurity, defaultModuleForRole, modulesForRole, profileRole, visibleViewModesForRole } from "./modules/access";
import { STAFF_ROLE_OPTIONS, isOperationalStoreStaff, isStoreLeadershipRole } from "./modules/hr";
import { handoverSeed, hrChangeSeed, hqTaskSeed, hqSystemSeed, performanceSeed, productsSeed, salaryStructureSeed, scheduleSeed, staffRosterSeed, storeHoursSeed, storesSeed } from "./lib/mockData";
import { STORE_RELATION_GROUPS, STORE_OPERATING_STATUS, mergeStoreRelationGroups, operatingStatusOf } from "./lib/storeScope";
import { fetchStoreOperatingConfigurations, mergeStoreHours, normalizeSalarySetting } from "./modules/store-settings";
import { QuickCheckoutManagementPage } from "./modules/quick-checkout-management";
import { AccountManagementPage } from "./modules/account-management";
import ApprovalCenter from "./modules/approvals/ApprovalCenter.jsx";
import ApprovalNavLabel from "./modules/approvals/ApprovalNavLabel.jsx";
import { fetchPersonalScheduleByToken } from "./modules/scheduling/supabase";
import { InspectionApp } from "./InspectionApp";
import { daysInMonth, today, findStoreScopedRecord, canonicalStoreCode, reportClock, Metric, money, displayStoreName, leaveDraftKey, getSuggestedRestDays, isLeaveDay, countLeaveDays, getLeaveStatus, taskTone } from "./components/operationalPageSupport.jsx";
import { HrMasterModule } from "./modules/hr/components/HrMasterModule.jsx";
import { StoreSettingsModule } from "./modules/store-settings/components/StoreSettingsModule.jsx";
import { ScheduleModule } from "./modules/scheduling/components/ScheduleModule.jsx";
import { buildReportRecordsCsv, completeReportRecordsForExport, reportRecordsFilename, sortReportRecordsForExport, sortStoresForReportExport } from "./modules/daily-report/application/reportRecordsExport.js";
import { selectLockableReports } from "./modules/daily-report/application/reportRecordsActions.js";

const OnlineOrderingPage = lazy(() => import("./modules/online-ordering/OnlineOrderingPage.jsx"));
const TransferCenter = lazy(() => import("./modules/transfers/TransferCenter.jsx"));
const RepairModule = lazy(() => import("./modules/repairs/RepairModule.jsx"));
const StaffingOverviewPage = lazy(() => import("./modules/staffing-overview/StaffingOverviewPage.jsx"));

const numberText = (value, digits = 2) => Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: digits });

const pct = (value) => `${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;

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

function getPreviousWeekRanges(dateText) {
  const current = getWeekRange(dateText);
  return [2, 1].map((offset) => {
    const start = addDays(current.start, -7 * offset);
    return {
      start,
      end: addDays(start, 6),
      label: offset === 1 ? "上週" : "上上週",
    };
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
    status: report?.status || "draft",
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
  const [storeConfigurationData, setStoreConfigurationData] = useState({ settings: [], demands: [], audits: [], workforceViews: [], salarySettings: [] });
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [securitySettings, setSecuritySettings] = useState(defaultSecuritySettings);
  const [salaryAccessExpiresAt, setSalaryAccessExpiresAt] = useState("");

  function clearWorkspaceState() {
    setStores([]);
    setProducts([]);
    setReports([]);
    setHandovers([]);
    setPerformanceRows([]);
    setHqTasks([]);
    setStaffRoster([]);
    setStoreRelationGroups(STORE_RELATION_GROUPS);
    setStoreConfigurationData({ settings: [], demands: [], audits: [], workforceViews: [], salarySettings: [] });
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
    setStoreConfigurationData({ settings: [], demands: [], audits: [], workforceViews: [], salarySettings: [] });
  }

  async function loadWorkspace(nextProfile = profile, preferredStoreId = selectedStoreId, preferredReportDate = reportDate) {
    const [storeRows, productRows, reportRows, handoverRows, performanceData, taskRows, staffRows, relationGroups, configurationData] = await Promise.all([
      fetchStores(),
      fetchProducts(),
      fetchDailyReports(preferredReportDate),
      fetchHandovers(today),
      fetchStaffPerformance(new Date().toISOString().slice(0, 7)),
      fetchHqTasks(),
      fetchStoreStaff(),
      fetchStoreRelationGroups(),
      fetchStoreOperatingConfigurations(),
    ]);
    setStores(storeRows);
    setProducts(productRows);
    setHandovers(handoverRows);
    setPerformanceRows(performanceData);
    setHqTasks(taskRows);
    setStaffRoster(staffRows);
    setStoreRelationGroups(mergeStoreRelationGroups(relationGroups));
    setStoreConfigurationData(configurationData);
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
        if (error.code === "OPERATIONS_ACCESS_DENIED") await signOut();
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  const currentRole = profileRole(profile);
  const operationalStaffRoster = useMemo(() => staffRoster.filter(isOperationalStoreStaff), [staffRoster]);
  useEffect(() => {
    if (!loading && profile && new URLSearchParams(window.location.search).has('transfer') && canAccessModule(currentRole, 'transfers')) {
      setActiveModule('transfers');
    }
  }, [loading, profile, currentRole]);
  const canViewSalary = ["ceo", "cfo"].includes(currentRole)
    || (currentRole === "coo" && new Date(salaryAccessExpiresAt).getTime() > Date.now());
  const effectiveSalaryRows = useMemo(() => {
    if (storeConfigurationData.salarySettings?.length) {
      return storeConfigurationData.salarySettings.map(normalizeSalarySetting);
    }
    return salaryStructureSeed.map(normalizeSalarySetting);
  }, [storeConfigurationData.salarySettings]);
  const selectedReport = findStoreScopedRecord(reports, selectedStoreId) || (currentRole === "store_manager" ? null : reports[0]);
  const activeModuleAllowed = canAccessModule(currentRole, activeModule);
  const effectiveStoreHours = useMemo(
    () => mergeStoreHours(storeHoursSeed, storeConfigurationData.settings, stores, storeConfigurationData.demands),
    [storeConfigurationData, stores],
  );
  const effectiveScheduleRows = useMemo(() => {
    const hoursByName = new Map(effectiveStoreHours.map((row) => [row.storeName, row]));
    const storeByName = new Map(stores.map((store) => [store.name, store]));
    return scheduleSeed.map((row) => {
      const hours = hoursByName.get(row.storeName);
      const store = storeByName.get(row.storeName);
      const required = Number(hours?.duty_staff ?? row.required_staff ?? 0);
      const isActive = !store || operatingStatusOf(store) === STORE_OPERATING_STATUS.ACTIVE;
      return {
        ...row,
        required_staff: required,
        status: !isActive ? "暫停營業" : (row.assigned_staff?.length || 0) >= required ? "足夠" : "人力不足",
      };
    });
  }, [effectiveStoreHours, stores]);

  useEffect(() => {
    if (!profile || role === "entry") return;
    if (!canAccessModule(currentRole, activeModule)) {
      setActiveModule(defaultModuleForRole(currentRole));
    }
  }, [activeModule, currentRole, profile, role]);

  useEffect(() => {
    if (!profile || currentRole !== "coo") return;
    hasSalaryAccess()
      .then((allowed) => setSalaryAccessExpiresAt(allowed ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : ""))
      .catch(() => setSalaryAccessExpiresAt(""));
  }, [currentRole, profile]);

  async function unlockSalaryAccess() {
    const reason = window.prompt("請輸入本次查看薪資資料的管理原因（至少 3 個字）");
    if (!reason) return;
    try {
      const expiry = await requestCooSalaryAccess(reason);
      setSalaryAccessExpiresAt(expiry);
      await loadWorkspace();
      show("薪資資料已解鎖 15 分鐘，系統已留下稽核紀錄");
    } catch (error) {
      show(`薪資解鎖失敗：${error.message}`);
    }
  }

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
      if (error.code === "OPERATIONS_ACCESS_DENIED") await signOut();
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
    const lateReportDate = overdueReportBusinessDate(reportClock);
    const isLateReportDate = Boolean(lateReportDate && nextDate === lateReportDate);
    if (currentRole === "store_manager" && !isStoreManagerRevenueDateAllowed(nextDate, today)) {
      show(`店長帳號僅可回報或修改${STORE_MANAGER_REVENUE_ACCESS_LABEL}的資料`);
      return false;
    }
    if (nextDate < today && !isLateReportDate && authCode !== "8599") {
      show("過往日期需輸入認證碼 8599");
      return false;
    }
    setLoading(true);
    try {
      setReportDate(nextDate);
      await loadWorkspace(profile, selectedStoreId, nextDate);
      show(isLateReportDate ? "已切換至前一營業日逾期補填" : nextDate < today ? "已解鎖過往日期回報" : "已切換至目前營業日");
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
    <div className={`app ${currentRole === "store_manager" ? "store-manager-app" : "hq-app"}`}>
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
            stores={stores}
            reports={reports}
            products={products}
            handovers={handovers}
            performanceRows={performanceRows}
            staffRoster={operationalStaffRoster}
            scheduleRows={effectiveScheduleRows}
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
            storeCode={canonicalStoreCode(selectedReport)}
            reportDate={reportDate}
            products={products}
            currentRole={currentRole}
            staffRoster={operationalStaffRoster}
            today={today}
            reportClock={reportClock}
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
              staffRoster={operationalStaffRoster}
              scheduleRows={effectiveScheduleRows}
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
            salaryRows={effectiveSalaryRows}
            storeHours={effectiveStoreHours}
            staffRoster={staffRoster}
            currentRole={currentRole}
            canViewSalary={canViewSalary}
            onUnlockSalary={unlockSalaryAccess}
            onSaveStaffMember={saveStaffMember}
            onDeleteStaffMember={removeStaffMember}
            onTransferStaffMember={transferStaffMember}
          />
        )}
        {activeModuleAllowed && activeModule === "onlineOrdering" && <Suspense fallback={<p>正在載入線上點餐…</p>}><OnlineOrderingPage profile={profile} stores={stores} /></Suspense>}
        {activeModuleAllowed && activeModule === "staffingOverview" && (
          <Suspense fallback={<p role="status">正在載入人力掌握…</p>}>
            <StaffingOverviewPage
              stores={stores}
              staffRoster={operationalStaffRoster}
              selectedStoreId={selectedStoreId}
              profile={profile}
              currentRole={currentRole}
              onSelectStore={setSelectedStoreId}
              onRefresh={() => loadWorkspace(profile, selectedStoreId, reportDate)}
            />
          </Suspense>
        )}
        {activeModuleAllowed && activeModule === "system" && (
          <ManagementSystemModule systems={hqSystemSeed} />
        )}
        {activeModuleAllowed && activeModule === "security" && (
          <SecurityModule settings={securitySettings} onSave={saveSecuritySettings} />
        )}
        {activeModuleAllowed && activeModule === "storeSettings" && (
          <StoreSettingsModule
            stores={stores}
            storeHours={effectiveStoreHours}
            relationGroups={storeRelationGroups}
            configurationData={storeConfigurationData}
            salaryRows={effectiveSalaryRows}
            canViewSalary={canViewSalary}
            onUnlockSalary={unlockSalaryAccess}
            onSaved={async () => {
              await loadWorkspace(profile, selectedStoreId, reportDate);
              show("門店營運設定已生效，相關看板與排班資料已同步");
            }}
          />
        )}
        {activeModuleAllowed && activeModule === "checkoutManagement" && (
          <QuickCheckoutManagementPage onNotify={show} />
        )}
        {activeModuleAllowed && activeModule === "accountManagement" && (
          <AccountManagementPage profile={profile} />
        )}
        {activeModuleAllowed && activeModule === "transfers" && <Suspense fallback={<p role="status">正在載入調貨中心…</p>}><TransferCenter /></Suspense>}
        {activeModuleAllowed && activeModule === "repairs" && <Suspense fallback={<p role="status">正在載入門店報修…</p>}><RepairModule profile={profile} /></Suspense>}
        {activeModuleAllowed && activeModule === "approvals" && (
          <ApprovalCenter profile={profile} stores={stores} />
        )}
        {activeModuleAllowed && activeModule === "schedule" && (
          <ScheduleModule
            scheduleRows={effectiveScheduleRows}
            storeHours={effectiveStoreHours}
            staffRoster={operationalStaffRoster}
            salaryRows={effectiveSalaryRows}
            stores={stores}
            profile={profile}
            selectedStoreId={selectedStoreId}
            selectedReport={selectedReport}
            currentRole={currentRole}
            canViewSalary={canViewSalary}
            storeRelationGroups={storeRelationGroups}
            workforceViews={storeConfigurationData.workforceViews || []}
            onNotify={show}
          />
        )}
        {activeModuleAllowed && activeModule === "tasks" && (
          <HqTaskDispatchModule tasks={hqTasks} stores={stores} selectedStoreId={selectedStoreId} onSave={saveHqTask} />
        )}
        {activeModuleAllowed && activeModule === "hrFlow" && (
          <HrFlowModule changes={hrChangeSeed} salaryRows={effectiveSalaryRows} />
        )}
        {activeModuleAllowed && activeModule === "anomaly" && (
          <AnomalyCenterModule
            reports={reports}
            handovers={handovers}
            performanceRows={performanceRows}
            staffRoster={operationalStaffRoster}
            scheduleRows={effectiveScheduleRows}
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
                {!row.shifts.length && <span>{row.status === "workday" ? "依門店月排假，未設定時段" : "-"}</span>}
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
        <h1>萊吉多營運管理中心</h1>
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
          帳號 / Email
          <input
            value={email}
            readOnly={demoMode}
            placeholder={demoMode ? "" : "例如：S01 或 S01@laigdo.com"}
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(event) => setEmail(event.target.value)}
          />
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
        <h1>萊吉多營運管理中心</h1>
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

export function Sidebar({
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
          <strong><span className="brand-full">萊吉多營運管理中心</span><span className="brand-short">萊吉多營運</span></strong>
          <span>門店作業與總部管理</span>
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
          <div className="store-scope-heading">
            <span>目前門店</span>
            <strong>{selectedStore?.name || profile?.store_code || "已綁定門店"}</strong>
          </div>
          <div className="store-account-row">
            <span>{profile?.full_name || `${profile?.store_code || "門店"} 分帳號`}</span>
            <div className="store-account-actions">
              <strong>{ROLE_LABELS[currentRole] || "門店店長"}</strong>
              <button className="store-account-signout" type="button" onClick={onSignOut}>登出</button>
            </div>
          </div>
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
            profile={profile}
            title={group.title}
            items={group.items}
            activeModule={activeModule}
            allowedModules={modulesForRole(currentRole)}
            onSelect={(moduleName) => (moduleName === "inspection" ? onInspection() : setActiveModule(moduleName))}
          />
        ))}
      </nav>
      {!isStoreManager && (
        <div className="sidebar-note hq-account-row">
          <div>
            <span>{profile?.full_name || "示範使用者"}</span>
            <strong>{ROLE_LABELS[currentRole] || currentRole}</strong>
          </div>
          <button type="button" onClick={onSignOut}>登出 / 回登入頁</button>
        </div>
      )}
    </aside>
  );
}

function NavGroup({ title, items, activeModule, allowedModules, onSelect, profile }) {
  const visibleItems = items.filter(([key]) => allowedModules.includes(key));
  const storeMobileLabels = {
    onlineOrdering: "接單",
    ops: "回報",
    schedule: "排班",
    staffingOverview: "人力",
    transfers: "調貨",
    repairs: "報修",
  };
  if (!visibleItems.length) return null;
  return (
    <div className="nav-group">
      <span>{title}</span>
      {visibleItems.map(([key, label]) => (
        <button key={key} aria-label={label} className={activeModule === key ? "active" : ""} onClick={() => onSelect(key)}>
          {key === "approvals" ? <ApprovalNavLabel profile={profile} /> : (
            <>
              <span className="nav-label-full">{label}</span>
              <span className="nav-label-short">{storeMobileLabels[key] || label}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

export function TopBar({ activeModule, reportDate, role, profileRole: currentRole, report, onSync, onExport }) {
  const titleMap = {
    onlineOrdering: "線上點餐管理",
    approvals: "簽核中心",
    handover: "門市交接管理",
    performance: "人員績效管理",
    hr: "人資主檔管理",
    staffingOverview: "門店人力掌握",
    system: "總部制度中心",
    schedule: "排班管理",
    transfers: "調貨中心",
    repairs: "門店報修",
    tasks: "總部任務派遣",
    hrFlow: "人資異動流程",
    anomaly: "總部異常中心",
    checkoutManagement: "總部點單管理",
  };
  const isStoreManager = currentRole === "store_manager";
  const title = titleMap[activeModule] || (role === "hq" ? "總部營運總覽" : role === "store" ? "每日回報" : "門店回報審核台");
  return (
    <header className={`topbar ${isStoreManager ? "store-topbar" : ""}`}>
      <div>
        <p>營業日 {reportDate || today} · {report?.area || "全區"} · {report?.name || "尚未選擇門店"}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        {!["approvals", "repairs", "staffingOverview", "onlineOrdering"].includes(activeModule) && canExportRole(currentRole) && <button onClick={onExport}>匯出 CSV</button>}
        {!["approvals", "repairs", "staffingOverview", "onlineOrdering"].includes(activeModule) && <button className="primary" onClick={onSync}>{isStoreManager ? "同步" : "同步資料"}</button>}
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

export function RoleHomePanel({ roleName, summary, reports, anomalyRows, securitySettings, onSelect, onOpenModule }) {
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
      subtitle: "先看昨日營收與回報完整度，再處理今日異常與排班缺口。",
      metrics: [
        ["逾期回報", `${summary.overdueReports.length} 店`, summary.overdueReports[0]?.name || "無逾期", summary.overdueReports.length ? "bad" : "good"],
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
        ["逾期回報", `${summary.overdueReports.length} 店`, summary.overdueReports[0]?.name || "無逾期", summary.overdueReports.length ? "bad" : "good"],
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
        ["逾期回報", `${summary.overdueReports.length} 店`, summary.overdueReports[0]?.name || "無逾期", summary.overdueReports.length ? "bad" : "good"],
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
  const priorityRows = buildOperationsPriorities(summary).map((row) => ({
    ...row,
    message: row.message || `目前達成率 ${pct(row.attainment)}`,
  }));
  const summaryReady = summary.dataReady !== false;
  const summaryDate = summary.referenceDate || "前一營業日";
  const periodLabel = summary.periodLabel || "目前日期";
  const displayMetrics = [
    [`${periodLabel}營收`, summaryReady ? money(summary.total) : "待同步", `${summaryDate} · 目標 ${money(summary.target)}`, "hot"],
    [`${periodLabel}達成率`, summaryReady ? pct(summary.attainmentRate) : "待同步", `${summaryDate} 營收目標`, summary.attainmentRate >= 100 ? "good" : "warn"],
    [`${periodLabel}回報完成率`, summaryReady ? pct(summary.reportRate) : "待同步", `${summary.reportedRows.length}/${reports.length} 門店`, summary.reportRate >= 90 ? "good" : "warn"],
    ["今日待處理", `${priorityRows.length} 件`, priorityRows[0]?.type || "目前無異常", priorityRows.length ? "bad" : "good"],
  ];

  return (
    <section className="panel wide role-home role-command-center">
      <div className="panel-head role-home-head">
        <div>
          <span className="dashboard-kicker">營運決策</span>
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
        <section className="role-focus-panel">
          <div className="dashboard-section-title">
            <div>
              <span>待辦焦點</span>
              <h3>今日優先處理</h3>
            </div>
            <strong>{priorityRows.length} 件</strong>
          </div>
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
        </section>
        <section className="role-ranking-panel">
          <div className="dashboard-section-title">
            <div>
              <span>營運表現</span>
              <h3>門店達成率</h3>
            </div>
            <strong>前 6 店</strong>
          </div>
          <div className="rank-list">
            {summary.ranking.slice(0, 6).map((row, index) => (
              <button key={row.store_id || row.id} type="button" className="rank-row" onClick={() => onSelect?.(row.store_id)}>
                <span>{index + 1}</span>
                <strong>{row.name}</strong>
                <Progress value={row.attainment} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export function HqRevenueUsageSummary({ revenueSummary, usageSummary, weekRange, monthRange }) {
  return (
    <section className="panel wide hq-summary-panel hq-summary-band">
      <div className="panel-head hq-summary-head">
        <div>
          <span className="dashboard-kicker">關鍵數字</span>
          <h2>營收與使用量彙總</h2>
          <p>週統計為週一至週日；月統計為本月。</p>
        </div>
      </div>
      <div className="hq-summary-layout">
        <section className="hq-summary-group revenue">
          <div className="hq-summary-group-head">
            <span>NT$</span>
            <div>
              <h3>營收</h3>
              <p>掌握各期間累計營業額</p>
            </div>
          </div>
          <div className="summary-grid">
            <Metric label="今日" value={money(revenueSummary.daily)} detail={`營業日 ${today}`} tone="hot" />
            <Metric label="本週" value={money(revenueSummary.week)} detail={`${weekRange.start} 至 ${weekRange.end}`} />
            <Metric label="本月" value={money(revenueSummary.month)} detail={`${monthRange.start} 至 ${monthRange.end}`} />
          </div>
        </section>
        <section className="hq-summary-group usage">
          <div className="hq-summary-group-head">
            <span>件</span>
            <div>
              <h3>產品使用量</h3>
              <p>依每日庫存差額彙整</p>
            </div>
          </div>
          <div className="summary-grid">
            <Metric label="今日" value={`${usageSummary.daily} 件`} detail="昨日庫存 - 今日庫存" tone="warn" />
            <Metric label="本週" value={`${usageSummary.week} 件`} detail="週一至週日" />
            <Metric label="本月" value={`${usageSummary.month} 件`} detail="本月累計" />
          </div>
        </section>
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
    () => ({
      ...buildOperationsOverview({
        reports,
        handovers,
        staffRoster,
        scheduleRows,
        hqTasks,
        anomalyRows,
        today,
        resolveStoreCode: canonicalStoreCode,
      }),
      periodLabel: "目前日期",
      referenceDate: reports[0]?.report_date || today,
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
  stores,
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
  const [periodDataReady, setPeriodDataReady] = useState(false);
  const [targetDrafts, setTargetDrafts] = useState({});
  const [targetMessage, setTargetMessage] = useState("");
  const [savingTargetId, setSavingTargetId] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const weekRange = useMemo(() => getWeekRange(today), []);
  const monthRange = useMemo(() => getMonthRange(today), []);
  const comparisonWeekRanges = useMemo(() => getPreviousWeekRanges(today), []);
  const periodStart = [monthRange.start, comparisonWeekRanges[0].start].sort()[0];

  useEffect(() => {
    let active = true;
    async function loadPeriodData() {
      setPeriodDataReady(false);
      try {
        const { reports: rows, inventoryRows } = await fetchHqDashboardData(periodStart, today);
        if (!active) return;
        setPeriodRows(rows);
        setUsageRows(inventoryRows);
        setPeriodDataReady(true);
      } catch {
        if (active) {
          setPeriodRows(reports);
          setUsageRows([]);
          setPeriodDataReady(false);
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
  const weeklyRevenueRows = useMemo(() => buildWeeklyRevenueRows(periodRows.length ? periodRows : reports, comparisonWeekRanges), [periodRows, reports, comparisonWeekRanges]);
  const weeklyComparisonRows = useMemo(() => buildWeeklySameDayRows(periodRows.length ? periodRows : reports, today), [periodRows, reports]);
  const usageMatrix = useMemo(() => buildUsageMatrix(usageSummary.rows), [usageSummary.rows]);
  const dataQuality = useMemo(() => buildDataQualitySummary(reports, handovers, performanceRows), [reports, handovers, performanceRows]);
  const overdueBusinessDate = overdueReportBusinessDate(reportClock);
  const overdueReports = useMemo(() => {
    if (!periodDataReady || !overdueBusinessDate) return [];
    const submittedStoreCodes = new Set(
      periodRows
        .filter((row) => row.report_date === overdueBusinessDate && hasSubmittedReport(row))
        .map((row) => canonicalStoreCode(row)),
    );
    return reports
      .filter((row) => row.operating_status !== "suspended" && row.is_active !== false)
      .filter((row) => !submittedStoreCodes.has(canonicalStoreCode(row)))
      .map((row) => ({ ...row, report_date: overdueBusinessDate }));
  }, [overdueBusinessDate, periodDataReady, periodRows, reports]);
  const anomalyRows = useMemo(
    () => buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks }),
    [reports, handovers, performanceRows, staffRoster, scheduleRows, hqTasks],
  );
  const decisionDate = addDays(today, -1);
  const decisionReports = useMemo(
    () => buildDailyOverviewReports({
      stores: reports,
      periodReports: periodRows,
      date: decisionDate,
      resolveStoreCode: canonicalStoreCode,
    }),
    [decisionDate, periodRows, reports],
  );
  const opsSummary = useMemo(
    () => ({
      ...buildOperationsOverview({
        reports: decisionReports,
        overdueReports,
        handovers,
        staffRoster,
        scheduleRows,
        hqTasks,
        anomalyRows,
        today,
        resolveStoreCode: canonicalStoreCode,
      }),
      referenceDate: decisionDate,
      periodLabel: "昨日",
      dataReady: periodDataReady,
    }),
    [decisionDate, decisionReports, overdueReports, handovers, staffRoster, scheduleRows, hqTasks, anomalyRows, periodDataReady],
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
        reports={decisionReports}
        anomalyRows={anomalyRows}
        securitySettings={securitySettings}
        onSelect={onSelect}
        onOpenModule={onOpenModule}
      />
      <HqRevenueUsageSummary
        revenueSummary={revenueSummary}
        usageSummary={usageSummary}
        weekRange={weekRange}
        monthRange={monthRange}
      />
      <details className="panel wide dashboard-disclosure hq-compact-store-table hq-daily-revenue-table">
        <summary className="dashboard-disclosure-summary">
          <div>
            <h2>每日營收情況</h2>
            <p>各店每日營收、達成率、庫存與回報狀態。</p>
          </div>
          <span className="dashboard-disclosure-hint">查看明細</span>
        </summary>
        <div className="dashboard-disclosure-body table-wrap">
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
                  <td><strong>{report.name}</strong></td>
                  <td>{report.report_date}</td>
                  <td>{money(report.opened_to_1400_revenue)}</td>
                  <td>{money(report.revenue_1400_to_1900)}</td>
                  <td>{money(report.revenue_1900_to_close)}</td>
                  <td><strong>{money(totalRevenue(report))}</strong></td>
                  <td><Progress value={(totalRevenue(report) / report.target) * 100} attainmentStatus /></td>
                  <td>{report.inventory_status}</td>
                  <td className={report.cash_difference < 0 ? "negative" : ""}>{report.cash_difference ?? "未填"}</td>
                  <td><span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <HqOperationsView rows={weeklyComparisonRows} />
      <details className="panel wide dashboard-disclosure hq-compact-store-table hq-target-table">
        <summary className="dashboard-disclosure-summary">
          <div>
            <h2>本月營業額目標設定</h2>
            <p>{canEditTargets ? "輸入各店本月目標，系統自動換算每日目標，供達成率與週會檢討使用。" : "此角色可查看目標與達成率，但不可調整營業目標。"}</p>
          </div>
          <span className="dashboard-disclosure-hint">{targetMessage || "查看設定"}</span>
        </summary>
        <div className="dashboard-disclosure-body table-wrap compact">
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
      </details>
      <HqReportRecords
        stores={stores}
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
      <details className="panel wide dashboard-disclosure hq-compact-store-table hq-weekly-revenue-table">
        <summary className="dashboard-disclosure-summary">
          <div>
            <h2>上週與上上週營收對比</h2>
            <p>以上週完整七天對比上上週，查看各店營收增減。</p>
          </div>
          <span className="dashboard-disclosure-hint">查看趨勢</span>
        </summary>
        <div className="dashboard-disclosure-body table-wrap">
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
      </details>
      <details className="panel wide dashboard-disclosure">
        <summary className="dashboard-disclosure-summary">
          <div>
            <h2>各門市產品使用量</h2>
            <p>以品項為主比較各店使用量；高於同品項平均 20% 標示強，低於平均 20% 標示弱。</p>
          </div>
          <span className="dashboard-disclosure-hint">查看品項</span>
        </summary>
        <div className="dashboard-disclosure-body table-wrap compact">
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
      </details>
    </div>
  );
}

export function HqOperationsView({ rows }) {
  const storeOptions = Array.from(
    new Map(rows.map((row) => [row.storeCode || row.storeName, row.storeName])).entries(),
  );
  const [selectedStoreCode, setSelectedStoreCode] = useState("all");
  const visibleRows = rows
    .filter((row) => row.currentTotal || row.previousTotal)
    .filter((row) => selectedStoreCode === "all" || (row.storeCode || row.storeName) === selectedStoreCode)
    .slice(0, 80);
  const storeGroups = buildWeeklyStoreGroups(visibleRows);
  const shortDate = (value) => String(value || "").slice(5).replace("-", "/");
  const periodAmount = (report, value) => report ? money(value) : "未回報";
  const comparisonState = (row) => {
    if (!row.current) return { label: "本週未回報", tone: "missing" };
    if (!row.previous) return { label: "無上週資料", tone: "neutral" };
    if (row.delta > 0) return { label: `+${pct(row.growth)}`, tone: "up" };
    if (row.delta < 0) return { label: pct(row.growth), tone: "down" };
    return { label: "持平", tone: "flat" };
  };
  return (
    <details className="panel wide dashboard-disclosure">
      <summary className="dashboard-disclosure-summary">
        <div>
          <h2>營運視圖</h2>
          <p>各店本週同星期對比上週同星期，快速看出哪一天成長、哪一天下滑。</p>
        </div>
        <span className="dashboard-disclosure-hint">查看比較</span>
      </summary>
      <div className="dashboard-disclosure-body hq-operations-groups">
        <div className="hq-operations-toolbar">
          <label htmlFor="hq-operations-store">查看門店</label>
          <select id="hq-operations-store" value={selectedStoreCode} onChange={(event) => setSelectedStoreCode(event.target.value)}>
            <option value="all">全部門店</option>
            {storeOptions.map(([storeCode, storeName]) => (
              <option key={storeCode} value={storeCode}>{storeCode} {storeName}</option>
            ))}
          </select>
        </div>
        {storeGroups.map((group, groupIndex) => (
          <section className="hq-store-comparison" style={{ "--store-order": groupIndex }} key={group.storeCode || group.storeName}>
            <header className="hq-store-comparison-head">
              <div className="hq-store-identity">
                <span>{group.storeCode}</span>
                <h3>{group.storeName}</h3>
              </div>
              <div className="hq-store-week-summary">
                <div className="current"><span>本週累計</span><strong>{money(group.currentTotal)}</strong><small>已回報 {group.currentCount}/7 天</small></div>
                <div className="previous"><span>上週同期</span><strong>{money(group.previousTotal)}</strong><small>已有 {group.previousCount}/7 天資料</small></div>
                <div className={`change ${group.delta < 0 ? "down" : group.delta > 0 ? "up" : "flat"}`}>
                  <span>同期增減</span>
                  <strong>{group.comparisonReady ? `${group.delta > 0 ? "+" : ""}${money(group.delta)}` : "資料不足"}</strong>
                  <small>{group.comparisonReady ? `${group.growth > 0 ? "+" : ""}${pct(group.growth)}` : "需兩週皆有回報"}</small>
                </div>
              </div>
            </header>

            <div className="hq-week-desktop table-wrap">
              <table className="hq-week-table">
                <caption className="sr-only">{group.storeName}本週與上週同星期營收比較</caption>
                <thead>
                  <tr className="period-head">
                    <th rowSpan="2">星期</th>
                    <th className="current" colSpan="5">本週</th>
                    <th className="previous" colSpan="5">上週</th>
                    <th className="comparison" colSpan="2">同期比較</th>
                  </tr>
                  <tr>
                    <th className="current">日期</th><th className="current">14:00</th><th className="current">19:00</th><th className="current">打烊</th><th className="current total">全日</th>
                    <th className="previous">日期</th><th className="previous">14:00</th><th className="previous">19:00</th><th className="previous">打烊</th><th className="previous total">全日</th>
                    <th className="comparison">差額</th><th className="comparison">成長率</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => {
                    const state = comparisonState(row);
                    return (
                      <tr className={!row.current ? "is-missing" : ""} key={`${row.storeCode}-${row.currentDate}`}>
                        <th scope="row"><strong>{row.weekday}</strong></th>
                        <td className="current date">{shortDate(row.currentDate)}</td>
                        <td className="current">{periodAmount(row.current, row.current?.opened_to_1400_revenue)}</td>
                        <td className="current">{periodAmount(row.current, row.current?.revenue_1400_to_1900)}</td>
                        <td className="current">{periodAmount(row.current, row.current?.revenue_1900_to_close)}</td>
                        <td className="current total">{periodAmount(row.current, row.currentTotal)}</td>
                        <td className="previous date">{shortDate(row.previousDate)}</td>
                        <td className="previous">{periodAmount(row.previous, row.previous?.opened_to_1400_revenue)}</td>
                        <td className="previous">{periodAmount(row.previous, row.previous?.revenue_1400_to_1900)}</td>
                        <td className="previous">{periodAmount(row.previous, row.previous?.revenue_1900_to_close)}</td>
                        <td className="previous total">{periodAmount(row.previous, row.previousTotal)}</td>
                        <td className={`comparison ${state.tone}`}>{row.current && row.previous ? `${row.delta > 0 ? "+" : ""}${money(row.delta)}` : "—"}</td>
                        <td className="comparison"><span className={`hq-trend ${state.tone}`}>{state.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="hq-week-mobile-list">
              {group.rows.map((row) => {
                const state = comparisonState(row);
                return (
                  <article className={`hq-week-day-card ${!row.current ? "is-missing" : ""}`} key={`mobile-${row.storeCode}-${row.currentDate}`}>
                    <div className="hq-week-day-head">
                      <span><strong>{row.weekday}</strong><small>{shortDate(row.currentDate)} 對比 {shortDate(row.previousDate)}</small></span>
                      <span className={`hq-trend ${state.tone}`}>{state.label}</span>
                    </div>
                    <div className="hq-week-periods">
                      <div className="current">
                        <span>本週</span><strong>{periodAmount(row.current, row.currentTotal)}</strong>
                        <small>14時 {periodAmount(row.current, row.current?.opened_to_1400_revenue)}</small>
                        <small>19時 {periodAmount(row.current, row.current?.revenue_1400_to_1900)}</small>
                        <small>打烊 {periodAmount(row.current, row.current?.revenue_1900_to_close)}</small>
                      </div>
                      <div className="previous">
                        <span>上週</span><strong>{periodAmount(row.previous, row.previousTotal)}</strong>
                        <small>14時 {periodAmount(row.previous, row.previous?.opened_to_1400_revenue)}</small>
                        <small>19時 {periodAmount(row.previous, row.previous?.revenue_1400_to_1900)}</small>
                        <small>打烊 {periodAmount(row.previous, row.previous?.revenue_1900_to_close)}</small>
                      </div>
                    </div>
                    {row.current && row.previous && <p>同期差額 <strong className={row.delta < 0 ? "negative" : row.delta > 0 ? "positive" : ""}>{row.delta > 0 ? "+" : ""}{money(row.delta)}</strong></p>}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {!storeGroups.length && <div className="empty-text">目前尚無足夠資料可做週對週同日比較。</div>}
      </div>
    </details>
  );
}

export function HqReportRecords({
  stores = [],
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
  const [exportSort, setExportSort] = useState("store_date_asc");
  const [records, setRecords] = useState(reports);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [tab, setTab] = useState("sales");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeRequests, setChangeRequests] = useState([]);
  const [workflowBusyId, setWorkflowBusyId] = useState("");
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [inventoryReadState, setInventoryReadState] = useState({ phase: "idle" });
  const [inventoryReadAttempt, setInventoryReadAttempt] = useState(0);
  const inventoryReadKey = `${selected?.id}:${selected?.report_date}:${inventoryReadAttempt}`;
  const inventoryReady = reportInputsReady(inventoryReadState, inventoryReadKey);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setInventoryReadState({ key: inventoryReadKey, phase: "loading" });
    readReportInputs({
      saved: { label: "當日庫存", read: () => fetchInventoryCounts(selected.id) },
      previous: { label: "昨日庫存", read: () => fetchPreviousInventoryCounts(selected.store_id, selected.report_date) },
    }).then(({ saved, previous }) => {
      if (!active) return;
      setInventory(mergeInventoryRows(products, saved, previous, {
        storeCode: canonicalStoreCode(selected), reportDate: selected.report_date,
      }));
      setInventoryReadState({ key: inventoryReadKey, phase: "ready" });
    }).catch(error => {
      if (active) setInventoryReadState({ key: inventoryReadKey, phase: "error", message: error.message });
    });
    return () => { active = false; };
  }, [selected, products, inventoryReadKey]);

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
    setInventoryReadState({ phase: "loading" });
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
    const inventoryOptions = {
      storeCode: canonicalStoreCode(report),
      reportDate: report.report_date,
    };
    setInventory(products.map((product) => blankInventoryProduct(product, inventoryOptions)));
  }

  async function saveSelected() {
    if (!selected || !form || !inventoryReady || saving) return;
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

  function exportVisibleRecords() {
    const selectedStoreName = storeFilter === "all"
      ? "全部門店"
      : storeOptions.find(([storeId]) => storeId === storeFilter)?.[1] || "指定門店";
    const exportStores = exportableStores
      .filter((store) => storeFilter === "all" || String(store.id) === String(storeFilter))
    if (!exportStores.length) {
      onNotify?.("目前沒有可匯出的門店");
      return;
    }
    const completedRows = completeReportRecordsForExport({
      rows: visibleRows,
      stores: exportStores,
      dateFrom,
      dateTo,
    });
    downloadTextFile(
      buildReportRecordsCsv(sortReportRecordsForExport(completedRows, exportSort)),
      reportRecordsFilename({ dateFrom, dateTo, storeName: selectedStoreName }),
    );
    onNotify?.(`已匯出 ${completedRows.length} 列，未回報日期已保留空白`);
  }

  async function confirmVisibleReports() {
    if (!canConfirmReports || bulkConfirming) return;
    const targets = selectLockableReports(visibleRows);
    if (!targets.length) {
      onNotify?.("目前查詢結果沒有可鎖定的已送出紀錄");
      return;
    }
    if (!window.confirm(`確定要將目前查詢結果中的 ${targets.length} 筆已送出紀錄全部確認鎖定嗎？`)) return;

    setBulkConfirming(true);
    const confirmedIds = new Set();
    const failedRows = [];
    try {
      for (const report of targets) {
        try {
          await reviewReport(report.id, "approve", "總部一鍵確認並鎖定", "approved");
          confirmedIds.add(report.id);
        } catch (error) {
          failedRows.push({ report, error });
        }
      }
      setRecords((rows) => rows.map((row) => (
        confirmedIds.has(row.id) ? { ...row, status: "approved" } : row
      )));
      if (failedRows.length) {
        onNotify?.(`一鍵鎖定完成：成功 ${confirmedIds.size} 筆，失敗 ${failedRows.length} 筆，請重新查詢後確認`);
      } else {
        onNotify?.(`已完成 ${confirmedIds.size} 筆回報紀錄確認鎖定`);
      }
      onRefresh?.();
    } finally {
      setBulkConfirming(false);
    }
  }

  const exportableStores = sortStoresForReportExport(
    stores.filter((store) => /^S\d{2}$/i.test(store.store_code || "") && store.is_active !== false),
  );
  const storeOptions = exportableStores.map((store) => [store.id, store.name]);
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
    <details className="panel wide hq-report-records dashboard-disclosure hq-compact-store-table">
      <summary className="dashboard-disclosure-summary">
        <div>
          <h2>各門店回報紀錄</h2>
          <p>總部可查詢各門店每日營收、庫存、調貨紀錄，並依權限修改或清除單日資料。</p>
        </div>
        <span className="dashboard-disclosure-hint">查詢紀錄</span>
      </summary>
      <div className="dashboard-disclosure-body">
      <p className="dashboard-disclosure-note">使用量 = 昨日庫存 - 今日庫存</p>
      <div className="record-toolbar">
        <div className="record-toolbar-pair">
          <label>
            起日
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            迄日
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>
        <div className="record-toolbar-pair">
          <label>
            門店
            <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
              <option value="all">全部門店</option>
              {storeOptions.map(([storeId, storeName]) => <option key={storeId} value={storeId}>{storeName}</option>)}
            </select>
          </label>
          <label>
            匯出排序
            <select value={exportSort} onChange={(event) => setExportSort(event.target.value)}>
              <option value="store_date_asc">依門店分組・日期小到大</option>
              <option value="date_asc">依日期小到大・同日按門店</option>
            </select>
          </label>
        </div>
        <div className="record-toolbar-pair record-toolbar-actions">
          <button className="primary" onClick={loadRecords} disabled={loading}>{loading ? "讀取中..." : "查詢紀錄"}</button>
          <button type="button" onClick={exportVisibleRecords} disabled={loading || !exportableStores.length}>匯出查詢結果</button>
        </div>
        <div className="record-toolbar-pair record-toolbar-actions">
          <button
            type="button"
            className="primary"
            onClick={confirmVisibleReports}
            disabled={!canConfirmReports || loading || bulkConfirming || !selectLockableReports(visibleRows).length}
          >
            {bulkConfirming ? "鎖定中..." : `一鍵鎖定（${selectLockableReports(visibleRows).length}）`}
          </button>
          <button className="danger" onClick={clearVisibleRecords} disabled={!canManageReports || !visibleRows.some((row) => row.id)}>一鍵清除</button>
        </div>
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
            {!visibleRows.length && <tr><td colSpan="14">目前查無回報紀錄</td></tr>}
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
            {!inventoryReady && <div className="alert-line report-read-alert" role={inventoryReadState.phase === "error" ? "alert" : "status"}>
              <span>{inventoryReadState.phase === "error" ? inventoryReadState.message : "正在讀取庫存，暫時無法編輯或儲存。"}</span>
              {inventoryReadState.phase === "error" && <button type="button" onClick={() => setInventoryReadAttempt(value => value + 1)}>重新讀取</button>}
            </div>}
            <fieldset className="report-read-guard" disabled={!inventoryReady || saving}>
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
            </fieldset>
            <div className="dialog-actions">
              <button type="button" onClick={() => setSelected(null)}>取消</button>
              <button type="button" className="primary" disabled={!inventoryReady || saving || revenueInvalid} onClick={saveSelected}>{saving ? "儲存中..." : "儲存修改"}</button>
            </div>
          </section>
        </div>
      )}
      </div>
    </details>
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
        growthLabel: growth === null ? "基準週" : `${growth >= 0 ? "+" : ""}${pct(growth)}`,
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
        toManagementQuantity({ ...row, report_date: report.report_date }, "incoming_count"),
        row.incoming_source || "廠商進貨",
        toManagementQuantity({ ...row, report_date: report.report_date }, "previous_stock"),
        toManagementQuantity({ ...row, report_date: report.report_date }, "current_stock"),
        Number(row.loss_count || 0),
        usageCount({ ...row, report_date: report.report_date }),
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
    const datedRow = { ...row, report_date: report.report_date };
    item.incoming += toManagementQuantity(datedRow, "incoming_count");
    item.loss += Number(row.loss_count || 0);
    item.usage += usageCount(datedRow);
    item.previousStock += toManagementQuantity(datedRow, "previous_stock");
    if (row.incoming_source) item.sourceSet.add(row.incoming_source);
    if (row.transfer_note) item.noteSet.add(row.transfer_note);
    if (!item.latestDate || report.report_date >= item.latestDate) {
      item.latestDate = report.report_date;
      item.currentStock = toManagementQuantity(datedRow, "current_stock");
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
    const amount = usageCount({ ...row, report_date: report.report_date });
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

function reportForStoreCode(reports, storeCode) {
  return reports.find((report) => canonicalStoreCode(report) === storeCode);
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

function isOverdue(dateText) {
  return Boolean(dateText && dateText < today);
}

function timeToMinutes(value, fallback = 0) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
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
      .filter((person) => isStoreLeadershipRole(person.role))
      .map((person) => canonicalStoreCode(person)),
  );
  const managerRows = reports
    .filter((report) => report.operating_status !== "suspended" && report.is_active !== false)
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
          <SelectField label="職位" value={form.role_name} options={STAFF_ROLE_OPTIONS} onChange={(value) => setForm({ ...form, role_name: value })} />
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
        setInventory(products.map((product) => blankInventoryProduct(product)));
        return;
      }
      try {
        const [savedRows, previousRows] = await Promise.all([
          fetchInventoryCounts(activeReport.id),
          fetchPreviousInventoryCounts(activeReport.store_id, activeReport.report_date),
        ]);
        if (!active) return;
        const inventoryOptions = {
          storeCode: canonicalStoreCode(activeReport),
          reportDate: activeReport.report_date,
        };
        setInventory(mergeInventoryRows(products, savedRows, previousRows, inventoryOptions));
      } catch {
        if (active) setInventory(products.map((product) => blankInventoryProduct(product, {
          storeCode: canonicalStoreCode(activeReport),
          reportDate: activeReport.report_date,
        })));
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

function Progress({ value, attainmentStatus = false }) {
  const attainmentClass = attainmentStatus
    ? value >= 100 ? " attainment-hit" : value >= 70 ? " attainment-near" : " attainment-low"
    : "";
  return (
    <div className={`progress${attainmentClass}`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
      <em>{pct(value)}</em>
    </div>
  );
}
