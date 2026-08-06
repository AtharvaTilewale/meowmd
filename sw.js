const CACHE_NAME = 'md-workspace-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  // Cache core markdown engines
  'https://cdnjs.cloudflare.com/ajax/libs/markdown-it/13.0.2/markdown-it.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/markdown-it-footnote/3.0.3/markdown-it-footnote.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.5/purify.min.js',
  // Cache styles
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version if found, otherwise fetch from network
      return response || fetch(event.request);
    })
  );
});