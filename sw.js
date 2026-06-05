const CACHE_VERSION = 'v1';
const STATIC_CACHE  = 'pilotos-static-' + CACHE_VERSION;
const API_CACHE     = 'pilotos-api-'    + CACHE_VERSION;
const FONT_CACHE    = 'pilotos-fonts-'  + CACHE_VERSION;

const PRECACHE_URLS = ['/'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function(cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== STATIC_CACHE && k !== API_CACHE && k !== FONT_CACHE;
        }).map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Google Fonts — cache-first
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(e.request, FONT_CACHE));
    return;
  }

  // Own API — network-first, cache fallback
  if (url.includes('api.pilotos.aero')) {
    e.respondWith(networkFirst(e.request, API_CACHE));
    return;
  }

  // index.html — network-first, cache fallback (always try latest)
  if (e.request.mode === 'navigate' ||
      url.endsWith('/') ||
      url.endsWith('/index.html')) {
    e.respondWith(networkFirst(e.request, STATIC_CACHE));
    return;
  }

  // Everything else — cache-first
  e.respondWith(cacheFirst(e.request, STATIC_CACHE));
});

function networkFirst(request, cacheName) {
  return fetch(request)
    .then(function(response) {
      if (response && response.status === 200 && response.type !== 'opaque' && request.method === 'GET') {
        var clone = response.clone();
        caches.open(cacheName).then(function(c) { c.put(request, clone); });
      }
      return response;
    })
    .catch(function() {
      return caches.match(request).then(function(cached) {
        return cached || new Response('Offline — abre PilotOS con conexión al menos una vez.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    });
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (response && response.status === 200 && response.type !== 'opaque' && request.method === 'GET') {
        var clone = response.clone();
        caches.open(cacheName).then(function(c) { c.put(request, clone); });
      }
      return response;
    });
  });
}
