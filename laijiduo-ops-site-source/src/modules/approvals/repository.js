import { supabase } from '../../lib/supabase.js';
import { readAllPages } from './readAllPages.js';

const MESSAGES = {
  approval_forbidden: '此帳號無權執行此操作。',
  approval_stale_version: '案件已被更新，請重新整理後再操作。',
  approval_locked: '案件目前狀態不允許這項操作，請重新整理。',
  approval_required_fields: '請填寫事由、收款人及有效金額。',
  approval_invalid_amount: '金額須大於 0。',
  approval_reason_required: '請填寫原因。',
  approval_attachment_limit: '每案最多 10 個附件。',
  approval_no_reviewer: '目前沒有啟用的財務長帳號，暫時無法送出。',
};
function check(result) {
  if (result.error) throw new Error(MESSAGES[result.error.message] || result.error.message);
  return result.data;
}
function client() {
  if (!supabase) throw new Error('未連接正式資料服務，無法使用簽核中心。');
  return supabase;
}
export async function listRequests() {
  const all = [];
  for (let start = 0; ; start += 500) {
    const rows = check(await client().from('ops_approval_requests').select('*').order('created_at', { ascending: false }).order('id').range(start, start + 499));
    all.push(...rows);
    if (rows.length < 500) return all;
  }
}
export async function loadDetail(id) {
  const request = check(await client().from('ops_approval_requests').select('*').eq('id', id).single());
  const events = await readAllPages((start, end) => client().from('ops_approval_events').select('*').eq('request_id', id).order('id').range(start, end));
  const attachments = await readAllPages((start, end) => client().from('ops_approval_attachments').select('*').eq('request_id', id).order('created_at').order('id').range(start, end));
  return { request, events, attachments };
}
export async function command(request, action, content = {}, reason = '', related = null) {
  const result = check(await client().rpc('ops_approval_command', { p_id: request.id, p_action: action, p_version: request.version ?? null, p_content: content, p_reason: reason, p_related: related }));
  window.dispatchEvent(new Event('ops-approval-updated'));
  return result;
}
export async function pendingCount(profile) {
  let query = client().from('ops_approval_requests').select('id', { count: 'exact', head: true }).eq('state', profile.role === 'cfo' ? 'pending' : 'returned');
  if (profile.role !== 'cfo') query = query.eq('owner_id', profile.id);
  const result = await query;
  check(result);
  return result.count;
}
export async function uploadAttachment(request, file) {
  const types = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!types.includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('附件限 PDF、JPG、PNG、WebP，每個不超過 10MB。');
  const id = crypto.randomUUID();
  const path = `${request.id}/${id}`;
  check(await client().storage.from('ops-approval-files').upload(path, file, { contentType: file.type, upsert: false }));
  return command(request, 'attach', { id, path, name: file.name });
}
export async function attachmentUrl(path) {
  return check(await client().storage.from('ops-approval-files').createSignedUrl(path, 60)).signedUrl;
}
