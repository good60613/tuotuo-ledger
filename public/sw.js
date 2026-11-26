// 3.5 網頁版離線快取：有網路就拿最新的（順便存一份），沒網路就用存著的那份。
// 只處理同一個網站的檔案；Google 登入、雲端備份的連線不經過這裡。
const CACHE = 'tuotuo-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : undefined)).then((r) => r || Response.error())),
  );
});
