import { useState } from "react";
import { orderTotals } from "../index.js";

export function PaymentSheet({ onClose, onPay, order }) {
  const { total } = orderTotals(order);
  const [received, setReceived] = useState(String(total));
  const paid = Math.max(0, Math.round(Number(received) || 0));
  const change = paid - total;
  return (
    <div className="qc-overlay" role="presentation">
      <section className={`qc-payment-sheet color-${order.colorKey}`} role="dialog" aria-modal="true" aria-label="收款結帳">
        <header><div><span>{order.pickupNumber}</span><h2>收款結帳</h2></div><button aria-label="關閉" onClick={onClose} type="button">×</button></header>
        <div className="qc-payment-total"><span>應收金額</span><strong>NT${total}</strong></div>
        <div className="qc-payment-shortcuts">
          {[total, 300, 500, 1000].filter((value, index, values) => value >= total && values.indexOf(value) === index).map((value) => (
            <button key={value} onClick={() => setReceived(String(value))} type="button">{value === total ? "剛好" : value}</button>
          ))}
        </div>
        <label>客人付款金額<input autoFocus inputMode="numeric" min={0} onChange={(event) => setReceived(event.target.value)} type="number" value={received} /></label>
        <div className={`qc-change ${change < 0 ? "short" : ""}`}><span>{change < 0 ? "尚差" : "找零"}</span><strong>NT${Math.abs(change)}</strong></div>
        <button className="qc-primary-action" disabled={change < 0} onClick={() => onPay(paid)} type="button">確認收款</button>
      </section>
    </div>
  );
}
