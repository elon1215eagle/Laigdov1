export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const publicKey = process.env.OPS_PUSH_PUBLIC_KEY;
  const ready = Boolean(publicKey && process.env.OPS_PUSH_PRIVATE_KEY && process.env.CRON_SECRET
    && process.env.OPS_PUSH_SUPABASE_URL && process.env.OPS_PUSH_SERVICE_ROLE_KEY);
  return res.status(200).json({ ready, publicKey: ready ? publicKey : null });
}
