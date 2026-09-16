/* ══════════════════════════════════════════════════════════════════════════
   MI PERFIL — el sitio único donde vive quién es el piloto.
   Cierra #PCGR2 (la opción del menú existía pero no llevaba a ningún sitio).

   Va en módulo aparte y no dentro de index.html a propósito: el index ya son
   3,5 MB y el refactor por módulos está en marcha.

   REGLA: ppSave() es la ÚNICA puerta de escritura del perfil. Sin eso el rol
   acaba guardado en tres sitios y ninguno gana — mismo criterio que
   _docsSaveMeta() en el Wallet.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PROF_KEY = 'pilotos_profile';

  // Lo que el piloto rellena. Todo opcional: un perfil vacío NO puede romper nada,
  // porque cada lector de la app cae a lo que hacía antes (ver ppGet()).
  var PROFILE = {
    nombre: '', licencia: '', autoridad: '', tipoLicencia: '',
    compania: '', base: '', flota: '', empleado: '',
    rol: '',            // CPT | FO  -> manda sobre lo que hoy DEDUCE el logbook
    /* CARGOS en la compañía: TRI · TRE · LSC · GTI, varios a la vez. De aquí sale
       el rol que se PRESELECCIONA al traerse una sesión de simulador del roster:
       hasta tenerlo, un TRI/TRE que IMPARTE cobraba sus simuladores como ALUMNO
       (119,03 € en vez de 800,99 / 924,22), porque `pc_tri`/`pc_tre` sólo se
       rellenan desde el logbook y del roster no llegaba nada.

       ⚠ Va como CADENA separada por comas, no como array, y no es cosmética:
       `POST /api/profile` (server.js) sólo copia `string | boolean | number`, así
       que un array se descartaría EN SILENCIO y el cargo no saldría nunca de este
       aparato — el 0 mudo, en la sincronización. Como cadena sincroniza hoy mismo
       y sin tocar el backend, que además es lo que hace que funcione en beta: una
       ruta o un filtro nuevos del servidor nacen rotos en beta hasta producción. */
    cargos: '',
    idioma: '',         // es | en   -> ES el idioma de la app: el selector ES/EN de
                        // ARIA escribe AQUÍ (window.pilotosSetIdioma), no un ajuste
                        // aparte. Hubo las dos precedencias posibles entre este campo
                        // y `db_lang` y las dos dejaban una pantalla mintiendo: con el
                        // perfil primero, el selector de ARIA no hacía nada (#RM4KZ de
                        // Marc); con db_lang primero, elegir «Castellano» aquí no movía
                        // ARIA. Ahora es un solo ajuste y db_lang es su espejo local.
    // '' = Zulu (como siempre) | 'local' = la hora del reloj del piloto. SÓLO afecta a
    // cómo se PINTA el roster: el dato sigue en Z, y el logbook ni se entera (es EASA).
    husoVista: '',
    // La zona en la que estaba el piloto al ACTIVAR el modo local. Si luego cambia (viaja),
    // el roster lo avisa: es la misma hora de vuelo pintada en otro huso.
    husoRef: '',
    iaContexto: false,  // el piloto decide si CAFI sabe quién es
    tieneFoto: false, tieneFirma: false
  };

  // Valores de fábrica, para poder volver a ellos al cambiar de cuenta.
  var VACIO = JSON.parse(JSON.stringify(PROFILE));

  function ppLoad() {
    // Resetear ANTES de cargar: si no, al cambiar de cuenta el perfil del piloto
    // anterior sobrevive en memoria y se le pinta al nuevo, aunque su clave de
    // localStorage ya esté borrada.
    Object.keys(VACIO).forEach(function (k) { PROFILE[k] = VACIO[k]; });
    try {
      var raw = localStorage.getItem(PROF_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        Object.keys(PROFILE).forEach(function (k) { if (o[k] !== undefined) PROFILE[k] = o[k]; });
      }
    } catch (e) {}
    return PROFILE;
  }

  /* Cambio de cuenta. clearAllUserData() borra las claves 'pilotos_*' de localStorage,
     pero NO la foto: vive en IndexedDB y sobreviviría — al piloto nuevo se le pintaría
     la cara del anterior. En esta app ya hubo datos saltando entre cuentas; aquí no. */
  function ppClear() {
    Object.keys(VACIO).forEach(function (k) { PROFILE[k] = VACIO[k]; });
    _fotoCache = null; _firmaCache = null;
    try { localStorage.removeItem(PROF_KEY); } catch (e) {}
    try { if (typeof window.updateUserAvatar === 'function') window.updateUserAvatar(window.currentUser || {}); } catch (e) {}
    return _avDel();
  }

  /* ── LOS CARGOS, en un solo sitio ─────────────────────────────────────────
     Se guardan en cadena (ver arriba) y se leen en lista. Quien los quiera los
     pide aquí: escribir un segundo `split(',')` por la app es como empiezan los
     dos criterios para la misma pregunta. */
  var PP_CARGOS = ['TRI', 'TRE', 'LSC', 'GTI'];
  function ppCargos() {
    return String(PROFILE.cargos || '').toUpperCase().split(',')
      .map(function (c) { return c.trim(); })
      .filter(function (c) { return PP_CARGOS.indexOf(c) >= 0; });
  }
  function ppTieneCargo(c) { return ppCargos().indexOf(String(c || '').toUpperCase()) >= 0; }
  function ppToggleCargo(c) {
    c = String(c || '').toUpperCase();
    if (PP_CARGOS.indexOf(c) < 0) return ppCargos();
    var l = ppCargos(), i = l.indexOf(c);
    if (i >= 0) l.splice(i, 1); else l.push(c);
    /* Se guardan EN EL ORDEN de la lista, no en el que los pulsó el piloto: así el
       mismo juego de cargos da siempre la misma cadena y no sube al servidor una
       versión nueva del perfil por haberlos tocado en otro orden. */
    ppSave({ cargos: PP_CARGOS.filter(function (x) { return l.indexOf(x) >= 0; }).join(',') });
    return ppCargos();
  }

  // ── ÚNICA puerta de escritura ────────────────────────────────────────────
  function ppSave(cambios) {
    if (cambios) Object.keys(cambios).forEach(function (k) {
      if (k in PROFILE) PROFILE[k] = cambios[k];
    });
    try { localStorage.setItem(PROF_KEY, JSON.stringify(PROFILE)); } catch (e) {}
    try { if (typeof window.updateUserAvatar === 'function') window.updateUserAvatar(window.currentUser || {}); } catch (e) {}
    // La cabecera tiene que reflejar el cambio EN EL ACTO: si no, el piloto cambia el
    // rol, se guarda bien, y el chip sigue diciendo lo de antes (#3IFUH).
    try { ppRefrescarCabecera(); } catch (e) {}
    ppCloudPush();
    return PROFILE;
  }

  // Lectura con valor por defecto: lo usan los demás módulos.
  function ppGet(campo, porDefecto) {
    var v = PROFILE[campo];
    return (v === '' || v === undefined || v === null) ? (porDefecto === undefined ? '' : porDefecto) : v;
  }

  /* ── La FOTO va a IndexedDB, nunca a localStorage ─────────────────────────
     En localStorage no cabe: iOS da ~5 MB por origen y ahí ya viven el logbook
     y el roster. Al llenarse, setItem lanza QuotaExceeded y el catch se lo traga
     EN SILENCIO — es exactamente lo que nos pasó con los documentos. */
  var AV_DB = 'pilotos-profile', AV_STORE = 'avatar', _avDbP = null;
  function _avDb() {
    if (_avDbP) return _avDbP;
    _avDbP = new Promise(function (resolve) {
      try {
        if (!window.indexedDB) return resolve(null);
        var rq = indexedDB.open(AV_DB, 1);
        rq.onupgradeneeded = function () {
          var db = rq.result;
          if (!db.objectStoreNames.contains(AV_STORE)) db.createObjectStore(AV_STORE);
        };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
        rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return _avDbP;
  }
  // Mismo almacén para la foto y la firma: las dos son imágenes que no caben en
  // localStorage y las dos tienen que morir al cambiar de cuenta.
  function _avPut(clave, dataUrl) {
    return _avDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(AV_STORE, 'readwrite');
          tx.objectStore(AV_STORE).put(dataUrl, clave);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }
  function _avGet(clave) {
    return _avDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var rq = db.transaction(AV_STORE, 'readonly').objectStore(AV_STORE).get(clave);
          rq.onsuccess = function () { resolve(rq.result || null); };
          rq.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }
  function _avDel(clave) {
    return _avDb().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(AV_STORE, 'readwrite');
          if (clave) tx.objectStore(AV_STORE).delete(clave);
          else tx.objectStore(AV_STORE).clear();   // cambio de cuenta: fuera todo
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  // Cache en memoria para que el avatar no parpadee en cada render.
  var _fotoCache = null;
  function ppFoto() { return _fotoCache; }

  function ppHydrate() {
    return Promise.all([_avGet('foto'), _avGet('firma')]).then(function (r) {
      var d = r[0]; _fotoCache = d; _firmaCache = r[1];
      try { if (typeof window.updateUserAvatar === 'function') window.updateUserAvatar(window.currentUser || {}); } catch (e) {}
      return d;
    });
  }

  /* Recorta a cuadrado por el centro y reescala a 512 px antes de guardar: una foto
     de móvil son 3-5 MB y en el avatar se ve a 38 px. Sale un JPEG de unos 40 KB. */
  function ppSetFoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('sin fichero'));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('no se pudo leer la foto')); };
      fr.onload = function (e) {
        var img = new Image();
        img.onerror = function () { reject(new Error('la imagen no es válida')); };
        img.onload = function () {
          try {
            var L = 512, lado = Math.min(img.width, img.height);
            var sx = (img.width - lado) / 2, sy = (img.height - lado) / 2;
            var c = document.createElement('canvas'); c.width = L; c.height = L;
            c.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, L, L);
            var url = c.toDataURL('image/jpeg', 0.82);
            _avPut('foto', url).then(function (ok) {
              if (!ok) return reject(new Error('no se pudo guardar la foto'));
              _fotoCache = url;
              ppSave({ tieneFoto: true });
              ppMediaPush('foto', url);
              resolve(url);
            });
          } catch (err) { reject(err); }
        };
        img.src = e.target.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function ppQuitarFoto() {
    return _avDel('foto').then(function () {
      _fotoCache = null;
      ppSave({ tieneFoto: false });
      ppMediaPush('foto', '');
      return true;
    });
  }

  /* ── FIRMA ────────────────────────────────────────────────────────────────
     El logbook EASA se certifica con la firma del titular: el PDF que exporta la
     app ya lleva la línea "FIRMA / SIGNATURE: ____" en blanco para hacerlo a mano.
     Guardándola aquí, el export sale ya firmado.
     PNG con fondo transparente, para que se estampe sobre el papel sin recuadro. */
  var _firmaCache = null;
  function ppFirma() { return _firmaCache; }

  function ppSetFirma(dataUrl) {
    if (!dataUrl) return Promise.reject(new Error('firma vacía'));
    return _avPut('firma', dataUrl).then(function (ok) {
      if (!ok) throw new Error('no se pudo guardar la firma');
      _firmaCache = dataUrl;
      ppSave({ tieneFirma: true });
      ppMediaPush('firma', dataUrl);
      return dataUrl;
    });
  }

  function ppQuitarFirma() {
    return _avDel('firma').then(function () {
      _firmaCache = null;
      ppSave({ tieneFirma: false });
      ppMediaPush('firma', '');
      return true;
    });
  }

  /* ══ NUBE ═════════════════════════════════════════════════════════════════
     Se apoya en `user_settings`, que ya existe (no hace falta tabla nueva).

     ⚠ ESTO ESTABA A MEDIAS Y NO LO DECÍA NADIE. `ppCloudPush` se llamaba en cada
     guardado y funcionaba; `ppCloudPull` estaba escrita, exportada… **y no la
     llamaba nadie**. Medido con dos dispositivos: el iPad sube el perfil entero
     y el móvil no pide `/api/profile` ni al arrancar ni al abrir la pantalla —
     cero veces. Forzando la función a mano, el perfil aparece completo. O sea:
     el arreglo estaba escrito y sin enchufar, que desde fuera se ve exactamente
     igual que si no existiera. Reportado por José Lucas (7-sep-2026).

     Lo que NO viaja, y por qué:
     · `licencia` y `autoridad` — sensibles, se quedan en el dispositivo.
     · `tieneFoto` / `tieneFirma` — describen el IndexedDB de ESE aparato. La
       imagen no sube, así que la bandera llegaba sola y le decía al otro móvil
       que tenía firma cuando no la tiene. Un dato falso presentado como bueno.
     ═══════════════════════════════════════════════════════════════════════════ */
  /* `licencia` y `autoridad` YA VIAJAN (Beta.754). Estaban fuera con el motivo
     «son del dispositivo», y no lo son: el número de licencia es del piloto, y
     este mismo backend ya guarda su logbook, su nómina y la foto escaneada de esa
     misma licencia en Documentos. Lo único que queda local son las dos banderas,
     porque describen si ESTE aparato tiene ya el archivo descargado. */
  var PROF_SOLO_LOCAL = { tieneFoto: 1, tieneFirma: 1 };
  var PROF_SYNC_AT = 'pilotos_profile_sync_at';
  var _ultPull = 0;
  function _tok() { try { return (typeof lsGet === 'function') ? lsGet('cafi_auth_token', '') : ''; } catch (e) { return ''; } }
  function _syncAt() { try { return localStorage.getItem(PROF_SYNC_AT) || ''; } catch (e) { return ''; } }
  function _setSyncAt(v) { try { if (v) localStorage.setItem(PROF_SYNC_AT, v); } catch (e) {} }

  /* ── LA FOTO Y LA FIRMA TAMBIÉN SON EL PERFIL ─────────────────────────────
     Viven en IndexedDB porque en localStorage no caben, y de ahí no salían: el
     piloto firmaba en el iPad y el logbook del móvil seguía saliendo sin firmar.
     Suben al mismo sitio que los documentos (bucket `pilot-docs`), en su propio
     endpoint para no colgarse del gate de plan de aquéllos: la firma son 10 KB y
     sin ella el logbook EASA del segundo aparato no vale.
     `b64` vacío = BORRADO, para que quitar la foto en un aparato la quite en el
     otro en vez de que vuelva a bajar sola. */
  function ppMediaPush(kind, dataUrl) {
    try {
      var token = _tok();
      if (!token || typeof ldBackendUrl !== 'function') return;
      var b64 = '', tipo = 'image/jpeg';
      if (dataUrl) {
        var m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl));
        if (!m) return;
        tipo = m[1]; b64 = m[2];
      }
      fetch(ldBackendUrl() + '/api/profile/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ kind: kind, b64: b64, type: tipo })
      }).catch(function () {});
    } catch (e) {}
  }

  /* Y bajarlas. Sólo si NO están ya aquí: son decenas de KB y bajarlas en cada
     sincronización sería pagar por nada. `at` es el sello del servidor: si la
     imagen cambió en el otro aparato, vuelve a bajar. */
  var MEDIA_AT = 'pilotos_profile_media_at';
  function _mediaAt() { try { return JSON.parse(localStorage.getItem(MEDIA_AT) || '{}'); } catch (e) { return {}; } }
  function _setMediaAt(o) { try { localStorage.setItem(MEDIA_AT, JSON.stringify(o)); } catch (e) {} }
  function ppMediaPull(media) {
    if (!media) return Promise.resolve(false);
    var sellos = _mediaAt(), pend = [];
    ['foto', 'firma'].forEach(function (k) {
      var m = media[k];
      var tengo = (k === 'foto') ? !!_fotoCache : !!_firmaCache;
      if (!m || !m.url) {
        // Borrada en el otro aparato → aquí también.
        if (tengo && sellos[k]) {
          pend.push(_avDel(k).then(function () {
            if (k === 'foto') { _fotoCache = null; ppSave({ tieneFoto: false }); }
            else { _firmaCache = null; ppSave({ tieneFirma: false }); }
            delete sellos[k]; _setMediaAt(sellos);
          }));
        }
        return;
      }
      if (tengo && sellos[k] === m.at) return;          // ya la tengo, y es la misma
      pend.push(fetch(m.url).then(function (r) { return r.blob(); }).then(function (bl) {
        return new Promise(function (res) {
          var fr = new FileReader();
          fr.onload = function () { res(fr.result); };
          fr.onerror = function () { res(null); };
          fr.readAsDataURL(bl);
        });
      }).then(function (durl) {
        if (!durl) return;
        return _avPut(k, durl).then(function (ok) {
          if (!ok) return;
          if (k === 'foto') { _fotoCache = durl; ppSave({ tieneFoto: true }); }
          else { _firmaCache = durl; ppSave({ tieneFirma: true }); }
          sellos[k] = m.at; _setMediaAt(sellos);
          try { if (typeof window.updateUserAvatar === 'function') window.updateUserAvatar(window.currentUser || {}); } catch (e) {}
        });
      }).catch(function () {}));
    });
    if (!pend.length) return Promise.resolve(false);
    return Promise.all(pend).then(function () { return true; });
  }

  function ppCloudPush() {
    try {
      var token = _tok();
      if (!token || typeof ldBackendUrl !== 'function') return;
      var envio = {};
      Object.keys(PROFILE).forEach(function (k) {
        if (PROF_SOLO_LOCAL[k]) return;
        envio[k] = PROFILE[k];
      });
      fetch(ldBackendUrl() + '/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ profile: envio })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.updatedAt) _setSyncAt(j.updatedAt); })
        .catch(function () {});
    } catch (e) {}
  }

  /* El sello `updatedAt` es lo que permite que el perfil del iPad PISE al del
     móvil. Rellenando sólo huecos —como estaba— el primero que escribe gana para
     siempre: cambiar el rol en un aparato no llegaba nunca al otro aunque el pull
     se llamara. Es el mismo patrón que `/api/pay-profile`, que ya lo hacía bien;
     escribir aquí un criterio distinto sería tener dos sincronizaciones que no se
     parecen. */
  function ppCloudPull(forzar) {
    try {
      var token = _tok();
      if (!token || typeof ldBackendUrl !== 'function') return Promise.resolve(null);
      var ahora = Date.now();
      if (!forzar && (ahora - _ultPull) < 30000) return Promise.resolve(null);
      _ultPull = ahora;
      return fetch(ldBackendUrl() + '/api/profile', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !j.profile) return null;
          var mio = _syncAt();
          var remoto = j.updatedAt || '';
          // La nube es más nueva → manda ENTERA. Si no, sólo rellena huecos, que
          // es lo que hacía antes y no puede quitarle nada a nadie.
          var pisa = !!remoto && (!mio || remoto > mio);
          var cambios = {};
          Object.keys(j.profile).forEach(function (k) {
            if (!(k in PROFILE) || PROF_SOLO_LOCAL[k]) return;
            var v = j.profile[k];
            if (pisa) { if (PROFILE[k] !== v) cambios[k] = v; }
            else if (!PROFILE[k] && v) cambios[k] = v;
          });
          if (Object.keys(cambios).length) {
            _setSyncAt(remoto);      // antes de guardar: ppSave vuelve a empujar
            ppSave(cambios);
            /* Si el piloto está MIRANDO la pantalla del perfil cuando baja algo,
               hay que repintarla: si no, los campos siguen enseñando lo viejo con
               lo nuevo ya guardado — dos datos que se contradicen. */
            try { if (typeof window.ppRenderScreen === 'function' &&
                      document.getElementById('pp-screen-body')) ppRenderScreen(); } catch (e) {}
          } else if (remoto) _setSyncAt(remoto);
          return ppMediaPull(j.media).then(function (hubo) {
            if (hubo) { try { if (typeof window.ppRenderScreen === 'function' &&
                          document.getElementById('pp-screen-body')) ppRenderScreen(); } catch (e) {} }
            return PROFILE;
          });
        }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ── Las cifras de la cabecera salen del LOGBOOK: cero campos que rellenar ── */
  function ppStats() {
    var out = { horas: 0, vuelos: 0, aterrizajes: 0, anios: 0, aeropuertos: 0 };
    try {
      var E = window.ldEntries || [];
      if (!E.length) return out;
      var t2m = function (t) { if (!t) return 0; var p = String(t).split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
      var min = 0, ldg = 0, aptos = {}, fechas = [];
      E.forEach(function (f) {
        min += t2m(f.block);
        ldg += (+f.ldgDay || 0) + (+f.ldgNight || 0);
        if (f.dep) aptos[f.dep] = 1;
        if (f.arr) aptos[f.arr] = 1;
        if (f.date) fechas.push(f.date);
      });
      fechas.sort();
      out.horas = Math.round(min / 60);
      out.vuelos = E.length;
      out.aterrizajes = ldg;
      out.aeropuertos = Object.keys(aptos).length;
      if (fechas.length) {
        var d0 = new Date(fechas[0]), d1 = new Date(fechas[fechas.length - 1]);
        out.anios = Math.max(1, Math.round((d1 - d0) / 31557600000));
      }
    } catch (e) {}
    return out;
  }

  /* ── Lo que la app ya SABE, sin preguntar ────────────────────────────────
     Los chips de debajo del nombre no pueden depender de que el piloto rellene el
     perfil: con 3.800 vuelos guardados, la app ya sabe si vuela de comandante, desde
     dónde y en qué. Lo que el piloto escriba manda; esto es sólo el punto de partida. */
  function ppDerivados() {
    var out = { rol: '', base: '', flota: '' };
    try {
      var E = window.ldEntries || [];
      if (!E.length) return out;

      // Rol dominante: el que ya calcula el logbook para el export.
      try { if (typeof window._ldDominantRole === 'function') out.rol = window._ldDominantRole() || ''; } catch (e) {}

      // Base = el aeropuerto del que más veces SALE. Un piloto de línea sale casi
      // siempre de su base; el destino cambia cada día.
      var deps = {}, tipos = {};
      var desde = E.slice(0, 400);   // los últimos vuelos: si cambió de base, manda la de ahora
      desde.forEach(function (f) {
        if (f.dep) deps[f.dep] = (deps[f.dep] || 0) + 1;
        if (f.acType) tipos[f.acType] = (tipos[f.acType] || 0) + 1;
      });
      var top = function (o) {
        var k = Object.keys(o); if (!k.length) return '';
        return k.sort(function (a, b) { return o[b] - o[a]; })[0];
      };
      out.base = top(deps);
      out.flota = top(tipos);
    } catch (e) {}
    return out;
  }

  // Frase corta para el prompt de CAFI (capa 3). Se genera aquí para que lo que
  // se manda sea exactamente lo que el piloto ve en su pantalla.
  function ppContextoIA() {
    if (!PROFILE.iaContexto) return '';
    var s = ppStats(), p = [];
    if (PROFILE.rol) p.push(PROFILE.rol === 'CPT' ? 'Comandante' : 'Primer oficial');
    if (PROFILE.compania) p.push('en ' + PROFILE.compania);
    if (PROFILE.base) p.push('base ' + PROFILE.base);
    if (PROFILE.flota) p.push(PROFILE.flota);
    if (s.horas) p.push(s.horas + ' h totales');
    if (s.anios) p.push(s.anios + ' años volando');
    return p.length ? p.join(', ') + '.' : '';
  }

  /* ── CSS propio, inyectado una vez ───────────────────────────────────────
     Con variables y un bloque html.day, porque la app tiene tema automático y
     una pantalla nueva con colores fijos se vuelve ilegible de día. */
  /* ── Tema día/noche ──────────────────────────────────────────────────────
     OJO: .screen trae un fondo CLARO por defecto (#87CEEB). Cada pantalla pone
     el suyo con html:not(.day) para noche y html.day para día — sin eso, de noche
     los textos claros caen sobre ese azul y no se lee nada. */
  function ppCss() {
    if (document.getElementById('pp-style')) return;
    var st = document.createElement('style');
    st.id = 'pp-style';
    var M = "'Space Mono',monospace";
    st.textContent = [
      /* NOCHE (por defecto en esta app: <html> sin .day) */
      'html:not(.day) #scr-perfil{--ppTxt:#F0FFFE;--ppDim:rgba(240,255,254,.62);--ppDimr:rgba(240,255,254,.60);',
      '  --ppCard:rgba(255,255,255,.05);--ppLine:rgba(34,211,238,.16);--ppAcc:#22D3EE;--ppRing:#0F172A;',
      '  background:radial-gradient(120% 62% at 50% -8%,rgba(34,211,238,.20),rgba(34,211,238,0) 62%),',
      '    linear-gradient(180deg,#0C1A2E 0%,#0A1424 55%,#080F1C 100%)}',
      'html:not(.day) #scr-perfil .ih-title{color:#F0FFFE}',
      /* DÍA */
      'html.day #scr-perfil{--ppTxt:#0A1628;--ppDim:rgba(15,23,42,.68);--ppDimr:rgba(15,23,42,.66);',
      '  --ppCard:#FFFFFF;--ppLine:rgba(2,132,199,.18);--ppAcc:#0369A1;--ppRing:#EAF3FC;',
      '  background:radial-gradient(120% 60% at 50% -6%,rgba(3,105,161,.12),rgba(3,105,161,0) 60%),',
      '    linear-gradient(180deg,#E8F2FB 0%,#F2F8FD 55%,#F6FAFE 100%)}',
      'html.day #scr-perfil .ih-title{color:#0A1628}',
      /* La barra de abajo (Inicio/Exam/CAFI/Tools/Logbook) es position:fixed y mide 76 px:
         sin reservarle el hueco tapa la última tarjeta. Y OJO con el shorthand `padding`,
         que machaca el padding-bottom con safe-area de .scroll-body — de ahí el desglose. */
      '#scr-perfil .scroll-body{padding-left:16px;padding-right:16px;padding-top:0;',
      '  padding-bottom:calc(94px + env(safe-area-inset-bottom,0px))}',
      /* El "‹ Inicio" hereda un morado (#5B21B6) que sobre fondo oscuro no se ve. Cada
         pantalla se pone el suyo; esta también. */
      '#scr-perfil .back-btn{color:var(--ppAcc)}',
      'html:not(.day) #scr-perfil .back-btn{color:#22D3EE}',
      'html.day #scr-perfil .back-btn{color:#0369A1}',
      /* cabecera */
      '#scr-perfil .pp-hero{position:relative;border-radius:20px;padding:19px 16px 16px;text-align:center;',
      '  border:1px solid var(--ppLine);overflow:hidden;margin-bottom:6px}',
      'html:not(.day) #scr-perfil .pp-hero{background:linear-gradient(150deg,#132A44,#0E1E33 55%,#122740);',
      '  box-shadow:0 8px 30px rgba(4,14,28,.5)}',
      'html.day #scr-perfil .pp-hero{background:linear-gradient(150deg,#DCEAFA,#F4F9FE 55%,#E4F0FB);',
      '  box-shadow:0 4px 18px rgba(2,132,199,.10)}',
      '#scr-perfil .pp-avw{position:relative;width:88px;height:88px;margin:0 auto 11px}',
      '#scr-perfil .pp-av{width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#1E3A8A,#0369A1);',
      '  border:2.5px solid var(--ppAcc);display:flex;align-items:center;justify-content:center;',
      '  font-weight:700;font-size:29px;color:#fff;overflow:hidden}',
      '#scr-perfil .pp-av img{width:100%;height:100%;object-fit:cover;display:block}',
      '#scr-perfil .pp-edit{position:absolute;right:-1px;bottom:-1px;width:30px;height:30px;border-radius:50%;',
      '  background:var(--ppAcc);color:#fff;border:3px solid var(--ppRing);display:flex;align-items:center;',
      '  justify-content:center;font-size:16px;cursor:pointer;font-weight:700;line-height:1}',
      'html:not(.day) #scr-perfil .pp-edit{color:#04222c}',
      '#scr-perfil .pp-name{font-size:19px;font-weight:700;color:var(--ppTxt)}',
      '#scr-perfil .pp-mail{font-family:' + M + ';font-size:11px;color:var(--ppDimr);margin-top:3px}',
      '#scr-perfil .pp-chips{display:flex;gap:6px;justify-content:center;margin-top:11px;flex-wrap:wrap}',
      '#scr-perfil .pp-chip{font-family:' + M + ';font-size:10px;font-weight:700;padding:4px 9px;',
      '  border-radius:6px;background:rgba(34,211,238,.13);color:var(--ppAcc);border:1px solid var(--ppLine)}',
      'html.day #scr-perfil .pp-chip{background:rgba(3,105,161,.10)}',
      /* cifras */
      '#scr-perfil .pp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:15px}',
      '#scr-perfil .pp-st{background:var(--ppCard);border:1px solid var(--ppLine);border-radius:12px;padding:9px 4px;text-align:center}',
      '#scr-perfil .pp-st b{display:block;font-family:' + M + ';font-size:15px;color:var(--ppTxt)}',
      '#scr-perfil .pp-st span{font-size:9px;font-weight:700;color:var(--ppDimr);letter-spacing:.7px;text-transform:uppercase}',
      /* secciones */
      '#scr-perfil .pp-sh{font-family:' + M + ';font-size:9.5px;font-weight:700;letter-spacing:1.9px;',
      '  text-transform:uppercase;color:var(--ppAcc);margin:19px 4px 8px;display:flex;justify-content:space-between}',
      '#scr-perfil .pp-card{background:var(--ppCard);border:1px solid var(--ppLine);border-radius:15px;overflow:hidden}',
      'html.day #scr-perfil .pp-card{box-shadow:0 2px 10px rgba(2,132,199,.06)}',
      '#scr-perfil .pp-row{display:flex;align-items:center;gap:11px;padding:11px 13px;border-bottom:1px solid var(--ppLine)}',
      '#scr-perfil .pp-row:last-child{border-bottom:none}',
      '#scr-perfil .pp-ico{width:31px;height:31px;border-radius:9px;display:flex;align-items:center;justify-content:center;',
      '  font-size:14px;flex-shrink:0;background:rgba(34,211,238,.12);border:1px solid var(--ppLine)}',
      'html.day #scr-perfil .pp-ico{background:rgba(3,105,161,.09)}',
      '#scr-perfil .pp-lbl{flex:1;min-width:0}',
      '#scr-perfil .pp-lbl b{display:block;font-size:13.5px;font-weight:600;color:var(--ppTxt)}',
      '#scr-perfil .pp-lbl span{display:block;font-size:11px;color:var(--ppDim);margin-top:1px}',
      /* campos */
      '#scr-perfil .pp-in{font-family:' + M + ';font-size:12px;color:var(--ppAcc);',
      '  background:rgba(127,127,127,.12);border:1px solid var(--ppLine);border-radius:8px;padding:6px 8px;',
      '  text-align:right;width:118px;outline:none;-webkit-appearance:none}',
      '#scr-perfil .pp-in:focus{border-color:var(--ppAcc);background:rgba(34,211,238,.12)}',
      '#scr-perfil .pp-in::placeholder{color:var(--ppDimr);opacity:1}',
      '#scr-perfil select.pp-in{width:128px}',
      'html.day #scr-perfil select.pp-in{background:#F1F7FC}',
      /* ── Cargos en la compañía ────────────────────────────────────────────
         Van en su propia fila y no en un <select>: son VARIOS a la vez, y un
         desplegable de uno solo obligaría a elegir entre TRI y TRE a quien es
         las dos cosas. El objetivo táctil es de 44 px de alto
         (la papelera de Gastos medía 21 y era intocable).
         Las DOS paletas se declaran: encendido es el acento de cada tema con su
         texto encima —cian sobre oscuro de noche, azul con blanco de día—, que
         es lo que permite medir el contraste en vez de suponerlo. */
      'html:not(.day) #scr-perfil{--ppOn:#22D3EE;--ppOnTx:#06232B}',
      'html.day #scr-perfil{--ppOn:#0369A1;--ppOnTx:#FFFFFF}',
      '#scr-perfil .pp-cargos{display:flex;flex-wrap:wrap;gap:7px;padding:2px 13px 12px}',
      '#scr-perfil .pp-cargo{font-family:' + M + ';font-size:12px;font-weight:700;letter-spacing:.4px;',
      '  min-height:44px;min-width:54px;padding:6px 13px;border-radius:10px;cursor:pointer;',
      '  background:rgba(127,127,127,.12);border:1px solid var(--ppLine);color:var(--ppTxt);',
      '  display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.25}',
      '#scr-perfil .pp-cargo small{font-family:inherit;font-size:9px;font-weight:600;opacity:.72;letter-spacing:0}',
      '#scr-perfil .pp-cargo.on{background:var(--ppOn);border-color:var(--ppOn);color:var(--ppOnTx)}',
      '#scr-perfil .pp-cargo.on small{opacity:.88}',
      '#scr-perfil .pp-note{font-size:11px;color:var(--ppDim);line-height:1.5;padding:9px 14px 12px}',
      /* interruptor */
      '#scr-perfil .pp-sw{width:44px;height:25px;border-radius:13px;background:rgba(127,127,127,.38);position:relative;',
      '  cursor:pointer;flex-shrink:0;transition:background .18s}',
      '#scr-perfil .pp-sw.on{background:var(--ppAcc)}',
      '#scr-perfil .pp-sw i{position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;',
      '  background:#fff;transition:left .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
      '#scr-perfil .pp-sw.on i{left:22px}',
      '#scr-perfil .pp-arrow{color:var(--ppDimr);font-size:16px}',
      /* firma */
      '#scr-perfil .pp-btn-sm{font-family:inherit;font-size:12px;font-weight:600;padding:6px 12px;border-radius:9px;',
      '  border:1px solid var(--ppLine);background:rgba(127,127,127,.12);color:var(--ppAcc);cursor:pointer}',
      '#scr-perfil .pp-btn-sm.danger{color:#F43F5E;border-color:rgba(244,63,94,.3)}',
      /* Aviso del huso: ámbar, dentro de la propia tarjeta, sólo cuando está en local */
      '#scr-perfil .pp-aviso{margin:0 13px 12px;padding:11px 12px;border-radius:12px;',
      '  background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.32)}',
      '#scr-perfil .pp-aviso-t{font-size:12.5px;font-weight:700;color:#F59E0B;margin-bottom:5px}',
      '#scr-perfil .pp-aviso-b{font-size:11.5px;line-height:1.55;color:var(--ppDim)}',
      '#scr-perfil .pp-aviso-z{font-family:\'Space Mono\',monospace;font-size:11px;color:var(--ppAcc);',
      '  margin-top:8px;padding-top:7px;border-top:1px solid rgba(245,158,11,.22)}',
      '#scr-perfil .pp-row-firma{border-bottom:none;padding-bottom:4px}',
      '#scr-perfil .pp-ok{color:#10B981;font-size:15px;font-weight:700}',
      /* El recuadro de la firma: grande, con borde discontinuo, como el papel del logbook */
      '#scr-perfil .pp-sig{height:72px;border-radius:11px;border:1.5px dashed var(--ppLine);',
      '  display:flex;align-items:center;justify-content:center;margin:4px 14px 13px;cursor:pointer;',
      '  background:rgba(34,211,238,.04);overflow:hidden;-webkit-tap-highlight-color:transparent}',
      '#scr-perfil .pp-sig.hay{border-color:rgba(34,211,238,.42)}',
      'html.day #scr-perfil .pp-sig{background:#FFF;border-color:rgba(2,132,199,.3)}',
      '#scr-perfil .pp-sig span{font-size:12.5px;color:var(--ppDimr)}',
      '#scr-perfil .pp-sig img{max-height:58px;max-width:88%;object-fit:contain}',
      /* La firma se guarda en trazo OSCURO porque va sobre el papel blanco del PDF; de
         noche se invierte sólo para verla aquí. En el PDF sale en negro igualmente. */
      'html:not(.day) #scr-perfil .pp-sig img{filter:invert(1) brightness(1.6)}',
      '#scr-perfil .pp-firma-acc{display:flex;gap:8px;justify-content:flex-end;padding:0 14px 12px;margin-top:-6px}',
      /* panel de firmar: va pegado al body, así que NO cuelga de #scr-perfil */
      '#pp-firma-ov{position:fixed;inset:0;z-index:9999;background:rgba(4,10,20,.72);',
      '  display:flex;align-items:center;justify-content:center;padding:18px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}',
      '#pp-firma-ov .pp-firma-box{width:100%;max-width:430px;background:#F8FAFC;border-radius:20px;padding:18px}',
      '#pp-firma-ov .pp-firma-t{font-family:\'Space Grotesk\',sans-serif;font-size:17px;font-weight:700;color:#0A1628}',
      '#pp-firma-ov .pp-firma-s{font-size:12px;color:rgba(15,23,42,.62);margin:3px 0 12px}',
      '#pp-firma-ov canvas{width:100%;height:190px;background:#fff;border:1.5px dashed rgba(2,132,199,.4);',
      '  border-radius:13px;touch-action:none;display:block;cursor:crosshair}',
      '#pp-firma-ov .pp-firma-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:13px}',
      '#pp-firma-ov .pp-btn-sm{font-family:inherit;font-size:13px;font-weight:600;padding:9px 15px;border-radius:10px;',
      '  border:1px solid rgba(2,132,199,.25);background:#fff;color:#0369A1;cursor:pointer}',
      '#pp-firma-ov .pp-btn-sm.ok{background:#0369A1;color:#fff;border-color:#0369A1}'
    ].join('');
    document.head.appendChild(st);
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* Los chips de la cabecera, en su propia función porque hay que poder repintarlos SIN
     repintar la pantalla entera: al cambiar el rol se perdería el scroll y el foco.
     Lo escrito por el piloto manda; lo que falte se deduce del logbook. */
  function _chipsHtml() {
    var D = ppDerivados();
    var chips = [];
    var rol = PROFILE.rol || D.rol;
    if (rol) chips.push(rol === 'CPT' ? 'COMANDANTE' : 'PRIMER OFICIAL');
    if (PROFILE.compania) chips.push(_esc(PROFILE.compania).toUpperCase());
    var base = PROFILE.base || D.base;
    if (base) chips.push('BASE ' + _esc(base).toUpperCase());
    var flota = PROFILE.flota || D.flota;
    if (flota) chips.push(_esc(flota).toUpperCase());
    return chips;
  }

  /* Sin esto, el piloto cambia el rol a "Primer oficial", el dato SE GUARDA... y el chip
     de arriba sigue diciendo COMANDANTE. Que es exactamente lo que reportó Daniel
     (#3IFUH): "al pulsar en primer oficial no hace nada". */
  function ppRefrescarCabecera() {
    try {
      var cont = document.getElementById('pp-chips');
      if (cont) cont.innerHTML = _chipsHtml().map(function (c) {
        return '<span class="pp-chip">' + c + '</span>';
      }).join('');
      // El subtítulo del interruptor de CAFI enseña la frase que se manda: si cambia el
      // rol, tiene que cambiar ahí también.
      var ia = document.getElementById('pp-ia-sub');
      if (ia) ia.textContent = ppContextoIA() || 'Rellena rol, compañía y base';
    } catch (e) {}
  }

  /* Dónde está anclado el reloj AHORA MISMO. Se enseña junto al aviso porque es lo que
     convierte "ojo, puede cambiar" en algo comprobable de un vistazo. */
  function _zonaActual() {
    var z = '', off = 0;
    try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    try { off = -new Date().getTimezoneOffset(); } catch (e) {}
    var signo = off < 0 ? '-' : '+';
    var a = Math.abs(off);
    return {
      zona: z || 'la de este dispositivo',
      desfase: 'UTC' + signo + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0')
    };
  }

  function _avisoHusoHtml() {
    var z = _zonaActual();
    return '<div class="pp-aviso">' +
      '<div class="pp-aviso-t">⚠️ Cambia según dónde estés</div>' +
      '<div class="pp-aviso-b">Las horas salen del reloj de este dispositivo, así que <b>se adaptan al país en el que estés</b>. ' +
      'Si pernoctas en Londres, tu roster se verá una hora antes que en España — y el vuelo es el mismo. ' +
      'Al hablar con la compañía o con otro piloto, usa siempre el zulú.</div>' +
      '<div class="pp-aviso-z">Ahora mismo: <b>' + _esc(z.zona) + '</b> · ' + z.desfase + '</div>' +
    '</div>';
  }

  function _fila(ico, titulo, sub, campo, ph, ancho) {
    return '<div class="pp-row"><div class="pp-ico">' + ico + '</div>' +
      '<div class="pp-lbl"><b>' + _esc(titulo) + '</b><span>' + _esc(sub) + '</span></div>' +
      '<input class="pp-in" id="pp-f-' + campo + '" value="' + _esc(PROFILE[campo]) + '" placeholder="' + _esc(ph) + '"' +
      (ancho ? ' style="width:' + ancho + '"' : '') +
      ' onchange="PilotProfile.save({' + campo + ':this.value})"></div>';
  }

  /* La fila de cargos. El subtítulo dice PARA QUÉ sirve, que es la mitad del
     arreglo: un campo que no explica qué mueve no lo rellena nadie, y si no lo
     rellenan el simulador impartido se sigue cobrando de alumno. */
  var _CARGO_TXT = {
    TRI: ['TRI', 'instructor'],
    TRE: ['TRE', 'examinador'],
    LSC: ['LSC', 'línea'],
    GTI: ['GTI', 'tierra']
  };
  function _filaCargos() {
    var puestos = ppCargos();
    var chips = PP_CARGOS.map(function (c) {
      var on = puestos.indexOf(c) >= 0;
      return '<div class="pp-cargo' + (on ? ' on' : '') + '" role="button" tabindex="0"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
        ' onclick="PilotProfile.toggleCargo(\'' + c + '\');ppRenderScreen()">' +
        _esc(_CARGO_TXT[c][0]) + '<small>' + _esc(_CARGO_TXT[c][1]) + '</small></div>';
    }).join('');
    return '<div class="pp-row" style="border-bottom:none;padding-bottom:5px"><div class="pp-ico">🎓</div>' +
      '<div class="pp-lbl"><b>Cargo en la compañía</b><span>' +
        (puestos.length ? _esc(puestos.join(' · ')) : 'Ninguno · marca los que tengas') +
      '</span></div></div>' +
      '<div class="pp-cargos">' + chips + '</div>' +
      '<div class="pp-note" style="padding-top:0">Con esto puesto, al traerte un simulador del roster al logbook viene ya marcado como <b>impartido</b>. Sin ello se cuenta como formación de alumno — 119,03 € en vez de 800,99 (TRI) o 924,22 (TRE).</div>';
  }

  function ppRenderScreen() {
    ppCss();
    var cont = document.getElementById('pp-screen-body');
    if (!cont) return;
    /* Entrar en la pantalla es el momento en que el piloto MIRA su perfil: es
       cuando tiene que estar al día. `ppCloudPull` lleva su mínimo de 30 s, así
       que entrar y salir no dispara rondas, y cuando algo baja se repinta sola
       (el guardián de reentrada está dentro, no aquí). */
    try { ppCloudPull(); } catch (e) {}
    var u = window.currentUser || {};
    var s = ppStats();
    var foto = ppFoto();
    var ini = (typeof window._getInitials === 'function') ? window._getInitials(u) : 'CP';
    var nombre = PROFILE.nombre || u.name || (typeof window._getFirstName === 'function' ? window._getFirstName(u) : 'Piloto');

    var chips = _chipsHtml();

    var h = '';
    h += '<div class="pp-hero">' +
      '<div class="pp-avw"><div class="pp-av" id="pp-av-big">' +
        (foto ? '<img src="' + foto + '" alt="">' : _esc(ini)) + '</div>' +
      '<label class="pp-edit" for="pp-foto-in">+</label>' +
      '<input type="file" id="pp-foto-in" accept="image/*" style="display:none" onchange="ppOnFoto(event)"></div>' +
      '<div class="pp-name">' + _esc(nombre) + '</div>' +
      '<div class="pp-mail">' + _esc(u.email || '') + '</div>' +
      '<div class="pp-chips" id="pp-chips">' + chips.map(function (c) { return '<span class="pp-chip">' + c + '</span>'; }).join('') + '</div>' +
      '<div class="pp-stats">' +
        '<div class="pp-st"><b>' + (s.horas || '—') + '</b><span>Horas</span></div>' +
        '<div class="pp-st"><b>' + (s.vuelos || '—') + '</b><span>Vuelos</span></div>' +
        '<div class="pp-st"><b>' + (s.aterrizajes || '—') + '</b><span>Aterriz.</span></div>' +
        '<div class="pp-st"><b>' + (s.anios || '—') + '</b><span>Años</span></div>' +
      '</div></div>';

    h += '<div class="pp-sh"><span>Identidad · EASA FCL.050</span><span style="letter-spacing:0;opacity:.8">🔒 solo aquí</span></div><div class="pp-card">' +
      _fila('👤', 'Nombre legal', 'El que se imprime en el logbook', 'nombre', 'Nombre y apellidos', '150px') +
      _fila('🪪', 'Nº de licencia', 'Va en la cabecera del logbook', 'licencia', 'ES.FCL.—', '140px') +
      _fila('🏛️', 'Autoridad', 'Quién la emite', 'autoridad', 'AESA', '90px') +
      // La firma va aquí porque es lo que certifica el logbook ante la autoridad.
      // Se enseña GRANDE, en su recuadro debajo de la fila: es lo que va a salir impreso
      // en el logbook y el piloto tiene que poder mirarla, no adivinarla en una miniatura.
      '<div class="pp-row pp-row-firma"><div class="pp-ico">✍️</div>' +
        '<div class="pp-lbl"><b>Firma</b><span>' +
          (ppFirma() ? 'Se estampa en el PDF exportado' : 'Toca el recuadro para firmar') +
        '</span></div>' +
        (ppFirma() ? '<div class="pp-ok">✓</div>' : '') +
      '</div>' +
      '<div class="pp-sig' + (ppFirma() ? ' hay' : '') + '" onclick="ppFirmaAbrir()">' +
        (ppFirma()
          ? '<img src="' + ppFirma() + '" alt="Tu firma">'
          : '<span>✍️ Firma aquí</span>') +
      '</div>' +
      (ppFirma()
        ? '<div class="pp-firma-acc"><button class="pp-btn-sm" onclick="event.stopPropagation();ppFirmaAbrir()">Rehacer</button>' +
          '<button class="pp-btn-sm danger" onclick="event.stopPropagation();PilotProfile.quitarFirma().then(ppRenderScreen)">Quitar</button></div>'
        : '') +
      '<div class="pp-note">La licencia y la firma se quedan <b>solo en este dispositivo</b>: no se suben a la nube.</div></div>';

    h += '<div class="pp-sh">Trabajo</div><div class="pp-card">' +
      _fila('🏢', 'Compañía', 'Para dietas y pernoctas', 'compania', 'Vueling', '110px') +
      _fila('📍', 'Base', 'Tu aeropuerto base', 'base', 'BCN', '80px') +
      _fila('✈️', 'Flota', 'Qué avión vuelas', 'flota', 'A320 family', '120px') +
      '<div class="pp-row"><div class="pp-ico">🎖️</div>' +
        '<div class="pp-lbl"><b>Rol por defecto</b><span>Al añadir un vuelo nuevo</span></div>' +
        '<select class="pp-in" onchange="PilotProfile.save({rol:this.value})">' +
          '<option value=""' + (!PROFILE.rol ? ' selected' : '') + '>Automático</option>' +
          '<option value="CPT"' + (PROFILE.rol === 'CPT' ? ' selected' : '') + '>Comandante</option>' +
          '<option value="FO"' + (PROFILE.rol === 'FO' ? ' selected' : '') + '>Primer oficial</option>' +
        '</select></div>' +
      _filaCargos() + '</div>';

    h += '<div class="pp-sh">Preferencias</div><div class="pp-card">' +
      '<div class="pp-row"><div class="pp-ico">🗣️</div>' +
        '<div class="pp-lbl"><b>Idioma del briefing</b><span>En qué te habla ARIA</span></div>' +
        '<select class="pp-in" onchange="PilotProfile.save({idioma:this.value})">' +
          '<option value=""' + (!PROFILE.idioma ? ' selected' : '') + '>Automático</option>' +
          '<option value="es"' + (PROFILE.idioma === 'es' ? ' selected' : '') + '>Castellano</option>' +
          '<option value="en"' + (PROFILE.idioma === 'en' ? ' selected' : '') + '>English</option>' +
        '</select></div>' +
      // Sólo cambia cómo se PINTA el roster. El dato sigue en Z, el logbook no se toca
      // (documento EASA) y ARIA tampoco: te habla en zulú y lo dice en cada hora.
      '<div class="pp-row"><div class="pp-ico">🕐</div>' +
        '<div class="pp-lbl"><b>Horas del roster</b><span>' +
          (PROFILE.husoVista === 'local' ? 'En la hora de este dispositivo' : 'En zulú, como la compañía') +
        '</span></div>' +
        '<select class="pp-in" onchange="ppSetHuso(this.value)">' +
          '<option value=""' + (PROFILE.husoVista !== 'local' ? ' selected' : '') + '>Zulú (Z)</option>' +
          '<option value="local"' + (PROFILE.husoVista === 'local' ? ' selected' : '') + '>Local (LT)</option>' +
        '</select></div>' +
      /* El aviso NO es un detalle: la hora sale del dispositivo, así que el MISMO roster se
         ve distinto según dónde estés. Un piloto que pernocta en Londres ve una hora y su
         compañero en Barcelona ve otra, del mismo vuelo. Se dice, y se enseña la zona en la
         que está anclado AHORA, que es lo que despeja la duda cada vez que lo mira. */
      (PROFILE.husoVista === 'local' ? _avisoHusoHtml() : '') +
      '<div class="pp-row"><div class="pp-ico">🤖</div>' +
        '<div class="pp-lbl"><b>CAFI sabe quién eres</b><span id="pp-ia-sub">' +
          (ppContextoIA() ? _esc(ppContextoIA()) : 'Rellena rol, compañía y base') + '</span></div>' +
        '<div class="pp-sw' + (PROFILE.iaContexto ? ' on' : '') + '" onclick="PilotProfile.save({iaContexto:!PilotProfile.data().iaContexto});ppRenderScreen()"><i></i></div></div>' +
      '<div class="pp-note">Con esto encendido, CAFI deja de responder en genérico. Se manda <b>exactamente</b> la frase de arriba, nada más.</div></div>';

    h += '<div class="pp-sh">Tus cosas</div><div class="pp-card">' +
      '<div class="pp-row" onclick="goTo(\'docs\')" style="cursor:pointer"><div class="pp-ico">🗂️</div>' +
        '<div class="pp-lbl"><b>Documentos</b><span>Médico, licencia, habilitaciones…</span></div><div class="pp-arrow">›</div></div>' +
      '<div class="pp-row" onclick="goTo(\'upgrade\')" style="cursor:pointer"><div class="pp-ico">⭐</div>' +
        '<div class="pp-lbl"><b>Plan</b><span>Gestionar suscripción</span></div><div class="pp-arrow">›</div></div>' +
      '<div class="pp-row" onclick="goTo(\'pay\')" style="cursor:pointer"><div class="pp-ico">💶</div>' +
        '<div class="pp-lbl"><b>Datos de nómina</b><span>Especialidad, nivel, IRPF</span></div><div class="pp-arrow">›</div></div></div>';

    if (foto) {
      h += '<div style="text-align:center;padding:16px 0 4px">' +
        '<button onclick="PilotProfile.quitarFoto().then(ppRenderScreen)" style="background:none;border:none;' +
        'color:rgba(244,63,94,.9);font-size:12.5px;cursor:pointer;font-family:inherit">Quitar la foto</button></div>';
    }
    h += '<div style="height:26px"></div>';
    cont.innerHTML = h;
  }

  /* ── Firmar con el dedo ───────────────────────────────────────────────────
     Canvas a resolución real de pantalla (devicePixelRatio) para que el trazo no
     salga pixelado en el PDF, y con Pointer Events, que cubren dedo y ratón sin
     duplicar eventos como pasaba mezclando touch+mouse. */
  var _fzTrazos = 0;
  function ppFirmaAbrir() {
    ppCss();
    var ov = document.getElementById('pp-firma-ov');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'pp-firma-ov';
    ov.innerHTML =
      '<div class="pp-firma-box">' +
        '<div class="pp-firma-t">Firma aquí</div>' +
        '<div class="pp-firma-s">Con el dedo. Es la que irá en el PDF de tu logbook.</div>' +
        '<canvas id="pp-firma-cv"></canvas>' +
        '<div class="pp-firma-btns">' +
          '<button class="pp-btn-sm" onclick="ppFirmaLimpiar()">Borrar</button>' +
          '<button class="pp-btn-sm" onclick="ppFirmaCerrar()">Cancelar</button>' +
          '<button class="pp-btn-sm ok" onclick="ppFirmaGuardar()">Guardar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var cv = document.getElementById('pp-firma-cv');
    var r = cv.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    var cx = cv.getContext('2d');
    cx.scale(dpr, dpr);
    cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.lineJoin = 'round';
    cx.strokeStyle = '#0A1628';
    _fzTrazos = 0;

    var pintando = false, px = 0, py = 0;
    var pos = function (e) {
      var b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault(); pintando = true; _fzTrazos++;
      var p = pos(e); px = p.x; py = p.y;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pintando) return;
      e.preventDefault();
      var p = pos(e);
      cx.beginPath(); cx.moveTo(px, py); cx.lineTo(p.x, p.y); cx.stroke();
      px = p.x; py = p.y;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      cv.addEventListener(ev, function () { pintando = false; });
    });
  }

  function ppFirmaLimpiar() {
    var cv = document.getElementById('pp-firma-cv');
    if (!cv) return;
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    _fzTrazos = 0;
  }

  function ppFirmaCerrar() {
    var ov = document.getElementById('pp-firma-ov');
    if (ov) ov.remove();
  }

  function ppFirmaGuardar() {
    var cv = document.getElementById('pp-firma-cv');
    if (!cv) return;
    if (!_fzTrazos) {
      if (typeof showToast === 'function') showToast('Firma primero', 'info');
      return;
    }
    // Se recorta a lo que se ha dibujado: si no, el PDF recibe un rectángulo con
    // mucho aire y la firma sale diminuta en una esquina.
    var url = _recortar(cv);
    ppSetFirma(url).then(function () {
      ppFirmaCerrar();
      ppRenderScreen();
      if (typeof showToast === 'function') showToast('Firma guardada', 'success');
    }).catch(function (e) {
      if (typeof showToast === 'function') showToast(e.message || 'No se pudo guardar', 'error');
    });
  }

  function _recortar(cv) {
    try {
      var cx = cv.getContext('2d');
      var d = cx.getImageData(0, 0, cv.width, cv.height).data;
      var x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0, hay = false;
      for (var y = 0; y < cv.height; y++) {
        for (var x = 0; x < cv.width; x++) {
          if (d[(y * cv.width + x) * 4 + 3] > 8) {
            hay = true;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      if (!hay) return cv.toDataURL('image/png');
      var m = 6;
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
      x1 = Math.min(cv.width - 1, x1 + m); y1 = Math.min(cv.height - 1, y1 + m);
      var w = x1 - x0 + 1, h = y1 - y0 + 1;
      var out = document.createElement('canvas'); out.width = w; out.height = h;
      out.getContext('2d').drawImage(cv, x0, y0, w, h, 0, 0, w, h);
      return out.toDataURL('image/png');
    } catch (e) { return cv.toDataURL('image/png'); }
  }

  window.ppFirmaAbrir = ppFirmaAbrir;
  window.ppFirmaLimpiar = ppFirmaLimpiar;
  window.ppFirmaCerrar = ppFirmaCerrar;
  window.ppFirmaGuardar = ppFirmaGuardar;

  function ppOnFoto(ev) {
    var f = ev && ev.target && ev.target.files && ev.target.files[0];
    if (!f) return;
    ppSetFoto(f).then(function () {
      ppRenderScreen();
      if (typeof showToast === 'function') showToast('Foto actualizada', 'success');
    }).catch(function (e) {
      if (typeof showToast === 'function') showToast(e.message || 'No se pudo guardar la foto', 'error');
    });
  }

  /* El roster ya sabía pintar en local (RST.useLT + rstFormatTime, con sus sufijos LT/UTC):
     lo que faltaba era que la elección se RECORDARA — era una variable en memoria y volvía
     a Z en cada recarga — y poder cambiarla desde aquí. El botón de la cabecera del roster
     y este selector son ahora la misma preferencia. */
  function ppSetHuso(v) {
    var esLocal = (v === 'local');
    var ref = '';
    if (esLocal) { try { ref = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {} }
    ppSave({ husoVista: esLocal ? 'local' : '', husoRef: ref });
    try { if (typeof window.rstAplicarHuso === 'function') window.rstAplicarHuso(); } catch (e) {}
    ppRenderScreen();
  }
  window.ppSetHuso = ppSetHuso;

  window.ppRenderScreen = ppRenderScreen;
  window.ppOnFoto = ppOnFoto;

  /* ══ EL ALTA DEL PERFIL — el primer login pregunta quién eres ════════════════
     Hasta Beta.813 el perfil nacía VACÍO y la app rellenaba los huecos ella sola:
     el nombre grande de Mi perfil decía «Capitán» y la Especialidad del Pay Check
     nacía en «Comandante (1P)» porque es el primer <option>. Ninguna de las dos
     era una elección del piloto, y desde fuera un valor por defecto y una elección
     se ven exactamente igual — con la diferencia de que del segundo salen tarifas
     del convenio (la invasión de día libre de un CMD son 547,16 € en la franja de
     arriba; la de un FO, otra cifra). Es la familia del avión inventado: un dato
     falso presentado como bueno es peor que no tener ninguno.

     Así que se PREGUNTA, una vez, al entrar. Reglas de la hoja:

     · **El ROL es obligatorio** y no viene preseleccionado. Es justamente el dato
       que la app se estaba inventando: dejar uno marcado de salida reproduciría
       el fallo con otra cara. Lo demás es opcional y se puede completar luego.
     · **Sólo sale si la NUBE ya ha contestado.** El perfil sincroniza entre
       aparatos: preguntando antes del pull, el piloto que ya lo rellenó en el iPad
       vuelve a rellenarlo en el móvil. Es «una bandera vieja no manda sobre la
       aritmética» — aquí, un perfil local vacío que la nube desmiente.
     · **Ni a quien ya lleva tiempo dentro** (ver `_appVirgen`): con roster,
       logbook o notas guardadas no es un primer login, y ahí el rol se deduce
       solo (`_ldDominantRole`) o se pone en Mi perfil, sin pared de por medio.
     · Y **no se guarda a medias**: un solo `ppSave` al final, que es la única
       puerta de escritura del perfil. */
  var ALTA_KEY = 'pilotos_perfil_alta';

  /* ── «Me aparece CADA VEZ» ────────────────────────────────────────────────
     La marca era una fecha suelta en `pilotos_perfil_alta`, y eso la dejaba en
     manos de DOS cosas que la borran a propósito:

     · **`clearAllUserData()` barre las claves `pilotos_*`** — y lo llaman el
       logout, el «cerrar sesión» del menú y el cambio de cuenta. O sea que el
       MISMO piloto que sale y vuelve a entrar era, para esta hoja, un piloto
       nuevo. La marca lleva ahora el UID dentro y la clave está en la lista de
       supervivientes del barrido: sobrevive a un logout, y ante otra cuenta no
       vale, que es justo lo que tiene que pasar.
     · **Se escribía SÓLO al pulsar «Empezar →»**. Quien se la quitaba de encima
       recargando —que es lo que hace cualquiera con una pared que no se puede
       cerrar— se la encontraba otra vez en el arranque siguiente, y en el
       siguiente. Ahora se marca al ABRIRLA: es una bienvenida de una vez, no un
       peaje, y el rol se pone en Mi perfil cuando se quiera. (Es lo mismo que se
       arregló en la guía, que se marcaba al PROGRAMARLA y se quemaba sin que
       nadie la viera: ahí el arreglo fue marcarla al abrirla de verdad. Aquí,
       igual — al abrirla, no antes.) */
  function _uid() {
    try {
      var u = JSON.parse(localStorage.getItem('cafi_auth_user') || '{}');
      return String(u.id || u.email || '');
    } catch (e) { return ''; }
  }
  function ppAltaHecha() {
    try {
      var v = localStorage.getItem(ALTA_KEY);
      if (!v) return false;
      /* Una marca vieja (sin UID) vale para el piloto que ya la tenía: no se le
         puede volver a preguntar por haber cambiado el formato. */
      if (v.charAt(0) !== '{') return true;
      var o = JSON.parse(v);
      return !o.uid || !_uid() || o.uid === _uid();
    } catch (e) { return false; }
  }
  function ppAltaMarca() {
    try { localStorage.setItem(ALTA_KEY, JSON.stringify({ uid: _uid(), at: new Date().toISOString() })); } catch (e) {}
  }

  /* ¿Es de verdad un PRIMER login? Lo pedido es «que en el primer login obligue a
     rellenar el formulario», y un primer login es, por definición, una sesión en
     la que el aparato no guarda todavía nada del piloto. A quien ya tiene su
     roster, su logbook o sus notas de gasto dentro no se le levanta una pared en
     mitad de un arranque cualquiera: lleva tiempo usando la app, y el sitio de
     ese campo es Mi perfil, donde siempre ha estado. Una hoja obligatoria que
     aparece de sorpresa a alguien que sólo venía a mirar su roster es justo la
     clase de emboscada que esta app no hace. */
  var RASTRO = ['pilotOS_logbook_v1', 'pilotOS_roster', 'pilotos_gastos_manual',
                'pilotos_gastos_enviadas', 'pilotos_payProfile', 'pilotos_pay_manual'];
  /* ⚠ ¿EN BLANCO CUÁNDO? — Beta.889
     `ppAltaToca` se decide DESPUÉS de que conteste la nube (el perfil sincroniza
     y preguntando antes se le repetiría la hoja a quien ya la rellenó en el
     iPad). Pero en beta `/api/profile` sale a PRODUCCIÓN, y un Railway
     despertándose tarda segundos — y en esos segundos la app ya está
     restaurando el roster y el logbook de la sesión nueva. Medido con la nube a
     3 s: al decidir, `pilotOS_roster` ya estaba escrito, `_appVirgen()` daba
     FALSO y la hoja **no salía nunca**. Con la nube rápida salía: o sea que lo
     que decidía si un piloto ve la bienvenida era la latencia del servidor.
     Así que se APUNTA al entrar —el instante honesto: «¿estaba en blanco este
     aparato cuando empezó la sesión?»— y la respuesta de la nube ya no puede
     cambiarla. Es «una medida que entra en su propio cálculo se toma en
     REPOSO», del mapa que crecía al rodar. */
  var _VIRGEN_SESION = null;
  function ppNotaVirgen() { _VIRGEN_SESION = _appVirgen(); return _VIRGEN_SESION; }
  function _virgenSesion() { return _VIRGEN_SESION === null ? _appVirgen() : _VIRGEN_SESION; }

  function _appVirgen() {
    try {
      for (var i = 0; i < RASTRO.length; i++) {
        var v = localStorage.getItem(RASTRO[i]);
        if (v && v !== '[]' && v !== '{}' && v !== 'null') return false;
      }
    } catch (e) {}
    return true;
  }

  /* ¿Toca preguntar? Una sola función lo decide: con la respuesta repartida entre
     el arranque y el login acabarían discrepando y la hoja saldría dos veces. */
  function ppAltaToca() {
    if (!_tok()) return false;                       // sin sesión no hay a quién preguntar
    if (PROFILE.rol) return false;                   // ya lo dijo (aquí o en el otro aparato)
    if (ppAltaHecha()) return false;
    if (!_virgenSesion()) return false;              // no es su primer login (apuntado AL ENTRAR)
    if (document.getElementById('pp-alta')) return false;
    return true;
  }

  function ppAltaSiToca() { if (ppAltaToca()) ppAltaAbrir(); }

  function ppAltaCss() {
    if (document.getElementById('pp-alta-style')) return;
    var st = document.createElement('style');
    st.id = 'pp-alta-style';
    var M = "'Space Mono',monospace";
    /* Hoja propia y no `#scr-perfil`: vive colgada de <body> para que salga esté
       el piloto donde esté, así que no puede heredar los tokens de esa pantalla.
       Las dos paletas se declaran aquí — un bloque que cambia de fondo declara
       sus dos temas, y de eso este proyecto ya lleva varias rondas. */
    st.textContent = [
      /* ── LA ESCENA ────────────────────────────────────────────────────────
         El velo es OPACO y pinta su propio amanecer. No es estética: un cristal
         es translúcido por definición, así que el contraste de lo que se lee
         encima depende de lo que haya DETRÁS — y si detrás está la app, depende
         de en qué pantalla estuviera el piloto. Con la escena puesta por
         nosotros el compuesto es el mismo siempre y se puede MEDIR, que es la
         regla del panel opaco de la tarjeta del día aplicada a un cristal.
         Dibujada, no fotografiada: una foto son cientos de KB que hay que
         precachear en el `sw.js` para que exista volando, hay que licenciarla, y
         detrás de un formulario compite con lo que se está leyendo. */
      '#pp-alta{position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;',
      '  justify-content:center;overflow:hidden;padding:0 0 env(safe-area-inset-bottom,0px)}',
      'html:not(.day) #pp-alta{background:#02080F}',
      'html.day #pp-alta{background:#8FCDF0}',
      '#pp-alta .pa-sky{position:absolute;inset:0;overflow:hidden;pointer-events:none}',
      /* ⚠ `pointer-events:none` es FUNCIONAL, no cosmético: el toque en el velo
         se responde con `e.target === ov`, así que una capa que recibiera el
         dedo dejaría el zarandeo MUDO justo donde el piloto toca. */
      'html:not(.day) #pp-alta .pa-sky{background:',
      '  radial-gradient(1px 1px at 12% 9%,rgba(255,255,255,.75),transparent),',
      '  radial-gradient(1px 1px at 78% 6%,rgba(255,255,255,.55),transparent),',
      '  radial-gradient(1.4px 1.4px at 46% 15%,rgba(255,255,255,.65),transparent),',
      '  radial-gradient(1px 1px at 88% 21%,rgba(255,255,255,.45),transparent),',
      '  radial-gradient(1px 1px at 27% 24%,rgba(255,255,255,.40),transparent),',
      '  linear-gradient(180deg,#02080F 0%,#061A2E 34%,#0B2C45 58%,#14415A 76%,#22566A 100%)}',
      'html.day #pp-alta .pa-sky{background:',
      '  linear-gradient(180deg,#7FC4EE 0%,#A9DAF4 40%,#D4EDFA 68%,#F6E3C8 100%)}',
      /* El horizonte: la línea que hace que un degradado parezca una vista. */
      '#pp-alta .pa-hz{position:absolute;left:-8%;right:-8%;top:5.5%;height:1px}',
      'html:not(.day) #pp-alta .pa-hz{background:linear-gradient(90deg,transparent,',
      '  rgba(125,211,252,.45) 20%,rgba(253,224,171,.92) 50%,rgba(125,211,252,.45) 80%,transparent);',
      '  box-shadow:0 0 26px 4px rgba(56,189,248,.26)}',
      'html.day #pp-alta .pa-hz{background:linear-gradient(90deg,transparent,',
      '  rgba(255,255,255,.75) 24%,rgba(255,255,255,.98) 50%,rgba(255,255,255,.75) 76%,transparent);',
      '  box-shadow:0 0 20px 3px rgba(255,255,255,.6)}',
      /* ── LAS LUCES ────────────────────────────────────────────────────────
         RESPIRAN, no parpadean. Tres manchas desenfocadas con periodos primos
         entre sí (13 · 17 · 11 s) para que no se sincronicen nunca: lo que se
         ve es una aurora moviéndose, no un intermitente. Un destello detrás de
         un formulario compite con lo que hay que leer — es la lección de las
         ocho tramas de los tickets, con luz en vez de rayado.
         Sólo se animan `opacity` y `transform`, que los compone la GPU: el
         `blur` es fijo y la capa se cachea. */
      '#pp-alta .pa-glow{position:absolute;border-radius:50%;filter:blur(44px);',
      '  will-change:transform,opacity}',
      /* ⚠ Van DETRÁS del panel, no sobre el trozo de cielo que asoma. La hoja se
         lleva el 92 % del alto, así que unas luces colocadas arriba se ven en
         una franja de dos dedos y el resto del cristal queda negro: un cristal
         sin nada detrás no es un cristal, es un rectángulo oscuro. Puestas aquí,
         lo que el piloto ve es el color ATRAVESANDO el desenfoque, que es de lo
         único que va el glassmorphism. */
      '#pp-alta .g1{width:80vw;height:80vw;left:-26vw;top:-6vh;animation:paGlowA 13s ease-in-out infinite}',
      '#pp-alta .g2{width:70vw;height:70vw;right:-24vw;top:26vh;animation:paGlowB 17s ease-in-out infinite}',
      '#pp-alta .g3{width:100vw;height:44vw;left:-2vw;top:64vh;animation:paGlowC 11s ease-in-out infinite}',
      'html:not(.day) #pp-alta .g1{background:radial-gradient(circle,rgba(34,211,238,.85),transparent 66%)}',
      'html:not(.day) #pp-alta .g2{background:radial-gradient(circle,rgba(99,60,214,.80),transparent 68%)}',
      'html:not(.day) #pp-alta .g3{background:radial-gradient(circle,rgba(251,191,36,.62),transparent 70%)}',
      'html.day #pp-alta .g1{background:radial-gradient(circle,rgba(56,189,248,.82),transparent 66%)}',
      'html.day #pp-alta .g2{background:radial-gradient(circle,rgba(255,255,255,.88),transparent 68%)}',
      'html.day #pp-alta .g3{background:radial-gradient(circle,rgba(253,186,116,.72),transparent 70%)}',
      '@keyframes paGlowA{0%,100%{opacity:.50;transform:translate3d(0,0,0) scale(1)}',
      '  50%{opacity:.86;transform:translate3d(4vw,-5vh,0) scale(1.14)}}',
      '@keyframes paGlowB{0%,100%{opacity:.42;transform:translate3d(0,0,0) scale(1.06)}',
      '  50%{opacity:.78;transform:translate3d(-5vw,4vh,0) scale(.94)}}',
      '@keyframes paGlowC{0%,100%{opacity:.38;transform:translate3d(0,0,0) scale(1)}',
      '  50%{opacity:.72;transform:translate3d(0,-3vh,0) scale(1.1)}}',
      /* ── EL CRISTAL ───────────────────────────────────────────────────────
         Glassmorphism de verdad: desenfoque de lo de detrás, fondo translúcido,
         canto de luz arriba y sombra proyectada. El `backdrop-filter` sale
         barato AQUÍ —esta hoja no tiene bucle de dibujo, se compone una vez—,
         que es el mismo criterio que las píldoras de la carta SIGWX.
         Y la opacidad SUBE hacia abajo a propósito: arriba el texto es grande
         (título a 22px/800) y aguanta cristal fino; abajo están los rótulos de
         10px, y ahí el cristal se cierra. La transparencia se gasta donde no
         cuesta legibilidad. */
      '#pp-alta .pa-in{position:relative;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;',
      '  -webkit-overflow-scrolling:touch;border-radius:28px 28px 0 0;padding:22px 18px calc(24px + env(safe-area-inset-bottom,0px));',
      '  animation:paUp .42s cubic-bezier(.2,.9,.3,1) both;',
      '  -webkit-backdrop-filter:blur(26px) saturate(150%);backdrop-filter:blur(26px) saturate(150%)}',
      '@keyframes paUp{from{transform:translateY(38px);opacity:0}}',
      /* El cristal tiene su PROPIO tinte, como lo tiene uno de verdad: el cian
         de la marca arriba y el violeta en la esquina. Va en el MISMO atajo
         `background` que el degradado — declararlo aparte lo pisaría, que es lo
         del ✦ embaldosado de los campos importados del Pay Check. */
      'html:not(.day) #pp-alta .pa-in{background:',
      '  radial-gradient(130% 42% at 12% 0%,rgba(34,211,238,.26),transparent 62%),',
      '  radial-gradient(120% 34% at 92% 8%,rgba(124,58,237,.24),transparent 64%),',
      '  radial-gradient(150% 26% at 50% 100%,rgba(251,191,36,.10),transparent 62%),',
      '  linear-gradient(180deg,rgba(9,28,48,.52),rgba(6,17,30,.88) 36%,rgba(4,12,22,.95) 64%);',
      '  border-top:1px solid rgba(125,211,252,.34);color:#F0FFFE;',
      '  box-shadow:0 -26px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.17)}',
      'html.day #pp-alta .pa-in{background:',
      '  radial-gradient(130% 42% at 12% 0%,rgba(56,189,248,.24),transparent 62%),',
      '  radial-gradient(120% 34% at 92% 8%,rgba(255,255,255,.55),transparent 64%),',
      '  linear-gradient(180deg,rgba(255,255,255,.58),rgba(250,253,255,.92) 36%,rgba(246,251,255,.97) 64%);',
      '  border-top:1px solid rgba(255,255,255,.92);color:#0A1628;',
      '  box-shadow:0 -26px 70px rgba(8,47,73,.28),inset 0 1px 0 rgba(255,255,255,.95)}',
      /* El destello que cruza el cristal al abrirse. UNA vez, no en bucle: lo
         espectacular es que pase al entrar, no que esté pasando siempre. */
      '#pp-alta .pa-in::before{content:"";position:absolute;top:0;left:-45%;width:38%;height:100%;',
      '  pointer-events:none;background:linear-gradient(105deg,transparent,rgba(255,255,255,.13),transparent);',
      '  animation:paSheen 1.5s cubic-bezier(.4,0,.2,1) .3s 1 both}',
      '@keyframes paSheen{from{transform:translateX(0) skewX(-14deg)}',
      '  to{transform:translateX(420%) skewX(-14deg)}}',
      /* El rótulo lleva su FARO: 6 px que laten cada 2,6 s. Ésta es la única luz
         que se enciende y se apaga de verdad, y por eso es diminuta y lenta —
         un anticolisión, no una alarma. Con `prefers-reduced-motion` se queda
         encendido fijo: sigue siendo la marca, deja de moverse. */
      '#pp-alta .pa-k{font-family:' + M + ';font-size:9.5px;font-weight:700;letter-spacing:1.9px;',
      '  text-transform:uppercase;display:flex;align-items:center;gap:8px}',
      '#pp-alta .pa-k::before{content:"";width:6px;height:6px;border-radius:50%;flex:none;',
      '  background:currentColor;animation:paFaro 2.6s ease-in-out infinite}',
      '@keyframes paFaro{0%,100%{opacity:1;box-shadow:0 0 9px 2px currentColor}',
      '  55%{opacity:.35;box-shadow:0 0 3px 0 currentColor}}',
      'html:not(.day) #pp-alta .pa-k{color:#22D3EE}',
      'html.day #pp-alta .pa-k{color:#075985}',   /* 4,63:1 con #0369A1 y las luces moviéndose detrás: demasiado justo para un rótulo de 9,5 px */
      '#pp-alta .pa-t{font-size:23px;font-weight:800;margin:9px 0 6px;line-height:1.2;letter-spacing:-.3px}',
      '#pp-alta .pa-s{font-size:13px;line-height:1.55;margin-bottom:18px}',
      'html:not(.day) #pp-alta .pa-s{color:rgba(240,255,254,.72)}',
      'html.day #pp-alta .pa-s{color:rgba(15,23,42,.72)}',
      '#pp-alta .pa-lbl{font-family:' + M + ';font-size:9.5px;font-weight:700;letter-spacing:1.4px;',
      '  text-transform:uppercase;margin:0 0 7px;display:flex;align-items:center;gap:7px}',
      'html:not(.day) #pp-alta .pa-lbl{color:rgba(240,255,254,.70)}',
      'html.day #pp-alta .pa-lbl{color:rgba(15,23,42,.70)}',
      '#pp-alta .pa-req{font-size:8.5px;letter-spacing:1px;padding:2px 6px;border-radius:5px;font-weight:800}',
      'html:not(.day) #pp-alta .pa-req{background:rgba(34,211,238,.18);color:#67E8F9}',
      'html.day #pp-alta .pa-req{background:rgba(3,105,161,.14);color:#0C4A6E}',
      /* El rol: dos botones grandes y ninguno marcado de salida. */
      '#pp-alta .pa-rol{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:18px}',
      '#pp-alta .pa-r{border-radius:14px;padding:13px 10px;text-align:center;cursor:pointer;',
      '  font-size:13.5px;font-weight:700;line-height:1.3;touch-action:manipulation;',
      '  transition:transform .13s cubic-bezier(.34,1.56,.64,1),background .15s,border-color .15s}',
      '#pp-alta .pa-r span{display:block;font-family:' + M + ';font-size:9.5px;font-weight:700;',
      '  letter-spacing:1.2px;margin-top:4px;opacity:.72}',
      '#pp-alta .pa-r:active{transform:scale(.97)}',
      'html:not(.day) #pp-alta .pa-r{background:rgba(255,255,255,.05);border:1.5px solid rgba(34,211,238,.22);color:#F0FFFE}',
      'html:not(.day) #pp-alta .pa-r.on{background:rgba(34,211,238,.20);border-color:#22D3EE;color:#ECFEFF}',
      'html.day #pp-alta .pa-r{background:#FFFFFF;border:1.5px solid rgba(2,132,199,.22);color:#0A1628}',
      'html.day #pp-alta .pa-r.on{background:#E0F2FE;border-color:#0369A1;color:#0C4A6E}',
      /* ── El cargo, con los MISMOS botones que el rol de arriba ──────────────
         `.pa-c` sólo cambia la rejilla y el tamaño: el color, los dos temas y el
         estado `.on` los hereda de `.pa-r`. Una paleta propia aquí sería un
         cuarto juego de colores que mantener sincronizado con el de al lado. */
      '#pp-alta .pa-cargos{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:18px}',
      '#pp-alta .pa-c{padding:10px 3px;font-size:13px;min-height:54px;display:flex;',
      '  flex-direction:column;align-items:center;justify-content:center}',
      '#pp-alta .pa-c span{font-size:8.5px;letter-spacing:.5px;margin-top:3px}',
      /* La insignia de opcional: el mismo sitio y forma que el OBLIGATORIO del
         rol, apagada. Sin ella, cuatro botones debajo de un campo obligatorio
         parecen otro campo obligatorio y el piloto se inventa un cargo. */
      '#pp-alta .pa-opc{font-size:8.5px;letter-spacing:1px;padding:2px 6px;border-radius:5px;font-weight:800}',
      'html:not(.day) #pp-alta .pa-opc{background:rgba(240,255,254,.10);color:rgba(240,255,254,.72)}',
      'html.day #pp-alta .pa-opc{background:rgba(15,23,42,.07);color:rgba(15,23,42,.62)}',
      /* Los campos de texto */
      '#pp-alta .pa-f{margin-bottom:13px}',
      '#pp-alta .pa-in-f{width:100%;box-sizing:border-box;border-radius:12px;padding:12px 13px;',
      '  font-family:inherit;font-size:15px;font-weight:600;outline:none}',   /* 15px: por debajo de 16 iOS hace zoom al enfocar */
      'html:not(.day) #pp-alta .pa-in-f{background:rgba(255,255,255,.06);border:1px solid rgba(34,211,238,.20);color:#F0FFFE}',
      'html:not(.day) #pp-alta .pa-in-f::placeholder{color:rgba(240,255,254,.42)}',
      'html.day #pp-alta .pa-in-f{background:#FFFFFF;border:1px solid rgba(2,132,199,.22);color:#0A1628}',
      'html.day #pp-alta .pa-in-f::placeholder{color:rgba(15,23,42,.42)}',
      '#pp-alta .pa-yasta{display:flex;flex-direction:column;gap:2px;border-radius:12px;',
      '  padding:11px 13px;margin-bottom:15px;font-size:13px;font-weight:600}',
      '#pp-alta .pa-yasta span{font-size:10.5px;font-weight:500;opacity:.78}',
      'html:not(.day) #pp-alta .pa-yasta{background:rgba(34,211,238,.10);',
      '  border:1px solid rgba(34,211,238,.26);color:#CFFAFE}',
      'html.day #pp-alta .pa-yasta{background:#ECFEFF;border:1px solid rgba(3,105,161,.22);color:#0C4A6E}',
      '#pp-alta .pa-hint{font-size:10.5px;margin-top:5px;line-height:1.45}',
      /* La pista del rol sube hasta pegarse a su rejilla: con el margen de
         `.pa-rol` en medio parece el encabezado del campo siguiente. */
      '#pp-alta .pa-hrol{margin:-13px 0 18px}',
      'html:not(.day) #pp-alta .pa-hint{color:rgba(240,255,254,.60)}',
      'html.day #pp-alta .pa-hint{color:rgba(15,23,42,.62)}',
      '#pp-alta .pa-go{width:100%;border:none;border-radius:14px;padding:15px;font-family:inherit;',
      '  font-size:15px;font-weight:800;cursor:pointer;margin-top:4px;touch-action:manipulation;',
      '  transition:transform .13s cubic-bezier(.34,1.56,.64,1),opacity .15s}',
      '#pp-alta .pa-go:active{transform:scale(.985)}',
      '#pp-alta .pa-go[disabled]{cursor:default;box-shadow:none}',
      'html:not(.day) #pp-alta .pa-go[disabled]{background:rgba(125,211,252,.13);color:#BAE6FD}',
      'html.day #pp-alta .pa-go[disabled]{background:rgba(3,105,161,.10);color:#075985}',
      'html:not(.day) #pp-alta .pa-go{background:linear-gradient(135deg,#67E8F9,#22D3EE 55%,#0EA5C4);color:#04222C;',
      '  box-shadow:0 10px 30px rgba(34,211,238,.34)}',
      'html.day #pp-alta .pa-go{background:linear-gradient(135deg,#0284C7,#0369A1 60%,#075985);color:#FFFFFF;',
      '  box-shadow:0 10px 28px rgba(3,105,161,.32)}',
      '#pp-alta .pa-pie{font-size:10.5px;text-align:center;margin-top:11px;line-height:1.5}',
      'html:not(.day) #pp-alta .pa-pie{color:rgba(240,255,254,.55)}',
      'html.day #pp-alta .pa-pie{color:rgba(15,23,42,.58)}',
      /* ── EL «NO» ──────────────────────────────────────────────────────────
         La hoja no se puede cerrar sin contestar, y hasta aquí eso era MUDO: el
         piloto tocaba fuera y no pasaba nada, así que «he fallado el blanco» y
         «esto no se cierra» se veían igual. Ahora se zarandea.
         Pero un «no» a secas tampoco dice qué falta, así que el zarandeo va
         SIEMPRE acompañado de resaltar el campo obligatorio — el movimiento
         llama y el resalte explica. */
      '@keyframes paNo{0%,100%{transform:translateX(0)}',
      '  15%{transform:translateX(-9px)}35%{transform:translateX(8px)}',
      '  55%{transform:translateX(-5px)}75%{transform:translateX(3px)}}',
      '#pp-alta .pa-in.no{animation:paNo .42s cubic-bezier(.36,.07,.19,.97)}',
      /* El resalte NO es movimiento: con `prefers-reduced-motion` el zarandeo se
         apaga y esto se queda, que es la mitad que de verdad informa. */
      '#pp-alta .pa-rol.pide .pa-r{border-width:2px}',
      'html:not(.day) #pp-alta .pa-rol.pide .pa-r{border-color:#22D3EE;background:rgba(34,211,238,.10)}',
      'html.day #pp-alta .pa-rol.pide .pa-r{border-color:#0369A1;background:#F0F9FF}',
      '@media (prefers-reduced-motion: reduce){#pp-alta .pa-in{animation:none}',
      '  #pp-alta .pa-in.no{animation:none}',
      '  #pp-alta .pa-in::before{animation:none;opacity:0}',
      '  #pp-alta .pa-glow{animation:none;opacity:.6}',
      '  #pp-alta .pa-k::before{animation:none}',
      '  #pp-alta .pa-r:active,#pp-alta .pa-go:active{transform:none}}'
    ].join('');
    document.head.appendChild(st);
  }

  /* ── LO QUE EL REGISTRO YA PREGUNTÓ ───────────────────────────────────────
     «En el pop up no vuelvas a poner la compañía ni el avión, ya que se ha
     puesto inicialmente en el registro» (11-sep-2026). Y es exacto: la reja de
     acceso tiene su rejilla de compañías (`pag-airline` → `pag_airline`) y su
     selector de flota (`pagSelectFleet` → `pilotos_company`). Preguntarlo otra
     vez dos segundos después no es sólo redundante: le dice al piloto que lo
     que acaba de elegir no se ha guardado.

     Pero tampoco se TIRAN: de la compañía salen las dietas y las pernoctas, y
     de la flota el contexto de CAFI. Se leen de donde el registro las dejó y se
     escriben en el perfil al guardar. Un campo que desaparece de la pantalla y
     un campo que no se ha guardado se ven igual desde fuera. */
  function _delRegistro() {
    var out = { compania: '', flota: '' };
    try { out.compania = localStorage.getItem('pag_airline') || ''; } catch (e) {}
    try {
      var app = JSON.parse(localStorage.getItem('pilotos_company') || '{}') || {};
      out.flota = app.aircraftFull || app.fleet || '';
      if (!out.compania) out.compania = app.companyName || '';
    } catch (e) {}
    return out;
  }

  /* «Vueling · Vueling A320 Family» — `aircraftFull` ya lleva la compañía dentro,
     así que juntarlos a pelo la dice dos veces en la misma línea. */
  function _regEtiqueta(REG) {
    var f = REG.flota || '';
    if (REG.compania && f.toLowerCase().indexOf(REG.compania.toLowerCase() + ' ') === 0)
      f = f.slice(REG.compania.length + 1);
    return [REG.compania, f].filter(Boolean).join(' · ');
  }

  function ppAltaAbrir() {
    ppAltaCss();
    var REG = _delRegistro();
    var ov = document.createElement('div');
    ov.id = 'pp-alta';
    /* Aquí NO se rellena nada de lo que la app deduzca, y no es un olvido: esta
       hoja sólo sale cuando el aparato está en blanco (`_appVirgen`), así que no
       hay logbook del que deducir. Los placeholders son ejemplos, nunca valores:
       un campo que llega relleno sin que nadie lo haya escrito es el mismo
       problema que la hoja viene a arreglar, una talla más pequeña. */
    ov.innerHTML =
      /* La ESCENA, hermana del panel y no hija: el cristal la desenfoca por
         detrás, así que tiene que estar fuera de él. */
      '<div class="pa-sky" aria-hidden="true">' +
        '<i class="pa-glow g1"></i><i class="pa-glow g2"></i><i class="pa-glow g3"></i>' +
        '<i class="pa-hz"></i>' +
      '</div>' +
      '<div class="pa-in" role="dialog" aria-modal="true" aria-labelledby="pa-t">' +
        /* ── LA CABECERA ──────────────────────────────────────────────────
           Tenía cuatro líneas explicando el convenio antes de la primera
           casilla. Es lo primero que ve un piloto que acaba de registrarse, y
           un párrafo no da la bienvenida: la justifica. Lo que el piloto
           necesita arriba es POR QUÉ le preguntamos, en una frase; el detalle
           —que las tarifas cambian con el rango— baja a la pista del propio
           campo, que es donde sirve para decidir. */
        '<div class="pa-k">Bienvenido a bordo</div>' +
        /* «Calibremos» y no «Ajustemos»: el subtítulo de debajo dice «PilotOS
             AJUSTA cada cálculo», así que el título repetía el verbo dos
             líneas más arriba. Y calibrar es lo que de verdad pasa aquí: fijar
             una referencia —el rango— de la que salen las tarifas. */
        '<div class="pa-t" id="pa-t">Calibremos los instrumentos</div>' +
        '<div class="pa-s">Cuéntanos quién vuela y PilotOS ajusta cada cálculo a tu ' +
          'convenio: dietas, pernoctas, horas y nómina.</div>' +

        '<div class="pa-lbl">Tu puesto <span class="pa-req">OBLIGATORIO</span></div>' +
        '<div class="pa-rol">' +
          '<div class="pa-r" data-rol="CPT" onclick="PilotProfile.altaRol(\'CPT\')">Comandante<span>CPT · 1P</span></div>' +
          '<div class="pa-r" data-rol="FO"  onclick="PilotProfile.altaRol(\'FO\')">Primer oficial<span>FO · 2P</span></div>' +
        '</div>' +
        '<div class="pa-hint pa-hrol">De tu rango salen las tarifas del convenio.</div>' +

        /* El CARGO, sin párrafo que lo explique: son cuatro siglas que quien las
           tiene reconoce de un vistazo, y quien no, no marca nada. Lo que hacen
           —que el simulador impartido entre en la nómina por su casilla y no por
           la de alumno— se ve solo la primera vez que se importa una sesión.
           Preguntarlo AQUÍ y no sólo en Mi perfil es lo que hace que funcione
           desde el primer mes: un instructor que no sepa que ese campo existe
           cobra sus sesiones a 119,03 € en vez de a 800,99 o 924,22. */
        '<div class="pa-lbl">Cargo en la compañía <span class="pa-opc">OPCIONAL</span></div>' +
        '<div class="pa-cargos">' +
          PP_CARGOS.map(function (c) {
            return '<div class="pa-r pa-c" data-cargo="' + c + '" role="button" tabindex="0"' +
              ' aria-pressed="false" onclick="PilotProfile.altaCargo(\'' + c + '\')">' +
              _esc(_CARGO_TXT[c][0]) + '<span>' + _esc(_CARGO_TXT[c][1]) + '</span></div>';
          }).join('') +
        '</div>' +

        '<div class="pa-f"><div class="pa-lbl">Tu nombre</div>' +
          '<input class="pa-in-f" id="pa-nombre" autocomplete="name" placeholder="Como quieres que te llamemos" ' +
            'value="' + _esc(PROFILE.nombre || '') + '">' +
          '<div class="pa-hint">Lo usa ARIA para saludarte y va en la cabecera del logbook.</div></div>' +

        '<div class="pa-f"><div class="pa-lbl">Base</div>' +
          '<input class="pa-in-f" id="pa-base" placeholder="BCN" autocapitalize="characters" ' +
            'value="' + _esc(PROFILE.base || '') + '">' +
          '<div class="pa-hint">De ella salen las pernoctas: una noche fuera de base se paga, una en casa no.</div></div>' +

        /* La compañía y la flota NO se preguntan: se eligieron en el registro.
           Se enseñan para que el piloto vea que la app las tiene —callarlas
           dejaría «no me lo ha guardado» y «no hace falta decirlo» con la misma
           cara— y se dice dónde se cambian. */
        (REG.compania || REG.flota
          ? '<div class="pa-yasta">✓ <b>' + _esc(_regEtiqueta(REG)) +
              '</b><span>Lo elegiste al registrarte. Se cambia en Mi perfil.</span></div>'
          : '') +

        '<button class="pa-go" id="pa-go" disabled onclick="PilotProfile.altaGuardar()">Elige tu puesto para empezar</button>' +
        '<div class="pa-pie">Se cambia cuando quieras en <b>Mi perfil</b> · se sincroniza con tus otros dispositivos.</div>' +
      '</div>';
    /* El toque FUERA del panel. `e.target === ov` y no un `closest`: lo que se
       responde es el toque en el velo, no uno que haya burbujeado desde dentro
       —si no, elegir un rol zarandearía la hoja—. */
    ov.addEventListener('click', function (e) { if (e.target === ov) ppAltaZarandea(); });
    /* Y el Escape, que en un teclado es el otro «quítame esto de delante». El
       listener se quita solo cuando la hoja se va: dejarlo vivo sería un listener
       colgado del documento para siempre. */
    /* ⚠ `_onEsc` y NO `_esc`: `_esc` es el escapador de HTML del módulo, y un
       `var _esc` aquí dentro lo SOMBREA — su hoisting lo deja `undefined` para
       toda la función, así que el `.map()` de los cargos, doce líneas más
       arriba, moría con «_esc is not a function». Y en producción no se ve: el
       arranque envuelve esto en un try y la hoja sencillamente no sale.
       Es el `var W = cam.W` que tapaba el `W = window` de la carta SIGWX. */
    var _onEsc = function (e) {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('pp-alta')) { document.removeEventListener('keydown', _onEsc); return; }
      e.preventDefault(); ppAltaZarandea();
    };
    document.addEventListener('keydown', _onEsc);
    document.body.appendChild(ov);
    /* Vista = preguntada. Si sólo se marca al guardar, cerrar la app la deja
       viva para siempre y sale en cada arranque — que es el reporte. */
    ppAltaMarca();
    _ALTA_ROL = '';
    _ALTA_CARGOS = ppCargos();
    _ALTA_CARGOS.forEach(function (c) {
      try {
        var el = ov.querySelector('.pa-c[data-cargo="' + c + '"]');
        if (el) { el.classList.add('on'); el.setAttribute('aria-pressed', 'true'); }
      } catch (e) {}
    });
    ppAltaBoton();
  }

  /* ── «NO SE CIERRA SIN CONTESTAR» ────────────────────────────────────────
     Pedido el 15-sep-2026: «que si el piloto pulsa en otro sitio, haga un
     movimiento diciendo que no».
     Devuelve `true` si había hoja a la que decir que no — eso es lo que deja al
     botón ATRÁS consumir su entrada del historial en vez de navegar: sin ello,
     el atrás de Android se lleva al piloto a otra pantalla (o fuera de la app)
     con la hoja todavía encima, que es la peor de las dos salidas.
     No se re-dispara mientras está sonando: diez toques seguidos darían diez
     animaciones encimadas y ninguna se vería entera. */
  var _altaNoOcupado = false;
  function ppAltaZarandea() {
    var ov = document.getElementById('pp-alta'); if (!ov) return false;
    var caja = ov.querySelector('.pa-in'); if (!caja) return false;
    if (_altaNoOcupado) return true;
    _altaNoOcupado = true;
    /* Y se DICE qué falta. Un zarandeo solo es un «no» sin motivo; lo que el
       piloto necesita saber es que lo que le falta es el puesto. */
    var falta = !_ALTA_ROL;
    var rol = ov.querySelector('.pa-rol');
    if (falta && rol) rol.classList.add('pide');
    caja.classList.add('no');
    setTimeout(function () { caja.classList.remove('no'); _altaNoOcupado = false; }, 460);
    if (falta && rol) setTimeout(function () { rol.classList.remove('pide'); }, 1400);
    return true;
  }

  var _ALTA_ROL = '';
  /* Los cargos ya marcados vienen del perfil, como el nombre y la base: esta hoja
     sale con el aparato en blanco, pero el perfil puede haber bajado de la nube
     desde otro móvil y volver a preguntarlo sería no haberlo guardado. */
  var _ALTA_CARGOS = [];
  function ppAltaCargo(c) {
    c = String(c || '').toUpperCase();
    if (PP_CARGOS.indexOf(c) < 0) return;
    var i = _ALTA_CARGOS.indexOf(c);
    if (i >= 0) _ALTA_CARGOS.splice(i, 1); else _ALTA_CARGOS.push(c);
    try {
      Array.prototype.forEach.call(document.querySelectorAll('#pp-alta .pa-c'), function (el) {
        var on = _ALTA_CARGOS.indexOf(el.getAttribute('data-cargo')) >= 0;
        el.classList.toggle('on', on);
        el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    } catch (e) {}
    /* El botón NO se toca: el cargo es opcional y lo que enciende «Empezar» es el
       rol. Colgarlo de aquí dejaría fuera a los nueve de cada diez pilotos que no
       tienen ninguno. */
  }
  function ppAltaBoton() {
    var b = document.getElementById('pa-go'); if (!b) return;
    b.disabled = !_ALTA_ROL;
    b.textContent = _ALTA_ROL ? 'Empezar →' : 'Elige tu puesto para empezar';
  }
  function ppAltaRol(v) {
    _ALTA_ROL = v;
    try {
      Array.prototype.forEach.call(document.querySelectorAll('#pp-alta .pa-r'), function (el) {
        el.classList.toggle('on', el.getAttribute('data-rol') === v);
      });
    } catch (e) {}
    ppAltaBoton();
  }
  function ppAltaGuardar() {
    if (!_ALTA_ROL) return;                       // el botón ya está apagado; esto es el cinturón
    var val = function (id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
    /* UN solo ppSave: es la única puerta de escritura y además sube a la nube una
       vez en vez de cinco. */
    var REG = _delRegistro();
    ppSave({
      rol: _ALTA_ROL,
      nombre: val('pa-nombre'),
      base: val('pa-base').toUpperCase(),
      /* En el ORDEN de la lista y como CADENA, igual que `ppToggleCargo`: el
         servidor sólo copia string|boolean|number, así que un array se perdería
         sin un solo error. */
      cargos: PP_CARGOS.filter(function (c) { return _ALTA_CARGOS.indexOf(c) >= 0; }).join(','),
      /* Del registro, no de esta hoja. Y sin pisar lo que ya hubiera: si el
         perfil traía compañía de otro aparato, manda esa. */
      compania: PROFILE.compania || REG.compania,
      flota: PROFILE.flota || REG.flota
    });
    ppAltaMarca();
    var ov = document.getElementById('pp-alta'); if (ov) ov.parentNode.removeChild(ov);
    /* Y AHORA LA GUÍA. Pedido así: «que a la primera entrada le obligue a rellenar
       el perfil y luego aparezca la guía». Se avisa desde aquí, en vez de dejar que
       el otro lado espere a que esta hoja desaparezca mirándola de reojo: el orden
       tiene que ser un hecho y no una carrera entre dos temporizadores. La función
       no hace nada si el piloto ya la ha visto. */
    try { if (typeof window.pilotosGuiaPrimeraVez === 'function') window.pilotosGuiaPrimeraVez(); } catch (e) {}
    /* La Especialidad del Pay Check sale de este rol (pcManualApply): sin volver a
       aplicarla, el desplegable se queda en la que tenía y las tarifas del convenio
       serían las de otro rango hasta la siguiente recarga. */
    try { if (typeof window.pcManualApply === 'function') window.pcManualApply(); } catch (e) {}
    try { if (typeof window.ppRenderScreen === 'function' &&
              document.getElementById('pp-screen-body')) ppRenderScreen(); } catch (e) {}
  }

  window.PilotProfile = {
    load: ppLoad, save: ppSave, get: ppGet, data: function () { return PROFILE; },
    clear: ppClear, foto: ppFoto, firma: ppFirma, setFirma: ppSetFirma, quitarFirma: ppQuitarFirma, hydrate: ppHydrate, setFoto: ppSetFoto, quitarFoto: ppQuitarFoto,
    stats: ppStats, contextoIA: ppContextoIA, cloudPull: ppCloudPull,
    altaSiToca: ppAltaSiToca, altaRol: ppAltaRol, altaGuardar: ppAltaGuardar,
    notaVirgen: ppNotaVirgen,
    // Para el banco: saber si TOCA preguntar sin llegar a abrir la hoja.
    altaToca: ppAltaToca,
    cargos: ppCargos, tieneCargo: ppTieneCargo, toggleCargo: ppToggleCargo,
    altaCargo: ppAltaCargo, altaZarandea: ppAltaZarandea
  };
  // Atajo para los lectores de otros módulos: ppGet('rol','FO')
  window.ppGet = ppGet;
  /* El logbook vive en OTRO bloque <script> y desde allí esto se lee. Si no se
     exporta explícitamente vale `undefined` siempre y la preselección del rol de
     un simulador «no hace nada», sin un solo error — window.RST_IATA_ICAO. */
  /* Lo llama el manejador del botón ATRÁS, que vive en index.html: sin exportar
     sería `undefined` allí y el atrás volvería a navegar con la hoja puesta. */
  window.ppAltaZarandea = ppAltaZarandea;
  window.pilotosCargos = ppCargos;
  window.pilotosTieneCargo = ppTieneCargo;

  ppLoad();
  /* Al arrancar se BAJA lo que haya en la nube. Sin esto el perfil sólo subía:
     el aparato nuevo se quedaba en blanco para siempre. Va detrás de la carga
     local y sin bloquear — sin red se queda lo de aquí y no se pierde nada. */
  function _arranca() {
    try { ppHydrate(); } catch (e) {}
    /* El alta se decide DESPUÉS de que conteste la nube, nunca antes: el perfil
       sincroniza entre aparatos y preguntando de entrada el piloto que ya lo
       rellenó en el iPad tendría que volver a rellenarlo en el móvil. Sin red el
       fetch falla enseguida y se pregunta igual, que es lo correcto: aquí no hay
       nada que sepamos y no podemos quedarnos callados. */
    /* Se apunta ANTES de pedir la nube: mientras ella contesta, el arranque ya
       está restaurando roster y logbook, y entonces «primer login» dependería de
       lo que tardara el servidor. */
    var virgen = ppNotaVirgen();
    var p = null;
    try { p = ppCloudPull(true); } catch (e) {}
    var decide = function () {
      try { ppAltaSiToca(); } catch (e) {}
      /* Y si NO hay alta que rellenar, la guía de la primera vez entra igual: el
         piloto que creó la cuenta y cerró la app antes de verla se quedaba sin
         ella para siempre, porque sólo se lanzaba desde el login. Sólo en un
         aparato en blanco — a quien lleva meses dentro no se le abre la guía de
         bienvenida en un arranque cualquiera. */
      try {
        if (virgen && !document.getElementById('pp-alta') &&
            typeof window.pilotosGuiaPrimeraVez === 'function') window.pilotosGuiaPrimeraVez();
      } catch (e) {}
    };
    try {
      (p && p.then ? p : Promise.resolve(null))
        .catch(function () { return null; })
        .then(decide);
    } catch (e) { decide(); }
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _arranca);
    else _arranca();
  } catch (e) {}
  /* Y al VOLVER a entrar en la pantalla, y al volver del segundo plano: en una PWA
     que se queda abierta días —el iPad— la única sincronización sería la del
     arranque. Es la misma lección que Gastos, con su mínimo de 30 s dentro. */
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') ppCloudPull();
    });
  } catch (e) {}
})();
