import React, { useEffect, useState } from 'react';
import { INBOX_LABELS, validateInbox } from './inbox.js';
import { orderNumber } from './domain.js';

export default function TransferInbox({ repository, revision, busy, onSelect, onGroup }) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function refresh() {
      const current = ++generation;
      setState(s => ({ ...s, loading: true }));
      try {
        const data = validateInbox(await repository.call('inbox'));
        if (active && current === generation) setState({ data, error: '', loading: false });
      } catch {
        if (active && current === generation) setState({ data: null, error: '暫時無法取得調貨提醒，仍可使用下方調貨功能。', loading: false });
      }
    }
    refresh();
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [repository, revision, retry]);
  return <section className="tr-inbox" aria-label="調貨待辦提醒">
    <div className="tr-inbox-heading"><h3>調貨待辦</h3><button type="button" disabled={state.loading || busy} onClick={() => setRetry(n => n + 1)}>更新提醒</button></div>
    {state.error ? <p role="status">{state.error}</p> : !state.data ? <p role="status">正在取得提醒…</p> : <>
      <div className="tr-inbox-counts">{Object.entries(INBOX_LABELS).map(([key,label]) => <button type="button" key={key} data-state={key} disabled={busy || state.loading} onClick={() => onGroup(key)}><span>{label}</span><strong>{state.data.counts[key]} 單</strong></button>)}</div>
      <details><summary>待辦明細（{Object.values(state.data.counts).reduce((a,b) => a+b,0)} 單）</summary>
        {!state.data.items.length && <p>目前沒有待處理調貨。</p>}
        {state.data.items.map(row => <button className="tr-inbox-item" type="button" key={row.id} disabled={busy || state.loading} onClick={() => onSelect(row.id)}><span className={`tr-status tr-status-${row.status}`}>{INBOX_LABELS[row.status]}</span><strong>{row.sender_name} → {row.receiver_name}</strong><span>{orderNumber(row.number)}</span></button>)}
        {Object.values(state.data.counts).reduce((a,b) => a+b,0) > state.data.items.length && <p>其餘待辦請至對應分頁查看。</p>}
      </details>
      <small>{state.loading ? '更新中…' : `更新時間：${new Date(state.data.checked_at).toLocaleTimeString('zh-TW')}`}</small>
    </>}
  </section>;
}
