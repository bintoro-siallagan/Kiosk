// karyaOS service worker — minimal but installable
// Strategy:
//   - Static assets (Vite dist /assets/*, /icons, /logo, /favicon, manifest) → cache-first
//   - API + WS → never cache, always network
//   - HTML (navigation requests) → network-first with offline fallback
// Bump CACHE_VERSION on deploys; older caches are evicted on activate.

const CACHE_VERSION = 'karyaos-v3';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const HTML_CACHE    = `${CACHE_VERSION}-html`;

const PRECACHE_URLS = [
  '/',
  '/logo.png',
  '/favicon.png',
  '/favicon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  // Never cache: API, WebSocket upgrade, manifest (dynamic per-tenant),
  // signage/admin/POS/CDS/KDS surfaces.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname === '/manifest.webmanifest' ||
    url.search.includes('admin') ||
    url.search.includes('pos') ||
    url.search.includes('cds') ||
    url.search.includes('kds') ||
    url.search.includes('signage')
  ) {
    return; // browser handles directly, no caching
  }

  // HTML navigation → network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(HTML_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Static asset → cache-first
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico|gif)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});

// Skip-waiting trigger from the app (so updates apply on next reload)
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
