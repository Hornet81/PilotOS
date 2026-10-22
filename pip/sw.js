/* SW propio de la página del post-it en Safari (pip/postit.html).

   En el iPad la ventana flotante sólo se abre desde Safari, y Safari NO comparte
   el almacenamiento de la PWA: el SW de la app (/sw.js) no está ahí. Sin éste,
   pulsar «Fijar» volando abría Safari con «no hay conexión». Con éste, basta con
   haberlo abierto UNA vez con cobertura: a partir de ahí la página sale de caché.

   Red primero (así un arreglo llega en cuanto hay cobertura) y caché de
   respaldo. La URL lleva el post-it entero en la query (?cs=…&fl=…), así que se
   busca ignorando la query: la página es la misma para todos los vuelos.
   Ámbito /pip/ a propósito: no toca nada de la app. */
var CACHE = 'pilotos-pip-v1';
var FICHEROS = ['./postit.html', '../js/postit-dibujo.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FICHEROS.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return /^pilotos-pip-/.test(k) && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  var esPagina = /\/pip\/postit\.html$/.test(u.pathname), esDibujo = /\/js\/postit-dibujo\.js$/.test(u.pathname);
  if (!esPagina && !esDibujo) return;
  e.respondWith(fetch(r).then(function (res) {
    if (res && res.ok) { var copia = res.clone(); caches.open(CACHE).then(function (c) { c.put(esPagina ? './postit.html' : '../js/postit-dibujo.js', copia); }); }
    return res;
  }).catch(function () {
    return caches.match(esPagina ? './postit.html' : '../js/postit-dibujo.js', { ignoreSearch: true }).then(function (m) { return m || caches.match(r, { ignoreSearch: true }); });
  }));
});
