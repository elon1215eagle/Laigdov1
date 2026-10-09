import React from "react";
import { createRoot } from "react-dom/client";
import { PhoneView } from "../../src/modules/staffing-overview/StaffingOverviewPage.jsx";
import "../../src/styles.css";

const snapshot = {
  store_code: "S05",
  store_name: "前鎮隆興店",
  target_headcount: 3,
  daily_demand: 2,
  manager_name: "阿斌",
  manager_authority: "待確認",
  output_time: "11:00",
  closing_time: "20:30",
  note: "",
  shifts: [
    { id: "open", name: "開早班", start_time: "10:00", end_time: "21:00" },
    { id: "close", name: "打烊班", start_time: "11:00", end_time: "22:00" },
  ],
  labor_units: [{ id: "store", name: "門店", month_days: 30, staff_equivalent: 3, rest_days: 19, positions: 2 }],
  people: [
    { id: "1", name: "阿斌", role: "店長", group: "門店", employment_type: "正職", status: "在職", visible: true },
    { id: "2", name: "仁彰", role: "正式人員", group: "門店", employment_type: "正職", status: "在職", visible: true },
    { id: "3", name: "道豐", role: "新進人員", group: "門店", employment_type: "正職", status: "在職", visible: true },
  ],
};

createRoot(document.getElementById("root")).render(
  <div className="store-manager-app"><PhoneView snapshot={snapshot} record={{ published_at: "2026-10-06T03:00:00Z" }} /></div>,
);
