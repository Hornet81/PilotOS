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

  var K_REGLAS = 'pilotos_plazos_reglas';
  var K_HECHOS = 'pilotos_plazos_hechos';
  var K_PREFS  = 'pilotos_plazos_prefs';
  var TIPOS = ['roff', 'vacaciones', 'xoff', 'reduccion'];
  var URGE_MS = P.URGE_MS;                 // últimas 48 h: rojo, cuenta atrás y la campana vuelve a sonar
  var AHORA_LIMITE_MS = P.AHORA_LIMITE_MS; // un plazo «hasta el día D» entra en Ahora a 45 días
  /* Los dos números viven en plazos.js: el servidor decide con ellos cuándo
     manda el push, y la pantalla cuándo se pone roja. Tienen que ser los mismos. */

  function lang() { return window.pilotosLang === 'en' ? 'en' : 'es'; }
  function en() { return lang() === 'en'; }
  function T(es, eng) { return en() ? eng : es; }
  function lee(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
  function guarda(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ── Reglas: la tabla manda; la copia del módulo, si no contesta ──────────
  function reglas() {
    var c = lee(K_REGLAS, null);
    return (c && c.reglas && c.reglas.length) ? c : { reglas: P.REGLAS_DEFECTO, excepciones: [], copia: true };
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
    if (st.e === 'activo') x = '<div class="plz-pst ok">' + svg('ok', '#86EFAC', 14) + esc(T('Activas en este dispositivo', 'On for this device')) + '</div>' +
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
    roff: '<path d="M3 9h18M8 3v4M16 3v4"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M9 15l2 2 4-4"/>',
    vacaciones: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    xoff: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/><path d="M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/>',
    reduccion: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M14.5 20c0-2 1.2-3.6 3-3.6s3 1.6 3 3.6"/>',
    reloj: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>'
  };
  function svg(k, col, w) {
    return '<svg width="' + (w || 18) + '" height="' + (w || 18) + '" viewBox="0 0 24 24" fill="none" stroke="' + (col || 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.reloj) + '</svg>';
  }
  function nivel(o) { return o.urge ? 'urge' : (o.estado === 'proximo' || o.clase === 'hito' ? 'prox' : 'abre'); }

  // ── Estilos (UNA paleta: la hoja y la tarjeta son oscuras en los dos temas,
  //    con fondo OPACO para que el contraste se pueda medir leyendo estilos) ──
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
      '.plz-it{display:flex;gap:11px;padding:12px;margin-bottom:9px;background:#0F1F35;border:1px solid #1E3A5F;border-radius:13px}',
      '.plz-it.urge{background:#2A1219;border-color:#7F2A3A}',
      '.plz-it.abre{border-color:#6B5A1E}',
      '.plz-it.hecho{opacity:1;background:#0C1A2B}',
      '.plz-ic{width:36px;height:36px;border-radius:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#16304F}',
      '.plz-it.urge .plz-ic{background:#4A1A25}',
      '.plz-it.abre .plz-ic{background:#3A3216}',
      '.plz-tx{flex:1;min-width:0}',
      '.plz-t{font-size:13.5px;font-weight:800;color:#F1F5F9}',
      '.plz-s{font-size:12.5px;line-height:1.45;color:#CBD5E1;margin-top:3px}',
      '.plz-d{font-size:11.5px;line-height:1.45;color:#A9BDD3;margin-top:3px}',
      '.plz-bar{height:5px;border-radius:3px;background:#1E3A5F;margin-top:8px;overflow:hidden}',
      '.plz-bar i{display:block;height:100%;border-radius:3px;background:#FCD34D}',
      '.plz-it.urge .plz-bar i{background:#FCA5A5}',
      '.plz-w{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:#A9BDD3}',
      '.plz-ok{min-height:36px;padding:0 11px;border-radius:9px;background:none;border:1px solid #2F7D57;color:#86EFAC;font:700 12px ' + M + ';cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap}',
      '.plz-ok.des{border-color:#475569;color:#CBD5E1}',
      '.plz-tl{border-left:2px solid #1E3A5F;margin-left:7px}',
      '.plz-tli{position:relative;padding:4px 4px 12px 18px}',
      '.plz-tli:before{content:"";position:absolute;left:-7px;top:8px;width:12px;height:12px;border-radius:50%;background:#0A1628;border:2px solid #67E8F9}',
      '.plz-tli .d{font-size:11px;font-weight:800;letter-spacing:.8px;color:#67E8F9}',
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
      '.plz-cfg button{min-height:40px;padding:0 12px;border-radius:10px;background:#16304F;border:1px solid #2A4562;color:#F1F5F9;font:700 12.5px ' + M + ';cursor:pointer;margin-bottom:6px}'
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
  function itemHtml(o, ahora) {
    var L = lang(), nv = nivel(o), pr = P.progreso(o, ahora);
    var col = nv === 'urge' ? '#FCA5A5' : nv === 'abre' ? '#FCD34D' : '#67E8F9';
    var btn = o.estado === 'cerrado' ? '' : o.hecho
      ? '<button type="button" class="plz-ok des" data-plz-deshacer="' + esc(o.clave) + '">' + esc(T('Deshacer', 'Undo')) + '</button>'
      : '<button type="button" class="plz-ok" data-plz-hecho="' + esc(o.clave) + '">' + svg('ok', '#86EFAC', 14) + esc(T('Hecho', 'Done')) + '</button>';
    var pie = o.estado === 'cerrado' ? T('Cerrado', 'Closed') : o.hecho ? T('Marcado como hecho', 'Marked as done') : P.cuentaTxt(o, ahora, L);
    return '<div class="plz-it ' + (o.hecho || o.estado === 'cerrado' ? 'hecho' : nv) + '">' +
      '<div class="plz-ic">' + svg(o.tipo, col) + '</div><div class="plz-tx">' +
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
    return '<div class="plz-tli"><div class="d">' + esc(d.toUpperCase()) + '</div>' +
      '<div class="t">' + esc(P.titulo(o, L)) + '</div>' +
      '<div class="s">' + esc((o.aleatorio
        ? T('Cierre aleatorio entre las ' + o.cierraHora + ' del ' + fc(o.cierra) + ' y las ' + o.finHora + ' del ' + fc(o.fin),
            'Random close between ' + o.cierraHora + ' on ' + fc(o.cierra) + ' and ' + o.finHora + ' on ' + fc(o.fin))
        : (P.detalle(o, L) || '')) + ((o.fuente && (o.aleatorio || P.detalle(o, L))) ? ' · ' : '') + (o.fuente || '')) + '</div></div>';
  }
  function cfgHtml() {
    var p = prefs(), pf = perfil();
    var nom = { roff: ['Puja de ROFF', 'ROFF bidding'], vacaciones: ['Vacaciones', 'Annual leave'], xoff: ['XOFF de Navidad', 'Christmas XOFF'], reduccion: ['Reducciones de jornada', 'Part-time reductions'] };
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
  /* La pinta DENTRO de la hoja de Avisos que ya existe: `pilotosAvisosAbrir` la
     llama con el contenedor y la lista de avisos generales ya montada. */
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
      gb.setAttribute('data-plz-cfg', '1'); gb.innerHTML = svg('gear', '#CBD5E1', 20);
      cab.appendChild(gb);
      var tabs = document.createElement('div'); tabs.className = 'plz-tabs'; tabs.setAttribute('translate', 'no');
      sh.insertBefore(tabs, cab.nextSibling);
      var cont = document.createElement('div'); cont.id = 'plz-cont'; cont.setAttribute('translate', 'no');
      sh.insertBefore(cont, tabs.nextSibling);
    }
    sh.querySelector('h3').textContent = T('Avisos y plazos', 'Notices & deadlines');
    var nAhora = g.ahora.filter(function (o) { return !o.hecho; }).length;
    sh.querySelector('.plz-tabs').innerHTML =
      '<button type="button" data-plz-tab="ahora" class="' + (_tab === 'ahora' ? 'on' : '') + '">' + esc(T('Ahora', 'Now')) + (nAhora ? '<em>' + nAhora + '</em>' : '') + '</button>' +
      '<button type="button" data-plz-tab="proximos" class="' + (_tab === 'proximos' ? 'on' : '') + '">' + esc(T('Próximos', 'Upcoming')) + '</button>' +
      '<button type="button" data-plz-tab="historial" class="' + (_tab === 'historial' ? 'on' : '') + '">' + esc(T('Historial', 'History')) + '</button>';
    var h = _cfg ? cfgHtml() : '';
    if (_tab === 'ahora' && !_cfg) h += '<div id="plz-ban" class="plz-ban" hidden></div>';
    if (_tab === 'ahora') {
      h += g.ahora.length ? g.ahora.map(function (o) { return itemHtml(o, ahora); }).join('')
        : '<div class="plz-vacio">' + esc(T('Ningún plazo abierto ahora mismo.', 'No deadlines open right now.')) + '</div>';
    } else if (_tab === 'proximos') {
      h += g.proximos.length ? '<div class="plz-tl">' + g.proximos.slice(0, 14).map(function (o) { return proxHtml(o, ahora); }).join('') + '</div>'
        : '<div class="plz-vacio">' + esc(T('Nada en los próximos meses.', 'Nothing in the coming months.')) + '</div>';
    } else {
      h += g.historial.length ? g.historial.slice(0, 20).map(function (o) { return itemHtml(o, ahora); }).join('')
        : '<div class="plz-vacio">' + esc(T('Todavía no hay historial.', 'No history yet.')) + '</div>';
    }
    document.getElementById('plz-cont').innerHTML = h;
    pintaPush();
    /* Los avisos generales (formatos que ya leemos…) sólo en «Ahora», debajo y
       con su rótulo: siguen siendo avisos, no plazos. */
    if (gen) {
      gen.style.display = _tab === 'ahora' ? '' : 'none';
      var rot = document.getElementById('plz-genrot');
      if (!rot) { rot = document.createElement('div'); rot.id = 'plz-genrot'; rot.className = 'plz-sec'; gen.parentNode.insertBefore(rot, gen); }
      /* Los plazos también son fuente de la campana (para el punto del avatar),
         pero aquí ya salen arriba con su tarjeta: repetirlos abajo es ruido. */
      [].forEach.call(gen.querySelectorAll('.av-item'), function (x) {
        if (/^plazo:/.test(x.getAttribute('data-av-id') || '')) x.style.display = 'none';
      });
      var hayGen = [].some.call(gen.querySelectorAll('.av-item'), function (x) { return x.style.display !== 'none'; });
      rot.textContent = T('OTROS AVISOS', 'OTHER NOTICES');
      rot.style.display = (_tab === 'ahora' && hayGen) ? '' : 'none';
      if (!hayGen && _tab === 'ahora') gen.style.display = 'none';
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
    var t = e.target && e.target.closest ? e.target.closest('[data-plz-hecho],[data-plz-deshacer],[data-plz-ver],[data-plz-tab],[data-plz-cfg],[data-plz-perfil],[data-plz-push]') : null;
    if (!t) return;
    e.stopPropagation();
    if (t.hasAttribute('data-plz-push')) return accionPush(t.getAttribute('data-plz-push'));
    if (t.hasAttribute('data-plz-hecho')) return hecho(t.getAttribute('data-plz-hecho'), true);
    if (t.hasAttribute('data-plz-deshacer')) return hecho(t.getAttribute('data-plz-deshacer'), false);
    if (t.hasAttribute('data-plz-ver')) { _tab = 'ahora'; return window.pilotosAvisosAbrir && window.pilotosAvisosAbrir(); }
    if (t.hasAttribute('data-plz-tab')) return hoja(t.getAttribute('data-plz-tab'));
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

  window.PlazosUI = { hoja: hoja, pinta: pinta, cargaReglas: cargaReglas, lista: lista, hecho: hecho, perfil: perfil, reglas: reglas,
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
