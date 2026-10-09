import React, { useEffect, useRef, useState } from 'react';
import { deliveryRepository } from './repository.js';
import { DELIVERY_WAVES, dailyAssignmentCommands, deliveryCandidatesForWave, deliveryModel, deliveryOrderTone, deliveryWave, deliveryWaveCounts, selectedTasks, statusLabel, waveLabel } from './model.js';
import { downloadExcel, renderImages, saveBlob } from './export.js';
import { localDate } from '../transfers/domain.js';
import './delivery.css';

const labels = {assign:'安排送貨',edit:'調整安排',driver:'送貨人員',pick:'確認已取貨',deliver:'確認已送達',cancel:'取消配送'};
const noop = () => {};
export default function DeliverySheet({ actor, repository = deliveryRepository, onOpen, onBusy = noop }) {
  const [date, setDate] = useState(localDate), [driver, setDriver] = useState('');
  const [wave, setWave] = useState('primary');
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [editor, setEditor] = useState(null), [images, setImages] = useState([]);
  const [history, setHistory] = useState(null), [pending, setPending] = useState(null);
  const generation = useRef(0), lock = useRef(false);
  const pendingKey = `ops.delivery.pending.${actor.id}`;
  useEffect(() => {
    try { const saved=sessionStorage.getItem(pendingKey); if(saved) setPending(JSON.parse(saved)); } catch { /* A blocked browser store does not authorize any write. */ }
  }, [pendingKey]);
  useEffect(() => { onBusy(busy || !!pending); }, [busy,pending,onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
  useEffect(() => {
    const warn=e=>{if(pending){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[pending]);
  function remember(command) {
    if(command) {
      try { sessionStorage.setItem(pendingKey,JSON.stringify(command)); }
      catch { throw new Error('裝置暫存無法使用，尚未送出。請允許瀏覽器儲存後重試。'); }
    } else {
      try { sessionStorage.removeItem(pendingKey); } catch { /* A retained request can only replay its original result. */ }
    }
    setPending(command);
  }
  useEffect(() => {
    if(!editor && !images.length) return;
    const previous=document.activeElement;
    const dialog=document.querySelector('.ds-dialog');
    const focusable=()=>[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
    focusable()[0]?.focus();
    const key=e=>{
      if(e.key==='Escape' && !busy && !pending) {setEditor(null);setImages([]);}
      if(e.key==='Tab') {
        const elements=focusable(), first=elements[0], last=elements.at(-1);
        if(e.shiftKey && document.activeElement===first) {e.preventDefault();last?.focus();}
        if(!e.shiftKey && document.activeElement===last) {e.preventDefault();first?.focus();}
      }
    };
    dialog.addEventListener('keydown',key);
    return ()=>{dialog.removeEventListener('keydown',key);previous?.focus();};
  },[!!editor,images.length,busy,!!pending]);
  async function load() {
    const n = ++generation.current;
    const result = await repository.call('day', { date });
    if (n === generation.current) setData(result);
    return result;
  }
  useEffect(() => { setData(null); setError(''); setEditor(null); setHistory(null); load().catch(e=>setError(e.message)); return ()=>{generation.current++;}; }, [date,repository]);
  useEffect(() => () => images.forEach(x=>URL.revokeObjectURL(x.url)), [images]);
  async function run(work) {
    if (lock.current) return;
    lock.current=true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch(e) { setError(e.message); }
    finally { lock.current=false; setBusy(false); }
  }
  async function execute(command) {
    if (command.action !== 'assign_batch') return repository.call(command.action,command.payload);
    for (const item of command.payload.items) await repository.call(item.action,item.payload);
    return { count: command.payload.items.length };
  }
  async function submit(action, payload, retry) {
    await run(async()=>{
      const command = retry || {action,payload:{...payload,command_id:crypto.randomUUID()}};
      remember(command);
      try { await execute(command); }
      catch(e) {
        if(e.definite) { remember(null); await load(); }
        throw e;
      }
      remember(null); setEditor(null);
      setNotice(command.action==='assign_batch' ? `已安排 ${command.payload.items.length} 張調貨單，可以匯出。` : '已儲存');
      await load();
    });
  }
  const tasks = data ? selectedTasks(data,driver,wave,date) : [];
  const datedCandidates = data ? deliveryCandidatesForWave(data,date,wave) : [];
  const waveCounts = data ? deliveryWaveCounts(data,date) : {primary:0,additional:0,late:0};
  const selectedDriver = data?.drivers.find(item=>item.id===driver);
  const disabled = busy || !!pending;
  const patch = (key,value) => setEditor(e=>({...e,payload:{...e.payload,[key]:value}}));
  async function exportFile(kind) {
    await run(async()=>{
      const fresh=await load();
      const model=deliveryModel(fresh,date,driver,new Date().toLocaleString('zh-TW',{hour12:false}),wave);
      if (!model.rows.length) throw new Error('此日期與人員沒有可匯出的配送安排');
      if(kind==='excel') downloadExcel(model);
      else setImages((await renderImages(model)).map(blob=>({blob,url:URL.createObjectURL(blob)})));
    });
  }
  function edit(t,action) {
    setEditor({action,payload:{id:t.id,version:t.version,request_version:t.request.version,driver_id:t.driver_id,date:t.delivery_date,position:t.position,reason:['pick','deliver'].includes(action)?labels[action]:''}});
  }
  function assignDay() {
    const startPosition=Math.max(0,...tasks.map(task=>task.position));
    const items=dailyAssignmentCommands(datedCandidates,driver,date,startPosition,()=>crypto.randomUUID());
    if(!items.length) return;
    submit('assign_batch',{items});
  }
  const retryControls = pending && !busy && <div className="ds-actions"><button type="button" onClick={()=>submit(null,null,pending)}>重試原操作</button></div>;
  return <section className="delivery-sheet" aria-label="每日送貨表"><h3>每日送貨表</h3>
    <div className="ds-toolbar"><label>送貨日期<input type="date" value={date} disabled={disabled} onChange={e=>e.target.value&&setDate(e.target.value)}/></label><label>送貨人員<select value={driver} disabled={disabled} onChange={e=>setDriver(e.target.value)}><option value="">全部人員</option>{data?.drivers.map(d=><option key={d.id} value={d.id}>{d.name}{!d.active?'（停用）':''}</option>)}</select></label><button type="button" disabled={busy} onClick={()=>run(load)}>重新整理</button></div>
    {error&&<p className="tr-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{retryControls}
    {!data?<p>{error?'送貨資料尚未載入。':'正在讀取…'}</p>:<>
      <div className="ds-wave-tabs" role="group" aria-label="配送趟次">{Object.entries(DELIVERY_WAVES).map(([key,item])=><button type="button" key={key} className={`ds-wave-${key}`} aria-pressed={wave===key} disabled={disabled} onClick={()=>{setWave(key);setNotice('');}}><strong>{item.label}</strong><span>{item.detail} · {waveCounts[key]} 張</span></button>)}</div>
      <p className="ds-wave-help">{wave==='primary'?'前一日晚間及當日 11:30 前成立的調貨單。':wave==='additional'?'當日 11:30 後至 15:00 成立的追加調貨單。':'當日 15:00 後成立，請總部逐張確認是否當日配送或改排隔日。'}</p>
      {actor.is_hq&&datedCandidates.length>0&&<div className={`ds-unassigned ds-unassigned-${wave}`} role="status"><div><strong>{date}「{waveLabel(wave)}」尚有 {datedCandidates.length} 張未安排</strong><span>{wave==='late'?'逾時單請在下方逐張確認安排。':selectedDriver?`將安排給「${selectedDriver.name}」；完成後即可匯出。`:'請先選擇送貨人員，再安排目前趟次。'}</span></div>{wave!=='late'&&<button type="button" disabled={disabled||!driver||!selectedDriver?.active} onClick={assignDay}>安排{waveLabel(wave)}全部 {datedCandidates.length} 張</button>}</div>}
      <div className="ds-actions"><button type="button" disabled={disabled||!tasks.length} onClick={()=>exportFile('excel')}>匯出 Excel</button><button type="button" disabled={disabled||!tasks.length} onClick={()=>exportFile('image')}>下載圖片</button></div>
      {!tasks.length&&<p>{datedCandidates.length?`${waveLabel(wave)}尚未安排送貨人員，因此目前無法匯出。`:`當日沒有${waveLabel(wave)}安排`}</p>}
      <div className="ds-tasks">{tasks.map(t=>{
        const canHandlePickup=actor.is_hq||actor.store===t.request.sender;
        const canHandleDelivery=actor.is_hq||actor.store===t.request.receiver;
        const canPick=t.state==='planned'&&t.request.status==='shipped'&&canHandlePickup;
        const canDeliver=t.state==='picked'&&['shipped','disputed','completed'].includes(t.request.status)&&canHandleDelivery;
        return <article className={`ds-task ds-order-tone-${deliveryOrderTone(t.request)}`} key={t.id}>
        <header><strong>順序 {t.position} · {t.driver_name}</strong><span className="ds-order-number">TR-{String(t.request.number).padStart(6,'0')}</span><span className={`ds-wave-badge ds-wave-${deliveryWave(t.request,date)}`}>{waveLabel(deliveryWave(t.request,date))}</span><span>{statusLabel(t)}</span></header>
        <div className="ds-route"><div><small>出貨店</small><b>{t.request.data.sender_name||t.request.sender}</b></div><span>→</span><div><small>收貨店</small><b>{t.request.data.receiver_name||t.request.receiver}</b></div></div>
        <ul>{(t.request.data.shipped||t.request.data.lines).map((l,i)=><li key={i}><span>{l.name}{l.stock_pickup&&<small>庫存取貨</small>}</span><strong>{l.quantity} {l.unit}</strong></li>)}</ul>
        {t.request.data.note&&<p className="ds-note">備註：{t.request.data.note}</p>}
        <div className="ds-checks">
          {t.picked_at?<button type="button" className="ds-step-done" disabled>✓ 已取<small>{new Date(t.picked_at).toLocaleString('zh-TW',{hour12:false})}</small></button>
            :t.request.status==='requested'&&canHandlePickup?<button type="button" className="ds-step-warning" disabled={disabled} onClick={()=>onOpen(t.request_id)}>先確認出貨</button>
            :<button type="button" className={canPick?'ds-step-ready':''} disabled={disabled||!canPick} onClick={()=>edit(t,'pick')}>確認已取</button>}
          {t.delivered_at?<button type="button" className="ds-step-done" disabled>✓ 已送<small>{new Date(t.delivered_at).toLocaleString('zh-TW',{hour12:false})}</small></button>
            :<button type="button" className={canDeliver?'ds-step-ready':''} disabled={disabled||!canDeliver} onClick={()=>edit(t,'deliver')}>確認已送</button>}
        </div>
        {t.request.status==='requested'&&<p className="ds-step-help">原調貨單尚未確認出貨，請先核對實際出貨數量。</p>}
        <div className="ds-actions">
          {actor.is_hq&&t.state==='planned'&&<button type="button" disabled={disabled} onClick={()=>edit(t,'edit')}>調整順序</button>}
          <button type="button" disabled={disabled} onClick={()=>onOpen(t.request_id)}>原調貨單</button>
        </div>
        <details><summary>管理與紀錄</summary><p>調貨單 {t.request.number}</p><div className="ds-actions">
          {actor.is_hq&&t.state==='planned'&&<button type="button" disabled={disabled} onClick={()=>edit(t,'cancel')}>取消配送</button>}
          <button type="button" disabled={busy} onClick={()=>run(async()=>setHistory({id:t.id,rows:await repository.call('history',{id:t.id})}))}>查看紀錄</button></div>
          {history?.id===t.id&&history.rows.map(e=><p key={e.id}>{labels[e.action]} · {e.actor_name} · {new Date(e.created_at).toLocaleString('zh-TW')}<br/>{e.reason}</p>)}
        </details>
      </article>})}</div>
      {actor.is_hq&&<details className="ds-manage"><summary>安排送貨／人員管理</summary><h4>{date} · {waveLabel(wave)}待安排調貨單</h4>{!datedCandidates.length&&<p>目前趟次沒有待安排的調貨單</p>}
        {datedCandidates.map(r=><div className="ds-candidate" key={r.id}><span>{r.data.sender_name} → {r.data.receiver_name}<small>{r.data.date} · 單號 {r.number}</small></span><button type="button" disabled={disabled} onClick={()=>setEditor({action:'assign',payload:{request_id:r.id,request_version:r.version,date,driver_id:driver,position:Math.max(0,...tasks.map(t=>t.position))+1,reason:'安排配送'}})}>安排</button></div>)}
        <h4>送貨人員</h4><button type="button" disabled={disabled} onClick={()=>setEditor({action:'driver',payload:{name:'',reason:'新增送貨人員'}})}>新增人員</button>
        {data.drivers.map(d=><div className="ds-candidate" key={d.id}><span>{d.name} · {d.active?'啟用':'停用'}</span><button type="button" disabled={disabled} onClick={()=>setEditor({action:'driver',payload:{...d,reason:''}})}>編輯</button></div>)}
      </details>}
    </>}
    {editor&&<div className="ds-overlay"><section role="dialog" aria-modal="true" aria-label="配送設定" className="ds-dialog"><h3>{labels[editor.action]}</h3>
      <form onSubmit={e=>{e.preventDefault();submit(editor.action,editor.payload);}}><fieldset disabled={disabled}>
        {['assign','edit'].includes(editor.action)&&<><label>日期<input type="date" required value={editor.payload.date} onChange={e=>patch('date',e.target.value)}/></label><label>送貨人員<select required value={editor.payload.driver_id} onChange={e=>patch('driver_id',e.target.value)}><option value="">請選擇</option>{data.drivers.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>順序<input type="number" min="1" max="9999" step="1" required value={editor.payload.position} onChange={e=>patch('position',Number(e.target.value))}/></label></>}
        {editor.action==='driver'&&<><label>姓名<input required maxLength="40" value={editor.payload.name} onChange={e=>patch('name',e.target.value)}/></label>{editor.payload.id&&<label className="ds-toggle"><input type="checkbox" checked={editor.payload.active} onChange={e=>patch('active',e.target.checked)}/>啟用</label>}</>}
        <label>原因／確認備註<input required maxLength="500" value={editor.payload.reason} onChange={e=>patch('reason',e.target.value)}/></label><div className="ds-actions"><button type="button" onClick={()=>setEditor(null)}>返回</button><button type="submit">確認儲存</button></div>
      </fieldset></form>{error&&<p role="alert">{error}</p>}{retryControls}
    </section></div>}
    {images.length>0&&<div className="ds-overlay"><section className="ds-dialog ds-preview" role="dialog" aria-modal="true" aria-label="送貨表圖片"><button type="button" onClick={()=>setImages([])}>關閉</button>{images.map((x,i)=><div key={x.url}><img src={x.url} alt={`每日送貨表第${i+1}張`}/><button type="button" onClick={()=>saveBlob(x.blob,`每日送貨表-${date}-${i+1}.png`)}>下載第 {i+1} 張</button></div>)}</section></div>}
  </section>;
}
