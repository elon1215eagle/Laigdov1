import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('simple repairs: store self repair, three photo categories, verified completion, history, replay and isolation',async()=>{
 const db=new PGlite();let seq=100;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table stores(id uuid primary key,store_code text,name text,is_active boolean);
 create table profiles(id uuid primary key,full_name text,role text,store_id uuid,is_active boolean);
 insert into stores values('${id(1)}','S01','五甲',true),('${id(2)}','S02','凱旋',true);
 insert into profiles values('${id(1)}','總部','coo',null,true),('${id(2)}','店長','store_manager','${id(1)}',true),('${id(3)}','另一店','store_manager','${id(2)}',true);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260911124558_ops_store_repairs.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260911132933_simplify_store_repairs.sql',import.meta.url),'utf8'));
 const user=n=>db.query("select set_config('test.uid',$1,false)",[id(n)]);
 const call=async(action,payload)=>(await db.query('select public.ops_repair_simple_api($1,$2) result',[action,JSON.stringify(payload)])).rows[0].result;
 const write=(action,payload)=>call(action,{...payload,command_id:id(seq++)});
 const form={store:'S01',category:'冰箱',description:'不冷',urgency:'normal',handling_method:'store',completed:true,result:'換馬達',cost:'0',vendor:'師傅'};
 const manifest=['report','completion','receipt'].flatMap((purpose,k)=>Array.from({length:5},(_,i)=>({id:id(500+k*5+i),purpose,name:'photo.png',mime:'image/png',size:10,fingerprint:'a'.repeat(64)})));
 await user(2);
 const command={...form,photo_manifest:manifest,command_id:id(seq++)};
 let row=await call('prepare',command);assert.equal(row.status,'pending');
 assert.deepEqual(await call('prepare',command),row);
 await assert.rejects(write('save',{...form,id:row.id,version:row.version}),/照片尚未完成/);
 assert.equal((await db.query('select count(*) n from ops_repair_private.attachments')).rows[0].n,15);
 for(const photo of manifest){
  const payload={...photo,ticketId:row.id};
  const slot=(await db.query("select public.ops_repair_photo_api('reserve',$1) result",[JSON.stringify(payload)])).rows[0].result;
  assert.equal((await db.query('select public.ops_repair_photo_access($1,true) ok',[slot.path])).rows[0].ok,true);
  await db.exec('set role authenticated');await db.query("insert into storage.objects(bucket_id,name,metadata) values('ops-repair-photos',$1,$2)",[slot.path,JSON.stringify({size:10,mimetype:'image/png'})]);await db.exec('reset role');
  await db.query('select public.ops_repair_verify_photo($1,$2,$3,$4,$5)',[photo.id,id(2),photo.fingerprint,photo.mime,photo.size]);
 }
 row=await write('save',{...form,id:row.id,version:row.version});assert.equal(row.status,'completed');assert.equal(row.cost,0);
 await assert.rejects(write('save',{...form,id:row.id,version:1}),/已更新/);
 await user(3);await assert.rejects(write('save',{...form,id:row.id,version:row.version}),/無權/);
 await user(2);await assert.rejects(write('save',{...form,handling_method:'headquarters',id:row.id,version:row.version}),/原因/);
 row=await write('save',{...form,handling_method:'headquarters',id:row.id,version:row.version,note:'改由總部協助',cost:'1800.50'});
 assert.equal(row.handling_method,'headquarters');assert.equal(row.cost,1800.5);
 row=await write('reopen',{id:row.id,version:row.version,note:'仍不冷'});assert.equal(row.status,'pending');
 const history=await call('detail',{id:row.id});assert.equal(history.events.at(-1).actor_name,'店長');
 await assert.rejects(write('prepare',{...form,store:'S02'}),/跨店/);
 assert.equal((await db.query("select has_function_privilege('anon','public.ops_repair_simple_api(text,jsonb)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
