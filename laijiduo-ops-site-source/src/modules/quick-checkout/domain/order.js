import { seasoningLabel } from "./catalog.js";

export const ORDER_STATUS = Object.freeze({
  DRAFT: "draft",
  PAID: "paid",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  VOIDED: "voided",
});

function uniqueId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortedSeasonings(values = []) {
  return [...new Set(values)].sort();
}

function lineKey(line) {
  return `${line.productCode}:${sortedSeasonings(line.seasonings).join(",")}:${line.variantId || "default"}`;
}

function mergeMatchingLines(lines = []) {
  const byKey = new Map();
  for (const line of lines) {
    const key = lineKey(line);
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      existing.packed = existing.packed && line.packed;
    } else {
      byKey.set(key, { ...line, seasonings: sortedSeasonings(line.seasonings) });
    }
  }
  return [...byKey.values()].filter((line) => line.quantity > 0);
}

export function createOrder({ id = uniqueId("order"), pickupNumber, colorKey, storeCode, operator, now = new Date().toISOString() }) {
  return {
    id,
    pickupNumber,
    colorKey,
    storeCode,
    operator: { id: String(operator?.id || ""), name: String(operator?.name || "").trim() },
    status: ORDER_STATUS.DRAFT,
    lines: [],
    reviewConfirmed: false,
    payment: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    events: [{ id: uniqueId("event"), type: "order_created", at: now }],
  };
}

export function orderTotals(order) {
  const subtotal = order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discount = Math.max(0, Math.min(subtotal, Number(order.discount?.amount) || 0));
  return { subtotal, discount, total: subtotal - discount };
}

export function distinctProductCount(order) {
  return new Set(order.lines.filter((line) => line.quantity > 0).map((line) => line.productCode)).size;
}

export function requiresOrderReview(order) {
  return distinctProductCount(order) >= 4 && !order.reviewConfirmed;
}

export function orderItemCount(order) {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function allItemsPacked(order) {
  return order.lines.length > 0 && order.lines.every((line) => line.packed);
}

function appendEvent(order, type, details, now) {
  return {
    ...order,
    updatedAt: now,
    events: [...order.events, { id: uniqueId("event"), type, details, at: now }],
  };
}

function assertDraft(order) {
  if (order.status !== ORDER_STATUS.DRAFT) throw new Error("此訂單已收款，不能直接修改商品");
}

export function executeOrderCommand(order, command, products = [], now = new Date().toISOString()) {
  const productByCode = new Map(products.map((product) => [product.code, product]));
  switch (command.type) {
    case "add_product": {
      assertDraft(order);
      const product = productByCode.get(command.productCode);
      if (!product || product.isActive === false) throw new Error("商品目前不可使用");
      if (product.isPriceConfirmed === false) throw new Error("商品價格尚未設定");
      const nextLines = mergeMatchingLines([...order.lines, {
        id: uniqueId("line"),
        productCode: product.code,
        productName: product.name,
        unitPrice: Math.max(0, Math.round(Number(product.price) || 0)),
        fixedWeightGrams: product.fixedWeightGrams || null,
        quantity: 1,
        seasonings: [],
        packed: false,
        variantId: null,
      }]);
      return appendEvent({ ...order, lines: nextLines, reviewConfirmed: false }, "product_added", { productCode: product.code }, now);
    }
    case "change_quantity": {
      assertDraft(order);
      const quantity = Math.max(0, Math.floor(Number(command.quantity) || 0));
      const nextLines = order.lines.map((line) => line.id === command.lineId ? { ...line, quantity } : line).filter((line) => line.quantity > 0);
      return appendEvent({ ...order, lines: nextLines, reviewConfirmed: false }, "quantity_changed", { lineId: command.lineId, quantity }, now);
    }
    case "toggle_seasoning": {
      assertDraft(order);
      const nextLines = order.lines.map((line) => {
        if (line.id !== command.lineId) return line;
        const selected = new Set(line.seasonings);
        selected.has(command.seasoning) ? selected.delete(command.seasoning) : selected.add(command.seasoning);
        return { ...line, seasonings: [...selected] };
      });
      return appendEvent({ ...order, lines: mergeMatchingLines(nextLines) }, "seasoning_changed", { lineId: command.lineId, seasoning: command.seasoning }, now);
    }
    case "split_line": {
      assertDraft(order);
      const source = order.lines.find((line) => line.id === command.lineId);
      if (!source || source.quantity < 2) throw new Error("至少二份才能分開調味");
      const splitKey = uniqueId("variant");
      const nextLines = order.lines.flatMap((line) => {
        if (line.id !== source.id) return line;
        return [
          { ...line, quantity: line.quantity - 1, variantId: line.variantId || `${splitKey}-base` },
          { ...line, id: uniqueId("line"), quantity: 1, variantId: `${splitKey}-split` },
        ];
      });
      return appendEvent({ ...order, lines: nextLines, reviewConfirmed: false }, "line_split", { lineId: command.lineId }, now);
    }
    case "confirm_review":
      return appendEvent({ ...order, reviewConfirmed: true }, "large_order_reviewed", {}, now);
    case "pay": {
      assertDraft(order);
      if (!order.lines.length) throw new Error("請先加入商品");
      if (requiresOrderReview(order)) throw new Error("四種以上商品，請先完成再次核對");
      const { total } = orderTotals(order);
      const received = Math.max(0, Math.round(Number(command.received) || 0));
      if (received < total) throw new Error("付款金額不足");
      return appendEvent({
        ...order,
        status: ORDER_STATUS.PAID,
        payment: { received, change: received - total, paidAt: now },
        lines: order.lines.map((line) => ({ ...line, packed: false })),
      }, "payment_completed", { received, total, change: received - total }, now);
    }
    case "toggle_packed": {
      if (order.status !== ORDER_STATUS.PAID) throw new Error("請先完成收款");
      const nextLines = order.lines.map((line) => line.id === command.lineId ? { ...line, packed: !line.packed } : line);
      return appendEvent({ ...order, lines: nextLines }, "packing_checked", { lineId: command.lineId }, now);
    }
    case "complete": {
      if (order.status !== ORDER_STATUS.PAID) throw new Error("請先完成收款");
      if (!allItemsPacked(order)) throw new Error("尚有商品未完成打包核對");
      return appendEvent({ ...order, status: ORDER_STATUS.COMPLETED, completedAt: now }, "order_completed", {}, now);
    }
    case "cancel": {
      assertDraft(order);
      const reason = String(command.reason || "").trim();
      if (!reason) throw new Error("取消訂單請填寫原因");
      return appendEvent({ ...order, status: ORDER_STATUS.CANCELLED }, "order_cancelled", { reason }, now);
    }
    default:
      throw new Error("不支援的訂單操作");
  }
}

export function orderLineSummary(line) {
  const weight = line.fixedWeightGrams ? `｜${line.fixedWeightGrams}克` : "";
  return `${line.productName} × ${line.quantity}｜${seasoningLabel(line.seasonings)}${weight}`;
}
