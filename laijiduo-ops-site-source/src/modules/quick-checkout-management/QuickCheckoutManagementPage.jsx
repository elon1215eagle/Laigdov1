import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildDeviceRows,
  buildEmployeeCodeRows,
  buildQuickCheckoutManagementSummary,
  filterQuickCheckoutOrders,
  QUICK_CHECKOUT_STATUS_LABELS,
} from "./domain/managementSummary.js";
import {
  fetchQuickCheckoutManagement,
  manageQuickCheckoutDevice,
} from "./data/quickCheckoutManagementRepository.js";
import "./quickCheckoutManagement.css";

const DEVICE_STATUS_LABELS = {
  active: "使用中",
  disabled: "已停用",
  revoked: "已解除綁定",
};

function dateString(date) {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

function defaultRange() {
  const now = new Date();
  return {
    startDate: dateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: dateString(now),
  };
}

function formatDateTime(value) {
  if (!value) return "尚未使用";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function money(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

export default function QuickCheckoutManagementPage({ onNotify }) {
  const initialRange = useMemo(defaultRange, []);
  const [range, setRange] = useState(initialRange);
  const [appliedRange, setAppliedRange] = useState(initialRange);
  const [filters, setFilters] = useState({ storeCode: "", employeeCode: "", status: "" });
  const [activeTab, setActiveTab] = useState("devices");
  const [data, setData] = useState({ stores: [], devices: [], orders: [], deviceEvents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchQuickCheckoutManagement(appliedRange));
    } catch (loadError) {
      setError(loadError.message || "點單管理資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = useMemo(
    () => filterQuickCheckoutOrders(data.orders, filters),
    [data.orders, filters],
  );
  const summary = useMemo(
    () => buildQuickCheckoutManagementSummary(data.devices, filteredOrders),
    [data.devices, filteredOrders],
  );
  const deviceRows = useMemo(
    () => buildDeviceRows(data.devices, filteredOrders),
    [data.devices, filteredOrders],
  );
  const employeeRows = useMemo(
    () => buildEmployeeCodeRows(filteredOrders),
    [filteredOrders],
  );

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function updateDevice(device, action) {
    const actionLabel = action === "enable" ? "重新啟用" : action === "disable" ? "停用" : "解除綁定";
    if (action === "revoke" && !window.confirm(`確定解除「${device.label}」的綁定？原裝置憑證將立即失效。`)) return;
    const reason = window.prompt(`請輸入${actionLabel}原因（必填）`);
    if (!reason?.trim()) return;
    try {
      await manageQuickCheckoutDevice({ deviceId: device.id, action, reason: reason.trim() });
      onNotify?.(`裝置已${actionLabel}`);
      await load();
    } catch (actionError) {
      setError(actionError.message || "裝置狀態更新失敗");
    }
  }

  return (
    <section className="panel qcm-page">
      <div className="qcm-heading">
        <div>
          <h2>總部點單管理</h2>
          <p>集中查看各店裝置、員工碼及訂單紀錄；門店帳號無法進入本頁。</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? "載入中" : "重新整理"}</button>
      </div>

      <div className="qcm-filters" aria-label="點單紀錄篩選">
        <label>開始日期<input type="date" value={range.startDate} onChange={(event) => setRange({ ...range, startDate: event.target.value })} /></label>
        <label>結束日期<input type="date" value={range.endDate} onChange={(event) => setRange({ ...range, endDate: event.target.value })} /></label>
        <label>門店<select value={filters.storeCode} onChange={(event) => updateFilter("storeCode", event.target.value)}><option value="">全部門店</option>{data.stores.map((store) => <option key={store.id} value={store.store_code}>{store.store_code} {store.name}</option>)}</select></label>
        <label>員工碼<input value={filters.employeeCode} onChange={(event) => updateFilter("employeeCode", event.target.value)} placeholder="輸入員工碼" /></label>
        <label>訂單狀態<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">全部狀態</option>{Object.entries(QUICK_CHECKOUT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="primary" type="button" onClick={() => setAppliedRange(range)} disabled={!range.startDate || !range.endDate || range.startDate > range.endDate}>查詢</button>
      </div>

      {error && <div className="qcm-error" role="alert">{error}</div>}

      <div className="qcm-kpis">
        <Kpi label="已綁定門店" value={`${summary.boundStoreCount} 店`} />
        <Kpi label="裝置" value={`${summary.activeDeviceCount} / ${summary.deviceCount} 台`} hint="使用中 / 全部" />
        <Kpi label="使用員工碼" value={`${summary.employeeCodeCount} 組`} />
        <Kpi label="訂單" value={`${summary.orderCount} 筆`} />
        <Kpi label="取消或作廢" value={`${summary.exceptionCount} 筆`} tone={summary.exceptionCount ? "danger" : "normal"} />
      </div>

      <div className="qcm-tabs" role="tablist" aria-label="點單管理分類">
        <Tab active={activeTab === "devices"} onClick={() => setActiveTab("devices")}>裝置管理</Tab>
        <Tab active={activeTab === "employees"} onClick={() => setActiveTab("employees")}>員工碼紀錄</Tab>
        <Tab active={activeTab === "orders"} onClick={() => setActiveTab("orders")}>訂單明細</Tab>
      </div>

      {activeTab === "devices" && <DeviceTable rows={deviceRows} events={data.deviceEvents} onAction={updateDevice} />}
      {activeTab === "employees" && <EmployeeTable rows={employeeRows} />}
      {activeTab === "orders" && <OrderTable rows={filteredOrders} />}
    </section>
  );
}

function Kpi({ label, value, hint, tone = "normal" }) {
  return <div className={`qcm-kpi ${tone}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

function Tab({ active, onClick, children }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}>{children}</button>;
}

function DeviceTable({ rows, events, onAction }) {
  return (
    <div className="qcm-table-wrap">
      <table className="qcm-table">
        <thead><tr><th>門店</th><th>裝置</th><th>綁定時間</th><th>最後使用</th><th>狀態</th><th>訂單</th><th>員工碼</th><th>管理</th></tr></thead>
        <tbody>{rows.map((row) => {
          const latestEvent = events.find((event) => event.device_id === row.id);
          return <tr key={row.id}>
            <td data-label="門店">{row.storeCode} {row.storeName}</td>
            <td data-label="裝置"><strong>{row.label}</strong>{latestEvent && <small className="qcm-cell-note">最近異動：{latestEvent.reason}</small>}</td>
            <td data-label="綁定時間">{formatDateTime(row.createdAt)}</td>
            <td data-label="最後使用">{formatDateTime(row.lastSeenAt)}</td>
            <td data-label="狀態"><span className={`qcm-status ${row.status}`}>{DEVICE_STATUS_LABELS[row.status]}</span></td>
            <td data-label="訂單">{row.orderCount} 筆</td>
            <td data-label="員工碼">{row.employeeCodeCount} 組</td>
            <td data-label="管理"><div className="qcm-actions">{row.status === "active" ? <button type="button" onClick={() => onAction(row, "disable")}>停用</button> : <button type="button" onClick={() => onAction(row, "enable")}>啟用</button>}{row.status !== "revoked" && <button type="button" className="danger" onClick={() => onAction(row, "revoke")}>解除綁定</button>}</div></td>
          </tr>;
        })}</tbody>
      </table>
      {!rows.length && <Empty text="目前沒有符合條件的綁定裝置" />}
    </div>
  );
}

function EmployeeTable({ rows }) {
  return (
    <div className="qcm-table-wrap">
      <table className="qcm-table">
        <thead><tr><th>門店</th><th>員工碼</th><th>操作名稱</th><th>訂單</th><th>已完成</th><th>取消／作廢</th><th>營業額</th><th>最後使用</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}>
          <td data-label="門店">{row.storeCode} {row.storeName}</td><td data-label="員工碼"><strong>{row.operatorCode}</strong></td><td data-label="操作名稱">{row.operatorName || "-"}</td><td data-label="訂單">{row.orderCount}</td><td data-label="已完成">{row.completedCount}</td><td data-label="取消／作廢">{row.exceptionCount}</td><td data-label="營業額">{money(row.totalAmount)}</td><td data-label="最後使用">{formatDateTime(row.lastUsedAt)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <Empty text="查詢期間內沒有員工碼操作紀錄" />}
    </div>
  );
}

function OrderTable({ rows }) {
  return (
    <div className="qcm-table-wrap">
      <table className="qcm-table qcm-order-table">
        <thead><tr><th>時間／訂單</th><th>門店／裝置</th><th>員工碼</th><th>狀態</th><th>金額</th><th>收款／找零</th><th>品項與紀錄</th></tr></thead>
        <tbody>{rows.map((order) => <tr key={order.id}>
          <td data-label="時間／訂單">{formatDateTime(order.createdAt)}<small className="qcm-cell-note">{order.clientOrderId}</small></td>
          <td data-label="門店／裝置">{order.storeCode} {order.storeName}<small className="qcm-cell-note">{order.deviceLabel}</small></td>
          <td data-label="員工碼"><strong>{order.operatorCode || "-"}</strong><small className="qcm-cell-note">{order.operatorName}</small></td>
          <td data-label="狀態"><span className={`qcm-status ${order.status}`}>{QUICK_CHECKOUT_STATUS_LABELS[order.status] || order.status}</span></td>
          <td data-label="金額"><strong>{money(order.total)}</strong>{order.discount > 0 && <small className="qcm-cell-note">折扣 {money(order.discount)}</small>}</td>
          <td data-label="收款／找零">{order.received == null ? "-" : money(order.received)}<small className="qcm-cell-note">找零 {order.changeDue == null ? "-" : money(order.changeDue)}</small></td>
          <td data-label="品項與紀錄"><details><summary>查看品項（{order.lines.length}）</summary><div className="qcm-order-detail">{order.lines.map((line, index) => <p key={`${line.product_code}-${index}`}>{line.product_name} × {line.quantity}，{money(line.line_total)}{line.seasonings?.length ? `（${line.seasonings.join("、")}）` : ""}</p>)}{order.events.filter((event) => event.reason).map((event, index) => <p className="event" key={`${event.event_type}-${index}`}>{event.event_type}：{event.reason}</p>)}</div></details></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <Empty text="查詢期間內沒有符合條件的訂單" />}
    </div>
  );
}

function Empty({ text }) {
  return <div className="qcm-empty">{text}</div>;
}
