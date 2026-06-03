import { useEffect, useMemo, useState } from "react";
import {
  fetchDailyReports,
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
import { mockProfile } from "./lib/mockData";

const today = new Date().toISOString().slice(0, 10);

const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
const pct = (value) => `${Math.round(value || 0)}%`;

function tone(status) {
  if (status === "approved") return "good";
  if (status === "draft" || status === "follow_up" || status === "needs_revision") return "bad";
  return "warn";
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
    updated_at_label: store.updated_at_label || "尚未更新",
  };
}

export function App() {
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState("entry");
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function boot() {
      try {
        const [storeRows, productRows] = await Promise.all([fetchStores(), fetchProducts()]);
        setStores(storeRows);
        setProducts(productRows);
        setSelectedStoreId(storeRows[0]?.id || "");

        if (hasSupabaseConfig) {
          const sessionProfile = await getSessionProfile();
          setProfile(sessionProfile);
          if (sessionProfile?.role === "store_manager") {
            setRole("store");
            setSelectedStoreId(sessionProfile.store_id);
          } else if (sessionProfile?.role === "supervisor") {
            setRole("review");
          } else if (sessionProfile) {
            setRole("hq");
          }
        } else {
          setProfile(mockProfile);
        }
      } catch (error) {
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  useEffect(() => {
    async function loadReports() {
      try {
        const reportRows = await fetchDailyReports(today);
        const byStore = new Map(reportRows.map((report) => [report.store_id || report.id, report]));
        setReports(stores.map((store) => normalizeReport(store, byStore.get(store.id))));
      } catch (error) {
        setMessage(error.message);
      }
    }
    if (stores.length) loadReports();
  }, [stores]);

  const selectedReport = reports.find((report) => report.store_id === selectedStoreId || report.id === selectedStoreId) || reports[0];

  async function handleLogin(email, password) {
    setLoading(true);
    try {
      await signIn(email, password);
      const nextProfile = await getSessionProfile();
      setProfile(nextProfile);
      setRole(nextProfile.role === "store_manager" ? "store" : nextProfile.role === "supervisor" ? "review" : "hq");
      if (nextProfile.store_id) setSelectedStoreId(nextProfile.store_id);
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
  }

  function show(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function saveReport(form, inventoryRows) {
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
    if (saved.id) {
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
    }
    setReports((current) => current.map((report) => (
      report.store_id === selectedReport.store_id
        ? { ...report, ...payload, status: "submitted", updated_at_label: "剛剛" }
        : report
    )));
    show("今日回報已送出，總部與營運督導畫面已同步");
  }

  async function handleReview(action, status) {
    if (selectedReport?.id) {
      await reviewReport(selectedReport.id, action, "", status);
    }
    setReports((current) => current.map((report) => (
      report.store_id === selectedReport.store_id ? { ...report, status, updated_at_label: "剛剛" } : report
    )));
    show("審核狀態已更新");
  }

  if (loading) return <main className="loading">載入中...</main>;

  if (!profile && hasSupabaseConfig) {
    return <LoginScreen onLogin={handleLogin} message={message} />;
  }

  if (role === "entry") {
    return (
      <EntryScreen
        profile={profile}
        stores={stores}
        onSelectStore={(storeId) => {
          setSelectedStoreId(storeId);
          setRole("store");
        }}
        onRole={setRole}
        onSignOut={handleSignOut}
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
        onSignOut={handleSignOut}
      />
      <main className="content">
        <TopBar role={role} report={selectedReport} />
        {!hasSupabaseConfig && (
          <div className="notice">示範模式：尚未設定 Supabase，資料只在本機畫面中展示。</div>
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
      {message && <div className="toast show">{message}</div>}
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
        <h1>萊吉多炸雞營運回報</h1>
        <p>店長、總部與營運督導使用同一個網址登入。</p>
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
        <h1>門市營運回報入口</h1>
        <p>正式版會依照登入帳號自動判斷角色；這裡保留入口選擇，方便上線前測試流程。</p>
        <label>
          店長選擇門市
          <select onChange={(event) => onSelectStore(event.target.value)} defaultValue="">
            <option value="" disabled>選擇門市</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        </label>
        <div className="entry-actions">
          <button className="primary" onClick={() => onRole("hq")}>總部後台</button>
          <button onClick={() => onRole("review")}>營運督導審核</button>
        </div>
      </section>
      <section className="entry-panels">
        <Info title="店長介面" text="手機填 14:00、19:00、打烊三段金額，系統自動加總今日業績。" />
        <Info title="總部介面" text="查看 11 家門市的今日營收、達標率、缺貨與未回報。" />
        <Info title="營運督導介面" text="審核回報、要求補件、指派調貨並留下紀錄。" />
      </section>
    </main>
  );
}

function Sidebar({ role, profile, stores, selectedStoreId, setRole, setSelectedStoreId, onSignOut }) {
  const isStoreManager = profile?.role === "store_manager";
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">萊</div>
        <div>
          <strong>萊吉多炸雞營運回報</strong>
          <span>正式網站架構版</span>
        </div>
      </div>
      {!isStoreManager && (
        <div className="role-switcher">
          {[
            ["hq", "總部"],
            ["store", "店長"],
            ["review", "營運督導"],
          ].map(([key, label]) => (
            <button key={key} className={role === key ? "active" : ""} onClick={() => setRole(key)}>{label}</button>
          ))}
        </div>
      )}
      <label className="field-label">門市</label>
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
        <button className="active">今日總覽</button>
        <button>業績回報</button>
        <button>盤點回報</button>
        <button>異常追蹤</button>
        <button>帳號權限</button>
      </nav>
      <div className="sidebar-note">
        <span>{profile?.full_name || "示範帳號"}</span>
        <strong>{profile?.role || "demo"}</strong>
        <p>正式上線後，這裡會依 Supabase Auth 角色鎖定可見資料。</p>
      </div>
      <button onClick={onSignOut}>返回入口 / 登出</button>
    </aside>
  );
}

function TopBar({ role, report }) {
  const title = role === "hq" ? "總部營運戰情室" : role === "store" ? "店長每日回報" : "營運督導審核台";
  return (
    <header className="topbar">
      <div>
        <p>{today} · 現金買賣 · {report?.area || "高屏區"}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button>匯出 Excel</button>
        <button className="primary">同步資料</button>
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
        <Metric label="14:00 回報率" value="100%" detail="以提交紀錄計算" />
        <Metric label="待審核" value={`${reports.filter((report) => report.status === "submitted").length} 家`} detail="等待營運督導" tone="warn" />
        <Metric label="需追蹤" value={`${reports.filter((report) => report.status === "follow_up").length} 家`} detail="異常門市" tone="bad" />
        <Metric label="達標門市" value={`${reports.filter((report) => totalRevenue(report) >= report.target).length} 家`} detail="今日業績達標" tone="good" />
      </section>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>各店今日業績</h2>
            <p>14:00、19:00、打烊為各時段獨立金額，今日業績為三段加總。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>門市</th>
                <th>14:00</th>
                <th>19:00</th>
                <th>打烊</th>
                <th>今日業績</th>
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
                  <td className={report.cash_difference < 0 ? "negative" : ""}>{report.cash_difference ?? "待補"}</td>
                  <td><span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>營收排行</h2><p>今日業績加總</p></div>
        <div className="ranking">
          {sorted.slice(0, 6).map((report, index) => (
            <button key={report.store_id} onClick={() => onSelect(report.store_id)}>
              <span>{index + 1}</span>
              <strong>{report.name}</strong>
              <div><i style={{ width: `${Math.min(100, (totalRevenue(report) / totalRevenue(sorted[0])) * 100)}%` }} /></div>
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

  return (
    <div className="workspace mobile-layout">
      <section className="phone-shell">
        <div className="phone-header">
          <div>
            <p>{report.name}</p>
            <h2>今日回報</h2>
          </div>
          <span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span>
        </div>
        <div className="alert-line">各時段金額會加總成今日業績，送出後同步到總部與營運督導。</div>
        <div className="segments">
          <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>今日業績</button>
          <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>盤點回報</button>
        </div>
        {tab === "sales" ? (
          <div className="mobile-stack">
            <RevenueInput label="14:00" helper="開店到 14:00" value={form.opened_to_1400_revenue} onChange={(value) => setForm({ ...form, opened_to_1400_revenue: value })} />
            <RevenueInput label="19:00" helper="14:00 到 19:00" value={form.revenue_1400_to_1900} onChange={(value) => setForm({ ...form, revenue_1400_to_1900: value })} />
            <RevenueInput label="打烊" helper="19:00 到打烊" value={form.revenue_1900_to_close} onChange={(value) => setForm({ ...form, revenue_1900_to_close: value })} />
            <div className="target-card">
              <span>今日業績</span>
              <strong>{money(currentTotal)}</strong>
              <Progress value={(currentTotal / report.target) * 100} />
              <p>今日目標 {money(report.target)}</p>
            </div>
          </div>
        ) : (
          <InventoryEditor rows={inventory} onChange={setInventory} />
        )}
        <button className="submit-button" onClick={() => onSave(form, inventory)}>送出今日回報</button>
      </section>
      <section className="panel companion">
        <div className="panel-head"><h2>店長填報狀態</h2><p>{report.manager_name}</p></div>
        <Metric label="今日業績" value={money(currentTotal)} detail={`目標 ${money(report.target)}`} tone="hot" />
        <Metric label="目前達成" value={pct((currentTotal / report.target) * 100)} detail="依三時段加總" tone={currentTotal >= report.target ? "good" : "warn"} />
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
            <strong>{row.name}</strong>
            <span>安全量 {row.safety_stock} · 報廢 {row.loss_count}</span>
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
            {row.current_stock < row.safety_stock ? "缺貨" : "正常"}
          </span>
        </div>
      ))}
      <label className="note-box">
        <span>店長備註</span>
        <textarea placeholder="填寫缺貨、報廢、調貨或現金交接說明" />
      </label>
    </div>
  );
}

function ReviewConsole({ reports, report, products, onSelect, onReview }) {
  return (
    <div className="workspace review-grid">
      <section className="status-board">
        <Metric label="未回報" value={reports.filter((item) => item.status === "draft").length} detail="需催補" tone="bad" />
        <Metric label="待審核" value={reports.filter((item) => item.status === "submitted").length} detail="等待營運督導" tone="warn" />
        <Metric label="需追蹤" value={reports.filter((item) => item.status === "follow_up").length} detail="異常門市" tone="bad" />
        <Metric label="已完成" value={reports.filter((item) => item.status === "approved").length} detail="審核通過" tone="good" />
      </section>
      <section className="panel store-queue">
        <div className="panel-head"><h2>門市清單</h2><p>依狀態追蹤</p></div>
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
            <p>{report.manager_name} · {report.area} · 今日業績 {money(totalRevenue(report))}</p>
          </div>
          <span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span>
        </div>
        <div className="checkpoint-grid">
          <Metric label="14:00" value={money(report.opened_to_1400_revenue)} detail="開店到 14:00" />
          <Metric label="19:00" value={money(report.revenue_1400_to_1900)} detail="14:00 到 19:00" />
          <Metric label="打烊" value={money(report.revenue_1900_to_close)} detail="19:00 到打烊" />
          <Metric label="今日業績" value={money(totalRevenue(report))} detail={`達成 ${pct((totalRevenue(report) / report.target) * 100)}`} tone="hot" />
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>品項</th><th>庫存</th><th>安全量</th><th>報廢</th><th>進貨</th><th>調貨</th></tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
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
        <div className="panel-head"><h2>處理動作</h2><p>同步留下紀錄</p></div>
        <button className="primary" onClick={() => onReview("approve", "approved")}>審核通過</button>
        <button onClick={() => onReview("request_revision", "needs_revision")}>要求補件</button>
        <button onClick={() => onReview("assign_transfer", "follow_up")}>指派調貨</button>
        <label className="note-box">
          <span>內部備註</span>
          <textarea defaultValue="請明早 10:00 前補上調貨照片與交接金額。" />
        </label>
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
