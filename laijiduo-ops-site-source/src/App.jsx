import { useEffect, useMemo, useState } from "react";
import {
  fetchDailyReports,
  fetchHandovers,
  fetchHqDashboardData,
  fetchInventoryCounts,
  fetchMonthlyLeavePlans,
  fetchProducts,
  fetchStaffPerformance,
  fetchStores,
  getSessionProfile,
  hasSupabaseConfig,
  reviewReport,
  signIn,
  signOut,
  statusLabel,
  totalRevenue,
  updateStoreMonthlyTarget,
  upsertDailyReport,
  upsertHandover,
  upsertInventoryCounts,
  upsertMonthlyLeavePlan,
  upsertMonthlyLeavePlans,
  upsertStaffPerformance,
} from "./lib/api";
import {
  handoverSeed,
  hrChangeSeed,
  hqSystemSeed,
  mockProfile,
  performanceSeed,
  productsSeed,
  salaryStructureSeed,
  scheduleSeed,
  staffRosterSeed,
  storeHoursSeed,
  storesSeed,
  supervisorTaskSeed,
} from "./lib/mockData";
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

const ROLE_LABELS = {
  ceo: "執行長",
  coo: "營運長",
  cfo: "財務長",
  general_affairs: "總務",
  admin: "系統管理員",
  hq: "總部管理",
  supervisor: "督導",
  store_manager: "門店主管",
};

const ROLE_MODULES = {
  ceo: ["ops", "handover", "schedule", "anomaly", "tasks", "hr", "hrFlow", "performance", "inspection", "system"],
  coo: ["ops", "handover", "schedule", "anomaly", "tasks", "hr", "hrFlow", "performance", "inspection", "system"],
  cfo: ["ops", "anomaly", "system"],
  general_affairs: ["ops", "handover", "schedule", "anomaly", "tasks", "inspection", "system"],
  admin: ["ops", "handover", "schedule", "anomaly", "tasks", "hr", "hrFlow", "performance", "inspection", "system"],
  hq: ["ops", "handover", "schedule", "anomaly", "tasks", "hr", "hrFlow", "performance", "inspection", "system"],
  supervisor: ["ops", "handover", "schedule", "anomaly", "tasks", "performance", "inspection", "system"],
  store_manager: ["ops", "handover", "schedule", "system"],
};

const MODULE_GROUPS = [
  {
    title: "每日作業",
    items: [
      ["ops", "每日營運回報"],
      ["handover", "交接管理"],
      ["schedule", "排班管理"],
    ],
  },
  {
    title: "總部管理",
    items: [
      ["anomaly", "異常中心"],
      ["tasks", "督導任務"],
    ],
  },
  {
    title: "人資績效",
    items: [
      ["hr", "人資主檔"],
      ["hrFlow", "人資異動"],
      ["performance", "人員績效"],
    ],
  },
  {
    title: "稽核制度",
    items: [
      ["inspection", "巡檢管理"],
      ["system", "制度中心"],
    ],
  },
];

const ROLE_VIEW_OPTIONS = {
  ceo: ["hq", "store", "review", "inspection"],
  coo: ["hq", "store", "review", "inspection"],
  admin: ["hq", "store", "review", "inspection"],
  hq: ["hq", "store", "review", "inspection"],
  cfo: ["hq"],
  general_affairs: ["hq", "store", "inspection"],
  supervisor: ["review", "inspection"],
  store_manager: ["store"],
};

function profileRole(profile) {
  return profile?.role || "admin";
}

function appViewForRole(roleName) {
  if (roleName === "store_manager") return "store";
  if (roleName === "supervisor") return "review";
  return "hq";
}

function modulesForRole(roleName) {
  return ROLE_MODULES[roleName] || ROLE_MODULES.hq;
}

function canAccessModule(roleName, moduleName) {
  return modulesForRole(roleName).includes(moduleName);
}

function defaultModuleForRole(roleName) {
  return modulesForRole(roleName)[0] || "ops";
}

function canExportRole(roleName) {
  return ["ceo", "coo", "cfo", "admin", "hq"].includes(roleName);
}

function canEditMonthlyTargets(roleName) {
  return ["ceo", "coo", "cfo", "admin", "hq"].includes(roleName);
}

const VARIABLE_UNIT_PRODUCTS = ["雞翅", "雞腿", "雞排", "腿排", "雞米花", "三角骨", "雞脖子", "地瓜"];
const FIXED_PACK_PRODUCTS = ["米血", "花枝丸", "熱狗", "雞塊", "黑輪"];
const POWDER_PRODUCTS = ["湯翅粉", "醃粉", "薯脆粉"];
const PRODUCT_ORDER = [
  ...VARIABLE_UNIT_PRODUCTS,
  ...FIXED_PACK_PRODUCTS,
  "雞皮",
  "炸油",
  ...POWDER_PRODUCTS,
];

function productKind(name = "") {
  if (VARIABLE_UNIT_PRODUCTS.includes(name)) return "variable";
  if (FIXED_PACK_PRODUCTS.includes(name)) return "pack";
  if (name === "雞皮") return "skewer";
  if (name === "炸油") return "barrel";
  if (POWDER_PRODUCTS.includes(name)) return "powder";
  return "unit";
}

function defaultUnitForProduct(name) {
  const kind = productKind(name);
  if (kind === "variable") return "箱";
  if (kind === "pack" || kind === "powder") return "包";
  if (kind === "skewer") return "串";
  if (kind === "barrel") return "桶";
  return "件";
}

function displayUnitForProduct(name) {
  const kind = productKind(name);
  if (kind === "variable") return "件";
  if (kind === "pack") return "包";
  if (kind === "skewer") return "串";
  if (kind === "barrel") return "桶";
  if (kind === "powder") return "包";
  return defaultUnitForProduct(name);
}

function toManagementQuantity(row, field) {
  const name = row.name || "";
  const kind = productKind(name);
  if (kind === "powder") {
    const boxes = Number(row[`${field}_boxes`] || 0);
    const packs = Number(row[`${field}_packs`] || 0);
    return boxes * 10 + packs;
  }
  const count = Number(row[field] || 0);
  const unit = row[field === "incoming_count" ? "incoming_unit" : "stock_unit"] || defaultUnitForProduct(name);
  if (kind === "variable") return unit === "包" ? count / 3 : count;
  return count;
}

function usageCount(row) {
  return toManagementQuantity(row, "incoming_count") - toManagementQuantity(row, "current_stock") - Number(row.loss_count || 0);
}

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
  const [activeModule, setActiveModule] = useState("ops");
  const [inspectionGateOpen, setInspectionGateOpen] = useState(false);
  const [inspectionPassword, setInspectionPassword] = useState("");
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("entry");
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [reports, setReports] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [performanceRows, setPerformanceRows] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadWorkspace(nextProfile = profile, preferredStoreId = selectedStoreId) {
    const [storeRows, productRows, reportRows, handoverRows, performanceData] = await Promise.all([
      fetchStores(),
      fetchProducts(),
      fetchDailyReports(today),
      fetchHandovers(today),
      fetchStaffPerformance(new Date().toISOString().slice(0, 7)),
    ]);
    setStores(storeRows);
    setProducts(productRows);
    setHandovers(handoverRows);
    setPerformanceRows(performanceData);
    setSelectedStoreId(nextProfile?.store_id || preferredStoreId || storeRows[0]?.id || "");

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

          setRole(appViewForRole(sessionProfile.role));
          setActiveModule(defaultModuleForRole(sessionProfile.role));
          await loadWorkspace(sessionProfile);
        } else {
          setProfile(mockProfile);
          setStores(storesSeed);
          setProducts(productsSeed);
          setSelectedStoreId(storesSeed[0]?.id || "");
          setReports(storesSeed.map((store) => normalizeReport(store)));
          setHandovers(handoverSeed);
          setPerformanceRows(performanceSeed);
        }
      } catch (error) {
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  const selectedReport = reports.find((report) => report.store_id === selectedStoreId || report.id === selectedStoreId) || reports[0];
  const currentRole = profileRole(profile);
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
      await signIn(email, password);
      const nextProfile = await getSessionProfile();
      setProfile(nextProfile);
      setRole(appViewForRole(nextProfile.role));
      setActiveModule(defaultModuleForRole(nextProfile.role));
      await loadWorkspace(nextProfile);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setProfile(hasSupabaseConfig ? null : mockProfile);
    setRole("entry");
    if (hasSupabaseConfig) {
      setStores([]);
      setProducts([]);
      setReports([]);
      setHandovers([]);
      setPerformanceRows([]);
    }
  }

  function show(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
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

  async function saveReport(form, inventoryRows) {
    try {
      const revenue1900ToClose = Math.max(
        0,
        Number(form.full_day_revenue || 0) -
          Number(form.opened_to_1400_revenue || 0) -
          Number(form.revenue_1400_to_1900 || 0),
      );
      const payload = {
        store_id: selectedReport.store_id,
        report_date: today,
        opened_to_1400_revenue: Number(form.opened_to_1400_revenue),
        revenue_1400_to_1900: Number(form.revenue_1400_to_1900),
        revenue_1900_to_close: revenue1900ToClose,
        cash_difference: Number(form.cash_difference || 0),
        manager_note: form.manager_note,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by: profile?.id,
      };
      const saved = await upsertDailyReport(payload);
      await upsertInventoryCounts(
        saved.id,
        inventoryRows.map((row) => ({
          product_id: row.product_id || row.id,
          current_stock: Number(row.current_stock || 0),
          safety_stock: 0,
          loss_count: Number(row.loss_count || 0),
          incoming_count: Number(row.incoming_count || 0),
          stock_unit: row.stock_unit || defaultUnitForProduct(row.name),
          incoming_unit: row.incoming_unit || defaultUnitForProduct(row.name),
          current_stock_boxes: Number(row.current_stock_boxes || 0),
          current_stock_packs: Number(row.current_stock_packs || 0),
          incoming_boxes: Number(row.incoming_boxes || 0),
          incoming_packs: Number(row.incoming_packs || 0),
          incoming_source: row.incoming_source || "廠商進貨",
          transfer_note: row.transfer_note || "",
          is_shortage: false,
        })),
      );
      await loadWorkspace(profile, selectedReport.store_id);
      show("營運回報與庫存已送出");
      return true;
    } catch (error) {
      show(`送出失敗：${error.message}`);
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
      show("交接紀錄已儲存");
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
      show("人員績效已儲存");
      return true;
    } catch (error) {
      show(`績效儲存失敗：${error.message}`);
      return false;
    }
  }

  async function handleReview(action, status) {
    if (!selectedReport?.id) {
      show("此門店尚未送出回報");
      return false;
    }
    try {
      await reviewReport(selectedReport.id, action, "", status);
      await loadWorkspace(profile, selectedReport.store_id);
      show("審核狀態已更新");
      return true;
    } catch (error) {
      show(`審核失敗：${error.message}`);
      return false;
    }
  }

  async function syncWorkspace() {
    setLoading(true);
    try {
      await loadWorkspace(profile);
      show("資料已同步");
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
      show("報表已匯出");
    } catch (error) {
      show(`匯出失敗：${error.message}`);
    }
  }

  if (loading) return <main className="loading">載入中...</main>;

  if (!profile && hasSupabaseConfig) {
    return <LoginScreen onLogin={handleLogin} message={message} />;
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
        <TopBar activeModule={activeModule} role={role} profileRole={currentRole} report={selectedReport} onSync={syncWorkspace} onExport={exportReports} />
        {!hasSupabaseConfig && (
          <div className="notice">目前使用示範資料。部署後請在 Vercel 設定 Supabase 環境變數，即可切換為正式資料。</div>
        )}
        {!activeModuleAllowed && <AccessDeniedModule roleName={currentRole} />}
        {activeModuleAllowed && activeModule === "ops" && role === "hq" && (
          <HqDashboard reports={reports} products={products} handovers={handovers} performanceRows={performanceRows} canEditTargets={canEditMonthlyTargets(currentRole)} onSelect={setSelectedStoreId} />
        )}
        {activeModuleAllowed && activeModule === "ops" && role === "store" && selectedReport && (
          <StoreReport report={selectedReport} products={products} onSave={saveReport} />
        )}
        {activeModuleAllowed && activeModule === "ops" && role === "review" && selectedReport && (
          <ReviewConsole
            reports={reports}
            report={selectedReport}
            products={products}
            onSelect={setSelectedStoreId}
            onReview={handleReview}
          />
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
            staffRoster={staffRosterSeed}
          />
        )}
        {activeModuleAllowed && activeModule === "system" && (
          <ManagementSystemModule systems={hqSystemSeed} />
        )}
        {activeModuleAllowed && activeModule === "schedule" && (
          <ScheduleModule
            scheduleRows={scheduleSeed}
            storeHours={storeHoursSeed}
            staffRoster={staffRosterSeed}
            salaryRows={salaryStructureSeed}
            onNotify={show}
          />
        )}
        {activeModuleAllowed && activeModule === "tasks" && (
          <SupervisorTaskModule tasks={supervisorTaskSeed} />
        )}
        {activeModuleAllowed && activeModule === "hrFlow" && (
          <HrFlowModule changes={hrChangeSeed} salaryRows={salaryStructureSeed} />
        )}
        {activeModuleAllowed && activeModule === "anomaly" && (
          <AnomalyCenterModule
            reports={reports}
            handovers={handovers}
            performanceRows={performanceRows}
            staffRoster={staffRosterSeed}
            scheduleRows={scheduleSeed}
            supervisorTasks={supervisorTaskSeed}
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
      {message && <div className="toast show">{message}</div>}
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

function LoginScreen({ onLogin, message }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand-mark">萊</div>
        <h1>萊吉多營運回報</h1>
        <p>請使用 Supabase Auth 建立的帳號登入。</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
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
        <p>門店回報營收、庫存與差異，總部與營運審核可即時查看每日營運狀況。</p>
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
          <button onClick={() => onRole("review")}>營運審核</button>
        </div>
      </section>
      <section className="entry-panels">
        <Info title="門店回報" text="依 14:00、19:00、打烊三個時段填寫營收，並補上現金差異與備註。" />
        <Info title="總部總覽" text="快速查看各門店營收、達成率、庫存狀態與待審核數量。" />
        <Info title="營運審核" text="針對異常回報進行通過、退回修改或指派追蹤。" />
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
  const allowedViewModes = ROLE_VIEW_OPTIONS[currentRole] || ["hq"];
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
      <label className="field-label">門店</label>
      <select
        value={selectedStoreId}
        disabled={isStoreManager}
        onChange={(event) => setSelectedStoreId(event.target.value)}
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>{store.name}</option>
        ))}
      </select>
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
      <button onClick={onSignOut}>登出 / 回入口</button>
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

function TopBar({ activeModule, role, profileRole: currentRole, report, onSync, onExport }) {
  const titleMap = {
    handover: "門市交接管理",
    performance: "人員績效管理",
    hr: "人資主檔管理",
    system: "總部制度中心",
    schedule: "排班管理",
    tasks: "督導任務派工",
    hrFlow: "人資異動流程",
    anomaly: "總部異常中心",
  };
  const title = titleMap[activeModule] || (role === "hq" ? "總部營運總覽" : role === "store" ? "門店每日回報" : "門店回報審核台");
  return (
    <header className="topbar">
      <div>
        <p>營業日 {today} · {report?.area || "全區"} · {report?.name || "尚未選擇門店"}</p>
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

function HqDashboard({ reports, products, handovers, performanceRows, canEditTargets, onSelect }) {
  const [periodRows, setPeriodRows] = useState([]);
  const [usageRows, setUsageRows] = useState([]);
  const [targetDrafts, setTargetDrafts] = useState({});
  const [targetMessage, setTargetMessage] = useState("");
  const [savingTargetId, setSavingTargetId] = useState("");
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
  }, [periodStart, reports]);

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

  const summary = useMemo(() => {
    const total = reports.reduce((sum, report) => sum + totalRevenue(report), 0);
    const target = reports.reduce((sum, report) => sum + Number(report.target || 0), 0);
    return { total, target };
  }, [reports]);
  const revenueSummary = useMemo(() => buildRevenueSummary(periodRows.length ? periodRows : reports), [periodRows, reports]);
  const usageSummary = useMemo(() => buildUsageSummary(reports, products, periodRows, usageRows), [reports, products, periodRows, usageRows]);
  const dailyRevenueRows = useMemo(() => buildDailyRevenueRows(periodRows.length ? periodRows : reports), [periodRows, reports]);
  const weeklyRevenueRows = useMemo(() => buildWeeklyRevenueRows(periodRows.length ? periodRows : reports, fourWeekRanges), [periodRows, reports, fourWeekRanges]);
  const usageMatrix = useMemo(() => buildUsageMatrix(usageSummary.rows), [usageSummary.rows]);
  const dataQuality = useMemo(() => buildDataQualitySummary(reports, handovers, performanceRows), [reports, handovers, performanceRows]);

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
      <section className="kpi-strip">
        <Metric label="今日總營收" value={money(summary.total)} detail={`目標 ${money(summary.target)}`} tone="hot" />
        <Metric label="整體達成率" value={pct((summary.total / summary.target) * 100)} detail="依今日目標計算" />
        <Metric label="待審核" value={`${reports.filter((report) => report.status === "submitted").length} 間`} detail="等待營運審核確認" tone="warn" />
        <Metric label="需追蹤" value={`${reports.filter((report) => report.status === "follow_up").length} 間`} detail="異常或補貨需求" tone="bad" />
        <Metric label="已達標" value={`${reports.filter((report) => totalRevenue(report) >= report.target).length} 間`} detail="營收高於目標" tone="good" />
      </section>
      <DataQualityPanel summary={dataQuality} onSelect={onSelect} />
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
          <Metric label="每日使用量" value={`${usageSummary.daily} 件`} detail="進貨-現存-報廢" tone="warn" />
          <Metric label="一週使用量" value={`${usageSummary.week} 件`} detail="週一至週日" />
          <Metric label="當月使用量" value={`${usageSummary.month} 件`} detail="本月累計" />
        </div>
      </section>
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

  const usageHeaders = ["期間", "日期範圍", "日期", "門店", "品項", "進貨", "進貨來源", "現存庫存", "報廢", "消耗", "備註"];
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
        Number(row.current_stock || 0),
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
        loss: 0,
        usage: 0,
        noteSet: new Set(),
      });
    }
    const item = byStoreProduct.get(key);
    item.incoming += Number(row.incoming_count || 0);
    item.loss += Number(row.loss_count || 0);
    item.usage += usageCount(row);
    if (row.incoming_source) item.sourceSet.add(row.incoming_source);
    if (row.transfer_note) item.noteSet.add(row.transfer_note);
    if (!item.latestDate || report.report_date >= item.latestDate) {
      item.latestDate = report.report_date;
      item.currentStock = Number(row.current_stock || 0);
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

function HrMasterModule({ stores, selectedStoreId, salaryRows, storeHours, staffRoster }) {
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

function normalizeStoreName(name = "") {
  return String(name)
    .replaceAll("潮洲", "潮州")
    .replace("屏東潮州二店", "屏東潮二店")
    .replace("阿瑄", "阿暄")
    .trim();
}

const canonicalStoreRows = storesSeed.map((store) => ({
  store_code: store.store_code || store.id,
  name: store.name,
  normalizedName: normalizeStoreName(store.name),
}));

function canonicalStoreByName(name = "") {
  const normalizedName = normalizeStoreName(name);
  return canonicalStoreRows.find((store) => store.normalizedName === normalizedName);
}

function canonicalStoreCode(row = {}) {
  return row.store_code || row.storeCode || canonicalStoreByName(row.storeName || row.name)?.store_code || row.store_id || row.id || "";
}

function displayStoreName(row = {}) {
  return canonicalStoreByName(row.storeName || row.name)?.name || row.storeName || row.name || "未命名門店";
}

function reportForStoreCode(reports, storeCode) {
  return reports.find((report) => canonicalStoreCode(report) === storeCode);
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
  if (["已完成", "足夠", "正常", "已納入制度", "已填"].includes(value)) return "good";
  if (["高", "人力不足", "需輔導", "重大", "超休"].includes(value)) return "bad";
  if (["中", "待處理", "進行中", "試用觀察", "待總部覆核", "改善中", "待招募", "暫停營業", "未填", "不足"].includes(value)) return "warn";
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

function buildLeavePlanPayload({ month, person, dates, note = "" }) {
  return {
    period_month: month,
    store_code: canonicalStoreCode(person),
    store_name: displayStoreName(person),
    staff_id: person.id,
    employee_name: person.employeeName,
    role_name: person.role,
    leave_days: parseLeaveDays(dates),
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

function getLeaveStatus(dateText, restDays) {
  const dayCount = countLeaveDays(dateText);
  if (!dayCount) return "未填";
  if (restDays && dayCount > restDays) return "超休";
  if (restDays && dayCount < restDays) return "不足";
  return "已填";
}

function buildLeavePlannerCsv({ month, rows, drafts, salaryRows }) {
  const days = Array.from({ length: daysInMonth(`${month}-01`) }, (_, index) => index + 1);
  const headers = ["月份", "門店代碼", "門店", "姓名", "職位", ...days.map((day) => `${day}日`), "休假計", "月休基準", "狀態", "備註"];
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
      getLeaveStatus(dates, restDays),
      draft.note || "",
    ];
  });
  return [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function MonthlyLeavePlanner({ staffRoster, salaryRows, storeHours, onNotify }) {
  const [leaveMonth, setLeaveMonth] = useState(today.slice(0, 7));
  const [storeFilter, setStoreFilter] = useState("all");
  const [supportDate, setSupportDate] = useState(today.slice(0, 7) === today.slice(0, 7) ? today : `${today.slice(0, 7)}-01`);
  const [syncState, setSyncState] = useState(hasSupabaseConfig ? "同步中" : "本機模式");
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

  useEffect(() => {
    if (!supportDate.startsWith(leaveMonth)) setSupportDate(`${leaveMonth}-01`);
  }, [leaveMonth, supportDate]);

  const monthDays = useMemo(() => Array.from({ length: daysInMonth(`${leaveMonth}-01`) }, (_, index) => index + 1), [leaveMonth]);
  const plannerRows = useMemo(
    () =>
      [...staffRoster]
        .sort((a, b) => `${displayStoreName(a)}-${a.role}-${a.employeeName}`.localeCompare(`${displayStoreName(b)}-${b.role}-${b.employeeName}`, "zh-Hant"))
        .filter((row) => storeFilter === "all" || canonicalStoreCode(row) === storeFilter),
    [staffRoster, storeFilter],
  );
  const storeOptions = useMemo(() => {
    const options = staffRoster.map((row) => ({
      code: canonicalStoreCode(row),
      name: displayStoreName(row),
    }));
    return options.filter((row, index, rows) => row.code && rows.findIndex((item) => item.code === row.code) === index);
  }, [staffRoster]);
  const storeDemandMap = useMemo(
    () => new Map(storeHours.map((row) => [canonicalStoreCode(row), Number(row.duty_staff || 0)])),
    [storeHours],
  );
  const storeGroups = useMemo(
    () =>
      storeOptions
        .filter((store) => storeFilter === "all" || store.code === storeFilter)
        .map((store) => ({
          ...store,
          staff: plannerRows.filter((row) => canonicalStoreCode(row) === store.code),
          demand: storeDemandMap.get(store.code) || 0,
        }))
        .filter((store) => store.staff.length),
    [plannerRows, storeDemandMap, storeFilter, storeOptions],
  );
  const allStoreGroups = useMemo(
    () =>
      storeOptions
        .map((store) => ({
          ...store,
          staff: staffRoster.filter((row) => canonicalStoreCode(row) === store.code),
          demand: storeDemandMap.get(store.code) || 0,
        }))
        .filter((store) => store.staff.length),
    [staffRoster, storeDemandMap, storeOptions],
  );
  const supportDay = Number(supportDate.slice(8, 10));
  const supportRows = allStoreGroups
    .map((store) => {
      const offCount = store.staff.filter((person) => isLeaveDay(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates, supportDay)).length;
      const workingCount = store.staff.length - offCount;
      return {
        ...store,
        offCount,
        workingCount,
        surplus: workingCount - store.demand,
      };
    })
    .sort((a, b) => {
      if (a.surplus < 0 && b.surplus >= 0) return -1;
      if (a.surplus >= 0 && b.surplus < 0) return 1;
      return b.surplus - a.surplus || a.code.localeCompare(b.code);
    });
  const filledCount = plannerRows.filter((row) => countLeaveDays(drafts[leaveDraftKey(leaveMonth, row.id)]?.dates)).length;
  const totalLeaveDays = plannerRows.reduce((sum, row) => sum + countLeaveDays(drafts[leaveDraftKey(leaveMonth, row.id)]?.dates), 0);
  const overLimitCount = plannerRows.filter((row) => {
    const restDays = getSuggestedRestDays(row.role, salaryRows);
    return getLeaveStatus(drafts[leaveDraftKey(leaveMonth, row.id)]?.dates, restDays) === "超休";
  }).length;

  const updateDraft = (staffId, field, value) => {
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
    if (!person || !hasSupabaseConfig) return;
    try {
      setSyncState("儲存中");
      await upsertMonthlyLeavePlan(buildLeavePlanPayload({
        month: leaveMonth,
        person,
        dates: draft.dates || "",
        note: draft.note || "",
      }));
      setSyncState("已同步");
    } catch (error) {
      setSyncState("同步失敗");
      onNotify?.(`排假儲存失敗：${error.message}`);
    }
  };

  const toggleLeaveDay = (staffId, day) => {
    const key = leaveDraftKey(leaveMonth, staffId);
    const person = staffRoster.find((row) => row.id === staffId);
    setDrafts((current) => {
      const currentDraft = current[key] || {};
      const leaveDays = parseLeaveDays(currentDraft.dates);
      const nextDays = leaveDays.includes(day) ? leaveDays.filter((item) => item !== day) : [...leaveDays, day].sort((a, b) => a - b);
      const nextDraft = {
        ...currentDraft,
        dates: formatLeaveDays(leaveMonth, nextDays),
      };
      saveDraft(person, nextDraft);
      return {
        ...current,
        [key]: nextDraft,
      };
    });
  };

  const autoArrangeStore = (store) => {
    const maxOffPerDay = Math.max(store.staff.length - store.demand, 0);
    if (!maxOffPerDay) return;

    const assignments = new Map(store.staff.map((person) => [person.id, []]));
    const remaining = new Map(store.staff.map((person) => [person.id, getSuggestedRestDays(person.role, salaryRows) || 0]));
    const offByDay = new Map(monthDays.map((day) => [day, 0]));
    const totalTargets = Array.from(remaining.values()).reduce((sum, value) => sum + value, 0);
    const maxAssignable = maxOffPerDay * monthDays.length;
    const rounds = Math.min(totalTargets, maxAssignable);

    for (let index = 0; index < rounds; index += 1) {
      const candidates = store.staff
        .filter((person) => (remaining.get(person.id) || 0) > 0)
        .sort((a, b) => (remaining.get(b.id) || 0) - (remaining.get(a.id) || 0));
      const dayCandidates = monthDays
        .filter((day) => (offByDay.get(day) || 0) < maxOffPerDay)
        .sort((a, b) => (offByDay.get(a) || 0) - (offByDay.get(b) || 0) || a - b);
      if (!candidates.length || !dayCandidates.length) break;

      const person = candidates.find((candidate) => {
        const assignedDays = assignments.get(candidate.id) || [];
        return dayCandidates.some((day) => !assignedDays.includes(day) && !assignedDays.includes(day - 1) && !assignedDays.includes(day + 1));
      }) || candidates[0];
      const assignedDays = assignments.get(person.id) || [];
      const day = dayCandidates.find((item) => !assignedDays.includes(item) && !assignedDays.includes(item - 1) && !assignedDays.includes(item + 1))
        || dayCandidates.find((item) => !assignedDays.includes(item));
      if (!day) break;

      assignments.set(person.id, [...assignedDays, day].sort((a, b) => a - b));
      remaining.set(person.id, (remaining.get(person.id) || 0) - 1);
      offByDay.set(day, (offByDay.get(day) || 0) + 1);
    }

    setDrafts((current) => {
      const next = { ...current };
      store.staff.forEach((person) => {
        const key = leaveDraftKey(leaveMonth, person.id);
        next[key] = {
          ...next[key],
          dates: formatLeaveDays(leaveMonth, assignments.get(person.id) || []),
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
        note: drafts[leaveDraftKey(leaveMonth, person.id)]?.note || "",
      })))
        .then(() => setSyncState("已同步"))
        .catch((error) => {
          setSyncState("同步失敗");
          onNotify?.(`一鍵排休儲存失敗：${error.message}`);
        });
    }
  };

  const clearStore = (store) => {
    setDrafts((current) => {
      const next = { ...current };
      store.staff.forEach((person) => {
        const key = leaveDraftKey(leaveMonth, person.id);
        next[key] = {
          ...next[key],
          dates: "",
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
        note: drafts[leaveDraftKey(leaveMonth, person.id)]?.note || "",
      })))
        .then(() => setSyncState("已同步"))
        .catch((error) => {
          setSyncState("同步失敗");
          onNotify?.(`清空本店儲存失敗：${error.message}`);
        });
    }
  };

  const clearMonth = () => {
    if (!window.confirm(`確定清空 ${leaveMonth} 的排假填寫資料？`)) return;
    setDrafts((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${leaveMonth}:`))),
    );
  };

  return (
    <section className="panel wide leave-planner">
      <div className="panel-head">
        <div>
          <h2>每月各店排假表</h2>
          <p>依門店分表排假；紅點為休假，底部即時計算上班人數、門店需求與每日餘缺。</p>
        </div>
        <div className="panel-actions">
          <button type="button" onClick={() => downloadTextFile(buildLeavePlannerCsv({ month: leaveMonth, rows: plannerRows, drafts, salaryRows }), `萊吉多${leaveMonth}排假表.csv`)}>
            匯出排假
          </button>
          <button type="button" onClick={clearMonth}>清空本月</button>
        </div>
      </div>

      <div className="leave-toolbar">
        <label>
          排假月份
          <input type="month" value={leaveMonth} onChange={(event) => setLeaveMonth(event.target.value)} />
        </label>
        <label>
          門店
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
            <option value="all">全部門店</option>
            {storeOptions.map((row) => (
              <option value={row.code} key={row.code}>{row.code} {row.name}</option>
            ))}
          </select>
        </label>
        <div className="leave-summary">
          <span><strong>{plannerRows.length}</strong> 人需確認</span>
          <span><strong>{filledCount}</strong> 人已填</span>
          <span><strong>{plannerRows.length - filledCount}</strong> 人未填</span>
          <span><strong>{totalLeaveDays}</strong> 天排休</span>
          <span className={overLimitCount ? "negative" : ""}><strong>{overLimitCount}</strong> 人超休</span>
          <span><strong>{syncState}</strong></span>
        </div>
      </div>

      <div className="support-panel">
        <label>
          臨時支援日期
          <input type="date" value={supportDate} min={`${leaveMonth}-01`} max={`${leaveMonth}-${String(monthDays.length).padStart(2, "0")}`} onChange={(event) => setSupportDate(event.target.value)} />
        </label>
        <div className="support-list">
          {supportRows.map((store) => (
            <div className={`support-card ${store.surplus < 0 ? "bad" : store.surplus > 0 ? "good" : ""}`} key={store.code}>
              <strong>{store.code} {store.name}</strong>
              <span>上班 {store.workingCount} / 需求 {store.demand}</span>
              <em>{store.surplus > 0 ? `可支援 ${store.surplus} 人` : store.surplus < 0 ? `缺 ${Math.abs(store.surplus)} 人` : "剛好滿編"}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="store-leave-stack">
        {storeGroups.map((store) => (
          <StoreLeaveCalendar
            drafts={drafts}
            key={store.code}
            leaveMonth={leaveMonth}
            monthDays={monthDays}
            salaryRows={salaryRows}
            saveDraft={saveDraft}
            store={store}
            autoArrangeStore={autoArrangeStore}
            clearStore={clearStore}
            toggleLeaveDay={toggleLeaveDay}
            updateDraft={updateDraft}
          />
        ))}
      </div>
    </section>
  );
}

function StoreLeaveCalendar({ autoArrangeStore, clearStore, drafts, leaveMonth, monthDays, salaryRows, saveDraft, store, toggleLeaveDay, updateDraft }) {
  const totalLeaveDays = store.staff.reduce((sum, person) => sum + countLeaveDays(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates), 0);
  const maxOffPerDay = Math.max(store.staff.length - store.demand, 0);

  return (
    <div className="store-leave-card">
      <div className="store-leave-head">
        <div>
          <h3><span className="code-chip">{store.code}</span> {store.name}</h3>
          <p>{store.staff.length} 人編制，門店每日需求 {store.demand} 人，每日最多可排休 {maxOffPerDay} 人，本月已排休 {totalLeaveDays} 天。</p>
        </div>
        <div className="panel-actions">
          <button type="button" onClick={() => autoArrangeStore(store)} disabled={!maxOffPerDay}>一鍵平均排休</button>
          <button type="button" onClick={() => clearStore(store)}>清空本店</button>
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
              const status = getLeaveStatus(draft.dates, restDays);
              return (
                <tr key={person.id}>
                  <th className="leave-staff-col">
                    <strong>{person.employeeName}</strong>
                    <span>{person.role}</span>
                  </th>
                  {monthDays.map((day) => {
                    const checked = isLeaveDay(draft.dates, day);
                    return (
                      <td className="leave-day-cell" key={day}>
                        <button
                          aria-label={`${person.employeeName} ${day}日${checked ? "取消休假" : "排休"}`}
                          className={checked ? "leave-dot on" : "leave-dot"}
                          type="button"
                          onClick={() => toggleLeaveDay(person.id, day)}
                        />
                      </td>
                    );
                  })}
                  <td className="leave-total">{leaveDays}</td>
                  <td>{restDays || "-"}</td>
                  <td><span className={`chip ${taskTone(status)}`}>{status}</span></td>
                  <td>
                    <input
                      className="table-input leave-note-input"
                      value={draft.note || ""}
                      onChange={(event) => updateDraft(person.id, "note", event.target.value)}
                      onBlur={(event) => saveDraft(person, { ...draft, note: event.target.value })}
                      placeholder="代班、禁休"
                    />
                  </td>
                </tr>
              );
            })}
            <StoreLeaveSummaryRows drafts={drafts} leaveMonth={leaveMonth} monthDays={monthDays} store={store} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StoreLeaveSummaryRows({ drafts, leaveMonth, monthDays, store }) {
  const dailyRows = monthDays.map((day) => {
    const offCount = store.staff.filter((person) => isLeaveDay(drafts[leaveDraftKey(leaveMonth, person.id)]?.dates, day)).length;
    const workingCount = store.staff.length - offCount;
    return {
      day,
      offCount,
      workingCount,
      surplus: workingCount - store.demand,
    };
  });

  return (
    <>
      <tr className="leave-summary-row staff-count">
        <th className="leave-staff-col">店面人員</th>
        {dailyRows.map((row) => <td key={row.day}>{row.workingCount}</td>)}
        <td>{dailyRows.reduce((sum, row) => sum + row.offCount, 0)}</td>
        <td colSpan="3" />
      </tr>
      <tr className="leave-summary-row demand-count">
        <th className="leave-staff-col">店面需求</th>
        {dailyRows.map((row) => <td key={row.day}>{store.demand}</td>)}
        <td />
        <td colSpan="3" />
      </tr>
      <tr className="leave-summary-row surplus-count">
        <th className="leave-staff-col">小計</th>
        {dailyRows.map((row) => (
          <td className={row.surplus < 0 ? "negative" : row.surplus > 0 ? "positive" : ""} key={row.day}>{row.surplus}</td>
        ))}
        <td />
        <td colSpan="3" />
      </tr>
    </>
  );
}

function ScheduleModule({ scheduleRows, storeHours, staffRoster, salaryRows, onNotify }) {
  const activeRows = scheduleRows.filter((row) => row.status !== "暫停營業");
  const shortageRows = scheduleRows.filter((row) => row.status === "人力不足");
  const closedRows = scheduleRows.filter((row) => row.status === "暫停營業");
  const managerCount = new Set(
    staffRoster
      .filter((row) => row.role === "店長" || row.role === "副店長")
      .map((row) => row.storeName),
  ).size;

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="本週班表" value={`${scheduleRows.length} 筆`} detail="依營業時段自動產生" />
        <Metric label="營運班別" value={`${activeRows.length} 筆`} detail="排除暫停營業店" tone="good" />
        <Metric label="尖峰缺口" value={`${shortageRows.length} 筆`} detail={shortageRows[0]?.storeName || "目前無缺口"} tone={shortageRows.length ? "bad" : "good"} />
        <Metric label="主管覆蓋" value={`${managerCount} 店`} detail="店長或副店長可負責" />
        <Metric label="暫停營業" value={`${closedRows.length} 店`} detail={closedRows[0]?.storeName || "無"} tone={closedRows.length ? "warn" : "good"} />
      </section>

      <MonthlyLeavePlanner staffRoster={staffRoster} salaryRows={salaryRows} storeHours={storeHours} onNotify={onNotify} />

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
              {scheduleRows.map((row) => (
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
              {storeHours.map((row) => (
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

function SupervisorTaskModule({ tasks }) {
  const openRows = tasks.filter((row) => row.status !== "已完成");
  const overdueRows = openRows.filter((row) => isOverdue(row.due_date));
  const highRows = openRows.filter((row) => row.priority === "高");

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="督導任務" value={`${tasks.length} 件`} detail="督導長統籌，執行督導追蹤" />
        <Metric label="待處理" value={`${openRows.length} 件`} detail="需列入每日追蹤" tone={openRows.length ? "warn" : "good"} />
        <Metric label="逾期" value={`${overdueRows.length} 件`} detail={overdueRows[0]?.storeName || "無逾期"} tone={overdueRows.length ? "bad" : "good"} />
        <Metric label="高優先" value={`${highRows.length} 件`} detail="營收、人力、績效優先" tone={highRows.length ? "bad" : "good"} />
        <Metric label="已完成" value={`${tasks.filter((row) => row.status === "已完成").length} 件`} detail="可週會複盤" tone="good" />
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>督導任務派工表</h2>
            <p>把缺報、交接異常、績效輔導、人力補編轉成可追蹤任務。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>任務</th><th>代碼</th><th>門店</th><th>負責人</th><th>期限</th><th>優先</th><th>狀態</th><th>證據</th><th>下一步</th></tr>
            </thead>
            <tbody>
              {tasks.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.task_type}</strong></td>
                  <td><span className="code-chip">{canonicalStoreCode(row)}</span></td>
                  <td>{displayStoreName(row)}</td>
                  <td>{row.owner}</td>
                  <td className={isOverdue(row.due_date) && row.status !== "已完成" ? "negative" : ""}>{row.due_date}</td>
                  <td><span className={`chip ${taskTone(row.priority)}`}>{row.priority}</span></td>
                  <td><span className={`chip ${taskTone(row.status)}`}>{row.status}</span></td>
                  <td>{row.evidence}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
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

function buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, supervisorTasks }) {
  const quality = buildDataQualitySummary(reports, handovers, performanceRows).issues.map((issue, index) => ({
    id: `quality-${index}`,
    type: issue.type,
    store_code: canonicalStoreCode({ storeName: issue.storeName, store_id: issue.storeId }),
    storeName: displayStoreName({ storeName: issue.storeName }),
    level: issue.level === "bad" ? "重大" : "提醒",
    owner: issue.type.includes("績效") ? "店長 / 督導" : "店長",
    due_date: today,
    status: "待處理",
    message: issue.message,
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
      store_code: canonicalStoreCode(report),
      storeName: displayStoreName(report),
      level: "重大",
      owner: "督導長",
      due_date: today,
      status: "待補",
      message: "營運中門店未配置店長或副店長，需立即補主管責任人",
    }));
  const scheduleIssues = scheduleRows
    .filter((row) => row.status !== "足夠")
    .map((row) => ({
      id: `schedule-${row.id}`,
      type: "排班異常",
      store_code: canonicalStoreCode(row),
      storeName: displayStoreName(row),
      level: row.status === "人力不足" ? "重大" : "提醒",
      owner: row.status === "暫停營業" ? "督導長" : "店長 / 執行督導",
      due_date: today,
      status: row.status,
      message: `${row.shift_name} ${row.start_time}-${row.end_time}：${row.action}`,
    }));
  const taskIssues = supervisorTasks
    .filter((row) => row.status !== "已完成")
    .map((row) => ({
      id: `task-${row.id}`,
      type: "督導待辦",
      store_code: canonicalStoreCode(row),
      storeName: displayStoreName(row),
      level: row.priority === "高" || isOverdue(row.due_date) ? "重大" : "提醒",
      owner: row.owner,
      due_date: row.due_date,
      status: row.status,
      message: `${row.task_type}：${row.action}`,
    }));
  return [...quality, ...managerRows, ...scheduleIssues, ...taskIssues];
}

function AnomalyCenterModule({ reports, handovers, performanceRows, staffRoster, scheduleRows, supervisorTasks, onSelect }) {
  const rows = buildAnomalyRows({ reports, handovers, performanceRows, staffRoster, scheduleRows, supervisorTasks });
  const criticalRows = rows.filter((row) => row.level === "重大");
  const overdueRows = rows.filter((row) => isOverdue(row.due_date) && row.status !== "已完成");
  const supervisorRows = rows.filter((row) => row.owner.includes("督導"));

  return (
    <div className="workspace module-grid">
      <section className="kpi-strip">
        <Metric label="異常總數" value={`${rows.length} 件`} detail="營收、交接、排班、績效、人資" tone={rows.length ? "warn" : "good"} />
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>等級</th><th>類型</th><th>代碼</th><th>門店</th><th>責任人</th><th>期限</th><th>處理狀態</th><th>問題說明 / 下一步</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} onClick={() => onSelect?.(reportForStoreCode(reports, row.store_code)?.store_id)}>
                  <td><span className={`chip ${row.level === "重大" ? "bad" : "warn"}`}>{row.level}</span></td>
                  <td><strong>{row.type}</strong></td>
                  <td><span className="code-chip">{row.store_code}</span></td>
                  <td>{row.storeName}</td>
                  <td>{row.owner}</td>
                  <td className={isOverdue(row.due_date) ? "negative" : ""}>{row.due_date}</td>
                  <td><span className={`chip ${taskTone(row.status)}`}>{row.status}</span></td>
                  <td>{row.message}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="8">目前無異常，維持每日巡檢與交接稽核即可。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HandoverModule({ report, handovers, onSave }) {
  const storeRows = handovers.filter((row) => row.store_id === report.store_id);
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
          <SelectField label="職位" value={form.role_name} options={["店長", "副店長", "資深人員", "正式人員", "新進人員", "兼職後勤", "送貨專員"]} onChange={(value) => setForm({ ...form, role_name: value })} />
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
        value={value || 0}
        onChange={(event) => onChange(Number.parseInt(event.target.value || "0", 10))}
      />
    </label>
  );
}

function StoreReport({ report, products, onSave }) {
  const [tab, setTab] = useState("sales");
  const [form, setForm] = useState({
    opened_to_1400_revenue: report.opened_to_1400_revenue,
    revenue_1400_to_1900: report.revenue_1400_to_1900,
    full_day_revenue: totalRevenue(report),
    cash_difference: report.cash_difference || 0,
    manager_note: report.manager_note || "",
  });
  const [inventory, setInventory] = useState(products);
  const [saving, setSaving] = useState(false);
  const computedCloseRevenue = Math.max(
    0,
    Number(form.full_day_revenue || 0) -
      Number(form.opened_to_1400_revenue || 0) -
      Number(form.revenue_1400_to_1900 || 0),
  );
  const currentTotal = Number(form.full_day_revenue || 0);
  const revenueInvalid = currentTotal < Number(form.opened_to_1400_revenue || 0) + Number(form.revenue_1400_to_1900 || 0);

  useEffect(() => {
    setForm({
      opened_to_1400_revenue: report.opened_to_1400_revenue,
      revenue_1400_to_1900: report.revenue_1400_to_1900,
      full_day_revenue: totalRevenue(report),
      cash_difference: report.cash_difference || 0,
      manager_note: report.manager_note || "",
    });
  }, [report]);

  useEffect(() => {
    let active = true;
    async function loadInventory() {
      try {
        const savedRows = await fetchInventoryCounts(report.id);
        if (!active) return;
        const byProduct = new Map(savedRows.map((row) => [row.product_id, row]));
        setInventory(products.map((product) => ({ ...product, ...byProduct.get(product.id) })));
      } catch {
        if (active) setInventory(products);
      }
    }
    loadInventory();
    return () => {
      active = false;
    };
  }, [products, report.id]);

  async function submit() {
    setSaving(true);
    await onSave(form, inventory);
    setSaving(false);
  }

  return (
    <div className="workspace mobile-layout">
      <section className="phone-shell">
        <div className="phone-header">
          <div>
            <p>{report.name}</p>
            <h2>每日回報</h2>
          </div>
          <span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span>
        </div>
        <div className="alert-line">營收只需填 14:00、19:00 與全日總營收；19:00 至打烊由系統自動倒算。</div>
        {revenueInvalid && <div className="alert-line danger">全日總營收不可小於 14:00 與 19:00 加總，請修正後再送出。</div>}
        <div className="segments">
          <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>營收</button>
          <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>庫存</button>
          <button className={tab === "incoming" ? "active" : ""} onClick={() => setTab("incoming")}>進貨</button>
        </div>
        {tab === "sales" ? (
          <div className="mobile-stack">
            <RevenueInput label="14:00" helper="開店至 14:00" value={form.opened_to_1400_revenue} onChange={(value) => setForm({ ...form, opened_to_1400_revenue: value })} />
            <RevenueInput label="19:00" helper="14:00 至 19:00" value={form.revenue_1400_to_1900} onChange={(value) => setForm({ ...form, revenue_1400_to_1900: value })} />
            <RevenueInput label="全日總營收" helper="今日收銀總額" value={form.full_day_revenue} onChange={(value) => setForm({ ...form, full_day_revenue: value })} />
            <div className="input-card calculated-card">
              <span>19:00 至打烊<small>全日總營收 - 14:00 - 19:00</small></span>
              <strong>{money(computedCloseRevenue)}</strong>
            </div>
            <RevenueInput label="現金差異" helper="正數或負數" value={form.cash_difference} onChange={(value) => setForm({ ...form, cash_difference: value })} />
            <label className="note-box">
              <span>店長備註</span>
              <textarea value={form.manager_note} onChange={(event) => setForm({ ...form, manager_note: event.target.value })} />
            </label>
            <div className="target-card">
              <span>今日總營收</span>
              <strong>{money(currentTotal)}</strong>
              <Progress value={(currentTotal / report.target) * 100} />
              <p>今日目標 {money(report.target)}</p>
            </div>
          </div>
        ) : tab === "inventory" ? (
          <InventoryEditor rows={inventory} onChange={setInventory} />
        ) : (
          <IncomingEditor rows={inventory} onChange={setInventory} />
        )}
        <button className="submit-button" disabled={saving || revenueInvalid} onClick={submit}>
          {saving ? "送出中..." : "送出每日回報"}
        </button>
      </section>
      <section className="panel companion">
        <div className="panel-head"><h2>門店狀態</h2><p>{report.manager_name}</p></div>
        <Metric label="今日總營收" value={money(currentTotal)} detail={`目標 ${money(report.target)}`} tone="hot" />
        <Metric label="達成率" value={pct((currentTotal / report.target) * 100)} detail="依今日目標計算" tone={currentTotal >= report.target ? "good" : "warn"} />
      </section>
    </div>
  );
}

function RevenueInput({ label, helper, value, onChange }) {
  return (
    <label className="input-card">
      <span>{label}<small>{helper}</small></span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function InventoryEditor({ rows, onChange }) {
  return (
    <div className="mobile-stack">
      {rows.map((row, index) => {
        const kind = productKind(row.name);
        return (
          <div className={`stock-row ${kind === "powder" ? "stock-row-powder" : "stock-row-wide"}`} key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <span>進貨 {formatInventoryAmount(row, "incoming")} · 使用量 {numberText(usageCount(row))} {displayUnitForProduct(row.name)}</span>
            </div>
            {kind === "powder" ? (
              <>
                <NumberField label="現存箱" value={row.current_stock_boxes} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { current_stock_boxes: value })} />
                <NumberField label="現存包" value={row.current_stock_packs} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { current_stock_packs: value })} />
              </>
            ) : (
              <>
                <NumberField label="現存" value={row.current_stock} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { current_stock: value })} />
                <UnitField row={row} field="stock_unit" onChange={(value) => updateInventoryRow(rows, onChange, index, row, { stock_unit: value })} />
              </>
            )}
            <NumberField label="報廢" value={row.loss_count} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { loss_count: value })} />
            <span className="chip good">已填</span>
          </div>
        );
      })}
    </div>
  );
}

function IncomingEditor({ rows, onChange }) {
  return (
    <div className="mobile-stack">
      {rows.map((row, index) => {
        const kind = productKind(row.name);
        return (
          <div className={`stock-row ${kind === "powder" ? "stock-row-incoming-powder" : "stock-row-incoming"}`} key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <span>請填今日進貨數量、單位與來源。</span>
            </div>
            {kind === "powder" ? (
              <>
                <NumberField label="進貨箱" value={row.incoming_boxes} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_boxes: value })} />
                <NumberField label="進貨包" value={row.incoming_packs} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_packs: value })} />
              </>
            ) : (
              <>
                <NumberField label="進貨" value={row.incoming_count} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_count: value })} />
                <UnitField row={row} field="incoming_unit" onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_unit: value })} />
              </>
            )}
            <label className="mini-field">
              <span>來源</span>
              <select
                value={row.incoming_source || "廠商進貨"}
                onChange={(event) => updateInventoryRow(rows, onChange, index, row, { incoming_source: event.target.value })}
              >
                <option>廠商進貨</option>
                <option>門店調貨</option>
              </select>
            </label>
            <label className="mini-field">
              <span>備註</span>
              <input
                value={row.transfer_note || ""}
                onChange={(event) => updateInventoryRow(rows, onChange, index, row, { transfer_note: event.target.value })}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input type="number" step="0.01" value={value || 0} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function UnitField({ row, field, onChange }) {
  const kind = productKind(row.name);
  if (kind === "variable") {
    return (
      <label className="mini-field">
        <span>單位</span>
        <select value={row[field] || "箱"} onChange={(event) => onChange(event.target.value)}>
          <option>箱</option>
          <option>包</option>
        </select>
      </label>
    );
  }
  return (
    <label className="mini-field">
      <span>單位</span>
      <input value={defaultUnitForProduct(row.name)} disabled />
    </label>
  );
}

function formatInventoryAmount(row, prefix) {
  const name = row.name || "";
  if (productKind(name) === "powder") {
    const boxes = Number(row[`${prefix === "incoming" ? "incoming" : "current_stock"}_boxes`] || 0);
    const packs = Number(row[`${prefix === "incoming" ? "incoming" : "current_stock"}_packs`] || 0);
    return `${numberText(boxes)} 箱 / ${numberText(packs)} 包`;
  }
  const field = prefix === "incoming" ? "incoming_count" : "current_stock";
  const unitField = prefix === "incoming" ? "incoming_unit" : "stock_unit";
  return `${numberText(row[field])} ${row[unitField] || defaultUnitForProduct(name)}`;
}

function updateInventoryRow(rows, onChange, index, row, patch) {
  const next = [...rows];
  next[index] = { ...row, ...patch };
  onChange(next);
}

function ReviewConsole({ reports, report, products, onSelect, onReview }) {
  const [inventory, setInventory] = useState(products);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadInventory() {
      try {
        const savedRows = await fetchInventoryCounts(report.id);
        if (!active) return;
        const byProduct = new Map(savedRows.map((row) => [row.product_id, row]));
        setInventory(products.map((product) => ({ ...product, ...byProduct.get(product.id) })));
      } catch {
        if (active) setInventory(products);
      }
    }
    loadInventory();
    return () => {
      active = false;
    };
  }, [products, report.id]);

  async function review(action, status) {
    setReviewing(true);
    await onReview(action, status);
    setReviewing(false);
  }

  return (
    <div className="workspace review-grid">
      <section className="status-board">
        <Metric label="草稿" value={reports.filter((item) => item.status === "draft").length} detail="尚未送出" tone="bad" />
        <Metric label="待審核" value={reports.filter((item) => item.status === "submitted").length} detail="等待確認" tone="warn" />
        <Metric label="需追蹤" value={reports.filter((item) => item.status === "follow_up").length} detail="異常門店" tone="bad" />
        <Metric label="已通過" value={reports.filter((item) => item.status === "approved").length} detail="完成審核" tone="good" />
      </section>
      <section className="panel store-queue">
        <div className="panel-head"><h2>門店佇列</h2><p>點選查看明細</p></div>
        {reports.map((item) => (
          <button className={item.store_id === report.store_id ? "selected queue-item" : "queue-item"} key={item.store_id} onClick={() => onSelect(item.store_id)}>
            <span className={`dot ${tone(item.status)}`} />
            <strong>{item.name}</strong>
            <em>{item.updated_at_label}</em>
            <small>{statusLabel(item.status)}</small>
          </button>
        ))}
      </section>
      <section className="panel review-main">
        <div className="panel-head">
          <div>
            <h2>{report.name}</h2>
            <p>{report.manager_name} · {report.area} · 總營收 {money(totalRevenue(report))}</p>
          </div>
          <span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span>
        </div>
        <div className="checkpoint-grid">
          <Metric label="14:00" value={money(report.opened_to_1400_revenue)} detail="開店至 14:00" />
          <Metric label="19:00" value={money(report.revenue_1400_to_1900)} detail="14:00 至 19:00" />
          <Metric label="打烊" value={money(report.revenue_1900_to_close)} detail="19:00 至打烊" />
          <Metric label="總營收" value={money(totalRevenue(report))} detail={`達成 ${pct((totalRevenue(report) / report.target) * 100)}`} tone="hot" />
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>品項</th><th>現存</th><th>報廢</th><th>進貨</th><th>來源</th><th>今日使用量</th><th>統計單位</th><th>備註</th></tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{formatInventoryAmount(item, "stock")}</td>
                  <td>{numberText(item.loss_count)}</td>
                  <td>{formatInventoryAmount(item, "incoming")}</td>
                  <td>{item.incoming_source || "廠商進貨"}</td>
                  <td><strong>{numberText(usageCount(item))}</strong></td>
                  <td>{displayUnitForProduct(item.name)}</td>
                  <td>{item.transfer_note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel action-rail">
        <div className="panel-head"><h2>審核動作</h2><p>更新回報狀態</p></div>
        <button disabled={reviewing} className="primary" onClick={() => review("approve", "approved")}>通過</button>
        <button disabled={reviewing} onClick={() => review("request_revision", "needs_revision")}>退回修改</button>
        <button disabled={reviewing} onClick={() => review("assign_transfer", "follow_up")}>指派追蹤</button>
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
