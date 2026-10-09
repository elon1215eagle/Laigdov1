import test from "node:test";
import assert from "node:assert/strict";
import { groupAccountSummaries, normalizeAccountSummaryRow, summarizeAccounts } from "../src/modules/account-management/domain/accountSummary.js";

const rows = [
  { user_id: "1", email: "coo@laigdo.com", app_code: "operations", status: "normal", is_active: true, profile_complete: true },
  { user_id: "2", email: "ck@laigdo.com", app_code: "franchise_performance", status: "normal", is_active: true, profile_complete: true },
  { user_id: "3", email: "f01@laigdo.com", app_code: "franchise_ordering", status: "normal", is_active: true, profile_complete: true },
  { user_id: "4", email: "unknown@example.com", status: "unclassified", is_active: true, profile_complete: false },
];

test("跨 APP 帳號依正式歸屬分組且不把外部 APP 視為營運缺檔", () => {
  const groups = groupAccountSummaries(rows);
  assert.deepEqual(groups.map((group) => group.appCode), ["operations", "franchise_performance", "franchise_ordering", "unclassified"]);
  assert.equal(groups[1].rows[0].email, "ck@laigdo.com");
  assert.equal(groups[2].rows[0].email, "f01@laigdo.com");
});

test("帳號摘要使用明確狀態，不檢查連續加盟編號", () => {
  const summary = summarizeAccounts(rows);
  assert.deepEqual(summary, { total: 4, normal: 3, pending: 0, unclassified: 1, inactive: 0 });
  assert.equal(rows.some((row) => row.email === "f04@laigdo.com"), false);
});

test("資料庫角色轉為管理者可讀的中文名稱", () => {
  const groups = groupAccountSummaries([
    { user_id: "1", email: "s01@laigdo.com", app_code: "operations", role_label: "store_manager", status: "normal" },
    { user_id: "2", email: "f01@laigdo.com", app_code: "franchise_ordering", role_label: "franchise_owner", status: "normal" },
  ]);
  assert.equal(groups[0].rows[0].roleLabel, "門店店長");
  assert.equal(groups[2].rows[0].roleLabel, "加盟店");
});

test("已正規化的 RPC 資料再次分組時仍保留 APP 歸屬", () => {
  const normalizedRows = rows.map(normalizeAccountSummaryRow);
  const groups = groupAccountSummaries(normalizedRows);
  assert.equal(groups[0].rows[0].appCode, "operations");
  assert.equal(groups[1].rows[0].appCode, "franchise_performance");
  assert.equal(groups[2].rows[0].appCode, "franchise_ordering");
  assert.deepEqual(summarizeAccounts(normalizedRows), {
    total: 4,
    normal: 3,
    pending: 0,
    unclassified: 1,
    inactive: 0,
  });
});
