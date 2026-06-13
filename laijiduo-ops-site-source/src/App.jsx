import { useEffect, useMemo, useState } from "react";
import {
  fetchDailyReports,
  fetchHqDashboardData,
  fetchInventoryCounts,
  fetchProducts,
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
  upsertInventoryCounts,
} from "./lib/api";
import { mockProfile, productsSeed, storesSeed } from "./lib/mockData";
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
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadWorkspace(nextProfile = profile, preferredStoreId = selectedStoreId) {
    const [storeRows, productRows, reportRows] = await Promise.all([
      fetchStores(),
      fetchProducts(),
      fetchDailyReports(today),
    ]);
    setStores(storeRows);
    setProducts(productRows);
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

          setRole(sessionProfile.role === "store_manager" ? "store" : sessionProfile.role === "supervisor" ? "review" : "hq");
          await loadWorkspace(sessionProfile);
        } else {
          setProfile(mockProfile);
          setStores(storesSeed);
          setProducts(productsSeed);
          setSelectedStoreId(storesSeed[0]?.id || "");
          setReports(storesSeed.map((store) => normalizeReport(store)));
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

  if (activeModule === "inspection") {
    return <InspectionApp onBack={() => setActiveModule("ops")} />;
  }

  function requestInspectionAccess() {
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
      setRole(nextProfile.role === "store_manager" ? "store" : nextProfile.role === "supervisor" ? "review" : "hq");
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
    }
  }

  function show(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
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
        stores={stores}
        selectedStoreId={selectedStoreId}
        setRole={setRole}
        setSelectedStoreId={setSelectedStoreId}
        onInspection={requestInspectionAccess}
        onSignOut={handleSignOut}
      />
      <main className="content">
        <TopBar role={role} report={selectedReport} onSync={syncWorkspace} onExport={exportReports} />
        {!hasSupabaseConfig && (
          <div className="notice">目前使用示範資料。部署後請在 Vercel 設定 Supabase 環境變數，即可切換為正式資料。</div>
        )}
        {role === "hq" && <HqDashboard reports={reports} products={products} onSelect={setSelectedStoreId} />}
        {role === "store" && selectedReport && (
          <StoreReport report={selectedReport} products={products} onSave={saveReport} />
        )}
        {role === "review" && selectedReport && (
          <ReviewConsole
            reports={reports}
            report={selectedReport}
            products={products}
            onSelect={setSelectedStoreId}
            onReview={handleReview}
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

function Sidebar({ role, profile, stores, selectedStoreId, setRole, setSelectedStoreId, onInspection, onSignOut }) {
  const isStoreManager = profile?.role === "store_manager";
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">萊</div>
        <div>
          <strong>萊吉多營運回報</strong>
          <span>門店營運管理</span>
        </div>
      </div>
      {!isStoreManager && (
        <div className="role-switcher">
          {[
            ["hq", "總部"],
            ["store", "門店"],
            ["review", "營運審核"],
            ["inspection", "巡檢管理"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={role === key ? "active" : ""}
              onClick={() => (key === "inspection" ? onInspection() : setRole(key))}
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
        <button className="active" disabled>每日營運回報</button>
      </nav>
      <div className="sidebar-note">
        <span>{profile?.full_name || "示範使用者"}</span>
        <strong>{profile?.role || "demo"}</strong>
        <p>正式部署後，角色與可查看門店會由 Supabase Auth 與 profiles 資料表控制。</p>
      </div>
      <button onClick={onSignOut}>登出 / 回入口</button>
    </aside>
  );
}

function TopBar({ role, report, onSync, onExport }) {
  const title = role === "hq" ? "總部營運總覽" : role === "store" ? "門店每日回報" : "門店回報審核台";
  return (
    <header className="topbar">
      <div>
        <p>營業日 {today} · {report?.area || "全區"} · {report?.name || "尚未選擇門店"}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button onClick={onExport}>匯出 CSV</button>
        <button className="primary" onClick={onSync}>同步資料</button>
      </div>
    </header>
  );
}

function HqDashboard({ reports, products, onSelect }) {
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

  async function saveMonthlyTarget(report) {
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
            <p>輸入各店本月目標，系統自動換算每日目標，供達成率與週會檢討使用。</p>
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
                        onChange={(event) => setTargetDrafts({ ...targetDrafts, [report.store_id]: event.target.value })}
                      />
                    </td>
                    <td>{money(dailyTarget)}</td>
                    <td>{money(totalRevenue(report))}</td>
                    <td><Progress value={(totalRevenue(report) / Math.max(1, dailyTarget)) * 100} /></td>
                    <td><button disabled={savingTargetId === report.store_id} onClick={() => saveMonthlyTarget(report)}>儲存</button></td>
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
        <button className="submit-button" disabled={saving} onClick={submit}>
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
