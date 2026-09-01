// PilotOS Service Worker
// APP_VERSION lo reescribe scripts/stamp-version.js en cada deploy → cambia el
// nombre del caché → los cachés de versiones viejas se borran al activar.
<<<<<<< HEAD
const APP_VERSION = 'Estable.671';
=======
const APP_VERSION = 'Beta.671';
>>>>>>> beta

const STATIC_CACHE  = 'pilotos-static-' + APP_VERSION;
const FONT_CACHE    = 'pilotos-fonts-'  + APP_VERSION;
const CURRENT_CACHES = [STATIC_CACHE, FONT_CACHE];

// Todo lo que la app necesita para arrancar y funcionar SIN RED.
// Incluye las librerías de export (jsPDF/autotable/qrcode → PDF del logbook) y el
// lector de Excel (SheetJS → importar logbook .xlsx), servido desde nuestro propio
// origen precisamente para que exista offline: desde el CDN no se puede cachear
// (respuesta opaca) y el importador moría con "comprueba tu conexión".
const PRECACHE_URLS = [
  '/',
  'manifest.json',
  'guide.html',
  'descent-profile.html',
  'js/docs.js',
  'js/runways.js',
  'js/oes-figs.js',
  'js/qbank-lim.js',
  'js/qbank-elec.js',
  'js/qbank-ac.js',
  'js/qbank-ag.js',
  'js/qbank-afgen.js',
  'vendor/jspdf.umd.min.js',
  'vendor/jspdf.plugin.autotable.min.js',
  'vendor/qrcode.min.js',
  'vendor/xlsx.full.min.js',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', function(e) {
  // NO hacer skipWaiting aquí: el SW nuevo se queda EN ESPERA y el frontend
  // muestra el botón "Actualizar". Solo se activa cuando el usuario lo pulsa
  // (postMessage SKIP_WAITING). Así no se recarga la app sola → no te saca a Home.
  //
  // Uno a uno, NO con addAll: addAll es atómico y un solo 404 dejaba la app SIN
  // NADA precacheado (el .catch se lo tragaba en silencio). Así un archivo que
  // falle se pierde él solo y el resto queda disponible offline.
  e.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return Promise.all(PRECACHE_URLS.map(function(u) {
        return cache.add(u).catch(function() {});
      }));
    }).catch(function() {})
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

  // Supabase Storage (URLs firmadas de documentos) — NUNCA cachear: son únicas por
  // petición (token nuevo cada vez) y caducan; cachearlas llena el Cache Storage y
  // presiona la cuota de almacenamiento (rompe el guardado de imágenes en localStorage).
  if (url.indexOf('supabase.co/storage/') !== -1 || url.indexOf('.supabase.co') !== -1) {
    return;
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

  // TODO lo que no sea de NUESTRO origen (APIs de meteo, tiles, CDNs) — NUNCA cachear.
  //
  // Esto no es una optimización: era un BUG que rompía la sección de mapas. Las ~10
  // llamadas a Open-Meteo del front van TODAS a la misma ruta
  // (api.open-meteo.com/v1/forecast) y solo se distinguen por la query. Como esa URL
  // no lleva "/api/" en el path, caía aquí abajo en cacheFirst, y matchCached() hace
  // un segundo intento con { ignoreSearch: true } → la PRIMERA respuesta guardada se
  // servía a TODAS las demás peticiones a Open-Meteo. El perfil vertical de ruta pedía
  // niveles de presión (temperature_500hPa, wind_speed_250hPa…) y recibía el JSON de
  // superficie de otro widget: sin esos campos, buildCols() devolvía null y el panel
  // caía a los campos sintéticos → "DATOS DEMO" para siempre.
  //
  // ignoreSearch existe para nuestros assets versionados (/guide.html?v=Beta.N); fuera
  // de nuestro origen la query ES la petición, así que aquí no se cachea nada.
  if (!isSameOrigin(req) || req.method !== 'GET') {
    return;
  }

  // Navegación / documento HTML — network-first (siempre intenta traer fresco).
  // Garantiza que index.html nunca quede congelado en una versión vieja.
  if (isNavigation(req)) {
    e.respondWith(networkFirst(req, STATIC_CACHE));
    return;
  }

  // Resto de assets estáticos — cache-first
  e.respondWith(cacheFirst(req, STATIC_CACHE));
});

function isSameOrigin(req) {
  try { return new URL(req.url).origin === self.location.origin; }
  catch (e) { return false; }
}

function isNavigation(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1 ||
    req.url.endsWith('/') ||
    req.url.endsWith('/index.html');
}

// Clave de caché SIN query string para los documentos. La query no cambia el HTML
// servido (?tab=roster, ?v=<versión>, ?rosterSync=…, ?pwreset=…, ?checkout=success)
// y usarla como clave guardaba una copia por cada variante — y, peor, hacía que
// caches.match() fallara offline para cualquier URL que llevara parámetros.
function docKey(request) {
  try {
    var u = new URL(request.url);
    return u.origin + u.pathname;
  } catch (e) {
    return request.url;
  }
}

// Busca en caché tolerando la query string: primero exacto, luego ignorándola.
// Sin esto, abrir la app por un atajo (/?tab=roster) o un iframe versionado
// (/guide.html?v=<versión>) era SIEMPRE un fallo de caché estando sin cobertura.
function matchCached(request) {
  return caches.match(request).then(function(hit) {
    if (hit) return hit;
    return caches.match(request, { ignoreSearch: true });
  });
}

function offlineResponse() {
  return new Response('Offline — abre PilotOS con conexión al menos una vez.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function networkFirst(request, cacheName) {
  return fetch(request)
    .then(function(response) {
      if (response && response.status === 200 && response.type !== 'opaque' && request.method === 'GET') {
        var clone = response.clone();
        var key = docKey(request);
        caches.open(cacheName).then(function(c) { c.put(key, clone); });
      }
      return response;
    })
    .catch(function() {
      return matchCached(request).then(function(cached) {
        if (cached) return cached;
        // Última red de seguridad para las navegaciones: cualquier ruta de la app
        // (es una SPA) se sirve con el index cacheado, así el atajo del Roster o
        // del Logbook abre la app en vez de la pantalla de "sin conexión".
        if (isNavigation(request)) {
          return caches.match('/').then(function(root) {
            return root || offlineResponse();
          });
        }
        return offlineResponse();
      });
    });
}

function cacheFirst(request, cacheName) {
  return matchCached(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (response && response.status === 200 && response.type !== 'opaque' && request.method === 'GET') {
        var clone = response.clone();
        caches.open(cacheName).then(function(c) { c.put(request, clone); });
      }
      return response;
    });
    // Sin .catch a propósito: si un asset no está cacheado y no hay red, el fallo
    // tiene que llegar al navegador como error de red. Devolver un 503 con cuerpo
    // de texto haría que un <script> intentara EJECUTAR ese texto.
  });
}
