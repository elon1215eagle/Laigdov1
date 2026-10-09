import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validateInbox } from '../src/modules/transfers/inbox.js';

test('inbox rejects unavailable and partial responses instead of displaying zero', () => {
  for (const value of [null, {}, { counts: { requested: 0 }, items: [] }]) assert.throws(() => validateInbox(value));
  const valid = { counts: { requested: 1, shipped: 0, disputed: 0 }, items: [], checked_at: '2026-09-10' };
  assert.equal(validateInbox(valid), valid);
});

test('isolated inbox SQL counts all rows and follows the side still responsible', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema ops_transfer_private;
      create function ops_transfer_private.actor() returns jsonb language sql as
      $$ select current_setting('test.actor')::jsonb $$;
      create table ops_transfer_private.requests (
        id integer primary key, number integer, sender text, receiver text,
        status text, data jsonb default '{}', updated_at timestamptz default now());
      insert into ops_transfer_private.requests(id,number,sender,receiver,status)
      select n,n,'S01','S02','requested' from generate_series(1,105) n;
      insert into ops_transfer_private.requests values
        (201,201,'S02','S01','shipped','{}',now()),
        (202,202,'S01','S02','disputed','{}',now()),
        (203,203,'S01','S02','disputed','{"resolution":"ok","sender_ack":true,"receiver_ack":false}',now()),
        (204,204,'S01','S02','disputed','{"resolution":"ok","sender_ack":false,"receiver_ack":false}',now()),
        (205,205,'S01','S02','completed','{}',now()),
        (206,206,'S01','S02','cancelled','{}',now());`);
    await db.exec(await readFile(new URL('../supabase/drafts/transfer_inbox.sql', import.meta.url), 'utf8'));
    async function inbox(store, is_hq = false) {
      await db.query("select set_config('test.actor',$1,false)", [JSON.stringify({ store, is_hq })]);
      return (await db.query('select public.ops_transfer_inbox() as result')).rows[0].result;
    }
    const sender = await inbox('S01');
    assert.deepEqual(sender.counts, { requested: 105, shipped: 1, disputed: 2 });
    assert.equal(sender.items.length,20);
    assert.deepEqual((await inbox('S02')).counts, { requested: 0, shipped: 0, disputed: 2 });
    assert.deepEqual((await inbox('S03')).counts, { requested: 0, shipped: 0, disputed: 0 });
    assert.deepEqual((await inbox(null,true)).counts, { requested: 105, shipped: 1, disputed: 3 });
    await db.exec("update ops_transfer_private.requests set data=data||'{\"sender_ack\":true}' where id=204");
    assert.equal((await inbox('S01')).counts.disputed,1);
    assert.equal((await db.query('select count(*)::int as n from ops_transfer_private.requests')).rows[0].n,111);
    // Exercise the actual authorization function using isolated profiles, not real accounts.
    await db.exec(`drop function ops_transfer_private.actor();
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.stores(id uuid,store_code text);
      create table public.profiles(id uuid, full_name text, role text,store_id uuid,is_active boolean);
      insert into stores values('00000000-0000-0000-0000-000000000001','S01');
      insert into profiles values
        ('00000000-0000-0000-0000-000000000001','Test','store_manager','00000000-0000-0000-0000-000000000001',true),
        ('00000000-0000-0000-0000-000000000002','Test','store_manager',null,true),
        ('00000000-0000-0000-0000-000000000003','Test','coo',null,false),
        ('00000000-0000-0000-0000-000000000004','Test','external',null,true),
        ('00000000-0000-0000-0000-000000000005','Test','coo',null,true);`);
    const migration = await readFile(new URL('../supabase/migrations/20260909124828_transfer_center.sql',import.meta.url),'utf8');
    const actor = migration.match(/create function ops_transfer_private\.actor\(\)[\s\S]*?end \$\$;/)?.[0];
    assert.ok(actor);
    await db.exec(actor);
    for (const suffix of ['002','003','004','006']) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[`00000000-0000-0000-0000-000000000${suffix}`]);
      await assert.rejects(db.query('select public.ops_transfer_inbox()'));
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",['00000000-0000-0000-0000-000000000001']);
    assert.equal((await db.query('select public.ops_transfer_inbox() as r')).rows[0].r.counts.requested,105);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",['00000000-0000-0000-0000-000000000005']);
    assert.equal((await db.query('select public.ops_transfer_inbox() as r')).rows[0].r.counts.disputed,3);
    assert.equal((await db.query("select has_function_privilege('anon','public.ops_transfer_inbox()','execute') as allowed")).rows[0].allowed,false);
  } finally { await db.close(); }
});
