import React from "react";
import { createRoot } from "react-dom/client";

import "../../src/styles.css";

window.fetch = () => Promise.resolve(new Response("[]", {
  status: 200,
  headers: { "Content-Type": "application/json" },
}));

const { HqRevenueUsageSummary, RoleHomePanel, Sidebar, TopBar } = await import("../../src/App.jsx");

const stores = [
  { id: "S01", store_id: "S01", store_code: "S01", name: "鳳山五甲店", area: "南區", target: 65000 },
  { id: "S02", store_id: "S02", store_code: "S02", name: "鳳山凱旋店", area: "南區", target: 36000 },
  { id: "S03", store_id: "S03", store_code: "S03", name: "鳳山武廟店", area: "南區", target: 42000 },
];
const profile = { role: "coo", full_name: "營運長" };
const summary = {
  periodLabel: "昨日",
  referenceDate: "2026-10-05",
  dataReady: true,
  total: 286430,
  target: 330000,
  attainmentRate: 86.8,
  reportRate: 81.8,
  reportedRows: Array.from({ length: 9 }),
  shortageRows: [{ storeCode: "S08", storeName: "三民義華店", note: "晚峰尚缺 1 人" }],
  activeStaff: Array.from({ length: 42 }),
  overdueReports: [{ store_id: "S03", name: "鳳山武廟店", report_date: "2026-10-05" }],
  unreported: [],
  handoverIssues: [],
  lowRevenue: [],
  ranking: [
    { store_id: "S01", name: "鳳山五甲店", attainment: 112 },
    { store_id: "S02", name: "鳳山凱旋店", attainment: 98 },
    { store_id: "S03", name: "鳳山武廟店", attainment: 91 },
  ],
  cashIssues: [],
  riskRows: [],
  overdueTasks: [],
  pendingHr: [],
  managerGaps: [],
};

createRoot(document.getElementById("root")).render(
  <div className="app hq-app">
    <Sidebar
      role="hq"
      profile={profile}
      profileRole="coo"
      stores={stores}
      selectedStoreId="S01"
      activeModule="ops"
      setActiveModule={() => {}}
      setRole={() => {}}
      setSelectedStoreId={() => {}}
      onInspection={() => {}}
      onSignOut={() => {}}
    />
    <main className="content">
      <TopBar
        activeModule="ops"
        reportDate="2026-10-06"
        role="hq"
        profileRole="coo"
        report={stores[0]}
        onSync={() => {}}
        onExport={() => {}}
      />
      <div className="workspace hq-grid">
        <RoleHomePanel
          roleName="coo"
          summary={summary}
          reports={stores}
          anomalyRows={[]}
          securitySettings={{ is_fault_mode: false }}
          onSelect={() => {}}
          onOpenModule={() => {}}
        />
        <HqRevenueUsageSummary
          revenueSummary={{ daily: 286430, week: 1579840, month: 6257600 }}
          usageSummary={{ daily: 328, week: 1896, month: 7420 }}
          weekRange={{ start: "2026-10-05", end: "2026-10-11" }}
          monthRange={{ start: "2026-10-01", end: "2026-10-31" }}
        />
        {["每日營收情況", "營運視圖", "本月營業額目標設定", "各門店回報紀錄"].map((title) => (
          <details className="panel wide dashboard-disclosure" key={title}>
            <summary className="dashboard-disclosure-summary">
              <div><h2>{title}</h2><p>點擊查看詳細資料</p></div>
              <span className="dashboard-disclosure-hint">查看明細</span>
            </summary>
          </details>
        ))}
      </div>
    </main>
  </div>,
);
