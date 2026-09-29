/**
 * RIT Drive — Service Worker (PWA Ready)
 * Suporte a cache offline leve para recursos essenciais
 */

const CACHE_NAME = 'rit-drive-v1.0.0';
const ASSETS_TO_CACHE = [
  '/rit-drive',
  '/styles/rit-drive.css',
  '/js/rit-drive-app.js',
  '/manifest.json',
  '/android-chrome-192.png',
  '/android-chrome-512.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignora chamadas de API para sempre buscar em tempo real
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
