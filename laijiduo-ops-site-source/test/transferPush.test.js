import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { runInNewContext } from 'node:vm';
import { validEndpoint, deliveryOutcome, deliverBatch } from '../server/transferPush.js';

const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('push sender restricts endpoints, retries transient failures and retains lease identity', async () => {
  assert.equal(validEndpoint('https://fcm.googleapis.com/fcm/send/test'), true);
  for (const u of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.com/a','https://u:p@web.push.apple.com/a','https://web.push.apple.com:444/a']) assert.equal(validEndpoint(u),false);
  assert.equal(deliveryOutcome({statusCode:410}),'expired');
  assert.equal(deliveryOutcome({statusCode:429}),'retry');
  assert.equal(deliveryOutcome({statusCode:403}),'failed');
  const calls=[];
  const result=await deliverBatch({
    rpc:async (action,payload)=> { calls.push([action,payload]); return action==='claim' ? [{id:uuid(1),lease:uuid(2),request_id:uuid(3),number:1,store:'S01',status:'requested',subscription:{endpoint:'https://fcm.googleapis.com/a'}}] : action==='check' ? true : {ok:true}; },
    send:async()=> { throw {statusCode:410}; },
  });
  assert.equal(result.expired,1);
  assert.deepEqual(calls.at(-1),['finish',{id:uuid(1),lease:uuid(2),outcome:'expired'}]);
});

test('push DB preserves orders, isolates devices, handles leases, revocation and changed tasks', async () => {
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth; create schema ops_transfer_private;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.sid',true))$$;
   create table public.stores(id uuid primary key,store_code text);
   create table public.profiles(id uuid primary key,full_name text,role text,store_id uuid,is_active boolean);
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create table auth.users(id uuid primary key,banned_until timestamptz);
   create table ops_transfer_private.requests(id uuid primary key,number bigint,sender text,receiver text,status text,version integer default 1,data jsonb default '{}',updated_at timestamptz default now());
   insert into stores values('${uuid(1)}','S01'),('${uuid(2)}','S02'),('${uuid(3)}','S03');
   insert into profiles values('${uuid(1)}','one','store_manager','${uuid(1)}',true),('${uuid(2)}','two','store_manager','${uuid(2)}',true),('${uuid(3)}','hq','coo',null,true),('${uuid(4)}','external','external',null,true);
   insert into auth.sessions select id,id,null from profiles;
   insert into auth.users select id,null from profiles;
   insert into ops_transfer_private.requests values('${uuid(100)}',100,'S01','S02','requested',1,'{}',now()-interval '1 day');`);
  const original=await readFile(new URL('../supabase/migrations/20260909124828_transfer_center.sql',import.meta.url),'utf8');
  await db.exec(original.match(/create function ops_transfer_private\.actor\(\)[\s\S]*?end \$\$;/)[0]);
  await db.exec(await readFile(new URL('../supabase/migrations/20260910064414_transfer_web_push.sql',import.meta.url),'utf8'));
  async function user(n){await db.query("select set_config('test.uid',$1,false),set_config('test.sid',$1,false)",[uuid(n)]);}
  async function devices(action,payload={}){return (await db.query('select public.ops_push_devices($1,$2) r',[action,JSON.stringify(payload)])).rows[0].r;}
  async function work(action,payload={}){return (await db.query('select public.ops_push_work($1,$2) r',[action,JSON.stringify(payload)])).rows[0].r;}
  const payload=n=>({label:'phone',store:'S11',subscription:{endpoint:`https://fcm.googleapis.com/test${n}`,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}});
  await user(1);
  const one=await devices('register',payload(1));
  assert.equal(one.store,'S01');
  assert.equal((await devices('register',payload(1))).id,one.id);
  assert.deepEqual(await work('claim'),[]); // Historical order is not replayed.
  await assert.rejects(devices('register',{...payload(8),subscription:{endpoint:'https://localhost/a'}}));
  await user(2);
  await assert.rejects(devices('register',payload(1)));
  const two=await devices('register',payload(2));
  assert.equal((await devices('list')).length,1);
  await assert.rejects(devices('revoke',{id:one.id,reason:'cross store'}));
  await user(4); await assert.rejects(devices('list'));
  await user(1);
  await db.exec(`insert into ops_transfer_private.requests values('${uuid(101)}',101,'S01','S02','requested',1,'{}',now());`);
  let jobs=await work('claim');
  assert.equal(jobs.length,1); assert.equal(jobs[0].store,'S01');
  assert.deepEqual(await work('claim'),[]); // Lease blocks another worker.
  assert.equal(await work('check',jobs[0]),true);
  assert.deepEqual(await work('finish',{...jobs[0],lease:uuid(999),outcome:'sent'}),{ok:false});
  await work('finish',{...jobs[0],outcome:'retry'});
  await db.exec("update ops_push_private.jobs set next_at=now()-interval '1 minute'");
  const retry=(await work('claim'))[0]; assert.equal(retry.id,jobs[0].id); assert.notEqual(retry.lease,jobs[0].lease);
  await work('finish',{...retry,outcome:'sent'}); assert.deepEqual(await work('claim'),[]);
  await db.exec(`update ops_transfer_private.requests set status='shipped',version=2,updated_at=now() where id='${uuid(101)}'`);
  jobs=await work('claim'); assert.equal(jobs.length,1); assert.equal(jobs[0].store,'S02');
  await db.exec(`update auth.users set banned_until=now()+interval '1 day' where id='${uuid(2)}'`);
  assert.equal(await work('check',jobs[0]),false);
  await db.exec(`update auth.users set banned_until=null where id='${uuid(2)}'`);
  assert.equal(await work('check',jobs[0]),true);
  await user(3); assert.equal((await devices('list')).length,2);
  await devices('revoke',{id:two.id,reason:'device lost'});
  assert.equal(await work('check',jobs[0]),false);
  assert.deepEqual(await work('claim'),[]);
  await user(2); await devices('register',payload(2));
  await db.exec(`update ops_transfer_private.requests set status='disputed',version=3,updated_at=now() where id='${uuid(101)}'`);
  jobs=await work('claim'); assert.equal(jobs.length,1); assert.equal(jobs[0].store,'S01');
  await db.exec(`delete from auth.sessions where id='${uuid(1)}'`);
  assert.equal(await work('check',jobs[0]),false); assert.deepEqual(await work('claim'),[]);
  await user(1); await assert.rejects(devices('register',payload(1)));
  await db.exec(`update ops_transfer_private.requests set data='{"resolution":"ok","sender_ack":true,"receiver_ack":false}',version=4,updated_at=now() where id='${uuid(101)}'`);
  jobs=await work('claim'); assert.equal(jobs.length,1); assert.equal(jobs[0].store,'S02');
  await work('finish',{...jobs[0],outcome:'expired'});
  await user(2); assert.equal((await devices('list'))[0].active,false);
  assert.equal((await db.query('select count(*)::int n from ops_transfer_private.requests')).rows[0].n,2);
  assert.equal((await db.query("select has_function_privilege('anon','public.ops_push_devices(text,jsonb)','execute') a")).rows[0].a,false);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.ops_push_work(text,jsonb)','execute') a")).rows[0].a,false);
 } finally {await db.close();}
});

test('service worker uses visible generic fallback, same-origin links and never caches app data', async () => {
  const handlers = {}; const shown = []; const opened = [];
  runInNewContext(await readFile(new URL('../public/ops-push-sw.js',import.meta.url),'utf8'), {
    URL, self:{ location:{origin:'https://laigdov1.vercel.app'},
      addEventListener:(type,fn)=>{handlers[type]=fn;},
      registration:{showNotification:async(...args)=>shown.push(args)},
      clients:{openWindow:async url=>opened.push(url)},
    },
  });
  assert.equal(handlers.fetch,undefined);
  let done;
  handlers.push({data:{json:()=>({title:'調貨待出貨',requestId:uuid(20)})},waitUntil:p=>{done=p;}});
  await done; assert.equal(shown[0][1].tag,`transfer-${uuid(20)}`);
  handlers.notificationclick({notification:{close(){},data:shown[0][1].data},waitUntil:p=>{done=p;}});
  await done; assert.equal(opened[0],`https://laigdov1.vercel.app/?transfer=${uuid(20)}`);
  handlers.notificationclick({notification:{close(){},data:{url:'https://evil.example/'}},waitUntil:p=>{done=p;}});
  assert.equal(opened.length,1);
  handlers.push({data:{json(){throw new Error('bad');}},waitUntil:p=>{done=p;}});
  await done; assert.equal(shown[1][0],'調貨通知');
});
