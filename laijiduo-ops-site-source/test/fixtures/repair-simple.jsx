import React from 'react';
import {createRoot} from 'react-dom/client';
import SimpleRepairPage from '../../src/modules/repairs/SimpleRepairPage.jsx';
import {createSimpleRepairSubmission} from '../../src/modules/repairs/simpleSubmission.js';
import {createRepairJournal} from '../../src/modules/repairs/submission.js';
import {createRepairCommands} from '../../src/modules/repairs/commands.js';
const rows=[],events=[],results=new Map(),slots=new Map();
const photoStorage={list:async id=>[...slots.values()].filter(s=>s.ticketId===id),reserve:async p=>{if(!slots.has(p.id))slots.set(p.id,{...p,path:p.id,state:'reserved'});return slots.get(p.id);},upload:async(s,file)=>{slots.set(s.id,{...s,file,state:'uploaded'});},confirm:async p=>{const s=slots.get(p.id);slots.set(s.id,{...s,state:'available'});return slots.get(p.id);},read:async path=>slots.get(path).file};
const repository={list:async()=>({complete:true,actor:{active:true,manageRepairs:false,store:'S01'},stores:[{code:'S01',name:'五甲店'}],rows:[...rows]}),detail:async id=>({ticket:rows.find(r=>r.id===id),events:events.filter(e=>e.ticket_id===id)}),command:async(action,p)=>{
 if(results.has(p.command_id))return results.get(p.command_id);
 let row=rows.find(r=>r.id===p.id);const before=row?{...row}:null;
 if(!row){row={id:crypto.randomUUID(),number:1,storeName:'五甲店',version:0,created_at:new Date().toISOString(),status:'pending'};rows.push(row);}
 Object.assign(row,p,{id:row.id,version:row.version+1});
 if(action==='save')row.status=p.completed?'completed':'pending';
 if(action==='reopen')row.status='pending';
 if(action==='withdraw')row.status='withdrawn';
 events.push({id:events.length+1,ticket_id:row.id,actor_name:'測試店長',created_at:new Date().toISOString(),note:p.note||action,before_state:before,after_state:{...row}});
 const answer={...row};results.set(p.command_id,answer);return answer;
}};
const actorId='simple-fixture';
const submission=createSimpleRepairSubmission({repository,photoStorage,journal:createRepairJournal(),actorId});
const commands=createRepairCommands({repository,storage:sessionStorage,actorId});
createRoot(document.getElementById('root')).render(<><p>隔離測試，不連線正式資料庫。</p><SimpleRepairPage repository={repository} commands={commands} submission={submission} photoStorage={photoStorage}/></>);
