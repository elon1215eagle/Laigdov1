import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export async function verifyRepairImage(bytes, file) {
  if (!bytes.length || bytes.length > 10485760 || bytes.length !== file.size) throw new Error('size');
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  if (fingerprint !== file.fingerprint) throw new Error('fingerprint');
  const image = sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning' });
  const meta = await image.metadata();
  const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[meta.format];
  if (!mime || mime !== file.mime || (meta.pages || 1) !== 1) throw new Error('format');
  await image.stats();
  return { fingerprint, mime, size: bytes.length };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: '不支援的操作' });
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return res.status(401).json({ error: '請重新登入' });
  const url = process.env.OPS_PUSH_SUPABASE_URL;
  const key = process.env.OPS_PUSH_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: '照片驗證尚未啟用' });
  const body = req.body;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body || !uuid.test(body.id) || !uuid.test(body.ticketId)) return res.status(400).json({ error: '照片識別不正確' });
  let stage='download';
  try {
    const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) return res.status(401).json({ error: '請重新登入' });
    const user = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: files, error } = await user.rpc('ops_repair_photo_api', { p_action: 'list', p_payload: { ticketId: body.ticketId } });
    const file = !error && Array.isArray(files) && files.find(f => f.id === body.id && f.owner_id === auth.user.id);
    if (!file) return res.status(403).json({ error: '無權驗證照片' });
    if (file.state === 'available') return res.status(200).json(file);
    const { data: blob, error: downloadError } = await user.storage.from('ops-repair-photos').download(file.path);
    if (downloadError || !blob) throw new Error('download');
    stage='image';
    const verified = await verifyRepairImage(Buffer.from(await blob.arrayBuffer()), file);
    stage='register';
    const { data, error: confirmError } = await service.rpc('ops_repair_verify_photo', {
      p_id: file.id, p_actor: auth.user.id, p_fingerprint: verified.fingerprint, p_mime: verified.mime, p_size: verified.size,
    });
    if (confirmError || !data) throw new Error('confirm');
    return res.status(200).json(data);
  } catch {
    const errors={download:'照片尚未讀取完成，請接續保存',image:'照片格式或內容驗證未通過，請保留原照片並聯絡總部',register:'照片已上傳，保存登記尚未確認，請接續保存'};
    return res.status(422).json({ error: errors[stage] });
  }
}
