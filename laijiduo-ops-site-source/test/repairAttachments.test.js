import test from 'node:test';
import assert from 'node:assert/strict';
import { photoError, saveRepairPhoto } from '../src/modules/repairs/attachments.js';
const file = { name: 'photo.jpg', type: 'image/jpeg', size: 100 };
const job = { id: 'upload-1', ticketId: 'ticket-1', fingerprint: 'sha256-test' };
test('photo validation enforces type, count and size', () => {
  assert.equal(photoError([file]), '');
  for (const files of [Array(6).fill(file), [{...file,type:'text/html'}], [{...file,size:0}], [{...file,size:11*1024*1024}]]) assert.notEqual(photoError(files),'');
});
test('confirmed upload replay does not upload again', async () => {
  let uploaded=0;
  const result=await saveRepairPhoto({ reserve:async()=>({...job,state:'available'}), upload:async()=>uploaded++ },job,file);
  assert.equal(result.state,'available'); assert.equal(uploaded,0);
});
test('lost confirmation retains identity and retries without deleting or reuploading', async () => {
  let state='reserved', uploaded=0, attempts=0;
  const adapter={ reserve:async()=>({...job,state}), upload:async()=>{uploaded++;state='uploaded';}, confirm:async()=>{if(++attempts===1)throw new Error('network');state='available';return {...job,state};} };
  await assert.rejects(saveRepairPhoto(adapter,job,file),/network/);
  assert.equal((await saveRepairPhoto(adapter,job,file)).state,'available');
  assert.equal(uploaded,1);
});
test('mismatched identity or unconfirmed state is not success', async () => {
  await assert.rejects(saveRepairPhoto({reserve:async()=>({...job,id:'wrong',state:'available'})},job,file));
  await assert.rejects(saveRepairPhoto({reserve:async()=>({...job,state:'uploaded'}),confirm:async()=>({...job,state:'uploaded'})},job,file));
});
