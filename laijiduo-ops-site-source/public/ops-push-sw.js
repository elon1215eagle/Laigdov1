// Push only: deliberately no fetch handler or cached application/auth responses.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Show a generic visible notification. */ }
  const id = /^[0-9a-f-]{36}$/i.test(data.requestId || '') ? data.requestId : '';
  event.waitUntil(self.registration.showNotification(String(data.title || '調貨通知').slice(0,60), {
    body: String(data.body || '請登入調貨中心查看待辦').slice(0,100),
    tag: id ? `transfer-${id}` : 'transfer-notice',
    data: { url: id ? `/?transfer=${encodeURIComponent(id)}` : '/?transfer=inbox' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/?transfer=inbox', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(target.href));
});
