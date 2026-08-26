import { createOrder, executeOrderCommand, ORDER_STATUS } from "./order.js";

export const ORDER_COLORS = Object.freeze(["blue", "green", "amber", "purple", "teal", "rose"]);

export function createCheckoutWorkspace({ storeCode, storeName, operator }) {
  return {
    storeCode,
    storeName,
    operator,
    nextSequence: 1,
    activeOrderId: null,
    orders: [],
  };
}

function nextPickupNumber(sequence) {
  return `A${String(sequence).padStart(2, "0")}`;
}

export function visibleOrders(workspace) {
  return workspace.orders.filter((order) => ![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.VOIDED].includes(order.status));
}

export function activeOrder(workspace) {
  return workspace.orders.find((order) => order.id === workspace.activeOrderId) || null;
}

export function executeWorkspaceCommand(workspace, command, products = [], now = new Date().toISOString()) {
  switch (command.type) {
    case "open_order": {
      const sequence = workspace.nextSequence;
      const order = createOrder({
        pickupNumber: nextPickupNumber(sequence),
        colorKey: ORDER_COLORS[(sequence - 1) % ORDER_COLORS.length],
        storeCode: workspace.storeCode,
        operator: workspace.operator,
        now,
      });
      return { ...workspace, nextSequence: sequence + 1, activeOrderId: order.id, orders: [...workspace.orders, order] };
    }
    case "switch_order": {
      const exists = visibleOrders(workspace).some((order) => order.id === command.orderId);
      if (!exists) throw new Error("找不到這筆進行中訂單");
      return { ...workspace, activeOrderId: command.orderId };
    }
    case "order_command": {
      const current = activeOrder(workspace);
      if (!current) throw new Error("請先新增客人");
      const updated = executeOrderCommand(current, command.command, products, now);
      const orders = workspace.orders.map((order) => order.id === updated.id ? updated : order);
      const remaining = orders.filter((order) => ![ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED, ORDER_STATUS.VOIDED].includes(order.status));
      return { ...workspace, orders, activeOrderId: remaining.some((order) => order.id === updated.id) ? updated.id : remaining[0]?.id || null };
    }
    default:
      throw new Error("不支援的工作區操作");
  }
}
