import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import handler, { verifyRepairImage } from '../api/repair-photo-confirm.js';

test('repair verifier decodes actual image bytes and checks immutable metadata', async () => {
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const file = { size:bytes.length, mime:'image/png', fingerprint:createHash('sha256').update(bytes).digest('hex') };
  assert.equal((await verifyRepairImage(bytes,file)).mime,'image/png');
  await assert.rejects(verifyRepairImage(bytes,{...file,size:1}));
  await assert.rejects(verifyRepairImage(bytes,{...file,mime:'image/jpeg'}));
  await assert.rejects(verifyRepairImage(bytes,{...file,fingerprint:'a'.repeat(64)}));
  const bad=Buffer.from('<script>not an image</script>');
  await assert.rejects(verifyRepairImage(bad,{size:bad.length,mime:'image/png',fingerprint:createHash('sha256').update(bad).digest('hex')}));
});
test('repair confirmation endpoint rejects anonymous callers before using server credentials', async () => {
  let status;
  const response={ setHeader(){},status(value){status=value;return this;},json(value){return value;} };
  await handler({method:'POST',headers:{},body:{}},response);
  assert.equal(status,401);
});
