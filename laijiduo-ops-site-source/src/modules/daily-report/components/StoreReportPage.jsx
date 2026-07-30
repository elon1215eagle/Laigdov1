import { useEffect, useState } from "react";

import {
  fetchDailyReportChangeRequests,
  fetchDailyReportsRange,
  fetchInventoryCounts,
  fetchPreviousInventoryCounts,
  statusLabel,
  submitDailyReportChangeRequest,
} from "../../../lib/api.js";
import {
  STORE_MANAGER_REVENUE_LOOKBACK_DAYS,
  buildDailyReportChangeRequest,
  buildWeeklySameDayRows,
  deriveDailyReportAccess,
  deriveRevenueBreakdown,
  storeManagerRevenueMinDate,
  totalRevenue,
} from "../index.js";
import {
  blankInventoryProduct,
  mergeInventoryRows,
} from "../../inventory/index.js";
import {
  IncomingEditor,
  InventoryEditor,
} from "../../inventory/components/index.js";
import { StoreOperationsView } from "./StoreOperationsView.jsx";

const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
const pct = (value) => `${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;

function isBlankNumber(value) {
  return value === "" || value === null || value === undefined;
}

function numericInputValue(value) {
  return isBlankNumber(value) ? "" : value;
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

function hasSubmittedReport(report) {
  return Boolean(report?.id && report?.updated_at_label !== "尚未回報");
}

function tone(status) {
  if (status === "approved") return "good";
  if (status === "submitted") return "warn";
  return "bad";
}

function RevenueInput({ label, helper, value, onChange, disabled = false }) {
  return (
    <label className="input-card">
      <span>{label}<small>{helper}</small></span>
      <input
        type="number"
        inputMode="decimal"
        value={numericInputValue(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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

function Metric({ label, value, detail, tone: metricTone = "neutral" }) {
  return (
    <div className={`metric ${metricTone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function initialForm(report) {
  const submitted = hasSubmittedReport(report);
  return {
    opened_to_1400_revenue: submitted ? report.opened_to_1400_revenue : "",
    revenue_1400_to_1900: submitted ? report.revenue_1400_to_1900 : "",
    full_day_revenue: submitted ? totalRevenue(report) : "",
    cash_difference: submitted ? (report.cash_difference ?? "") : "",
    manager_note: report.manager_note || "",
  };
}

export function StoreReportPage({
  report,
  reportDate,
  products,
  currentRole,
  today,
  onDateChange,
  onSave,
}) {
  const [tab, setTab] = useState("sales");
  const [dateDraft, setDateDraft] = useState(reportDate || today);
  const [authCode, setAuthCode] = useState("");
  const [operationsRows, setOperationsRows] = useState([]);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [form, setForm] = useState(() => initialForm(report));
  const [inventory, setInventory] = useState(() => products.map(blankInventoryProduct));
  const [saving, setSaving] = useState(false);
  const [changeRequests, setChangeRequests] = useState([]);
  const [changeReason, setChangeReason] = useState("");
  const [requestingChange, setRequestingChange] = useState(false);
  const [requestError, setRequestError] = useState("");

  const revenueBreakdown = deriveRevenueBreakdown(form);
  const computedCloseRevenue = revenueBreakdown.revenue1900ToClose;
  const currentTotal = revenueBreakdown.fullDayRevenue;
  const revenueInvalid = !revenueBreakdown.isValid;
  const completedSteps = revenueBreakdown.completedSteps;
  const isStoreManagerView = currentRole === "store_manager";
  const workflowAccess = deriveDailyReportAccess({
    roleName: currentRole,
    reportStatus: report.status,
    reportId: report.id,
    changeRequests,
  });
  const minReportDate = isStoreManagerView ? storeManagerRevenueMinDate(today) : "";
  const target = Math.max(1, Number(report.target || 0));
  const salesSteps = [
    ["1", "14:00", "開店至 14:00 營收", form.opened_to_1400_revenue],
    ["2", "19:00", "14:00 至 19:00 營收", form.revenue_1400_to_1900],
    ["3", "全日", "打烊後填寫全日總營收", form.full_day_revenue],
  ];

  useEffect(() => {
    setDateDraft(reportDate || today);
    setAuthCode("");
    setForm(initialForm(report));
  }, [report, reportDate, today]);

  useEffect(() => {
    let active = true;
    async function loadInventory() {
      try {
        const [savedRows, previousRows] = await Promise.all([
          fetchInventoryCounts(report.id),
          fetchPreviousInventoryCounts(report.store_id, reportDate),
        ]);
        if (active) setInventory(mergeInventoryRows(products, savedRows, previousRows));
      } catch {
        if (active) setInventory(products.map(blankInventoryProduct));
      }
    }
    loadInventory();
    return () => {
      active = false;
    };
  }, [products, report.id, report.store_id, reportDate]);

  useEffect(() => {
    let active = true;
    async function loadOperationsRows() {
      const range = getWeekRange(reportDate || today);
      const requestedStart = addDays(range.start, -7);
      const accessStart = isStoreManagerView
        ? storeManagerRevenueMinDate(today)
        : requestedStart;
      const accessEnd = isStoreManagerView ? today : range.end;
      setOperationsLoading(true);
      try {
        const rows = await fetchDailyReportsRange(
          requestedStart < accessStart ? accessStart : requestedStart,
          range.end > accessEnd ? accessEnd : range.end,
        );
        if (!active) return;
        const storeCode = report.store_code || report.store_id;
        const scopedRows = rows.filter(
          (row) => (row.store_code || row.store_id) === storeCode,
        );
        setOperationsRows(buildWeeklySameDayRows(scopedRows, reportDate || today));
      } catch {
        if (active) setOperationsRows([]);
      } finally {
        if (active) setOperationsLoading(false);
      }
    }
    loadOperationsRows();
    return () => {
      active = false;
    };
  }, [isStoreManagerView, report, reportDate, today]);

  useEffect(() => {
    let active = true;
    async function loadChangeRequests() {
      try {
        const rows = await fetchDailyReportChangeRequests(report.id ? [report.id] : []);
        if (active) setChangeRequests(rows);
      } catch {
        if (active) setChangeRequests([]);
      }
    }
    loadChangeRequests();
    return () => {
      active = false;
    };
  }, [report.id, report.status]);

  async function submit() {
    if (!workflowAccess.canEdit) return;
    setSaving(true);
    await onSave(form, inventory);
    setSaving(false);
  }

  async function requestChange() {
    setRequestingChange(true);
    setRequestError("");
    try {
      const payload = buildDailyReportChangeRequest({
        reportId: report.id,
        storeId: report.store_id,
        reason: changeReason,
      });
      const saved = await submitDailyReportChangeRequest(payload);
      setChangeRequests((rows) => [saved, ...rows]);
      setChangeReason("");
    } catch (error) {
      setRequestError(error.message || "修改申請送出失敗");
    } finally {
      setRequestingChange(false);
    }
  }

  async function applyReportDate() {
    const ok = await onDateChange(dateDraft, authCode);
    if (ok) setAuthCode("");
  }

  const isPastDateDraft = dateDraft < today;
  const hasInventoryInput = inventory.some(
    (row) => (
      !isBlankNumber(row.current_stock)
      || !isBlankNumber(row.current_stock_boxes)
      || !isBlankNumber(row.current_stock_packs)
    ),
  );

  return (
    <div className="workspace mobile-layout">
      <section className="phone-shell">
        <div className="phone-header">
          <div>
            <p>{report.name}</p>
            <h2>每日營運回報</h2>
          </div>
          <span className={`chip ${tone(report.status)}`}>{statusLabel(report.status)}</span>
        </div>

        <div className="report-date-card">
          <label>
            回報日期
            <input
              type="date"
              min={minReportDate}
              max={today}
              value={dateDraft}
              onChange={(event) => setDateDraft(event.target.value)}
            />
          </label>
          {isPastDateDraft && (
            <label>
              修改授權碼
              <input
                type="password"
                inputMode="numeric"
                placeholder="請輸入授權碼"
                value={authCode}
                onChange={(event) => setAuthCode(event.target.value)}
              />
            </label>
          )}
          <button
            type="button"
            onClick={applyReportDate}
            disabled={dateDraft === reportDate || (isPastDateDraft && authCode !== "8599")}
          >
            {isPastDateDraft ? "確認修改日期" : "載入日期"}
          </button>
        </div>

        <div className="alert-line">
          店長只需輸入 14:00、19:00 與全日總營收，系統自動計算 19:00 至打烊。
        </div>
        {isStoreManagerView && (
          <div className="alert-line warn">
            店長帳號僅開放最近 {STORE_MANAGER_REVENUE_LOOKBACK_DAYS} 天營收資料；完整歷史由總部查詢。
          </div>
        )}
        {reportDate < today && (
          <div className="alert-line warn">目前正在修改歷史營業日 {reportDate}。</div>
        )}
        {workflowAccess.isLocked && (
          <div className="alert-line warn">
            此回報已由總部確認鎖定。如需修改，請填寫原因並送出修改申請。
          </div>
        )}
        {workflowAccess.changeRequest?.status === "pending" && (
          <div className="alert-line warn">修改申請已送出，等待總部核准。</div>
        )}
        {requestError && <div className="alert-line danger">{requestError}</div>}
        {revenueInvalid && (
          <div className="alert-line danger">
            全日總營收不可小於 14:00 與 19:00 兩段營收合計。
          </div>
        )}

        <div className="store-today-panel">
          <div>
            <span>今日完成進度</span>
            <strong>{completedSteps}/3 個營收節點</strong>
            <p>完成營收、庫存、進貨及現金差異後即可送出。</p>
          </div>
          <div className="store-action-chips">
            <span className={completedSteps >= 3 ? "done" : ""}>營收</span>
            <span className={hasInventoryInput ? "done" : ""}>庫存</span>
            <span className={!isBlankNumber(form.cash_difference) ? "done" : ""}>現金</span>
          </div>
        </div>

        <div className="segments">
          <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}>營收</button>
          <button className={tab === "ops" ? "active" : ""} onClick={() => setTab("ops")}>門店營運視圖</button>
          <button className={tab === "inventory" ? "active" : ""} onClick={() => setTab("inventory")}>庫存</button>
          <button className={tab === "incoming" ? "active" : ""} onClick={() => setTab("incoming")}>進貨</button>
        </div>

        {tab === "sales" ? (
          <div className="mobile-stack">
            <div className="step-strip">
              {salesSteps.map(([step, title, detail, value]) => (
                <div className={!isBlankNumber(value) ? "done" : ""} key={title}>
                  <span>{step}</span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </div>
              ))}
            </div>
            <RevenueInput disabled={!workflowAccess.canEdit} label="14:00" helper="開店至 14:00" value={form.opened_to_1400_revenue} onChange={(value) => setForm({ ...form, opened_to_1400_revenue: value })} />
            <RevenueInput disabled={!workflowAccess.canEdit} label="19:00" helper="14:00 至 19:00" value={form.revenue_1400_to_1900} onChange={(value) => setForm({ ...form, revenue_1400_to_1900: value })} />
            <RevenueInput disabled={!workflowAccess.canEdit} label="全日總營收" helper="打烊後的全日總額" value={form.full_day_revenue} onChange={(value) => setForm({ ...form, full_day_revenue: value })} />
            <div className="input-card calculated-card">
              <span>19:00 至打烊<small>全日總營收 - 14:00 - 19:00</small></span>
              <strong>{money(computedCloseRevenue)}</strong>
            </div>
            <RevenueInput disabled={!workflowAccess.canEdit} label="現金差異" helper="沒有差異請填 0" value={form.cash_difference} onChange={(value) => setForm({ ...form, cash_difference: value })} />
            <label className="note-box">
              <span>店長備註</span>
              <textarea disabled={!workflowAccess.canEdit} value={form.manager_note} onChange={(event) => setForm({ ...form, manager_note: event.target.value })} />
            </label>
            <div className="target-card">
              <span>今日總營收</span>
              <strong>{money(currentTotal)}</strong>
              <Progress value={(currentTotal / target) * 100} />
              <p>今日目標 {money(report.target)}</p>
            </div>
          </div>
        ) : tab === "ops" ? (
          <StoreOperationsView rows={operationsRows} loading={operationsLoading} />
        ) : tab === "inventory" ? (
          <InventoryEditor rows={inventory} onChange={setInventory} disabled={!workflowAccess.canEdit} />
        ) : (
          <IncomingEditor rows={inventory} onChange={setInventory} disabled={!workflowAccess.canEdit} />
        )}

        {tab !== "ops" && (
          <button className="submit-button" disabled={saving || revenueInvalid || !workflowAccess.canSubmit} onClick={submit}>
            {saving ? "送出中..." : "送出每日營運回報"}
          </button>
        )}
        {workflowAccess.canRequestChange && (
          <div className="change-request-box">
            <label className="note-box">
              <span>修改申請原因</span>
              <textarea
                placeholder="請說明需要修改的資料及原因"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
              />
            </label>
            <button type="button" disabled={requestingChange || changeReason.trim().length < 3} onClick={requestChange}>
              {requestingChange ? "送出中..." : "送出修改申請"}
            </button>
          </div>
        )}
      </section>

      <section className="panel companion">
        <div className="panel-head"><h2>門店摘要</h2><p>{report.manager_name}</p></div>
        <Metric label="今日總營收" value={money(currentTotal)} detail={`目標 ${money(report.target)}`} tone="hot" />
        <Metric
          label="達成率"
          value={pct((currentTotal / target) * 100)}
          detail="依今日營收目標計算"
          tone={currentTotal >= Number(report.target || 0) ? "good" : "warn"}
        />
      </section>
    </div>
  );
}
