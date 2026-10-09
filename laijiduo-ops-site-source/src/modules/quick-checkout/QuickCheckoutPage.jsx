import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeOrder,
  allItemsPacked,
  bindQuickCheckoutDevice,
  clearQuickCheckoutDevice,
  createQuickCheckoutModule,
  createSupabaseQuickCheckoutAdapter,
  loadQuickCheckoutDevice,
  orderItemCount,
  orderTotals,
  ORDER_STATUS,
  QUICK_CHECKOUT_DEMO_PRODUCTS,
  requiresOrderReview,
  visibleOrders,
} from "./index.js";
import { hasSupabaseConfig, supabase } from "../../lib/supabase.js";
import { CustomerTabs } from "./components/CustomerTabs.jsx";
import { OrderPanel } from "./components/OrderPanel.jsx";
import { PaymentSheet } from "./components/PaymentSheet.jsx";
import { ProductGrid } from "./components/ProductGrid.jsx";
import { PackingPanel } from "./components/PackingPanel.jsx";
import "./quickCheckout.css";
import "./checkoutDesign.css";

const DEMO_STORES = [
  ["S01", "鳳山五甲店"], ["S02", "鳳山凱旋店"], ["S03", "鳳山武廟店"],
  ["S04", "鳳山中山店"], ["S05", "前鎮隆興店"], ["S06", "鳳山南華店"],
  ["S07", "三民大昌店"], ["S08", "三民義華店"], ["S09", "三民鼎山店"],
  ["S10", "屏東潮州店"], ["S11", "屏東潮二店"],
];

function DeviceBindingScreen({ message, onBound }) {
  const [storeCode, setStoreCode] = useState("S01");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(message || "");

  async function bindDevice(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const device = await bindQuickCheckoutDevice({
        email: email.trim(), password, storeCode, label: `${storeCode} 前台點單裝置`,
      });
      onBound(device);
    } catch (bindError) {
      setError(bindError.message || "裝置綁定失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="qc-setup-shell">
      <form className="qc-setup-card" onSubmit={bindDevice}>
        <div className="qc-brand-mark">萊</div>
        <div><span>萊吉多</span><h1>綁定門市裝置</h1><p>只需設定一次，之後員工免帳號即可使用。</p></div>
        {error && <div className="qc-inline-error" role="alert">{error}</div>}
        <label>使用門市<select value={storeCode} onChange={(event) => setStoreCode(event.target.value)}>{DEMO_STORES.map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}</select></label>
        <label>管理者帳號<input autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>管理者密碼<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="qc-primary-action" disabled={saving || !email || !password} type="submit">{saving ? "綁定中..." : "確認綁定此門市"}</button>
        <small>僅 CEO、COO、總部管理者或該店店長可執行綁定；密碼不會儲存在裝置。</small>
      </form>
    </main>
  );
}

function SetupScreen({ device, onStart, onUnbind }) {
  const [employeeCode, setEmployeeCode] = useState("");
  return (
    <main className="qc-setup-shell">
      <section className="qc-setup-card">
        <div className="qc-brand-mark">萊</div>
        <div><span>萊吉多</span><h1>簡易點單結算</h1><p>員工點單、收款與打包核對</p></div>
        <label>這台裝置使用門市<input disabled value={`${device.storeCode} ${device.storeName}`} /></label>
        <label>操作人員員工碼<input autoComplete="off" inputMode="numeric" placeholder="請輸入員工碼" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value.trim())} /></label>
        <button className="qc-primary-action" disabled={!employeeCode} onClick={() => onStart({ storeCode: device.storeCode, storeName: device.storeName, operator: { id: employeeCode, name: `員工 ${employeeCode}` } })} type="button">開始點單</button>
        <button className="qc-text-action" onClick={onUnbind} type="button">解除這台裝置的門市綁定</button>
        <small>完成綁定後，員工每天只需輸入員工碼，不需管理者帳號。</small>
      </section>
    </main>
  );
}

export function QuickCheckoutPage() {
  const [device, setDevice] = useState(() => loadQuickCheckoutDevice());
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const busy = useRef(false);
  const [message, setMessage] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const quickCheckout = useMemo(() => device && hasSupabaseConfig
    ? createQuickCheckoutModule({
      adapter: createSupabaseQuickCheckoutAdapter({ client: supabase, deviceToken: device.deviceToken }),
      products: QUICK_CHECKOUT_DEMO_PRODUCTS,
    })
    : null, [device]);

  useEffect(() => {
    if (!quickCheckout) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setLoadError("");
    quickCheckout.loadWorkspace()
      .then((saved) => { if (active) setWorkspace(saved); })
      .catch((error) => {
        if (!active) return;
        if (error.message === "invalid or revoked device") {
          clearQuickCheckoutDevice();
          setDevice(null);
          setMessage("裝置綁定已失效，請由管理者重新綁定門市。");
        } else {
          setLoadError("目前無法確認雲端點單資料，門市綁定已保留。請恢復連線後重試。");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quickCheckout, reloadKey]);

  const orders = useMemo(() => workspace ? visibleOrders(workspace) : [], [workspace]);
  const order = workspace ? activeOrder(workspace) : null;

  async function run(command) {
    if (busy.current) return null;
    busy.current = true;
    try {
      const next = await quickCheckout.execute(workspace, command);
      setWorkspace(next);
      setMessage("");
      return next;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      busy.current = false;
    }
  }

  async function startWorkspace(setup) {
    if (busy.current) return;
    busy.current = true;
    try {
      let next = await quickCheckout.startWorkspace(setup);
      setWorkspace(next);
      next = await quickCheckout.execute(next, { type: "open_order" });
      setWorkspace(next);
    } catch {
      setLoadError("操作結果待確認，請重新讀取雲端資料，勿重複建立。");
    } finally { busy.current = false; }
  }

  async function resetDevice() {
    if (busy.current) return;
    if (orders.length) { setMessage("尚有未完成訂單，請先完成或逐筆取消並留下原因。"); return; }
    if (!window.confirm("確定結束目前操作？已完成訂單仍保留於雲端。")) return;
    busy.current = true;
    try { await quickCheckout.reset(); setWorkspace(null); }
    catch { setLoadError("結束操作結果待確認，請重新讀取雲端資料。"); }
    finally { busy.current = false; }
  }

  function unbindDevice() {
    if (!window.confirm("確定解除門市綁定？之後需由管理者重新驗證。")) return;
    clearQuickCheckoutDevice();
    setWorkspace(null);
    setDevice(null);
  }

  async function cancelDraft() {
    const next = await run({ type: "order_command", command: { type: "cancel", reason: cancelReason } });
    if (!next) return;
    setCancelOpen(false);
    setCancelReason("");
  }

  async function completePacking() {
    const next = await run({ type: "order_command", command: { type: "packing_complete" } });
    if (next) setPaymentOpen(true);
  }

  if (loading) return <div className="qc-loading">載入點單資料...</div>;
  if (loadError) return <main className="qc-setup-shell"><section className="qc-setup-card"><p role="alert">{loadError}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>重新讀取</button></section></main>;
  if (!device) return <DeviceBindingScreen message={message} onBound={(boundDevice) => { setMessage(""); setDevice(boundDevice); }} />;
  if (!workspace) return <SetupScreen device={device} onStart={startWorkspace} onUnbind={unbindDevice} />;

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
          {order.status === ORDER_STATUS.DRAFT && <ProductGrid order={order} products={quickCheckout.catalog} onAdd={(productCode) => run({ type: "order_command", command: { type: "add_product", productCode } })} />}
          {order.status === ORDER_STATUS.DRAFT
            ? <OrderPanel key={order.id} order={order} onCommand={(command) => run({ type: "order_command", command })} />
            : <PackingPanel order={order} readonly={order.status === ORDER_STATUS.PACKED} onCommand={(command) => run({ type: "order_command", command })} />}
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
                : <button className="qc-primary-action" disabled={!order.lines.length} onClick={() => run({ type: "order_command", command: { type: "begin_packing" } })} type="button">開始打包核對</button>}
            </div>
          )}
          {order.status === ORDER_STATUS.PACKING && (
            <div className="qc-pack-actions">
              <span>先依畫面逐項完成打包核對。</span>
              <button className="qc-secondary-action" onClick={() => setCancelOpen(true)} type="button">取消本單</button>
              <button className="qc-primary-action" disabled={!allItemsPacked(order)} onClick={completePacking} type="button">全部打包完成</button>
            </div>
          )}
          {order.status === ORDER_STATUS.PACKED && (
            <div className="qc-pack-actions">
              <span>打包核對已完成</span>
              <button className="qc-secondary-action" onClick={() => setCancelOpen(true)} type="button">取消本單</button>
              <button className="qc-primary-action" onClick={() => setPaymentOpen(true)} type="button">輸入付款金額</button>
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


      {paymentOpen && order?.status === ORDER_STATUS.PACKED && <PaymentSheet key={order.id} order={order} onClose={() => setPaymentOpen(false)} onPay={async (received) => { const next = await run({ type: "order_command", command: { type: "pay", received } }); if (next) { setPaymentOpen(false); setMessage(`收款完成 · ${order.pickupNumber} · 找零 NT$ ${next.orders.find(o => o.id === order.id)?.payment?.change ?? 0}`); } return next; }} />}
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
