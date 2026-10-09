import test from 'node:test';
import assert from 'node:assert/strict';
import { componentDatabase, actor, owner, hqId, managerId, otherManagerId } from './helpers/maintenanceComponentDatabase.js';

test('isolated schedule lock and writer contracts', async t => {
  const db = await componentDatabase('schedule');
  t.after(() => db.close());
  const row = {period_month: '2026-10',store_code: 'T01',store_name: 'Test one',staff_id: 'staff-one',
    employee_name: 'Synthetic one',role_name: 'Test',leave_days: [1],manual_leave_days: [1],auto_leave_days: [],day_statuses: {'1': 'leave'}};
  const upsert = data => db.query('select * from public.upsert_monthly_leave_plans_new($1::jsonb)', [JSON.stringify([data])]);
  await actor(db,hqId);
  await db.query("select public.set_workforce_rollout_mode('new','2026-10','Isolated test')");
  await actor(db);
  await t.test('new writer saves own store day statuses', async () => {
    const saved = (await upsert(row)).rows[0];
    assert.deepEqual(saved.leave_days,[1]);
    assert.deepEqual(saved.day_statuses,{'1':'leave'});
  });
  await t.test('cross-store and anonymous RPC writes denied', async () => {
    await assert.rejects(upsert({...row,store_code:'T02',staff_id:'staff-two'}), /row-level security/);
    await actor(db,'','anon');
    await assert.rejects(upsert(row), /permission denied/);
    await actor(db);
  });
  await t.test('store cannot switch rollout or lock the month', async () => {
    await assert.rejects(db.query("select set_workforce_rollout_mode('parallel',null,'Test')"));
    await assert.rejects(db.query("insert into monthly_schedule_locks values ('2026-10',true)"), /row-level security/);
  });
  await t.test('legacy direct write rejected after cutover', async () => {
    await assert.rejects(db.query("update monthly_leave_plans set note='legacy'"), /僅允許/);
  });
  await t.test('HQ lock denies store update and preserves leave days', async () => {
    await actor(db,hqId);
    await db.query("insert into monthly_schedule_locks values ('2026-10',true)");
    await actor(db);
    await assert.rejects(upsert({...row,leave_days:[2]}), /row-level security/);
    await owner(db);
    assert.deepEqual((await db.query('select leave_days from monthly_leave_plans')).rows[0].leave_days,[1]);
  });
  await t.test('expired scoped approval does not unlock', async () => {
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,target_staff_id,approved_until)
      values ('2026-10','T01',$1,'approved','staff-one',now()-interval '1 minute')`,[managerId]);
    await actor(db);
    await assert.rejects(upsert({...row,leave_days:[2]}), /row-level security/);
    await owner(db);
  });
  await t.test('live approval is staff-scoped, consumed once and cannot be replayed', async () => {
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,target_staff_id,approved_until)
      values ('2026-10','T01',$1,'approved','staff-one',now()+interval '1 hour')`,[managerId]);
    await actor(db);
    await assert.rejects(upsert({...row,staff_id:'staff-two'}), /row-level security/);
    await upsert({...row,leave_days:[2]});
    await assert.rejects(upsert({...row,leave_days:[3]}), /row-level security/);
    await owner(db);
    const approvals = (await db.query("select status,used_at is not null as consumed from monthly_schedule_change_requests where approved_until>now()")).rows;
    assert.deepEqual(approvals,[{status:'closed',consumed:true}]);
  });
  await t.test('HQ reconfirm closes outstanding approvals', async () => {
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,target_staff_id,approved_until)
      values ('2026-10','T01',$1,'approved','staff-two',now()+interval '1 hour')`,[managerId]);
    await actor(db,hqId);
    await db.query("update monthly_schedule_locks set is_confirmed=true where period_month='2026-10'");
    await owner(db);
    assert.equal((await db.query("select count(*)::int as n from monthly_schedule_change_requests where status='approved'")).rows[0].n,0);
  });
  const shift = {shift_date:'2026-10-10',staff_id:'staff-one',employee_name:'Synthetic one',
    home_store_code:'T01',assigned_store_code:'T01',start_time:'10:00',end_time:'18:00'};
  const saveShift = data => db.query('select * from public.upsert_daily_staff_shift_new($1::jsonb)',[JSON.stringify(data)]);
  await t.test('locked daily shifts and cross-store shifts denied', async () => {
    await actor(db);
    await assert.rejects(saveShift(shift), /row-level security/);
    await assert.rejects(saveShift({...shift,home_store_code:'T02'}), /row-level security/);
  });
  await t.test('characterization: same-date approvals in other stores are also consumed', async () => {
    await owner(db);
    await db.query(`insert into monthly_schedule_change_requests
      (period_month,store_code,requested_by,status,scope_type,target_date,approved_until)
      values ('2026-10','T01',$1,'approved','date','2026-10-10',now()+interval '1 hour'),
             ('2026-10','T02',$2,'approved','date','2026-10-10',now()+interval '1 hour')`,[managerId,otherManagerId]);
    await actor(db);
    const saved = (await saveShift(shift)).rows[0];
    assert.equal(saved.home_store_code,'T01');
    await owner(db);
    // This records an existing defect; it does not certify the behavior as safe.
    assert.deepEqual((await db.query("select store_code,status,used_at is not null as consumed from monthly_schedule_change_requests where scope_type='date' order by store_code")).rows,
      [{store_code:'T01',status:'closed',consumed:true},{store_code:'T02',status:'closed',consumed:true}]);
  });
  await t.test('inactive manager cannot write even an unlocked month', async () => {
    await owner(db);
    await db.query('update profiles set is_active=false where id=$1',[managerId]);
    await actor(db);
    await assert.rejects(upsert({...row,period_month:'2026-11'}), /row-level security/);
  });
});
