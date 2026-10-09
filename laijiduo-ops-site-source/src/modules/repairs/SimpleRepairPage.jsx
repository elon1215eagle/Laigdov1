import React,{useEffect,useState} from 'react';
import {REPAIR_CATEGORIES,REPAIR_URGENCY,repairDraftError,validRepairCost,repairCostLabel} from './domain.js';
import RepairPhotos from './RepairPhotos.jsx';
import RepairGallery from './RepairGallery.jsx';
import './repairs.css';
const emptyPhotos=()=>({report:[],completion:[],receipt:[]});
const titles={report:'現場照片',completion:'完工照片',receipt:'費用單據'};
const methods={headquarters:'請總部處理',store:'門店自行叫修'};
const status=r=>r.status==='completed'?'completed':r.status==='withdrawn'?'withdrawn':'pending';
const when=v=>v?new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'';
const labels={pending:'待處理',completed:'已處理',withdrawn:'已撤銷'};

export default function SimpleRepairPage({repository,commands,submission,photoStorage}){
 const [data,setData]=useState(null),[revision,setRevision]=useState(0),[error,setError]=useState('');
 const [tab,setTab]=useState('pending'),[store,setStore]=useState(''),[form,setForm]=useState(null),[original,setOriginal]=useState(null);
 const [photos,setPhotos]=useState(emptyPhotos),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[history,setHistory]=useState(null);
 const [commandPending,setCommandPending]=useState(false);
 const patch=(key,value)=>setForm(old=>({...old,[key]:value}));
 async function refreshPending(){setPending(!!await submission.pending());setCommandPending(!!commands.pending());}
 useEffect(()=>{refreshPending().catch(e=>setError(e.message));},[]);
 useEffect(()=>{let active=true;repository.list().then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[repository,revision]);
 useEffect(()=>{if(!form&&!busy&&!pending&&!commandPending)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[form,busy,pending,commandPending]);
 async function perform(fn){if(busy)return;setBusy(true);setError('');try{await fn();setForm(null);setPhotos(emptyPhotos());setHistory(null);setRevision(v=>v+1);}catch(e){setError(e.message);}finally{try{await refreshPending();}catch(e){setPending(true);setError(e.message);}setBusy(false);}}
 function open(row){setOriginal(row||null);setHistory(null);setError('');setPhotos(emptyPhotos());setForm({
  ...(row?{id:row.id,version:row.version}:{}),store:row?.store||data.actor.store||'',category:row?.category||'其他',description:row?.description||'',urgency:row?.urgency||'normal',contact:row?.contact||'',phone:row?.phone||'',handling_method:row?.handling_method||'headquarters',
  assignee:row?.assignee||'',vendor:row?.vendor||'',due_date:row?.due_date||'',result:row?.result||'',cost:row?.cost==null?'':String(row.cost),cost_note:row?.cost_note||'',completed:row?.status==='completed',note:''});}
 function save(e){e.preventDefault();const message=repairDraftError(form)||(!validRepairCost(form.cost)?'費用最多兩位小數且不可為負數':'')||(form.completed&&!form.result.trim()?'請填寫維修結果':'')||(original&&form.handling_method!==(original.handling_method||'headquarters')&&!form.note.trim()?'請填寫變更處理方式的原因':'');if(message){setError(message);return;}perform(()=>submission.submit(form,photos));}
 const locked=busy||pending||commandPending;
 const rows=(data?.rows||[]).filter(r=>!store||r.store===store);
 return <main className="rp-page">
  <header className="rp-heading"><h1>門店報修</h1><div className="rp-actions"><button type="button" aria-label="更新列表" title="更新列表" disabled={locked||!!form} onClick={()=>setRevision(v=>v+1)}>↻</button><button type="button" className="rp-primary" disabled={!data||locked||!!form} onClick={()=>open(null)}>＋新增報修</button></div></header>
  {error&&<p role="alert">{error}</p>}
  {pending&&<div role="status"><p>保存尚未完成，原內容與照片已保留。</p><button disabled={busy} onClick={()=>perform(()=>submission.retry())}>接續保存</button></div>}
  {commandPending&&<button disabled={busy} onClick={()=>perform(()=>commands.retry())}>確認上一筆操作結果</button>}
  {!data&&<p role="status">讀取中…</p>}
  {data&&!form&&<><nav className="rp-summary rp-simple-summary" aria-label="報修狀態">{['pending','completed'].map(s=><button key={s} data-state={s} aria-pressed={tab===s} onClick={()=>setTab(s)}><span>{labels[s]}</span><strong>{rows.filter(r=>status(r)===s).length} 件</strong></button>)}</nav>
   {data.actor.manageRepairs&&<label className="rp-note">門店<select value={store} onChange={e=>setStore(e.target.value)}><option value="">全部門店</option>{data.stores.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>}
   <button aria-pressed={tab==='withdrawn'} onClick={()=>setTab('withdrawn')}>已撤銷（{rows.filter(r=>status(r)==='withdrawn').length}）</button>
   <section className="rp-list">{rows.filter(r=>status(r)===tab).map(r=><button className="rp-ticket" key={r.id} onClick={()=>open(r)}><strong>{r.storeName} · {r.category}</strong><span data-state={status(r)}>{labels[status(r)]} · {methods[r.handling_method||'headquarters']}</span><span>{r.description}</span><span>{REPAIR_URGENCY[r.urgency]} · {when(r.created_at)}</span><span>師傅／廠商：{r.vendor||'尚未登記'}</span>{r.pendingPhotos>0&&<span className="rp-danger">有照片尚未保存完成</span>}</button>)}</section>{!rows.some(r=>status(r)===tab)&&<p>目前沒有{labels[tab]}案件</p>}</>}
  {form&&<form onSubmit={save}><fieldset className="rp-edit-fieldset" disabled={locked||original?.status==='withdrawn'}><h2>{original?`報修 ${original.number}`:'新增報修'}</h2><div className="rp-fields">
   <label>門店<select value={form.store} disabled={!!original||!data.actor.manageRepairs} onChange={e=>patch('store',e.target.value)} required><option value="">請選擇門店</option>{data.stores.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
   <label>報修項目<select value={form.category} onChange={e=>patch('category',e.target.value)}>{REPAIR_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
   <label className="rp-full">問題說明<textarea required maxLength={2000} value={form.description} onChange={e=>patch('description',e.target.value)}/></label>
   <fieldset className="rp-method rp-full"><legend>處理方式</legend>{Object.entries(methods).map(([value,label])=><label key={value}><input type="radio" name="handling_method" value={value} checked={form.handling_method===value} onChange={()=>patch('handling_method',value)}/>{label}</label>)}</fieldset>
   {original&&form.handling_method!==(original.handling_method||'headquarters')&&<label className="rp-full">變更原因<textarea required maxLength={2000} value={form.note} onChange={e=>patch('note',e.target.value)}/></label>}
   <label>急迫程度<select value={form.urgency} onChange={e=>patch('urgency',e.target.value)}>{Object.entries(REPAIR_URGENCY).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <RepairPhotos files={photos.report} onChange={files=>setPhotos(old=>({...old,report:files}))}/>
   {(form.handling_method==='store'||!!original||data.actor.manageRepairs)&&<>
    <label>師傅／廠商（選填）<input maxLength={200} value={form.vendor} onChange={e=>patch('vendor',e.target.value)}/></label>
    <label>預計維修日期（選填）<input type="date" value={form.due_date} onChange={e=>patch('due_date',e.target.value)}/></label>
    {data.actor.manageRepairs&&<label>負責人（選填）<input maxLength={100} value={form.assignee} onChange={e=>patch('assignee',e.target.value)}/></label>}
    <label className="rp-check rp-full"><input type="checkbox" checked={form.completed} disabled={original?.status==='completed'} onChange={e=>patch('completed',e.target.checked)}/>已修好</label>
   </>}
   {form.completed&&<>
    <label className="rp-full">維修結果<textarea required maxLength={2000} value={form.result} onChange={e=>patch('result',e.target.value)}/></label>
    <label>費用狀態<select value={form.cost===''?'unknown':'known'} onChange={e=>patch('cost',e.target.value==='unknown'?'':'0')}><option value="unknown">尚未確認</option><option value="known">金額已確認</option></select></label>
    {form.cost!==''&&<label>維修費用（元）<input inputMode="decimal" maxLength={13} value={form.cost} onChange={e=>patch('cost',e.target.value)}/></label>}
    <label className="rp-full">費用說明（選填）<textarea maxLength={2000} value={form.cost_note} onChange={e=>patch('cost_note',e.target.value)}/></label>
    <p className="rp-muted rp-full">費用紀錄不代表已核准或付款。</p>
    {['completion','receipt'].map(p=><RepairPhotos key={p} title={titles[p]} files={photos[p]} onChange={files=>setPhotos(old=>({...old,[p]:files}))}/>)}
   </>}
   <details className="rp-full"><summary>聯絡資料（選填）</summary><div className="rp-fields"><label>聯絡人<input maxLength={100} value={form.contact} onChange={e=>patch('contact',e.target.value)}/></label><label>電話<input type="tel" maxLength={40} value={form.phone} onChange={e=>patch('phone',e.target.value)}/></label></div></details>
  </div><div className="rp-actions"><button className="rp-primary" type="submit">{busy?'保存中…':form.completed?'儲存並完成':original?'儲存變更':'送出報修'}</button></div></fieldset>
  {original&&<><RepairGallery ticketId={original.id} storage={photoStorage}/><details onToggle={async e=>{if(e.currentTarget.open){try{setHistory((await repository.detail(original.id)).events);}catch(err){setError(err.message);}}}}><summary>處理歷程</summary>{history?.map(item=><article className="rp-history-row" key={item.id}><strong>{item.note}</strong><p>{item.actor_name} · {when(item.created_at)}</p>{item.before_state&&item.before_state.handling_method!==item.after_state?.handling_method&&<p>處理方式：{methods[item.before_state.handling_method||'headquarters']} → {methods[item.after_state?.handling_method||'headquarters']}</p>}{item.before_state&&item.before_state.cost!==item.after_state?.cost&&<p>費用：{repairCostLabel(item.before_state.cost)} → {repairCostLabel(item.after_state?.cost)}</p>}</article>)}</details>
   {original.status!=='withdrawn'&&<details><summary>{original.status==='completed'?'仍有問題':'撤銷報修'}</summary><label className="rp-note">原因<textarea maxLength={2000} value={form.note} onChange={e=>patch('note',e.target.value)}/></label><button type="button" disabled={locked||!form.note.trim()} onClick={()=>perform(()=>commands.send(original.status==='completed'?'reopen':'withdraw',{id:original.id,version:original.version,note:form.note}))}>{original.status==='completed'?'重新處理':'確認撤銷'}</button></details>}</>}
  <button type="button" disabled={locked} onClick={()=>{if(original?.status==='withdrawn'||window.confirm('離開未送出的表單？')){setForm(null);setHistory(null);}}}>返回列表</button>
  </form>}
 </main>;
}
