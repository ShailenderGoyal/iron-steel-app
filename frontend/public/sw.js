// Minimal service worker: makes the site installable as an app and shows a friendly
// "no internet" page instead of the browser's error screen when the phone is offline.
// It deliberately caches nothing else — every page load and API call still goes to the
// network, so stock figures are never stale and a new deploy is picked up immediately.
const CACHE = 'offline-v1';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(OFFLINE_ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
  } else if (new URL(event.request.url).pathname === '/icon-192.png') {
    // The offline page's logo — must load with no network.
    event.respondWith(fetch(event.request).catch(() => caches.match('/icon-192.png')));
  }
});
