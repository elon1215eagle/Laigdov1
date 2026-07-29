import assert from "node:assert/strict";
import test from "node:test";

import {
  createDailyReportRepository,
  normalizeDailyReportRow,
} from "../src/modules/daily-report/data/dailyReportRepository.js";

test("null adapter provides predictable local behavior", async () => {
  const fallbackReports = [{ id: "store-1", name: "五甲店" }];
  const repository = createDailyReportRepository(null, { fallbackReports });
  const payload = { store_id: "store-1", report_date: "2026-07-29" };

  assert.equal(await repository.fetchByDate("2026-07-29"), fallbackReports);
  assert.deepEqual(await repository.fetchRange("2026-07-01", "2026-07-29"), []);
  assert.equal(await repository.upsert(payload), payload);
  assert.deepEqual(await repository.deleteOne("report-1"), []);
  assert.deepEqual(await repository.deleteMany(["report-1"]), []);
});

test("normalizer exposes store relation fields through the stable interface", () => {
  const normalized = normalizeDailyReportRow({
    id: "report-1",
    stores: {
      name: "五甲店",
      area: "高雄",
      store_code: "S01",
      manager_name: "店長",
      target_daily_revenue: 50000,
      target_monthly_revenue: 1500000,
    },
  });

  assert.equal(normalized.name, "五甲店");
  assert.equal(normalized.area, "高雄");
  assert.equal(normalized.store_code, "S01");
  assert.equal(normalized.manager_name, "店長");
  assert.equal(normalized.target, 50000);
  assert.equal(normalized.target_monthly_revenue, 1500000);
});
