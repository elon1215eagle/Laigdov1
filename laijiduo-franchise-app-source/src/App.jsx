import { useEffect, useMemo, useState } from "react";
import {
  fetchFranchiseStores,
  fetchInventoryProducts,
  fetchInventoryRange,
  fetchInventoryReport,
  getSessionProfile,
  hasSupabaseConfig,
  signIn,
  signOut,
  upsertInventoryReport,
} from "./lib/franchiseApi";

const taipeiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function todayInTaipei() {
  const parts = taipeiFormatter.formatToParts(new Date());
  const part = (type) => Number(parts.find((item) => item.type === type)?.value || 0);
  const dateAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"));
  const businessDate = part("hour") < 6 ? new Date(dateAsUtc - 86400000) : new Date(dateAsUtc);
  return businessDate.toISOString().slice(0, 10);
}

const today = todayInTaipei();
const currentMonth = today.slice(0, 7);

function roleLabel(role) {
  if (["franchise_admin", "franchise_hq"].includes(role)) return "總部";
  if (role === "franchise_coo") return "COO";
  if (role === "franchise_cfo") return "CFO";
  return "加盟店";
}

function isHeadquartersRole(role) {
  return ["franchise_admin", "franchise_hq", "franchise_coo", "franchise_cfo"].includes(role);
}

function canWriteInventory(role) {
  return ["franchise_admin", "franchise_hq", "franchise_coo", "franchise_owner"].includes(role);
}

function numberValue(value) {
  return value === "" || value === null || value === undefined ? 0 : Number(value);
}

function numberText(value, digits = 2) {
  return Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: digits });
}

function monthRange(month) {
  const start = `${month}-01`;
  const date = new Date(`${start}T00:00:00Z`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function usageOf(item) {
  return numberValue(item.previous_qty) + numberValue(item.incoming_qty) - numberValue(item.current_qty) - numberValue(item.waste_qty);
}

function unitOptions(product) {
  return product.allowed_units?.length ? product.allowed_units : [product.default_unit || "包"];
}

export function App() {
  const [profile, setProfile] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [activeTab, setActiveTab] = useState("report");
  const [reportDate, setReportDate] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  const [rangeData, setRangeData] = useState({ reports: [], items: [] });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const isHq = isHeadquartersRole(profile?.role);
  const canWrite = canWriteInventory(profile?.role);
  const selectedStore = stores.find((store) => store.id === selectedStoreId);

  function notify(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  }

  async function refresh(nextProfile = profile, nextStoreId = selectedStoreId, nextMonth = month) {
    const [storeRows, productRows] = await Promise.all([fetchFranchiseStores(), fetchInventoryProducts()]);
    const visibleStores = isHeadquartersRole(nextProfile?.role)
      ? storeRows
      : storeRows.filter((store) => store.id === nextProfile?.franchise_store_id);
    const resolvedStoreId = isHeadquartersRole(nextProfile?.role)
      ? nextStoreId || visibleStores[0]?.id || ""
      : visibleStores[0]?.id || "";
    const range = monthRange(nextMonth);
    const inventoryRows = await fetchInventoryRange({
      storeId: isHeadquartersRole(nextProfile?.role) ? "" : resolvedStoreId,
      from: range.start,
      to: range.end,
    });
    setStores(visibleStores);
    setProducts(productRows);
    setSelectedStoreId(resolvedStoreId);
    setRangeData(inventoryRows);
  }

  useEffect(() => {
    async function boot() {
      try {
        const sessionProfile = hasSupabaseConfig ? await getSessionProfile() : null;
        const nextProfile = sessionProfile || {
          id: "demo-franchise-user",
          full_name: "加盟店管理者",
          role: "franchise_admin",
          franchise_store_id: null,
          is_active: true,
        };
        setProfile(nextProfile);
        if (isHeadquartersRole(nextProfile.role)) setActiveTab("overview");
        await refresh(nextProfile);
      } catch (error) {
        notify(`載入失敗：${error.message}`);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  async function handleLogin(email, password) {
    setLoading(true);
    try {
      await signIn(email, password);
      const nextProfile = await getSessionProfile();
      setProfile(nextProfile);
      setActiveTab(isHeadquartersRole(nextProfile?.role) ? "overview" : "report");
      await refresh(nextProfile);
      notify("登入完成");
    } catch (error) {
      notify(`登入失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setProfile(null);
    setStores([]);
    setProducts([]);
    setRangeData({ reports: [], items: [] });
  }

  async function handleMonthChange(nextMonth) {
    setMonth(nextMonth);
    await refresh(profile, selectedStoreId, nextMonth);
  }

  async function handleStoreChange(storeId) {
    setSelectedStoreId(storeId);
    await refresh(profile, storeId, month);
  }

  async function saveInventory(payload) {
    if (!selectedStoreId) {
      notify("此帳號尚未綁定加盟店，請聯繫總部設定。");
      return false;
    }
    try {
      await upsertInventoryReport({
        franchise_store_id: selectedStoreId,
        report_date: payload.report_date,
        note: payload.note,
        items: payload.items,
      });
      await refresh(profile, selectedStoreId, month);
      notify("庫存回報已儲存");
      return true;
    } catch (error) {
      notify(`儲存失敗：${error.message}`);
      return false;
    }
  }

  if (loading) return <main className="loading-screen">載入中...</main>;
  if (!profile) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">加</div>
          <div>
            <strong>萊吉多加盟庫存系統</strong>
            <span>總部控管 / 加盟店回報</span>
          </div>
        </div>
        <nav>
          {isHq && <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>總部庫存總覽</button>}
          <button className={activeTab === "report" ? "active" : ""} onClick={() => setActiveTab("report")}>加盟店庫存回報</button>
          {isHq && <button className={activeTab === "products" ? "active" : ""} onClick={() => setActiveTab("products")}>商品與單位規則</button>}
        </nav>
        <div className="user-box">
          <span>{roleLabel(profile.role)}｜{profile.full_name || "加盟帳號"}</span>
          <strong>{selectedStore?.name || (isHq ? "全部加盟店" : "尚未綁定門店")}</strong>
          <button onClick={handleSignOut}>登出</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p>{isHq ? "總部 / CFO / COO 庫存管理" : "加盟門店每日庫存回報"}</p>
            <h1>{activeTab === "overview" ? "總部庫存總覽" : activeTab === "products" ? "商品與單位規則" : "加盟店庫存回報"}</h1>
          </div>
          <div className="toolbar">
            <label>
              月份
              <input type="month" value={month} onChange={(event) => handleMonthChange(event.target.value)} />
            </label>
            <label>
              加盟店
              <select value={selectedStoreId} onChange={(event) => handleStoreChange(event.target.value)} disabled={!isHq || stores.length <= 1}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.store_code} {store.name}</option>)}
                {!stores.length && <option value="">未綁定</option>}
              </select>
            </label>
          </div>
        </header>

        {activeTab === "overview" && isHq && <HeadquartersOverview stores={stores} products={products} rangeData={rangeData} />}
        {activeTab === "report" && (
          <InventoryReportForm
            products={products}
            reportDate={reportDate}
            setReportDate={setReportDate}
            selectedStoreId={selectedStoreId}
            canWrite={canWrite}
            onSave={saveInventory}
          />
        )}
        {activeTab === "products" && isHq && <ProductRules products={products} />}
      </main>
      {message && <div className="toast" role="alert">{message}</div>}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand-mark">加</div>
        <h1>萊吉多加盟庫存系統</h1>
        <p>加盟店每日回報庫存，總部、CFO、COO 查看缺貨、進貨與耗用異常。</p>
        <label>帳號<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>密碼<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button onClick={() => onLogin(email, password)}>登入</button>
      </section>
    </main>
  );
}

function HeadquartersOverview({ stores, products, rangeData }) {
  const todayReports = rangeData.reports.filter((report) => report.report_date === today);
  const todayReportIds = new Set(todayReports.map((report) => report.id));
  const todayItems = rangeData.items.filter((item) => todayReportIds.has(item.report_id));
  const reportedStoreIds = new Set(todayReports.map((report) => report.franchise_store_id));
  const lowStockItems = todayItems.filter((item) => numberValue(item.current_qty) <= numberValue(item.threshold_qty));
  const abnormalUsageItems = todayItems.filter((item) => usageOf(item) < 0 || usageOf(item) >= numberValue(item.threshold_qty || 0) * 2);
  const incomingTotal = todayItems.reduce((sum, item) => sum + numberValue(item.incoming_qty), 0);
  const storeRows = stores.map((store) => {
    const storeReport = todayReports.find((report) => report.franchise_store_id === store.id);
    const storeItems = storeReport ? todayItems.filter((item) => item.report_id === storeReport.id) : [];
    return {
      store,
      report: storeReport,
      lowCount: storeItems.filter((item) => numberValue(item.current_qty) <= numberValue(item.threshold_qty)).length,
      abnormalCount: storeItems.filter((item) => usageOf(item) < 0 || usageOf(item) >= numberValue(item.threshold_qty || 0) * 2).length,
      incoming: storeItems.reduce((sum, item) => sum + numberValue(item.incoming_qty), 0),
      usage: storeItems.reduce((sum, item) => sum + usageOf(item), 0),
    };
  });

  return (
    <div className="workspace">
      <section className="kpi-grid">
        <Metric label="今日回報完成率" value={`${reportedStoreIds.size}/${stores.length} 店`} tone={reportedStoreIds.size === stores.length ? "good" : "warn"} />
        <Metric label="缺貨風險" value={`${lowStockItems.length} 項`} tone={lowStockItems.length ? "bad" : "good"} />
        <Metric label="異常耗用" value={`${abnormalUsageItems.length} 項`} tone={abnormalUsageItems.length ? "bad" : "good"} />
        <Metric label="今日進貨量" value={`${numberText(incomingTotal)} 筆量`} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>需要總部處理的加盟店</h2>
            <p>優先看未回報、缺貨風險、異常耗用，讓總部可以直接催補貨或追原因。</p>
          </div>
        </div>
        <div className="store-risk-grid">
          {storeRows.map((row) => (
            <div className={`risk-card ${!row.report ? "danger" : row.lowCount || row.abnormalCount ? "warn" : "good"}`} key={row.store.id}>
              <span>{row.store.store_code}</span>
              <strong>{row.store.name}</strong>
              <p>{!row.report ? "今日尚未回報" : `缺貨 ${row.lowCount} 項 / 異常 ${row.abnormalCount} 項`}</p>
              <small>進貨 {numberText(row.incoming)}｜耗用 {numberText(row.usage)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>今日庫存明細</h2>
            <p>依加盟店與品項彙整，低於預警值或耗用異常會標示。</p>
          </div>
        </div>
        <InventoryTable items={todayItems} products={products} />
      </section>
    </div>
  );
}

function InventoryReportForm({ products, reportDate, setReportDate, selectedStoreId, canWrite, onSave }) {
  const [note, setNote] = useState("");
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadReport() {
      const report = await fetchInventoryReport({ storeId: selectedStoreId, date: reportDate });
      if (!active) return;
      const savedByProduct = new Map((report?.items || []).map((item) => [item.product_id, item]));
      setNote(report?.note || "");
      setItems(products.map((product) => normalizeInventoryItem(product, savedByProduct.get(product.id))));
    }
    loadReport();
    return () => {
      active = false;
    };
  }, [products, reportDate, selectedStoreId]);

  function patchItem(productId, patch) {
    setItems((current) => current.map((item) => item.product_id === productId ? { ...item, ...patch } : item));
  }

  async function submit() {
    if (!canWrite) return;
    setSaving(true);
    await onSave({ report_date: reportDate, note, items });
    setSaving(false);
  }

  return (
    <section className="panel form-panel">
      <div className="panel-head">
        <div>
          <h2>每日庫存回報</h2>
          <p>公式：昨日庫存 + 今日進貨 - 今日庫存 - 報廢 = 今日使用量。</p>
        </div>
      </div>
      <div className="report-toolbar">
        <label>
          回報日期
          <input type="date" max={today} value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
        </label>
        <label>
          今日備註
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：雞翅叫貨、地瓜低庫存、調貨給某店" disabled={!canWrite} />
        </label>
      </div>
      <div className="inventory-edit-list">
        {items.map((item) => (
          <InventoryEditRow key={item.product_id} item={item} canWrite={canWrite} onChange={(patch) => patchItem(item.product_id, patch)} />
        ))}
      </div>
      {canWrite ? (
        <button className="primary sticky-submit" disabled={saving || !selectedStoreId} onClick={submit}>
          {saving ? "儲存中..." : "送出庫存回報"}
        </button>
      ) : (
        <div className="readonly-banner">目前角色為查看權限，可查詢庫存資料，但不可修改或送出回報。</div>
      )}
    </section>
  );
}

function InventoryEditRow({ item, canWrite, onChange }) {
  const options = unitOptions(item.product);
  const usage = usageOf(item);
  const isLow = numberValue(item.current_qty) <= numberValue(item.threshold_qty);
  return (
    <div className={`inventory-row-card ${isLow ? "low" : ""}`}>
      <div className="inventory-product-head">
        <div>
          <strong>{item.product.name}</strong>
          <span>{item.product.category}｜單位：{options.join(" / ")}</span>
        </div>
        <em className={usage < 0 ? "bad" : ""}>使用量 {numberText(usage)}</em>
      </div>
      <div className="inventory-input-grid">
        <QtyInput label="昨日庫存" qty={item.previous_qty} unit={item.previous_unit} units={options} disabled={!canWrite} onQty={(value) => onChange({ previous_qty: value })} onUnit={(value) => onChange({ previous_unit: value })} />
        <QtyInput label="今日進貨" qty={item.incoming_qty} unit={item.incoming_unit} units={options} disabled={!canWrite} onQty={(value) => onChange({ incoming_qty: value })} onUnit={(value) => onChange({ incoming_unit: value })} />
        <QtyInput label="今日庫存" qty={item.current_qty} unit={item.current_unit} units={options} disabled={!canWrite} onQty={(value) => onChange({ current_qty: value })} onUnit={(value) => onChange({ current_unit: value })} />
        <QtyInput label="報廢" qty={item.waste_qty} unit={item.waste_unit} units={options} disabled={!canWrite} onQty={(value) => onChange({ waste_qty: value })} onUnit={(value) => onChange({ waste_unit: value })} />
      </div>
      <label>
        備註
        <input value={item.note || ""} onChange={(event) => onChange({ note: event.target.value })} placeholder="缺貨、調貨、異常耗用原因" disabled={!canWrite} />
      </label>
    </div>
  );
}

function QtyInput({ label, qty, unit, units, disabled, onQty, onUnit }) {
  return (
    <label className="qty-field">
      <span>{label}</span>
      <div>
        <input type="number" inputMode="decimal" min="0" step="0.01" value={qty ?? ""} onChange={(event) => onQty(event.target.value)} disabled={disabled} />
        <select value={unit || units[0]} onChange={(event) => onUnit(event.target.value)} disabled={disabled}>
          {units.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
    </label>
  );
}

function InventoryTable({ items, products }) {
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>加盟店</th><th>品項</th><th>昨日</th><th>進貨</th><th>今日庫存</th><th>報廢</th><th>使用量</th><th>狀態</th><th>備註</th></tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const usage = usageOf(item);
            const low = numberValue(item.current_qty) <= numberValue(item.threshold_qty);
            const abnormal = usage < 0 || usage >= numberValue(item.threshold_qty || 0) * 2;
            return (
              <tr key={item.id || `${item.report_id}-${item.product_id}`}>
                <td>{item.store_name || "-"}</td>
                <td><strong>{item.product?.name || productNames.get(item.product_id)}</strong></td>
                <td>{numberText(item.previous_qty)} {item.previous_unit}</td>
                <td>{numberText(item.incoming_qty)} {item.incoming_unit}</td>
                <td>{numberText(item.current_qty)} {item.current_unit}</td>
                <td>{numberText(item.waste_qty)} {item.waste_unit}</td>
                <td className={usage < 0 ? "negative" : ""}>{numberText(usage)}</td>
                <td><span className={`chip ${low || abnormal ? "bad" : "good"}`}>{low ? "低庫存" : abnormal ? "耗用異常" : "正常"}</span></td>
                <td>{item.note || "-"}</td>
              </tr>
            );
          })}
          {!items.length && <tr><td colSpan="9">今日尚無庫存回報。</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProductRules({ products }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>商品與單位規則</h2>
          <p>主商品可選箱 / 大包 / 小包；其他品項依總部規則固定或限制單位。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>排序</th><th>品項</th><th>分類</th><th>可用單位</th><th>預設單位</th><th>換算備註</th></tr></thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.sort_order}</td>
                <td><strong>{product.name}</strong></td>
                <td>{product.category}</td>
                <td>{unitOptions(product).join(" / ")}</td>
                <td>{product.default_unit}</td>
                <td>{product.conversion_note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeInventoryItem(product, saved) {
  const defaultUnit = product.default_unit || unitOptions(product)[0];
  return {
    product,
    product_id: product.id,
    previous_qty: saved?.previous_qty ?? "",
    previous_unit: saved?.previous_unit || defaultUnit,
    incoming_qty: saved?.incoming_qty ?? "",
    incoming_unit: saved?.incoming_unit || defaultUnit,
    current_qty: saved?.current_qty ?? "",
    current_unit: saved?.current_unit || defaultUnit,
    waste_qty: saved?.waste_qty ?? "",
    waste_unit: saved?.waste_unit || defaultUnit,
    threshold_qty: saved?.threshold_qty ?? product.default_threshold_qty ?? 0,
    threshold_unit: saved?.threshold_unit || defaultUnit,
    note: saved?.note || "",
  };
}
