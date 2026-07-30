import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDailyReportPayload,
  deriveRevenueBreakdown,
  totalRevenue,
} from "../src/modules/daily-report/index.js";

test("以全日營收倒算 19:00 至打烊營收", () => {
  const result = deriveRevenueBreakdown({
    opened_to_1400_revenue: 5000,
    revenue_1400_to_1900: 12000,
    full_day_revenue: 23000,
  });

  assert.deepEqual(result, {
    openedTo1400: 5000,
    revenue1400To1900: 12000,
    revenue1900ToClose: 6000,
    fullDayRevenue: 23000,
    isValid: true,
    completedSteps: 3,
  });
});

test("全日營收小於前兩時段加總時判定無效", () => {
  const result = deriveRevenueBreakdown({
    opened_to_1400_revenue: 5000,
    revenue_1400_to_1900: 12000,
    full_day_revenue: 16000,
  });

  assert.equal(result.isValid, false);
  assert.equal(result.revenue1900ToClose, 0);
});

test("建立門店與總部共用的正式回報 payload", () => {
  const payload = buildDailyReportPayload({
    storeId: "store-1",
    reportDate: "2026-07-29",
    submittedBy: "user-1",
    submittedAt: "2026-07-29T12:00:00.000Z",
    form: {
      opened_to_1400_revenue: 5000,
      revenue_1400_to_1900: 12000,
      full_day_revenue: 23000,
      cash_difference: -100,
      manager_note: "交班完成",
    },
  });

  assert.deepEqual(payload, {
    store_id: "store-1",
    report_date: "2026-07-29",
    opened_to_1400_revenue: 5000,
    revenue_1400_to_1900: 12000,
    revenue_1900_to_close: 6000,
    cash_difference: -100,
    manager_note: "交班完成",
    delivery_revenue: 0,
    scheduled_staff_count: 0,
    actual_staff_count: 0,
    staffing_variance_reason: "",
    customer_complaint_count: 0,
    customer_complaint_detail: "",
    equipment_issue: false,
    equipment_issue_detail: "",
    special_event: "",
    employee_meal_total: 0,
    status: "submitted",
    submitted_at: "2026-07-29T12:00:00.000Z",
    submitted_by: "user-1",
  });
});

test("儲存資料的三個營收時段可還原全日總營收", () => {
  assert.equal(totalRevenue({
    opened_to_1400_revenue: 5000,
    revenue_1400_to_1900: 12000,
    revenue_1900_to_close: 6000,
  }), 23000);
});
