import React, { useEffect, useState } from 'react';
import { pushClient, pushSupport } from './client.js';
import './push.css';

const date = value => value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '尚無紀錄';
export default function TransferPushSettings({ actor, stores, client = pushClient, support = pushSupport }) {
  const [config, setConfig] = useState(null);
  const [device, setDevice] = useState(null);
  const [label, setLabel] = useState('');
  const [store, setStore] = useState(actor.store || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const unsupported = support();
  useEffect(() => {
    let active = true;
    client.config().then(value => { if (active) setConfig(value); }).catch(e => { if (active) setError(e.message); });
    client.status(actor.id).then(value => { if (active) setDevice(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [actor.id, client]);
  async function run(action) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <details className="tr-push"><summary>手機通知設定 · {device ? `${device.store} 已啟用` : '未啟用'}</summary>
    {error && <p role="alert" className="tr-error">{error}</p>}
    {unsupported && <p role="status">{unsupported}</p>}
    {device ? <div className="tr-push-actions"><strong>本機接收 {device.store} 調貨通知</strong><button disabled={busy} onClick={() => run(async () => { await client.revoke(device.id, '本機關閉通知'); setDevice(null); })}>關閉本機通知</button></div>
      : <form className="tr-push-form" onSubmit={e => { e.preventDefault(); run(async () => { const value = await client.enable({ publicKey: config.publicKey, userId: actor.id, store, label: label.trim() }); setDevice(value); }); }}>
        <label>裝置名稱<input required maxLength={60} value={label} onChange={e => setLabel(e.target.value)} placeholder="例如：凱旋店長手機" /></label>
        {actor.is_hq && <label>通知門店<select required value={store} onChange={e => setStore(e.target.value)}><option value="">請選擇門店</option>{stores.map(s => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}</select></label>}
        <button type="submit" disabled={busy || !config || Boolean(unsupported)}>啟用調貨通知</button>
        {!config && <button type="button" disabled={busy} onClick={() => run(async () => setConfig(await client.config()))}>重新連線</button>}
      </form>}
    {actor.is_hq && <details className="tr-push-admin"><summary>總部裝置管理</summary>
      <button disabled={busy} onClick={() => run(async () => setRows(await client.list()))}>讀取／更新裝置清單</button>
      {rows && <>
        <div className="tr-push-counts">{stores.map(s => <span key={s.code}>{s.code}：{rows.filter(r => r.store === s.code && r.active && r.eligible).length} 台</span>)}</div>
        {rows.length === 0 && <p>目前沒有已登記的通知裝置</p>}
        <div className="tr-push-devices">{rows.map(r => <article key={r.id}>
          <strong>{r.store} · {r.label}</strong><span>{r.active ? r.eligible ? '已啟用' : '登入或權限已失效' : '已停用'}</span>
          <small>最近使用：{date(r.last_seen)}</small><small>最近推送：{date(r.last_sent)}</small>
          {r.last_error && <small>推送異常：{({ retry:'等待重試', expired:'訂閱失效', failed:'發送失敗', skipped:'待辦已變更' })[r.last_error] || '請查核'}</small>}
          {r.active && <button disabled={busy} onClick={() => { setTarget(r); setReason(''); }}>停用通知</button>}
        </article>)}</div>
      </>}
      {target && <form className="tr-push-revoke" onSubmit={e => { e.preventDefault(); run(async () => { await client.revoke(target.id, reason.trim()); if (device?.id === target.id) setDevice(null); setTarget(null); setRows(await client.list()); }); }}>
        <strong>停用 {target.store} · {target.label}</strong><label>停用原因<input required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button disabled={busy} type="submit">確認停用</button><button disabled={busy} type="button" onClick={() => setTarget(null)}>取消</button>
      </form>}
    </details>}
  </details>;
}
