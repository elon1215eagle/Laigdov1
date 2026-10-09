import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { dailyAssignmentCommands, deliveryCandidatesForDate, deliveryModel, deliveryOrderTone, deliveryWave, deliveryWaveCounts, excelXml, exportLines, imageSegments } from '../src/modules/transfer-delivery/model.js';

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('delivery waves follow Taipei 11:30 departure and 15:00 addition cutoff',()=>{
  assert.equal(deliveryWave({created_at:'2026-09-14T15:00:00.000Z'},'2026-09-15'),'primary');
  assert.equal(deliveryWave({created_at:'2026-09-15T03:29:59.000Z'},'2026-09-15'),'primary');
  assert.equal(deliveryWave({created_at:'2026-09-15T03:30:00.000Z'},'2026-09-15'),'additional');
  assert.equal(deliveryWave({created_at:'2026-09-15T06:59:59.000Z'},'2026-09-15'),'additional');
  assert.equal(deliveryWave({created_at:'2026-09-15T07:00:00.000Z'},'2026-09-15'),'late');
});

test('each transfer order keeps a stable visual tone',()=>{
  assert.equal(deliveryOrderTone({number:15}),deliveryOrderTone({number:15}));
  assert.notEqual(deliveryOrderTone({number:15}),deliveryOrderTone({number:16}));
});

test('daily candidates use the approved base route before other routes',()=>{
  const candidate=(id,sender,receiver)=>({id,number:Number(id),sender,receiver,version:1,created_at:'2026-09-14T12:00:00Z',data:{date:'2026-09-15'}});
  const candidates=[candidate('5','S10','S11'),candidate('3','S08','S03'),candidate('2','S02','S04'),candidate('4','S07','S09'),candidate('1','S01','S05')];
  assert.deepEqual(deliveryCandidatesForDate({candidates},'2026-09-15').map(row=>row.id),['1','2','3','4','5']);
  const counts=deliveryWaveCounts({tasks:[],candidates},'2026-09-15');
  assert.deepEqual(counts,{primary:5,additional:0,late:0});
});

test('daily delivery assignment only includes the selected date and creates idempotent commands',()=>{
  const candidates=[
    {id:'r1',version:2,data:{date:'2026-09-15'}},
    {id:'r2',version:4,data:{date:'2026-09-14'}},
    {id:'r3',version:1,data:{date:'2026-09-15T00:00:00'}},
  ];
  const selected=deliveryCandidatesForDate({candidates},'2026-09-15');
  assert.deepEqual(selected.map(row=>row.id),['r1','r3']);
  let sequence=0;
  const commands=dailyAssignmentCommands(selected,'driver-1','2026-09-15',3,()=>`command-${++sequence}`);
  assert.deepEqual(commands.map(command=>command.payload),[
    {request_id:'r1',request_version:2,driver_id:'driver-1',date:'2026-09-15',position:4,reason:'安排當日送貨',command_id:'command-1'},
    {request_id:'r3',request_version:1,driver_id:'driver-1',date:'2026-09-15',position:5,reason:'安排當日送貨',command_id:'command-2'},
  ]);
  assert.deepEqual(dailyAssignmentCommands(selected,'','2026-09-15'),[]);
});

test('delivery exports retain actual quantities, units, all orders and escaped text',()=>{
  const data={drivers:[{id:'d',name:'王先生'}],tasks:Array.from({length:1001},(_,i)=>({id:String(i),driver_id:'d',driver_name:'王先生',position:i+1,state:'planned',request:{number:i+1,status:'shipped',sender:'S01',receiver:'S02',data:{sender_name:'五甲',receiver_name:'凱旋',lines:[{name:'舊數量',quantity:9,unit:'包'}],shipped:[{name:'排骨<&',quantity:2,unit:'箱'}]}}}))};
  const model=deliveryModel(data,'2026-09-10','d','test');
  assert.equal(model.rows.length,1001); assert.equal(exportLines(model).length,1001);
  assert.equal(exportLines(model)[0][0],'第一趟');
  assert.equal(model.rows[0].lines[0].quantity,2);
  assert.match(excelXml(model),/排骨&lt;&amp;/); assert.doesNotMatch(excelXml(model),/舊數量/);
  model.rows[0].lines[0].stock_pickup=true;
  assert.match(excelXml(model),/庫存取貨/);
  assert.equal(imageSegments(model)[0].lines[0].stock_pickup,true);
  model.rows[0].lines=Array.from({length:100},()=>({name:'雞皮',quantity:1,unit:'支'}));
  assert.equal(imageSegments(model).flatMap(x=>x.lines).length,1100);
});

test('delivery DB authorizes, serializes and audits without updating transfer records',async()=>{
 const db=new PGlite(); let command=500;
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema ops_transfer_private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table public.stores(id uuid primary key,store_code text);
   create table public.profiles(id uuid primary key,full_name text,role text,store_id uuid,is_active boolean);
   insert into stores values('${id(1)}','S01'),('${id(2)}','S02'),('${id(3)}','S03');
   insert into profiles values('${id(1)}','HQ','coo',null,true),('${id(2)}','sender','store_manager','${id(1)}',true),('${id(3)}','receiver','store_manager','${id(2)}',true),('${id(4)}','other','store_manager','${id(3)}',true),('${id(5)}','external','external',null,true);
   create table ops_transfer_private.requests(id uuid primary key,number int,sender text,receiver text,status text,version int,data jsonb,created_at timestamptz default now());
   insert into ops_transfer_private.requests values('${id(100)}',1,'S01','S02','requested',1,'{"lines":[{"name":"排骨","quantity":2,"unit":"包"}]}',now());`);
  const original=await readFile(new URL('../supabase/migrations/20260909124828_transfer_center.sql',import.meta.url),'utf8');
  await db.exec(original.match(/create function ops_transfer_private\.actor\(\)[\s\S]*?end \$\$;/)[0]);
  await db.exec(await readFile(new URL('../supabase/migrations/20260910152944_transfer_delivery_sheets.sql',import.meta.url),'utf8'));
  const user=async n=>db.query("select set_config('test.uid',$1,false)",[id(n)]);
  const call=async(a,p={})=>(await db.query('select public.ops_delivery_api($1,$2) result',[a,JSON.stringify(p)])).rows[0].result;
  const write=(a,p)=>call(a,{command_id:id(command++),...p});
  await user(1);
  const d=await write('driver',{name:'王先生',reason:'新增'});
  const input={request_id:id(100),request_version:1,driver_id:d.id,date:'2026-09-10',position:1,reason:'安排',command_id:id(command++)};
  const t=await call('assign',input);
  assert.deepEqual(await call('assign',input),t);
  await assert.rejects(call('assign',{...input,position:2}),/請求編號/);
  await assert.rejects(write('assign',input.command_id?{...input,command_id:id(command++)}:input),/已有配送/);
  await assert.rejects(write('edit',{id:t.id,version:0,request_version:1,reason:'x'}),/已更新/);
  await user(2); await assert.rejects(write('driver',{name:'bad',reason:'x'}),/僅總部/);
  await assert.rejects(write('pick',{id:t.id,version:1,request_version:1,reason:'取貨'}),/先在原/);
  const before=(await db.query('select * from ops_transfer_private.requests')).rows;
  await user(4); assert.equal((await call('day',{date:'2026-09-10'})).tasks.length,0);
  await assert.rejects(call('history',{id:t.id}),/無權/);
  await user(5); await assert.rejects(call('day',{date:'2026-09-10'}));
  assert.deepEqual((await db.query('select * from ops_transfer_private.requests')).rows,before);
  await db.exec(`update ops_transfer_private.requests set status='shipped',version=2 where id='${id(100)}'`);
  await user(3); await assert.rejects(write('pick',{id:t.id,version:1,request_version:2,reason:'取'}),/僅出貨店/);
  await user(2); await assert.rejects(write('pick',{id:t.id,version:1,request_version:1,reason:'取'}),/調貨單已更新/);
  const picked=await write('pick',{id:t.id,version:1,request_version:2,reason:'取'});
  assert.equal(picked.state,'picked');
  await assert.rejects(write('deliver',{id:t.id,version:2,request_version:2,reason:'送'}),/僅收貨店/);
  await user(1); await assert.rejects(write('cancel',{id:t.id,version:2,reason:'取消'}),/僅未取貨/);
  await user(3); const delivered=await write('deliver',{id:t.id,version:2,request_version:2,reason:'送'});
  assert.equal(delivered.state,'delivered');
  assert.equal((await call('history',{id:t.id})).length,3);
  assert.equal((await db.query('select status from ops_transfer_private.requests')).rows[0].status,'shipped');
  assert.equal((await call('day',{date:'2026-09-10'})).candidates.length,0);
  assert.equal((await db.query("select has_function_privilege('anon','public.ops_delivery_api(text,jsonb)','execute') ok")).rows[0].ok,false);
  await user(1);
  await db.exec(`insert into ops_transfer_private.requests values('${id(101)}',2,'S01','S02','requested',1,'{}',now());`);
  const base={request_id:id(101),request_version:1,driver_id:d.id,date:'2026-09-11',position:1,reason:'安排'};
  const countBefore=(await db.query('select count(*) n from ops_delivery_private.events')).rows[0].n;
  await assert.rejects(write('assign',{...base,position:0}));
  assert.equal((await db.query('select count(*) n from ops_delivery_private.events')).rows[0].n,countBefore);
  const next=await write('assign',base);
  const moved=await write('edit',{...base,id:next.id,version:1,date:'2026-09-12',position:2});
  assert.equal(moved.delivery_date,'2026-09-12');
  await write('cancel',{id:next.id,version:2,reason:'改派'});
  assert.equal((await write('assign',base)).state,'planned');
  assert.equal((await call('history',{id:next.id})).length,3);
 } finally { await db.close(); }
});
