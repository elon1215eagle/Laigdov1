import { supabase } from '../../lib/supabase.js';
const KEY = 'ops.transfer-push.device.v1';
const worker = () => navigator.serviceWorker.getRegistration('/ops-push-sw.js');
export function pushSupport() {
  if (!globalThis.isSecureContext) return '請使用 HTTPS 網址開啟';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone) return '請先加入主畫面，再從主畫面開啟 APP';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return '此瀏覽器不支援手機推播';
  if (Notification.permission === 'denied') return '通知已被封鎖，請至手機或瀏覽器設定允許通知';
  return '';
}
export function rememberedDevice() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
async function rpc(action, payload = {}) {
  if (!supabase) throw new Error('尚未連接正式資料庫');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const { data, error } = await supabase.rpc('ops_push_devices', { p_action: action, p_payload: payload }).abortSignal(controller.signal);
    if (error) throw new Error(controller.signal.aborted ? '通知設定結果待確認，請重試' : error.message);
    return data;
  } finally { clearTimeout(timeout); }
}
export const pushClient = {
  async config() {
    const response = await fetch('/api/transfer-push-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('通知服務尚未就緒');
    const data = await response.json();
    if (!data.ready || !data.publicKey) throw new Error('通知服務尚未設定完成');
    return data;
  },
  async enable({ publicKey, userId, store, label }) {
    const unsupported = pushSupport();
    if (unsupported) throw new Error(unsupported);
    // Permission must originate from the explicit enable button on iOS.
    if (await Notification.requestPermission() !== 'granted') throw new Error('尚未允許通知');
    const registration = await navigator.serviceWorker.register('/ops-push-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    const old = rememberedDevice();
    if (sub && old?.userId !== userId) { await sub.unsubscribe(); sub = null; }
    const key = Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    sub ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    // Remember only ownership before the RPC so ambiguous first registration can
    // retry the same subscription without silently replacing its endpoint.
    localStorage.setItem(KEY, JSON.stringify({ id: old?.userId === userId ? old.id : null, store, userId }));
    // Keep the same browser subscription after ambiguous failures for safe retry.
    const result = await rpc('register', { store, label, subscription: sub.toJSON() });
    if (!result?.id || !result.active) throw new Error('通知綁定結果待確認，請重試');
    localStorage.setItem(KEY, JSON.stringify({ id: result.id, store: result.store, userId }));
    return result;
  },
  async status(userId) {
    const d = rememberedDevice();
    if (!d?.id || d.userId !== userId || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return null;
    const sub = await (await worker())?.pushManager.getSubscription();
    if (!sub) return null;
    const state = await rpc('touch', { id: d.id });
    return state?.active ? { ...d, store: state.store } : null;
  },
  async list() {
    const all = [];
    for (let offset = 0; ; offset += 100) {
      const rows = await rpc('list', { offset });
      if (!Array.isArray(rows)) throw new Error('裝置清單不完整，請重新整理');
      all.push(...rows);
      if (rows.length < 100) return all;
    }
  },
  async revoke(id, reason) {
    await rpc('revoke', { id, reason });
    if (rememberedDevice()?.id === id) {
      const sub = await (await worker())?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      localStorage.removeItem(KEY);
    }
  },
};
export async function stopPushBeforeLogout() {
  const d = rememberedDevice();
  try { if (d?.id) await rpc('revoke', { id: d.id, reason: '登出裝置' }); }
  finally {
    if ('serviceWorker' in navigator) {
      const registration = await worker();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      for (const notification of await registration?.getNotifications() || []) notification.close();
    }
    localStorage.removeItem(KEY);
  }
}
