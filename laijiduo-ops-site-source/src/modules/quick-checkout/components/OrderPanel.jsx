import { orderLineSummary, orderTotals, SEASONINGS, seasoningLabel } from "../index.js";

export function OrderPanel({ editable = true, onCommand, order }) {
  const totals = orderTotals(order);
  return (
    <aside className={`qc-order-panel color-${order.colorKey}`}>
      <header>
        <div>
          <span>目前訂單</span>
          <h2>{order.pickupNumber}</h2>
        </div>
        <strong>NT${totals.total}</strong>
      </header>

      <div className="qc-order-lines">
        {!order.lines.length && <div className="qc-empty-order"><strong>尚未加入商品</strong><span>請點左側商品開始點單</span></div>}
        {order.lines.map((line) => (
          <article className="qc-order-line" key={line.id}>
            <div className="qc-line-heading">
              <div>
                <strong>{line.productName}</strong>
                {line.fixedWeightGrams && <span>{line.fixedWeightGrams} 克</span>}
              </div>
              <em>NT${line.unitPrice * line.quantity}</em>
            </div>
            {editable && (
              <>
                <div className="qc-quantity-control" aria-label={`${line.productName}數量`}>
                  <button type="button" onClick={() => onCommand({ type: "change_quantity", lineId: line.id, quantity: line.quantity - 1 })}>−</button>
                  <strong>{line.quantity}</strong>
                  <button type="button" onClick={() => onCommand({ type: "change_quantity", lineId: line.id, quantity: line.quantity + 1 })}>＋</button>
                </div>
                <div className="qc-seasonings" aria-label={`${line.productName}調味`}>
                  {SEASONINGS.map((seasoning) => (
                    <button
                      className={line.seasonings.includes(seasoning.code) ? "selected" : ""}
                      key={seasoning.code}
                      onClick={() => onCommand({ type: "toggle_seasoning", lineId: line.id, seasoning: seasoning.code })}
                      type="button"
                    >
                      {line.seasonings.includes(seasoning.code) ? "✓ " : ""}{seasoning.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p>{seasoningLabel(line.seasonings)}</p>
          </article>
        ))}
      </div>

      {!!order.lines.length && (
        <div className="qc-order-summary">
          {order.lines.map((line) => <span key={line.id}>{orderLineSummary(line)}</span>)}
          <div><span>總額</span><strong>NT${totals.total}</strong></div>
        </div>
      )}
    </aside>
  );
}
