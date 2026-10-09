import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import './onlineOrdering.css';
import {comparePending} from './orderMonitor.js';
import MenuEditor from './MenuEditor.jsx';
import StoreControls from './StoreControls.jsx';
import {menuError} from './menuEditor.js';
const labels={pending:'待接單',accepted:'已接單',preparing:'製作中',ready:'已打包',completed:'已交餐',cancelled:'已取消'};
const next={pending:'accepted',accepted:'ready',preparing:'ready',ready:'completed'};
const actionLabels={accepted:'確認接單',preparing:'開始製作',ready:'完成打包',completed:'確認已收款並交餐'};
const time=v=>new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
async function call(action,payload){
 if(!supabase)throw new Error('尚未設定測試資料庫。此開發副本不會連線正式環境。');
 const {data,error}=await supabase.rpc('laigdo_order_ops',{p_action:action,p_payload:payload});
 if(error){const message=error.message.includes('stale_version')?'資料已被更新，請重新整理後再操作':error.message.includes('forbidden')?'沒有此門店的操作權限':error.message;throw new Error(message)}
 return data;
}
export default function OnlineOrderingPage({profile,stores}){
 const manager=['ceo','coo','admin','hq'].includes(profile?.role);
 const available=manager?stores:stores.filter(s=>s.id===profile?.store_id);
 const [storeId,setStoreId]=useState(profile?.store_id||available[0]?.id||'');
 const [data,setData]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState('');
 const [draft,setDraft]=useState('[]'),[confirmed,setConfirmed]=useState(false),[hours,setHours]=useState({open_minute:660,close_minute:1260,lead_minutes:30});
 const [draftVersion,setDraftVersion]=useState(0);
 const [filter,setFilter]=useState('active'),[reasons,setReasons]=useState({});
 const [lastUpdate,setLastUpdate]=useState(null),[updateError,setUpdateError]=useState(''),[soundEnabled,setSoundEnabled]=useState(false);
 const scope=useRef(0),pendingIds=useRef(null),sound=useRef(null),soundOn=useRef(false),requestRunning=useRef(false);
 const menu=data?.menu;
 const orderList=useRef(null),jumpPending=useRef(false);
 useEffect(()=>{if(jumpPending.current){jumpPending.current=false;orderList.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});orderList.current?.focus({preventScroll:true})}},[filter]);
 function showPending(){if(filter==='active'){orderList.current?.scrollIntoView({behavior:'smooth',block:'start'});orderList.current?.focus({preventScroll:true})}else{jumpPending.current=true;setFilter('active')}}
 function beep(){try{const context=sound.current;if(!soundOn.current||context?.state!=='running')return;[880,1175,880].forEach((frequency,index)=>{const start=context.currentTime+index*0.38;const oscillator=context.createOscillator(),gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(0.2,start+0.025);gain.gain.exponentialRampToValueAtTime(0.001,start+0.3);oscillator.start(start);oscillator.stop(start+0.32);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()}})}catch{setUpdateError('提示音無法播放，請以畫面待接單提示為準')}}
 function receive(result,id){const changes=comparePending(pendingIds.current,result.orders);pendingIds.current=changes.ids;setData(result);setLoaded(id);setLastUpdate(new Date());setUpdateError('');if(changes.newCount){setMessage(`收到 ${changes.newCount} 筆新訂單，請確認接單`);beep()}}
 async function toggleSound(){if(soundOn.current){soundOn.current=false;setSoundEnabled(false);return}try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error();sound.current ||= new Audio();await sound.current.resume();soundOn.current=true;setSoundEnabled(true);beep()}catch{setUpdateError('瀏覽器未允許提示音，請保持接單畫面開啟')}}
 useEffect(()=>()=>{scope.current++;sound.current?.close().catch(()=>{})},[]);
 async function refresh(id=storeId){
  if(!id)return;
  const generation=scope.current;
  const result=await call('read',{store_id:id});
  if(generation!==scope.current)return;
  receive(result,id);
  return result;
 }
 useEffect(()=>{
  const generation=++scope.current;let live=true;requestRunning.current=false;pendingIds.current=null;
  setData(null);setLoaded('');setMessage('');setLastUpdate(null);setUpdateError('');
  async function poll(initial=false){
   if(!storeId||!supabase||!live||(!initial&&document.visibilityState==='hidden')||requestRunning.current)return;
   requestRunning.current=true;
   try{const result=await call('read',{store_id:storeId});if(!live||generation!==scope.current)return;
    receive(result,storeId);
    if(initial){setDraft(JSON.stringify(result.menu?.products||[],null,2));setHours({open_minute:result.menu?.open_minute??660,close_minute:result.menu?.close_minute??1260,lead_minutes:result.menu?.lead_minutes??30});setDraftVersion(result.menu?.version||0);setConfirmed(false)}
   }catch(e){if(live&&generation===scope.current)setUpdateError('更新失敗：'+e.message+'。請手動更新後再確認接單。')}
   finally{if(generation===scope.current)requestRunning.current=false}
  }
  if(!supabase)setMessage('尚未設定測試資料庫。此開發副本不會連線正式環境。');
  poll(true);const timer=setInterval(()=>poll(),15000);const resume=()=>{if(document.visibilityState==='visible')poll()};document.addEventListener('visibilitychange',resume);
  return()=>{live=false;scope.current++;clearInterval(timer);document.removeEventListener('visibilitychange',resume)};
 },[storeId]);
 async function mutate(action,payload){setBusy(true);setMessage('');try{await call(action,{store_id:storeId,...payload});await refresh();setMessage('已儲存')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 async function manualRefresh(){setBusy(true);try{await refresh();setMessage('訂單狀態已更新')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 const ready=loaded===storeId&&Boolean(data)&&!busy&&!updateError;
 function exportCsv(){
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['訂單號','門店','狀態','取餐時間（台灣）','金額','姓名','電話','品項','備註'],...(data?.orders||[]).map(o=>[o.number,available.find(s=>s.id===storeId)?.name,labels[o.status],time(o.pickup_at),o.total,o.customer_name,o.phone,o.lines.map(x=>`${x.name}×${x.quantity}${(x.options || []).map(option => `（${option.name}：${option.label}）`).join("")}${x.note ? `（${x.note}）` : ""}`).join('；'),o.note])];
  const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='萊吉多線上訂單_最近7天_最多200筆.csv';a.click();URL.revokeObjectURL(url);
 }
 return <section className="online-orders panel"><h2>{manager?'線上點餐｜總部管理':'線上點餐｜門市接單'}</h2>
  {manager&&supabase&&<StoreControls onSaved={()=>refresh()}/>}
  <div className="online-toolbar online-store-row"><label>門店<select value={storeId} onChange={e=>setStoreId(e.target.value)} disabled={busy}>{available.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="online-refresh" onClick={manualRefresh} disabled={!storeId||busy}>更新訂單</button>{manager&&<button disabled={!ready} onClick={exportCsv}>匯出最近 7 天（最多 200 筆）</button>}</div>
  <div className="online-monitor"><span>自動更新 · {lastUpdate?lastUpdate.toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'載入中'}</span><button onClick={toggleSound} disabled={!supabase}>{soundEnabled?'提示音已開啟':'開啟提示音'}</button><small>請保持頁面開啟</small></div>
  {updateError&&<p role="alert" className="online-error">{updateError}</p>}
  {message&&<p role="status">{message}</p>}
  {data?.report.pending>0&&<div className="online-pending" role="status">有 {data.report.pending} 筆待接單，請立即確認。<button onClick={showPending}>查看待處理</button></div>}
  {data&&<><div className="online-metrics"><span>近 7 天訂單 <strong>{data.report.orders}</strong></span><span>已交餐金額 <strong>NT$ {data.report.completed_revenue}</strong></span><span>待接單 <strong>{data.report.pending}</strong></span><span>取消 <strong>{data.report.cancelled}</strong></span></div>
   <div className="online-toolbar"><strong>{menu?.accepting?'門店接單中':'門店暫停接單'}</strong><button disabled={!ready||!menu} onClick={()=>mutate('accepting',{version:menu.version,accepting:!menu.accepting})}>{menu?.accepting?'暫停接單':'開放接單'}</button><label>訂單篩選<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">待處理</option><option value="all">全部</option><option value="completed">已交餐</option><option value="cancelled">已取消</option></select></label></div>

   <div className="online-list" ref={orderList} tabIndex={-1} aria-label="待處理訂單">{data.orders.filter(o=>filter==='all'||(filter==='active'?!['completed','cancelled'].includes(o.status):filter===o.status)).map(o=><article key={o.id}><div className="online-toolbar"><h3>#{o.number} · {labels[o.status]}</h3><strong>NT$ {o.total}</strong></div><p>取餐：{time(o.pickup_at)}（台灣）</p><p>{o.customer_name} · <a href={'tel:'+o.phone}>{o.phone}</a></p><ul>{o.lines.map(l=><li key={l.code}>{l.name} × {l.quantity} · NT$ {l.line_total}{l.options?.map(x => <small key={x.id}>｜{x.name}：{x.label}</small>)}{l.note && <small>｜餐點備註：{l.note}</small>}</li>)}</ul><p>備註：{o.note||'無'}</p><div className="online-toolbar">{next[o.status]&&<button className={`online-step step-${next[o.status]}`} disabled={!ready} onClick={()=>mutate('transition',{order_id:o.id,version:o.version,status:next[o.status]})}>{actionLabels[next[o.status]]}</button>}{['pending','accepted'].includes(o.status)&&<><input aria-label={'訂單'+o.number+'取消原因'} placeholder="取消原因（必填）" maxLength={200} value={reasons[o.id]||''} onChange={e=>setReasons({...reasons,[o.id]:e.target.value})}/><button disabled={!ready||!reasons[o.id]?.trim()} onClick={()=>mutate('transition',{order_id:o.id,version:o.version,status:'cancelled',reason:reasons[o.id]})}>取消訂單</button></>}</div></article>)}</div>
   <h3>門市售完控制</h3><div className="online-availability">{menu?.products.map(p=><div className="availability-row" key={p.code}><strong className="availability-name">{p.name}</strong><span className={`availability-status ${p.sold_out?'is-soldout':'is-selling'}`}>{p.sold_out?'已售完':'販售中'}</span><button className="availability-action" aria-label={`${p.name}：${p.sold_out?'恢復販售':'設為售完'}`} disabled={!ready} onClick={()=>mutate('availability',{version:menu.version,code:p.code,sold_out:!p.sold_out})}>{p.sold_out?'恢復販售':'設為售完'}</button></div>)}</div>
   {manager&&<details><summary>總部菜單發布</summary><p>各門店分別發布。價格須由總部確認；首次發布後預設暫停接單。編輯前請按「載入目前菜單」，避免覆蓋他人的售完設定。</p><button disabled={!ready} onClick={()=>{setDraft(JSON.stringify(menu?.products||[],null,2));setHours({open_minute:menu?.open_minute??660,close_minute:menu?.close_minute??1260,lead_minutes:menu?.lead_minutes??30});setDraftVersion(menu?.version||0);setConfirmed(false)}}>載入目前菜單</button><MenuEditor value={draft} disabled={!ready} onChange={value=>{setDraft(value);setConfirmed(false)}}/><div className="online-toolbar">{[['open_minute','開始時間（午夜後分鐘）'],['close_minute','結束時間（午夜後分鐘）'],['lead_minutes','提前預訂分鐘']].map(([key,label])=><label key={key}>{label}<input type="number" value={hours[key]} onChange={e=>{setHours({...hours,[key]:Number(e.target.value)});setConfirmed(false)}}/></label>)}</div><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 我已核對商品、價格及取餐時段</label><button disabled={!ready||!confirmed} onClick={()=>{try{const products=JSON.parse(draft);const error=menuError(products);if(error){setMessage(error);return}mutate('save_menu',{products,...hours,version:draftVersion,confirmed:true})}catch{setMessage('菜單 JSON 格式有誤')}}}>確認並發布菜單</button></details>}
   <details><summary>最近 50 筆操作紀錄</summary>{data.events.map(e=><p key={e.id}>{time(e.created_at)} · {e.action} · {e.order_id?data.orders.find(o=>o.id===e.order_id)?.number||e.order_id:'菜單設定'} · {e.reason}</p>)}</details>
  </>}
 </section>
}
