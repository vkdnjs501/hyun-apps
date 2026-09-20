/* Hyun-apps 1.2.1 — exact-path shell + optional on-demand artwork cache. */
'use strict';
const VERSION = '1.2.1';
const BASE = new URL('./', self.location.href);
const PREFIX = `hyun-apps:${BASE.pathname}:`;
const CACHE = `${PREFIX}${VERSION}`;
const FILES = [
  './', './index.html', './styles.css', './projects.js', './visuals.js', './app.js',
  './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
// Illustrations are deliberately NOT precached on install. Only requested images are saved.
const MEDIA = [
  './logic-byeoli-portrait.webp', './logic-byeoli-room.webp',
  './logic-danseo-portrait.webp', './logic-danseo-room.webp',
  './logic-bandi-portrait.webp', './logic-bandi-room.webp'
];
const URLS = FILES.map((file) => new URL(file, BASE).href);
const MEDIA_URLS = new Set(MEDIA.map((file) => new URL(file, BASE).href));
const ALLOWED = new Set([...URLS, ...MEDIA_URLS]);
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  // Never clear localStorage / IndexedDB or caches owned by a sibling app or another path.
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.search = ''; url.hash = '';
  // An exact allowlist is important even if a portfolio is served at the account root.
  if (url.origin !== BASE.origin || !ALLOWED.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    if (MEDIA_URLS.has(url.href) && cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        // Storage pressure must not turn a successful response into an error.
        try { await cache.put(url.href, response.clone()); } catch (_) { /* Optional cache. */ }
      }
      return response.ok ? response : cached || response;
    } catch (_) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const index = await cache.match(new URL('./index.html', BASE).href);
        if (index) return index;
      }
      return new Response('오프라인 파일이 아직 저장되지 않았습니다.', {
        status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' }
      });
    }
  })());
});
