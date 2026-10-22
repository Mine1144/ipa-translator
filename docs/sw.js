/* Service worker — ให้แอปเปิดได้แบบออฟไลน์และติดตั้งลงหน้าจอ Home Screen ได้ */
const CACHE = 'thai-file-translator-v1';
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './ai.js',
  './parsers.js',
  './manifest.webmanifest',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // ไม่ cache คำขอข้างเว็บไซต์ (เช่น API)

  // network-first สำหรับ index.html (ให้ได้เวอร์ชันล่าสุด) และ cache-first สำหรับไฟล์อื่น
  if (req.mode === 'navigate' || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
