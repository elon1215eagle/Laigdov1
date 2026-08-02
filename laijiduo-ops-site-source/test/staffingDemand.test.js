import test from "node:test";
import assert from "node:assert/strict";
import { buildStaffingDemandRule, resolveStaffingDemand } from "../src/modules/scheduling/index.js";

const rules = [
  { store_code: "S01", rule_type: "baseline", start_time: "10:00", end_time: "23:00", required_count: 3, is_active: true },
  { store_code: "S01", rule_type: "weekday", weekday: 1, start_time: "11:00", end_time: "14:00", required_count: 5, is_active: true },
  { store_code: "S01", rule_type: "special", special_date: "2026-08-03", start_time: "11:00", end_time: "14:00", required_count: 7, is_active: true },
];

test("需求規則只接受30分鐘時段與非負整數", () => {
  assert.equal(buildStaffingDemandRule({ store_code: "S01", rule_type: "baseline", start_time: "10:00", end_time: "23:00", required_count: 3 }).valid, true);
  assert.equal(buildStaffingDemandRule({ store_code: "S01", rule_type: "baseline", start_time: "10:15", end_time: "23:00", required_count: 3 }).valid, false);
});

test("特殊日期優先於星期規則，星期規則優先於基準", () => {
  assert.equal(resolveStaffingDemand(rules, { storeCode: "S01", date: "2026-08-03", time: "11:30" }), 7);
  assert.equal(resolveStaffingDemand(rules, { storeCode: "S01", date: "2026-08-10", time: "11:30" }), 5);
  assert.equal(resolveStaffingDemand(rules, { storeCode: "S01", date: "2026-08-10", time: "15:00" }), 3);
});
