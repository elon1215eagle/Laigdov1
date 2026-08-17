import assert from "node:assert/strict";
import test from "node:test";

import {
  blankInventoryProduct,
  buildInventorySaveRows,
  defaultUnitForProduct,
  displayUnitForProduct,
  inventoryUnitForStoreProduct,
  mergeInventoryRows,
  productKind,
  toManagementQuantity,
  usageCount,
} from "../src/modules/inventory/index.js";

test("product kinds and units follow the approved operating rules", () => {
  assert.equal(productKind("雞翅"), "variable");
  assert.equal(defaultUnitForProduct("雞翅"), "件");
  assert.equal(displayUnitForProduct("雞翅"), "件");
  assert.equal(defaultUnitForProduct("米血"), "包");
  assert.equal(defaultUnitForProduct("雞皮"), "串");
  assert.equal(defaultUnitForProduct("炸油"), "桶");
  assert.equal(productKind("湯翅粉"), "powder");
});

test("冷凍品項依門店固定使用包或件", () => {
  for (const name of ["雞翅", "雞腿", "雞排", "腿排", "雞米花", "三角骨", "雞脖子"]) {
    assert.equal(inventoryUnitForStoreProduct("S01", name), "件");
    assert.equal(inventoryUnitForStoreProduct("S05", name), "件");
    assert.equal(inventoryUnitForStoreProduct("S06", name), "件");
    assert.equal(inventoryUnitForStoreProduct("S02", name), "包");
    assert.equal(inventoryUnitForStoreProduct("S11", name), "包");
  }
  assert.equal(inventoryUnitForStoreProduct("S05", "地瓜"), "包");
  assert.equal(inventoryUnitForStoreProduct("S01", "地瓜"), "件");
  assert.equal(inventoryUnitForStoreProduct("S06", "地瓜"), "件");
  assert.equal(inventoryUnitForStoreProduct("S01", "花枝丸"), "包");
  assert.equal(inventoryUnitForStoreProduct("S10", "米血"), "包");
});

test("variable product packs convert to one third of a management unit", () => {
  assert.equal(toManagementQuantity({
    name: "雞翅",
    current_stock: 3,
    stock_unit: "包",
  }, "current_stock"), 1);
  assert.equal(toManagementQuantity({
    name: "雞翅",
    current_stock: 2,
    stock_unit: "件",
  }, "current_stock"), 2);
  assert.equal(toManagementQuantity({
    name: "雞翅",
    current_stock: 2,
    stock_unit: "箱",
  }, "current_stock"), 2);
});

test("powder boxes and packs are accumulated as packs", () => {
  assert.equal(toManagementQuantity({
    name: "醃粉",
    incoming_boxes: 2,
    incoming_packs: 3,
  }, "incoming"), 23);
});

test("usage compares previous and current quantities with the same conversion", () => {
  assert.equal(usageCount({
    name: "雞腿",
    previous_stock: 6,
    previous_stock_unit: "包",
    current_stock: 1,
    stock_unit: "箱",
  }), 1);
});

test("save rows normalize decimals, units, and incoming defaults", () => {
  const [row] = buildInventorySaveRows([{
    id: "product-1",
    name: "米血",
    current_stock: "2.25",
    incoming_count: "",
    loss_count: "0.5",
  }]);

  assert.equal(row.product_id, "product-1");
  assert.equal(row.current_stock, 2.25);
  assert.equal(row.incoming_count, 0);
  assert.equal(row.loss_count, 0.5);
  assert.equal(row.stock_unit, "包");
  assert.equal(row.incoming_source, "廠商進貨");
  assert.equal(row.safety_stock, 0);
});

test("inventory merge preserves saved values and adds previous-day context", () => {
  const products = [{ id: "p1", name: "雞翅", unit: "箱" }];
  const rows = mergeInventoryRows(
    products,
    [{ product_id: "p1", current_stock: 2, stock_unit: "箱" }],
    [{ product_id: "p1", current_stock: 5, stock_unit: "包" }],
  );

  assert.equal(rows[0].current_stock, 2);
  assert.equal(rows[0].previous_stock, 5);
  assert.equal(rows[0].previous_stock_unit, "包");
  assert.equal(blankInventoryProduct(products[0]).incoming_count, "");
});

test("生效日起庫存與進貨套用門店單位，歷史資料保留原單位", () => {
  const products = [{ id: "p1", name: "雞翅", unit: "箱" }];
  const current = mergeInventoryRows(
    products,
    [{ product_id: "p1", current_stock: 2, stock_unit: "箱", incoming_count: 1, incoming_unit: "箱" }],
    [{ product_id: "p1", current_stock: 3, stock_unit: "箱" }],
    { storeCode: "S02", reportDate: "2026-08-18" },
  );
  assert.equal(current[0].stock_unit, "包");
  assert.equal(current[0].incoming_unit, "包");
  assert.equal(current[0].current_stock, 6);
  assert.equal(current[0].incoming_count, 3);
  assert.equal(current[0].previous_stock_unit, "箱");

  const historical = mergeInventoryRows(
    products,
    [{ product_id: "p1", current_stock: 2, stock_unit: "箱", incoming_unit: "箱" }],
    [],
    { storeCode: "S02", reportDate: "2026-08-17" },
  );
  assert.equal(historical[0].stock_unit, "箱");
  assert.equal(historical[0].incoming_unit, "箱");
});
