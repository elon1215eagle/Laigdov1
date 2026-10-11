import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { componentDatabase, actor, owner, managerId, otherManagerId, hqId } from './helpers/maintenanceComponentDatabase.js';

test('candidate approval consumption preserves unrelated stores and valid groups', async t => {
  const db = await componentDatabase('schedule');
  t.after(() => db.close());
  await t.test('baseline function bodies match the read-only production snapshot', async () => {
    const bodies = (await db.query(`select proname,md5(prosrc) as hash from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
      and proname in ('consume_schedule_change_approval','store_owns_schedule_request_scope') order by proname`)).rows;
    assert.deepEqual(bodies,[
      {proname:'consume_schedule_change_approval',hash:'f6c9a497e33975e911b5ed70b049b309'},
      {proname:'store_owns_schedule_request_scope',hash:'e38c23ff5ab80103cc4252d93c3e480f'},
    ]);
  });
  const before = (await db.query(`select oid,proacl::text as acl,prosecdef,proconfig from pg_proc
    where oid='private.consume_schedule_change_approval()'::regprocedure`)).rows[0];
  const patch = await readFile(new URL('../supabase/drafts/schedule-approval-consumption-scope.sql',import.meta.url),'utf8');
  await db.exec(patch);
  await t.test('patch preserves function identity, grants and trigger bindings', async () => {
    assert.deepEqual((await db.query(`select oid,proacl::text as acl,prosecdef,proconfig from pg_proc
      where oid='private.consume_schedule_change_approval()'::regprocedure`)).rows[0],before);
    assert.equal((await db.query(`select count(*)::int as n from pg_trigger
      where tgfoid='private.consume_schedule_change_approval()'::regprocedure and not tgisinternal`)).rows[0].n,2);
    await db.exec(patch);
  });
  const shift = date => ({shift_date:date,staff_id:'staff-one',employee_name:'Synthetic one',
    home_store_code:'T01',assigned_store_code:'T01',start_time:'10:00',end_time:'18:00'});
  const save = data => db.query('select * from upsert_daily_staff_shift_new($1::jsonb)',[JSON.stringify(data)]);
  const approve = async (store,date,requestedBy=managerId) => {
    await owner(db);
    return (await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,scope_type,target_date,approved_until)
      values ('2026-10',$1,$2,'approved','date',$3,now()+interval '1 hour') returning id`,[store,requestedBy,date])).rows[0].id;
  };
  const state = async id => {
    await owner(db);
    return (await db.query('select status,used_at is not null as consumed from monthly_schedule_change_requests where id=$1',[id])).rows[0];
  };
  await db.query("insert into monthly_schedule_locks values ('2026-10',true)");
  await t.test('using one store approval leaves same-date other-store approval intact', async () => {
    const own = await approve('T01','2026-10-10');
    const other = await approve('T02','2026-10-10',otherManagerId);
    await actor(db);
    await save(shift('2026-10-10'));
    assert.deepEqual(await state(own),{status:'closed',consumed:true});
    assert.deepEqual(await state(other),{status:'approved',consumed:false});
    await actor(db);
    await assert.rejects(save(shift('2026-10-10')), /row-level security/);
  });
  await t.test('valid coordinating-store group approval still allows one operation', async () => {
    await owner(db);
    await db.exec(`insert into stores(store_code,name) values ('T03','Synthetic managed store');
      insert into store_relation_groups values ('11111111-1111-4111-8111-111111111111','T01-T03','T01',true,true);
      insert into store_relation_group_members values ('11111111-1111-4111-8111-111111111111','T03');
      insert into store_management_relations values ('T01','T03','schedule_management',true,current_date-1,null);`);
    const group = await approve('T01-T03','2026-10-11');
    await actor(db);
    await save({...shift('2026-10-11'),home_store_code:'T01-T03'});
    assert.deepEqual(await state(group),{status:'closed',consumed:true});
  });
  await t.test('expired group relationship does not unlock or consume its approval', async () => {
    const group = await approve('T01-T03','2026-10-12');
    await db.query("update store_management_relations set effective_to=current_date-1");
    await actor(db);
    await assert.rejects(save({...shift('2026-10-12'),home_store_code:'T01-T03'}), /row-level security/);
    assert.deepEqual(await state(group),{status:'approved',consumed:false});
  });
  await t.test('monthly staff approval consumes only authorized store requests', async () => {
    await owner(db);
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,target_staff_id,approved_until)
      values ('2026-10','T01',$1,'approved','staff-one',now()+interval '1 hour'),
             ('2026-10','T02',$2,'approved','staff-one',now()+interval '1 hour')`,[managerId,otherManagerId]);
    await actor(db);
    await db.query('select * from upsert_monthly_leave_plans_new($1::jsonb)',[JSON.stringify([{
      period_month:'2026-10',store_code:'T01',staff_id:'staff-one',leave_days:[1],day_statuses:{'1':'leave'},
    }])]);
    await owner(db);
    assert.deepEqual((await db.query("select store_code,status from monthly_schedule_change_requests where scope_type='staff' order by store_code")).rows,
      [{store_code:'T01',status:'closed'},{store_code:'T02',status:'approved'}]);
  });
  let existingShiftId;
  await t.test('shift-scoped update consumes only the authorized matching approval', async () => {
    await owner(db);
    const id = (await db.query("select id from daily_staff_shifts where shift_date='2026-10-10'")).rows[0].id;
    existingShiftId = id;
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,scope_type,target_shift_id,approved_until)
      values ('2026-10','T01',$1,'approved','shift',$3,now()+interval '1 hour'),
             ('2026-10','T02',$2,'approved','shift',$3,now()+interval '1 hour')`,[managerId,otherManagerId,id]);
    await actor(db);
    await save({...shift('2026-10-10'),id,end_time:'19:00'});
    await owner(db);
    assert.deepEqual((await db.query("select store_code,status from monthly_schedule_change_requests where scope_type='shift' order by store_code")).rows,
      [{store_code:'T01',status:'closed'},{store_code:'T02',status:'approved'}]);
  });
  await t.test('characterization: shift deletion with active references still fails and rolls back', async () => {
    await owner(db);
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,scope_type,target_shift_id,approved_until)
      values ('2026-10','T01',$1,'approved','shift',$2,now()+interval '1 hour')`,[managerId,existingShiftId]);
    await actor(db);
    await assert.rejects(db.query('select delete_daily_staff_shift_new($1)',[existingShiftId]),
      error => error.code === '23514' && error.constraint === 'monthly_schedule_change_requests_scope_check');
    await owner(db);
    assert.equal((await db.query('select count(*)::int as n from daily_staff_shifts where id=$1',[existingShiftId])).rows[0].n,1);
  });
  await t.test('HQ writes do not consume store approvals', async () => {
    const approval = await approve('T01','2026-10-14');
    await actor(db,hqId);
    await save(shift('2026-10-14'));
    assert.deepEqual(await state(approval),{status:'approved',consumed:false});
  });
  await t.test('guard rejects unexpected function drift without overwriting it', async () => {
    await owner(db);
    await db.exec(`create or replace function private.consume_schedule_change_approval()
      returns trigger language plpgsql as $$begin return null; end;$$;`);
    await assert.rejects(db.exec(patch), /source drift/);
    await db.exec('rollback');
    assert.notEqual((await db.query(`select md5(prosrc) as hash from pg_proc
      where oid='private.consume_schedule_change_approval()'::regprocedure`)).rows[0].hash,'92f1ba305489d5f4f14cbeafd5c50f3a');
    // Restore the tested candidate explicitly after proving the guard failed closed.
    await db.exec(patch.slice(patch.indexOf('create or replace function'),patch.lastIndexOf('commit;')));
  });
  await t.test('guarded rollback restores the exact observed function and can reapply', async () => {
    const rollback = await readFile(new URL('../supabase/drafts/schedule-approval-consumption-scope-rollback.sql',import.meta.url),'utf8');
    await db.exec(rollback);
    assert.equal((await db.query(`select md5(prosrc) as hash from pg_proc
      where oid='private.consume_schedule_change_approval()'::regprocedure`)).rows[0].hash,'f6c9a497e33975e911b5ed70b049b309');
    await db.exec(patch);
    assert.deepEqual((await db.query(`select oid,proacl::text as acl,prosecdef,proconfig from pg_proc
      where oid='private.consume_schedule_change_approval()'::regprocedure`)).rows[0],before);
  });
});
