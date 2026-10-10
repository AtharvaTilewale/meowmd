/**
 * MeowMD Service Worker (sw.js)
 * High-performance offline caching and instant page loads.
 */

const CACHE_NAME = 'meowmd-v12';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './mdviewer.html',
  './mdeditor.html',
  './markdown-table-generator.html',
  './html-to-markdown.html',
  './markdown-cheat-sheet.html',
  './open-in-meowmd.html',
  './manifest.json',
  './assets/img/logo.svg',
  './assets/img/icon.svg',
  './assets/css/core.css',
  './assets/css/landing.css',
  './assets/css/viewer.css',
  './assets/css/editor.css',
  './assets/css/tools.css',
  './assets/js/common.js',
  './assets/js/lazy-loader.js',
  './assets/js/landing.js',
  './assets/js/viewer.js',
  './assets/js/viewer-extras.js',
  './assets/js/editor.js',
  './assets/js/templates.js',
  './assets/js/editor-extras.js',
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
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Network first for the app itself: new deployments appear on the next load,
    // the cache is only used when offline.
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // Cache first for fonts and CDN libraries, which are versioned and immutable
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }))
  );
});
