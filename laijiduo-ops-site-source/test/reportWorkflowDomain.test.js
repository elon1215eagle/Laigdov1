import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDailyReportChangeRequest,
  canConfirmDailyReport,
  deriveDailyReportAccess,
  nextReportStatus,
} from "../src/modules/daily-report/index.js";

test("總部核定角色符合已確認權限，總務及一般督導僅查看", () => {
  for (const role of ["ceo", "coo", "cfo", "admin", "hq", "cso"]) {
    assert.equal(canConfirmDailyReport(role), true);
  }
  assert.equal(canConfirmDailyReport("general_affairs"), false);
  assert.equal(canConfirmDailyReport("supervisor"), false);
  assert.equal(canConfirmDailyReport("store_manager"), false);
});

test("總部確認後門店鎖定，核准修改申請後才可編輯", () => {
  const locked = deriveDailyReportAccess({
    roleName: "store_manager",
    reportStatus: "approved",
    reportId: "report-1",
  });
  const reopened = deriveDailyReportAccess({
    roleName: "store_manager",
    reportStatus: "approved",
    reportId: "report-1",
    changeRequests: [{ report_id: "report-1", status: "approved" }],
  });

  assert.equal(locked.isLocked, true);
  assert.equal(locked.canEdit, false);
  assert.equal(locked.canRequestChange, true);
  assert.equal(reopened.isLocked, false);
  assert.equal(reopened.canEdit, true);
  assert.equal(reopened.canSubmit, true);
});

test("修改申請必須包含回報、門店及明確原因", () => {
  assert.deepEqual(buildDailyReportChangeRequest({
    reportId: "report-1",
    storeId: "store-1",
    reason: "  修正現金差異  ",
  }), {
    report_id: "report-1",
    store_id: "store-1",
    reason: "修正現金差異",
    status: "pending",
  });
  assert.throws(
    () => buildDailyReportChangeRequest({ reportId: "report-1", storeId: "store-1", reason: "改" }),
    /至少需填寫 3 個字/,
  );
});

test("每日回報只允許已定義的狀態轉換", () => {
  assert.equal(nextReportStatus("submit", "draft"), "submitted");
  assert.equal(nextReportStatus("confirm", "submitted"), "approved");
  assert.equal(nextReportStatus("request_revision", "submitted"), "needs_revision");
  assert.equal(nextReportStatus("submit", "approved"), "submitted");
  assert.equal(nextReportStatus("confirm", "draft"), null);
});
