import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimpleRepairSubmission} from '../src/modules/repairs/simpleSubmission.js';
test('single save preserves photo bytes and both command identities after uncertain response',async()=>{
 let stored,fail=true,uploads=0;const calls=[],slots=new Map();
 const journal={get:async()=>stored,put:async(_,v)=>{stored=v;},remove:async()=>{stored=null;}};
 const repository={command:async(a,p)=>{calls.push([a,p.command_id]);if(a==='save'&&fail){fail=false;throw Error('timeout');}return{id:'ticket',version:a==='prepare'?2:3};}};
 const photoStorage={list:async()=>[],reserve:async j=>slots.get(j.id)||{...j,state:'reserved'},upload:async(s)=>{uploads++;slots.set(s.id,{...s,state:'uploaded'});},confirm:async j=>{const s={...slots.get(j.id),state:'available'};slots.set(j.id,s);return s;}};
 const build=()=>createSimpleRepairSubmission({repository,photoStorage,journal,actorId:'store'});
 const file=new File(['image'],'photo.png',{type:'image/png'});
 await assert.rejects(build().submit({description:'test',completed:true},{completion:[file]}),/timeout/);
 assert.equal(stored.photos[0].file,file);const original=stored;
 await build().retry();assert.equal(uploads,1);assert.equal(stored,null);
 assert.deepEqual(calls,[['prepare',original.prepare.command_id],['save',original.finalId],['prepare',original.prepare.command_id],['save',original.finalId]]);
});
