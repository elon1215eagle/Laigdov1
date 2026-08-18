import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_REPORT_CUTOFF_HOUR,
  dailyReportDeadlineDate,
  getTaipeiReportClock,
  overdueReportBusinessDate,
} from "../src/modules/daily-report/domain/businessDate.js";

test("台北時間上午十點前預設回報前一營業日", () => {
  const clock = getTaipeiReportClock(new Date("2026-08-20T01:59:00Z"));
  assert.equal(DAILY_REPORT_CUTOFF_HOUR, 10);
  assert.equal(clock.calendarDate, "2026-08-20");
  assert.equal(clock.businessDate, "2026-08-19");
  assert.equal(clock.isBeforeCutoff, true);
  assert.equal(overdueReportBusinessDate(clock), "");
});

test("台北時間上午十點起切換當日並追蹤前一日逾期", () => {
  const clock = getTaipeiReportClock(new Date("2026-08-20T02:00:00Z"));
  assert.equal(clock.calendarDate, "2026-08-20");
  assert.equal(clock.businessDate, "2026-08-20");
  assert.equal(clock.isBeforeCutoff, false);
  assert.equal(overdueReportBusinessDate(clock), "2026-08-19");
});

test("營業日回報截止日固定為次日上午十點", () => {
  assert.equal(dailyReportDeadlineDate("2026-08-31"), "2026-09-01");
  assert.equal(dailyReportDeadlineDate("2026-12-31"), "2027-01-01");
});
