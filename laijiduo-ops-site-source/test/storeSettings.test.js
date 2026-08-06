import assert from "node:assert/strict";
import test from "node:test";

import {
  createStoreSettingsDraft,
  mergeStoreHours,
  settingsPayload,
  validateStoreSettingsDraft,
} from "../src/modules/store-settings/domain/storeSettings.js";

const baseDraft = createStoreSettingsDraft({
  store: { store_code: "S01", manager_name: "店長", operating_status: "active", target_monthly_revenue: 2100000 },
  setting: {
    weekday_open_time: "10:00:00", weekday_close_time: "23:00:00",
    holiday_open_time: "10:00:00", holiday_close_time: "23:00:00",
    lunch_peak_start: "11:00:00", lunch_peak_end: "14:00:00",
    dinner_peak_start: "16:30:00", dinner_peak_end: "19:00:00",
    lunch_report_time: "14:00:00", dinner_report_time: "19:00:00", close_report_time: "23:00:00",
    effective_from: "2026-08-01",
  },
  demand: { required_count: 7 },
  relation: { code: "S01-S06", demand: 7, ruleNote: "共同排班" },
});

test("門店設定建立單一標準草稿並保留七人需求", () => {
  assert.equal(baseDraft.store_code, "S01");
  assert.equal(baseDraft.baseline_demand, 7);
  assert.equal(baseDraft.lunch_peak_demand, 7);
  assert.equal(baseDraft.dinner_peak_demand, 7);
  assert.equal(baseDraft.weekday_open_time, "10:00");
  assert.equal(baseDraft.relation_group_code, "S01-S06");
});

test("門店設定要求原因、完整時間與有效人數", () => {
  assert.equal(validateStoreSettingsDraft(baseDraft, "八月調整"), "");
  assert.match(validateStoreSettingsDraft(baseDraft, ""), /修改原因/);
  assert.match(validateStoreSettingsDraft({ ...baseDraft, weekday_close_time: "09:00" }, "八月調整"), /打烊時間/);
  assert.match(validateStoreSettingsDraft({ ...baseDraft, baseline_demand: -1 }, "八月調整"), /需求人數/);
});

test("月目標依生效月份實際天數換算每日目標", () => {
  const payload = settingsPayload(baseDraft);
  assert.equal(payload.target_monthly_revenue, 2100000);
  assert.equal(payload.target_daily_revenue, 67742);
  assert.equal(payload.is_active, true);
});

test("正式設定覆蓋備援營業時間與人力需求", () => {
  const rows = mergeStoreHours(
    [{ storeName: "鳳山五甲店", open_time: "09:00", close_time: "22:00", lunch_peak: "11:30-13:30", dinner_peak: "17:00-19:00", duty_staff: "5" }],
    [{ store_code: "S01", weekday_open_time: "10:00", weekday_close_time: "23:00", lunch_peak_start: "11:00", lunch_peak_end: "14:00", dinner_peak_start: "16:30", dinner_peak_end: "19:00" }],
    [{ store_code: "S01", name: "鳳山五甲店" }],
    [{ store_code: "S01", rule_type: "baseline", required_count: 7, is_active: true }],
  );
  assert.equal(rows[0].open_time, "10:00");
  assert.equal(rows[0].close_time, "23:00");
  assert.equal(rows[0].duty_staff, "7");
});
