import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepairSubmission} from '../src/modules/repairs/submission.js';
const draft={store:'S01',category:'冰箱',description:'故障',urgency:'normal',contact:'',phone:''};
function setup(){
 let record;const journal={get:async()=>record,put:async(k,v)=>{record=structuredClone(v);},remove:async()=>{record=null;}};
 const calls=[];const repository={command:async(a,p)=>{calls.push(p);return {id:'ticket',version:1};}};
 const slots=new Map();let uploads=0,confirmations=0;
 const photoStorage={reserve:async j=>{if(!slots.has(j.id))slots.set(j.id,{...j,state:'reserved'});return slots.get(j.id);},upload:async s=>{uploads++;slots.set(s.id,{...s,state:'uploaded'});},confirm:async j=>{if(++confirmations===1)throw new Error('lost confirmation');slots.set(j.id,{...j,state:'available'});return slots.get(j.id);}};
 return {journal,repository,photoStorage,calls,uploads:()=>uploads};
}
test('photo bytes and exact command survive recreation; confirmation failure does not duplicate upload',async()=>{
 const deps=setup();const service=createRepairSubmission({...deps,actorId:'user'});
 const file=new File(['bytes'],'phone.jpg',{type:'image/jpeg'});
 await assert.rejects(service.submit(draft,[file]),/lost confirmation/);
 assert.ok(await service.pending());
 await assert.rejects(service.submit(draft,[]),/上一筆/);
 const next=createRepairSubmission({...deps,actorId:'user'});
 await next.retry();assert.equal(await next.pending(),null);
 assert.deepEqual(deps.calls[0],deps.calls[1]);assert.equal(deps.uploads(),1);
});
test('journal quota stops before creating a ticket',async()=>{
 const deps=setup();deps.journal.put=async()=>{throw new Error('quota');};
 await assert.rejects(createRepairSubmission({...deps,actorId:'user'}).submit(draft,[]),/quota/);
 assert.equal(deps.calls.length,0);
});
test('lost create response preserves files and retries the original identity',async()=>{
 const deps=setup();let n=0;deps.repository.command=async(a,p)=>{deps.calls.push(p);if(++n===1)throw new Error('timeout');return {id:'ticket',version:1};};
 const service=createRepairSubmission({...deps,actorId:'user'});
 await assert.rejects(service.submit(draft,[]),/timeout/);await service.retry();
 assert.deepEqual(deps.calls[0],deps.calls[1]);
});
