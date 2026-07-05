// PilotOS Service Worker
// APP_VERSION lo reescribe scripts/stamp-version.js en cada deploy → cambia el
// nombre del caché → los cachés de versiones viejas se borran al activar.
const APP_VERSION   = 'Beta.277';

const STATIC_CACHE  = 'pilotos-static-' + APP_VERSION;
const FONT_CACHE    = 'pilotos-fonts-'  + APP_VERSION;
const CURRENT_CACHES = [STATIC_CACHE, FONT_CACHE];

const PRECACHE_URLS = ['/'];

self.addEventListener('install', function(e) {
  // NO hacer skipWaiting aquí: el SW nuevo se queda EN ESPERA y el frontend
  // muestra el botón "Actualizar". Solo se activa cuando el usuario lo pulsa
  // (postMessage SKIP_WAITING). Así no se recarga la app sola → no te saca a Home.
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function(cache) { return cache.addAll(PRECACHE_URLS); })
      .catch(function() {})
  );
});

self.addEventListener('activate', function(e) {
  // Borrar TODOS los cachés que no sean los de la versión actual
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return CURRENT_CACHES.indexOf(k) === -1; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Botón "Actualizar ahora" del frontend → postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function(e) {
  var req = e.request;
  var url = req.url;

  // /api/* y backend propio — NUNCA cachear: pasar directo a la red.
  // (cachear esto rompería CAFI, logbook, paycheck, /api/version, etc.)
  if (url.indexOf('api.pilotos.aero') !== -1 || /\/api\//.test(url) || url.indexOf('/health') !== -1) {
    return; // sin respondWith → el navegador hace el fetch normal
  }

  // version.json — nunca cachear (es la fuente de la versión "running" real)
  if (url.indexOf('/version.json') !== -1) {
    return;
  }

  // Google Fonts — cache-first (versionados/inmutables)
  if (url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1) {
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // Navegación / documento HTML — network-first (siempre intenta traer fresco).
  // Garantiza que index.html nunca quede congelado en una versión vieja.
  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').indexOf('text/html') !== -1 ||
      url.endsWith('/') ||
      url.endsWith('/index.html')) {
    e.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }

  // Resto de assets estáticos — cache-first
  e.respondWith(cacheFirst(req, STATIC_CACHE));
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
