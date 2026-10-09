import { useState } from "react";
export function ProductGrid({ onAdd, products, order }) {
  const [category, setCategory] = useState("全部");
  const categories = ["全部", ...new Set(products.map(p => p.category))];
  return <section className="qc-product-groups" aria-label="商品選單"><div className="qc-filter-tabs">{categories.map(c => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="qc-product-grid">{products.filter(p => category === "全部" || p.category === category).map(p => {
    const quantity = order?.lines.filter(l => l.productCode === p.code).reduce((sum, l) => sum + l.quantity, 0) || 0;
    return <button className={`qc-product-button ${quantity ? "has-items" : ""}`} disabled={!p.isPriceConfirmed} key={p.code} onClick={() => onAdd(p.code)} type="button" aria-label={`加入${p.name}`}><strong>{p.name}</strong><span>{p.fixedWeightGrams ? `${p.fixedWeightGrams} 克` : p.category}</span><em>{p.isPriceConfirmed ? `NT$ ${p.price}` : "待設定價格"}</em>{quantity > 0 && <small className="qc-selected-count">已選 {quantity}</small>}</button>;
  })}</div></section>;
}
