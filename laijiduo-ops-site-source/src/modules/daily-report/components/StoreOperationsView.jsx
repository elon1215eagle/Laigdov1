import { useMemo, useState } from "react";

import { buildStoreOperationsModel, buildWeeklySameDayRows } from "../index.js";

const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
const pct = (value) => `${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;

function attainmentClass(value) {
  if (Number(value || 0) >= 100) return "attainment-hit";
  if (Number(value || 0) >= 70) return "attainment-near";
  return "attainment-low";
}

function dateLabel(dateText) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateText}T00:00:00Z`));
}

function AttainmentBadge({ value }) {
  return <strong className={`store-attainment ${attainmentClass(value)}`}>{pct(value)}</strong>;
}

function AccordionSection({ sectionKey, title, summary, openSection, onToggle, children }) {
  const open = openSection === sectionKey;
  return (
    <section className={`store-ops-section ${open ? "open" : ""}`}>
      <button
        className="store-ops-section-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(open ? "" : sectionKey)}
      >
        <span><strong>{title}</strong><small>{summary}</small></span>
        <i aria-hidden="true" />
      </button>
      {open && <div className="store-ops-section-body">{children}</div>}
    </section>
  );
}

export function StoreOperationsView({
  reports = [],
  loading,
  referenceDate,
  dailyTarget = 0,
  monthlyTarget = 0,
}) {
  const [openSection, setOpenSection] = useState("target");
  const model = useMemo(() => buildStoreOperationsModel({
    reports,
    referenceDate,
    dailyTarget,
    monthlyTarget,
  }), [reports, referenceDate, dailyTarget, monthlyTarget]);
  const weeklyRows = useMemo(
    () => buildWeeklySameDayRows(reports, referenceDate).filter((row) => row.currentTotal || row.previousTotal),
    [reports, referenceDate],
  );

  if (loading) return <div className="empty-text">門店營運資料讀取中...</div>;

  const yesterdayTotal = model.yesterday?.total || 0;
  const yesterdayAttainment = model.yesterday?.attainment || 0;

  return (
    <div className="store-operations-view">
      <div className="store-ops-kpis">
        <div><span>昨日總營收</span><strong>{money(yesterdayTotal)}</strong><small>{model.yesterday ? dateLabel(model.yesterday.date) : "昨日無資料"}</small></div>
        <div><span>昨日達成率</span><AttainmentBadge value={yesterdayAttainment} /><small>每日目標 {money(model.dailyTarget)}</small></div>
        <div><span>本月累計營收</span><strong>{money(model.monthTotal)}</strong><small>{model.month.replace("-", "年")}月</small></div>
        <div><span>本月累計達成率</span><AttainmentBadge value={model.monthAttainment} /><small>月目標 {money(model.monthlyTarget)}</small></div>
      </div>

      <AccordionSection
        sectionKey="target"
        title="本月目標進度"
        summary={`本月達成 ${pct(model.monthAttainment)}`}
        openSection={openSection}
        onToggle={setOpenSection}
      >
        <div className="store-target-progress">
          <div><span>本月目標</span><strong>{money(model.monthlyTarget)}</strong></div>
          <div><span>本月累計</span><strong>{money(model.monthTotal)}</strong></div>
          <div><span>尚差金額</span><strong>{money(model.remainingAmount)}</strong></div>
          <div><span>剩餘日數</span><strong>{model.remainingDays} 天</strong></div>
          <div className="wide"><span>達標所需每日平均</span><strong>{money(model.requiredDailyAverage)}</strong></div>
        </div>
      </AccordionSection>

      <AccordionSection
        sectionKey="weekly"
        title="週業績對比"
        summary="本週與上週同日"
        openSection={openSection}
        onToggle={setOpenSection}
      >
        <div className="store-week-list">
          {weeklyRows.map((row) => (
            <details className="store-comparison-row" key={`${row.storeCode}-${row.currentDate}`}>
              <summary>
                <span><strong>{row.weekday}</strong><small>{row.currentDate}</small></span>
                <span><strong>{money(row.currentTotal)}</strong><small className={row.delta < 0 ? "negative" : row.delta > 0 ? "positive" : ""}>{row.delta > 0 ? "+" : ""}{pct(row.growth)}</small></span>
              </summary>
              <div className="store-period-grid">
                <span>時段</span><span>本週</span><span>上週</span>
                <strong>14:00</strong><em>{money(row.current?.opened_to_1400_revenue)}</em><em>{money(row.previous?.opened_to_1400_revenue)}</em>
                <strong>19:00</strong><em>{money(row.current?.revenue_1400_to_1900)}</em><em>{money(row.previous?.revenue_1400_to_1900)}</em>
                <strong>打烊</strong><em>{money(row.current?.revenue_1900_to_close)}</em><em>{money(row.previous?.revenue_1900_to_close)}</em>
                <strong>全日</strong><em>{money(row.currentTotal)}</em><em>{money(row.previousTotal)}</em>
              </div>
            </details>
          ))}
          {!weeklyRows.length && <div className="empty-text">目前沒有可比較的週營收。</div>}
        </div>
      </AccordionSection>

      <AccordionSection
        sectionKey="daily"
        title="本月每日營收"
        summary={`${model.month.replace("-", "/")} 1日至月底`}
        openSection={openSection}
        onToggle={setOpenSection}
      >
        <div className="store-month-list">
          {model.dailyRows.map((row) => (
            <details className={`store-day-row ${row.state}`} key={row.date}>
              <summary>
                <span><strong>{dateLabel(row.date)}</strong><small>{row.state === "future" ? "尚未發生" : row.state === "missing" ? "未回報" : row.state === "incomplete" ? "尚未完成" : "已回報"}</small></span>
                <span><strong>{row.state === "future" ? "-" : money(row.total)}</strong>{row.state !== "future" && <AttainmentBadge value={row.attainment} />}</span>
              </summary>
              {row.state !== "future" && (
                <div className="store-day-detail">
                  <div><span>14:00</span><strong>{money(row.report?.opened_to_1400_revenue)}</strong></div>
                  <div><span>19:00</span><strong>{money(row.report?.revenue_1400_to_1900)}</strong></div>
                  <div><span>打烊</span><strong>{money(row.report?.revenue_1900_to_close)}</strong></div>
                  <div><span>每日目標</span><strong>{money(row.target)}</strong></div>
                </div>
              )}
            </details>
          ))}
        </div>
      </AccordionSection>
    </div>
  );
}
