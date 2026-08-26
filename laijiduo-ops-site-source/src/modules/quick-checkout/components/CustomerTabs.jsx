import { orderItemCount, orderTotals, ORDER_STATUS } from "../index.js";

function statusLabel(order) {
  if (order.status === ORDER_STATUS.PAID) return "待打包";
  return order.lines.length ? "點單中" : "新客人";
}

export function CustomerTabs({ activeOrderId, onAdd, onSelect, orders }) {
  return (
    <div className="qc-customer-strip" role="tablist" aria-label="進行中客人">
      {orders.map((order) => (
        <button
          className={`qc-customer-tab color-${order.colorKey} ${order.id === activeOrderId ? "active" : ""}`}
          key={order.id}
          onClick={() => onSelect(order.id)}
          role="tab"
          type="button"
        >
          <strong>{order.pickupNumber}</strong>
          <span>{statusLabel(order)} · {orderItemCount(order)}份</span>
          <em>NT${orderTotals(order).total}</em>
        </button>
      ))}
      <button className="qc-add-customer" onClick={onAdd} type="button">
        <strong>＋</strong>
        <span>下一位客人</span>
      </button>
    </div>
  );
}
