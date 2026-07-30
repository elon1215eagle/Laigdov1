import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationalDetailsPayload,
  calculateScheduledHeadcount,
  normalizeWasteItems,
} from "../src/modules/daily-report/index.js";

test("預計上班人數整合人資主檔、排假及跨店支援", () => {
  const staff = [
    { id: "a", store_code: "S01", role_name: "正職人員", is_active: true },
    { id: "b", store_code: "S01", role_name: "兼職人員", is_active: true },
    { id: "c", store_code: "S01", role_name: "送貨人員", is_active: true },
    { id: "d", store_code: "S09", role_name: "正職人員", is_active: true },
  ];
  const count = calculateScheduledHeadcount({
    staff,
    storeCode: "S01",
    reportDate: "2026-07-30",
    leavePlans: [{ staff_id: "b", leave_days: [30] }],
    shifts: [{
      staff_id: "d",
      shift_date: "2026-07-30",
      assigned_store_code: "S01",
    }],
  });
  assert.equal(count, 2);
});

test("人力、客訴及設備異常需有必要說明", () => {
  assert.throws(
    () => buildOperationalDetailsPayload({ delivery_revenue: 1200, full_day_revenue: 1000 }, 5),
    /不可高於全日總營收/,
  );
  assert.throws(
    () => buildOperationalDetailsPayload({ actual_staff_count: 4 }, 5),
    /差異原因/,
  );
  assert.throws(
    () => buildOperationalDetailsPayload({ customer_complaint_count: 1 }, 5),
    /客訴內容/,
  );
  assert.throws(
    () => buildOperationalDetailsPayload({ equipment_issue: true }, 5),
    /異常內容/,
  );
});

test("新增營運欄位正規化為可儲存格式", () => {
  assert.deepEqual(buildOperationalDetailsPayload({
    delivery_revenue: "1200",
    full_day_revenue: "5000",
    actual_staff_count: "5",
    customer_complaint_count: "0",
    equipment_issue: false,
    special_event: "臨時大單",
  }, 5), {
    delivery_revenue: 1200,
    scheduled_staff_count: 5,
    actual_staff_count: 5,
    staffing_variance_reason: "",
    customer_complaint_count: 0,
    customer_complaint_detail: "",
    equipment_issue: false,
    equipment_issue_detail: "",
    special_event: "臨時大單",
  });
});

test("報廢耗損只保留有品項與正數數量的資料", () => {
  assert.deepEqual(normalizeWasteItems([
    { product_id: "p1", item_name: "雞翅", quantity: "1.25", unit: "包", reason: "炸焦" },
    { item_name: "其他", quantity: 0, unit: "份" },
  ]), [{
    product_id: "p1",
    item_name: "雞翅",
    quantity: 1.25,
    unit: "包",
    reason: "炸焦",
  }]);
});
