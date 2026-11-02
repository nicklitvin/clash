// Caches the game so it opens offline once it has been loaded.
// Bump VERSION whenever a file changes so players get the update.
const VERSION = 'clash-v0.4.0';
const FILES = [
  './', 'index.html', 'style.css', 'game.js', 'manifest.webmanifest',
  'fonts/pixelify-sans.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so updates show up right away; fall back to the cache offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
