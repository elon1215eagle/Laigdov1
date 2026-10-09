import React from "react";
import { createRoot } from "react-dom/client";

import "../../src/styles.css";

// Keep this visual fixture isolated from production services.
window.fetch = () => Promise.resolve(new Response("[]", {
  status: 200,
  headers: { "Content-Type": "application/json" },
}));

const { HqOperationsView } = await import("../../src/App.jsx");

const stores = [
  ["S01", "鳳山五甲店", 65410, 45700],
  ["S02", "鳳山凱旋店", 29100, 24500],
];
const dates = [
  ["週一", "2026-09-28", "2026-09-21"],
  ["週二", "2026-09-29", "2026-09-22"],
  ["週三", "2026-09-30", "2026-09-23"],
  ["週四", "2026-10-01", "2026-09-24"],
];

const rows = stores.flatMap(([storeCode, storeName, currentBase, previousBase], storeIndex) => (
  dates.map(([weekday, currentDate, previousDate], index) => {
    const currentMissing = index === 3;
    const currentTotal = Math.max(0, currentBase - (index * 6200) - (storeIndex * 1400));
    const previousTotal = Math.max(0, previousBase + (index * 3100));
    const current = currentMissing ? null : {
      opened_to_1400_revenue: Math.round(currentTotal * 0.25),
      revenue_1400_to_1900: Math.round(currentTotal * 0.45),
      revenue_1900_to_close: Math.round(currentTotal * 0.3),
    };
    const previous = {
      opened_to_1400_revenue: Math.round(previousTotal * 0.25),
      revenue_1400_to_1900: Math.round(previousTotal * 0.45),
      revenue_1900_to_close: Math.round(previousTotal * 0.3),
    };
    const effectiveCurrentTotal = currentMissing ? 0 : currentTotal;
    const delta = effectiveCurrentTotal - previousTotal;
    return {
      storeCode,
      storeName,
      weekday,
      currentDate,
      previousDate,
      current,
      previous,
      currentTotal: effectiveCurrentTotal,
      previousTotal,
      delta,
      growth: previousTotal ? (delta / previousTotal) * 100 : 0,
    };
  })
));

createRoot(document.getElementById("root")).render(
  <div className="app hq-app">
    <main className="content">
      <div className="workspace module-grid">
        <HqOperationsView rows={rows} />
      </div>
    </main>
  </div>,
);
