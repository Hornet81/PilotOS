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
    idioma: '',         // es | en   -> manda sobre ARIA (era el #RM4KZ de Marc)
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
      return dataUrl;
    });
  }

  function ppQuitarFirma() {
    return _avDel('firma').then(function () {
      _firmaCache = null;
      ppSave({ tieneFirma: false });
      return true;
    });
  }

  // ── Nube: se apoya en user_settings, que YA existe (no hace falta tabla nueva).
  // La licencia y la autoridad NO viajan: se quedan en el dispositivo.
  function ppCloudPush() {
    try {
      var token = (typeof lsGet === 'function') ? lsGet('cafi_auth_token', '') : '';
      if (!token || typeof ldBackendUrl !== 'function') return;
      var envio = {};
      Object.keys(PROFILE).forEach(function (k) {
        if (k === 'licencia' || k === 'autoridad') return;   // sensibles: solo local
        envio[k] = PROFILE[k];
      });
      fetch(ldBackendUrl() + '/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ profile: envio })
      }).catch(function () {});
    } catch (e) {}
  }

  function ppCloudPull() {
    try {
      var token = (typeof lsGet === 'function') ? lsGet('cafi_auth_token', '') : '';
      if (!token || typeof ldBackendUrl !== 'function') return Promise.resolve(null);
      return fetch(ldBackendUrl() + '/api/profile', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || !j.profile) return null;
          // El de la nube no pisa lo que ya haya en este dispositivo si está relleno.
          var cambios = {};
          Object.keys(j.profile).forEach(function (k) {
            if (k in PROFILE && !PROFILE[k] && j.profile[k]) cambios[k] = j.profile[k];
          });
          if (Object.keys(cambios).length) ppSave(cambios);
          return PROFILE;
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

  function _fila(ico, titulo, sub, campo, ph, ancho) {
    return '<div class="pp-row"><div class="pp-ico">' + ico + '</div>' +
      '<div class="pp-lbl"><b>' + _esc(titulo) + '</b><span>' + _esc(sub) + '</span></div>' +
      '<input class="pp-in" id="pp-f-' + campo + '" value="' + _esc(PROFILE[campo]) + '" placeholder="' + _esc(ph) + '"' +
      (ancho ? ' style="width:' + ancho + '"' : '') +
      ' onchange="PilotProfile.save({' + campo + ':this.value})"></div>';
  }

  function ppRenderScreen() {
    ppCss();
    var cont = document.getElementById('pp-screen-body');
    if (!cont) return;
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
        '</select></div></div>';

    h += '<div class="pp-sh">Preferencias</div><div class="pp-card">' +
      '<div class="pp-row"><div class="pp-ico">🗣️</div>' +
        '<div class="pp-lbl"><b>Idioma del briefing</b><span>En qué te habla ARIA</span></div>' +
        '<select class="pp-in" onchange="PilotProfile.save({idioma:this.value})">' +
          '<option value=""' + (!PROFILE.idioma ? ' selected' : '') + '>Automático</option>' +
          '<option value="es"' + (PROFILE.idioma === 'es' ? ' selected' : '') + '>Castellano</option>' +
          '<option value="en"' + (PROFILE.idioma === 'en' ? ' selected' : '') + '>English</option>' +
        '</select></div>' +
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

  window.ppRenderScreen = ppRenderScreen;
  window.ppOnFoto = ppOnFoto;

  window.PilotProfile = {
    load: ppLoad, save: ppSave, get: ppGet, data: function () { return PROFILE; },
    clear: ppClear, foto: ppFoto, firma: ppFirma, setFirma: ppSetFirma, quitarFirma: ppQuitarFirma, hydrate: ppHydrate, setFoto: ppSetFoto, quitarFoto: ppQuitarFoto,
    stats: ppStats, contextoIA: ppContextoIA, cloudPull: ppCloudPull
  };
  // Atajo para los lectores de otros módulos: ppGet('rol','FO')
  window.ppGet = ppGet;

  ppLoad();
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { ppHydrate(); });
    else ppHydrate();
  } catch (e) {}
})();
