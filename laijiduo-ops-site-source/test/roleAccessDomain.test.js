import assert from "node:assert/strict";
import test from "node:test";

import {
  appViewForRole,
  canAccessModule,
  canEditMonthlyTargets,
  canExportRole,
  canManageDailyReportData,
  canManageSecurity,
  modulesForRole,
  visibleViewModesForRole,
} from "../src/modules/access/index.js";

test("store managers enter the store view with only active store modules", () => {
  assert.equal(appViewForRole("store_manager"), "store");
  assert.deepEqual(modulesForRole("store_manager"), ["ops", "schedule"]);
  assert.deepEqual(visibleViewModesForRole("store_manager"), ["store"]);
  assert.equal(canManageDailyReportData("store_manager"), false);
});

test("headquarters roles retain distinct management permissions", () => {
  assert.equal(canManageSecurity("ceo"), true);
  assert.equal(canManageSecurity("coo"), true);
  assert.equal(canManageSecurity("admin"), false);
  assert.equal(canEditMonthlyTargets("cfo"), true);
  assert.equal(canExportRole("cfo"), true);
  assert.equal(canManageDailyReportData("hq"), true);
});

test("hidden modules remain inaccessible without deleting their implementation", () => {
  for (const moduleName of ["handover", "anomaly", "tasks", "hrFlow", "performance", "inspection", "system"]) {
    assert.equal(canAccessModule("ceo", moduleName), false);
    assert.equal(canAccessModule("store_manager", moduleName), false);
  }
});

test("supervisor views fall back to headquarters while hidden views remain disabled", () => {
  assert.deepEqual(visibleViewModesForRole("supervisor"), ["hq"]);
  assert.deepEqual(modulesForRole("supervisor"), ["ops", "schedule"]);
});
