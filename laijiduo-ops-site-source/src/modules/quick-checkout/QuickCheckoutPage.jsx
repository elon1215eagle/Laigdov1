import { useEffect, useMemo, useState } from "react";
import {
  activeOrder,
  allItemsPacked,
  createMemoryQuickCheckoutAdapter,
  createQuickCheckoutModule,
  orderItemCount,
  orderLineSummary,
  orderTotals,
  ORDER_STATUS,
  QUICK_CHECKOUT_DEMO_PRODUCTS,
  requiresOrderReview,
  visibleOrders,
} from "./index.js";
import { CustomerTabs } from "./components/CustomerTabs.jsx";
import { OrderPanel } from "./components/OrderPanel.jsx";
import { PaymentSheet } from "./components/PaymentSheet.jsx";
import { ProductGrid } from "./components/ProductGrid.jsx";
import "./quickCheckout.css";

const DEMO_STORES = [
  ["S01", "鳳山五甲店"], ["S02", "鳳山凱旋店"], ["S03", "鳳山武廟店"],
  ["S04", "鳳山中山店"], ["S05", "前鎮隆興店"], ["S06", "鳳山南華店"],
  ["S07", "三民大昌店"], ["S08", "三民義華店"], ["S09", "三民鼎山店"],
  ["S10", "屏東潮州店"], ["S11", "屏東潮二店"],
];

const quickCheckout = createQuickCheckoutModule({
  adapter: createMemoryQuickCheckoutAdapter(),
  products: QUICK_CHECKOUT_DEMO_PRODUCTS,
});

function SetupScreen({ onStart }) {
  const [storeCode, setStoreCode] = useState("S01");
  const [employeeCode, setEmployeeCode] = useState("");
  const store = DEMO_STORES.find(([code]) => code === storeCode);
  return (
    <main className="qc-setup-shell">
      <section className="qc-setup-card">
        <div className="qc-brand-mark">萊</div>
        <div><span>萊吉多</span><h1>簡易點單結算</h1><p>員工點單、收款與打包核對</p></div>
        <label>這台裝置使用門店<select value={storeCode} onChange={(event) => setStoreCode(event.target.value)}>{DEMO_STORES.map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}</select></label>
        <label>操作人員員工碼<input autoComplete="off" inputMode="numeric" placeholder="請輸入員工碼" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value.trim())} /></label>
        <button className="qc-primary-action" disabled={!employeeCode} onClick={() => onStart({ storeCode, storeName: store[1], operator: { id: employeeCode, name: `員工 ${employeeCode}` } })} type="button">開始點單</button>
        <small>開發驗收模式：正式版會由店長或總部一次性綁定門店，售價亦須經總部核定。</small>
      </section>
    </main>
  );
}

export function QuickCheckoutPage() {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    quickCheckout.loadWorkspace().then((saved) => { setWorkspace(saved); setLoading(false); });
  }, []);

  const orders = useMemo(() => workspace ? visibleOrders(workspace) : [], [workspace]);
  const order = workspace ? activeOrder(workspace) : null;

  async function run(command) {
    try {
      const next = await quickCheckout.execute(workspace, command);
      setWorkspace(next);
      setMessage("");
      return next;
    } catch (error) {
      setMessage(error.message);
      return null;
    }
  }

  async function startWorkspace(setup) {
    let next = await quickCheckout.startWorkspace(setup);
    next = await quickCheckout.execute(next, { type: "open_order" });
    setWorkspace(next);
  }

  async function resetDevice() {
    if (!window.confirm("確定結束目前操作並清除此裝置上的開發測試資料？")) return;
    await quickCheckout.reset();
    setWorkspace(null);
  }

  async function cancelDraft() {
    const next = await run({ type: "order_command", command: { type: "cancel", reason: cancelReason } });
    if (!next) return;
    setCancelOpen(false);
    setCancelReason("");
  }

  if (loading) return <div className="qc-loading">載入點單資料...</div>;
  if (!workspace) return <SetupScreen onStart={startWorkspace} />;

  return (
    <main className="qc-app-shell">
      <header className="qc-topbar">
        <div><div className="qc-brand-mark">萊</div><div><strong>簡易點單結算</strong><span>{workspace.storeCode} {workspace.storeName} · {workspace.operator.name}</span></div></div>
        <button onClick={resetDevice} type="button">結束操作</button>
      </header>

      <CustomerTabs
        activeOrderId={workspace.activeOrderId}
        onAdd={() => run({ type: "open_order" })}
        onSelect={(orderId) => run({ type: "switch_order", orderId })}
        orders={orders}
      />

      {message && <div className="qc-message" role="alert">{message}</div>}

      {order ? (
        <div className="qc-workspace">
          {order.status === ORDER_STATUS.DRAFT && <ProductGrid products={quickCheckout.catalog} onAdd={(productCode) => run({ type: "order_command", command: { type: "add_product", productCode } })} />}
          <OrderPanel editable={order.status === ORDER_STATUS.DRAFT} order={order} onCommand={(command) => run({ type: "order_command", command })} />
        </div>
      ) : (
        <section className="qc-no-orders"><strong>目前沒有進行中訂單</strong><span>請按上方「下一位客人」開始點單</span></section>
      )}

      {order && (
        <footer className={`qc-actionbar color-${order.colorKey}`}>
          <div><span>{order.pickupNumber} · 共 {orderItemCount(order)} 份</span><strong>NT${orderTotals(order).total}</strong></div>
          {order.status === ORDER_STATUS.DRAFT && (
            <div className="qc-draft-actions">
              <button className="qc-secondary-action" onClick={() => setCancelOpen(true)} type="button">取消本單</button>
              {requiresOrderReview(order)
                ? <button className="qc-primary-action" onClick={() => run({ type: "order_command", command: { type: "confirm_review" } })} type="button">四種以上，核對完成</button>
                : <button className="qc-primary-action" disabled={!order.lines.length} onClick={() => setPaymentOpen(true)} type="button">收款結帳</button>}
            </div>
          )}
          {order.status === ORDER_STATUS.PAID && (
            <div className="qc-pack-actions">
              <span>已收款 · 找零 NT${order.payment.change}</span>
              <button className="qc-primary-action" disabled={!allItemsPacked(order)} onClick={() => run({ type: "order_command", command: { type: "complete" } })} type="button">全部打包完成</button>
            </div>
          )}
        </footer>
      )}

      {order?.status === ORDER_STATUS.PAID && (
        <section className={`qc-packing-panel color-${order.colorKey}`}>
          <h2>{order.pickupNumber} 打包核對</h2>
          {order.lines.map((line) => (
            <button className={line.packed ? "packed" : ""} key={line.id} onClick={() => run({ type: "order_command", command: { type: "toggle_packed", lineId: line.id } })} type="button">
              <span>{line.packed ? "✓" : "□"}</span><strong>{orderLineSummary(line)}</strong>
            </button>
          ))}
        </section>
      )}

      {paymentOpen && order && <PaymentSheet order={order} onClose={() => setPaymentOpen(false)} onPay={async (received) => { const next = await run({ type: "order_command", command: { type: "pay", received } }); if (next) setPaymentOpen(false); }} />}
      {cancelOpen && order && (
        <div className="qc-overlay">
          <section aria-label="取消訂單" aria-modal="true" className={`qc-cancel-sheet color-${order.colorKey}`} role="dialog">
            <header><div><span>{order.pickupNumber}</span><h2>取消這筆訂單</h2></div><button aria-label="關閉" onClick={() => setCancelOpen(false)} type="button">×</button></header>
            <label>取消原因<textarea autoFocus placeholder="例如：客人取消、重複建立" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label>
            <small>取消後不能直接刪除，系統會保留操作人員、時間與原因。</small>
            <button className="qc-primary-action" disabled={!cancelReason.trim()} onClick={cancelDraft} type="button">確認取消並留存紀錄</button>
          </section>
        </div>
      )}
    </main>
  );
}
