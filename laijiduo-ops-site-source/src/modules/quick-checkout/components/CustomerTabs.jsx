import { useState } from "react";
import { orderTotals } from "../index.js";
import { CheckoutDialog } from "./CheckoutDialog.jsx";
const labels = { draft: "點單中", packing: "待打包", packed: "待付款", paid: "已付款待核對" };
export function CustomerTabs({ activeOrderId, onAdd, onSelect, orders }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [filter, setFilter] = useState("all");
  const nearby = [orders.find(o => o.id === activeOrderId), ...orders.filter(o => o.id !== activeOrderId)].filter(Boolean).slice(0, 2);
  const matches = orders.filter(o => (filter === "all" || o.status === filter) && `${o.pickupNumber} ${o.lines.map(l => l.productName).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
  async function select(id) { const result = await onSelect(id); if (result !== null) setOpen(false); }
  return <>
    <div className="qc-customer-strip" aria-label="進行中客人">
      {nearby.map(o => <button key={o.id} className={`qc-customer-tab color-${o.colorKey} ${o.id === activeOrderId ? "active" : ""}`} aria-pressed={o.id === activeOrderId} onClick={() => onSelect(o.id)} type="button"><strong>{o.pickupNumber}</strong><span>{labels[o.status]}</span><em>NT$ {orderTotals(o).total}</em></button>)}
      <button className="qc-add-customer" onClick={() => setOpen(true)} type="button"><strong>暫存管理</strong><span>共 {orders.length} 單</span></button>
      <button className="qc-add-customer" onClick={onAdd} type="button"><strong>＋</strong><span>下一位客人</span></button>
    </div>
    {open && <CheckoutDialog title="待處理訂單與暫存切換" onClose={() => setOpen(false)} className="qc-customer-manager">
      <p>共 {orders.length} 位客人 · {orders.filter(o => o.status === "packed").length} 單待付款</p>
      <label className="qc-search">搜尋取餐號或品項<input value={search} onChange={e => setSearch(e.target.value)} placeholder="例如 A03、雞排" type="search" /></label>
      <div className="qc-filter-tabs">{[["all", "全部"], ["draft", "點單中"], ["packing", "待打包"], ["packed", "待付款"], ["paid", "已付款待核對"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} ({orders.filter(o => value === "all" || o.status === value).length})</button>)}</div>
      <div className="qc-pending-list">{matches.map(o => <article key={o.id} className={`qc-pending-order color-${o.colorKey} ${o.id === activeOrderId ? "active" : ""}`}><header><strong>{o.pickupNumber}</strong><span className="qc-status">{labels[o.status]}</span><b>NT$ {orderTotals(o).total}</b></header><p>{o.lines.map(l => `${l.productName} × ${l.quantity}`).join(" · ") || "尚未加入商品"}</p><button className="qc-primary-action" type="button" onClick={() => select(o.id)}>{o.id === activeOrderId ? "返回目前訂單" : "切換此訂單"}</button></article>)}{!matches.length && <p>沒有符合的訂單</p>}</div>
    </CheckoutDialog>}
  </>;
}
