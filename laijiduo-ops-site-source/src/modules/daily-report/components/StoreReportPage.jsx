import { useEffect, useState } from "react";

import {
  fetchDailyReportChangeRequests,
  fetchDailyReportEmployeeMeals,
  fetchDailyReportWasteItems,
  fetchDailyReportsRange,
  fetchDailyStaffShifts,
  fetchInventoryCounts,
  fetchMonthlyLeavePlans,
  fetchPreviousInventoryCounts,
  statusLabel,
  submitDailyReportChangeRequest,
} from "../../../lib/api.js";
import {
  STORE_MANAGER_REVENUE_LOOKBACK_DAYS,
  buildDailyReportChangeRequest,
  calculateScheduledHeadcount,
  createEmployeeMealRows,
  deriveDailyReportAccess,
  deriveRevenueBreakdown,
  normalizeWasteItems,
  normalizeEmployeeMealItems,
  storeManagerRevenueMinDate,
  totalRevenue,
} from "../index.js";
import {
  blankInventoryProduct,
  defaultUnitForProduct,
  mergeInventoryRows,
} from "../../inventory/index.js";
import {
  IncomingEditor,
  InventoryEditor,
} from "../../inventory/components/index.js";
import { StoreOperationsView } from "./StoreOperationsView.jsx";
import { EmployeeMealEditor } from "./EmployeeMealEditor.jsx";

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
    delivery_revenue: submitted ? (report.delivery_revenue ?? "") : "",
    actual_staff_count: submitted ? (report.actual_staff_count ?? "") : "",
    staffing_variance_reason: report.staffing_variance_reason || "",
    customer_complaint_count: submitted ? (report.customer_complaint_count ?? 0) : 0,
    customer_complaint_detail: report.customer_complaint_detail || "",
    equipment_issue: Boolean(report.equipment_issue),
    equipment_issue_detail: report.equipment_issue_detail || "",
    special_event: report.special_event || "",
    manager_note: report.manager_note || "",
  };
}

export function StoreReportPage({
  report,
  reportDate,
  products,
  currentRole,
  staffRoster,
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
  const [inventory, setInventory] = useState(() => products.map((product) => blankInventoryProduct(product, {
    storeCode: report.store_code || "",
    reportDate,
  })));
  const [saving, setSaving] = useState(false);
  const [changeRequests, setChangeRequests] = useState([]);
  const [changeReason, setChangeReason] = useState("");
  const [requestingChange, setRequestingChange] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [scheduledHeadcount, setScheduledHeadcount] = useState(Number(report.scheduled_staff_count || 0));
  const [wasteItems, setWasteItems] = useState([]);
  const [employeeMealItems, setEmployeeMealItems] = useState(() => createEmployeeMealRows());

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
        if (active) setInventory(mergeInventoryRows(products, savedRows, previousRows, {
          storeCode: report.store_code || "",
          reportDate,
        }));
      } catch {
        if (active) setInventory(products.map((product) => blankInventoryProduct(product, {
          storeCode: report.store_code || "",
          reportDate,
        })));
      }
    }
    loadInventory();
    return () => {
      active = false;
    };
  }, [products, report.id, report.store_code, report.store_id, reportDate]);

  useEffect(() => {
    let active = true;
    async function loadOperationsRows() {
      const range = getWeekRange(today);
      const monthStart = `${today.slice(0, 7)}-01`;
      const comparisonStart = addDays(range.start, -7);
      const requestedStart = comparisonStart < monthStart ? comparisonStart : monthStart;
      setOperationsLoading(true);
      try {
        const rows = await fetchDailyReportsRange(requestedStart, today);
        if (!active) return;
        const storeCode = report.store_code || report.store_id;
        const scopedRows = rows.filter(
          (row) => (row.store_code || row.store_id) === storeCode,
        );
        setOperationsRows(scopedRows);
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
  }, [report.store_code, report.store_id, today]);

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

  useEffect(() => {
    let active = true;
    async function loadOperationalDetails() {
      try {
        const periodMonth = String(reportDate || today).slice(0, 7);
        const [leavePlans, shifts, savedWaste, savedEmployeeMeals] = await Promise.all([
          fetchMonthlyLeavePlans(periodMonth).catch(() => []),
          fetchDailyStaffShifts(periodMonth).catch(() => []),
          fetchDailyReportWasteItems(report.id).catch(() => []),
          fetchDailyReportEmployeeMeals(report.id).catch(() => []),
        ]);
        if (!active) return;
        const headcount = calculateScheduledHeadcount({
          staff: staffRoster,
          leavePlans,
          shifts,
          storeCode: report.store_code,
          storeCodes: report.sourceCodes || [],
          storeName: report.name,
          reportDate,
        });
        setScheduledHeadcount(headcount);
        setForm((current) => ({
          ...current,
          actual_staff_count: current.actual_staff_count === "" ? headcount : current.actual_staff_count,
        }));
        setWasteItems(savedWaste);
        setEmployeeMealItems(createEmployeeMealRows(savedEmployeeMeals));
      } catch {
        if (!active) return;
        const fallbackHeadcount = Number(report.scheduled_staff_count || 0);
        setScheduledHeadcount(fallbackHeadcount);
        setForm((current) => ({
          ...current,
          actual_staff_count: current.actual_staff_count === "" ? fallbackHeadcount : current.actual_staff_count,
        }));
        setWasteItems([]);
        setEmployeeMealItems(createEmployeeMealRows());
      }
    }
    loadOperationalDetails();
    return () => {
      active = false;
    };
  }, [report.id, report.scheduled_staff_count, report.store_code, reportDate, staffRoster, today]);

  async function submit() {
    if (!workflowAccess.canEdit) return;
    setSaving(true);
    await onSave(
      form,
      inventory,
      normalizeWasteItems(wasteItems),
      scheduledHeadcount,
      normalizeEmployeeMealItems(employeeMealItems),
    );
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
  const staffingDiffers = Number(form.actual_staff_count || 0) !== scheduledHeadcount;

  function addWasteItem() {
    setWasteItems((rows) => [
      ...rows,
      {
        id: `draft-${Date.now()}`,
        product_id: products[0]?.id || null,
        item_name: products[0]?.name || "",
        quantity: "",
        unit: defaultUnitForProduct(products[0]?.name),
        reason: "",
      },
    ]);
  }

  function updateWasteItem(index, patch) {
    setWasteItems((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )));
  }

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
            每日回報修改僅開放最近 {STORE_MANAGER_REVENUE_LOOKBACK_DAYS} 天；門店營運視圖可查看本月完整營收。
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
          <button className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>營運補充</button>
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
        ) : tab === "details" ? (
          <div className="mobile-stack operational-details">
            <RevenueInput
              disabled={!workflowAccess.canEdit}
              label="外送總營收"
              helper="已包含在全日總營收，不重複加總"
              value={form.delivery_revenue}
              onChange={(value) => setForm({ ...form, delivery_revenue: value })}
            />
            <div className="staffing-report-grid">
              <div className="input-card calculated-card">
                <span>班表預計人數<small>人資主檔、排假及支援班次自動計算</small></span>
                <strong>{scheduledHeadcount} 人</strong>
              </div>
              <RevenueInput
                disabled={!workflowAccess.canEdit}
                label="實際上班人數"
                helper="如與班表不同，請填寫原因"
                value={form.actual_staff_count}
                onChange={(value) => setForm({ ...form, actual_staff_count: value })}
              />
            </div>
            {staffingDiffers && (
              <label className="note-box">
                <span>人數差異原因</span>
                <textarea
                  disabled={!workflowAccess.canEdit}
                  value={form.staffing_variance_reason}
                  onChange={(event) => setForm({ ...form, staffing_variance_reason: event.target.value })}
                />
              </label>
            )}

            <EmployeeMealEditor
              rows={employeeMealItems}
              onChange={setEmployeeMealItems}
              disabled={!workflowAccess.canEdit}
            />

            <section className="waste-editor">
              <div className="panel-head">
                <div>
                  <h3>報廢／耗損</h3>
                  <p>沒有報廢可不填；品項可選庫存清單或其他。</p>
                </div>
                <button type="button" disabled={!workflowAccess.canEdit} onClick={addWasteItem}>新增品項</button>
              </div>
              {wasteItems.map((item, index) => (
                <div className="waste-row" key={item.id || index}>
                  <label>
                    <span>品項</span>
                    <select
                      disabled={!workflowAccess.canEdit}
                      value={item.product_id || "other"}
                      onChange={(event) => {
                        const product = products.find((row) => row.id === event.target.value);
                        updateWasteItem(index, product ? {
                          product_id: product.id,
                          item_name: product.name,
                          unit: defaultUnitForProduct(product.name),
                        } : {
                          product_id: null,
                          item_name: "",
                          unit: "",
                        });
                      }}
                    >
                      {products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
                      <option value="other">其他</option>
                    </select>
                  </label>
                  {!item.product_id && (
                    <label>
                      <span>自填品項</span>
                      <input disabled={!workflowAccess.canEdit} value={item.item_name || ""} onChange={(event) => updateWasteItem(index, { item_name: event.target.value })} />
                    </label>
                  )}
                  <label>
                    <span>數量</span>
                    <input type="number" step="0.01" inputMode="decimal" disabled={!workflowAccess.canEdit} value={numericInputValue(item.quantity)} onChange={(event) => updateWasteItem(index, { quantity: event.target.value })} />
                  </label>
                  <label>
                    <span>單位</span>
                    <input disabled={!workflowAccess.canEdit} value={item.unit || ""} onChange={(event) => updateWasteItem(index, { unit: event.target.value })} />
                  </label>
                  <label className="wide-field">
                    <span>原因</span>
                    <input disabled={!workflowAccess.canEdit} value={item.reason || ""} onChange={(event) => updateWasteItem(index, { reason: event.target.value })} />
                  </label>
                  <button type="button" disabled={!workflowAccess.canEdit} onClick={() => setWasteItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>移除</button>
                </div>
              ))}
            </section>

            <RevenueInput
              disabled={!workflowAccess.canEdit}
              label="客訴件數"
              helper="沒有客訴請填 0"
              value={form.customer_complaint_count}
              onChange={(value) => setForm({ ...form, customer_complaint_count: value })}
            />
            {Number(form.customer_complaint_count || 0) > 0 && (
              <label className="note-box">
                <span>客訴內容</span>
                <textarea disabled={!workflowAccess.canEdit} value={form.customer_complaint_detail} onChange={(event) => setForm({ ...form, customer_complaint_detail: event.target.value })} />
              </label>
            )}
            <label className="binary-field">
              <input type="checkbox" disabled={!workflowAccess.canEdit} checked={form.equipment_issue} onChange={(event) => setForm({ ...form, equipment_issue: event.target.checked })} />
              <span>今日有設備異常</span>
            </label>
            {form.equipment_issue && (
              <label className="note-box">
                <span>設備異常內容</span>
                <textarea disabled={!workflowAccess.canEdit} value={form.equipment_issue_detail} onChange={(event) => setForm({ ...form, equipment_issue_detail: event.target.value })} />
              </label>
            )}
            <label className="note-box">
              <span>今日特殊事件</span>
              <textarea disabled={!workflowAccess.canEdit} placeholder="例如臨時大單、停電、道路施工；沒有可留白" value={form.special_event} onChange={(event) => setForm({ ...form, special_event: event.target.value })} />
            </label>
          </div>
        ) : tab === "ops" ? (
          <StoreOperationsView
            reports={operationsRows}
            loading={operationsLoading}
            referenceDate={today}
            dailyTarget={report.target}
            monthlyTarget={report.target_monthly_revenue}
          />
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
