import { useEffect, useState } from 'react';
import { pendingCount } from './repository.js';
import { permissions } from './domain.js';

export default function ApprovalNavLabel({ profile }) {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!permissions(profile).allowed) return;
    let mounted = true;
    const refresh = async () => {
      try { const next = await pendingCount(profile); if (mounted) setCount(next); }
      catch { if (mounted) setCount(null); }
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('ops-approval-updated', refresh);
    return () => { mounted = false; clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('ops-approval-updated', refresh); };
  }, [profile?.id, profile?.role, profile?.is_active]);
  return <>簽核中心{count > 0 ? `（${count} ${profile.role === 'cfo' ? '待審' : '待補正'}）` : ''}</>;
}
