/**
 * MeowMD Service Worker (sw.js)
 * High-performance offline caching and instant page loads.
 */

const CACHE_NAME = 'meowmd-v2';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './mdviewer.html',
  './mdeditor.html',
  './manifest.json',
  './assets/css/core.css',
  './assets/css/landing.css',
  './assets/css/viewer.css',
  './assets/css/editor.css',
  './assets/js/common.js',
  './assets/js/lazy-loader.js',
  './assets/js/landing.js',
  './assets/js/viewer.js',
  './assets/js/editor.js',
  './assets/js/sw-register.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Stale-While-Revalidate for app assets, Cache-First for Fonts/CDNs
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for precached assets
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
