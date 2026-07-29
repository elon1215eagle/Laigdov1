import test from "node:test";
import assert from "node:assert/strict";
import {
  STORE_OPERATING_STATUS,
  STORE_RELATION_GROUPS,
  createStoreDirectory,
  mergeStoreRelationGroups,
  normalizeTemporarySupportRows,
  normalizeStoreName,
  operatingStatusOf,
} from "../src/lib/storeScope.js";

const stores = [
  { id: "uuid-s01", store_code: "S01", name: "鳳山五甲店", is_active: true },
  { id: "uuid-s02", store_code: "S02", name: "鳳山凱旋店", is_active: true },
  { id: "uuid-s03", store_code: "S03", name: "鳳山武廟店", is_active: true },
  { id: "uuid-s05", store_code: "S05", name: "前鎮隆興店", is_active: true },
  { id: "uuid-s06", store_code: "S06", name: "鳳山南華店", is_active: false },
  { id: "uuid-s10", store_code: "S10", name: "屏東潮州店", is_active: true },
  { id: "uuid-s11", store_code: "S11", name: "屏東潮二店", is_active: true },
];

const directory = createStoreDirectory(stores);

test("店碼、UUID 與店名解析為同一門店", () => {
  assert.equal(directory.resolveStore("S05")?.id, "uuid-s05");
  assert.equal(directory.resolveStore("uuid-s05")?.store_code, "S05");
  assert.equal(directory.resolveStore("前鎮隆興店")?.store_code, "S05");
  assert.equal(directory.canonicalStoreCode({ store_id: "uuid-s05" }), "S05");
});

test("執行期資料可用資料庫 UUID 直接配對", () => {
  const rows = [{ id: "report-1", store_id: "runtime-store-uuid", store_code: "S05" }];
  assert.equal(directory.findStoreScopedRecord(rows, "runtime-store-uuid")?.id, "report-1");
});

test("隆興固定 S05，南華固定 S06", () => {
  assert.equal(directory.resolveStore("前鎮隆興店")?.store_code, "S05");
  assert.equal(directory.resolveStore("鳳山南華店")?.store_code, "S06");
});

test("歷史店名別名會正規化", () => {
  assert.equal(normalizeStoreName("屏東潮洲店"), "屏東潮州店");
  assert.equal(normalizeStoreName("屏東潮州二店"), "屏東潮二店");
});

test("門店關聯群組只包含排班、人力與支援能力", () => {
  const group = directory.relationGroupForStore("S01");
  assert.equal(group.code, "S01-S06");
  assert.deepEqual(group.sourceCodes, ["S01", "S06"]);
  assert.deepEqual(group.capabilities, ["schedule", "staffing", "temporary_support"]);
  assert.equal(group.capabilities.includes("revenue"), false);
  assert.equal(directory.relationGroupForStore("S05"), null);
});

test("凱旋與武廟共用群組但仍是兩間門店", () => {
  assert.equal(directory.relationGroupForStore("S02")?.code, "S02-S03");
  assert.equal(directory.relationGroupForStore("S03")?.code, "S02-S03");
  assert.notEqual(directory.resolveStore("S02")?.id, directory.resolveStore("S03")?.id);
});

test("南華為暫停營業且門店帳號不可編輯", () => {
  assert.equal(operatingStatusOf(directory.resolveStore("S06")), STORE_OPERATING_STATUS.SUSPENDED);
  const scope = directory.scopeForProfile({ role: "store_manager", store_id: "uuid-s06" });
  assert.deepEqual(scope.visibleStoreCodes, ["S01", "S06"]);
  assert.deepEqual(scope.editableStoreCodes, []);
});

test("門店帳號只能編輯主要門店", () => {
  const scope = directory.scopeForProfile({ role: "store_manager", store_id: "uuid-s02" });
  assert.deepEqual(scope.visibleStoreCodes, ["S02", "S03"]);
  assert.deepEqual(scope.editableStoreCodes, ["S02"]);
});

test("總部角色可取得所有門店範圍", () => {
  const scope = directory.scopeForProfile({ role: "coo" });
  assert.equal(scope.kind, "headquarters");
  assert.equal(scope.visibleStoreCodes.length, stores.length);
  assert.deepEqual(scope.editableStoreCodes, scope.visibleStoreCodes);
});

test("群組代碼保持唯一", () => {
  assert.equal(new Set(STORE_RELATION_GROUPS.map((group) => group.code)).size, STORE_RELATION_GROUPS.length);
});

test("資料庫群組覆蓋成員時保留既有需求與規則", () => {
  const groups = mergeStoreRelationGroups([{
    code: "S01-S06",
    name: "五甲與南華",
    sourceCodes: ["S01", "S06"],
    capabilities: ["schedule", "staffing", "temporary_support"],
  }]);
  assert.equal(groups[0].demand, 5);
  assert.match(groups[0].ruleNote, /五甲與南華/);
});

test("臨時支援摘要不包含員工姓名或休假明細", () => {
  const [summary] = normalizeTemporarySupportRows([{
    scope_code: "S09",
    scope_name: "三民鼎山店",
    demand: "3",
    working_people_count: 2,
    lunch_coverage: "2.00",
    dinner_coverage: "1.50",
    effective_count: "1.50",
    surplus: "-1.50",
    part_time_missing_hours: 0,
    employee_name: "不得出現在輸出",
    leave_days: [1, 2],
  }]);
  assert.equal(summary.code, "S09");
  assert.equal(summary.effectiveCount, 1.5);
  assert.equal(summary.surplus, -1.5);
  assert.equal("employee_name" in summary, false);
  assert.equal("leave_days" in summary, false);
});
