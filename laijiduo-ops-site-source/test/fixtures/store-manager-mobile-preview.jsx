import React from "react";
import { createRoot } from "react-dom/client";

import "../../src/styles.css";

const nativeFetch = window.fetch.bind(window);
window.fetch = (url, options) => {
  const target = new URL(typeof url === "string" ? url : url.url, location.href);
  if (target.origin === location.origin) return nativeFetch(url, options);
  return Promise.resolve(new Response("[]", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
};

const { Sidebar, TopBar } = await import("../../src/App.jsx");
const { StoreReportPage } = await import("../../src/modules/daily-report/components/StoreReportPage.jsx");
const { productsSeed } = await import("../../src/lib/mockData.js");

const store = { id: "S05", store_id: "S05", store_code: "S05", name: "前鎮隆興店", area: "南區" };
const profile = { role: "store_manager", store_code: "S05", full_name: "S05 門店分帳號" };
const report = {
  ...store,
  status: "draft",
  report_date: "2026-10-03",
  target: 45000,
  target_monthly_revenue: 1395000,
  scheduled_staff_count: 3,
};

createRoot(document.getElementById("root")).render(
  <div className="app store-manager-app">
    <Sidebar
      role="store"
      profile={profile}
      profileRole="store_manager"
      stores={[store]}
      selectedStoreId="S05"
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
        reportDate="2026-10-03"
        role="store"
        profileRole="store_manager"
        report={report}
        onSync={() => {}}
        onExport={() => {}}
      />
      <StoreReportPage
        report={report}
        storeCode="S05"
        reportDate="2026-10-03"
        products={productsSeed}
        currentRole="store_manager"
        staffRoster={[]}
        today="2026-10-03"
        reportClock={{ calendarDate: "2026-10-03", businessDate: "2026-10-03", isBeforeCutoff: false }}
        onDateChange={async () => false}
        onSave={async () => true}
      />
    </main>
  </div>,
);
