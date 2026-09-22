/* Hyun-apps 1.3.5 — versioned assets; never combine old CSS with new markup. */
'use strict';
const VERSION = '1.3.5';
// Internal asset identity changes without a public release-number bump.
const BUILD = 'project-order-logic';
const BASE = new URL('./', self.location.href);
const PREFIX = `hyun-apps:${BASE.pathname}:`;
const CACHE = `${PREFIX}${VERSION}:${BUILD}`;
const INDEX = new URL('./index.html', BASE).href;
const HOME = BASE.href;
const FILES = [
  './index.html', `./styles.v${VERSION}.css`, `./projects.v${VERSION}.js`,
  `./visuals.v${VERSION}.js`, `./app.v${VERSION}.js`,
  './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
// Cache illustrations on demand. PDFs and other apps are outside this allowlist.
const MEDIA = [
  './logic-byeoli-portrait.webp', './logic-byeoli-room.webp',
  './logic-danseo-portrait.webp', './logic-danseo-room.webp',
  './logic-bandi-portrait.webp', './logic-bandi-room.webp'
];
const URLS = FILES.map(file => new URL(file, BASE).href);
const ASSETS = new Set(URLS.filter(url => url !== INDEX));
const MEDIA_URLS = new Set(MEDIA.map(file => new URL(file, BASE).href));
const versionMatches = html => html.includes(`<meta name="hyun-apps-version" content="${VERSION}">`)
  && html.includes(`<meta name="hyun-apps-build" content="${BUILD}">`);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch the complete release before saving it. A missing upload must not activate
    // a partial shell, and HTTP caches must not supply a previous index.html.
    const responses = await Promise.all(URLS.map(async url => {
      const response = await fetch(new Request(url, { cache:'reload' }));
      if (!response.ok || response.type !== 'basic') throw new Error('Incomplete portfolio release');
      return response;
    }));
    if (!versionMatches(await responses[0].clone().text())) throw new Error('Portfolio version mismatch');
    const cache = await caches.open(CACHE);
    await Promise.all(responses.map((response, i) => cache.put(URLS[i], response.clone())));
    await cache.put(HOME, responses[0]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  // Preserve all sibling apps' caches, localStorage and IndexedDB.
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin) return;
  const path = new URL(url.pathname, BASE).href;
  const navigation = request.mode === 'navigate' && (path === HOME || path === INDEX);
  // Match asset URLs exactly, including any query string. Versioned filenames also
  // bypass old workers that stripped queries before looking up styles.css.
  if (!navigation && !ASSETS.has(url.href) && !MEDIA_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const key = navigation ? INDEX : url.href;
    let cache, cached;
    try {
      cache = await caches.open(CACHE);
      cached = await cache.match(key);
    } catch (_) { /* Cache access is optional; an online request must still work. */ }
    if (!navigation && cached) return cached;
    try {
      const response = await fetch(request, navigation ? { cache:'no-cache' } : undefined);
      if (response.ok && response.type === 'basic') {
        // Retain an offline HTML/asset set from one release. A future online HTML
        // response is still returned, but its own worker must cache that release.
        const canCache = !navigation || versionMatches(await response.clone().text());
        if (canCache && cache) {
          try { await cache.put(key, response.clone()); } catch (_) { /* Optional cache. */ }
        }
      }
      return response.ok ? response : cached || response;
    } catch (_) {
      return cached || new Response('오프라인 파일이 아직 저장되지 않았습니다.', {
        status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' }
      });
    }
  })());
});
