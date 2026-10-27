/* ═══════════════════════════════════════════════════════════════════════════
   PLAZOS · la pantalla — cuadro del Home, «Avisos y plazos» y la campana

   El cálculo vive en `plazos.js` y aquí sólo se pinta. Tres sitios:

   · El CUADRO DEL SLIDER del Home (#dh-plazo-chip): un cuadro más del
     slider de estadísticas. Con un plazo abierto que te afecta y no has marcado
     como hecho dice cuál y cuánto queda (rojo y cuenta atrás en las últimas
     48 h); sin ninguno, el próximo que abre. Tocarlo abre la hoja.
   · La HOJA de Avisos, que pasa a ser «Avisos y plazos» con tres pestañas
     (Ahora · Próximos · Historial) y un ⚙ con qué te avisamos. Es la MISMA
     hoja del avatar en ámbar: una sola bandeja, no una tercera con otro
     nombre.
   · La CAMPANA: cada plazo abierto es una fuente más del registro
     (`pilotosAvisosFuente`). Su id cambia de fase al entrar en las últimas 48 h,
     así que el avatar vuelve a encenderse cuando de verdad urge — y sólo ahí.

   «✓ Hecho» apaga ese plazo en los tres sitios y se puede deshacer: un aviso
   que se calla por un toque sin querer y no vuelve es dinero perdido.

   ⚠ La cuenta atrás va contra `cierra`, que en el ROFF es el PRIMER momento
   del cierre aleatorio. Contra `fin` diría que queda un día cuando a partir
   de las 12:00 la puja puede haberse cerrado ya.

   ⚠ Todo lo que se pinta aquí va con translate="no": los textos salen
   compuestos en los dos idiomas desde `plazos.js` (llevan el mes y la hora
   dentro y no hay clave de diccionario que pueda casarlos).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var P = window.Plazos;
  if (!P) return;

  var K_REGLAS = 'pilotos_plazos_reglas_v2';   /* v2: tira la copia con la puja de ROFF de enero */
  var K_HECHOS = 'pilotos_plazos_hechos';
  var K_PREFS  = 'pilotos_plazos_prefs';
  /* Lo NUEVO de la campana: {id: cuándo se vio por primera vez}. -1 = «Entendido». */
  var K_NUEVO  = 'pilotos_avisos_nuevo';
  var NUEVO_MS = 24 * 3600e3;
  var TIPOS = ['programacion', 'roff', 'vacaciones', 'xoff', 'reduccion', 'retribucion'];
  var URGE_MS = P.URGE_MS;                 // últimas 48 h: rojo, cuenta atrás y la campana vuelve a sonar
  var AHORA_LIMITE_MS = P.AHORA_LIMITE_MS; // un plazo «hasta el día D» entra en Ahora a 45 días
  /* Los dos números viven en plazos.js: el servidor decide con ellos cuándo
     manda el push, y la pantalla cuándo se pone roja. Tienen que ser los mismos. */

  function lang() { return window.pilotosLang === 'en' ? 'en' : 'es'; }
  function en() { return lang() === 'en'; }
  function T(es, eng) { return en() ? eng : es; }
  function lee(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
  function guarda(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  /* ⚠ «Entendido» es de UNA cuenta y sobrevive al logout (ver `clearAllUserData`).
     Antes era un objeto plano que el logout borraba: se volvía a entrar y la
     campana repetía todos los avisos ya despachados. El formato viejo —claves de
     aviso en la raíz— se toma como del piloto que está dentro. */
  function _avUid() { try { var u = JSON.parse(localStorage.getItem('cafi_auth_user') || '{}'); return String(u.id || u.email || ''); } catch (e) { return ''; } }
  /* Basta mirar el primer valor: en el formato viejo son números (cuándo se vio,
     o -1 si «Entendido»); en el nuevo, el mapa de cada cuenta. Vacío = nuevo. */
  function _esMapaPorUid(o) {
    var ks = Object.keys(o || {});
    if (!ks.length) return true;
    return !!(o[ks[0]] && typeof o[ks[0]] === 'object');
  }
  function leeNuevo() {
    var raw = lee(K_NUEVO, {}) || {};
    if (!_esMapaPorUid(raw)) return raw;                 // formato viejo
    return raw[_avUid()] || {};
  }
  function guardaNuevo(m) {
    var raw = lee(K_NUEVO, {}) || {};
    var cont = _esMapaPorUid(raw) ? raw : {};
    cont[_avUid()] = m;
    guarda(K_NUEVO, cont);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ── Reglas: la tabla manda; la copia del módulo, si no contesta ──────────
  function reglas() {
    var c = lee(K_REGLAS, null);
    if (!(c && c.reglas && c.reglas.length)) return { reglas: P.REGLAS_DEFECTO, excepciones: [], copia: true };
    var fx = P.retirada || function (r) { return !r || r.activo === false; };
    return { at: c.at, reglas: c.reglas.filter(function (r) { return !fx(r); }), excepciones: c.excepciones || [] };
  }
  var _cargando = false;
  /* Dos orígenes, como `/api/ics*`: el que sirve la página (en beta es el backend
     de beta, que ya tiene la ruta) y luego el configurado. Una ruta nueva nace
     rota en beta si sólo se pregunta al de producción. */
  function cargaReglas(forzar) {
    var c = lee(K_REGLAS, null);
    if (!forzar && c && c.at && Date.now() - c.at < 6 * 36e5) return Promise.resolve(false);
    if (_cargando) return Promise.resolve(false);
    _cargando = true;
    var orig = [];
    try { orig.push(location.origin); } catch (e) {}
    try { if (typeof window.ldBackendUrl === 'function') orig.push(window.ldBackendUrl()); } catch (e) {}
    orig = orig.filter(function (o, i) { return o && /^https?:/.test(o) && orig.indexOf(o) === i; });
    var i = 0;
    function prueba() {
      if (i >= orig.length) { _cargando = false; return false; }
      var o = orig[i++];
      return fetch(o + '/api/plazos', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function (j) {
        if (!j || !Array.isArray(j.reglas) || !j.reglas.length) throw new Error('vacío');
        try { localStorage.removeItem('pilotos_plazos_reglas'); } catch (e) {}
        guarda(K_REGLAS, { at: Date.now(), reglas: j.reglas, excepciones: j.excepciones || [] });
        _cargando = false;
        pinta();
        return true;
      }).catch(prueba);
    }
    return prueba();
  }

  // ── Perfil y preferencias ──────────────────────────────────────────────
  function perfil() {
    var g = typeof window.ppGet === 'function' ? window.ppGet : function () { return ''; };
    var red = String(g('reducciones', '') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return { patron: g('patron', '') || '', reducciones: red };
  }
  function prefs() {
    var p = lee(K_PREFS, {}) || {};
    var out = {};
    TIPOS.forEach(function (t) { out[t] = p[t] !== false; });
    out.patron = false; out.estacionalidad = false;   // apagados también en la tabla
    return out;
  }
  function hechos() { return lee(K_HECHOS, {}) || {}; }
  function emailOn() { return (lee(K_PREFS, {}) || {}).email === true; }

  // ── Fase 2 · el servidor tiene que saber lo que has hecho ──────────────
  /* Hechos, preferencias y email viajan a la nube: el avisador del servidor los
     lee para no mandarte un push de algo que marcaste en el otro aparato, y así
     sobreviven al logout (que barre las claves `pilotos_*`). Gana la copia más
     nueva ENTERA — por `at`, como el perfil de nómina. */
  var K_TS = 'pilotos_plazos_ts';
  function token() {
    try { if (typeof window.ldAuthHeaders === 'function') return window.ldAuthHeaders(); } catch (e) {}
    try { var t = localStorage.getItem('cafi_auth_token'); return t && t !== 'demo-bypass-token' ? t.replace(/^"|"$/g, '') : null; } catch (e) { return null; }
  }
  function origenes() {
    var o = [];
    try { o.push(location.origin); } catch (e) {}
    try { if (typeof window.ldBackendUrl === 'function') o.push(window.ldBackendUrl()); } catch (e) {}
    return o.filter(function (x, i) { return x && /^https?:/.test(x) && o.indexOf(x) === i; });
  }
  /* Dos orígenes, como `/api/plazos`: las rutas nuevas nacen rotas en beta si
     sólo se pregunta a producción. Un 404 o un fallo de red pasa al siguiente;
     cualquier otra respuesta es LA respuesta. */
  function api(ruta, opts) {
    var o = origenes(), i = 0, tk = token();
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    if (tk) h.Authorization = 'Bearer ' + tk;
    function prueba(ultimo) {
      if (i >= o.length) return Promise.reject(ultimo || new Error('sin_red'));
      var base = o[i++];
      return fetch(base + ruta, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' })
        .then(function (r) {
          if (r.status === 404) return prueba(new Error('404'));
          return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || r.status); e.status = r.status; throw e; } return j; });
        }, function (e) { return prueba(e); });
    }
    return prueba();
  }
  var _subeT = null;
  function tocaEstado() {
    guarda(K_TS, Date.now());
    clearTimeout(_subeT);
    _subeT = setTimeout(subeEstado, 700);
  }
  function subeEstado() {
    if (!token()) return Promise.resolve(false);
    var raw = lee(K_PREFS, {}) || {};
    return api('/api/plazos/estado', { method: 'POST', body: { hechos: hechos(), prefs: raw, email: raw.email === true, at: +lee(K_TS, 0) || Date.now() } })
      .then(function () { return true; }, function (e) { console.warn('[plazos] no se ha podido subir el estado', e && e.message); return false; });
  }
  var _traidoAt = 0;
  function traeEstado(forzar) {
    if (!token() || (!forzar && Date.now() - _traidoAt < 60000)) return Promise.resolve(false);
    _traidoAt = Date.now();
    return api('/api/plazos/estado').then(function (j) {
      var e = j && j.estado, local = +lee(K_TS, 0) || 0;
      if (e && (+e.at || 0) > local) {
        guarda(K_HECHOS, e.hechos || {});
        var pr = e.prefs || {}; pr.email = !!e.email; guarda(K_PREFS, pr);
        guarda(K_TS, +e.at);
        pinta();
        if (abierta()) hoja(_tab);
        try { window.pilotosAvisosCargar && window.pilotosAvisosCargar(); } catch (er) {}
        return true;
      }
      if (local && (!e || local > (+e.at || 0))) subeEstado();
      return false;
    }, function () { return false; });
  }
  function abierta() { var ov = document.getElementById('av-ov'); return !!(ov && ov.classList.contains('av-open')); }

  // ── Fase 2 · push con la app cerrada ────────────────────────────────────
  function esIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function instalada() {
    try { if (window.matchMedia && matchMedia('(display-mode: standalone)').matches) return true; } catch (e) {}
    return navigator.standalone === true;
  }
  /* 'sesion' · 'ios' (hay que añadirla a inicio) · 'no' · 'denegado' · 'activo' · 'inactivo' */
  function estadoPush() {
    if (!token()) return Promise.resolve({ e: 'sesion' });
    var hay = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!hay) return Promise.resolve({ e: esIOS() && !instalada() ? 'ios' : 'no' });
    if (Notification.permission === 'denied') return Promise.resolve({ e: 'denegado' });
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg || !reg.pushManager) return { e: 'no' };
      return reg.pushManager.getSubscription().then(function (sub) { return { e: sub ? 'activo' : 'inactivo', sub: sub, reg: reg }; });
    }).catch(function () { return { e: 'no' }; });
  }
  function b64aBytes(b) {
    var p = '='.repeat((4 - b.length % 4) % 4), s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
  }
  /* Se llama DENTRO del toque: iOS sólo deja pedir el permiso desde un gesto. */
  function activaPush() {
    var permiso = Notification.requestPermission();
    return Promise.resolve(permiso).then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied' ? 'denegado' : 'sin_permiso');
      return Promise.all([api('/api/push/clave'), navigator.serviceWorker.ready]);
    }).then(function (r) {
      var clave = b64aBytes(r[0].publicKey), reg = r[1];
      var sus = function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave }); };
      return sus().catch(function () {
        /* Una suscripción vieja con OTRA clave hace fallar la nueva: se quita y se repite. */
        return reg.pushManager.getSubscription().then(function (v) { return v ? v.unsubscribe() : null; }).then(sus);
      });
    }).then(function (sub) {
      return api('/api/push/alta', { method: 'POST', body: { subscription: sub.toJSON() } });
    });
  }
  function desactivaPush() {
    return estadoPush().then(function (st) {
      if (!st.sub) return;
      var ep = st.sub.endpoint;
      return st.sub.unsubscribe().then(function () { return api('/api/push/baja', { method: 'POST', body: { endpoint: ep } }).catch(function () {}); });
    });
  }
  var _pushMsg = '';
  /* «Enviar prueba» / «Probar el correo» sólo en BETA (decisión del piloto,
     10-oct-2026). Mismo gate que el botón de reportar: lo dice el backend. */
  function esBeta() { try { return typeof window.rcambEsBeta === 'function' ? window.rcambEsBeta() : window.__pilotosBeta === true; } catch (e) { return false; } }
  function pushHtml(st) {
    var bt = function (k, t, cl) { return '<button type="button" class="plz-pb' + (cl ? ' ' + cl : '') + '" data-plz-push="' + k + '">' + esc(t) + '</button>'; };
    var x;
    if (st.e === 'activo') x = '<div class="plz-pst ok">' + svg('ok', 'currentColor', 14) + esc(T('Activas en este dispositivo', 'On for this device')) + '</div>' +
      '<div class="plz-pbs">' + (esBeta() ? bt('prueba', T('Enviar prueba', 'Send a test')) : '') + bt('off', T('Desactivar', 'Turn off'), 'sec') + '</div>';
    else if (st.e === 'inactivo') x = '<div class="plz-pst">' + esc(T('Desactivadas en este dispositivo.', 'Off on this device.')) + '</div>' +
      '<div class="plz-pbs">' + bt('on', T('Activar notificaciones', 'Turn on notifications')) + (emailOn() && esBeta() ? bt('prueba', T('Probar el correo', 'Test the email'), 'sec') : '') + '</div>';
    else if (st.e === 'denegado') x = '<div class="plz-pst">' + esc(T('Las has bloqueado para PilotOS. Se vuelven a permitir en los ajustes del navegador (en iPhone: Ajustes › Notificaciones › PilotOS).',
      'You blocked them for PilotOS. Allow them again in your browser settings (on iPhone: Settings › Notifications › PilotOS).')) + '</div>';
    else if (st.e === 'ios') x = '<div class="plz-pst">' + esc(T('En iPhone y iPad sólo llegan con PilotOS en la pantalla de inicio: Compartir › Añadir a pantalla de inicio, ábrela desde el icono y vuelve aquí.',
      'On iPhone and iPad they only arrive with PilotOS on your Home Screen: Share › Add to Home Screen, open it from the icon and come back here.')) + '</div>';
    else if (st.e === 'sesion') x = '<div class="plz-pst">' + esc(T('Entra en tu cuenta para activarlas.', 'Sign in to turn them on.')) + '</div>';
    else x = '<div class="plz-pst">' + esc(T('Este navegador no admite notificaciones.', 'This browser does not support notifications.')) + '</div>';
    return x + (_pushMsg ? '<div class="plz-pmsg">' + esc(_pushMsg) + '</div>' : '');
  }
  function pintaPush() {
    var el = document.getElementById('plz-push'), ban = document.getElementById('plz-ban');
    if (!el && !ban) return Promise.resolve();
    return estadoPush().then(function (st) {
      if (el) el.innerHTML = pushHtml(st);
      /* La invitación de arriba sólo cuando activarlas está a un toque (o a un
         «añádela a inicio» de distancia) y el piloto no la ha descartado. */
      if (ban) {
        var ver = (st.e === 'inactivo' || st.e === 'ios') && !lee('pilotos_plazos_ban_no', false);
        ban.hidden = !ver;
        if (ver) ban.innerHTML = '<div class="plz-bt">' + svg('reloj', '#67E8F9', 18) + '<span>' + esc(st.e === 'ios'
          ? T('Para recibirlos con la app cerrada, añade PilotOS a la pantalla de inicio.', 'To get these with the app closed, add PilotOS to your Home Screen.')
          : T('Recíbelos aunque tengas la app cerrada.', 'Get them even with the app closed.')) + '</span></div>' +
          '<div class="plz-pbs">' + (st.e === 'inactivo' ? '<button type="button" class="plz-pb" data-plz-push="on">' + esc(T('Activar', 'Turn on')) + '</button>' : '') +
          '<button type="button" class="plz-pb sec" data-plz-push="ban-no">' + esc(T('Ahora no', 'Not now')) + '</button></div>';
      }
    });
  }
  function accionPush(k) {
    _pushMsg = '';
    if (k === 'ban-no') { guarda('pilotos_plazos_ban_no', true); return pintaPush(); }
    var p = k === 'on' ? activaPush().then(function () { _pushMsg = T('Listo: te avisaremos aunque la app esté cerrada.', 'Done: you will be notified even with the app closed.'); })
      : k === 'off' ? desactivaPush().then(function () { _pushMsg = T('Desactivadas en este dispositivo.', 'Turned off on this device.'); })
      : api('/api/push/prueba', { method: 'POST', body: { email: emailOn() } }).then(function (r) {
        r = r || {};
        /* Una frase por canal: «el push llegó» y «el correo no» no pueden verse igual. */
        var m = [];
        if (r.aparatos) m.push(r.ok ? T('Push enviado: debería llegarte en unos segundos.', 'Push sent: it should arrive in a few seconds.')
          : T('El push no ha llegado a ningún aparato. Desactívalas y vuelve a activarlas.', 'The push reached no device. Turn them off and on again.'));
        if (r.email === 'ok') m.push(T('Correo enviado a ' + r.correo + '. Si no lo ves, mira en spam.', 'Email sent to ' + r.correo + '. If you do not see it, check spam.'));
        else if (r.email === 'espera') m.push(T('El correo de prueba ya salió hace menos de un minuto.', 'The test email went out less than a minute ago.'));
        else if (r.email === 'sin_correo') m.push(T('Tu cuenta no tiene correo guardado.', 'Your account has no email saved.'));
        else if (r.email) m.push(T('No se ha podido enviar el correo de prueba.', 'The test email could not be sent.'));
        _pushMsg = m.join(' ') || T('No hay nada activado a lo que mandar la prueba.', 'Nothing is turned on to send the test to.');
      });
    return p.catch(function (e) {
      var m = e && e.message;
      _pushMsg = m === 'denegado' ? T('Has rechazado el permiso. Se vuelve a dar en los ajustes del navegador.', 'You declined. Allow it again in your browser settings.')
        : m === 'sin_permiso' ? T('No se ha dado el permiso.', 'Permission was not granted.')
        : T('No se ha podido: ' + (m || 'error') + '. Vuelve a intentarlo con cobertura.', 'Could not do it: ' + (m || 'error') + '. Try again with signal.');
    }).then(pintaPush);
  }


  // ── La lista ────────────────────────────────────────────────────────────
  function lista(ahora) {
    var r = reglas();
    var occ = P.ocurrencias(r.reglas, { desde: ahora - 90 * 864e5, hasta: ahora + 200 * 864e5,
      perfil: perfil(), tipos: prefs(), excepciones: r.excepciones });
    var H = hechos(), g = { ahora: [], proximos: [], historial: [] };
    occ.forEach(function (o) {
      o.estado = P.estado(o, ahora);
      o.hecho = !!H[o.clave];
      o.urge = (o.estado === 'abierto' && o.cierra - ahora < URGE_MS) || o.estado === 'aleatorio';
      if (o.estado === 'cerrado') { if (ahora - o.fin < 90 * 864e5) g.historial.push(o); return; }
      if (o.estado === 'proximo' || (o.abre == null && o.clase !== 'hito' && o.cierra - ahora > AHORA_LIMITE_MS)) g.proximos.push(o);
      else if (o.clase === 'hito') g.proximos.push(o);
      else (o.hecho ? g.historial : g.ahora).push(o);
    });
    g.ahora.sort(function (a, b) { return (b.urge - a.urge) || (a.cierra - b.cierra); });
    g.historial.sort(function (a, b) { return b.fin - a.fin; });
    return g;
  }

  // ── Iconos dibujados (nunca un carácter: la luna de las pernoctas) ───────
  var IC = {
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2"/>',
    roff: '<path d="M3 9h18M8 3v4M16 3v4"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M9 15l2 2 4-4"/>',
    vacaciones: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    xoff: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/><path d="M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/>',
    reduccion: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M14.5 20c0-2 1.2-3.6 3-3.6s3 1.6 3 3.6"/>',
    retribucion: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10.5v3M18 10.5v3"/>',
    programacion: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M12 18.5v-5.5M9.5 15.5L12 13l2.5 2.5"/>',
    reloj: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>'
  };
  function svg(k, col, w) {
    return '<svg width="' + (w || 18) + '" height="' + (w || 18) + '" viewBox="0 0 24 24" fill="none" stroke="' + (col || 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.reloj) + '</svg>';
  }
  function nivel(o) { return o.urge ? 'urge' : (o.estado === 'proximo' || o.clase === 'hito' ? 'prox' : 'abre'); }

  // ── Estilos. La hoja tiene DOS paletas (noche oscura, día clara): su fondo
  //    cambia con el tema, así que se declaran las dos. Fondos OPACOS para que el
  //    contraste se pueda medir leyendo estilos. Los cuatro tonos de trámite
  //    tienen su versión de día, más oscura: los de noche sobre blanco no llegan
  //    a 4,5:1. El cuadro del Home (#dh-plazo-chip) sigue con una sola. ──
  function css() {
    if (document.getElementById('plz-style')) return;
    var M = '"Space Grotesk",-apple-system,sans-serif';
    var s = [
      /* La hoja de Avisos */
      '#av-sheet .plz-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}',
      '#av-sheet .plz-top h3{margin:0}',
      '#av-sheet .plz-gear{width:44px;height:44px;border-radius:12px;background:#0F1F35;border:1px solid #1E3A5F;color:#CBD5E1;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '#av-sheet .plz-tabs{display:flex;background:#0F1F35;border:1px solid #1E3A5F;border-radius:12px;padding:3px;margin-bottom:12px}',
      '#av-sheet .plz-tabs button{flex:1;min-height:40px;border:none;background:none;border-radius:9px;color:#A9BDD3;font:700 13px ' + M + ';cursor:pointer}',
      '#av-sheet .plz-tabs button.on{background:#1C3B5A;color:#F1F5F9}',
      '#av-sheet .plz-tabs em{font-style:normal;display:inline-block;min-width:18px;margin-left:5px;padding:0 5px;border-radius:9px;background:#FCA5A5;color:#3B0A12;font-size:11px}',
      '#av-sheet .plz-sec{font-size:10.5px;font-weight:800;letter-spacing:1.3px;color:#A9BDD3;margin:14px 2px 8px}',
      /* Cada trámite tiene SU tono (--c) y lo urgente lo dice la FORMA: el chip
         rojo con el punto que late y la cuenta atrás. Con cuatro tonos de
         categoría, pintar además el fondo de rojo/ámbar por estado haría que un
         plazo de vacaciones y uno que cierra mañana se confundieran. */
      /* El gris por defecto va ANTES: con la misma especificidad, el que va
         detrás gana, y declarado después pintaba de gris los cuatro trámites. */
      '.plz-it,.plz-tli,.plz-fc,.plz-lane{--c:#94A3B8}',
      '.plz-c-programacion{--c:#FACC15}.plz-c-roff{--c:#2DD4BF}.plz-c-xoff{--c:#F472B6}.plz-c-vacaciones{--c:#FB923C}.plz-c-reduccion{--c:#A78BFA}.plz-c-retribucion{--c:#15AFFE}',
      '.plz-it{position:relative;display:flex;gap:11px;padding:12px 12px 12px 15px;margin-bottom:9px;background-color:#0F1F35;background-image:linear-gradient(100deg,color-mix(in srgb,var(--c) 13%,transparent),transparent 48%);border:1px solid color-mix(in srgb,var(--c) 28%,#1E3A5F);border-radius:14px;overflow:hidden}',
      '.plz-it:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--c);box-shadow:0 0 10px var(--c)}',
      '.plz-it.urge{border-color:#7F2A3A}',
      '.plz-it.hecho{background-color:#0C1A2B;background-image:none}',
      '.plz-it.hecho:before{box-shadow:none;opacity:.5}',
      '.plz-ic{width:36px;height:36px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--c);background:color-mix(in srgb,var(--c) 17%,#0A1628);border:1px solid color-mix(in srgb,var(--c) 30%,transparent)}',
      '.plz-k{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:10px;font-weight:800;letter-spacing:1.1px;color:var(--c);margin-bottom:2px}',
      '.plz-st{display:inline-flex;align-items:center;gap:5px;font-size:9.5px;letter-spacing:.6px;padding:1px 7px;border-radius:8px;border:1px solid currentColor}',
      '.plz-st.urge{color:#FCA5A5}',
      '.plz-pulse{width:7px;height:7px;border-radius:50%;background:#FCA5A5;animation:plzPulse 1.8s infinite}',
      '@keyframes plzPulse{0%{box-shadow:0 0 0 0 rgba(252,165,165,.7)}70%{box-shadow:0 0 0 7px rgba(252,165,165,0)}100%{box-shadow:0 0 0 0 rgba(252,165,165,0)}}',
      /* El filtro: una ficha por trámite, con su color y lo que tiene abierto */
      '#av-sheet .plz-flt{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px;margin-bottom:10px}',
      '#av-sheet .plz-flt::-webkit-scrollbar{display:none}',
      '#av-sheet .plz-fc{flex:0 0 auto;display:flex;align-items:center;gap:7px;min-height:42px;padding:0 13px 0 9px;border-radius:21px;border:1px solid color-mix(in srgb,var(--c) 34%,#1E3A5F);background:color-mix(in srgb,var(--c) 9%,#0F1F35);color:#E2E8F0;font:700 13px ' + M + ';cursor:pointer}',
      '#av-sheet .plz-fc.todo{--c:#E2E8F0}',
      '#av-sheet .plz-fc .dt{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--c);background:color-mix(in srgb,var(--c) 20%,transparent)}',
      '#av-sheet .plz-fc .n{font-size:11px;min-width:18px;padding:1px 5px;border-radius:9px;text-align:center;color:var(--c);background:color-mix(in srgb,var(--c) 22%,transparent)}',
      '#av-sheet .plz-fc.on{background:var(--c);border-color:var(--c);color:#0A1628;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 22%,transparent),0 8px 22px -8px var(--c)}',
      '#av-sheet .plz-fc.on .dt,#av-sheet .plz-fc.on .n{color:#0A1628;background:rgba(10,22,40,.16)}',
      '#av-sheet .plz-fc:focus-visible{outline:2px solid #F1F5F9;outline-offset:2px}',
      /* La cinta del año: una línea por trámite y la raya de HOY */
      '#av-sheet .plz-yr{background:#0F1F35;border:1px solid #1E3A5F;border-radius:14px;padding:11px 0 9px 12px;margin-bottom:12px;overflow:hidden}',
      '#av-sheet .plz-yr-t{display:flex;justify-content:space-between;font-size:10.5px;font-weight:800;letter-spacing:1.3px;color:#A9BDD3;margin:0 12px 2px 0}',
      '#av-sheet .plz-yr-t b{color:#E2E8F0;letter-spacing:.3px}',
      /* Se mueve con el dedo: pan-x para la cinta, pan-y para que la hoja siga
         rodando si el gesto es vertical. El fundido de la derecha dice que hay más. */
      '#av-sheet .plz-sc{overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;touch-action:pan-x pan-y;scrollbar-width:none;padding:18px 26px 2px 0;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 30px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 30px),transparent)}',
      '#av-sheet .plz-sc::-webkit-scrollbar{display:none}',
      '#av-sheet .plz-in{position:relative;width:300%;min-width:720px}',
      '#av-sheet .plz-lanes{position:relative}',
      '#av-sheet .plz-lane{display:grid;grid-template-columns:52px 1fr;gap:8px;align-items:center;height:28px;transition:opacity .25s}',
      /* Sticky y OPACA: tapa lo que pasa por debajo al mover la cinta. */
      '#av-sheet .plz-lane .k{position:sticky;left:0;z-index:2;height:22px;display:flex;align-items:center;justify-content:center;border-radius:0 11px 11px 0;font-size:10px;font-weight:800;letter-spacing:.5px;color:var(--c);background:color-mix(in srgb,var(--c) 16%,#0F1F35);box-shadow:8px 0 10px -6px #0F1F35}',
      '#av-sheet .plz-lane.off{opacity:.18}',
      '#av-sheet .plz-trk{position:relative;height:10px;border-radius:5px;background:repeating-linear-gradient(90deg,transparent 0 calc(100% / 12 - 1px),rgba(148,163,184,.22) calc(100% / 12 - 1px) calc(100% / 12)),#132A45}',
      '#av-sheet .plz-seg{position:absolute;top:0;height:100%;min-width:6px;border-radius:5px;background:var(--c);box-shadow:0 0 9px color-mix(in srgb,var(--c) 60%,transparent)}',
      '#av-sheet .plz-pin{position:absolute;top:50%;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;border-radius:50%;background:#0F1F35;border:3px solid var(--c);box-shadow:0 0 8px color-mix(in srgb,var(--c) 55%,transparent)}',
      '#av-sheet .plz-hoy{position:absolute;z-index:1;top:-4px;bottom:-4px;width:2px;margin-left:-1px;border-radius:1px;background:#F1F5F9;box-shadow:0 0 8px rgba(255,255,255,.5)}',
      '#av-sheet .plz-hoy:after{content:attr(data-t);position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:800;color:#F1F5F9}',
      '#av-sheet .plz-mes{display:grid;grid-template-columns:60px repeat(12,1fr);margin-top:6px;font-size:10px;font-weight:800;letter-spacing:.6px;color:#A9BDD3}',
      '#av-sheet .plz-mes span{padding-left:4px}',
      '#av-sheet .plz-yr-h{font-size:11.5px;color:#A9BDD3;margin:8px 12px 0 0}',
      /* «Fechas de …»: la consulta de un trámite. Plegable (details) y abierta
         por defecto; cada fila, una hoja de calendario + la frase en claro. */
      '#av-sheet .plz-info{background:#0F1F35;border:1px solid color-mix(in srgb,var(--c) 40%,#1E3A5F);border-radius:14px;margin-bottom:12px;overflow:hidden}',
      '#av-sheet .plz-info>summary{list-style:none;display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 12px;cursor:pointer}',
      '#av-sheet .plz-info>summary::-webkit-details-marker{display:none}',
      '#av-sheet .plz-ii{width:32px;height:32px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--c);background:color-mix(in srgb,var(--c) 18%,#0A1628)}',
      '#av-sheet .plz-it2{flex:1;min-width:0;font-size:14px;font-weight:800;color:#F1F5F9}',
      '#av-sheet .plz-it2 small{display:block;font-size:11px;font-weight:600;color:#A9BDD3;margin-top:1px}',
      '#av-sheet .plz-iv{width:9px;height:9px;border-right:2px solid #A9BDD3;border-bottom:2px solid #A9BDD3;transform:rotate(45deg);margin:-4px 6px 0 0;transition:transform .2s}',
      '#av-sheet .plz-info[open] .plz-iv{transform:rotate(-135deg);margin-top:4px}',
      '#av-sheet .plz-ifl{padding:0 12px 6px}',
      '#av-sheet .plz-ifa{font-size:12px;line-height:1.45;color:#FCD34D;padding:0 12px 8px}',
      '#av-sheet .plz-if{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-top:1px solid #1E3A5F}',
      '#av-sheet .plz-ifd{width:46px;flex-shrink:0;border-radius:10px;overflow:hidden;text-align:center;background:#0A1628;border:1px solid color-mix(in srgb,var(--c) 45%,#1E3A5F)}',
      '#av-sheet .plz-ifd b{display:block;font-size:18px;line-height:1;padding:7px 0 4px;color:#F1F5F9}',
      '#av-sheet .plz-ifd span{display:block;font-size:9.5px;font-weight:800;letter-spacing:.6px;padding:3px 0;color:#0A1628;background:var(--c)}',
      '#av-sheet .plz-ift{flex:1;min-width:0}',
      '#av-sheet .plz-ifn{font-size:13px;font-weight:800;color:#F1F5F9}',
      '#av-sheet .plz-iff{font-size:13px;font-weight:700;color:var(--c);margin-top:2px}',
      '#av-sheet .plz-ifx{font-size:11.5px;line-height:1.45;color:#A9BDD3;margin-top:3px}',
      '#av-sheet .plz-ifp{display:flex;flex-wrap:wrap;align-items:center;gap:5px 8px;font-size:10.5px;color:#A9BDD3;margin-top:6px}',
      '#av-sheet .plz-ifs{font-weight:800;color:#FCD34D}',
      '#av-sheet .plz-ife{font-size:10.5px;font-weight:800;line-height:1.25;padding:3px 8px;border-radius:9px;color:#E2E8F0;background:#16304F}',
      '#av-sheet .plz-ife.on{color:#0A1628;background:var(--c)}',
      '#av-sheet .plz-ife.urge{color:#3B0A12;background:#FCA5A5}',
      '#av-sheet .plz-if.ajena .plz-ifd{opacity:.6}',
      '#av-sheet .plz-ifo>summary{min-height:44px;display:flex;align-items:center;font-size:12px;font-weight:800;color:#CBD5E1;border-top:1px solid #1E3A5F;cursor:pointer}',
      '@media (prefers-reduced-motion:reduce){.plz-pulse{animation:none}#av-sheet .plz-lane{transition:none}}',
      '.plz-tx{flex:1;min-width:0}',
      '.plz-t{font-size:13.5px;font-weight:800;color:#F1F5F9}',
      '.plz-s{font-size:12.5px;line-height:1.45;color:#CBD5E1;margin-top:3px}',
      '.plz-d{font-size:11.5px;line-height:1.45;color:#A9BDD3;margin-top:3px}',
      '.plz-bar{height:5px;border-radius:3px;background:#1E3A5F;margin-top:8px;overflow:hidden}',
      '.plz-bar i{display:block;height:100%;border-radius:3px;background:var(--c)}',
      '.plz-it.urge .plz-bar i{background:#FCA5A5}',
      '.plz-w{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:#A9BDD3}',
      '.plz-ok{min-height:36px;padding:0 11px;border-radius:9px;background:none;border:1px solid #2F7D57;color:#86EFAC;font:700 12px ' + M + ';cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap}',
      '.plz-ok.des{border-color:#475569;color:#CBD5E1}',
      '.plz-tl{border-left:2px solid #1E3A5F;margin-left:7px}',
      '.plz-tli{position:relative;padding:4px 4px 12px 18px}',
      '.plz-tli:before{content:"";position:absolute;left:-7px;top:8px;width:12px;height:12px;border-radius:50%;background:#0A1628;border:2px solid var(--c);box-shadow:0 0 8px color-mix(in srgb,var(--c) 70%,transparent)}',
      '.plz-tli .d{font-size:11px;font-weight:800;letter-spacing:.8px;color:var(--c)}',
      '.plz-tli .t{font-size:13px;font-weight:700;color:#F1F5F9;margin-top:2px}',
      '.plz-tli .s{font-size:11.5px;color:#A9BDD3;margin-top:2px;line-height:1.4}',
      '.plz-vacio{padding:18px 6px;text-align:center;font-size:13px;line-height:1.6;color:#A9BDD3}',
      '.plz-cfg{background:#0F1F35;border:1px solid #1E3A5F;border-radius:13px;padding:6px 12px;margin-bottom:12px}',
      '.plz-cfg label{display:flex;align-items:center;justify-content:space-between;min-height:46px;font-size:13.5px;font-weight:700;color:#F1F5F9;border-bottom:1px solid #1E3A5F;cursor:pointer}',
      '.plz-cfg label:last-of-type{border-bottom:none}',
      '.plz-cfg input{width:20px;height:20px;accent-color:#22D3EE}',
      '.plz-cfg p{font-size:12px;line-height:1.5;color:#A9BDD3;margin:8px 0 6px}',
      '.plz-ct{font-size:10.5px;font-weight:800;letter-spacing:1.3px;color:#A9BDD3;margin:8px 0 6px}',
      '.plz-push{padding:2px 0 8px;border-bottom:1px solid #1E3A5F}',
      '.plz-pst{display:flex;gap:6px;align-items:flex-start;font-size:12.5px;line-height:1.5;color:#E2E8F0;margin:4px 0 8px}',
      '.plz-pst.ok{color:#86EFAC;font-weight:700}',
      '.plz-pbs{display:flex;gap:8px;flex-wrap:wrap}',
      '.plz-cfg .plz-pb,.plz-ban .plz-pb{min-height:44px;padding:0 14px;border-radius:11px;background:#E0F2FE;border:none;color:#0C4A6E;font:800 13px ' + M + ';cursor:pointer;margin:0}',
      '.plz-cfg .plz-pb.sec,.plz-ban .plz-pb.sec{background:#0B1220;border:1px solid #475569;color:#F1F5F9}',
      '.plz-pmsg{font-size:12px;line-height:1.45;color:#FCD34D;margin-top:8px}',
      '.plz-ban{background:#0E2A3F;border:1px solid #1F5673;border-radius:13px;padding:11px 12px;margin-bottom:10px}',
      '.plz-ban[hidden]{display:none!important}',
      '.plz-bt{display:flex;gap:9px;align-items:center;font-size:13px;font-weight:700;line-height:1.4;color:#F1F5F9;margin-bottom:9px}',
      '.plz-cfg button{min-height:40px;padding:0 12px;border-radius:10px;background:#16304F;border:1px solid #2A4562;color:#F1F5F9;font:700 12.5px ' + M + ';cursor:pointer;margin-bottom:6px}',
      /* ── NUEVO: arriba del todo y en grande. Es lo primero que se ve al abrir.
         Lo que late es un halo aparte (opacidad), nunca el texto: el contraste no
         puede depender del instante en que se mire. ── */
      '.plz-nvc{--c:#94A3B8}',
      '.plz-nvc.plz-c-programacion{--c:#FACC15}.plz-nvc.plz-c-roff{--c:#2DD4BF}.plz-nvc.plz-c-xoff{--c:#F472B6}.plz-nvc.plz-c-vacaciones{--c:#FB923C}.plz-nvc.plz-c-reduccion{--c:#A78BFA}.plz-nvc.plz-c-retribucion{--c:#15AFFE}.plz-nvc.gen{--c:#22D3EE}',
      '#plz-nuevo{margin-bottom:14px}',
      '#plz-nuevo[hidden]{display:none!important}',
      '.plz-nvh{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:800;letter-spacing:1.4px;color:#FFFFFF;margin:2px 2px 9px}',
      '.plz-nvh b{min-width:20px;padding:1px 6px;border-radius:10px;background:#FCA5A5;color:#3B0A12;text-align:center;letter-spacing:0}',
      '.plz-nvdot{width:9px;height:9px;border-radius:50%;background:#FCA5A5;animation:plzPulse 1.6s infinite}',
      '.plz-nvc{position:relative;padding:14px 14px 12px;margin-bottom:10px;border-radius:16px;border:1.5px solid var(--c);background-color:#0A1628;background-image:linear-gradient(135deg,color-mix(in srgb,var(--c) 34%,#0A1628),color-mix(in srgb,var(--c) 10%,#0A1628) 75%);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 18%,transparent),0 16px 34px -14px color-mix(in srgb,var(--c) 75%,transparent);overflow:hidden;animation:plzNvIn .45s cubic-bezier(.22,1,.36,1) both}',
      '.plz-nvc:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 2px var(--c),inset 0 0 26px color-mix(in srgb,var(--c) 45%,transparent);opacity:0;animation:plzNvHalo 2.6s ease-in-out infinite}',
      '.plz-nvc:after{content:"";position:absolute;top:0;bottom:0;left:0;width:45%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent);transform:translateX(-120%);animation:plzNvBrillo 1.6s .35s ease-out 2}',
      /* El brillo y el halo van DEBAJO del contenido: pasando por encima, un 75 % de blanco sobre el texto lo dejaba en 2,2:1 mientras cruzaba. */
      '.plz-nvc>*{position:relative;z-index:1}',
      '@keyframes plzNvIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:none}}',
      '@keyframes plzNvHalo{0%,100%{opacity:0}50%{opacity:1}}',
      '@keyframes plzNvBrillo{to{transform:translateX(330%)}}',
      '.plz-nvb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px}',
      '.plz-nvbg{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:9px;background:var(--c);color:#04121F;font-size:10.5px;font-weight:800;letter-spacing:.8px}',
      '.plz-nvc.urge .plz-nvbg{background:#FCA5A5;color:#3B0A12}',
      '.plz-nvbg .plz-pulse{background:#04121F;animation:none}',
      '.plz-nvc.urge .plz-nvbg .plz-pulse{background:#B91C1C;animation:plzPulse 1.4s infinite}',
      '.plz-nvk{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;letter-spacing:1px;color:#F1F5F9}',
      '.plz-nvk svg{color:var(--c)}',
      '.plz-nvt{font-size:17px;line-height:1.25;font-weight:800;color:#FFFFFF}',
      '.plz-nvs{font-size:13px;line-height:1.45;color:#E2E8F0;margin-top:4px;word-break:break-word}',
      '.plz-nvcd{display:inline-block;margin-top:8px;font-size:14px;font-weight:800;color:#FFFFFF;font-variant-numeric:tabular-nums}',
      '.plz-nva{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}',
      '.plz-nva button{min-height:44px;padding:0 14px;border-radius:11px;font:800 13px ' + M + ';cursor:pointer;display:flex;align-items:center;gap:6px}',
      '.plz-nva .plz-ok{margin:0;background:#86EFAC;border:none;color:#052E16}',
      '.plz-nva .plz-nvir{background:var(--c);border:none;color:#04121F}',
      '.plz-nva .plz-nvx{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.32);color:#F1F5F9}',
      '@media (prefers-reduced-motion:reduce){.plz-nvc,.plz-nvc:after{animation:none}.plz-nvc:before{animation:none;opacity:.7}.plz-nvdot{animation:none}}',
      'html.day .plz-nvc{--c:#334155}',
      'html.day .plz-nvc.plz-c-programacion{--c:#6B5400}html.day .plz-nvc.plz-c-roff{--c:#0B5F57}html.day .plz-nvc.plz-c-xoff{--c:#9D1448}html.day .plz-nvc.plz-c-vacaciones{--c:#A33A07}html.day .plz-nvc.plz-c-reduccion{--c:#4C1D95}html.day .plz-nvc.plz-c-retribucion{--c:#076697}html.day .plz-nvc.gen{--c:#0E7490}',
      'html.day .plz-nvh{color:#0B2545}',
      'html.day .plz-nvh b{background:#B91C1C;color:#FFFFFF}',
      'html.day .plz-nvdot{background:#DC2626}',
      'html.day .plz-nvc{background-color:#FFFFFF;background-image:linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,#FFFFFF),color-mix(in srgb,var(--c) 6%,#FFFFFF) 75%);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 16%,transparent),0 16px 30px -14px color-mix(in srgb,var(--c) 80%,transparent)}',
      'html.day .plz-nvc:after{background:linear-gradient(100deg,transparent,rgba(255,255,255,.75),transparent)}',
      'html.day .plz-nvbg{color:#FFFFFF}',
      'html.day .plz-nvbg .plz-pulse{background:#FFFFFF}',
      'html.day .plz-nvc.urge .plz-nvbg{background:#B91C1C;color:#FFFFFF}',
      'html.day .plz-nvc.urge .plz-nvbg .plz-pulse{background:#FFFFFF}',
      'html.day .plz-nvk{color:color-mix(in srgb,var(--c) 72%,#000)}',
      'html.day .plz-nvt{color:#0B2545}',
      'html.day .plz-nvs{color:#13233C}',
      'html.day .plz-nvcd{color:color-mix(in srgb,var(--c) 72%,#000)}',
      'html.day .plz-nva .plz-ok{background:#15803D;color:#FFFFFF}',
      'html.day .plz-nva .plz-nvir{color:#FFFFFF}',
      'html.day .plz-nva .plz-nvx{background:#FFFFFF;border-color:#94A3B8;color:#0F172A}',
      /* ── MODO DÍA ── el gris por defecto otra vez ANTES de los cuatro tonos */
      'html.day .plz-it,html.day .plz-tli,html.day .plz-fc,html.day .plz-lane{--c:#334155}',
      'html.day .plz-c-programacion{--c:#6B5400}html.day .plz-c-roff{--c:#0B5F57}html.day .plz-c-xoff{--c:#9D1448}html.day .plz-c-vacaciones{--c:#A33A07}html.day .plz-c-reduccion{--c:#4C1D95}html.day .plz-c-retribucion{--c:#076697}',
      'html.day #av-sheet .plz-gear{background:rgba(255,255,255,.55);border-color:rgba(255,255,255,.85);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);box-shadow:0 6px 16px -8px rgba(8,76,97,.45);color:#334155}',
      'html.day #av-sheet .plz-tabs{background:rgba(255,255,255,.42);border-color:rgba(255,255,255,.85);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%)}',
      'html.day #av-sheet .plz-tabs button{color:#334155}',
      'html.day #av-sheet .plz-tabs button.on{background:#0B2545;color:#FFFFFF;box-shadow:0 6px 14px -6px rgba(11,37,69,.6)}',
      'html.day #av-sheet .plz-tabs em{background:#B91C1C;color:#FFFFFF}',
      'html.day #av-sheet .plz-sec{color:#334155}',
      'html.day .plz-it{background-color:color-mix(in srgb,var(--c) 22%,rgba(255,255,255,.5));background-image:linear-gradient(135deg,rgba(255,255,255,.62),rgba(255,255,255,.1) 58%),radial-gradient(130% 150% at 100% 0%,color-mix(in srgb,var(--c) 30%,transparent),transparent 62%);border-color:rgba(255,255,255,.8);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);box-shadow:0 14px 30px -16px color-mix(in srgb,var(--c) 85%,transparent),inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 color-mix(in srgb,var(--c) 22%,transparent)}',
      'html.day .plz-it:before{box-shadow:0 0 6px color-mix(in srgb,var(--c) 45%,transparent)}',
      'html.day .plz-it.urge{border-color:#E08585}',
      'html.day .plz-it.hecho{background-color:rgba(241,245,249,.62);background-image:none;box-shadow:none}',
      'html.day .plz-ic{background:rgba(255,255,255,.6);border-color:rgba(255,255,255,.9)}',
      /* Sobre el cristal teñido de SU color, el rótulo del trámite en su tono a
         pelo se quedaba cerca de 4:1: se oscurece sin cambiar de tono. */
      'html.day .plz-k{color:color-mix(in srgb,var(--c) 72%,#000)}',
      'html.day .plz-st.urge{color:#991B1B}',
      'html.day .plz-pulse{background:#DC2626}',
      'html.day #av-sheet .plz-fc{border-color:color-mix(in srgb,var(--c) 45%,rgba(255,255,255,.7));background:color-mix(in srgb,var(--c) 14%,rgba(255,255,255,.55));-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);color:#0B2545}',
      'html.day #av-sheet .plz-fc.todo{--c:#0B2545}',
      'html.day #av-sheet .plz-fc .dt{background:color-mix(in srgb,var(--c) 12%,transparent)}',
      'html.day #av-sheet .plz-fc .n{background:color-mix(in srgb,var(--c) 12%,transparent)}',
      'html.day #av-sheet .plz-fc.on{background:var(--c);border-color:var(--c);color:#FFFFFF;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 18%,transparent),0 8px 18px -10px var(--c)}',
      'html.day #av-sheet .plz-fc.on .dt,html.day #av-sheet .plz-fc.on .n{color:#FFFFFF;background:rgba(255,255,255,.22)}',
      'html.day #av-sheet .plz-fc:focus-visible{outline-color:#0F172A}',
      'html.day #av-sheet .plz-yr{background:rgba(255,255,255,.4);border-color:rgba(255,255,255,.85);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);box-shadow:0 12px 28px -16px rgba(8,76,97,.55),inset 0 1px 0 rgba(255,255,255,.95)}',
      'html.day #av-sheet .plz-lane .k{color:color-mix(in srgb,var(--c) 75%,#000);background:color-mix(in srgb,var(--c) 14%,#FFFFFF);box-shadow:8px 0 10px -6px rgba(255,255,255,.7)}',
      'html.day #av-sheet .plz-yr-t{color:#334155}',
      'html.day #av-sheet .plz-yr-t b{color:#0F172A}',
      'html.day #av-sheet .plz-lane.off{opacity:.22}',
      'html.day #av-sheet .plz-trk{background:repeating-linear-gradient(90deg,transparent 0 calc(100% / 12 - 1px),rgba(11,37,69,.18) calc(100% / 12 - 1px) calc(100% / 12)),rgba(11,37,69,.10)}',
      'html.day #av-sheet .plz-seg{box-shadow:0 2px 6px -1px color-mix(in srgb,var(--c) 60%,transparent)}',
      'html.day #av-sheet .plz-pin{background:#FFFFFF}',
      'html.day #av-sheet .plz-hoy{background:#0F172A;box-shadow:none}',
      'html.day #av-sheet .plz-hoy:after{color:#0F172A}',
      'html.day #av-sheet .plz-mes{color:#24344D}',
      'html.day #av-sheet .plz-yr-h{color:#24344D}',
      'html.day #av-sheet .plz-info{background:color-mix(in srgb,var(--c) 12%,rgba(255,255,255,.5));border-color:rgba(255,255,255,.85);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);box-shadow:0 12px 28px -16px color-mix(in srgb,var(--c) 75%,transparent),inset 0 1px 0 rgba(255,255,255,.95)}',
      'html.day #av-sheet .plz-ii{color:#FFFFFF;background:var(--c)}',
      'html.day #av-sheet .plz-it2{color:#0B2545}',
      'html.day #av-sheet .plz-it2 small,html.day #av-sheet .plz-ifx,html.day #av-sheet .plz-ifp{color:#24344D}',
      'html.day #av-sheet .plz-iv{border-color:#24344D}',
      'html.day #av-sheet .plz-ifa{color:#7C2D12}',
      'html.day #av-sheet .plz-if{border-top-color:rgba(11,37,69,.12)}',
      'html.day #av-sheet .plz-ifd{background:#FFFFFF;border-color:color-mix(in srgb,var(--c) 40%,#FFFFFF);box-shadow:0 4px 10px -6px color-mix(in srgb,var(--c) 70%,transparent)}',
      'html.day #av-sheet .plz-ifd b{color:#0B2545}',
      'html.day #av-sheet .plz-ifd span{color:#FFFFFF}',
      'html.day #av-sheet .plz-ifn{color:#0B2545}',
      'html.day #av-sheet .plz-iff{color:color-mix(in srgb,var(--c) 72%,#000)}',
      'html.day #av-sheet .plz-ifs{color:#7C2D12}',
      'html.day #av-sheet .plz-ife{color:#24344D;background:rgba(255,255,255,.7)}',
      'html.day #av-sheet .plz-ife.on{color:#FFFFFF;background:var(--c)}',
      'html.day #av-sheet .plz-ife.urge{color:#FFFFFF;background:#B91C1C}',
      'html.day #av-sheet .plz-ifo>summary{color:#24344D;border-top-color:rgba(11,37,69,.12)}',
      'html.day .plz-t{color:#0B2545}',
      'html.day .plz-s{color:#13233C}',
      'html.day .plz-d,html.day .plz-w{color:#24344D}',
      'html.day .plz-bar{background:rgba(11,37,69,.12)}',
      'html.day .plz-it.urge .plz-bar i{background:#DC2626}',
      'html.day .plz-ok{background:rgba(255,255,255,.62);border-color:#15803D;color:#14532D}',
      'html.day .plz-ok.des{background:rgba(255,255,255,.62);border-color:#94A3B8;color:#334155}',
      'html.day .plz-tl{border-left-color:rgba(11,37,69,.3)}',
      'html.day .plz-tli:before{background:#FFFFFF;box-shadow:0 0 5px color-mix(in srgb,var(--c) 40%,transparent)}',
      'html.day .plz-tli .t{color:#0F172A}',
      'html.day .plz-tli .s,html.day .plz-vacio{color:#334155}',
      'html.day .plz-cfg{background:rgba(255,255,255,.62);border-color:rgba(255,255,255,.85);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%)}',
      'html.day .plz-cfg label{color:#0F172A;border-bottom-color:#E2E8F0}',
      'html.day .plz-cfg input{accent-color:#0E7490}',
      'html.day .plz-cfg p,html.day .plz-ct{color:#334155}',
      'html.day .plz-push{border-bottom-color:#E2E8F0}',
      'html.day .plz-pst{color:#1E293B}',
      'html.day .plz-pst.ok{color:#166534}',
      'html.day .plz-cfg .plz-pb,html.day .plz-ban .plz-pb{background:#0E7490;color:#FFFFFF}',
      'html.day .plz-cfg .plz-pb.sec,html.day .plz-ban .plz-pb.sec{background:#FFFFFF;border-color:#94A3B8;color:#0F172A}',
      'html.day .plz-pmsg{color:#92400E}',
      'html.day .plz-ban{background:#E0F2FE;border-color:#7DD3FC}',
      'html.day .plz-bt{color:#0F172A}',
      'html.day .plz-bt svg{stroke:#0E7490}',
      'html.day .plz-cfg button{background:#F1F5F9;border-color:#CFDDEA;color:#0F172A}'
    ].join('\n');
    var st = document.createElement('style'); st.id = 'plz-style'; st.textContent = s;
    document.head.appendChild(st);
  }

  // ── Marcar hecho / deshacer ─────────────────────────────────────────────
  function hecho(clave, si) {
    var h = hechos();
    if (si) h[clave] = Date.now(); else delete h[clave];
    guarda(K_HECHOS, h);
    tocaEstado();
    pinta();
    try { if (typeof window.pilotosAvisosCargar === 'function') window.pilotosAvisosCargar(); } catch (e) {}
    if (document.getElementById('av-ov') && document.getElementById('av-ov').classList.contains('av-open')) hoja(_tab);
  }

  // ── El cuadro del slider del Home (#dh-plazo-chip) ──────────────────────
  /* Vive DENTRO del slider de estadísticas (es un `data-metric` más, así que
     se reordena y se oculta desde «Personalizar paneles») y al tocarlo abre la
     hoja «Avisos y plazos». Lo urgente lo dice el COLOR y la cuenta atrás; el
     detalle —el cierre aleatorio con sus dos extremos— vive en la hoja. */
  var _tick = null, _cardClave = null;
  function card() {
    var el = document.getElementById('dh-plazo-chip');
    if (!el) return;
    css();
    var ahora = Date.now(), g = lista(ahora), L = lang();
    var ic = el.querySelector('.dh-stat-icon'), lb = el.querySelector('.dh-stat-lbl'),
        va = el.querySelector('.dh-stat-val'), su = el.querySelector('.dh-stat-sub');
    if (!ic || !lb || !va || !su) return;
    var abiertos = g.ahora.filter(function (x) { return !x.hecho; });
    var o = abiertos[0];
    /* Lo que publica la compañía (la programación del mes, cada mes) en los 3
       días antes: va delante de un plazo abierto que aún no urge. Sin esto no
       saldría nunca: la permuta de vacaciones (día 25) siempre está abierta. */
    var hito = g.proximos.filter(function (x) { return x.clase === 'hito' && x.cierra - ahora < 3 * 864e5; })
      .sort(function (a, b) { return a.cierra - b.cierra; })[0];
    if (hito && !(o && o.urge)) {
      el.classList.remove('plz-urge');
      var fc = function (ms) { return P.fechaCorta(ms, L, hito.tz); };
      ic.className = 'dh-stat-icon dh-si-blue';
      ic.innerHTML = svg(hito.tipo, 'currentColor', 16);
      lb.textContent = T('Próximo plazo', 'Next deadline');
      va.textContent = P.titulo(hito, L);
      su.textContent = (hito.tipo === 'programacion' ? T('se publica ', 'published ') : '') +
        (fc(hito.cierra) === fc(ahora) ? T('hoy', 'today')
        : fc(hito.cierra) === fc(ahora + 864e5) ? T('mañana', 'tomorrow') : T('el ', 'on ') + fc(hito.cierra));
      el.setAttribute('aria-label', P.titulo(hito, L) + ' · ' + P.cuando(hito, ahora, L));
      _cardClave = null; para(); return;
    }
    el.classList.toggle('plz-urge', !!(o && o.urge));
    if (!o) {
      /* Nada abierto: el próximo que abre. Un cuadro vacío no dice si es que no
         hay nada o que no se ha calculado. */
      var p = g.proximos[0];
      ic.className = 'dh-stat-icon dh-si-blue';
      ic.innerHTML = svg(p ? p.tipo : 'reloj', 'currentColor', 16);
      lb.textContent = T('Próximo plazo', 'Next deadline');
      va.textContent = p ? P.titulo(p, L) : T('Nada abierto', 'Nothing open');
      su.textContent = p ? (p.clase === 'hito' || p.abre == null ? T('el ', 'on ') + P.fechaCorta(p.cierra, L, p.tz)
        : T('abre el ', 'opens ') + P.fechaCorta(p.abre, L, p.tz)) : '';
      el.setAttribute('aria-label', T('Avisos y plazos', 'Notices & deadlines'));
      _cardClave = null; para(); return;
    }
    ic.className = 'dh-stat-icon ' + (o.urge ? 'dh-si-red' : 'dh-si-amber');
    ic.innerHTML = svg(o.tipo, 'currentColor', 16);
    lb.textContent = o.estado === 'aleatorio' ? T('Puede estar cerrado', 'May be closed')
      : o.urge ? T('Cierra pronto', 'Closing soon') : T('Plazo abierto', 'Open now');
    va.textContent = P.titulo(o, L);
    su.textContent = subTxt(o, ahora, abiertos.length - 1);
    el.setAttribute('aria-label', P.titulo(o, L) + ' · ' + P.cuando(o, ahora, L));
    _cardClave = o.clave;
    if (o.urge && o.estado === 'abierto') arranca(); else para();
  }
  function subTxt(o, ahora, mas) {
    var t;
    if (o.estado === 'aleatorio') t = T('cierre aleatorio', 'random close');
    else if (o.urge) { var f = P.falta(o, ahora); t = pad(f.d * 24 + f.h) + ':' + pad(f.m) + ':' + pad(f.s); }
    else t = T('cierra en ', 'closes in ') + P.cuentaTxt(o, ahora, lang());
    return t + (mas > 0 ? ' · +' + mas : '');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /* Un segundo de tic SÓLO con la cuenta atrás a la vista: un bucle que nadie
     mira costó 209 ms por interacción tres pantallas más allá (Beta.709). */
  function arranca() {
    if (_tick) return;
    _tick = setInterval(function () {
      var el = document.getElementById('dh-plazo-chip');
      var home = document.getElementById('scr-home');
      if (!el || document.hidden || !home || !home.classList.contains('active')) return;
      var g = lista(Date.now()), ab = g.ahora.filter(function (x) { return !x.hecho; }), o = ab[0];
      if (!o || o.clave !== _cardClave || !(o.urge && o.estado === 'abierto')) return card();
      var su = el.querySelector('.dh-stat-sub');
      if (su) su.textContent = subTxt(o, Date.now(), ab.length - 1);
    }, 1000);
  }
  function para() { if (_tick) { clearInterval(_tick); _tick = null; } }

  // ── La hoja «Avisos y plazos» ───────────────────────────────────────────
  var _tab = 'ahora', _cfg = false;

  /* ── El filtro por trámite ──
     Una ficha por trámite con SU color (el mismo de las tarjetas, la línea de
     tiempo y la cinta del año) y cuántos tiene abiertos ahora. Se recuerda en
     el aparato: es una comodidad, no un dato que tenga que viajar. */
  var K_FIL = 'pilotos_plazos_filtro';
  var _fil = lee(K_FIL, 'todo');
  function catNom(t, may) {
    var n = { programacion: ['Programación', 'Roster'], roff: ['OFF / ROFF', 'OFF / ROFF'], xoff: ['XOFF', 'XOFF'], vacaciones: ['Vacaciones', 'Leave'], reduccion: ['Reducciones', 'Reductions'], retribucion: ['Retribución', 'Pay'] }[t];
    var x = n ? T(n[0], n[1]) : String(t || '');
    if (may && t === 'reduccion') x = T('Reducción', 'Reduction');
    if (may && t === 'retribucion') x = T('Retrib.', 'Pay');
    return may ? x.toUpperCase() : x;
  }
  function filtra(arr) { return _fil === 'todo' ? arr : arr.filter(function (o) { return o.tipo === _fil; }); }
  function filtroHtml(g) {
    var p = prefs();
    var vis = TIPOS.filter(function (t) { return p[t]; });
    if (_fil !== 'todo' && vis.indexOf(_fil) < 0) _fil = 'todo';
    var n = { todo: 0 };
    g.ahora.forEach(function (o) { if (o.hecho) return; n[o.tipo] = (n[o.tipo] || 0) + 1; n.todo++; });
    function ficha(k, nom, ic) {
      return '<button type="button" class="plz-fc ' + (k === 'todo' ? 'todo' : 'plz-c-' + k) + (_fil === k ? ' on' : '') + '" data-plz-fil="' + k + '" aria-pressed="' + (_fil === k) + '">' +
        '<span class="dt">' + ic + '</span>' + esc(nom) + (n[k] ? '<span class="n">' + n[k] + '</span>' : '') + '</button>';
    }
    return '<div class="plz-flt" role="group" aria-label="' + esc(T('Filtrar por trámite', 'Filter by request')) + '">' +
      ficha('todo', T('Todo', 'All'), '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>') +
      vis.map(function (t) { return ficha(t, catNom(t), svg(t, 'currentColor', 13)); }).join('') + '</div>';
  }
  /* La cinta del año: cada trámite en su línea, las ventanas como tramos y los
     límites e hitos como puntos, con la raya de HOY. Al filtrar, las demás se
     apagan: se ve de un vistazo cuándo cae lo tuyo. */
  function cintaHtml(ahora) {
    var anio = new Date(ahora).getUTCFullYear(), a0 = Date.UTC(anio, 0, 1), a1 = Date.UTC(anio + 1, 0, 1), L = a1 - a0;
    var r = reglas(), p = prefs();
    var occ = P.ocurrencias(r.reglas, { desde: a0, hasta: a1, perfil: perfil(), tipos: p, excepciones: r.excepciones });
    var pos = function (ms) { return Math.max(0, Math.min(100, (ms - a0) / L * 100)); };
    var lanes = TIPOS.filter(function (t) { return p[t]; }).map(function (t) {
      var s = '';
      occ.forEach(function (o) {
        if (o.tipo !== t) return;
        if (o.abre != null && o.clase === 'ventana') {
          var x0 = pos(o.abre), x1 = pos(o.fin || o.cierra);
          if (x1 > x0) s += '<i class="plz-seg" style="left:' + x0.toFixed(2) + '%;width:' + (x1 - x0).toFixed(2) + '%"></i>';
        } else if ((!o.objetivo || t === 'programacion') && o.cierra >= a0 && o.cierra < a1) s += '<i class="plz-pin" style="left:' + pos(o.cierra).toFixed(2) + '%"></i>';
        /* Un límite MENSUAL (las fechas de la reducción, cada mes) no va en la
           cinta: doce puntos seguidos tapan los que importan. Sigue en la lista.
           La publicación de la programación SÍ: va sola en su línea, no tapa nada. */
      });
      var cor = { programacion: T('PROG', 'ROSTER'), roff: 'ROFF', xoff: 'XOFF', vacaciones: T('VAC', 'LEAVE'), reduccion: T('RED', 'REDUC'), retribucion: T('RETR', 'PAY') }[t];
      return '<div class="plz-lane plz-c-' + t + (_fil !== 'todo' && _fil !== t ? ' off' : '') + '" data-plz-lane="' + t + '"><span class="k">' + cor + '</span><div class="plz-trk">' + s + '</div></div>';
    }).join('');
    if (!lanes) return '';
    var meses = T('ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC', 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC').split(' ').map(function (m) { return '<span>' + m + '</span>'; }).join('');
    /* AMPLIADA y se mueve con el dedo (pedido 16-oct-2026: en el móvil, con el
       año entero en 340 px, los puntos no se veían). El año mide ~3 veces lo que
       se ve y abre centrado en HOY; las siglas van pegadas a la izquierda
       (sticky), así que al moverla se sigue sabiendo qué línea es cuál. La
       columna de las siglas (52 px + 8 de hueco) la comparten las líneas, la
       raya de HOY y los meses: tres sitios que tienen que coincidir. */
    return '<div class="plz-yr"><div class="plz-yr-t"><span>' + esc(T('TU AÑO DE PLAZOS', 'YOUR YEAR OF DEADLINES')) + '</span><b>' + anio + '</b></div>' +
      '<div class="plz-sc" data-plz-sc="1"><div class="plz-in">' +
      '<div class="plz-lanes">' + lanes + '<i class="plz-hoy" data-t="' + esc(T('HOY', 'TODAY')) + '" style="left:calc(60px + (100% - 60px) * ' + (pos(ahora) / 100).toFixed(4) + ')"></i></div>' +
      '<div class="plz-mes"><span></span>' + meses + '</div></div></div>' +
      (_fil === 'todo' ? '<div class="plz-yr-h">' + esc(T('Toca un trámite arriba para ver todas sus fechas.', 'Tap a request above to see all its dates.')) + '</div>' : '') + '</div>';
  }
  /* «De cuándo a cuándo» (pedido 16-oct-2026): al filtrar por un trámite, sus
     FECHAS como consulta, estén abiertas o no. Sale de las REGLAS —no de lo que
     hay abierto—, con la próxima vez que toca cada una. Lo que no le aplica al
     piloto (XOFF con patrón fijo, otras reducciones) va plegado aparte: se
     puede consultar sin mezclarse con lo suyo. */
  var _infoAbierta = true, _infoOtras = false;
  var MES_L = { es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  var _dtfMad = null;
  function diaMad(ms) {
    if (!_dtfMad) _dtfMad = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });
    var t = _dtfMad.format(new Date(ms)).split('-');
    return { y: +t[0], m: +t[1], d: +t[2], iso: t.join('-') };
  }
  function diasEntre(a, b) { return Math.round((Date.parse(diaMad(b).iso) - Date.parse(diaMad(a).iso)) / 864e5); }
  function mesL(m) { return MES_L[lang()][m - 1]; }
  function fraseFechas(r, o) {
    var a = o.abre != null ? diaMad(o.abre) : null, c = diaMad(o.cierra);
    if (r.recurrencia === 'mensual') {
      if (r.clase === 'ventana') return T('Del ' + a.d + ' al ' + c.d + ' de cada mes', a.d + '–' + c.d + ' of every month');
      return r.cierra_dia === -1 ? T('Hasta el último día de cada mes', 'By the last day of every month') : T('Hasta el ' + c.d + ' de cada mes', 'By the ' + c.d + ' of every month');
    }
    if (r.clase === 'hito') return T('El ' + c.d + ' de ' + mesL(c.m), 'On ' + c.d + ' ' + mesL(c.m));
    if (r.clase === 'limite' || !a) return T('Hasta el ' + c.d + ' de ' + mesL(c.m), 'By ' + c.d + ' ' + mesL(c.m));
    if (a.m === c.m) return T('Del ' + a.d + ' al ' + c.d + ' de ' + mesL(c.m), a.d + '–' + c.d + ' ' + mesL(c.m));
    return T('Del ' + a.d + ' de ' + mesL(a.m) + ' al ' + c.d + ' de ' + mesL(c.m), a.d + ' ' + mesL(a.m) + ' – ' + c.d + ' ' + mesL(c.m));
  }
  function estadoInfo(o, ahora) {
    var e = P.estado(o, ahora), corta = function (ms) { var d = diaMad(ms); return mesL(d.m).slice(0, 3) + ' ' + d.y; };
    if (o.clase === 'ventana' && e === 'abierto') return { k: 'on', t: T('Abierto ahora', 'Open now') };
    if (e === 'aleatorio') return { k: 'on', t: T('Puede estar cerrado', 'May be closed') };
    var meta = o.clase === 'ventana' ? o.abre : o.cierra, n = diasEntre(ahora, meta);
    if (n <= 0) return { k: 'on', t: o.clase === 'hito' ? T('Hoy', 'Today') : T('Cierra hoy', 'Closes today') };
    if (n > 60) return { k: '', t: (o.clase === 'ventana' ? T('Abre en ', 'Opens ') : T('Próxima: ', 'Next: ')) + corta(meta) };
    if (o.clase === 'ventana') return { k: '', t: n === 1 ? T('Abre mañana', 'Opens tomorrow') : T('Abre en ' + n + ' días', 'Opens in ' + n + ' days') };
    return { k: n <= 2 ? 'urge' : '', t: n === 1 ? T('Mañana', 'Tomorrow') : T('Faltan ' + n + ' días', 'In ' + n + ' days') };
  }
  function soloPara(r) {
    var a = r.audiencia || {}, nom = { familiar: T('reducción familiar', 'family reduction'), hijos16: T('reducción por hijos de 12 a 16', 'children 12–16 reduction'),
      mayores55: T('reducción de mayores de 55', 'over-55 reduction'), anual: T('reducción anual', 'annual reduction') };
    if (a.patron) return a.patron === 'libre' ? T('Solo patrón libre', 'Free pattern only') : T('Solo patrón fijo', 'Fixed pattern only');
    if (a.reduccion && a.reduccion.length) return T('Solo con ', 'Only with ') + a.reduccion.map(function (k) { return nom[k] || k; }).join(', ');
    return '';
  }
  function infoHtml(ahora) {
    if (_fil === 'todo') return '';
    var rr = reglas(), pf = perfil(), L = lang();
    var occ = P.ocurrencias(rr.reglas, { desde: ahora - 400 * 864e5, hasta: ahora + 400 * 864e5, excepciones: rr.excepciones });
    var prox = {};
    occ.forEach(function (o) { if (o.tipo === _fil && o.fin >= ahora && !prox[o.regla]) prox[o.regla] = o; });
    var filas = rr.reglas.filter(function (r) { return r.activo !== false && r.tipo === _fil && prox[r.id]; })
      .map(function (r) { return { r: r, o: prox[r.id], mia: P.aplica(r, Object.assign({ anio: diaMad(ahora).y }, pf)) }; })
      .sort(function (a, b) { var ka = a.o.clase === 'ventana' ? a.o.abre : a.o.cierra, kb = b.o.clase === 'ventana' ? b.o.abre : b.o.cierra; return (ka - kb) || (a.r.orden - b.r.orden); });
    if (!filas.length) return '';
    var tipoTxt = { ventana: T('Plazo para pedirlo', 'Request window'), limite: T('Fecha límite', 'Deadline'), hito: T('Lo publica la compañía', 'Published by the company') };
    function fila(x) {
      var r = x.r, o = x.o, d = diaMad(o.clase === 'ventana' && o.abre != null ? o.abre : o.cierra), st = estadoInfo(o, ahora);
      /* Del MOLDE de la regla, no de la ocurrencia: «Puja de ROFF · diciembre»
         hablaría de un mes concreto; aquí se describe la regla. */
      var tit = String((L === 'en' && P.EN[r.id] && P.EN[r.id][0]) || r.titulo || '').replace('{mes}', T('cada mes', 'every month'));
      var det = P.detalle(o, L), solo = x.mia ? '' : soloPara(r);
      var pie = [tipoTxt[r.clase] || '', r.fuente || ''].filter(Boolean).join(' · ');
      return '<div class="plz-if' + (x.mia ? '' : ' ajena') + '">' +
        '<div class="plz-ifd" aria-hidden="true"><b>' + (r.recurrencia === 'mensual' ? '↻' : d.d) + '</b><span>' + esc(r.recurrencia === 'mensual' ? T('MES', 'MONTH') : mesL(d.m).slice(0, 3).toUpperCase()) + '</span></div>' +
        '<div class="plz-ift"><div class="plz-ifn">' + esc(tit) + '</div>' +
        '<div class="plz-iff">' + esc(fraseFechas(r, o)) + '</div>' +
        (det ? '<div class="plz-ifx">' + esc(det) + '</div>' : '') +
        '<div class="plz-ifp"><span class="plz-ife ' + st.k + '">' + esc(st.t) + '</span>' + (solo ? '<span class="plz-ifs">' + esc(solo) + '</span>' : '') + '<span>' + esc(pie) + '</span></div></div></div>';
    }
    var mias = filas.filter(function (x) { return x.mia; }), otras = filas.filter(function (x) { return !x.mia; });
    var cuerpo, aviso = '';
    if (!mias.length) {
      /* Si no le aplica ninguna, se enseñan todas (cada una dice para quién es):
         esconderlas detrás de un pliegue dejaría la tarjeta vacía. */
      cuerpo = otras.map(fila).join('');
      aviso = '<div class="plz-ifa">' + esc(_fil === 'reduccion' ? T('No tienes marcada ninguna reducción: marca la tuya en Mi perfil y te avisaremos de sus fechas.', 'You have no reduction set: set yours in My profile and we will remind you of its dates.')
        : T('Según tu perfil, estas fechas no te aplican.', 'According to your profile, these dates do not apply to you.')) + '</div>';
    } else {
      cuerpo = mias.map(fila).join('') + (otras.length ? '<details class="plz-ifo"' + (_infoOtras ? ' open' : '') + ' data-plz-ifo="1"><summary>' +
        esc(T('Otras fechas que no te aplican', 'Other dates that do not apply to you')) + ' · ' + otras.length + '</summary>' + otras.map(fila).join('') + '</details>' : '');
    }
    /* ⚠ Con reglas MEZCLADAS el subtítulo no puede ser una sola palabra: el ROFF
       tiene la mensual y la de enero (que es anual), y decir «cada año» encima de
       una fila que dice «Del 5 al 11 de cada mes» es la tarjeta contradiciéndose a
       sí misma. Cada fila ya dice sus fechas en claro; esto sólo tiene que no
       mentir. */
    var nMens = filas.filter(function (x) { return x.r.recurrencia === 'mensual'; }).length;
    var cada = nMens === filas.length ? T('cada mes', 'every month')
             : nMens === 0 ? T('cada año', 'every year')
             : T('unas cada mes y otras cada año', 'some monthly, some yearly');
    return '<details class="plz-info plz-c-' + _fil + '"' + (_infoAbierta ? ' open' : '') + ' data-plz-info="1"><summary>' +
      '<span class="plz-ii">' + svg('cal', 'currentColor', 16) + '</span><span class="plz-it2">' + esc(T('Fechas de ', 'Dates for ') + (/OFF/.test(catNom(_fil)) ? catNom(_fil) : catNom(_fil).toLowerCase())) +
      '<small>' + esc(T('Se repiten ', 'They repeat ') + cada) + '</small></span><span class="plz-iv" aria-hidden="true"></span></summary>' +
      aviso + '<div class="plz-ifl">' + cuerpo + '</div></details>';
  }
  function vacioFil(txt) {
    /* Las siglas (ROFF, XOFF) se quedan en mayúsculas; el resto, en minúscula. */
    var n = /OFF/.test(catNom(_fil)) ? catNom(_fil) : catNom(_fil).toLowerCase();
    return '<div class="plz-vacio">' + esc(_fil === 'todo' ? txt : T('Nada de ' + n + ' en esta pestaña.', 'No ' + n + ' in this tab.')) + '</div>';
  }
  function itemHtml(o, ahora) {
    var L = lang(), nv = nivel(o), pr = P.progreso(o, ahora);
    var st = o.estado === 'cerrado' || o.hecho ? '' : o.estado === 'aleatorio'
      ? '<span class="plz-st urge"><span class="plz-pulse"></span>' + esc(T('PUEDE ESTAR CERRADO', 'MAY BE CLOSED')) + '</span>'
      : nv === 'urge' ? '<span class="plz-st urge"><span class="plz-pulse"></span>' + esc(T('CIERRA PRONTO', 'CLOSING SOON')) + '</span>'
      : o.estado === 'abierto' ? '<span class="plz-st">' + esc(T('ABIERTO', 'OPEN')) + '</span>' : '';
    var btn = o.estado === 'cerrado' ? '' : o.hecho
      ? '<button type="button" class="plz-ok des" data-plz-deshacer="' + esc(o.clave) + '">' + esc(T('Deshacer', 'Undo')) + '</button>'
      : '<button type="button" class="plz-ok" data-plz-hecho="' + esc(o.clave) + '">' + svg('ok', 'currentColor', 14) + esc(T('Hecho', 'Done')) + '</button>';
    var pie = o.estado === 'cerrado' ? T('Cerrado', 'Closed') : o.hecho ? T('Marcado como hecho', 'Marked as done') : P.cuentaTxt(o, ahora, L);
    return '<div class="plz-it plz-c-' + esc(o.tipo) + ' ' + (o.hecho || o.estado === 'cerrado' ? 'hecho' : nv) + '" data-plz-tipo="' + esc(o.tipo) + '">' +
      '<div class="plz-ic">' + svg(o.tipo, 'currentColor') + '</div><div class="plz-tx">' +
      '<div class="plz-k">' + esc(catNom(o.tipo, true)) + st + '</div>' +
      '<div class="plz-t">' + esc(P.titulo(o, L)) + '</div>' +
      '<div class="plz-s">' + esc(P.cuando(o, ahora, L)) + '</div>' +
      (P.detalle(o, L) && !o.aleatorio ? '<div class="plz-d">' + esc(P.detalle(o, L)) + '</div>' : '') +
      (pr != null && o.estado !== 'cerrado' && !o.hecho ? '<div class="plz-bar"><i style="width:' + Math.round(pr * 100) + '%"></i></div>' : '') +
      '<div class="plz-w"><span>' + esc((o.fuente ? o.fuente + ' · ' : '') + pie) + '</span>' + btn + '</div>' +
      '</div></div>';
  }
  function proxHtml(o, ahora) {
    var L = lang(), fc = function (ms) { return P.fechaCorta(ms, L, o.tz); };
    /* Con cierre aleatorio, los dos días del cierre juntos: «5 nov → 11/12 nov». */
    var hasta = o.aleatorio ? fc(o.cierra).split(' ')[0] + '/' + fc(o.fin) : fc(o.cierra);
    var d = (o.clase === 'hito' || o.abre == null) ? fc(o.cierra) : fc(o.abre) + ' → ' + hasta;
    return '<div class="plz-tli plz-c-' + esc(o.tipo) + '" data-plz-tipo="' + esc(o.tipo) + '"><div class="d">' + esc(d.toUpperCase()) + '</div>' +
      '<div class="t">' + esc(P.titulo(o, L)) + '</div>' +
      '<div class="s">' + esc((o.aleatorio
        ? T('Cierre aleatorio entre las ' + o.cierraHora + ' del ' + fc(o.cierra) + ' y las ' + o.finHora + ' del ' + fc(o.fin),
            'Random close between ' + o.cierraHora + ' on ' + fc(o.cierra) + ' and ' + o.finHora + ' on ' + fc(o.fin))
        : (P.detalle(o, L) || '')) + ((o.fuente && (o.aleatorio || P.detalle(o, L))) ? ' · ' : '') + (o.fuente || '')) + '</div></div>';
  }
  function cfgHtml() {
    var p = prefs(), pf = perfil();
    var nom = { programacion: ['Publicación de la programación', 'Roster publication'], roff: ['Puja de ROFF', 'ROFF bidding'], vacaciones: ['Vacaciones', 'Annual leave'], xoff: ['XOFF de Navidad', 'Christmas XOFF'], reduccion: ['Reducciones de jornada', 'Part-time reductions'], retribucion: ['Retribución y beneficios', 'Pay and benefits'] };
    var canal = '<div class="plz-cfg plz-canal"><div class="plz-ct">' + esc(T('CÓMO TE AVISAMOS', 'HOW WE NOTIFY YOU')) + '</div>' +
      '<div id="plz-push" class="plz-push"></div>' +
      '<label><span>' + esc(T('También por email', 'Also by email')) + '</span><input type="checkbox" data-plz-pref="email"' + (emailOn() ? ' checked' : '') + '></label>' +
      '<p>' + esc(T('Con la app cerrada te llega un aviso cuando se abre un plazo y otro en sus últimas 48 h. De noche (23–07 h) y mientras vuelas se esperan, salvo que cierre antes.',
        'With the app closed you get one notice when a deadline opens and another in its last 48 h. At night (23–07 h) and while you fly they wait, unless it closes first.')) + '</p></div>';
    return canal + '<div class="plz-cfg">' + TIPOS.map(function (t) {
      return '<label><span>' + esc(T(nom[t][0], nom[t][1])) + '</span><input type="checkbox" data-plz-pref="' + t + '"' + (p[t] ? ' checked' : '') + '></label>';
    }).join('') +
      '<p>' + esc(T('Patrón: ', 'Pattern: ') + (pf.patron === 'fijo' ? T('fijo', 'fixed') : pf.patron === 'libre' ? T('libre', 'free') : T('sin indicar (te avisamos de todo)', 'not set (you get everything)')) +
        ' · ' + T('Reducción: ', 'Reduction: ') + (pf.reducciones.length ? pf.reducciones.join(', ') : T('ninguna', 'none'))) + '</p>' +
      '<p>' + esc(T('Los avisos de reducción sólo salen si marcas la tuya en Mi perfil.', 'Reduction deadlines only show if you set yours in My profile.')) + '</p>' +
      '<button type="button" data-plz-perfil="1">' + esc(T('Cambiarlo en Mi perfil', 'Change it in My profile')) + '</button></div>';
  }
  /* Dónde queda la cinta: al ABRIR la hoja, centrada en HOY; al repintar con la
     hoja abierta (filtro, pestaña, «Hecho»), donde la dejó el piloto — volver al
     centro cada vez que toca una ficha le quitaría lo que estaba mirando. */
  var _yrSl = null;
  function enganchaInfo() {
    var d = document.querySelector('#plz-cont [data-plz-info]');
    if (d) d.addEventListener('toggle', function () { _infoAbierta = d.open; });
    var o = document.querySelector('#plz-cont [data-plz-ifo]');
    if (o) o.addEventListener('toggle', function () { _infoOtras = o.open; });
  }
  function colocaCinta() {
    var sc = document.querySelector('#plz-cont .plz-sc');
    if (!sc) return;
    if (_yrSl == null) {
      var hoy = sc.querySelector('.plz-hoy');
      if (hoy) sc.scrollLeft = Math.max(0, hoy.offsetLeft - sc.clientWidth * 0.45);
    } else sc.scrollLeft = _yrSl;
    sc.addEventListener('scroll', function () { _yrSl = sc.scrollLeft; }, { passive: true });
  }
  /* La pinta DENTRO de la hoja de Avisos que ya existe: `pilotosAvisosAbrir` la
     llama con el contenedor y la lista de avisos generales ya montada. */
  // ── NUEVO: lo que el piloto todavía no ha mirado, ARRIBA del todo ──────
  /* `_nvAv` son los avisos de la campana con los que se abrió la hoja. Un aviso
     es NUEVO las 24 h siguientes a verlo por primera vez (o hasta «Entendido» /
     «Hecho»): si dejara de serlo al abrir, cerrar y volver a abrir la hoja lo
     haría desaparecer antes de leerlo. */
  var _nvAv = [];
  function apuntaNuevos(ctx) {
    if (!ctx || !ctx.avisos) return;
    _nvAv = ctx.avisos.slice();
    var v = ctx.vistos || [], m = leeNuevo(), ahora = Date.now();
    _nvAv.forEach(function (a) { if (a && a.id && v.indexOf(a.id) < 0 && m[a.id] == null) m[a.id] = ahora; });
    Object.keys(m).forEach(function (k) { if (m[k] > 0 && ahora - m[k] > 7 * 864e5) delete m[k]; });
    guardaNuevo(m);
  }
  function claveDe(id) { var r = String(id).slice(6); var i = r.lastIndexOf(':'); return i > 0 ? r.slice(0, i) : r; }
  function nuevos(g, ahora) {
    var m = leeNuevo(), vistas = {}, out = [];
    _nvAv.forEach(function (a) {
      var t = m[a && a.id];
      if (!(t > 0) || ahora - t > NUEVO_MS) return;
      if (/^plazo:/.test(a.id)) {
        var c = claveDe(a.id);
        if (vistas[c]) return;
        var o = g.ahora.filter(function (x) { return x.clave === c && !x.hecho; })[0];
        if (!o) return;
        vistas[c] = 1; out.push({ id: a.id, o: o });
      } else out.push({ id: a.id, a: a });
    });
    return out;
  }
  function nuevoHtml(n, ahora) {
    var L = lang(), ok = '<button type="button" class="plz-nvx" data-plz-nv-ok="' + esc(n.id) + '">' + esc(T('Entendido', 'Got it')) + '</button>';
    if (n.o) {
      var o = n.o, urge = o.urge;
      var bg = o.estado === 'aleatorio' ? T('PUEDE ESTAR CERRADO', 'MAY BE CLOSED') : urge ? T('CIERRA PRONTO', 'CLOSING SOON') : T('NUEVO PLAZO ABIERTO', 'NEW DEADLINE OPEN');
      return '<div class="plz-nvc plz-c-' + esc(o.tipo) + (urge ? ' urge' : '') + '" data-plz-nv="' + esc(n.id) + '">' +
        '<div class="plz-nvb"><span class="plz-nvbg"><span class="plz-pulse"></span><span class="plz-nvbt">' + esc(bg) + '</span></span>' +
        '<span class="plz-nvk">' + svg(o.tipo, 'currentColor', 14) + esc(catNom(o.tipo, true)) + '</span></div>' +
        '<div class="plz-nvt">' + esc(P.titulo(o, L)) + '</div>' +
        '<div class="plz-nvs">' + esc(P.cuando(o, ahora, L)) + '</div>' +
        (o.estado === 'abierto' ? '<div class="plz-nvcd">' + esc(T('Cierra en ', 'Closes in ') + P.cuentaTxt(o, ahora, L)) + '</div>' : '') +
        '<div class="plz-nva"><button type="button" class="plz-ok" data-plz-hecho="' + esc(o.clave) + '">' + svg('ok', 'currentColor', 15) + esc(T('Ya lo he hecho', 'Done')) + '</button>' + ok + '</div></div>';
    }
    var a = n.a;
    return '<div class="plz-nvc gen" data-plz-nv="' + esc(n.id) + '">' +
      '<div class="plz-nvb"><span class="plz-nvbg"><span class="plz-pulse"></span><span class="plz-nvbt">' + esc(T('NUEVO', 'NEW')) + '</span></span>' +
      '<span class="plz-nvk">' + esc(a.icono || '') + '</span></div>' +
      '<div class="plz-nvt">' + esc(a.titulo || '') + '</div>' +
      (a.texto ? '<div class="plz-nvs">' + esc(a.texto) + '</div>' : '') +
      '<div class="plz-nva">' + (a.ir ? '<button type="button" class="plz-nvir" data-plz-nv-ir="' + esc(n.id) + '">' + esc(T('Abrir', 'Open')) + '</button>' : '') + ok + '</div></div>';
  }
  function pintaNuevos(g, ahora) {
    var box = document.getElementById('plz-nuevo');
    if (!box) return [];
    var nv = _cfg ? [] : nuevos(g, ahora);
    box.hidden = !nv.length;
    box.innerHTML = nv.length ? '<div class="plz-nvh"><span class="plz-nvdot"></span><span class="plz-nvw">' + esc(T('NUEVO', 'NEW')) + '</span><b>' + nv.length + '</b></div>' +
      nv.map(function (n) { return nuevoHtml(n, ahora); }).join('') : '';
    return nv;
  }

  function hoja(tab) {
    css();
    var sh = document.getElementById('av-sheet');
    if (!sh) return;
    _tab = tab || _tab;
    var ahora = Date.now(), g = lista(ahora), L = lang();
    var gen = document.getElementById('av-lista');
    var cab = sh.querySelector('.plz-top');
    if (!cab) {
      var h3 = sh.querySelector('h3');
      cab = document.createElement('div'); cab.className = 'plz-top';
      sh.insertBefore(cab, h3); cab.appendChild(h3);
      var gb = document.createElement('button'); gb.type = 'button'; gb.className = 'plz-gear';
      gb.setAttribute('aria-label', T('Qué te avisamos', 'What we notify you about'));
      gb.setAttribute('data-plz-cfg', '1'); gb.innerHTML = svg('gear', 'currentColor', 20);
      cab.appendChild(gb);
      var nvb = document.createElement('div'); nvb.id = 'plz-nuevo'; nvb.hidden = true;
      sh.insertBefore(nvb, cab.nextSibling);
      var tabs = document.createElement('div'); tabs.className = 'plz-tabs'; tabs.setAttribute('translate', 'no');
      sh.insertBefore(tabs, nvb.nextSibling);
      var cont = document.createElement('div'); cont.id = 'plz-cont'; cont.setAttribute('translate', 'no');
      sh.insertBefore(cont, tabs.nextSibling);
    }
    sh.querySelector('h3').textContent = T('Avisos y plazos', 'Notices & deadlines');
    var nAhora = g.ahora.filter(function (o) { return !o.hecho; }).length;
    sh.querySelector('.plz-tabs').innerHTML =
      '<button type="button" data-plz-tab="ahora" class="' + (_tab === 'ahora' ? 'on' : '') + '">' + esc(T('Ahora', 'Now')) + (nAhora ? '<em>' + nAhora + '</em>' : '') + '</button>' +
      '<button type="button" data-plz-tab="proximos" class="' + (_tab === 'proximos' ? 'on' : '') + '">' + esc(T('Próximos', 'Upcoming')) + '</button>' +
      '<button type="button" data-plz-tab="historial" class="' + (_tab === 'historial' ? 'on' : '') + '">' + esc(T('Historial', 'History')) + '</button>';
    var h = _cfg ? cfgHtml() : filtroHtml(g) + cintaHtml(ahora) + infoHtml(ahora);
    if (_tab === 'ahora' && !_cfg) h += '<div id="plz-ban" class="plz-ban" hidden></div>';
    var fa = filtra(g.ahora), fp = filtra(g.proximos), fh = filtra(g.historial);
    if (_tab === 'ahora') {
      h += fa.length ? fa.map(function (o) { return itemHtml(o, ahora); }).join('')
        : vacioFil(T('Ningún plazo abierto ahora mismo.', 'No deadlines open right now.'));
    } else if (_tab === 'proximos') {
      h += fp.length ? '<div class="plz-tl">' + fp.slice(0, 14).map(function (o) { return proxHtml(o, ahora); }).join('') + '</div>'
        : vacioFil(T('Nada en los próximos meses.', 'Nothing in the coming months.'));
    } else {
      h += fh.length ? fh.slice(0, 20).map(function (o) { return itemHtml(o, ahora); }).join('')
        : vacioFil(T('Todavía no hay historial.', 'No history yet.'));
    }
    document.getElementById('plz-cont').innerHTML = h;
    var nv = pintaNuevos(g, ahora), nvIds = nv.map(function (n) { return n.id; });
    colocaCinta(); enganchaInfo();
    pintaPush();
    /* Los avisos generales (formatos que ya leemos…) sólo en «Ahora», debajo y
       con su rótulo: siguen siendo avisos, no plazos. */
    if (gen) {
      gen.style.display = _tab === 'ahora' ? '' : 'none';
      var rot = document.getElementById('plz-genrot');
      if (!rot) { rot = document.createElement('div'); rot.id = 'plz-genrot'; rot.className = 'plz-sec'; gen.parentNode.insertBefore(rot, gen); }
      /* Los plazos también son fuente de la campana (para el punto del avatar),
         pero aquí ya salen arriba con su tarjeta: repetirlos abajo es ruido. */
      /* …y lo que ya sale arriba como NUEVO, tampoco. */
      [].forEach.call(gen.querySelectorAll('.av-item'), function (x) {
        var id = x.getAttribute('data-av-id') || '';
        x.style.display = (/^plazo:/.test(id) || nvIds.indexOf(id) >= 0) ? 'none' : '';
      });
      var hayGen = [].some.call(gen.querySelectorAll('.av-item'), function (x) { return x.style.display !== 'none'; });
      rot.textContent = T('OTROS AVISOS', 'OTHER NOTICES');
      rot.style.display = (_tab === 'ahora' && hayGen && _fil === 'todo') ? '' : 'none';
      if ((!hayGen || _fil !== 'todo') && _tab === 'ahora') gen.style.display = 'none';
    }
  }

  // ── La campana: una fuente más del registro ─────────────────────────────
  function fuente() {
    var ahora = Date.now(), L = lang();
    return lista(ahora).ahora.filter(function (o) { return !o.hecho; }).map(function (o) {
      return {
        /* La fase va en el id: al entrar en las últimas 48 h es OTRO aviso y la
           campana vuelve a sonar. Sin eso, quien lo vio al abrir ya no se
           entera del final. */
        id: 'plazo:' + o.clave + ':' + (o.urge ? 'urge' : 'abre'),
        icono: '⏳',
        titulo: P.titulo(o, L),
        texto: P.cuando(o, ahora, L),
        cuando: o.urge ? ahora : (o.abre || ahora),
        ir: function () { window.pilotosAvisosAbrir && window.pilotosAvisosAbrir(); }
      };
    });
  }

  function pinta() { try { card(); } catch (e) { console.warn('[plazos] tarjeta', e && e.message); } }

  // Un solo delegado para todo: la hoja y la tarjeta se repintan enteras.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-plz-nv-ok],[data-plz-nv-ir],[data-plz-hecho],[data-plz-deshacer],[data-plz-ver],[data-plz-tab],[data-plz-cfg],[data-plz-perfil],[data-plz-push],[data-plz-fil]') : null;
    if (!t) return;
    e.stopPropagation();
    if (t.hasAttribute('data-plz-nv-ok')) { var mm = leeNuevo(); mm[t.getAttribute('data-plz-nv-ok')] = -1; guardaNuevo(mm); return hoja(); }
    if (t.hasAttribute('data-plz-nv-ir')) {
      var idv = t.getAttribute('data-plz-nv-ir'), av = _nvAv.filter(function (x) { return x.id === idv; })[0];
      var m2 = leeNuevo(); m2[idv] = -1; guardaNuevo(m2);
      try { window.pilotosAvisosCerrar && window.pilotosAvisosCerrar(); } catch (er) {}
      try { if (av && av.ir) av.ir(); } catch (er) {}
      return;
    }
    if (t.hasAttribute('data-plz-push')) return accionPush(t.getAttribute('data-plz-push'));
    if (t.hasAttribute('data-plz-hecho')) return hecho(t.getAttribute('data-plz-hecho'), true);
    if (t.hasAttribute('data-plz-deshacer')) return hecho(t.getAttribute('data-plz-deshacer'), false);
    if (t.hasAttribute('data-plz-ver')) { _tab = 'ahora'; return window.pilotosAvisosAbrir && window.pilotosAvisosAbrir(); }
    if (t.hasAttribute('data-plz-tab')) return hoja(t.getAttribute('data-plz-tab'));
    if (t.hasAttribute('data-plz-fil')) { _fil = t.getAttribute('data-plz-fil'); guarda(K_FIL, _fil); return hoja(); }
    if (t.hasAttribute('data-plz-cfg')) { _cfg = !_cfg; return hoja(); }
    if (t.hasAttribute('data-plz-perfil')) {
      try { window.pilotosAvisosCerrar && window.pilotosAvisosCerrar(); } catch (er) {}
      try { window.goTo && window.goTo('perfil'); } catch (er) {}
    }
  }, true);
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('data-plz-pref')) return;
    var p = lee(K_PREFS, {}) || {}; p[t.getAttribute('data-plz-pref')] = !!t.checked;
    guarda(K_PREFS, p);
    tocaEstado();
    pinta(); hoja();
    try { window.pilotosAvisosCargar && window.pilotosAvisosCargar(); } catch (er) {}
  });

  if (typeof window.pilotosAvisosFuente === 'function') window.pilotosAvisosFuente(fuente);

  window.PlazosUI = { hoja: function (t, ctx) { _yrSl = null; apuntaNuevos(ctx); hoja(t); }, pinta: pinta, cargaReglas: cargaReglas, lista: lista, hecho: hecho, perfil: perfil, reglas: reglas,
    traeEstado: traeEstado, subeEstado: subeEstado, estadoPush: estadoPush };

  function arranque() {
    pinta();
    cargaReglas(false);
    traeEstado(true);
    /* Viene de tocar un push (o el email): abre la hoja en cuanto la app esté. */
    if (/[?&]avisos=1\b/.test(location.search)) {
      var n = 0, t = setInterval(function () {
        if (++n > 40) return clearInterval(t);
        var gate = document.getElementById('pilot-auth-gate');
        if (typeof window.pilotosAvisosAbrir !== 'function' || (gate && !gate.classList.contains('hidden') && gate.offsetParent)) return;
        clearInterval(t);
        try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
        _tab = 'ahora'; window.pilotosAvisosAbrir();
      }, 250);
    }
  }
  /* Push tocado con la app ya abierta: el Service Worker la enfoca y avisa. */
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.tipo === 'pilotos-abre-avisos' && typeof window.pilotosAvisosAbrir === 'function') { _tab = 'ahora'; window.pilotosAvisosAbrir(); }
    });
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranque); else arranque();
  /* Al volver del segundo plano: lo que estaba abierto puede haber cerrado. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { pinta(); cargaReglas(false); traeEstado(false); }
  });
  window.addEventListener('pilotos-perfil-cambia', pinta);
})();
