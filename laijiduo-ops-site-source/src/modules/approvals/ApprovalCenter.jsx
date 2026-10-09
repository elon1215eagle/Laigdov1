import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACTIONS, STATES, TYPES, approvalHistory, sameContent, blankContent, caseNumber, exportCsv, money, permissions, time, validateContent } from './domain.js';
import * as approvalRepository from './repository.js';
import './approvals.css';

export default function ApprovalCenter({ profile, stores = [], repository = approvalRepository }) {
  const { attachmentUrl, command, listRequests, loadDetail, uploadAttachment } = repository;
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState(profile?.role === 'cfo' ? 'review' : 'mine');
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(blankContent);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const decisionDialog = useRef(null);
  useEffect(() => {
    if (pendingAction) decisionDialog.current?.showModal();
    else decisionDialog.current?.close();
  }, [pendingAction]);
  const working = useRef(false);
  const [filters, setFilters] = useState({ month: '', type: '', scope: '', status: '', search: '' });
  const allowed = permissions(profile).allowed;
  const access = permissions(profile, detail?.request);
  const refresh = useCallback(async () => {
    try { setRows(await listRequests()); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [listRequests]);
  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [allowed, refresh]);
  const dirty = detail && !sameContent(form, detail.request.content);
  const history = approvalHistory(detail?.events || []);
  useEffect(() => {
    const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const run = async (fn) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { working.current = false; setBusy(false); }
  };
  const select = async (id) => {
    const next = await loadDetail(id);
    setDetail(next); setForm({ ...blankContent(), ...next.request.content }); setReason('');
  };
  const open = id => {
    if (dirty && !window.confirm('尚有未儲存內容，確定放棄修改？')) return;
    run(() => select(id));
  };
  const create = (related = null) => {
    if (dirty && !window.confirm('尚有未儲存內容，確定放棄修改？')) return;
    run(async () => {
      const next = await command({ id: crypto.randomUUID() }, 'create', {}, '', related);
      await select(next.id); await refresh();
    });
  };
  const save = (submit = false) => run(async () => {
    const invalid = submit ? validateContent(form) : '';
    if (invalid) throw new Error(invalid);
    let next = dirty ? await command(detail.request, 'save', form) : detail.request;
    setDetail(d => ({ ...d, request: next }));
    if (submit) next = await command(next, 'submit');
    await select(next.id); await refresh(); setNotice(submit ? '已送財務長審核。' : '草稿已儲存。');
  });
  const act = action => {
    if (['return', 'withdraw'].includes(action) && !reason.trim()) { setError('請先填寫原因。'); return; }
    setPendingAction(action);
  };
  const confirmDecision = () => {
    const action = pendingAction;
    setPendingAction('');
    run(async () => {
      await command(detail.request, action, {}, reason);
      await select(detail.request.id); await refresh(); setNotice(`${ACTIONS[action]}完成。`);
    });
  };
  const upload = e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    run(async () => {
      const saved = dirty ? await command(detail.request, 'save', form) : detail.request;
      setDetail(d => ({ ...d, request: saved }));
      await uploadAttachment(saved, file);
      await select(saved.id); await refresh(); setNotice('附件已保存。');
    });
  };
  const viewFile = file => run(async () => {
    const url = await attachmentUrl(file.path);
    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
  });
  const filtered = useMemo(() => rows.filter(r => {
    if (tab === 'mine' && r.owner_id !== profile.id) return false;
    if (tab === 'review' && r.state !== 'pending') return false;
    if (tab === 'history' && !['approved', 'withdrawn'].includes(r.state)) return false;
    const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit' }).format(new Date(r.created_at));
    return (!filters.month || month === filters.month) && (!filters.type || r.content.type === filters.type) && (!filters.scope || r.content.scope === filters.scope) && (!filters.status || r.state === filters.status) && (!filters.search || [caseNumber(r), r.owner_name, r.content.subject, r.content.payee].join(' ').toLowerCase().includes(filters.search.toLowerCase()));
  }), [rows, tab, filters, profile?.id]);
  const update = e => setForm({ ...form, [e.target.name]: e.target.value });
  const filter = e => setFilters({ ...filters, [e.target.name]: e.target.value });
  const exportRows = () => {
    const url = URL.createObjectURL(new Blob([exportCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '萊吉多簽核紀錄.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!allowed) return <section className="approval-center"><p role="alert">此帳號未開放簽核中心。</p></section>;
  return <section className="approval-center" aria-label="簽核中心">
    <header className="approval-toolbar"><div><h2>請款與採購</h2><span>申請人：{profile.full_name}</span></div><button className="primary" disabled={busy || loading} onClick={() => create()}>＋新增申請</button></header>
    {error && <div role="alert" className="approval-error">{error}<button disabled={busy} onClick={() => run(async () => { await refresh(); if (detail) await select(detail.request.id); })}>重新載入</button></div>}
    {notice && <p role="status" className="approval-notice">{notice}</p>}
    {detail ? <article className="approval-detail">
      <header className="approval-toolbar"><div><strong>{caseNumber(detail.request)}</strong><span className={`approval-state ${detail.request.state}`}>{STATES[detail.request.state]}</span></div><button disabled={busy} onClick={() => { if (!dirty || window.confirm('放棄尚未儲存的修改？')) setDetail(null); }}>返回清單</button></header>
      <p className="approval-meta">{detail.request.owner_name} · {time(detail.request.created_at)} · {history.edition ? `第 ${history.edition} 版${detail.request.state === 'returned' ? '（補正中）' : ''}` : '草稿（尚未送出）'}</p>
      {detail.request.related_id && <p>更正案件 <button disabled={busy} onClick={() => open(detail.request.related_id)}>查看原案</button></p>}
      {detail.request.state === 'approved' && <p className="approval-notice">已核准留存，非付款證明。結案時間：{time(detail.request.closed_at)}</p>}
      <form onSubmit={e => { e.preventDefault(); save(true); }}>
        <fieldset disabled={!access.edit || busy} className="approval-fields">
          <label>申請類型<select name="type" value={form.type} onChange={update}>{Object.entries(TYPES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label>歸屬<select name="scope" value={form.scope} onChange={update}><option value="HQ">總部</option>{stores.map(s => <option key={s.id} value={s.store_code}>{s.store_code} {s.name}</option>)}</select></label>
          <label className="approval-full">申請事由<textarea name="subject" rows={2} maxLength={200} required value={form.subject} onChange={update} /></label>
          <label>收款人／廠商<input name="payee" maxLength={200} required value={form.payee} onChange={update} /></label>
          <label>金額（新臺幣）<input name="amount" type="number" inputMode="decimal" min="0.01" max="999999999.99" step="0.01" required value={form.amount} onChange={update} /></label>
          <label className="approval-full">備註<textarea name="note" rows={3} maxLength={4000} value={form.note} onChange={update} /></label>
        </fieldset>
        <div className="approval-total">申請金額 <strong>{money(form.amount)}</strong></div>
        <section className="approval-files"><h3>附件（{detail.attachments.length}/10）</h3>{detail.attachments.map(file => <button type="button" key={file.id} disabled={busy} onClick={() => viewFile(file)}>{file.name}</button>)}{!detail.attachments.length && <p>尚無附件</p>}{access.edit && <label>新增附件（PDF／圖片，每檔 10MB）<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy || detail.attachments.length >= 10} onChange={upload} /></label>}</section>
        {access.edit && <div className="approval-actions"><button type="button" disabled={busy || !dirty} onClick={() => save(false)}>儲存草稿</button><button type="submit" className="primary" disabled={busy}>送財務長審核</button></div>}
      </form>
      {(access.review || access.withdraw) && <div className="approval-review">
        {access.review && detail.request.owner_id === profile.id && <p>本人申請／本人核准</p>}
        <label>審核意見／撤回原因<textarea rows={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></label>
        <div className="approval-actions">{access.review && <><button className="primary" disabled={busy} onClick={() => act('approve')}>核准結案</button><button disabled={busy} onClick={() => act('return')}>退回補正</button></>}{access.withdraw && <button disabled={busy} onClick={() => act('withdraw')}>撤回申請</button>}</div>
      </div>}
      {detail.request.state === 'approved' && <button disabled={busy} onClick={() => create(detail.request.id)}>新增更正申請</button>}
      <section className="approval-history"><h3>簽核歷程</h3>{!history.milestones.length && <p>尚未送出申請。</p>}{history.milestones.map(event => <section key={event.id}><strong>{event.label}</strong><p>{event.actor_name} · {time(event.created_at)}{event.edition ? ` · 第 ${event.edition} 版` : ' · 草稿'}{event.action === 'approve' && event.actor_id === detail.request.owner_id ? ' · 本人申請／本人核准' : ''}</p>{event.reason && <p>{event.reason}</p>}</section>)}</section>
      <details className="approval-history"><summary>詳細操作紀錄（{history.operations.length}）</summary>{history.operations.map(event => <section key={event.id}><strong>{event.label}</strong><p>{event.actor_name} · {time(event.created_at)}</p>{event.reason && <p>{event.reason}</p>}<details><summary>當次申請內容</summary><dl>{Object.entries({ 類型: TYPES[event.snapshot.content.type], 歸屬: event.snapshot.content.scope, 事由: event.snapshot.content.subject, 收款對象: event.snapshot.content.payee, 金額: money(event.snapshot.content.amount), 備註: event.snapshot.content.note }).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v || '-'}</dd></div>)}</dl>{event.snapshot.attachments?.map(file => <button key={file.id} disabled={busy} onClick={() => viewFile(file)}>{file.name}</button>)}</details></section>)}</details>
    </article> : <>
      <div className="approval-tabs" role="tablist" aria-label="案件分類">{[['mine', '我的申請'], ...(profile.role === 'cfo' ? [['review', `待我審核（${rows.filter(r => r.state === 'pending').length}）`]] : []), ['history', '歷史紀錄']].map(([v,label]) => <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? 'selected' : ''} onClick={() => setTab(v)}>{label}{v === 'mine' && rows.some(r => r.owner_id === profile.id && r.state === 'returned') ? ' · 待補正' : ''}</button>)}</div>
      <details className="approval-filter-panel"><summary>搜尋與篩選{Object.values(filters).some(Boolean) ? '（已套用）' : ''}</summary>
        <div className="approval-filters">
          <label>申請月份<input type="month" name="month" value={filters.month} onChange={filter} /></label>
          <label>類型<select name="type" value={filters.type} onChange={filter}><option value="">全部</option>{Object.entries(TYPES).map(([v,label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label>歸屬<select name="scope" value={filters.scope} onChange={filter}><option value="">全部</option><option value="HQ">總部</option>{stores.map(s => <option key={s.id} value={s.store_code}>{s.name}</option>)}</select></label>
          <label>狀態<select name="status" value={filters.status} onChange={filter}><option value="">全部</option>{Object.entries(STATES).map(([v,label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label>搜尋<input type="search" name="search" placeholder="編號、申請人、事由、廠商" value={filters.search} onChange={filter} /></label>
        </div><button onClick={() => setFilters({ month: '', type: '', scope: '', status: '', search: '' })}>清除篩選</button>
      </details>
      <div className="approval-toolbar"><span>{filtered.length} 件</span><div className="approval-actions"><button disabled={busy || loading} onClick={() => run(refresh)}>重新整理</button><button disabled={!filtered.length} onClick={exportRows}>匯出紀錄</button></div></div>
      {loading && <p role="status">載入中…</p>}{!loading && !filtered.length && <p className="approval-empty">目前沒有符合條件的案件。</p>}
      <div className="approval-list">{filtered.map(r => <button key={r.id} className="approval-row" disabled={busy} onClick={() => open(r.id)}><span className="approval-row-main"><small>{caseNumber(r)} · {TYPES[r.content.type] || '請款'} · {r.content.scope === 'HQ' ? '總部' : r.content.scope}</small><strong>{r.content.subject || '未填事由'}</strong><span>{r.owner_name} · {time(r.created_at)}</span></span><span className="approval-row-end"><strong>{money(r.content.amount)}</strong><span className={`approval-state ${r.state}`}>{STATES[r.state]}</span></span></button>)}</div>
    </>}
    <dialog ref={decisionDialog} className="approval-decision" onCancel={() => setPendingAction('')} aria-labelledby="approval-decision-title">
      <h3 id="approval-decision-title">確認{ACTIONS[pendingAction]}</h3>
      <p>{detail && caseNumber(detail.request)} · {money(detail?.request.content.amount)}</p>
      {pendingAction === 'approve' && <p>核准後即結案，內容將鎖定。此操作不代表付款。</p>}
      <div className="approval-actions"><button autoFocus onClick={() => setPendingAction('')}>返回</button><button className="primary" disabled={busy} onClick={confirmDecision}>確認{ACTIONS[pendingAction]}</button></div>
    </dialog>
  </section>;
}
