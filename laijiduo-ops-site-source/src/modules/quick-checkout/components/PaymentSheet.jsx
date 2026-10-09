import { useState } from "react";
import { orderTotals, orderItemCount } from "../index.js";
import { CheckoutDialog } from "./CheckoutDialog.jsx";
export function PaymentSheet({ onClose, onPay, order }) {
  const { total } = orderTotals(order);
  const [received, setReceived] = useState(String(total)), [replace, setReplace] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const valid = /^\d+$/.test(received) && Number.isSafeInteger(Number(received));
  const paid = valid ? Number(received) : 0, change = paid - total;
  function key(value) {
    setReceived(current => value === "back" ? current.slice(0, -1) : `${replace ? "" : current}${value}`.replace(/^0+(?=\d)/, "").slice(0, 9));
    setReplace(false);
  }
  async function pay() {
    if (saving || !valid || change < 0) return;
    setSaving(true); setError("");
    try { const result = await onPay(paid); if (result === null) setError("尚未確認收款成功，請查看訊息後再操作。"); }
    catch (e) { setError(e.message || "收款未完成"); }
    finally { setSaving(false); }
  }
  return <CheckoutDialog title="付款與找零" onClose={onClose} busy={saving} className="qc-payment-sheet">
    <div className="qc-payment-context"><strong>{order.pickupNumber}</strong><span>{orderItemCount(order)} 份餐點 · 打包已完成</span><span className="qc-status">待付款</span></div>
    <fieldset disabled={saving} className="qc-payment-controls"><div className="qc-money-grid"><div><span>應收金額</span><strong>NT$ {total}</strong></div><label>客人付款金額<input aria-label="客人付款金額" inputMode="numeric" type="text" value={received} onFocus={e => e.target.select()} onChange={e => { setReceived(e.target.value.replace(/[^0-9]/g, "").slice(0, 9)); setReplace(false); }} /></label></div>
    <div className={`qc-change ${change < 0 || !valid ? "short" : ""}`} aria-live="polite"><span>{!valid ? "請輸入付款金額" : change < 0 ? "尚差" : "找零"}</span><strong>NT$ {Math.abs(change)}</strong></div>
    <div className="qc-payment-shortcuts">{[total, 200, 500, 1000].filter((v, i, a) => v >= total && a.indexOf(v) === i).map(v => <button type="button" aria-pressed={paid === v} key={v} onClick={() => { setReceived(String(v)); setReplace(true); }}>{v === total ? "剛好" : "付款"}<strong>$ {v}</strong></button>)}</div>
    <div className="qc-keypad">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"].map(v => <button key={v} aria-label={v === "back" ? "刪除一位" : v} onClick={() => key(v)} type="button">{v === "back" ? "⌫" : v}</button>)}</div>
    {error && <p role="alert" className="qc-inline-error">{error}</p>}
    <button className="qc-primary-action qc-pay-confirm" disabled={!valid || change < 0 || saving} onClick={pay} type="button">{saving ? "確認中…" : `確認收款 · 找零 $ ${Math.max(0, change)}`}</button></fieldset>
  </CheckoutDialog>;
}
