import React, { useEffect, useRef, useState } from 'react';
import { REPAIR_CATEGORIES, REPAIR_STATUS, REPAIR_URGENCY, repairDraftError, repairSummary, repairActions, validRepairCost, repairCostLabel } from './domain.js';
import './repairs.css';
import RepairPhotos from './RepairPhotos.jsx';
import RepairGallery from './RepairGallery.jsx';
import { ROLE_LABELS } from '../access/domain/roleAccess.js';

const statuses = ['pending', 'processing', 'awaiting_confirmation', 'completed'];
const date = value => value ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '—';
const actionLabels = { create:'新增報修',start:'開始處理',update_work:'更新處理資料',update_cost:'更新費用紀錄',finish:'處理完成',confirm:'確認修好了',reject:'仍有問題',withdraw:'撤銷報修',comment:'補充說明',photo_confirm:'照片保存完成' };

export default function RepairPage({ repository, commands = null, submission = null, photoStorage = null }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('pending');
  const [store, setStore] = useState('');
  const [urgency, setUrgency] = useState('');
  const [draft, setDraft] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [attachmentPhotos, setAttachmentPhotos] = useState([]);
  const [purpose, setPurpose] = useState('completion');
  const selectedId = useRef(null);
  const [formError, setFormError] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [note, setNote] = useState('');
  const [work, setWork] = useState({assignee:'',vendor:'',due_date:'',cost:'',cost_note:''});
  const [history, setHistory] = useState(null);
  const [operationError, setOperationError] = useState('');
  useEffect(() => {
    try { setPending(!!commands?.pending()); } catch (e) { setPending(true); setOperationError(e.message); }
  }, [commands]);
  useEffect(() => {
    let active=true;
    submission?.pending().then(record=>{if(active)setPhotoPending(!!record);}).catch(e=>{if(active){setPhotoPending(true);setOperationError(e.message);}});
    return ()=>{active=false;};
  }, [submission]);
  async function sendWithPhotos(retry=false) {
    if (!submission || busy) return;
    setBusy(true);setOperationError('');
    try {
      await (retry?submission.retry():submission.submit(draft,photos));
      setDraft(null);setPhotos([]);setSelected(null);setReload(x=>x+1);
    } catch(e) { setOperationError(e.message); }
    finally { try{setPhotoPending(!!await submission.pending());}catch(e){setPhotoPending(true);setOperationError(e.message);} setBusy(false); }
  }
  async function operate(action, payload, retry = false) {
    if (!commands || busy) return;
    if (!retry && Object.hasOwn(payload || {},'cost') && !validRepairCost(payload.cost)) { setOperationError('費用須為非負數，最多兩位小數'); return; }
    setBusy(true); setOperationError('');
    try {
      await (retry ? commands.retry() : commands.send(action, payload));
      setDraft(null); setPhotos([]); setSelected(null); setNote(''); setHistory(null);
      setReload(x => x + 1);
    } catch (e) { setOperationError(e.message); }
    finally {
      try { setPending(!!commands.pending()); } catch (e) { setPending(true); setOperationError(e.message); }
      setBusy(false);
    }
  }
  async function attachPhotos() {
    if (busy || !submission || !selected) return;
    setBusy(true); setOperationError('');
    try {
      await submission.attach(selected.id,purpose,attachmentPhotos);
      setAttachmentPhotos([]); setSelected(null); setReload(x=>x+1);
    } catch(e) { setOperationError(e.message); }
    finally { try { setPhotoPending(!!await submission.pending()); } catch { setPhotoPending(true); } setBusy(false); }
  }
  function submit(e) {
    e.preventDefault();
    const message = repairDraftError(draft);
    if (message) { setFormError(message); return; }
    if (!commands) { setFormError('正式儲存尚未啟用，內容尚未送出。'); return; }
    if (submission) { setFormError('');sendWithPhotos();return; }
    if (photos.length) { setFormError('照片與主單整合尚未完成，為避免遺漏，目前不送出含照片的報修。'); return; }
    setFormError(''); operate('create', draft);
  }
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    repository.list().then(result => { if (active) setData(result); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [repository, reload]);
  useEffect(() => {
    if (!draft && !pending && !photoPending && !busy) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, pending, photoPending, busy]);
  const patch = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  function start() {
    setDraft({ store: data.actor.store || '', category: '其他', description: '', urgency: 'normal', contact: '', phone: '' });
    setPhotos([]); setFormError(''); setSelected(null);
  }
  function openTicket(row) {
    selectedId.current = row.id;
    setAttachmentPhotos([]); setPurpose(row.status === 'completed' ? 'receipt' : 'completion');
    setSelected(row); setNote(''); setHistory(null); setOperationError('');
    setWork({assignee:row.assignee || '',vendor:row.vendor || '',due_date:row.due_date || '',cost:row.cost == null ? '' : String(row.cost),cost_note:row.cost_note || ''});
  }
  const scoped = data?.rows.filter(row => (!store || row.store === store) && (!urgency || row.urgency === urgency)) || [];
  const counts = repairSummary(scoped);
  return <main className="rp-page">
    <header className="rp-heading"><h1>門店報修</h1>{data && <div className="rp-actions"><button type="button" title="更新列表" aria-label="更新列表" onClick={()=>{setSelected(null);setReload(x=>x+1);}} disabled={!!draft || busy || pending || photoPending}>↻</button><button type="button" className="rp-primary" onClick={start} disabled={!!draft || busy || pending || photoPending}>＋新增報修</button></div>}</header>
    {photoPending && <div role="status"><p>報修或照片尚未全部確認完成，請接續原單，勿重新建單。</p><button type="button" disabled={busy} onClick={()=>sendWithPhotos(true)}>接續送出報修與照片</button></div>}
    {operationError && <p role="alert">{operationError}</p>}
    {pending && <div role="status"><p>上一筆操作結果待確認，請勿重新建單。</p><button type="button" disabled={busy} onClick={() => operate(null,null,true)}>重試原操作</button></div>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload(x => x + 1)}>重新載入</button></div>}
    {!data && !error && <p role="status">讀取中…</p>}
    {data && <>
      <nav className="rp-summary" aria-label="報修狀態">{statuses.map(s => <button type="button" key={s} data-state={s} aria-pressed={filter === s} onClick={() => setFilter(s)}><span>{REPAIR_STATUS[s]}</span><strong>{counts[s]} 件</strong></button>)}</nav>
      {draft ? <form onSubmit={submit}><fieldset className="rp-edit-fieldset" disabled={busy || pending || photoPending}>
        <h2>新增報修</h2><div className="rp-fields">
          <label>門店<select required value={draft.store} disabled={!data.actor.manageRepairs} onChange={e => patch('store', e.target.value)}><option value="">請選擇門店</option>{data.stores.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
          <label>報修項目<select value={draft.category} onChange={e => patch('category', e.target.value)}>{REPAIR_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="rp-full">問題說明<textarea required maxLength={2000} value={draft.description} onChange={e => patch('description', e.target.value)} /></label>
          <label>急迫程度<select value={draft.urgency} onChange={e => patch('urgency', e.target.value)}>{Object.entries(REPAIR_URGENCY).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <RepairPhotos files={photos} onChange={setPhotos} />
          <label>聯絡人（選填）<input maxLength={100} value={draft.contact} onChange={e => patch('contact', e.target.value)} /></label>
          <label>聯絡電話（選填）<input type="tel" maxLength={40} value={draft.phone} onChange={e => patch('phone', e.target.value)} /></label>
        </div>
        {!commands && <p role="status">正式儲存尚未啟用，照片及內容不會上傳。</p>}
        {formError && <p role="alert">{formError}</p>}
        <div className="rp-actions"><button type="button" onClick={() => { if (window.confirm('放棄尚未送出的報修內容？')) { setDraft(null); setPhotos([]); } }}>取消</button>{!commands && <button type="submit">檢查內容</button>}<button className="rp-primary" type="submit" disabled={!commands}>送出報修</button></div></fieldset>
      </form> : <>
        <div className="rp-fields rp-filters">{data.actor.manageRepairs && <label>門店<select value={store} onChange={e => setStore(e.target.value)}><option value="">全部門店</option>{data.stores.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>}<label>急迫程度<select value={urgency} onChange={e => setUrgency(e.target.value)}><option value="">全部</option>{Object.entries(REPAIR_URGENCY).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label></div>
        <button type="button" aria-pressed={filter === 'withdrawn'} onClick={() => setFilter('withdrawn')}>已撤銷（{counts.withdrawn}）</button>
        <section className="rp-list" aria-label={REPAIR_STATUS[filter]}>{scoped.filter(r => r.status === filter).map(r => <button type="button" className="rp-ticket" key={r.id} onClick={() => openTicket(r)}><strong>{r.storeName} · {r.category}</strong><span data-state={r.status}>{REPAIR_STATUS[r.status]}</span><span className={r.urgency === 'safety' ? 'rp-danger' : ''}>{REPAIR_URGENCY[r.urgency]}</span><span>{date(r.createdAt)}</span><span>負責人：{r.assignee || '尚未安排'}</span><span>最後處理人：{r.lastHandling?.name || '尚無處理紀錄'}</span>{r.lastHandling && <span>{date(r.lastHandling.at)}</span>}</button>)}{!scoped.some(r => r.status === filter) && <p>目前沒有{REPAIR_STATUS[filter]}案件</p>}</section>
        {selected && <section className="rp-detail" aria-label="報修詳情"><h2>{selected.number} · {selected.category}</h2><p>{selected.description}</p><p>{REPAIR_STATUS[selected.status]}</p><details><summary>處理資料</summary><p>負責人：{selected.assignee || '尚未安排'}</p><p>廠商：{selected.vendor || '未填'}</p><p>處理結果：{selected.result || '未填'}</p></details>
          {selected.pendingPhotos > 0 && <p role="status">尚有 {selected.pendingPhotos} 張照片待完成上傳，請回報人接續原單。</p>}
          {photoStorage && <RepairGallery key={selected.id} ticketId={selected.id} storage={photoStorage}/>}
          {submission && data.actor.manageRepairs && selected.status !== 'withdrawn' && <details><summary>補充完工照片／費用單據</summary><fieldset className="rp-edit-fieldset" disabled={busy || pending || photoPending}>
            <label>照片類別<select value={purpose} onChange={e=>setPurpose(e.target.value)}>{selected.status !== 'completed' && <option value="completion">完工照片</option>}<option value="receipt">費用單據</option></select></label>
            <RepairPhotos files={attachmentPhotos} onChange={setAttachmentPhotos} title={purpose === 'receipt' ? '費用單據' : '完工照片'}/>
            <button type="button" disabled={!attachmentPhotos.length} onClick={attachPhotos}>保存照片</button>
          </fieldset></details>}
          <details><summary>維修費用：{repairCostLabel(selected.cost)}</summary><p>費用說明：{selected.cost_note || '未填'}</p><p className="rp-muted">費用紀錄不代表已請款、核准或付款。</p>
            {commands && data.actor.manageRepairs && selected.status !== 'withdrawn' && <fieldset className="rp-edit-fieldset rp-fields" disabled={busy || pending}>
              <label>維修費用（元）<input type="text" inputMode="decimal" maxLength={13} value={work.cost} onChange={e => setWork({...work,cost:e.target.value})} /></label>
              <label className="rp-full">費用說明<textarea maxLength={2000} value={work.cost_note} onChange={e => setWork({...work,cost_note:e.target.value})} /></label>
            </fieldset>}
          </details>
          {commands && <fieldset className="rp-edit-fieldset" disabled={busy || pending || photoPending}>
            {data.actor.manageRepairs && ['pending','processing'].includes(selected.status) && <div className="rp-fields">
              <label>負責人<input maxLength={100} value={work.assignee} onChange={e => setWork({...work,assignee:e.target.value})} /></label>
              <label>維修廠商（選填）<input maxLength={200} value={work.vendor} onChange={e => setWork({...work,vendor:e.target.value})} /></label>
              <label>預計處理日期（選填）<input type="date" value={work.due_date} onChange={e => setWork({...work,due_date:e.target.value})} /></label>
            </div>}
            <label className="rp-note">處理內容／原因<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><div className="rp-actions">{repairActions(data.actor,selected).map(action => <button type="button" key={action} disabled={!note.trim()} onClick={() => operate(action,{id:selected.id,version:selected.version,note,...(['start','update_work','finish'].includes(action)?work:action==='update_cost'?{cost:work.cost,cost_note:work.cost_note}:{})})}>{actionLabels[action]}</button>)}</div></fieldset>}
          <details onToggle={async e => { if (!e.currentTarget.open || !repository.detail) return; const id=selected.id; setHistory(null); try { const result=await repository.detail(id); if(selectedId.current===id)setHistory(result.events); } catch(err) { if(selectedId.current===id)setOperationError(err.message); } }}><summary>處理歷程</summary>{history ? history.map(item => <article className="rp-history-row" key={item.id}><strong>{actionLabels[item.action] || '操作紀錄'}</strong><p>{item.actor_name} · {ROLE_LABELS[item.actor_role] || item.actor_role || '—'}</p><time>{date(item.created_at)}</time><p>{item.note}</p>{item.before_state && item.before_state.assignee !== item.after_state?.assignee && <p>負責人：{item.before_state.assignee || '未指派'} → {item.after_state?.assignee || '未指派'}</p>}
            {item.before_state && repairCostLabel(item.before_state.cost) !== repairCostLabel(item.after_state?.cost) && <p>費用：{repairCostLabel(item.before_state.cost)} → {repairCostLabel(item.after_state?.cost)}</p>}
            {item.before_state && (item.before_state.cost_note || '') !== (item.after_state?.cost_note || '') && <p>費用說明：{item.before_state.cost_note || '未填'} → {item.after_state?.cost_note || '未填'}</p>}
          </article>) : <p>{repository.detail ? '讀取中…' : '詳情尚未接通'}</p>}</details><button type="button" disabled={busy || pending} onClick={() => {setSelected(null);setHistory(null);setNote('');}}>關閉詳情</button></section>}
      </>}
    </>}
  </main>;
}
