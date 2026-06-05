import { useEffect, useMemo, useState } from "react";
import {
  fetchDailyReports,
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
  upsertDailyReport,
  upsertInventoryCounts,
} from "./lib/api";
import { mockProfile, productsSeed, storesSeed } from "./lib/mockData";
import { InspectionApp } from "./InspectionApp";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
const pct = (value) => `${Math.round(value || 0)}%`;

function tone(status) {
  if (status === "approved") return "good";
  if (status === "submitted") return "warn";
  return "bad";
}

function normalizeReport(store, report) {
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
    target: store.target || store.target_daily_revenue || 65000,
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
    const [storeRows, productRows] = await Promise.all([fetchStores(), fetchProducts()]);
    setStores(storeRows);
    setProducts(productRows);
    setSelectedStoreId(nextProfile?.store_id || preferredStoreId || storeRows[0]?.id || "");

    const reportRows = await fetchDailyReports(today);
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
      const payload = {
        store_id: selectedReport.store_id,
        report_date: today,
        opened_to_1400_revenue: Number(form.opened_to_1400_revenue),
        revenue_1400_to_1900: Number(form.revenue_1400_to_1900),
        revenue_1900_to_close: Number(form.revenue_1900_to_close),
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
          safety_stock: Number(row.safety_stock || 0),
          loss_count: Number(row.loss_count || 0),
          incoming_count: Number(row.incoming_count || 0),
          transfer_note: row.transfer_note || "",
          is_shortage: Number(row.current_stock || 0) < Number(row.safety_stock || 0),
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

  function exportReports() {
    const headers = ["門店代碼", "門店", "店長", "日期", "14:00", "19:00", "打烊", "總營收", "現金差異", "狀態"];
    const rows = reports.map((report) => [
      report.store_code,
      report.name,
      report.manager_name,
      report.report_date,
      report.opened_to_1400_revenue,
      report.revenue_1400_to_1900,
      report.revenue_1900_to_close,
      totalRevenue(report),
      report.cash_difference ?? "",
      statusLabel(report.status),
    ]);
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    link.download = `萊吉多營運回報-${today}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    show("報表已匯出");
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
        {role === "hq" && <HqDashboard reports={reports} onSelect={setSelectedStoreId} />}
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
        <p>{today} · {report?.area || "全區"} · {report?.name || "尚未選擇門店"}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button onClick={onExport}>匯出 CSV</button>
        <button className="primary" onClick={onSync}>同步資料</button>
      </div>
    </header>
  );
}

function HqDashboard({ reports, onSelect }) {
  const summary = useMemo(() => {
    const total = reports.reduce((sum, report) => sum + totalRevenue(report), 0);
    const target = reports.reduce((sum, report) => sum + Number(report.target || 0), 0);
    return { total, target };
  }, [reports]);
  const sorted = [...reports].sort((a, b) => totalRevenue(b) - totalRevenue(a));

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
            <h2>門店營收排行</h2>
            <p>依 14:00、19:00、打烊三段營收加總。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>門店</th>
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
              {reports.map((report) => (
                <tr key={report.store_id} onClick={() => onSelect(report.store_id)}>
                  <td><strong>{report.name}</strong><span>{report.manager_name || report.store_code}</span></td>
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
      <section className="panel">
        <div className="panel-head"><h2>前六名</h2><p>營收排行</p></div>
        <div className="ranking">
          {sorted.slice(0, 6).map((report, index) => (
            <button key={report.store_id} onClick={() => onSelect(report.store_id)}>
              <span>{index + 1}</span>
              <strong>{report.name}</strong>
              <div><i style={{ width: `${Math.min(100, (totalRevenue(report) / Math.max(1, totalRevenue(sorted[0]))) * 100)}%` }} /></div>
              <em>{money(totalRevenue(report))}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StoreReport({ report, products, onSave }) {
  const [tab, setTab] = useState("sales");
  const [form, setForm] = useState({
    opened_to_1400_revenue: report.opened_to_1400_revenue,
    revenue_1400_to_1900: report.revenue_1400_to_1900,
    revenue_1900_to_close: report.revenue_1900_to_close,
    cash_difference: report.cash_difference || 0,
    manager_note: report.manager_note || "",
  });
  const [inventory, setInventory] = useState(products);
  const [saving, setSaving] = useState(false);
  const currentTotal = totalRevenue(form);

  useEffect(() => {
    setForm({
      opened_to_1400_revenue: report.opened_to_1400_revenue,
      revenue_1400_to_1900: report.revenue_1400_to_1900,
      revenue_1900_to_close: report.revenue_1900_to_close,
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
        <div className="alert-line">請確認三段營收、庫存與現金差異後送出。</div>
        <div className="segments">
          <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>營收</button>
          <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>庫存</button>
        </div>
        {tab === "sales" ? (
          <div className="mobile-stack">
            <RevenueInput label="14:00" helper="開店至 14:00" value={form.opened_to_1400_revenue} onChange={(value) => setForm({ ...form, opened_to_1400_revenue: value })} />
            <RevenueInput label="19:00" helper="14:00 至 19:00" value={form.revenue_1400_to_1900} onChange={(value) => setForm({ ...form, revenue_1400_to_1900: value })} />
            <RevenueInput label="打烊" helper="19:00 至打烊" value={form.revenue_1900_to_close} onChange={(value) => setForm({ ...form, revenue_1900_to_close: value })} />
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
        ) : (
          <InventoryEditor rows={inventory} onChange={setInventory} />
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
      {rows.map((row, index) => (
        <div className="stock-row" key={row.id}>
          <div>
            <strong>{row.name}（{row.unit}）</strong>
            <span>安全庫存 {row.safety_stock} {row.unit} · 報廢 {row.loss_count} {row.unit}</span>
          </div>
          <input
            type="number"
            value={row.current_stock}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, current_stock: Number(event.target.value) };
              onChange(next);
            }}
          />
          <span className={`chip ${row.current_stock < row.safety_stock ? "bad" : "good"}`}>
            {row.current_stock < row.safety_stock ? "短缺" : "正常"}
          </span>
        </div>
      ))}
    </div>
  );
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
              <tr><th>品項</th><th>現存</th><th>安全庫存</th><th>報廢</th><th>進貨</th><th>調撥</th></tr>
            </thead>
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}（{item.unit}）</strong></td>
                  <td>{item.current_stock}</td>
                  <td>{item.safety_stock}</td>
                  <td>{item.loss_count}</td>
                  <td>{item.incoming_count}</td>
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
