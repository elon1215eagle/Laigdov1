import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { deliverBatch } from '../server/transferPush.js';

export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`);
  const actual = Buffer.from(req.headers.authorization || '');
  if (!process.env.CRON_SECRET || actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)) return res.status(401).end();
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.OPS_PUSH_PUBLIC_KEY || !process.env.OPS_PUSH_PRIVATE_KEY ||
    !process.env.OPS_PUSH_SUPABASE_URL || !process.env.OPS_PUSH_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'push_not_configured' });
  }
  try {
    const client = createClient(process.env.OPS_PUSH_SUPABASE_URL, process.env.OPS_PUSH_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    webpush.setVapidDetails('https://laigdov1.vercel.app', process.env.OPS_PUSH_PUBLIC_KEY, process.env.OPS_PUSH_PRIVATE_KEY);
    const counts = await deliverBatch({
      rpc: async (action, payload = {}) => {
        const { data, error } = await client.rpc('ops_push_work', { p_action: action, p_payload: payload });
        if (error) throw new Error('push_storage_unavailable');
        return data;
      },
      send: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 300, timeout: 1500, urgency: 'normal' }),
    });
    return res.status(200).json(counts);
  } catch {
    return res.status(503).json({ error: 'push_dispatch_incomplete' });
  }
}
