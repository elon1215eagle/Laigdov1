import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInventorySaveRows,
  defaultUnitForProduct,
  displayUnitForProduct,
  productKind,
  toManagementQuantity,
  usageCount,
} from "../src/modules/inventory/index.js";

test("product kinds and units follow the approved operating rules", () => {
  assert.equal(productKind("雞翅"), "variable");
  assert.equal(defaultUnitForProduct("雞翅"), "箱");
  assert.equal(displayUnitForProduct("雞翅"), "件");
  assert.equal(defaultUnitForProduct("米血"), "包");
  assert.equal(defaultUnitForProduct("雞皮"), "串");
  assert.equal(defaultUnitForProduct("炸油"), "桶");
  assert.equal(productKind("湯翅粉"), "powder");
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
