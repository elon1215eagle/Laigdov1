import assert from "node:assert/strict";
import test from "node:test";

import { createDailyOperationsService } from "../src/modules/daily-report/data/dailyOperationsService.js";

function createRepositories() {
  const calls = [];
  return {
    calls,
    dailyReportRepository: {
      async upsert(payload) {
        calls.push(["report", payload]);
        return { id: "report-1", ...payload };
      },
    },
    inventoryRepository: {
      async upsert(reportId, rows) {
        calls.push(["inventory", reportId, rows]);
        return rows;
      },
    },
  };
}

test("atomic RPC saves report and inventory in one database operation", async () => {
  const repositories = createRepositories();
  const client = {
    async rpc(name, args) {
      assert.equal(name, "save_daily_operations");
      assert.equal(args.p_report.store_id, "store-1");
      assert.equal(args.p_inventory.length, 1);
      return { data: { id: "report-1" }, error: null };
    },
  };
  const service = createDailyOperationsService({ client, ...repositories });

  const result = await service.save(
    { store_id: "store-1", report_date: "2026-07-30" },
    [{ product_id: "product-1" }],
  );

  assert.equal(result.atomic, true);
  assert.equal(result.report.id, "report-1");
  assert.deepEqual(repositories.calls, []);
});

test("missing RPC falls back to the compatible sequential adapters", async () => {
  const repositories = createRepositories();
  const client = {
    async rpc() {
      return {
        data: null,
        error: { code: "PGRST202", message: "save_daily_operations is not in the schema cache" },
      };
    },
  };
  const service = createDailyOperationsService({ client, ...repositories });
  const inventoryRows = [{ product_id: "product-1" }];

  const result = await service.save(
    { store_id: "store-1", report_date: "2026-07-30" },
    inventoryRows,
  );

  assert.equal(result.atomic, false);
  assert.deepEqual(repositories.calls, [
    ["report", { store_id: "store-1", report_date: "2026-07-30" }],
    ["inventory", "report-1", inventoryRows],
  ]);
});

test("real RPC errors do not risk a second write attempt", async () => {
  const repositories = createRepositories();
  const client = {
    async rpc() {
      return { data: null, error: { code: "42501", message: "permission denied" } };
    },
  };
  const service = createDailyOperationsService({ client, ...repositories });

  await assert.rejects(
    service.save({ store_id: "store-1" }, []),
    (error) => error.code === "42501" && error.message === "permission denied",
  );
  assert.deepEqual(repositories.calls, []);
});
