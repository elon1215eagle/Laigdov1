import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase.js';

export default function StoreControls({onSaved}){
 const [stores,setStores]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){const {data,error}=await supabase.rpc('laigdo_order_catalog');if(error)throw error;setStores(data||[])}
 useEffect(()=>{let live=true;supabase.rpc('laigdo_order_catalog').then(({data,error})=>{if(!live)return;if(error)setError('讀取門店失敗，請重新整理');else setStores(data||[])});return()=>{live=false}},[]);
 async function toggle(s){setBusy(true);setError('');try{
  const {error}=await supabase.rpc('laigdo_order_ops',{p_action:'accepting',p_payload:{store_id:s.id,version:s.version,accepting:!s.accepting}});
  if(error)throw error;await load();await onSaved();
 }catch(e){setError(e.message?.includes('stale_version')?'門店資料已更新，請按更新門店後再操作':'設定失敗，請更新門店後再試')}finally{setBusy(false)}}
 return <section className="online-store-controls"><div className="online-toolbar"><h3>門店開關</h3><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await load()}catch{setError('讀取門店失敗')}finally{setBusy(false)}}}>更新門店</button></div>
  {error&&<p role="alert">{error}</p>}
  <div className="online-availability">{stores.map(s=><div className="availability-row" key={s.id}><strong className="availability-name">{s.name}</strong><span className={`availability-status ${s.accepting?'is-selling':'is-soldout'}`}>{s.accepting?'已開啟':'已關閉'}</span><button className="availability-action" disabled={busy} aria-label={`${s.name}：${s.accepting?'關閉點餐':'開啟點餐'}`} onClick={()=>toggle(s)}>{s.accepting?'關閉':'開啟'}</button></div>)}</div>
  <p className="store-control-note">關閉後停止接受新訂單，既有訂單仍可處理。</p>
 </section>
}
