import React from "react";
import { createRoot } from "react-dom/client";

import "../../src/styles.css";

window.fetch = () => Promise.resolve(new Response("[]", {
  status: 200,
  headers: { "Content-Type": "application/json" },
}));

const { HqRevenueUsageSummary, RoleHomePanel } = await import("../../src/App.jsx");

const reports = [
  { store_id: "s01", name: "鳳山五甲店", target: 65000 },
  { store_id: "s02", name: "鳳山凱旋店", target: 36000 },
  { store_id: "s03", name: "鳳山武廟店", target: 42000 },
];

const summary = {
  periodLabel: "昨日",
  referenceDate: "2026-10-05",
  dataReady: true,
  total: 286430,
  target: 330000,
  attainmentRate: 86.8,
  reportRate: 81.8,
  reportedRows: Array.from({ length: 9 }),
  shortageRows: [{ storeCode: "S08", storeName: "三民義華店", note: "晚峰時段尚缺 1 人" }],
  activeStaff: Array.from({ length: 42 }),
  overdueReports: [{ store_id: "s03", name: "鳳山武廟店", report_date: "2026-09-30" }],
  unreported: [],
  handoverIssues: [{ id: "h1" }, { id: "h2" }],
  lowRevenue: [{ store_id: "s02", name: "鳳山凱旋店", target: 36000, opened_to_1400_revenue: 5200, revenue_1400_to_1900: 9800, revenue_1900_to_close: 6100 }],
  ranking: [
    { store_id: "s01", name: "鳳山五甲店", attainment: 112 },
    { store_id: "s09", name: "三民鼎山店", attainment: 104 },
    { store_id: "s05", name: "前鎮隆興店", attainment: 98 },
    { store_id: "s08", name: "三民義華店", attainment: 91 },
    { store_id: "s02", name: "鳳山凱旋店", attainment: 78 },
    { store_id: "s03", name: "鳳山武廟店", attainment: 64 },
  ],
  cashIssues: [],
  riskRows: [],
  overdueTasks: [],
  pendingHr: [],
  managerGaps: [],
};

createRoot(document.getElementById("root")).render(
  <main className="workspace hq-grid" style={{ padding: 16 }}>
    <RoleHomePanel
      roleName="coo"
      summary={summary}
      reports={reports}
      anomalyRows={[]}
      securitySettings={{ is_fault_mode: false }}
      onSelect={() => {}}
      onOpenModule={() => {}}
    />
    <HqRevenueUsageSummary
      revenueSummary={{ daily: 286430, week: 1579840, month: 6257600 }}
      usageSummary={{ daily: 328, week: 1896, month: 7420 }}
      weekRange={{ start: "2026-09-28", end: "2026-10-04" }}
      monthRange={{ start: "2026-10-01", end: "2026-10-31" }}
    />
    {[
      ["每日營收情況", "各店每日營收、達成率、庫存與回報狀態。"],
      ["營運視圖", "各店本週同星期對比上週同星期，快速看出成長與下滑。"],
      ["本月營業額目標設定", "檢視各店目標與每日達成狀況。"],
      ["各門店回報紀錄", "依月份、門店與狀態查詢歷史回報。"],
    ].map(([title, copy]) => (
      <details className="panel wide dashboard-disclosure" key={title}>
        <summary className="dashboard-disclosure-summary">
          <div><h2>{title}</h2><p>{copy}</p></div>
          <span className="dashboard-disclosure-hint">查看明細</span>
        </summary>
      </details>
    ))}
  </main>,
);
