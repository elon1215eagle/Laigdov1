import test from "node:test";
import assert from "node:assert/strict";
import {
  activeOrder,
  createCheckoutWorkspace,
  createMemoryQuickCheckoutAdapter,
  createQuickCheckoutModule,
  createSupabaseQuickCheckoutAdapter,
  executeWorkspaceCommand,
  orderTotals,
  QUICK_CHECKOUT_DEMO_PRODUCTS,
  requiresOrderReview,
  visibleOrders,
} from "../src/modules/quick-checkout/index.js";

const operator = { id: "staff-1", name: "阿宜" };

function workspaceWithOrder() {
  return executeWorkspaceCommand(
    createCheckoutWorkspace({ storeCode: "S01", storeName: "鳳山五甲店", operator }),
    { type: "open_order" },
    QUICK_CHECKOUT_DEMO_PRODUCTS,
    "2026-08-26T10:00:00.000Z",
  );
}

function orderCommand(workspace, command) {
  return executeWorkspaceCommand(workspace, { type: "order_command", command }, QUICK_CHECKOUT_DEMO_PRODUCTS, "2026-08-26T10:01:00.000Z");
}

test("多客人切換保留各自顏色、商品與金額", () => {
  let workspace = workspaceWithOrder();
  const firstId = workspace.activeOrderId;
  workspace = orderCommand(workspace, { type: "add_product", productCode: "chicken_cutlet" });
  workspace = executeWorkspaceCommand(workspace, { type: "open_order" }, QUICK_CHECKOUT_DEMO_PRODUCTS);
  const secondId = workspace.activeOrderId;
  workspace = orderCommand(workspace, { type: "add_product", productCode: "chicken_leg" });
  workspace = executeWorkspaceCommand(workspace, { type: "switch_order", orderId: firstId }, QUICK_CHECKOUT_DEMO_PRODUCTS);
  assert.notEqual(firstId, secondId);
  assert.equal(activeOrder(workspace).colorKey, "blue");
  assert.equal(orderTotals(activeOrder(workspace)).total, 65);
  assert.equal(workspace.orders.find((order) => order.id === secondId).colorKey, "green");
});

test("固定份量與調味保留在訂單明細", () => {
  let workspace = workspaceWithOrder();
  workspace = orderCommand(workspace, { type: "add_product", productCode: "sweet_potato_large" });
  const lineId = activeOrder(workspace).lines[0].id;
  workspace = orderCommand(workspace, { type: "toggle_seasoning", lineId, seasoning: "plum" });
  const line = activeOrder(workspace).lines[0];
  assert.equal(line.fixedWeightGrams, 270);
  assert.deepEqual(line.seasonings, ["plum"]);
});

test("同商品多份可拆開並分別設定辣與不辣", () => {
  let workspace = workspaceWithOrder();
  workspace = orderCommand(workspace, { type: "add_product", productCode: "chicken_cutlet" });
  workspace = orderCommand(workspace, { type: "add_product", productCode: "chicken_cutlet" });
  const combinedLine = activeOrder(workspace).lines[0];
  assert.equal(combinedLine.quantity, 2);
  workspace = orderCommand(workspace, { type: "split_line", lineId: combinedLine.id });
  const spicyLine = activeOrder(workspace).lines[0];
  workspace = orderCommand(workspace, { type: "toggle_seasoning", lineId: spicyLine.id, seasoning: "spicy" });
  const lines = activeOrder(workspace).lines;
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((line) => line.seasonings), [["spicy"], []]);
  assert.equal(orderTotals(activeOrder(workspace)).total, 130);
});

test("點心價格與順序符合核定內容", () => {
  const snacks = QUICK_CHECKOUT_DEMO_PRODUCTS.filter((product) => product.category === "點心");
  assert.deepEqual(snacks.map((product) => product.name), ["花枝丸", "米血", "熱狗", "雞脖子", "雞皮", "黑輪片", "麥克雞塊"]);
  assert.equal(snacks.find((product) => product.code === "hot_dog").price, 30);
  assert.equal(snacks.find((product) => product.code === "chicken_neck").price, 10);
  assert.equal(snacks.find((product) => product.code === "oden_slice").price, 30);
  const workspace = orderCommand(workspaceWithOrder(), { type: "add_product", productCode: "chicken_neck" });
  assert.equal(orderTotals(activeOrder(workspace)).total, 10);
});

test("四種以上商品必須再次核對才能進入打包", () => {
  let workspace = workspaceWithOrder();
  for (const productCode of ["chicken_wing", "chicken_leg", "thigh_steak", "chicken_cutlet"]) {
    workspace = orderCommand(workspace, { type: "add_product", productCode });
  }
  assert.equal(requiresOrderReview(activeOrder(workspace)), true);
  assert.throws(() => orderCommand(workspace, { type: "begin_packing" }), /再次核對/);
  workspace = orderCommand(workspace, { type: "confirm_review" });
  workspace = orderCommand(workspace, { type: "begin_packing" });
  for (const line of activeOrder(workspace).lines) {
    workspace = orderCommand(workspace, { type: "toggle_packed", lineId: line.id });
  }
  workspace = orderCommand(workspace, { type: "packing_complete" });
  workspace = orderCommand(workspace, { type: "pay", received: 500 });
  assert.equal(workspace.orders[0].payment.change, 340);
});

test("必須逐項打包完成後才能輸入付款與找零", () => {
  let workspace = workspaceWithOrder();
  workspace = orderCommand(workspace, { type: "add_product", productCode: "chicken_cutlet" });
  assert.throws(() => orderCommand(workspace, { type: "pay", received: 100 }), /打包核對/);
  workspace = orderCommand(workspace, { type: "begin_packing" });
  assert.throws(() => orderCommand(workspace, { type: "packing_complete" }), /尚有商品/);
  const lineId = activeOrder(workspace).lines[0].id;
  workspace = orderCommand(workspace, { type: "toggle_packed", lineId });
  workspace = orderCommand(workspace, { type: "packing_complete" });
  assert.throws(() => orderCommand(workspace, { type: "pay", received: 50 }), /付款金額不足/);
  workspace = orderCommand(workspace, { type: "pay", received: 100 });
  assert.equal(visibleOrders(workspace).length, 0);
  assert.equal(workspace.orders[0].payment.change, 35);
});

test("取消訂單必填原因並保留事件", () => {
  let workspace = workspaceWithOrder();
  assert.throws(() => orderCommand(workspace, { type: "cancel", reason: "" }), /原因/);
  workspace = orderCommand(workspace, { type: "cancel", reason: "客人取消" });
  assert.equal(workspace.orders[0].status, "cancelled");
  assert.equal(workspace.orders[0].events.at(-1).details.reason, "客人取消");
});

test("Memory Adapter 透過模組 Interface 自動保存並恢復", async () => {
  const adapter = createMemoryQuickCheckoutAdapter({ storage: null });
  const module = createQuickCheckoutModule({ adapter, products: QUICK_CHECKOUT_DEMO_PRODUCTS });
  let workspace = await module.startWorkspace({ storeCode: "S01", storeName: "鳳山五甲店", operator });
  workspace = await module.execute(workspace, { type: "open_order" });
  workspace = await module.execute(workspace, { type: "order_command", command: { type: "add_product", productCode: "chicken_leg" } });
  const restored = await module.loadWorkspace();
  assert.equal(orderTotals(activeOrder(restored)).total, 35);
});

test("Supabase Adapter 僅透過裝置憑證 RPC 存取工作區", async () => {
  const calls = [];
  const client = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === "quick_checkout_load_workspace") return { data: { workspace: { storeCode: "S01" } }, error: null };
      return { data: true, error: null };
    },
  };
  const adapter = createSupabaseQuickCheckoutAdapter({ client, deviceToken: "device-secret" });
  assert.deepEqual(await adapter.loadWorkspace(), { storeCode: "S01" });
  await adapter.saveWorkspace({ storeCode: "S01", orders: [] });
  await adapter.clearWorkspace();
  assert.deepEqual(calls.map((call) => call.name), [
    "quick_checkout_load_workspace",
    "quick_checkout_save_workspace",
    "quick_checkout_clear_workspace",
  ]);
  assert.equal(calls.every((call) => call.parameters.p_device_token === "device-secret"), true);
});

test("新綁定裝置沒有工作區時回傳空值而不是 RPC 包裝物件", async () => {
  const client = {
    async rpc() {
      return { data: { workspace: null }, error: null };
    },
  };
  const adapter = createSupabaseQuickCheckoutAdapter({ client, deviceToken: "device-secret" });
  assert.equal(await adapter.loadWorkspace(), null);
});
