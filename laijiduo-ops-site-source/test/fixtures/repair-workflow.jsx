import React, { useMemo,useState } from 'react';
import {createRoot} from 'react-dom/client';
import RepairPage from '../../src/modules/repairs/RepairPage.jsx';
import {transitionRepair} from '../../src/modules/repairs/domain.js';
import {createRepairCommands} from '../../src/modules/repairs/commands.js';
import {createRepairSubmission,createRepairJournal} from '../../src/modules/repairs/submission.js';
let rows=[], events=[], results=new Map();
const photoSlots=new Map();
const photoStorage={
 reserve:async job=>{if(!photoSlots.has(job.id))photoSlots.set(job.id,{...job,path:`${job.ticketId}/${job.id}`,purpose:job.purpose || 'report',state:'reserved'});return photoSlots.get(job.id);},
 upload:async(slot,file)=>{photoSlots.set(slot.id,{...slot,state:'uploaded',file});},
 confirm:async job=>{const slot=photoSlots.get(job.id);if(!slot?.file)throw new Error('尚未上傳');photoSlots.set(job.id,{...slot,state:'available'});return photoSlots.get(job.id);},
 list:async ticketId=>Array.from(photoSlots.values()).filter(p=>p.ticketId===ticketId),
 read:async path=>{const slot=Array.from(photoSlots.values()).find(p=>p.path===path);if(!slot?.file)throw new Error('照片不存在');return slot.file;},
};
function Preview() {
 const [role,setRole]=useState('store');
 const actor={id:role,active:true,store:role==='store'?'S01':null,manageRepairs:role==='hq'};
 const repository=useMemo(()=>({
  list:async()=>({actor,complete:true,stores:[{code:'S01',name:'五甲店'}],rows:[...rows]}),
  detail:async id=>({ticket:rows.find(r=>r.id===id),events:events.filter(e=>e.ticket===id)}),
  command:async(action,payload)=>{
   if(results.has(payload.command_id))return results.get(payload.command_id);
   try {
    let row; let before=null;
    if(action==='create'){row={...payload,id:crypto.randomUUID(),number:rows.length+1,status:'pending',version:1,createdAt:new Date().toISOString(),storeName:'五甲店'};rows.push(row);}
    else {const index=rows.findIndex(r=>r.id===payload.id);before=rows[index];row=transitionRepair(rows[index],{...payload,action},actor);if(action==='finish')row.result=payload.note;if(['start','update_work','finish'].includes(action)){row={...row,assignee:payload.assignee,vendor:payload.vendor,due_date:payload.due_date,lastHandling:{name:'預覽總部',role:'coo',at:new Date().toISOString()}};}rows[index]=row;}
    if(['start','update_work','finish','update_cost'].includes(action)){row.cost=payload.cost===''?null:payload.cost;row.cost_note=payload.cost_note;}
    events.push({id:events.length+1,ticket:row.id,action,actor_role:role==='hq'?'coo':'store_manager',actor_name:role==='hq'?'預覽總部':'預覽門店',note:payload.note||'建立報修',created_at:new Date().toISOString(),before_state:before,after_state:row});
    results.set(payload.command_id,row);return row;
   }catch(e){e.definite=true;throw e;}
  },
 }),[role]);
 const commands=useMemo(()=>createRepairCommands({repository,storage:sessionStorage,actorId:`fixture-${role}`}),[repository,role]);
 const submission=useMemo(()=>createRepairSubmission({repository,photoStorage,journal:createRepairJournal(),actorId:`fixture-${role}`}),[repository,role]);
 return <><aside style={{padding:16,fontFamily:'system-ui'}}>隔離流程測試：單據僅在記憶體中，不連正式系統。照片送出只模擬儲存；未完成送出暫存在此瀏覽器。
 <button onClick={()=>setRole('store')}>模擬門店</button><button onClick={()=>setRole('hq')}>模擬總部</button></aside><RepairPage key={role} repository={repository} commands={commands} submission={submission} photoStorage={photoStorage}/></>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
