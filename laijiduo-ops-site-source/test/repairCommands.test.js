import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairCommands } from '../src/modules/repairs/commands.js';
function memory() { const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}; }
test('timeout survives service recreation and retries the same exact request',async()=>{
 const storage=memory();let calls=[];
 const repository={command:async(a,p)=>{calls.push({a,p});if(calls.length===1)throw new Error('timeout');return {id:'ticket',version:1};}};
 const first=createRepairCommands({repository,storage,actorId:'a',uuid:()=> 'one'});
 await assert.rejects(first.send('create',{description:'cold'}));
 await assert.rejects(first.send('create',{description:'new'}),/上一筆/);
 const second=createRepairCommands({repository,storage,actorId:'a'});
 await second.retry();assert.deepEqual(calls[0],calls[1]);assert.equal(second.pending(),null);
});
test('storage failure means no network writes',async()=>{
 let calls=0;const commands=createRepairCommands({actorId:'a',storage:{getItem:()=>null,setItem:()=>{throw new Error('quota');}},repository:{command:async()=>calls++}});
 await assert.rejects(commands.send('create',{}));assert.equal(calls,0);
});
test('definite rejection unlocks edits but incomplete response keeps pending',async()=>{
 const storage=memory();const repository={command:async()=>{throw Object.assign(new Error('version'),{definite:true})}};
 const commands=createRepairCommands({actorId:'a',storage,repository});
 await assert.rejects(commands.send('finish',{}));assert.equal(commands.pending(),null);
 repository.command=async()=>({});await assert.rejects(commands.send('finish',{}));assert.ok(commands.pending());
});
test('one actor cannot retry another actor journal',()=>{
 const storage=memory();storage.setItem('repair-command:b',JSON.stringify({actorId:'a',action:'create',payload:{command_id:'x'}}));
 assert.throws(()=>createRepairCommands({actorId:'b',storage,repository:{}}).pending());
});
