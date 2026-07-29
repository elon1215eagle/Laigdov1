import assert from "node:assert/strict";
import test from "node:test";

import {
  createInventoryRepository,
  isInventorySchemaCacheError,
  normalizeInventoryRow,
  stripNewInventoryFields,
} from "../src/modules/daily-report/data/inventoryRepository.js";

test("null inventory adapter keeps local mode predictable", async () => {
  const repository = createInventoryRepository();
  const rows = [{ product_id: "product-1", current_stock: 3.5 }];

  assert.deepEqual(await repository.fetchByReport("report-1"), []);
  assert.deepEqual(await repository.fetchForReports(["report-1"]), []);
  assert.equal(await repository.upsert("report-1", rows), rows);
});

test("inventory normalizer supplies units and numeric package fields", () => {
  const normalized = normalizeInventoryRow({
    products: { unit: "包" },
    current_stock_boxes: "2",
    current_stock_packs: "1.5",
    incoming_boxes: null,
    incoming_packs: "3",
  });

  assert.equal(normalized.stock_unit, "包");
  assert.equal(normalized.incoming_unit, "包");
  assert.equal(normalized.current_stock_boxes, 2);
  assert.equal(normalized.current_stock_packs, 1.5);
  assert.equal(normalized.incoming_boxes, 0);
  assert.equal(normalized.incoming_packs, 3);
});

test("legacy fallback strips only fields unavailable in the old schema", () => {
  const [legacy] = stripNewInventoryFields([{
    report_id: "report-1",
    product_id: "product-1",
    current_stock: 3,
    stock_unit: "箱",
    incoming_unit: "包",
    current_stock_boxes: 1,
    current_stock_packs: 2,
    incoming_boxes: 0,
    incoming_packs: 3,
    incoming_source: "總部配送",
    transfer_note: "測試",
  }]);

  assert.deepEqual(legacy, {
    report_id: "report-1",
    product_id: "product-1",
    current_stock: 3,
  });
  assert.equal(isInventorySchemaCacheError({ message: "column stock_unit does not exist" }), true);
  assert.equal(isInventorySchemaCacheError({ message: "permission denied" }), false);
});
