import React, { useEffect, useRef, useState } from 'react';
import { transferRepository } from './repository.js';
import { ACTIONS, CATEGORIES, STATUS, allowsStockPickup, draftError, localDate, orderNumber, permissions, productAllowsRoute, quantityChanged, validQuantity } from './domain.js';
import './transfers.css';
import TransferInbox from './TransferInbox.jsx';
import TransferPushSettings from '../transfer-push/TransferPushSettings.jsx';
import DeliverySheet from '../transfer-delivery/DeliverySheet.jsx';

const TABS = [['new', '我要調貨'], ['requested', '待我出貨'], ['shipped', '待我收貨'], ['disputed', '差異處理'], ['delivery', '每日送貨表'], ['history', '調貨紀錄']];
const uuid = () => crypto.randomUUID();
const when = v => new Date(v).toLocaleString('zh-TW', { hour12: false });
const Qty = ({ value, onChange, label, zero = false }) => <input aria-label={label} type="number" inputMode="decimal" min={zero ? 0 : 0.001} max="1000000" step="0.001" value={value} onChange={e => onChange(e.target.value)} required />;
function StoreSelect({ stores, value, onChange, exclude, label }) {
  return <label>{label}<select aria-label={label} value={value} onChange={e => onChange(e.target.value)} required><option value="">請選擇門店</option>{stores.filter(s => s.code !== exclude).map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}</select></label>;
}
function LineTable({ lines, comparison }) {
  return <div className="tr-lines">{lines.map(x => {
    const prev = comparison?.find(p => p.product_id === x.product_id);
    return <div className="tr-line" key={x.product_id}><div><strong>{x.name}</strong>{x.stock_pickup && <small className="tr-stock-note">庫存取貨</small>}{x.spec && <small>{x.spec}</small>}<small>{x.code}</small></div><div className="tr-amount"><strong>{x.quantity} {x.unit}</strong>{prev && Number(prev.quantity) !== Number(x.quantity) && <small className="tr-warning">原數量 {prev.quantity} {prev.unit}</small>}</div></div>;
  })}</div>;
}

export default function TransferCenter({ repository = transferRepository }) {
  const [context, setContext] = useState(null);
  const [tab, setTab] = useState('shipped');
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inboxRevision, setInboxRevision] = useState(0);
  const [filters, setFilters] = useState({ store: '', from: '', to: '', status: '' });
  const [more, setMore] = useState(false);
  const lock = useRef(false);
  const pending = useRef(null);
  const listGeneration = useRef(0);

  async function bootstrap() {
    try { setContext(await repository.call('bootstrap')); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { bootstrap(); }, [repository]);
  useEffect(() => {
    if (!context) return;
    const id = new URLSearchParams(window.location.search).get('transfer');
    if (/^[0-9a-f-]{36}$/i.test(id || '')) {
      open(id);
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (id === 'inbox') window.history.replaceState(null, '', window.location.pathname);
  }, [context]);
  async function refresh(append = false) {
    if (!context || ['new', 'catalog', 'delivery'].includes(tab)) return;
    const generation = ++listGeneration.current;
    setLoading(true);
    try {
      const payload = tab === 'history' ? { ...filters } : { status: tab };
      // Server applies ownership filtering; this narrows the store's action inbox.
      const found = await repository.call('list', { ...payload, offset: append ? rows.length : 0 });
      if (generation !== listGeneration.current) return;
      setRows(previous => append ? [...previous, ...found] : found);
      setMore(found.length === 100);
    } catch (e) { if (generation === listGeneration.current) setError(e.message); }
    finally { if (generation === listGeneration.current) setLoading(false); }
  }
  useEffect(() => { setRows([]); setMore(false); refresh(); return () => { listGeneration.current++; }; }, [context, tab, filters]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible' && !lock.current && !detail) refresh(); };
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [context, tab, filters, detail]);

  async function open(id) {
    setError(''); setLoading(true);
    try { setDetail(await repository.call('detail', { id })); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function command(action, payload) {
    if (lock.current) return null;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const signature = JSON.stringify([action, payload]);
    if (pending.current?.signature !== signature) pending.current = { signature, id: uuid() };
    try {
      const result = await repository.call(action, { ...payload, command_id: pending.current.id });
      pending.current = null;
      setInboxRevision(n => n + 1);
      setNotice(action === 'product' ? '品項設定已儲存' : '調貨單已儲存');
      return result;
    } catch (e) { setError(e.message); return null; }
    finally { lock.current = false; setBusy(false); }
  }
  const changeTab = value => { if (busy) return; setTab(value); setDetail(null); setError(''); setNotice(''); };
  const visibleRows = rows.filter(r => context?.actor.is_hq || tab === 'history' || tab === 'disputed' || (tab === 'requested' ? r.sender : r.receiver) === context?.actor.store);

  return <section className="transfer-center" aria-label="調貨中心">
    <header className="tr-header"><div><h2>調貨中心</h2>{context && <p>{context.actor.is_hq ? '總部管理 · 直營門店' : `${context.actor.store} ${context.stores.find(s => s.code === context.actor.store)?.name || ''}`}</p>}</div><button type="button" disabled={busy || loading} onClick={() => detail ? open(detail.id) : context ? refresh() : bootstrap()}>重新整理</button></header>
    {error && <div className="tr-error" role="alert">{error}</div>}
    {notice && <div className="tr-notice" role="status">{notice}</div>}
    {!context ? <p>{error ? '資料尚未載入，請重新整理或重新登入。' : '正在讀取調貨資料…'}</p> : <>
      <TransferInbox key={`inbox-${context.actor.id || context.actor.store}`} repository={repository} revision={inboxRevision} busy={busy || loading} onSelect={open} onGroup={changeTab} />
      <TransferPushSettings key={`push-${context.actor.id || context.actor.store}`} actor={context.actor} stores={context.stores} />
      <nav className="tr-tabs" aria-label="調貨功能">{[...TABS, ...(context.actor.is_hq ? [['catalog', '品項設定']] : [])].map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => changeTab(key)} disabled={busy}>{label}</button>)}</nav>
      {detail ? <TransferDetail key={`${detail.id}-${detail.version}`} row={detail} actor={context.actor} busy={busy} onBack={() => { setDetail(null); refresh(); }} onCommand={async (action, payload) => { const result = await command(action, payload); if (result) await open(result.id); }} />
        : tab === 'new' ? <TransferDraft context={context} busy={busy} onSubmit={async payload => { const result = await command('create', payload); if (result) { setTab('history'); await open(result.id); } return result; }} />
          : tab === 'catalog' ? <ProductSettings context={context} busy={busy} loadHistory={id => repository.call('product_history', { id })} save={async payload => { const result = await command('product', payload); if (result) await bootstrap(); return result; }} />
            : tab === 'delivery' ? <DeliverySheet actor={context.actor} onOpen={open} onBusy={setBusy} />
            : <>
              {tab === 'history' && <div className="tr-filters"><label>狀態<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">全部狀態</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{context.actor.is_hq && <label>門店<select value={filters.store} onChange={e => setFilters({ ...filters, store: e.target.value })}><option value="">全部門店</option>{context.stores.map(s => <option value={s.code} key={s.code}>{s.code} {s.name}</option>)}</select></label>}<label>開始日期<input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label><label>結束日期<input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label></div>}
              {loading && <p role="status">正在讀取…</p>}
              {!loading && !visibleRows.length && <div className="tr-empty">目前沒有{TABS.find(([k]) => k === tab)?.[1]}單據{tab === 'shipped' && <button type="button" onClick={() => changeTab('new')}>新增調貨申請</button>}</div>}
              <div className="tr-order-list">{visibleRows.map(r => <button className="tr-order" key={r.id} type="button" onClick={() => open(r.id)}><div><strong>{orderNumber(r.number)}</strong><span className={`tr-status tr-status-${r.status}`}>{STATUS[r.status]}</span></div><h3>{r.data.sender_name} → {r.data.receiver_name}</h3><p>{r.data.date} · {r.data.lines.length} 個品項 · {r.data.requester}</p></button>)}</div>
              {more && <button type="button" disabled={loading} onClick={() => refresh(true)}>載入更多單據</button>}
            </>}
    </>}
  </section>;
}

function TransferDraft({ context, busy, onSubmit }) {
  const { actor, stores, products } = context;
  const senders = context.senders || stores;
  const [draft, setDraft] = useState(() => ({ id: uuid(), receiver: actor.is_hq ? '' : actor.store, sender: '', date: localDate(), note: '', reason: '', lines: [] }));
  const [category, setCategory] = useState('肉品');
  const [search, setSearch] = useState('');
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const linesHeading = useRef(null);
  const pickerHeading = useRef(null);
  const patch = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setReview(false); };
  const editLine = (id, value) => patch('lines', draft.lines.map(x => x.product_id === id ? { ...x, ...value } : x));
  const available = products.filter(p => productAllowsRoute(p, draft.sender, draft.receiver) && (search ? `${p.name} ${p.code} ${p.spec}`.includes(search) : p.category === category));
  function add(p) { if (!draft.lines.some(x => x.product_id === p.id)) patch('lines', [...draft.lines, { product_id: p.id, code: p.code, name: p.name, category: p.category, spec: p.spec, quantity: 1, unit: p.units.length === 1 ? p.units[0] : '', units: p.units, stock_pickup: false }]); }
  function check(e) { e.preventDefault(); const msg = draftError(draft) || (actor.is_hq && !draft.reason.trim() ? '請填寫總部代建單原因' : ''); setError(msg); if (!msg) setReview(true); }
  return <form className="tr-draft" onSubmit={check}>
    <h3>{review ? '確認調貨內容' : '新增調貨申請'}</h3>
    {error && <p role="alert" className="tr-error">{error}</p>}
    <fieldset disabled={busy}>
      <div className="tr-form-grid">{actor.is_hq ? <StoreSelect label="收貨門店" stores={stores} value={draft.receiver} exclude={draft.sender} onChange={v => { patch('receiver', v); patch('lines', []); }} /> : <label>收貨門店<output>{actor.store} {stores.find(s => s.code === actor.store)?.name}</output></label>}
        <StoreSelect label="出貨門店" stores={senders} value={draft.sender} exclude={draft.receiver} onChange={v => { patch('sender', v); patch('lines', []); }} />
        <label>調貨日期<input type="date" value={draft.date} onChange={e => patch('date', e.target.value)} required /></label>
      </div>
      {!review && <>
        <section className="tr-catalog-picker"><h3 ref={pickerHeading}>選擇品項</h3><label>搜尋品項<input type="search" placeholder="品名、規格或代碼" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="tr-categories" role="group" aria-label="品項分類">{CATEGORIES.map(c => <button key={c} type="button" data-category={c} aria-pressed={category === c && !search} onClick={() => { setCategory(c); setSearch(''); }}>{c}</button>)}</div>
          {!draft.receiver || !draft.sender ? <p>請先選擇收貨店及出貨店。</p> : <div className="tr-products">{available.map(p => <button key={p.id} type="button" data-category={p.category} disabled={draft.lines.some(x => x.product_id === p.id)} onClick={() => add(p)}><strong>{p.name}</strong><small>{p.category} · {p.spec || p.code}</small><span>{draft.lines.some(x => x.product_id === p.id) ? '已加入' : `＋ ${p.units.join('／')}`}</span></button>)}{!available.length && <p>沒有符合的品項</p>}</div>}
          {draft.lines.length > 0 && <button className="tr-selected-jump" type="button" onClick={() => linesHeading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>已選 {draft.lines.length} 項 · 填寫數量與單位 ↓</button>}
        </section>
        <h3 ref={linesHeading}>調貨明細 · {draft.lines.length} 項</h3>
        {draft.lines.map(x => <div className="tr-draft-line" key={x.product_id}><div className="tr-line-title"><strong>{x.name}</strong><button type="button" aria-label={`移除${x.name}`} title="移除品項" onClick={() => patch('lines', draft.lines.filter(y => y.product_id !== x.product_id))}>×</button></div><small>{x.spec || x.code}</small><div className="tr-form-grid"><label>數量<Qty value={x.quantity} onChange={v => editLine(x.product_id, { quantity: v })} label={`${x.name}數量`} /></label><fieldset className="tr-unit-choice"><legend>單位</legend>{x.units.map(u => <label key={u}><input type="radio" name={`unit-${x.product_id}`} value={u} checked={x.unit === u} onChange={() => editLine(x.product_id, { unit: u })} required />{u}</label>)}</fieldset></div>{allowsStockPickup(x) && <label className="tr-check tr-stock-choice"><input type="checkbox" aria-label={`${x.name}庫存取貨`} checked={x.stock_pickup} onChange={e => editLine(x.product_id, { stock_pickup: e.target.checked })} />庫存取貨</label>}</div>)}
        {draft.lines.length > 0 && <button type="button" onClick={() => pickerHeading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>↑ 繼續選品</button>}
      </>}
      {review && <LineTable lines={draft.lines} />}
      <label>備註（選填）<textarea value={draft.note} maxLength={2000} onChange={e => patch('note', e.target.value)} /></label>
      {actor.is_hq && <label>總部代建單原因<textarea value={draft.reason} maxLength={2000} onChange={e => patch('reason', e.target.value)} required /></label>}
      <div className="tr-actions">{review ? <><button key="return-to-edit" type="button" onClick={e => { e.preventDefault(); setReview(false); }}>返回修改</button><button key="send-request" className="tr-primary" type="button" onClick={() => onSubmit({ ...draft, lines: draft.lines.map(({ product_id, quantity, unit, stock_pickup }) => ({ product_id, quantity: Number(quantity), unit, stock_pickup: !!stock_pickup })) })}>確認送出申請</button></> : <button key="review-request" className="tr-primary" type="submit">下一步：核對調貨內容</button>}</div>
    </fieldset>
  </form>;
}

function TransferDetail({ row, actor, busy, onBack, onCommand }) {
  const can = permissions(actor, row);
  const mainAction = can.ship ? 'ship' : can.receive ? 'receive' : '';
  const original = mainAction === 'receive' ? row.data.shipped : row.data.lines;
  const [quantities, setQuantities] = useState(() => (original || []).map(x => ({ ...x })));
  const [checked, setChecked] = useState({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState('');
  const changed = quantityChanged(original || [], quantities);
  function execute(action, confirmed = false) {
    if (mainAction === action && quantities.some(x => !validQuantity(x.quantity, true))) { setError('請填寫每項實際數量'); return; }
    if (action === 'receive' && quantities.some(x => !checked[x.product_id])) { setError('請逐項勾選完成點收'); return; }
    if ((actor.is_hq || changed || !['ship', 'receive', 'ack_sender', 'ack_receiver'].includes(action)) && !reason.trim()) { setError('請填寫操作或數量差異原因'); return; }
    if (!confirmed) { setConfirmAction(action); setError(''); return; }
    onCommand(action, { id: row.id, version: row.version, reason: reason.trim(), ...(mainAction === action ? { lines: quantities.map(x => ({ product_id: x.product_id, quantity: Number(x.quantity) })) } : {}) });
  }
  return <article className="tr-detail">
    <button type="button" disabled={busy} onClick={onBack}>← 返回清單</button>
    <header><h3>{orderNumber(row.number)} <span className={`tr-status tr-status-${row.status}`}>{STATUS[row.status]}</span></h3><p>{row.data.sender_name} → {row.data.receiver_name}</p><p>{row.data.date} · 申請人：{row.data.requester}</p>{row.data.note && <p>備註：{row.data.note}</p>}</header>
    <details open><summary>申請明細</summary><LineTable lines={row.data.lines} /></details>
    {row.data.shipped && <details open><summary>實際出貨</summary><LineTable lines={row.data.shipped} comparison={row.data.lines} /></details>}
    {row.data.received && <details open><summary>實際收貨</summary><LineTable lines={row.data.received} comparison={row.data.shipped} /></details>}
    {row.data.resolution && <div className="tr-resolution"><h4>差異處理方式</h4><p>{row.data.resolution}</p><p>出貨店：{row.data.sender_ack ? '已確認' : '待確認'} · 收貨店：{row.data.receiver_ack ? '已確認' : '待確認'}</p></div>}
    {Object.values(can).some(Boolean) && <fieldset disabled={busy} className="tr-operation">
      <h3>{mainAction ? mainAction === 'ship' ? '填寫實際出貨數量' : '逐項確認收貨數量' : '處理調貨單'}</h3>
      {mainAction && quantities.map(x => <div className="tr-entry" key={x.product_id}><div><strong>{x.name}</strong><small>原數量 {original.find(y => y.product_id === x.product_id)?.quantity} {x.unit}</small></div><label>實際數量（{x.unit}）<Qty zero value={x.quantity} label={`${x.name}實際數量`} onChange={value => { setQuantities(q => q.map(y => y.product_id === x.product_id ? { ...y, quantity: value } : y)); setChecked(c => ({ ...c, [x.product_id]: false })); setConfirmAction(''); }} /></label>{mainAction === 'receive' && <label className="tr-check"><input type="checkbox" checked={!!checked[x.product_id]} onChange={e => setChecked(c => ({ ...c, [x.product_id]: e.target.checked }))} />已點收</label>}</div>)}
      <label>{changed ? '數量差異原因' : actor.is_hq ? '總部操作原因' : '原因／處理方式（一般出收貨可不填）'}<textarea value={reason} maxLength={2000} onChange={e => { setReason(e.target.value); setConfirmAction(''); }} /></label>
      {changed && <p className="tr-warning">{mainAction === 'receive' ? '收貨數量有差異，將列入「差異處理」，不會直接結案。' : '實際出貨數量與申請不同，將保留原申請及實際出貨紀錄。'}</p>}
      {error && <p className="tr-error" role="alert">{error}</p>}
      {confirmAction ? <div className="tr-confirm"><strong>確認「{ACTIONS[confirmAction]}」？</strong>{mainAction === confirmAction && <LineTable lines={quantities} />}<div className="tr-actions"><button type="button" onClick={() => setConfirmAction('')}>返回修改</button><button className="tr-primary" type="button" onClick={() => execute(confirmAction, true)}>{busy ? '儲存中…' : `確定${ACTIONS[confirmAction]}`}</button></div></div>
        : <div className="tr-actions">{Object.entries(can).filter(([, allowed]) => allowed).map(([action]) => <button key={action} className={action === mainAction ? 'tr-primary' : ''} type="button" onClick={() => execute(action)}>{ACTIONS[action]}</button>)}</div>}
    </fieldset>}
    <details className="tr-audit"><summary>操作紀錄（{row.events?.length || 0}）</summary>{row.events?.map(e => <div key={e.id}><strong>{ACTIONS[e.action] || e.action}</strong><p>{e.actor_name} · {when(e.created_at)}</p>{e.reason && <p>{e.reason}</p>}<details><summary>當次內容</summary><LineTable lines={e.after_state.data?.received || e.after_state.data?.shipped || e.after_state.data?.lines || []} /></details></div>)}</details>
  </article>;
}

function ProductSettings({ context, busy, save, loadHistory }) {
  const senders = context.senders || context.stores;
  const [search, setSearch] = useState('');
  const [edit, setEditState] = useState(null);
  const setEdit = value => setEditState(value && typeof value !== 'function'
    ? { ...value, sender_stores: value.sender_stores || value.stores, receiver_stores: value.receiver_stores || value.stores }
    : value);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  useEffect(() => {
    let current = true; setHistory([]); setError('');
    if (edit?.id) loadHistory(edit.id).then(rows => { if (current) setHistory(rows); }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [edit?.id]);
  const units = ['箱', '包', '公斤', '支', '袋', '籃', '桶', '封', '捲', '瓶', '罐', '個', '盒', '雙', '條', '串', '組', '件', '頂'];
  async function submit(e) {
    e.preventDefault();
    if (!edit.units.length || !edit.stores.length || !edit.sender_stores.length || !edit.receiver_stores.length) { setError('請選擇單位、適用門店、出貨門店與收貨門店'); return; }
    if (await save(edit)) { setEdit(null); setError(''); }
  }
  const toggle = (key, value) => setEdit(p => ({ ...p, [key]: p[key].includes(value) ? p[key].filter(x => x !== value) : [...p[key], value] }));
  return <section><div className="tr-header"><h3>獨立調貨品項</h3><button type="button" onClick={() => setEdit({ name: '', category: '肉品', spec: '', units: [], stores: context.stores.map(s => s.code), sender_stores: senders.map(s => s.code), receiver_stores: context.stores.map(s => s.code), active: true, sort_order: 100, reason: '' })}>新增品項</button></div>
    {edit ? <form onSubmit={submit}><fieldset disabled={busy}><div className="tr-form-grid"><label>品名<input value={edit.name} maxLength={80} onChange={e => setEdit({ ...edit, name: e.target.value })} required /></label><label>分類<select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><label>規格<input value={edit.spec} onChange={e => setEdit({ ...edit, spec: e.target.value })} /></label><label>排序<input type="number" value={edit.sort_order} onChange={e => setEdit({ ...edit, sort_order: e.target.value })} required /></label></div><fieldset className="tr-checkboxes"><legend>允許單位</legend>{units.map(u => <label key={u}><input type="checkbox" checked={edit.units.includes(u)} onChange={() => toggle('units', u)} />{u}</label>)}</fieldset><fieldset className="tr-checkboxes"><legend>適用直營門店</legend>{context.stores.map(s => <label key={s.code}><input type="checkbox" checked={edit.stores.includes(s.code)} onChange={() => toggle('stores', s.code)} />{s.code} {s.name}</label>)}</fieldset><label className="tr-check"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} />啟用此品項</label>{edit.source && <p>來源：{edit.source.source_code} · {edit.source.source_name}（原單位：{edit.source.source_unit}）</p>}<label>設定原因<textarea value={edit.reason} maxLength={2000} onChange={e => setEdit({ ...edit, reason: e.target.value })} required /></label>{error && <p role="alert">{error}</p>}<div className="tr-actions"><button type="button" onClick={() => setEdit(null)}>取消</button><button className="tr-primary" type="submit">儲存調貨品項</button></div></fieldset></form>
      : <><label>搜尋品項<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="tr-product-settings">{context.products.filter(p => `${p.name} ${p.code} ${p.category}`.includes(search)).map(p => <div key={p.id} className="tr-line"><div><strong>{p.name} {p.active ? '' : '（停用）'}</strong><small>{p.category} · {p.units.join('／')} · {p.spec}</small><small>{p.code}</small></div><button type="button" onClick={() => setEdit({ ...p, reason: '' })}>編輯</button></div>)}</div></>}
    {edit && <fieldset disabled={busy} className="tr-direction-settings"><legend>出收貨門店限制</legend>{[['sender_stores','允許出貨門店'],['receiver_stores','允許收貨門店']].map(([key,label]) => <fieldset className="tr-checkboxes" key={key}><legend>{label}</legend>{(key === 'sender_stores' ? senders : context.stores).map(s => <label key={s.code}><input type="checkbox" checked={edit[key].includes(s.code)} onChange={() => toggle(key,s.code)} />{s.code} {s.name}</label>)}</fieldset>)}</fieldset>}
    {edit?.id && <details className="tr-audit"><summary>品項異動紀錄（{history.length}）</summary>{history.length === 0 && <p>尚無人工調整紀錄</p>}{history.map(e => <div key={e.id}><strong>{e.actor_name} · {when(e.created_at)}</strong><p>{e.reason}</p><p>{e.before_state?.name || '新增'} → {e.after_state.name}</p><p>單位：{e.before_state?.units?.join('／') || '—'} → {e.after_state.units?.join('／')}</p><p>出貨：{e.after_state.sender_stores?.join('、') || '依適用門店'}</p><p>收貨：{e.after_state.receiver_stores?.join('、') || '依適用門店'}</p><p>狀態：{e.after_state.active ? '啟用' : '停用'}</p></div>)}</details>}
  </section>;
}
