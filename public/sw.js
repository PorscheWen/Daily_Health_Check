/* global self, caches */
'use strict';

const CACHE = 'daily-health-pwa-v7';

/** 僅快取靜態資源；HTML 不預快取，避免 LINE 內建瀏覽器顯示舊頁 */
const PRECACHE = [
  '/app.js',
  '/local-db.js',
  '/advice-client.js',
  '/health-core-client.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

function isDocumentRequest(request, url) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  if (url.pathname === '/' || url.pathname === '/index.html') return true;
  return url.pathname.endsWith('.html');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isDocumentRequest(request, url)) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        if (res.ok && request.url.startsWith(self.location.origin)) {
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
