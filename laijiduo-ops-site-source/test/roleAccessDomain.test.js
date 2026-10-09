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
  profileRole,
  visibleViewModesForRole,
} from "../src/modules/access/index.js";

test("missing and unknown roles never inherit headquarters access", () => {
  assert.equal(profileRole(null), "");
  for (const role of [undefined, "", "franchise", "unknown", "toString", "__proto__"]) {
    assert.deepEqual(modulesForRole(role), []);
    assert.deepEqual(visibleViewModesForRole(role), []);
    assert.equal(appViewForRole(role), "entry");
    assert.equal(canAccessModule(role, "accountManagement"), false);
    assert.equal(canAccessModule(role, "hr"), false);
  }
});

test("store managers enter the store view with only active store modules", () => {
  assert.equal(appViewForRole("store_manager"), "store");
  assert.deepEqual(modulesForRole("store_manager"), ["ops", "onlineOrdering", "schedule", "staffingOverview", "transfers", "repairs"]);
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
  for (const role of ["ceo", "coo", "admin", "hq", "cso"]) {
    assert.equal(canAccessModule(role, "checkoutManagement"), true);
  }
  for (const role of ["cfo", "general_affairs", "supervisor", "store_manager"]) {
    assert.equal(canAccessModule(role, "checkoutManagement"), false);
  }
});

test("跨 APP 帳號管理只開放指定總部角色", () => {
  assert.equal(canAccessModule("ceo", "accountManagement"), true);
  assert.equal(canAccessModule("coo", "accountManagement"), true);
  assert.equal(canAccessModule("admin", "accountManagement"), true);
  assert.equal(canAccessModule("hq", "accountManagement"), true);
  assert.equal(canAccessModule("cfo", "accountManagement"), false);
  assert.equal(canAccessModule("cso", "accountManagement"), false);
  assert.equal(canAccessModule("store_manager", "accountManagement"), false);
});

test("hidden modules remain inaccessible without deleting their implementation", () => {
  for (const moduleName of ["handover", "anomaly", "tasks", "hrFlow", "performance", "inspection", "system"]) {
    assert.equal(canAccessModule("ceo", moduleName), false);
    assert.equal(canAccessModule("store_manager", moduleName), false);
  }
});

test("supervisor views fall back to headquarters while hidden views remain disabled", () => {
  assert.deepEqual(visibleViewModesForRole("supervisor"), ["hq"]);
  assert.deepEqual(modulesForRole("supervisor"), ["ops", "schedule", "staffingOverview", "approvals", "transfers", "repairs"]);
});

test("人力掌握只開放既有營運角色", () => {
  for (const role of ["ceo", "coo", "cfo", "cso", "admin", "hq", "general_affairs", "supervisor", "store_manager"]) {
    assert.equal(canAccessModule(role, "staffingOverview"), true);
  }
  for (const role of ["franchise", "external", "unknown", ""]) {
    assert.equal(canAccessModule(role, "staffingOverview"), false);
  }
});

test("transfer access is added only to known operations roles", () => {
  for (const role of ["ceo", "coo", "cfo", "cso", "admin", "hq", "general_affairs", "supervisor", "store_manager"]) assert.equal(canAccessModule(role, "transfers"), true);
  for (const role of ["franchise", "unknown", ""]) assert.equal(canAccessModule(role, "transfers"), false);
});

test("repair access is restricted to known operations roles", () => {
  for (const role of ["ceo", "coo", "cfo", "cso", "admin", "hq", "general_affairs", "supervisor", "store_manager"]) assert.equal(canAccessModule(role,"repairs"),true);
  for (const role of ["franchise","external","unknown",""]) assert.equal(canAccessModule(role,"repairs"),false);
});
