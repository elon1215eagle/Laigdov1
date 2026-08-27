import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeviceRows,
  buildEmployeeCodeRows,
  buildQuickCheckoutManagementSummary,
  filterQuickCheckoutOrders,
} from "../src/modules/quick-checkout-management/domain/managementSummary.js";

const devices = [
  { id: "d1", storeCode: "S01", isActive: true, revokedAt: null },
  { id: "d2", storeCode: "S01", isActive: false, revokedAt: "2026-08-27T01:00:00Z" },
  { id: "d3", storeCode: "S02", isActive: false, revokedAt: null },
];

const orders = [
  { id: "o1", deviceId: "d1", storeId: "s1", storeCode: "S01", operatorCode: "A01", operatorName: "小王", status: "completed", total: 100, updatedAt: "2026-08-27T03:00:00Z" },
  { id: "o2", deviceId: "d1", storeId: "s1", storeCode: "S01", operatorCode: "A01", operatorName: "小王", status: "voided", total: 80, updatedAt: "2026-08-27T04:00:00Z" },
  { id: "o3", deviceId: "d3", storeId: "s2", storeCode: "S02", operatorCode: "B02", operatorName: "小李", status: "paid", total: 60, updatedAt: "2026-08-27T05:00:00Z" },
];

test("management summary counts stores, active devices, codes, orders and exceptions", () => {
  assert.deepEqual(buildQuickCheckoutManagementSummary(devices, orders), {
    boundStoreCount: 2,
    deviceCount: 3,
    activeDeviceCount: 1,
    employeeCodeCount: 2,
    orderCount: 3,
    exceptionCount: 1,
  });
});

test("device rows derive status and usage within the selected order range", () => {
  const rows = buildDeviceRows(devices, orders);
  assert.equal(rows[0].status, "active");
  assert.equal(rows[0].orderCount, 2);
  assert.equal(rows[0].employeeCodeCount, 1);
  assert.equal(rows[1].status, "revoked");
  assert.equal(rows[2].status, "disabled");
});

test("employee codes aggregate by store and code", () => {
  const rows = buildEmployeeCodeRows(orders);
  const s01 = rows.find((row) => row.operatorCode === "A01");
  assert.equal(s01.orderCount, 2);
  assert.equal(s01.completedCount, 1);
  assert.equal(s01.exceptionCount, 1);
  assert.equal(s01.totalAmount, 180);
});

test("order filters combine store, code and status", () => {
  assert.deepEqual(filterQuickCheckoutOrders(orders, { storeCode: "S01", employeeCode: "a0", status: "voided" }).map((order) => order.id), ["o2"]);
});
