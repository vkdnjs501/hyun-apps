/* Hyun-apps — scope-specific, network-first offline shell. */
'use strict';
const VERSION = '1.0.0';
const BASE = new URL('./', self.location.href);
const PREFIX = `hyun-apps:${BASE.pathname}:`;
const CACHE = `${PREFIX}${VERSION}`;
const FILES = [
  './', './index.html', './styles.css', './projects.js', './visuals.js', './app.js',
  './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
const URLS = FILES.map((file) => new URL(file, BASE).href);
const ALLOWED = new Set(URLS);
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  // Exact allowlist also protects sibling apps when this site is served from the account root.
  if (url.origin !== BASE.origin || !ALLOWED.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(url.href, response.clone());
      return response;
    } catch (_) {
      const cached = await cache.match(url.href);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const index = await cache.match(new URL('./index.html', BASE).href);
        if (index) return index;
      }
      return new Response('오프라인에서 사용할 파일이 아직 저장되지 않았습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
