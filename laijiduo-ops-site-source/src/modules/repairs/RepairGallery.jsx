import React, { useEffect, useRef, useState } from 'react';
const groups = { report:'現場照片', completion:'完工照片', receipt:'費用單據' };

function StoredPhoto({ photo, storage }) {
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const dialog=useRef(null);
  useEffect(()=>{
    let active=true, local='';setUrl('');setError('');
    if(photo.state!=='available')return;
    storage.read(photo.path).then(blob=>{
      if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw new Error('照片格式無法顯示');
      if(active){local=URL.createObjectURL(blob);setUrl(local);}
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;if(local)URL.revokeObjectURL(local);};
  },[photo.path,photo.state,storage,attempt]);
  return <figure className="rp-photo rp-stored-photo">
    {photo.state!=='available' ? <p>照片尚未保存完成</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>重試讀取</button></div> : url ?
      <button className="rp-image-button" type="button" aria-label={`查看照片 ${photo.name}`} onClick={()=>dialog.current.showModal()}><img src={url} alt={photo.name}/></button> : <p role="status">讀取照片中…</p>}
    <figcaption>{photo.name}</figcaption>
    <dialog ref={dialog} className="rp-photo-dialog" aria-label={`照片 ${photo.name}`}>
      <header><strong>{photo.name}</strong><button type="button" aria-label="關閉照片" title="關閉照片" onClick={()=>dialog.current.close()}>×</button></header>
      {url && <img src={url} alt={photo.name}/>}
    </dialog>
  </figure>;
}

export default function RepairGallery({ ticketId, storage }) {
  const [photos,setPhotos]=useState(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setPhotos(null);setError('');
    storage.list(ticketId).then(rows=>{
      if(!Array.isArray(rows) || rows.some(row=>!row.id || !row.path || !Object.hasOwn(groups,row.purpose || 'report')))throw new Error('照片清單不完整');
      if(active)setPhotos(rows);
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[ticketId,storage,attempt]);
  return <section aria-label="報修照片與單據"><h3>照片與單據</h3>
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>重新載入照片</button></div>}
    {!photos && !error && <p role="status">讀取照片清單中…</p>}
    {photos && Object.entries(groups).map(([purpose,label])=><details key={purpose} open={purpose==='report'}><summary>{label}（{photos.filter(p=>(p.purpose || 'report')===purpose).length}）</summary>
      <div className="rp-photos">{photos.filter(p=>(p.purpose || 'report')===purpose).map(photo=><StoredPhoto key={photo.id} photo={photo} storage={storage}/>)}</div>
      {!photos.some(p=>(p.purpose || 'report')===purpose) && <p className="rp-muted">尚無{label}</p>}
    </details>)}
  </section>;
}
