const HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
export function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && HOSTS.has(u.hostname) && !u.port && !u.username && !u.password && !u.hash;
  } catch { return false; }
}
export function pushPayload(job) {
  const names = { requested: '待出貨', shipped: '待收貨', disputed: '差異待處理' };
  if (!names[job.status] || !/^[0-9a-f-]{36}$/i.test(job.request_id)) throw new Error('Invalid notification');
  return JSON.stringify({ title: `調貨${names[job.status]}`, body: `${job.store} · 調貨單 ${job.number}`,
    tag: `transfer-${job.request_id}`, requestId: job.request_id });
}
export function deliveryOutcome(error) {
  const status = Number(error.statusCode);
  if (status === 404 || status === 410) return 'expired';
  if (status === 429 || status >= 500 || !status) return 'retry';
  return 'failed';
}
export async function deliverBatch({ rpc, send }) {
  const jobs = await rpc('claim');
  if (!Array.isArray(jobs)) throw new Error('Invalid job response');
  const counts = { sent: 0, retry: 0, expired: 0, failed: 0, skipped: 0 };
  for (const job of jobs) {
    const key = { id: job.id, lease: job.lease };
    let outcome = 'skipped';
    if (await rpc('check', key) === true) {
      if (!validEndpoint(job.subscription?.endpoint)) outcome = 'failed';
      else {
        try { await send(job.subscription, pushPayload(job)); outcome = 'sent'; }
        catch (error) { outcome = deliveryOutcome(error); }
      }
    }
    // A lost acknowledgment leaves the lease recoverable; never create a new job.
    await rpc('finish', { ...key, outcome });
    counts[outcome]++;
  }
  return counts;
}
