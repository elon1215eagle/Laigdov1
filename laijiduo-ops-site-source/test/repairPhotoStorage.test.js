import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepairPhotoStorage, newPhotoJob } from '../src/modules/repairs/photoStorage.js';
test('photo jobs fingerprint bytes and have unique upload identities', async () => {
  const blob=new Blob(['hello'],{type:'image/jpeg'});
  const a=await newPhotoJob('ticket',blob), b=await newPhotoJob('ticket',blob);
  assert.equal(a.fingerprint,b.fingerprint); assert.notEqual(a.id,b.id);
  assert.match(a.fingerprint,/^[a-f0-9]{64}$/);
});
test('adapter is private, never overwrites and requires authenticated downloads', async () => {
  const file={type:'image/jpeg'}; let options;
  const adapter=createRepairPhotoStorage({storage:{from:name=>{
    assert.equal(name,'ops-repair-photos');
    return {upload:async(path,body,opts)=>{assert.equal(path,'t/p');assert.equal(body,file);options=opts;return {};},download:async()=>({data:'blob'})};
  }}});
  await adapter.upload({path:'t/p'},file);
  assert.equal(options.upsert,false);assert.equal(await adapter.read('t/p'),'blob');
});
test('missing API refuses attachment operations', async () => {
  await assert.rejects(createRepairPhotoStorage(null).reserve({}));
  await assert.rejects(createRepairPhotoStorage({rpc:async()=>({error:{code:'PGRST202'}})}).reserve({}),/尚未啟用/);
});
