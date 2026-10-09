const bucket = 'ops-repair-photos';
export function createRepairPhotoStorage(client) {
  async function call(action, payload) {
    if (!client) throw new Error('照片儲存尚未連線');
    const { data, error } = await client.rpc('ops_repair_photo_api', { p_action: action, p_payload: payload });
    if (error) throw new Error(error.code === 'PGRST202' ? '照片儲存尚未啟用' : error.code === 'P0001' ? error.message : '照片登記結果待確認，請重試原照片');
    return data;
  }
  return {
    reserve: job => call('reserve', job),
    async confirm(job) {
      const { data } = await client.auth.getSession();
      if (!data?.session?.access_token) throw new Error('請重新登入後重試照片');
      const response = await fetch('/api/repair-photo-confirm', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ id: job.id, ticketId: job.ticketId }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '照片結果待確認');
      return result;
    },
    list: ticketId => call('list', { ticketId }),
    async upload(slot, file) {
      if (!client) throw new Error('照片儲存尚未連線');
      const { error } = await client.storage.from(bucket).upload(slot.path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error('上傳結果待確認，請重試原照片');
    },
    async read(path) {
      if (!client) throw new Error('照片儲存尚未連線');
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) throw new Error('照片讀取失敗或沒有權限');
      return data;
    },
  };
}

export async function newPhotoJob(ticketId, file) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { id: crypto.randomUUID(), ticketId, fingerprint: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('') };
}
