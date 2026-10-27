/* ════════════════════════════════════════════════════════════════════════════
   SWAP — cambios de servicio entre pilotos (Herramientas → Swap)

   Módulo aparte: crea su propia pantalla (#scr-swap), carga su CSS (css/swap.css)
   y habla con /api/swap/* (swap-routes.js). Del index.html solo usa goTo(),
   `screens` y `tabMap`, y la tarjeta de Herramientas llama a window.swapOpen().

   Reglas (acordadas con el usuario, 16-oct-2026):
   · Vueling acepta un cambio si entre dos días de VUELO hay calzos + 20 min +
     13:30 h hasta la siguiente presentación (o la duración de la actividad
     anterior, si es mayor: la FTL exige descanso ≥ actividad previa).
   · FTL (OM-A 7.1.13 / 7.1.7): descanso en base ≥ max(12 h, actividad previa) con
     cualquier actividad; actividad ≤ 60 h en 7 días.
   · Se cambian de 1 a 6 días SEGUIDOS. Si no cuadra, se buscan tramos de hasta
     6 días que contengan los elegidos y sí cuadren.
   · Con ≥ 5 días de antelación se pide en eCrews (lo pide uno, el otro acepta y
     es instantáneo); con menos, correo a oficinapilotos@vueling.com con el
     compañero en copia, que el piloto envía desde SU correo (mailto).
   · Privacidad: el roster del compañero solo se ve con conexión aceptada por los
     dos; su sueldo nunca (de él solo se enseñan horas).

   Horas: el roster se guarda en Z. Aquí se calcula en minutos Z y se pinta en Z
   o en local según la preferencia del roster (RST.useLT).
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DW = 78, DWX = 172, MAXD = 6;
  var VUELING_MIN = 13 * 60 + 30, FTL_MIN = 12 * 60, POST = 20, MAX7 = 60 * 60;
  var MAIL_TO = 'oficinapilotos@vueling.com';
  var WD = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  var MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var WDN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  /* Idioma: lo fija i18n.js al cargar (cambiarlo recarga la app). El correo a la
     oficina de Vueling va SIEMPRE en castellano: por eso guarda su propia copia
     de las letras de los días (WD_ES). La pantalla va con translate="no" y cada
     texto en los dos idiomas aquí: frases compuestas con números no caben en
     el diccionario. */
  var EN = window.pilotosLang === 'en', WD_ES = WD.slice();
  function L(es, en) { return EN ? en : es; }
  if (EN) {
    WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    MES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    WDN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  }

  var S = { contacts: [], proposals: [], partner: null, prof: null, dates: [], me: [], them: [],
            orig: null, picked: [], msg: '', state: 'idle', hint: [], proposal: null, firstShown: 0 };

  /* ── utilidades ──────────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() {
    try { var t = localStorage.getItem('cafi_auth_token'); return t && t !== 'demo-bypass-token' ? t.replace(/^"|"$/g, '') : ''; } catch (e) { return ''; }
  }
  /* Mismo origen primero (beta y local sirven front + API), luego el backend de la
     app. Un 404 o un fallo de red pasa al siguiente; otra respuesta es LA respuesta.
     Es el patrón de home-orden.js. */
  function origenes() {
    var o = [];
    try { if (/^https?:/.test(location.origin)) o.push(location.origin); } catch (e) {}
    try { if (typeof window.ldBackendUrl === 'function') o.push(window.ldBackendUrl().replace(/\/$/, '')); } catch (e) {}
    return o.filter(function (x, i) { return x && o.indexOf(x) === i; });
  }
  var _origenBueno = null;
  /* ── SIN CONEXIÓN (23-oct-2026, «que esta parte de swap esté disponible offline») ──
     Cada GET que sale bien se guarda en el aparato; si luego no hay red, el Swap
     enseña lo último que vio (compañeros, propuestas, tablón, días) y lo DICE con su
     hora en una franja arriba. Lo que manda algo —proponer, aceptar, publicar— no se
     puede hacer sin red, y el mensaje lo dice en vez de soltar el error del navegador.
     Va con el uid dentro: la copia de otra cuenta en el mismo móvil no se enseña. El
     prefijo pilotos_ hace que el cierre de sesión se la lleve. */
  var SW_CACHE = 'pilotos_swap_cache_v1', SW_CACHE_MAX = 30, SW_CACHE_TAM = 450000;
  function uidAhora() { try { return (JSON.parse(localStorage.getItem('cafi_user') || '{}') || {}).id || ''; } catch (e) { return ''; } }
  function cacheTodo() {
    try { var c = JSON.parse(localStorage.getItem(SW_CACHE) || 'null'); if (c && c.uid === uidAhora() && c.e) return c; } catch (e) {}
    return { uid: uidAhora(), e: {} };
  }
  function cacheGuarda(path, j) {
    try {
      var txt = JSON.stringify(j); if (txt.length > SW_CACHE_TAM) return;
      var c = cacheTodo(); c.e[path] = { at: Date.now(), j: j };
      var ks = Object.keys(c.e).sort(function (x, y) { return c.e[y].at - c.e[x].at; });
      ks.slice(SW_CACHE_MAX).forEach(function (k) { delete c.e[k]; });
      localStorage.setItem(SW_CACHE, JSON.stringify(c));
    } catch (e) {}
  }
  function cacheLee(path) { var c = cacheTodo(); return c.e[path] || null; }
  function errSinRed(manda) {
    var e = new Error(manda ? L('Sin conexión: esto necesita cobertura. Inténtalo cuando vuelvas a tenerla.', 'No connection: this needs signal. Try again when you\'re back online.')
      : L('Sin conexión y todavía no hay nada guardado de esto en el móvil.', 'No connection, and nothing of this is saved on the phone yet.'));
    e.__sinRed = true; return e;
  }
  function desdeCache(c) { S.offAt = S.offAt ? Math.min(S.offAt, c.at) : c.at; pintaOff(); return JSON.parse(JSON.stringify(c.j)); }
  function apiRed(path, body) {
    var o = _origenBueno ? [_origenBueno] : origenes(), i = 0;
    function prueba(ult) {
      if (i >= o.length) return Promise.reject(ult || new Error(L('Sin conexión', 'No connection')));
      var org = o[i++];
      return fetch(org + path, {
        method: body ? 'POST' : 'GET', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        if (r.status === 404 && !/json/.test(r.headers.get('content-type') || '')) return prueba(new Error('404'));
        _origenBueno = org;
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
          return j;
        });
      }, function (e) { e = e || new Error('red'); e.__red = true; return prueba(e); });
    }
    return prueba();
  }
  function api(path, body) {
    var off = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (off) {
      if (body) return Promise.reject(errSinRed(true));
      var c0 = cacheLee(path);
      return c0 ? Promise.resolve(desdeCache(c0)) : Promise.reject(errSinRed(false));
    }
    return apiRed(path, body).then(function (j) {
      if (!body) { cacheGuarda(path, j); if (S.offAt) { S.offAt = null; pintaOff(); } }
      return j;
    }, function (e) {
      if (e && e.__red) {
        if (body) throw errSinRed(true);
        var c = cacheLee(path); if (c) return desdeCache(c);
        throw errSinRed(false);
      }
      throw e;
    });
  }
  function horaCache(ms) {
    var d = new Date(ms), hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return iso(d) === today() ? hh : fCorta(iso(d)) + ' ' + hh;
  }
  function pintaOff() {
    var el = $('sw-off'); if (!el) return;
    if (!S.offAt) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.2-2.7M10.7 5a15 15 0 0 1 11.3 3.8M5 12.4a10 10 0 0 1 4.6-2.3M14.3 10.2A10 10 0 0 1 19 12.4M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg>' +
      '<div><b>' + esc(L('Sin conexión · lo de las ', 'Offline · as of ') + horaCache(S.offAt)) + '</b>' +
      '<span>' + esc(L('Proponer, aceptar o publicar necesita cobertura.', 'Proposing, accepting or posting needs signal.')) + '</span></div>';
  }
  /* Al volver la cobertura se refresca lo que se esté viendo. */
  window.addEventListener('online', function () {
    if (!$('scr-swap')) return;
    S.offAt = null; pintaOff();
    try { if (S.partner) openPair(S.partner); else if (S.view === 'board') loadBoard(); else { loadHome(); loadPlan(true); } } catch (e) {}
  });
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(isoStr, n) { var d = new Date(isoStr + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
  function today() { return iso(new Date()); }
  function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
  function wd(isoStr) { return new Date(isoStr + 'T12:00:00').getDay(); }
  function dnum(isoStr) { return +isoStr.slice(8, 10); }
  function dayName(i) { var d = S.dates[i]; return WDN[wd(d)] + ' ' + dnum(d); }
  function dayShort(i) { var d = S.dates[i]; return WD[wd(d)] + ' ' + dnum(d); }
  function hhmm(n) { n = Math.round(n); var s = n < 0 ? '−' : ''; n = Math.abs(n); return s + Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); }
  function useLT() { try { return !!(window.RST && window.RST.useLT); } catch (e) { return false; } }
  function clock(min) {
    if (min == null) return '';
    var off = useLT() ? -new Date().getTimezoneOffset() : 0;
    var m = ((Math.round(min) + off) % 1440 + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + (useLT() ? '' : 'Z');
  }
  /* Sin la «Z»: para listas de tramos, donde la leyenda ya dice en qué hora va. */
  function clockN(min) { return clock(min).replace(/Z$/, ''); }
  function firstName(p) { return ((p && p.nombre) || '').split(/\s+/)[0] || L('Tu compañero', 'Your colleague'); }

  /* ── pantalla ────────────────────────────────────────────────────────────── */
  function ensureScreen() {
    if ($('scr-swap')) return;
    if (!document.querySelector('link[href^="css/swap.css"]')) {
      // Sin ?v=: el service worker lo precachea con esta URL exacta y lo renueva con cada versión.
      var l = document.createElement('link'); l.rel = 'stylesheet';
      l.href = 'css/swap.css';
      document.head.appendChild(l);
    }
    var sc = document.createElement('div');
    sc.className = 'screen'; sc.id = 'scr-swap';
    sc.innerHTML =
      '<div class="inner-header"><div class="back-btn" id="sw-back">‹ Herramientas</div>' +
      '<div class="ih-title">Swap</div><div class="ih-right"></div></div>' +
      /* Las dos caras del Swap en pestañas, como las del QRH de SkyView. Viven FUERA
         de #sw-body a propósito: el cuerpo se repinta entero cada 20 s, y una barra
         que se rehace no puede animar su indicador ni su onda — se rehace quieta. */
      '<div class="sw-tabs" id="sw-tabs" role="tablist" translate="no" hidden>' +
        '<i class="sw-tabs-ind" aria-hidden="true"></i>' +
        '<button class="sw-tab" role="tab" data-st="home"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.6" r="2.5"/><path d="M15.6 14.2c2.4-.2 4.3 1.3 4.9 4.3"/></svg>' +
          '<span class="tx"></span><span class="n" hidden></span></button>' +
        '<button class="sw-tab" role="tab" data-st="board"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h12.5M14.5 4l3 3-3 3"/><path d="M19 17H6.5M9.5 14l-3 3 3 3"/></svg>' +
          '<span class="tx">Swap Board</span><span class="n" hidden></span></button>' +
      '</div>' +
      '<div class="sw-off" id="sw-off" role="status" translate="no" hidden></div>' +
      '<div class="scroll-body" id="sw-body" translate="no"></div>';
    var tools = $('scr-tools');
    (tools && tools.parentNode ? tools.parentNode : document.body).insertBefore(sc, tools ? tools.nextSibling : null);
    /* Dentro de un compañero, atrás vuelve a la lista del Swap; en la lista, a la
       pantalla DE LA QUE VIENES (Inicio o Herramientas: la tarjeta puede estar en
       cualquiera de las dos), por el mismo historial que el atrás del móvil. */
    $('sw-back').onclick = function () {
      closeSheet();
      if (S.partner) { S.partner = null; S.proposal = null; if (S.view === 'board') { renderBoard(); loadBoard(); } else { renderHome(); loadHome(); } rotulaAtras(); }
      // El tablón ya no es una pantalla DENTRO del Swap: es su otra pestaña. Atrás sale.
      else if (typeof window.navVuelve === 'function') window.navVuelve('tools');
      else if (typeof goTo === 'function') goTo('tools');
    };
    bindTabs();
    try { screens.swap = 'scr-swap'; } catch (e) {}
    try { tabMap.swap = 'bt-mas'; } catch (e) {}
  }
  function rotulaAtras() {
    var b = $('sw-back'); if (!b) return;
    pintaGear();
    if (S.partner) { b.textContent = '‹ Swap'; return; }
    b.textContent = typeof window.navVueltaRotulo === 'function' ? window.navVueltaRotulo('tools') : L('‹ Atrás', '‹ Back');
  }

  /* ── las pestañas: Compañeros · Swap Board ────────────────────────────────── */
  /* Se ven en las dos listas y con el Swap conectado; dentro de un compañero, sin
     sesión o con el Swap apagado no hay nada entre lo que cambiar, y se esconden. */
  function pintaTabs() {
    var t = $('sw-tabs'); if (!t) return;
    var me = S.dir && S.dir.me;
    var ver = !!token() && !S.partner && (S.view === 'board' || !!(me && me.visible));
    t.hidden = !ver;
    if (!ver) return;
    var act = S.view === 'board' ? 'board' : 'home';
    var antes = t.getAttribute('data-active');
    t.setAttribute('data-active', act);
    if (antes && antes !== act) {
      var ind = t.querySelector('.sw-tabs-ind');
      ind.classList.remove('swish'); void ind.offsetWidth; ind.classList.add('swish');
      clearTimeout(pintaTabs._sw); pintaTabs._sw = setTimeout(function () { ind.classList.remove('swish'); }, 950);
    }
    var nHome = S.contacts.filter(function (c) { return c.incoming && c.status === 'pending'; }).length +
                S.proposals.filter(function (p) { return p.incoming && p.status === 'proposed'; }).length;
    var nBoard = S.board && S.board.posts ? S.board.posts.filter(function (p) { return !p.mine; }).length : 0;
    t.querySelectorAll('.sw-tab').forEach(function (b) {
      var k = b.dataset.st, on = k === act, n = k === 'home' ? nHome : nBoard;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      var tx = b.querySelector('.tx');
      if (k === 'home') tx.textContent = L('Compañeros', 'Colleagues');
      var nb = b.querySelector('.n');
      nb.hidden = !n; nb.textContent = n > 99 ? '99+' : String(n);
      // En Compañeros el número son cosas que esperan tu respuesta: van en ámbar.
      nb.classList.toggle('pend', k === 'home');
    });
  }
  /* El toque: onda desde el punto exacto del dedo + un pequeño rebote, y el
     indicador se desliza al otro lado con un muelle. Todo transform/opacity. */
  function bindTabs() {
    var t = $('sw-tabs'); if (!t) return;
    t.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.sw-tab') : null; if (!b) return;
      var r = b.getBoundingClientRect();
      b.style.setProperty('--rx', ((ev.clientX || r.left + r.width / 2) - r.left) + 'px');
      b.style.setProperty('--ry', ((ev.clientY || r.top + r.height / 2) - r.top) + 'px');
      b.classList.remove('tapping', 'popping'); void b.offsetWidth; b.classList.add('tapping', 'popping');
      setTimeout(function () { b.classList.remove('tapping', 'popping'); }, 560);
      if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
      cambiaTab(b.dataset.st);
    });
  }
  function cambiaTab(k) {
    var a = S.view === 'board' ? 'board' : 'home';
    if (k === a) { var sb = $('sw-body'); if (sb) sb.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.entra = { lado: k === 'board' ? 'der' : 'izq', t0: Date.now() };   // de qué lado entra el contenido
    if (k === 'board') openBoard();
    else { S.view = 'home'; S.partner = null; S.proposal = null; renderHome(); rotulaAtras(); loadHome(); }
    var body = $('sw-body'); if (body) body.scrollTop = 0;
  }
  /* El contenido nuevo entra deslizándose del lado de la pestaña. Solo al CAMBIAR
     de pestaña: el repintado de cada 20 s no puede ponerse a bailar. */
  /* Si los datos llegan A MITAD de la entrada y el cuerpo se repinta, la animación
     sigue por donde iba (retraso negativo) en vez de saltar al final. */
  var ENTRA_MS = 420;
  function entrada(body) {
    var e = S.entra, el = body.firstElementChild;
    if (!e || !el) return;
    var t = Date.now() - e.t0;
    if (t >= ENTRA_MS) { S.entra = null; return; }
    el.style.animationDelay = (-t) + 'ms';
    el.classList.add('sw-in-' + e.lado);
  }

  window.swapOpen = function () {
    ensureScreen();
    S.partner = null; S.proposal = null; S.view = 'home';
    renderHome();
    if (typeof goTo === 'function') goTo('swap');
    /* Sin rol o sin nombre de chequeo el Swap no sirve: no se te puede encontrar ni
       saber si cambias con comandantes o copilotos. Se abre la hoja del perfil. */
    /* ⚠ Y se pregunta por `completaToca()`, no mirando el perfil a pelo: el de la
       nube puede no haber bajado todavía (al volver a entrar, el aparato empieza
       en blanco) y entonces esto abría una hoja OBLIGATORIA a quien ya lo tenía
       todo relleno — «al entrar de nuevo me hace rellenar el perfil con número ID
       todas las veces». `completaToca` espera a tener perfil y además lleva el
       límite de una vez al día; `completar` a secas se salta las dos cosas. */
    try {
      if (token() && window.PilotProfile && typeof window.PilotProfile.completaToca === 'function' &&
          typeof window.PilotProfile.completar === 'function' && window.PilotProfile.completaToca())
        setTimeout(window.PilotProfile.completar, 350);
    } catch (e) {}
    rotulaAtras();
    loadHome();
  };

  /* ── inicio: conexiones y propuestas ─────────────────────────────────────── */
  function badge() {
    var n = S.contacts.filter(function (c) { return c.incoming && c.status === 'pending'; }).length +
            S.proposals.filter(function (p) { return p.incoming && p.status === 'proposed'; }).length;
    var b = $('sw-tool-badge');
    if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  }

  function stLabel(p) {
    var nm = esc(p.partnerName || L('tu compañero', 'your colleague'));
    if (p.status === 'proposed') return p.incoming ? '<span class="sw-st sg">' + L('Te lo propone ', 'Proposed by ') + nm + '</span>' : '<span class="sw-st">' + L('Esperando a ', 'Waiting for ') + nm + '</span>';
    if (p.status === 'accepted') return '<span class="sw-st ok">' + L('Aceptado', 'Accepted') + '</span>';
    if (p.status === 'rejected') return '<span class="sw-st ko">' + L('Rechazado', 'Declined') + '</span>';
    if (p.status === 'cancelled') return '<span class="sw-st">' + L('Retirado', 'Withdrawn') + '</span>';
    return '<span class="sw-st ok">' + L('Hecho', 'Done') + '</span>';
  }
  function datesTxt(ds) {
    if (!ds || !ds.length) return '';
    var a = ds[0], b = ds[ds.length - 1];
    var f = function (x) { return WD[wd(x)] + ' ' + dnum(x) + '/' + (+x.slice(5, 7)); };
    return ds.length > 1 ? f(a) + ' – ' + f(b) + ' (' + ds.length + L(' días)', ' days)') : f(a);
  }

  function loadHome() {
    if (!token()) { $('sw-body').innerHTML = '<div class="sw-pad"><div class="sw-empty">' + L('Inicia sesión para usar el Swap.', 'Sign in to use Swap.') + '</div></div>'; return; }
    Promise.all([api('/api/swap/dir'), api('/api/swap/contacts'), api('/api/swap/proposals')]).then(function (r) {
      S.dir = r[0]; S.contacts = r[1].contacts || []; S.proposals = r[2].proposals || [];
      if (!S.partner && S.view !== 'board') renderHome();
      badge(); pintaTabs();
      celebraPendiente();      // ¡SWAP! si te han aceptado un cambio y aún no lo has visto
    }, function (e) {
      if (!S.partner && S.view !== 'board') $('sw-body').innerHTML = '<div class="sw-pad"><div class="sw-err">' + esc(e.message) + '</div></div>';
    });
  }

  /* El interruptor vive en Mi perfil; aquí se puede encender sin ir allí. */
  function setVisible(v) {
    return api('/api/swap/dir/visible', { visible: !!v }).then(function () {
      if (S.dir && S.dir.me) S.dir.me.visible = !!v;
      try { if (typeof window.ppRenderScreen === 'function' && pantalla() === 'perfil') window.ppRenderScreen(); } catch (e) {}
      if ($('sw-body') && (!S.partner && S.view !== 'board')) loadHome();
    });
  }
  window.swapSetVisible = setVisible;
  // `curScreen` es un `let` del index: no cuelga de window, pero se lee por su nombre.
  function pantalla() { try { return curScreen; } catch (e) { return ''; } }

  /* Fila de Mi perfil (profile.js la inserta en «Preferencias»). El estado está en
     el servidor: si aún no lo sabemos, se pide y se repinta el perfil. */
  var _dirPidiendo = false;
  window.swapFilaPerfil = function () {
    var me = S.dir && S.dir.me;
    if (!me && !_dirPidiendo && token()) {
      _dirPidiendo = true;
      api('/api/swap/dir').then(function (j) { S.dir = j; }).catch(function () {}).then(function () {
        _dirPidiendo = false;
        try { if (pantalla() === 'perfil' && typeof window.ppRenderScreen === 'function') window.ppRenderScreen(); } catch (e) {}
      });
    }
    var on = !!(me && me.visible);
    return '<div class="pp-row"><div class="pp-ico">⇄</div>' +
      '<div class="pp-lbl"><b>Swap</b><span>' + (on ? L('Conectado · apareces para los pilotos de tu base', 'On · pilots at your base can see you') : L('Desconectado · no puedes consultar cambios', 'Off · you can\'t check swaps')) + '</span></div>' +
      '<div class="pp-sw' + (on ? ' on' : '') + '" onclick="window.swapTogglePerfil&&window.swapTogglePerfil()"><i></i></div></div>';
  };
  window.swapTogglePerfil = function () {
    var on = !!(S.dir && S.dir.me && S.dir.me.visible);
    if (on && !confirm(L('¿Desconectar el Swap? Dejarás de aparecer y nadie podrá ver tu roster.', 'Turn Swap off? You will disappear and nobody will be able to see your roster.'))) return;
    setVisible(!on).then(function () {
      try { window.ppRenderScreen && window.ppRenderScreen(); } catch (e) {}
    }, alertErr);
  };
  window.swapEstado = function () { return S.dir && S.dir.me ? S.dir.me : null; };

  /* Icono de un piloto: su foto o sus iniciales en un círculo de color estable. */
  function avatar(p, extra) {
    var n = (p && p.nombre) || (p && p.email) || '?';
    var ini = n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0].toUpperCase(); }).join('');
    var hsh = 0; for (var i = 0; i < n.length; i++) hsh = (hsh * 31 + n.charCodeAt(i)) % 360;
    return '<div class="sw-av' + (extra ? ' ' + extra : '') + '" style="--h:' + hsh + '">' +
      (p && p.foto ? '<img src="' + esc(p.foto) + '" alt="">' : '<span>' + esc(ini || '?') + '</span>') + '</div>';
  }
  function corto(n) { var s = String(n || '').trim().split(/\s+/); return s.length > 1 ? s[0] + ' ' + s[1][0] + '.' : (s[0] || ''); }

  /* ── INICIO del Swap, por DÍAS (17-oct-2026) ────────────────────────────────
     Orden pensado para el piloto, no para la base de datos:
       1. «Te toca a ti»: solo lo que espera algo de él (aceptar, responder, pedirlo
          en eCrews / mandar el correo), con «das ⇄ recibes» a la vista.
       2. «En marcha»: lo que espera al otro, en una línea.
       3. «¿Qué día quieres cambiar?»: sus próximos días; al tocar uno, con qué
          compañeros cuadra (lo calcula el servidor, /api/swap/plan) y el botón
          para ofrecerlo en el Swap Board.
       4. Compañeros: caras + «Añadir» (la base y el correo van a esa hoja).
     El interruptor y la privacidad, al ⚙ de la cabecera. */
  var PLAN_TTL = 120000;
  function loadPlan(forzar) {
    if (!token() || S._planPidiendo) return;
    if (!forzar && S.plan && Date.now() - S.planAt < PLAN_TTL) return;
    S._planPidiendo = true;
    api('/api/swap/plan?days=14').then(function (j) {
      S.plan = j; S.planAt = Date.now();
      if (!S.partner && S.view !== 'board') renderHome();
    }, function (e) { S.plan = { error: e.message, days: [] }; S.planAt = Date.now(); if (!S.partner && S.view !== 'board') renderHome(); })
      .then(function () { S._planPidiendo = false; });
  }
  function socio(id) { var c = S.contacts.filter(function (x) { return x.partner.id === id; })[0]; return c ? c.partner : { id: id, nombre: '' }; }
  function rutaDe(c) {
    if (!c || c.kind === 'empty') return L('Sin roster', 'No roster');
    if (c.kind === 'flight' && c.legs && c.legs.length) {
      var ap = [c.legs[0].dep].concat(c.legs.map(function (l) { return l.arr; }));
      return ap.join('-') + (c.report != null ? ' · ' + clockN(c.report) + '–' + clockN(c.end) : '');
    }
    if (c.report != null) return (c.code || '') + ' ' + clockN(c.report) + '–' + clockN(c.end);
    return c.code || 'OFF';
  }
  function cortoDia(c) {
    if (!c || c.kind === 'empty') return '—';
    if (c.kind === 'flight' && c.legs && c.legs.length) {
      // Los destinos fuera de base: «BCN-ORY-BCN-GRX-BCN» → ORY·GRX.
      var base = (S.plan && S.plan.base) || '', dst = [];
      c.legs.forEach(function (l) { if (l.arr && l.arr !== base && dst.indexOf(l.arr) < 0) dst.push(l.arr); });
      return (dst.length ? dst : [c.legs[0].arr]).slice(0, 2).join('·');
    }
    return c.code || 'OFF';
  }
  function tradeHtml(p) {
    if (!p.gives || !p.gets) return '';
    var lst = function (A) { return A.map(function (c) { return esc(rutaDe(c)); }).join('<br>'); };
    return '<div class="sw-trade"><div class="sw-leg give"><small>' + L('DAS', 'YOU GIVE') + '</small>' + lst(p.gives) + '</div><div class="sw-trade-x">⇄</div>' +
           '<div class="sw-leg get"><small>' + L('RECIBES', 'YOU GET') + '</small>' + lst(p.gets) + '</div></div>';
  }
  function pasos(n) {
    var t = [L('Propuesto', 'Proposed'), L('Aceptado', 'Accepted'), L('Pedirlo', 'Request it')];
    return '<div class="sw-steps">' + t.map(function (x, i) { return '<i class="' + (i < n ? 'd' : '') + '">' + (i < n ? '✓' : i + 1) + '</i>' + (i === n ? '<b>' + x + '</b>' : x); }).join('') + '</div>';
  }

  /* ── «Te toca a ti», cara a cara (23-oct-2026, propuesta F elegida por el piloto) ──
     Distinta a propósito del tablón (que va en magenta con taco y pastilla partida):
     aquí es un trato entre DOS compañeros, así que manda la gente — el avatar del otro
     frente a «TÚ», y debajo de cada uno lo que da con el color de su tipo de día (los
     mismos colores que el tablón: eso es lo que ata las dos secciones). En el CIAN de la
     pestaña Compañeros. La barra dice en qué paso está y el botón lo que toca: cian
     para eCrews, ámbar para el correo (quedan < 5 días). */
  /* ★ SIN las tarjetas de esos días no se inventa nada (reporte del piloto, 23-oct-2026:
     «al pulsar sobre el piloto que dice que te lo puede hacer aparece los vuelos en
     vacío»). `gives`/`gets` llegan a null cuando el servidor no pudo leer el roster
     —su `catch` es mudo— o cuando contesta un servidor anterior, y entonces
     `MOT.catDe([])` devuelve «OTRO»: la pastilla AFIRMABA un tipo de día que nadie sabe
     y debajo no había ni una línea. Medido: `.sw-ff-s` con 0 px de alto y el chip
     diciendo OTRO en los dos lados. El bloque anterior (`tradeHtml`) se quitaba ENTERO
     con la guarda `if (!p.gives || !p.gets) return ''`; al rehacer la tarjeta cara a
     cara (Beta.1160) esa guarda se perdió. Hoy: sin chip, y lo que falta se DICE. */
  function ladoTrato(av, quien, cards, base) {
    var hay = !!(cards && cards.length);
    var k = hay ? MOT.catDe(cards, base) : '';
    return '<div class="sw-ff-p">' + av + '<div class="sw-ff-n">' + esc(quien) + '</div>' +
      (hay ? '<span class="sw-ff-chip pk-' + esc(k) + '">' + catIco(k) + esc(catNom(k).toUpperCase()) + '</span>' : '') +
      '<div class="sw-ff-s' + (hay ? '' : ' nd') + '">' + (hay
        ? cards.map(function (c) { return esc(rutaDe(c)).replace(' · ', '<br>'); }).join('<br>')
        : esc(L('No he podido leer el roster de esos días', 'Could not read the roster for those days'))) + '</div></div>';
  }
  function cardTrato(p, kind) {
    var base = (S.plan && S.plan.base) || (S.dir && S.dir.me && S.dir.me.base) || '';
    var hoyS = today(), d0 = p.dates.slice().sort()[0], left = dayDiff(hoyS, d0), ec = left >= 5;
    var nom = firstName({ nombre: p.partnerName }) || p.partnerName || '';
    var cd = left <= 0 ? L('HOY', 'TODAY') : left === 1 ? L('MAÑANA', 'TOMORROW') : L('EN ' + left + ' DÍAS', 'IN ' + left + ' DAYS');
    var st = kind === 'acc' ? '<span class="sw-ff-ok">✓ ' + L('Aceptado', 'Accepted') + '</span>'
      : '<span class="sw-ff-new">' + L('Te lo propone', 'Proposed to you') + '</span>';
    var yo = '<div class="sw-av sw-ff-yo"><span>' + L('TÚ', 'YOU') + '</span></div>';
    var paso = kind === 'acc' ? (ec ? L('Pedirlo', 'Request it') : L('Correo', 'Email')) : L('Aceptar', 'Accept');
    var mail = kind === 'acc' && !ec;
    var h = '<div class="sw-card sw-ff' + (mail ? ' mail' : '') + '">' +
      '<div class="sw-ff-hd"><span class="sw-ff-d">' + esc(diasTxtB(p.dates).toUpperCase()) + '</span>' +
        '<span class="sw-ff-cd' + (left < 5 ? ' hot' : '') + '">' + esc(cd) + '</span>' + st + '</div>' +
      (kind === 'in' && p.expires_at ? '<div class="sw-ff-cad">' + esc(caducaTxt(p.expires_at)) + '</div>' : '') +
      '<div class="sw-ff-duo">' +
        ladoTrato(avatar(socio(p.partnerId), ''), nom + L(' te da', ' gives you'), p.gets, base) +
        '<span class="sw-ff-x">' + ICO_CAMBIO + '</span>' +
        ladoTrato(yo, L('Tú das', 'You give'), p.gives, base) + '</div>' +
      '<div class="sw-ff-ln"><span>' + (kind === 'acc' ? L('Propuesto · Aceptado', 'Proposed · Accepted') : L('Propuesto', 'Proposed')) + '</span>' +
        '<span class="sw-ff-bar"><i style="width:' + (kind === 'acc' ? 66 : 33) + '%"></i></span><b>' + esc(paso) + '</b></div>';
    if (kind === 'acc') h += '<div class="sw-sub sw-ff-sub">' + (ec ? L('Uno lo pide en eCrews y el otro lo acepta.', 'One of you requests it in eCrews and the other accepts.') : L('Quedan menos de 5 días: va por correo a la oficina de pilotos.', 'Less than 5 days to go: it goes by email to the pilots\' office.')) + '</div>';
    var btn = kind === 'acc' ? (ec ? L('Pedirlo en eCrews', 'Request it in eCrews') : '✉ ' + L('Mandar el correo', 'Send the email')) : L('Ver y responder', 'See and reply');
    return h + '<button class="sw-ff-go" data-prop="' + p.id + '">' + btn + '</button></div>';
  }
  /* «caduca en 1 d 5 h»: lo pendiente caduca solo (7 días una conexión, 48 h un swap). */
  function caducaTxt(iso) {
    var m = Math.round((Date.parse(iso || '') - Date.now()) / 60000);
    if (!isFinite(m)) return '';
    if (m <= 0) return L('caducando', 'expiring');
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return L('caduca en ', 'expires in ') + (d ? d + ' d ' + (h ? h + ' h' : '') : h ? h + ' h' : m + ' min');
  }
  function renderHome() {
    var body = $('sw-body'); if (!body) return;
    var me = (S.dir && S.dir.me) || { visible: false };
    pintaTabs(); pintaGear();
    /* Desconectado en el perfil: no hay Swap. Lo dice y deja encenderlo aquí. */
    if (!me.visible) {
      body.innerHTML = '<div class="sw-pad"><div class="sw-card sw-off">' +
        '<div class="sw-off-ico">⇄</div>' +
        '<div class="sw-name" style="font-size:17px">' + L('Tienes el Swap desconectado en tu perfil', 'Swap is turned off in your profile') + '</div>' +
        '<div class="sw-sub" style="margin:6px 0 14px">' + L('No puedes consultar cambios ni ver el roster de tus compañeros. Al conectarlo aparecerás para los pilotos de tu base y especialidad; solo se ve tu nombre, tu foto, tu base y tu especialidad.', 'You can\'t check swaps or see your colleagues\' rosters. Once it\'s on, pilots at your base and in your position can find you; they only see your name, photo, base and position.') + '</div>' +
        '<button class="sw-go" id="sw-on" style="width:100%">' + L('Conectar el Swap', 'Turn Swap on') + '</button>' +
        '<button class="sw-btn" id="sw-perfil" style="width:100%;margin-top:8px">' + L('Ir a Mi perfil', 'Go to My profile') + '</button></div></div>';
      $('sw-on').onclick = function () { this.disabled = true; this.textContent = L('Conectando…', 'Turning on…'); setVisible(true).catch(alertErr); };
      $('sw-perfil').onclick = function () { if (typeof goTo === 'function') goTo('perfil'); };
      return;
    }
    if (!me.base || !me.rol) {
      body.innerHTML = '<div class="sw-pad"><div class="sw-card"><div class="sw-sub">' + L('Pon tu <b>base</b> y tu <b>rol</b> (Comandante o Primer oficial) en Mi perfil para ver a los pilotos con los que puedes cambiar.', 'Set your <b>base</b> and <b>role</b> (Captain or First Officer) in My profile to see the pilots you can swap with.') + '</div>' +
        '<button class="sw-btn pri" style="width:100%;margin-top:10px" onclick="goTo(\'perfil\')">' + L('Ir a Mi perfil', 'Go to My profile') + '</button></div></div>';
      return;
    }
    var hoyS = today();
    var vivo = function (p) { return p.dates && p.dates.length && p.dates[p.dates.length - 1] >= hoyS; };
    var acc = S.contacts.filter(function (c) { return c.status === 'accepted'; });
    var inc = S.contacts.filter(function (c) { return c.status === 'pending' && c.incoming; });
    var outC = S.contacts.filter(function (c) { return c.status === 'pending' && !c.incoming; });
    var pIn = S.proposals.filter(function (p) { return p.incoming && p.status === 'proposed' && vivo(p); });
    var pAcc = S.proposals.filter(function (p) { return p.status === 'accepted' && vivo(p); });
    var pOut = S.proposals.filter(function (p) { return !p.incoming && p.status === 'proposed' && vivo(p); });
    var nTurno = inc.length + pIn.length + pAcc.length;

    var h = '<div class="sw-pad sw-home">';
    /* 1 · Te toca a ti */
    if (nTurno) {
      h += '<div class="sw-h">' + L('Te toca a ti', 'Your turn') + ' <span class="sw-hn">' + nTurno + '</span></div>';
      inc.forEach(function (c) {
        h += '<div class="sw-card sw-act"><div class="sw-who">' + avatar(c.partner, 'sm') + '<div><b>' + esc(c.partner.nombre || c.partner.email) + '</b><span>' + L('Quiere conectar contigo', 'Wants to connect with you') + (c.expires_at ? ' · ' + esc(caducaTxt(c.expires_at)) : '') + '</span></div></div>' +
             '<div class="sw-sub">' + L('Si aceptas, los dos veréis el roster del otro y podréis proponeros cambios.', 'If you accept, you will both see each other\'s roster and can propose swaps.') + '</div>' +
             '<div style="display:flex;gap:8px"><button class="sw-btn" style="flex:1" data-rm="' + c.id + '">' + L('Ahora no', 'Not now') + '</button><button class="sw-go" style="flex:2" data-acc="' + c.id + '">' + L('Aceptar', 'Accept') + '</button></div></div>';
      });
      pIn.forEach(function (p) { h += cardTrato(p, 'in'); });
      pAcc.forEach(function (p) { h += cardTrato(p, 'acc'); });
    }
    /* 2 · En marcha */
    if (pOut.length || outC.length) {
      h += '<div class="sw-h">' + L('En marcha', 'In progress') + '</div>';
      pOut.forEach(function (p) {
        h += '<div class="sw-card sw-line" data-prop="' + p.id + '">' + avatar(socio(p.partnerId), 'xs') + '<div class="x"><b>' + esc(diasTxtB(p.dates)) + ' · ' + esc(corto(p.partnerName)) + '</b><span>' +
             (p.gives ? L('Le propusiste cambiar ', 'You offered ') + esc(p.gives.map(rutaDe).join(' / ')) : L('Le propusiste un cambio', 'You proposed a swap')) +
             (p.expires_at ? ' · ' + esc(caducaTxt(p.expires_at)) : '') + '</span></div><button class="sw-btn" data-cancel="' + p.id + '">' + L('Retirar', 'Withdraw') + '</button></div>';
      });
      outC.forEach(function (c) {
        h += '<div class="sw-card sw-line">' + avatar(c.partner, 'xs wait') + '<div class="x"><b>' + esc(corto(c.partner.nombre || c.partner.email)) + '</b><span>' + L('Esperando a que acepte conectar', 'Waiting for them to accept') + (c.expires_at ? ' · ' + esc(caducaTxt(c.expires_at)) : '') + '</span></div><button class="sw-btn" data-rm="' + c.id + '">' + L('Retirar', 'Withdraw') + '</button></div>';
      });
    }
    /* 3 · ¿Qué día quieres cambiar? */
    h += '<div class="sw-h">' + L('¿Qué día quieres cambiar?', 'Which day do you want to swap?') + '</div>';
    var P = S.plan, dias = (P && P.days) || [];
    if (!P) h += '<div class="sw-card sw-sub">' + L('Mirando tus próximos días…', 'Checking your next days…') + '</div>';
    else if (P.error) h += '<div class="sw-card sw-err">' + esc(P.error) + '</div>';
    else if (!dias.some(function (d) { return d.card.kind !== 'empty'; })) h += '<div class="sw-card sw-sub">' + L('No hay roster importado para los próximos días. Importa tu roster y aquí verás con quién puedes cambiar cada día.', 'There is no roster imported for the coming days. Import your roster and you will see who you can swap each day with.') + '</div>';
    else {
      if (!S.selDay || !dias.some(function (d) { return d.date === S.selDay; })) {
        var pri = dias.filter(function (d) { return d.fits.some(function (f) { return f.ok; }); })[0] || dias.filter(function (d) { return d.card.kind !== 'empty'; })[0];
        S.selDay = pri ? pri.date : dias[0].date;
      }
      h += '<div class="sw-days" id="sw-days">' + dias.map(function (d) {
        var c = d.card, fl = c.kind === 'flight', vacio = c.kind === 'empty', ok = d.fits.some(function (f) { return f.ok; });
        return '<button class="sw-dayb' + (d.date === S.selDay ? ' on' : '') + (ok ? ' has' : '') + '" data-day="' + d.date + '"' + (vacio ? ' disabled' : '') + '>' +
               '<span class="dw">' + WD[wd(d.date)] + '</span><span class="dn">' + dnum(d.date) + '</span>' +
               '<span class="dd' + (fl ? '' : ' off') + '">' + esc(cortoDia(c)) + '</span><i class="dot"></i></button>';
      }).join('') + '</div>';
      var D = dias.filter(function (d) { return d.date === S.selDay; })[0];
      var oks = D.fits.filter(function (f) { return f.ok; }).length, left = dayDiff(hoyS, D.date);
      h += '<div class="sw-card sw-dayres"><div class="t">' + esc(fLarga(D.date)) + ' · ' + esc(rutaDe(D.card)) + '</div>';
      if (!acc.length) h += '<div class="sw-sub">' + L('Aún no tienes compañeros conectados. Añade alguno abajo o ofrece el día a toda tu base:', 'You have no connected colleagues yet. Add some below or offer the day to your whole base:') + '</div>';
      else if (!D.fits.length) h += '<div class="sw-sub">' + L('Tus compañeros tienen ese día lo mismo que tú o no tienen roster.', 'Your colleagues have the same as you that day, or no roster.') + '</div>';
      else h += '<div class="sw-sub">' + (oks ? oks + (oks > 1 ? L(' compañeros te lo pueden cambiar sin romper descansos:', ' colleagues can swap it without breaking rest:') : L(' compañero te lo puede cambiar sin romper descansos:', ' colleague can swap it without breaking rest:')) : L('Ningún compañero te lo puede cambiar ese día:', 'No colleague can swap it that day:')) + '</div>';
      D.fits.forEach(function (f, k) {
        var pp = socio(f.id), por = f.ok ? '' : motivoKo({ verdict: f.verdict, poster: pp });
        h += '<button class="sw-opt' + (f.ok ? '' : ' no') + '" data-fit="' + k + '">' + avatar(pp, 'xs') + '<div class="x"><b>' + esc(pp.nombre || '') + '</b><span>' + L('Te daría: ', 'You would get: ') + esc(rutaDe(f.card)) + (por ? ' · ' + esc(por) : '') + '</span></div>' +
             '<span class="sw-chip ' + (f.ok ? 'ok' : 'no') + '">' + (f.ok ? L('Cuadra', 'Works') : 'No') + '</span></button>';
      });
      h += '<button class="sw-offer" id="sw-offer"><span class="ic">＋</span><span><b>' + L('Ofrecer este día en el Swap Board', 'Offer this day on the Swap Board') + '</b><em>' +
           L('Lo ve toda tu base (' + esc(me.base) + ' · ' + esc(me.rol) + ') y te avisamos si hay match', 'Your whole base (' + esc(me.base) + ' · ' + esc(me.rol) + ') sees it and we let you know if there is a match') + '</em></span></button>';
      if (left < 5) h += '<div class="sw-sub" style="font-size:12px">' + L('Faltan menos de 5 días: el cambio irá por correo a la oficina de pilotos.', 'Less than 5 days to go: the swap will go by email to the pilots\' office.') + '</div>';
      h += '</div>';
    }
    /* 4 · Tus compañeros */
    /* Mantener pulsada una cara → modo edición (como los iconos del iPhone): tiemblan
       y sale la ✕ para quitarlo. «Listo» o tocar fuera, para salir. */
    if (!acc.length) S.crewEdit = false;
    var ed = !!S.crewEdit;
    h += '<div class="sw-h">' + L('Tus compañeros', 'Your colleagues') + '</div><div class="sw-crew' + (ed ? ' edit' : '') + '" id="sw-crew">' +
         acc.map(function (c) {
           return '<div class="sw-mate" role="button" tabindex="0" data-open="' + c.partner.id + '">' + avatar(c.partner, '') + '<b>' + esc(corto(c.partner.nombre || c.partner.email)) + '</b>' +
                  (ed ? '<button class="sw-x" data-x="' + c.id + '" aria-label="' + esc(L('Quitar a ', 'Remove ') + (c.partner.nombre || '')) + '">✕</button>' : '') + '</div>';
         }).join('') +
         (ed ? '<button class="sw-mate done" id="sw-crew-ok"><div class="sw-av"><span>✓</span></div><b>' + L('Listo', 'Done') + '</b></button>'
             : '<button class="sw-mate add" id="sw-add-mate"><div class="sw-av"><span>＋</span></div><b>' + L('Añadir', 'Add') + '</b></button>') + '</div>';
    h += '<div class="sw-sub sw-priv">' + (acc.length && !ed ? L('Mantén pulsado un compañero para quitarlo. ', 'Press and hold a colleague to remove them. ') : '') +
         L('Solo ves el roster de quien acepta conectar contigo, y él solo ve el tuyo.', 'You only see the roster of people who accept your connection, and they only see yours.') + '</div>';
    h += '</div>';
    body.innerHTML = h;
    entrada(body);
    var dd = $('sw-days'), on = dd && dd.querySelector('.on');
    if (on) { var x = on.offsetLeft - 16; if (S._daysScroll != null) dd.scrollLeft = S._daysScroll; else if (x > 0) dd.scrollLeft = x; }
    if (dd) dd.onscroll = function () { S._daysScroll = dd.scrollLeft; };

    body.querySelectorAll('[data-acc]').forEach(function (b) { b.onclick = function () { api('/api/swap/contacts/' + b.dataset.acc + '/accept', {}).then(function () { loadHome(); loadPlan(true); }, alertErr); }; });
    body.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); api('/api/swap/contacts/' + b.dataset.rm + '/remove', {}).then(loadHome, alertErr); }; });
    body.querySelectorAll('[data-open]').forEach(function (b) {
      var lp = null, x0 = 0, y0 = 0;
      var suelta = function () { clearTimeout(lp); lp = null; };
      b.addEventListener('pointerdown', function (ev) {
        if (S.crewEdit) return;
        x0 = ev.clientX; y0 = ev.clientY; suelta();
        lp = setTimeout(function () {
          lp = null; S.crewEdit = true; S._lpHecho = true;
          if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) {}
          renderHome();
        }, 500);
      });
      b.addEventListener('pointermove', function (ev) { if (lp && (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8)) suelta(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { b.addEventListener(t, suelta); });
      b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
      b.onclick = function () {
        if (S._lpHecho) { S._lpHecho = false; return; }   // el clic que sigue a la pulsación larga
        if (S.crewEdit) return;
        var c = acc.filter(function (x) { return x.partner.id === b.dataset.open; })[0]; if (c) openPair(c.partner, null, null);
      };
    });
    body.querySelectorAll('[data-x]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var c = acc.filter(function (x) { return x.id === b.dataset.x; })[0]; if (!c) return;
        var nm = c.partner.nombre || c.partner.email || '';
        if (!confirm(L('¿Quitar a ' + nm + ' de tus compañeros? Dejaréis de ver el roster el uno del otro. No le llega ningún aviso.',
                       'Remove ' + nm + ' from your colleagues? You will stop seeing each other\'s roster. They will not be notified.'))) return;
        var m = b.closest('.sw-mate'); if (m) m.classList.add('bye');
        api('/api/swap/contacts/' + c.id + '/remove', {}).then(function () {
          S.contacts = S.contacts.filter(function (x) { return x.id !== c.id; });
          renderHome(); loadHome(); loadPlan(true);
        }, function (e) { if (m) m.classList.remove('bye'); alertErr(e); });
      };
    });
    var ok = $('sw-crew-ok'); if (ok) ok.onclick = function () { S.crewEdit = false; renderHome(); };
    if (S.crewEdit) body.onclick = function (ev) { if (!ev.target.closest('#sw-crew')) { S.crewEdit = false; body.onclick = null; renderHome(); } };
    else body.onclick = null;
    body.querySelectorAll('[data-day]').forEach(function (b) {
      b.onclick = function () { S.selDay = b.dataset.day; if (navigator.vibrate) try { navigator.vibrate(6); } catch (e) {} renderHome(); };
    });
    body.querySelectorAll('[data-fit]').forEach(function (b) {
      b.onclick = function () {
        var D = (S.plan.days || []).filter(function (d) { return d.date === S.selDay; })[0], f = D && D.fits[+b.dataset.fit]; if (!f) return;
        if (!f.ok) return alertErr(new Error(motivoKo({ verdict: f.verdict, poster: socio(f.id) }) || L('Ese día no cuadra', 'That day does not work')));
        openPair(socio(f.id), [D.date], null);
      };
    });
    body.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        if (!confirm(L('¿Retirar esta propuesta? A tu compañero le desaparecerá.', 'Withdraw this proposal? It will disappear for your colleague.'))) return;
        b.disabled = true;
        api('/api/swap/proposals/' + b.dataset.cancel + '/cancel', {}).then(loadHome, function (e) { b.disabled = false; alertErr(e); });
      };
    });
    var of = $('sw-offer'); if (of) of.onclick = function () { openPublish(null, S.selDay); };
    var am = $('sw-add-mate'); if (am) am.onclick = abreAnadir;
    body.querySelectorAll('[data-prop]').forEach(function (b) {
      b.onclick = function () {
        var p = S.proposals.filter(function (x) { return x.id === b.dataset.prop; })[0]; if (!p) return;
        var c = S.contacts.filter(function (x) { return x.partner.id === p.partnerId && x.status === 'accepted'; })[0];
        // Una propuesta del Swap Board se abre sin conexión (el servidor enseña solo esos días).
        if (!c && p.summary && p.summary.board) return openPair({ id: p.partnerId, nombre: p.partnerName }, p.dates, p);
        if (!c) return alertErr(new Error(L('Ya no estáis conectados', 'You are no longer connected')));
        openPair(c.partner, p.dates, p);
      };
    });
    // El número de la pestaña del tablón: se pide una vez y se pinta en la barra, sin repintar la lista.
    if (S.board == null && !_boardPidiendo) { _boardPidiendo = true; api('/api/swap/board').then(function (j) { if (S.board == null) S.board = j; pintaTabs(); }, function () {}).then(function () { _boardPidiendo = false; }); }
    loadPlan(false);
  }

  /* ⚙ en la cabecera (solo en las listas): desconectar y privacidad, fuera del camino. */
  /* La turbina del logbook (misma silueta que su menú), en los colores del Swap y
     girando despacio; al tocarla acelera. */
  var TURBINA = '<svg class="sw-turb" viewBox="0 0 425.35 434.51" width="24" height="24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M211.97,22.6c108.86,0,197.12,88.25,197.12,197.11s-88.25,197.11-197.12,197.11S14.86,328.58,14.86,219.72,103.11,22.6,211.97,22.6h0ZM177.14,258.27c-8.18,12.48-29.66,45.31-40.57,62.3-8.58,13.37-16.14,27.84-34.28,29.74-7.25.76-12.08,1.99-15.84,4.14,10.46,9.75,22.05,18.3,34.56,25.42,2.57-2.85,6.21-5.69,11.69-8.25,14.63-6.83,22.53-14.1,30.66-35.22,6.79-17.66,18.8-58.72,22.56-71.72-3.15-1.83-6.09-3.98-8.78-6.41h0ZM71.75,339.08c3.39-1.79,7.77-3.21,13.77-3.74,16.08-1.41,25.99-5.54,40.86-22.61,12.43-14.27,37.77-48.76,45.74-59.68-2.32-2.77-4.36-5.79-6.07-9.01-11.96,8.94-43.37,32.43-59.42,44.66-12.64,9.63-24.69,20.64-42.38,16.22-7.1-1.78-12.07-2.27-16.36-1.52,6.56,12.84,14.59,24.81,23.87,35.69h0ZM242.67,38.13c-1.44,3.56-3.89,7.47-8.16,11.74-11.42,11.42-16.36,20.95-16.77,43.58-.35,18.92,2.41,61.61,3.32,75.11,3.63.64,7.12,1.66,10.45,3.01,3.42-14.53,12.38-52.72,16.81-72.41,3.49-15.5,5.64-31.68,22.04-39.67,6.59-3.21,10.71-6.03,13.51-9.35-13.04-5.53-26.85-9.6-41.22-12.01h0ZM213.87,167.8c-1.76-14.82-6.4-53.78-8.97-73.8-2.02-15.76-5.53-31.7,7.15-44.82,5.08-5.25,7.98-9.29,9.48-13.37-3.17-.16-6.35-.25-9.56-.25-11.36,0-22.47,1.03-33.26,3-.14,3.84-1.1,8.35-3.65,13.83-6.82,14.63-8.2,25.28-.85,46.69,6.15,17.89,23.34,57.07,28.81,69.44,2.91-.5,5.89-.77,8.95-.77.64,0,1.27.02,1.9.04h0ZM302.93,59.57c-2.57,2.85-6.21,5.7-11.69,8.25-14.63,6.83-22.54,14.1-30.66,35.22-6.8,17.66-18.81,58.72-22.57,71.72,3.15,1.83,6.1,3.98,8.78,6.41,8.18-12.48,29.66-45.31,40.57-62.3,8.58-13.37,16.14-27.84,34.28-29.74,7.25-.76,12.07-1.99,15.84-4.14-10.46-9.75-22.05-18.3-34.56-25.42h0ZM352.19,100.36c-3.39,1.79-7.77,3.21-13.77,3.74-16.08,1.41-26,5.54-40.86,22.61-12.43,14.27-37.77,48.76-45.74,59.68,2.32,2.77,4.36,5.79,6.07,9.02,11.96-8.94,43.37-32.43,59.42-44.66,12.64-9.63,24.69-20.64,42.38-16.22,7.1,1.78,12.07,2.27,16.36,1.52-6.56-12.84-14.59-24.81-23.86-35.69h0ZM384.61,155.51c-3.81.53-8.43.38-14.27-1.19-15.6-4.18-26.32-3.69-46.13,7.27-16.55,9.16-52.14,32.88-63.38,40.43,1.22,3.37,2.1,6.9,2.6,10.56,14.29-4.31,51.85-15.64,71.12-21.65,15.17-4.73,30.26-10.95,45.38-.74,6.05,4.09,10.54,6.25,14.82,7.02-1.76-14.49-5.21-28.45-10.14-41.7h0ZM396.1,218.41c-3.75-.81-8.02-2.53-12.95-5.99-13.23-9.26-23.47-12.47-45.83-8.94-18.69,2.95-60.27,13.08-73.4,16.32,0,3.71-.4,7.32-1.14,10.81,14.9.84,54.07,3.04,74.23,3.98,15.87.75,32.18.06,42.89,14.82,4.3,5.93,7.79,9.49,11.55,11.68,3.06-13.3,4.67-27.15,4.67-41.37,0-.44-.01-.87-.02-1.31h0ZM385.49,281.49c-3.26-2.04-6.69-5.13-10.17-10.08-9.26-13.22-17.79-19.74-40.01-24.08-18.57-3.62-61.07-8.32-74.54-9.77-1.26,3.44-2.87,6.71-4.79,9.76,13.71,5.89,49.77,21.34,68.39,29.13,14.66,6.13,30.22,11.06,35.24,28.6,2.01,7.02,4.06,11.56,6.84,14.9,7.76-11.94,14.17-24.83,19.03-38.47h0ZM353.87,337.09c-2.36-3.03-4.52-7.1-6.08-12.92-4.18-15.6-9.97-24.64-29.36-36.31-16.21-9.76-54.58-28.73-66.71-34.68-2.34,2.78-4.97,5.3-7.83,7.54,10.87,10.22,39.47,37.08,54.31,50.77,11.68,10.77,24.61,20.73,23.33,38.93-.51,7.28-.14,12.25,1.33,16.34,11.46-8.65,21.87-18.61,31.02-29.66h0ZM305.18,378.56c-1.18-3.65-1.83-8.22-1.3-14.24,1.41-16.09-.94-26.56-15.17-44.16-11.9-14.71-41.45-45.64-50.82-55.4-3.12,1.8-6.45,3.28-9.94,4.41,6.72,13.33,24.4,48.34,33.66,66.27,7.29,14.12,16.04,27.9,8.61,44.56-2.98,6.69-4.33,11.49-4.34,15.85,13.86-4.24,27.03-10.07,39.3-17.29h0ZM245.23,400.87c.14-3.84,1.1-8.36,3.65-13.83,6.82-14.64,8.2-25.28.85-46.69-6.15-17.89-23.34-57.07-28.81-69.44-2.91.51-5.9.77-8.95.77-.64,0-1.27-.01-1.9-.04,1.76,14.82,6.4,53.78,8.97,73.8,2.02,15.76,5.53,31.7-7.15,44.82-5.08,5.25-7.98,9.29-9.49,13.37,3.17.16,6.36.25,9.56.25,11.36,0,22.47-1.03,33.26-3h0ZM181.27,401.31c1.44-3.56,3.89-7.47,8.16-11.74,11.41-11.42,16.35-20.95,16.77-43.58.34-18.92-2.41-61.61-3.32-75.11-3.63-.64-7.12-1.66-10.45-3.01-3.42,14.53-12.38,52.71-16.81,72.41-3.49,15.5-5.64,31.68-22.04,39.67-6.59,3.21-10.71,6.03-13.51,9.35,13.04,5.53,26.85,9.6,41.22,12.01h0ZM39.34,283.93c3.81-.53,8.43-.37,14.27,1.19,15.6,4.18,26.32,3.69,46.12-7.27,16.55-9.16,52.14-32.89,63.38-40.43-1.22-3.37-2.1-6.9-2.6-10.56-14.29,4.31-51.85,15.64-71.12,21.65-15.17,4.73-30.26,10.95-45.37.74-6.05-4.09-10.54-6.25-14.82-7.02,1.76,14.49,5.21,28.45,10.14,41.7h0ZM27.84,221.02c3.75.81,8.02,2.53,12.95,5.99,13.23,9.26,23.47,12.47,45.83,8.94,18.69-2.95,60.27-13.07,73.4-16.32,0-3.71.4-7.32,1.14-10.81-14.9-.84-54.07-3.04-74.23-3.98-15.87-.75-32.18-.06-42.89-14.82-4.3-5.93-7.79-9.49-11.55-11.68-3.06,13.3-4.67,27.15-4.67,41.37,0,.44.01.87.02,1.31h0ZM38.45,157.94c3.26,2.04,6.7,5.13,10.17,10.08,9.26,13.23,17.79,19.75,40.01,24.08,18.57,3.62,61.08,8.32,74.54,9.77,1.26-3.44,2.87-6.71,4.79-9.76-13.71-5.89-49.77-21.35-68.39-29.13-14.66-6.13-30.22-11.06-35.24-28.6-2.01-7.03-4.06-11.56-6.84-14.9-7.76,11.94-14.17,24.83-19.03,38.47h0ZM70.07,102.35c2.36,3.03,4.52,7.1,6.08,12.92,4.18,15.6,9.97,24.64,29.36,36.31,16.22,9.76,54.57,28.73,66.71,34.68,2.34-2.78,4.97-5.3,7.83-7.54-10.87-10.22-39.47-37.08-54.31-50.77-11.68-10.77-24.61-20.73-23.33-38.93.51-7.28.14-12.25-1.33-16.34-11.46,8.65-21.87,18.61-31.02,29.66h0ZM118.76,60.88c1.18,3.65,1.83,8.22,1.3,14.24-1.41,16.09.94,26.56,15.17,44.16,11.9,14.71,41.45,45.64,50.82,55.4,3.12-1.8,6.45-3.28,9.94-4.41-6.72-13.33-24.4-48.34-33.66-66.27-7.29-14.12-16.04-27.9-8.61-44.56,2.98-6.69,4.33-11.49,4.34-15.85-13.86,4.24-27.03,10.07-39.3,17.29h0ZM211.97,195.74c-13.24,0-23.98,10.74-23.98,23.98s10.74,23.98,23.98,23.98,23.98-10.74,23.98-23.98-10.74-23.98-23.98-23.98Z"/></svg>';
  function pintaGear() {
    var r = document.querySelector('#scr-swap .ih-right'); if (!r) return;
    var ver = !!token() && !S.partner && !!(S.dir && S.dir.me && S.dir.me.visible);
    if (!ver) { r.innerHTML = ''; return; }
    if (!$('sw-gear')) { r.innerHTML = '<button class="sw-gear" id="sw-gear" aria-label="' + L('Ajustes del Swap', 'Swap settings') + '"><i class="sw-gear-ring"></i>' + TURBINA + '</button>';
      $('sw-gear').onclick = function () {
        var g = this; g.classList.add('spin'); setTimeout(function () { g.classList.remove('spin'); }, 900);
        setTimeout(abreAjustes, 220);
      };
    }
  }
  function abreAjustes() {
    var e = sheetEls(), me = (S.dir && S.dir.me) || {};
    e.sh.innerHTML = '<div class="grab"></div><div class="sw-name" style="font-size:18px">' + L('Ajustes del Swap', 'Swap settings') + '</div>' +
      '<div class="sw-sub" style="margin:8px 0 14px">' + L('Apareces para los pilotos de ', 'Pilots at ') + esc(me.base || '') + ' · ' + esc(me.rol || '') + L(' con el Swap conectado. Solo ven tu nombre, tu foto, tu base y tu especialidad. Tu roster solo lo ve quien acepta conectar contigo, y tú solo el suyo.', ' with Swap on can see you. They only see your name, photo, base and position. Only people who accept your connection see your roster, and you only see theirs.') + '</div>' +
      '<button class="sw-btn" id="sw-off2" style="width:100%;color:var(--sw-ko)">' + L('Desconectar el Swap', 'Turn Swap off') + '</button>' +
      '<button class="sw-btn" id="sw-aj-no" style="width:100%;margin-top:8px">' + L('Cerrar', 'Close') + '</button>';
    e.sh.classList.add('open'); e.bg.classList.add('open');
    $('sw-aj-no').onclick = closeSheet;
    $('sw-off2').onclick = function () {
      if (!confirm(L('¿Desconectar el Swap? Dejarás de aparecer y nadie podrá ver tu roster.', 'Turn Swap off? You will disappear and nobody will be able to see your roster.'))) return;
      closeSheet(); setVisible(false).catch(alertErr);
    };
  }
  /* «＋ Añadir» SIN correo (reporte 17-oct: «no es nada rápido con el correo»).
     Lista con buscador por nombre: primero los de tu base y rol y, debajo, los
     que tienen el Swap conectado pero aún no han puesto base o rol en su perfil
     (eran la mayoría y no salían en ningún sitio). Un toque en «Pedir» y sale la
     petición, sin hoja de confirmación. El correo queda plegado al final. */
  function abreAnadir() {
    var e = sheetEls(), me = (S.dir && S.dir.me) || {};
    var estado = {};
    S.contacts.forEach(function (c) { estado[c.partner.id] = c.status === 'accepted' ? 'acc' : c.incoming ? 'in' : 'out'; });
    var libres = function (L0) { return (L0 || []).filter(function (p) { return estado[p.id] !== 'acc'; }); };
    var mios = libres(S.dir && S.dir.pilots), otros = libres(S.dir && S.dir.others);
    var todos = mios.concat(otros);
    var fila = function (p) {
      var st = estado[p.id], sub = [p.chequeo && p.chequeo !== String(p.nombre || '').toUpperCase() ? p.chequeo : '', p.rol, p.base || L('sin base en su perfil', 'no base in profile')].filter(Boolean).join(' · ');
      return '<div class="sw-pick" data-n="' + esc(((p.nombre || '') + ' ' + (p.chequeo || '')).toLowerCase()) + '">' + avatar(p, 'xs') +
        '<div class="x"><b>' + esc(p.nombre || '—') + '</b><span>' + esc(sub) + '</span></div>' +
        (st === 'out' ? '<span class="sw-st">' + L('Enviada', 'Sent') + '</span>'
          : '<button class="sw-btn ' + (st === 'in' ? 'ok' : 'pri') + '" data-pick="' + p.id + '">' + (st === 'in' ? L('Aceptar', 'Accept') : L('Pedir', 'Request')) + '</button>') + '</div>';
    };
    var h = '<div class="grab"></div><div class="sw-name" style="font-size:18px">' + L('Añadir compañeros', 'Add colleagues') + '</div>' +
      '<input class="sw-input" id="sw-busca" type="search" placeholder="' + L('Buscar por nombre o nombre de chequeo…', 'Search by name or check-in name…') + '" autocomplete="off" style="margin:10px 0 4px">';
    h += '<div class="sw-h">' + L('De tu base', 'From your base') + (me.base && me.rol ? ' · ' + esc(me.base) + ' · ' + esc(me.rol) : '') + '</div>';
    h += mios.length ? '<div class="sw-picks">' + mios.map(fila).join('') + '</div>'
      : '<div class="sw-sub">' + (((S.dir && S.dir.pilots) || []).length ? L('Ya tienes a todos los de tu base que usan el Swap.', 'You already have everyone at your base who uses Swap.') : L('Nadie más de tu base tiene el Swap conectado todavía.', 'Nobody else at your base has Swap on yet.')) + '</div>';
    if (otros.length) h += '<div class="sw-h">' + L('Con el Swap, sin base en su perfil', 'With Swap, no base in their profile') + '</div><div class="sw-picks">' + otros.map(fila).join('') + '</div>';
    h += '<div class="sw-sub" id="sw-busca-0" hidden>' + L('Nadie con ese nombre tiene el Swap conectado.', 'Nobody with that name has Swap on.') + '</div>';
    h += '<details class="sw-mailbox" style="margin-top:14px"><summary>' + L('¿No sale? Añádelo por correo', 'Not listed? Add by email') + '</summary>' +
      '<div style="margin-top:8px"><input class="sw-input" id="sw-email" type="email" placeholder="' + L('nombre@correo.com', 'name@email.com') + '" autocomplete="off">' +
      '<div class="sw-err" id="sw-email-err"></div>' +
      '<button class="sw-go" id="sw-add" style="width:100%;margin-top:8px">' + L('Enviar petición', 'Send request') + '</button></div></details>' +
      '<button class="sw-btn" id="sw-an-no" style="width:100%;margin-top:12px">' + L('Cerrar', 'Close') + '</button>';
    e.sh.innerHTML = h; e.sh.classList.add('open'); e.bg.classList.add('open');
    $('sw-an-no').onclick = closeSheet;
    $('sw-busca').oninput = function () {
      var q = this.value.trim().toLowerCase(), n = 0;
      e.sh.querySelectorAll('.sw-pick').forEach(function (r) { var v = !q || r.dataset.n.indexOf(q) >= 0; r.hidden = !v; if (v) n++; });
      $('sw-busca-0').hidden = !(q && !n);
    };
    e.sh.querySelectorAll('[data-pick]').forEach(function (b) {
      b.onclick = function () {
        var p = todos.filter(function (x) { return x.id === b.dataset.pick; })[0]; if (!p) return;
        b.disabled = true;
        if (estado[p.id] === 'in') {
          var c = S.contacts.filter(function (x) { return x.incoming && x.partner.id === p.id; })[0];
          return c && api('/api/swap/contacts/' + c.id + '/accept', {}).then(function () { b.outerHTML = '<span class="sw-st ok">✓ ' + L('Conectados', 'Connected') + '</span>'; loadHome(); loadPlan(true); }, function (x) { b.disabled = false; alertErr(x); });
        }
        b.textContent = '…';
        api('/api/swap/contacts', { userId: p.id }).then(function (j) {
          b.outerHTML = '<span class="sw-st ' + (j.status === 'accepted' ? 'ok' : '') + '">' + (j.status === 'accepted' ? '✓ ' + L('Conectados', 'Connected') : '✓ ' + L('Enviada', 'Sent')) + '</span>';
          try { window.swapChime && window.swapChime(); } catch (x) {}
          loadHome();
        }, function (x) { b.disabled = false; b.textContent = L('Pedir', 'Request'); alertErr(x); });
      };
    });
    $('sw-email').oninput = function () { $('sw-email-err').textContent = ''; };
    $('sw-add').onclick = function () {
      var add = this, em = ($('sw-email').value || '').trim(), er = $('sw-email-err');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { er.textContent = L('Escribe un correo válido', 'Enter a valid email'); return; }
      er.textContent = ''; add.disabled = true;
      api('/api/swap/contacts', { email: em }).then(function (j) {
        add.disabled = false; $('sw-email').value = '';
        er.style.color = 'var(--sw-ok)'; er.textContent = j.status === 'accepted' ? L('Conectados', 'Connected') : L('Petición enviada', 'Request sent');
        loadHome();
      }, function (x) { add.disabled = false; er.style.color = ''; er.textContent = x.message; });
    };
  }

  /* Un toque en un piloto: confirmación en la hoja inferior y la petición sale
     (con su push, correo y aviso en la campana). */
  function pideConexion(p) {
    var e = sheetEls();
    e.sh.innerHTML = '<div class="grab"></div><div style="text-align:center;padding:6px 0 4px">' + avatar(p, 'xl') +
      '<div class="sw-name" style="font-size:18px;margin-top:10px">' + esc(p.nombre) + '</div>' +
      '<div class="sw-sub">' + esc([p.rol, p.base].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="sw-sub" style="margin:12px 0 16px">' + L('Le llegará un aviso para conectar. Cuando acepte, los dos veréis el roster del otro y podréis proponeros cambios.', 'They will get a connection request. Once they accept, you will both see each other\'s roster and can propose swaps.') + '</div>' +
      '<button class="sw-go" id="sw-pide" style="width:100%">' + L('Pedir conexión', 'Request connection') + '</button>' +
      '<button class="sw-btn" id="sw-pide-no" style="width:100%;margin-top:8px">' + L('Cancelar', 'Cancel') + '</button></div>';
    e.sh.classList.add('open'); e.bg.classList.add('open');
    $('sw-pide-no').onclick = closeSheet;
    $('sw-pide').onclick = function () {
      var b = this; b.disabled = true; b.textContent = L('Enviando…', 'Sending…');
      api('/api/swap/contacts', { userId: p.id }).then(function (j) {
        b.textContent = j.status === 'accepted' ? L('✓ Conectados', '✓ Connected') : L('✓ Petición enviada', '✓ Request sent');
        try { window.swapChime && window.swapChime(); } catch (x) {}
        setTimeout(function () { closeSheet(); loadHome(); }, 900);
      }, function (er) { b.disabled = false; b.textContent = L('Pedir conexión', 'Request connection'); alertErr(er); });
    };
  }
  /* Propuesta enviada (23-oct-2026): como el «Roster sincronizado» de eCrews pero en el
     magenta del tablón. El BOTÓN se vuelve magenta con un ✓ que se dibuja y dos ondas
     (es donde mira el piloto) y arriba sale la tarjeta de aviso común (_ecAviso, tipo
     'swap') con un avión de papel, a quién y qué días. Una sola tarjeta para toda la
     app: si cada sección tuviera la suya acabarían comportándose distinto. */
  var ICO_OK = '<svg class="sw-sent-ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>';
  function enviadoFx(b, nombre, ds) {
    if (b) {
      b.classList.remove('sw-sent'); void b.offsetWidth;
      b.innerHTML = ICO_OK + '<span>' + esc(L('Propuesta enviada a ', 'Proposal sent to ') + nombre) + '</span><i class="sw-sent-r"></i><i class="sw-sent-r"></i>';
      b.classList.add('sw-sent');
    }
    try {
      if (typeof window._ecAviso === 'function') window._ecAviso('swap', L('Propuesta enviada a ', 'Proposal sent to ') + nombre,
        (ds && ds.length ? '<b>' + esc(diasTxtB(ds)) + '</b> · ' : '') + esc(L('Te avisamos cuando conteste', 'We\'ll let you know when they reply')), { dur: 3600 });
    } catch (x) {}
    try { window.swapChime && window.swapChime(); } catch (x) {}
  }
  function alertErr(e) { try { if (typeof showToast === 'function') return showToast(e.message); } catch (x) {} alert(e.message); }

  /* ── SWAP BOARD: el tablón de la base ───────────────────────────────────────
     Los anuncios los evalúa el SERVIDOR con el motor compartido (swap-motor.js):
     aquí llega, para cada uno, si cuadra conmigo y por qué no — nunca el roster
     del otro. Lo que no cuadra o no es lo que busca el otro se enseña igual,
     apagado: ver el tablón entero también dice algo. */
  var _boardPidiendo = false;
  var CAT_ORD = ['early', 'late', 'linea', 'pernocta', 'imag', 'libre'];
  function catNom(k) {
    // OFF y STBY: como lo llama el piloto (y como sale en el roster), no «Libre» / «Imaginaria».
    return ({ early: 'Early', late: 'Late', linea: L('Línea', 'Line'), pernocta: L('Pernocta', 'Layover'), imag: 'STBY',
              libre: 'OFF', otro: L('Otro', 'Other'), any: L('Me vale cualquiera', 'Anything') })[k] || k;
  }
  var MES3 = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fCorta(iso) { return WD[wd(iso)] + ' ' + dnum(iso) + ' ' + MES3[+iso.slice(5, 7) - 1]; }
  function fLarga(iso) { var n = WDN[wd(iso)]; return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + dnum(iso) + ' ' + MES3[+iso.slice(5, 7) - 1]; }
  function diasTxtB(ds) { return ds.length > 1 ? fCorta(ds[0]) + ' – ' + fCorta(ds[ds.length - 1]) : fLarga(ds[0]); }
  function hace(iso) {
    var m = Math.max(0, Math.round((Date.now() - Date.parse(iso || '')) / 60000));
    if (!isFinite(m)) return '';
    if (m < 60) return L('hace ', '') + Math.max(1, m) + L(' min', ' min ago');
    var h = Math.round(m / 60); if (h < 24) return L('hace ', '') + h + L(' h', ' h ago');
    var d = Math.round(h / 24); return d === 1 ? L('ayer', 'yesterday') : L('hace ', '') + d + L(' días', ' days ago');
  }
  function resumenDia(c) {
    if (!c || c.kind === 'empty') return L('Sin roster', 'No roster');
    if (c.kind === 'flight' && c.legs && c.legs.length) {
      var ap = [c.legs[0].dep].concat(c.legs.map(function (l) { return l.arr; }));
      return ap.join('–') + ' · ' + L('firma ', 'report ') + clock(c.report);
    }
    if (c.report != null) return (c.code || '') + ' ' + clockN(c.report) + '–' + clockN(c.end);
    return c.code || 'OFF';
  }
  function wantsTxt(ws) {
    if (!ws || !ws.length || ws.indexOf('any') >= 0) return catNom('any');
    return ws.map(catNom).join(L(' o ', ' or '));
  }
  function estadoDe(p) { return p.mine ? 'mine' : !p.verdict || !p.verdict.ok ? 'ko' : !p.wantsMatch ? 'no' : 'ok'; }
  function balTxt(b) {
    if (!b) return '';
    if (b.block) return (b.block > 0 ? '+' : '−') + hhmm(Math.abs(b.block)) + L(' h de vuelo', ' h flying');
    if (b.fly) return (b.fly < 0 ? '+' + (-b.fly) : '−' + b.fly) + ' OFF';
    if (b.early) return (b.early > 0 ? '+' : '−') + Math.abs(b.early) + L(' madrugón', ' early start');
    if (b.duty) return (b.duty > 0 ? '+' : '−') + hhmm(Math.abs(b.duty)) + L(' h de actividad', ' h duty');
    return L('mismas horas', 'same hours');
  }
  function motivoKo(p) {
    var v = p.verdict || {}, nm = firstName(p.poster);
    var quien = function (w) { return w === 'me' ? L('Tú', 'You') : nm; };
    if (v.worst) return quien(v.worst.who) + ': ' + hhmm(v.worst.rest) + (v.worst.fuera ? L(' de descanso fuera de base antes del ', ' rest away from base before ') : v.worst.sim ? L(' de descanso antes del simulador del ', ' rest before the simulator on ') : L(' de descanso antes del ', ' rest before ')) + fCorta(v.worst.day);
    if (v.sLib) return quien(v.sLib.who) + ': ' + v.sLib.n + L(' imaginarias antes de libre en ', ' standbys before a day off in ') + MES[+v.sLib.mes.slice(5, 7) - 1];
    if (v.s3) return quien(v.s3.who) + ': ' + L('3 imaginarias a ', '3 standbys only ') + v.s3.gap + L(' días del bloque anterior', ' days after the previous block');
    if (v.corte) return quien(v.corte.who) + ': ' + L('las STBY van en bloque (', 'standbys go as a block (') + fCorta(v.corte.a) + (v.corte.b !== v.corte.a ? ' – ' + fCorta(v.corte.b) : '') + ')';
    if (v.linea) return quien(v.linea.who) + ': ' + L('la línea con pernocta va entera (', 'the layover line goes whole (') + fCorta(v.linea.a) + ' – ' + fCorta(v.linea.b) + ')';
    if (v.inv) return quien(v.inv.who) + ': ' + L('posible invasión de día libre (calzos ', 'possible day-off invasion (on-blocks ') + finLocal(v.inv.fin) + L(' del ', ' on ') + fCorta(v.inv.day) + ')';
    if (v.over7) return L('Más de 60 h de actividad en 7 días', 'Over 60 h of duty in 7 days');
    return L('No cuadra', 'Doesn\'t work');
  }

  /* ── ¡MATCH! ────────────────────────────────────────────────────────────────
     Se celebra UNA vez por pareja de anuncios (localStorage, por id). Los dos
     avatares entran desde los lados y chocan, «¡MATCH!» rebota y cae confeti con
     los colores del Swap. Todo transform/opacity, en la capa de <body> (como la
     ficha del día) para quedar por encima de la barra de abajo. */
  var MATCH_KEY = 'pilotos_swap_match_vistos';
  function matchId(p) { return p.id + ':' + (p.match || ''); }
  function matchVisto(p) { try { return (JSON.parse(localStorage.getItem(MATCH_KEY) || '[]')).indexOf(matchId(p)) >= 0; } catch (e) { return true; } }
  function marcaMatch(p) {
    try { var l = JSON.parse(localStorage.getItem(MATCH_KEY) || '[]'); if (l.indexOf(matchId(p)) < 0) l.push(matchId(p)); localStorage.setItem(MATCH_KEY, JSON.stringify(l.slice(-100))); } catch (e) {}
  }
  function celebraMatch(p) {
    marcaMatch(p);
    sheetEls();
    var root = $('sw-sheet-root'), viejo = $('sw-match'); if (viejo) viejo.remove();
    var yo = (S.dir && S.dir.me) || { nombre: L('Tú', 'You') };
    var cols = ['#22d3ee', '#fb923c', '#d946ef', '#f472b6', '#facc15', '#4ade80'], conf = '';
    for (var i = 0; i < 34; i++) {
      conf += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + cols[i % cols.length] +
        ';animation-delay:' + (0.45 + Math.random() * 0.6).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random() * 1.2).toFixed(2) +
        's;--r:' + Math.round(Math.random() * 720 - 360) + 'deg;--x:' + Math.round(Math.random() * 120 - 60) + 'px"></i>';
    }
    var el = document.createElement('div'); el.id = 'sw-match'; el.className = 'sw-match';
    el.innerHTML = '<div class="sw-mconf">' + conf + '</div><div class="sw-mbox">' +
      '<div class="sw-mavs">' + avatar(yo, 'xl sw-mav l') + avatar({ nombre: p.poster.nombre, foto: p.poster.foto }, 'xl sw-mav r') + '<div class="sw-mswp">⇄</div></div>' +
      '<div class="sw-mtit">¡MATCH!</div>' +
      '<div class="sw-msub">' + esc(firstName(p.poster)) + L(' y tú buscáis justo lo que ofrece el otro', ' and you each want exactly what the other offers') + '<br><b>' + esc(diasTxtB(p.dates)) + '</b> · ' + esc(catNom(p.cat)) + '</div>' +
      '<div class="sw-msub" style="opacity:.75">' + L('Los descansos de los dos ya están comprobados.', 'Rest for both of you is already checked.') + '</div>' +
      '<button class="sw-go" id="sw-m-ver" style="width:100%;margin-top:16px">' + L('Ver el cambio', 'See the swap') + '</button>' +
      '<button class="sw-btn" id="sw-m-luego" style="width:100%;margin-top:8px">' + L('Luego', 'Later') + '</button></div>';
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
    setTimeout(function () { try { window.swapChime && window.swapChime(); } catch (x) {} }, 420);
    var cierra = function () { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 300); };
    $('sw-m-luego').onclick = cierra;
    $('sw-m-ver').onclick = function () { cierra(); setTimeout(function () { openPost(p); }, 200); };
  }
  window.swapCelebraMatch = celebraMatch;    // para probarlo a mano

  /* ── ¡SWAP! — un cambio cerrado (21-oct, pedido del usuario) ─────────────────
     La misma celebración que el ¡MATCH!, cuando un compañero ACEPTA un cambio:
     a quien acepta, al pulsar «Aceptar»; a quien lo propuso, al abrir el Swap
     (o al momento si lo tiene abierto: loadHome se repite cada 20 s). Una vez por
     propuesta y aparato (localStorage). El botón lleva al siguiente paso. */
  var CERRADOS_KEY = 'pilotos_swap_cerrados';
  function cerradoVisto(id) { try { return (JSON.parse(localStorage.getItem(CERRADOS_KEY) || '[]')).indexOf(id) >= 0; } catch (e) { return true; } }
  function marcaCerrado(id) {
    try { var l = JSON.parse(localStorage.getItem(CERRADOS_KEY) || '[]'); if (l.indexOf(id) < 0) l.push(id); localStorage.setItem(CERRADOS_KEY, JSON.stringify(l.slice(-100))); } catch (e) {}
  }
  function celebraSwap(p, yoAcepto) {
    marcaCerrado(p.id);
    sheetEls();
    var root = $('sw-sheet-root'), viejo = $('sw-match'); if (viejo) viejo.remove();
    var yo = (S.dir && S.dir.me) || { nombre: L('Tú', 'You') }, otro = socio(p.partnerId);
    if (!otro.nombre) otro = { id: p.partnerId, nombre: p.partnerName };
    var ds = (p.dates || []).slice().sort(), left = dayDiff(today(), ds[0]), ec = left >= 5;
    var cols = ['#22d3ee', '#fb923c', '#d946ef', '#f472b6', '#facc15', '#4ade80'], conf = '';
    for (var i = 0; i < 40; i++) {
      conf += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + cols[i % cols.length] +
        ';animation-delay:' + (0.45 + Math.random() * 0.6).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random() * 1.2).toFixed(2) +
        's;--r:' + Math.round(Math.random() * 720 - 360) + 'deg;--x:' + Math.round(Math.random() * 120 - 60) + 'px"></i>';
    }
    var nm = firstName(otro);
    var el = document.createElement('div'); el.id = 'sw-match'; el.className = 'sw-match';
    el.innerHTML = '<div class="sw-mconf">' + conf + '</div><div class="sw-mbox">' +
      '<div class="sw-mavs">' + avatar(yo, 'xl sw-mav l') + avatar(otro, 'xl sw-mav r') + '<div class="sw-mswp">⇄</div></div>' +
      '<div class="sw-mtit">¡SWAP!</div>' +
      '<div class="sw-msub">' + (yoAcepto ? L('Has aceptado el cambio con ', 'You accepted the swap with ') + esc(nm)
                                         : esc(nm) + L(' ha aceptado tu cambio', ' accepted your swap')) +
        '<br><b>' + esc(diasTxtB(ds)) + '</b></div>' +
      '<div class="sw-msub" style="opacity:.8">' + (ec
        ? L('Ahora lo pide uno en eCrews y el otro lo acepta allí.', 'Now one of you requests it in eCrews and the other accepts it there.')
        : L('Faltan menos de 5 días: va por correo a la oficina de pilotos.', 'Less than 5 days to go: it goes by email to the pilots\' office.')) + '</div>' +
      '<button class="sw-go" id="sw-m-ver" style="width:100%;margin-top:16px">' + (ec ? L('Pedirlo en eCrews', 'Request it in eCrews') : L('Mandar el correo', 'Send the email')) + '</button>' +
      '<button class="sw-btn" id="sw-m-luego" style="width:100%;margin-top:8px">' + L('Luego', 'Later') + '</button></div>';
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
    setTimeout(function () { try { window.swapChime && window.swapChime(); } catch (x) {} }, 420);
    if (navigator.vibrate) try { navigator.vibrate([30, 60, 30]); } catch (x) {}
    var cierra = function () { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 300); };
    $('sw-m-luego').onclick = cierra;
    // Quien acepta ya está en la pantalla del cambio con sus botones: solo se cierra.
    $('sw-m-ver').onclick = function () { cierra(); if (!yoAcepto) setTimeout(function () { abrePropuesta(p); }, 200); };
  }
  window.swapCelebraSwap = celebraSwap;      // para probarlo a mano
  /* A quien propuso: el primer cambio suyo aceptado (últimos 7 días) que aún no ha visto. */
  function celebraPendiente() {
    if (pantalla() !== 'swap' || S.partner || S.view === 'board' || $('sw-match') || $('pp-alta')) return;
    var p = S.proposals.filter(function (x) {
      return !x.incoming && x.status === 'accepted' && Date.now() - (Date.parse(x.responded_at || '') || 0) < 7 * 864e5 && !cerradoVisto(x.id);
    })[0];
    if (p) setTimeout(function () { celebraSwap(p, false); }, 400);
  }
  /* Desde la campana: abre el Swap en el tablón y, cuando carga, ese anuncio. */
  function abreMatch(postId) {
    try { window.swapOpen && window.swapOpen(); } catch (e) {}
    S.view = 'board'; S.partner = null; S.proposal = null;
    renderBoard(); rotulaAtras();
    loadBoard().then(function () {
      var p = ((S.board && S.board.posts) || []).filter(function (x) { return x.id === postId; })[0];
      if (p) { marcaMatch(p); var v = $('sw-match'); if (v) v.remove(); openPost(p); }
    });
  }

  function openBoard() {
    S.view = 'board'; S.partner = null; S.proposal = null;
    renderBoard(); rotulaAtras(); loadBoard();
  }
  function loadBoard() {
    return api('/api/swap/board').then(function (j) {
      S.board = j; if (S.view === 'board' && !S.partner) renderBoard();
      // Un ¡Match! que el piloto aún no ha visto: la animación, una sola vez.
      var nuevo = (j.posts || []).filter(function (p) { return p.match && !matchVisto(p); })[0];
      if (nuevo && S.view === 'board' && !S.partner) setTimeout(function () { celebraMatch(nuevo); }, 350);
    }, function (e) {
      if (S.view === 'board' && !S.partner && $('sw-body')) $('sw-body').innerHTML = '<div class="sw-pad"><div class="sw-err">' + esc(e.message) + '</div></div>';
    });
  }

  function renderBoard() {
    var body = $('sw-body'); if (!body) return;
    pintaTabs();
    var B = S.board, tab = S.btab || 'board', filt = S.bfilt || 'all';
    if (!B || !B.posts) { body.innerHTML = '<div class="sw-pad"><div class="sw-empty">' + L('Cargando el tablón…', 'Loading the board…') + '</div></div>'; return; }
    if (B.needProfile) {
      body.innerHTML = '<div class="sw-pad"><div class="sw-card"><div class="sw-sub">' + L('Pon tu base y tu rol en Mi perfil para ver el tablón de tu base.', 'Set your base and role in My profile to see your base\'s board.') + '</div>' +
        '<button class="sw-btn pri" style="width:100%;margin-top:10px" onclick="goTo(\'perfil\')">' + L('Ir a Mi perfil', 'Go to My profile') + '</button></div></div>';
      return;
    }
    var mias = B.posts.filter(function (p) { return p.mine; }), otras = B.posts.filter(function (p) { return !p.mine; });
    var h = '<div class="sw-pad sw-bd">';
    // El nombre ya lo dice la pestaña de arriba: aquí solo de quién es el tablón y cuántos hay.
    h += '<div class="sw-bd-hd"><div class="sw-sub">' + esc(B.me.base) + ' · ' + esc(B.me.rol) + ' · ' +
         otras.length + (otras.length === 1 ? L(' cambio publicado', ' swap posted') : L(' cambios publicados', ' swaps posted')) + '</div></div>';
    /* Publicar, ARRIBA y grande (reporte 17-oct: abajo quedaba tapado por la barra
       y no se encontraba). */
    h += '<button class="sw-offer" id="sw-bd-pub"><span class="ic">＋</span><span><b>' + L('Ofrecer un día', 'Offer a day') + '</b><em>' +
         L('Publícalo para tu base y te avisamos si a alguien le cuadra', 'Post it to your base and we will tell you if it works for someone') + '</em></span></button>';
    h += '<div class="sw-bd-seg" role="tablist"><button data-tab="board" class="' + (tab === 'board' ? 'on' : '') + '">' + L('Tablón', 'Board') + '</button>' +
         '<button data-tab="mine" class="' + (tab === 'mine' ? 'on' : '') + '">' + L('Mis anuncios', 'My posts') + (mias.length ? ' · ' + mias.length : '') + '</button></div>';
    if (tab === 'board') {
      var n = { all: otras.length };
      otras.forEach(function (p) { n[p.cat] = (n[p.cat] || 0) + 1; });
      h += '<div class="sw-bd-chips">' + ['all'].concat(CAT_ORD).map(function (k) {
        return '<button class="sw-bd-chip' + (filt === k ? ' on' : '') + '" data-f="' + k + '">' + (k === 'all' ? '' : '<i class="sw-dot k-' + k + '"></i>') +
               (k === 'all' ? L('Todos', 'All') : catNom(k)) + '<span>' + (n[k] || 0) + '</span></button>';
      }).join('') + '</div>';
      var est = { ok: 0, ko: 0, no: 0 };
      otras.forEach(function (p) { est[estadoDe(p)]++; });
      h += '<div class="sw-bd-bar"><label class="sw-bd-tg"><input type="checkbox" id="sw-bd-only"' + (S.bonly ? ' checked' : '') + '><i></i>' + L('Solo los que me cuadran', 'Only the ones that work for me') + '</label></div>';
      h += '<div class="sw-bd-sum"><span><b class="ok">' + est.ok + '</b> ' + L('te cuadran', 'work for you') + '</span><span><b class="ko">' + est.ko + '</b> ' + L('no cuadran', 'don\'t work') +
           '</span><span><b>' + est.no + '</b> ' + L('no es lo que buscan', 'not what they want') + '</span></div>';
      var vis = otras.filter(function (p) { return (filt === 'all' || p.cat === filt) && (!S.bonly || estadoDe(p) === 'ok'); });
      // Por fecha, y dentro de cada día primero lo que cuadra.
      var rk = { ok: 0, no: 1, ko: 2 };
      vis.sort(function (a, b) { return a.dates[0] < b.dates[0] ? -1 : a.dates[0] > b.dates[0] ? 1 : rk[estadoDe(a)] - rk[estadoDe(b)]; });
      // Los ¡Match! van arriba del todo, antes que el orden por fecha.
      var matches = vis.filter(function (p) { return p.match; });
      if (matches.length) {
        h += '<div class="sw-bd-day sw-bd-mday"><b>¡MATCH!</b><span>' + L('Buscáis justo lo que ofrece el otro y os cuadra a los dos', 'You each want exactly what the other offers, and it works for both') + '</span></div>';
        matches.forEach(function (p) { h += cardBoard(p); });
        vis = vis.filter(function (p) { return !p.match; });
      }
      /* 🔥 Último momento (17-oct, pedido del usuario): lo que caduca en ≤ 4 días va
         arriba — el más cercano primero y, en cada día, lo que te cuadra antes. Son
         los que más prisa tienen y ya van por correo a la oficina. */
      var calientes = vis.filter(function (p) { var l = dayDiff(today(), p.dates[0]); return l >= 0 && l <= HOT_DIAS; });
      if (calientes.length) {
        h += '<div class="sw-bd-day sw-bd-hday"><b>🔥 ' + L('ÚLTIMO MOMENTO', 'LAST MINUTE') + '</b><span>' +
             L('Faltan menos de 5 días · van por correo a la oficina', 'Less than 5 days to go · they go by email to the office') + '</span></div>';
        calientes.forEach(function (p) { h += cardBoard(p); });
        vis = vis.filter(function (p) { return calientes.indexOf(p) < 0; });
        if (vis.length) h += '<div class="sw-bd-sep">' + L('Más adelante', 'Later on') + '</div>';
      }
      if (!otras.length) h += '<div class="sw-empty" style="margin-top:14px">' + L('Todavía no hay cambios publicados en tu base. Sé el primero: pulsa «Publicar cambio».', 'No swaps posted at your base yet. Be the first: tap “Post a swap”.') + '</div>';
      else if (!vis.length) h += '<div class="sw-empty" style="margin-top:14px">' + L('Nada con este filtro.', 'Nothing with this filter.') + '</div>';
      var ult = '';
      vis.forEach(function (p) {
        if (p.dates[0] !== ult) {
          ult = p.dates[0];
          var left = dayDiff(today(), p.dates[0]);
          h += '<div class="sw-bd-day"><b>' + esc(diasTxtB(p.dates).toUpperCase()) + '</b><span>' +
               (left <= 0 ? L('hoy', 'today') : L('dentro de ', 'in ') + left + (left === 1 ? L(' día', ' day') : L(' días', ' days'))) + ' · ' +
               (left >= 5 ? L('por eCrews', 'via eCrews') : L('por correo', 'by email')) + '</span></div>';
        }
        h += cardBoard(p);
      });
    } else {
      if (!mias.length) h += '<div class="sw-empty" style="margin-top:14px">' + L('No tienes anuncios. Publica un día que quieras cambiar y te avisamos cuando alguien se interese.', 'You have no posts. Post a day you want to swap and we will let you know when someone is interested.') + '</div>';
      if (mias.length) h += '<div class="sw-sub" style="margin:10px 0 8px">' + L('Desliza un anuncio a la izquierda para retirarlo.', 'Swipe a post left to withdraw it.') + '</div>';
      mias.forEach(function (p) {
        h += '<div class="sw-swipe" data-swp="' + p.id + '"><button class="sw-swipe-del" data-wdx="' + p.id + '" aria-label="' + L('Retirar anuncio', 'Withdraw post') + '">' +
             '<span class="dk">🗑</span><span class="tx">' + L('Retirar', 'Withdraw') + '</span></button><div class="sw-swipe-in">' + cardBoard(p) + '</div></div>';
      });
    }
    h += '</div>';
    body.innerHTML = h;
    entrada(body);
    body.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { S.btab = b.dataset.tab; renderBoard(); }; });
    body.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { S.bfilt = b.dataset.f; renderBoard(); }; });
    var only = $('sw-bd-only'); if (only) only.onchange = function () { S.bonly = only.checked; renderBoard(); };
    body.querySelectorAll('[data-bp]').forEach(function (b) { b.onclick = function () { if (S._swMovio) { S._swMovio = false; return; } var w = b.closest('.sw-swipe.sw'); if (w) { w.classList.remove('sw'); return; } var p = B.posts.filter(function (x) { return x.id === b.dataset.bp; })[0]; if (p) openPost(p); }; });
    body.querySelectorAll('[data-wdx]').forEach(function (b) {
      b.onclick = function (ev) { ev.stopPropagation(); retiraAnuncio(b.dataset.wdx, b.closest('.sw-swipe')); };
    });
    deslizaInit(body);
    body.querySelectorAll('[data-wd]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        if (!confirm(L('¿Retirar este anuncio?', 'Withdraw this post?'))) return;
        api('/api/swap/board/' + b.dataset.wd + '/withdraw', {}).then(loadBoard, alertErr);
      };
    });
    body.querySelectorAll('[data-ed]').forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var p = B.posts.filter(function (x) { return x.id === b.dataset.ed && x.mine; })[0]; if (p) openPublish(p);
      };
    });
    $('sw-bd-pub').onclick = function () { openPublish(); };
  }

  /* ── Retirar un anuncio propio (20-oct): deslizar a la izquierda, como las notas
     de gasto, o el botón de la hoja de editar. Mismo endpoint que «Retirar». ── */
  function retiraAnuncio(id, wrap) {
    if (!confirm(L('¿Retirar este anuncio del Swap Board?', 'Withdraw this post from the Swap Board?'))) { if (wrap) wrap.classList.remove('sw'); return; }
    if (wrap) wrap.classList.add('bye');
    return api('/api/swap/board/' + id + '/withdraw', {}).then(function () { closeSheet(); S.btab = 'mine'; loadBoard(); },
      function (e) { if (wrap) wrap.classList.remove('bye', 'sw'); alertErr(e); });
  }
  var SWD = 96;   // lo que asoma el panel rojo (el CSS lo repite)
  function deslizaInit(host) {
    if (host._swd) return; host._swd = true;            // por delegación, una vez: las tarjetas se rehacen
    var g = null;
    var cierra = function (menos) { host.querySelectorAll('.sw-swipe.sw').forEach(function (w) { if (w !== menos) w.classList.remove('sw'); }); };
    host.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.sw-swipe-del')) return;
      var w = ev.target.closest('.sw-swipe');
      if (!w) { cierra(null); return; }
      g = { w: w, x0: ev.clientX, y0: ev.clientY, dx: 0, vivo: false, abierta: w.classList.contains('sw') };
    }, { passive: true });
    host.addEventListener('pointermove', function (ev) {
      if (!g) return;
      var dx = ev.clientX - g.x0, dy = ev.clientY - g.y0;
      if (!g.vivo) {
        if (Math.abs(dy) > Math.abs(dx)) { g = null; return; }      // es scroll vertical
        if (Math.abs(dx) < 12) return;
        g.vivo = true; cierra(g.w); g.w.classList.add('mov');
      }
      g.dx = Math.max(-SWD, Math.min(0, (g.abierta ? -SWD : 0) + dx));
      g.w.style.setProperty('--dx', g.dx + 'px');
    }, { passive: true });
    var suelta = function () {
      if (!g) return;
      var w = g.w, vivo = g.vivo, dx = g.dx; g = null;
      w.classList.remove('mov'); w.style.removeProperty('--dx');
      if (!vivo) return;
      S._swMovio = true; setTimeout(function () { S._swMovio = false; }, 350);
      if (dx < -SWD / 3) w.classList.add('sw'); else w.classList.remove('sw');
    };
    host.addEventListener('pointerup', suelta, { passive: true });
    host.addEventListener('pointercancel', suelta, { passive: true });
  }
  var HOT_DIAS = 4;
  function cuentaAtras(left) {
    return left <= 0 ? L('Hoy', 'Today') : left === 1 ? L('Mañana', 'Tomorrow') : L('En ' + left + ' días', 'In ' + left + ' days');
  }
  /* ── La tarjeta del tablón (22-oct-2026, propuesta H2 elegida por el piloto) ──
     A la izquierda un taco de calendario magenta con la FECHA (sólo la fecha: el color
     del día lo lleva la pastilla). Debajo de las rutas, una pastilla partida en diagonal:
     a la izquierda lo que da (color de su tipo de día) y a la derecha lo que pide (color
     de lo que busca, con brillo), con las flechas ⇄ en medio. Los iconos van DIBUJADOS. */
  var CAT_ICO = {
    early: '<path d="M3 18h18M7 18a5 5 0 0 1 10 0"/><path d="M12 4v3M5.2 9.2l2 2M18.8 9.2l-2 2M2 14h2M20 14h2"/>',
    late: '<path fill="currentColor" stroke="none" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/>',
    linea: '<path d="M10.5 3.5v6.2L3 14v2l7.5-2.4V19L8 20.6V22l4-1 4 1v-1.4L13.5 19v-5.4L21 16v-2l-7.5-4.3V3.5a1.5 1.5 0 0 0-3 0z"/>',
    pernocta: '<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="10.5" r="1.8"/>',
    imag: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    libre: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.4 1 1.6 1 3M12 3.5c0 1.4 1 1.6 1 3"/>',
    otro: '<circle cx="12" cy="12" r="3.5"/>',
    any: '<path d="M12 3.5l2.5 5.2 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8z"/>'
  };
  function catIco(k) {
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (CAT_ICO[k] || CAT_ICO.otro) + '</svg>';
  }
  var ICO_CAMBIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>';
  function tacoFecha(ds) {
    var a = ds[0], b = ds[ds.length - 1], ma = MES3[+a.slice(5, 7) - 1].toUpperCase(), mb = MES3[+b.slice(5, 7) - 1].toUpperCase();
    var dia = WDN[wd(a)].slice(0, 3).toUpperCase();
    var num = ds.length > 1 ? dnum(a) + '–' + dnum(b) : '' + dnum(a);
    return '<div class="sw-bd-taco' + (ds.length > 1 ? ' rango' : '') + '"><span class="dw">' + esc(dia) + '</span><b>' + num + '</b><span class="dm">' + esc(ma === mb ? ma : ma + '–' + mb) + '</span></div>';
  }
  function pastillaCambio(p) {
    var ws = (p.wants && p.wants.length && p.wants.indexOf('any') < 0) ? p.wants : ['any'];
    var wk = ws.length > 1 ? 'varios' : ws[0];
    var wn = ws.length > 1 ? ws.map(catNom).join(' · ') : catNom(ws[0]);
    var k = p.cat || 'otro';
    var kl = catNom(k).length > 6, wl = wn.length > 6;   // rótulo largo: sin icono, que el texto quepa
    return '<div class="sw-bd-pas pw-' + esc(wk) + '">' +
      '<span class="lado da pk-' + esc(k) + '">' + (kl ? '' : catIco(k)) + '<span class="tx"><small>' + (p.mine ? L('DAS', 'YOU GIVE') : L('TE DA', 'GIVES')) + '</small><b>' + esc(catNom(k).toUpperCase()) + '</b></span></span>' +
      '<span class="lado pide pk-' + esc(wk) + '"><span class="tx"><small>' + (p.mine ? L('BUSCAS', 'YOU WANT') : L('PIDE', 'WANTS')) + '</small><b>' + esc(wn.toUpperCase()) + '</b></span>' + (ws.length > 1 ? '' : catIco(wk)) + '</span>' +
      '<span class="mid">' + ICO_CAMBIO + '</span></div>';
  }
  function cardBoard(p) {
    var e = estadoDe(p), nm = p.poster.nombre || '';
    var left = dayDiff(today(), p.dates[0]), hot = left >= 0 && left <= HOT_DIAS;
    var vtxt = e === 'mine' ? '' : e === 'ok' ? '✓ ' + L('Te cuadra', 'Works for you') + ' · ' + balTxt(p.bal) : e === 'ko' ? '✗ ' + motivoKo(p) : firstName(p.poster) + L(' busca ', ' wants ') + wantsTxt(p.wants);
    var h = '<div class="sw-bd-card ' + e + (p.match ? ' match' : '') + (hot ? ' hot' : '') + ' k-' + esc(p.cat || 'otro') + '" data-bp="' + p.id + '" role="button" tabindex="0">' +
      tacoFecha(p.dates) + '<div class="sw-bd-cu">' +
      (p.match || hot ? '<div class="sw-bd-tags">' + (p.match ? '<span class="sw-bd-mtag">¡MATCH!</span>' : '') +
        (hot ? '<span class="sw-bd-hot' + (left <= 1 ? ' ya' : '') + '">⏳ ' + esc(cuentaAtras(left)) + '</span>' : '') + '</div>' : '') +
      '<div class="sw-bd-quien">' + (p.mine ? '<b>' + L('Tu anuncio', 'Your post') + '</b>' : '<b>' + esc(corto(nm)) + '</b>') +
        '<span>' + esc((p.dates.length > 1 ? p.dates.length + L(' días', ' days') + ' · ' : '') + hace(p.created_at)) + '</span></div>' +
      '<div class="sw-bd-rts">' + (p.gets || []).map(function (c) { return '<div>' + esc(resumenDia(c)) + '</div>'; }).join('') +
        (p.note ? '<i>«' + esc(p.note) + '»</i>' : '') + '</div>' +
      pastillaCambio(p);
    if (p.mine) h += '<div class="sw-bd-ft"><span class="sw-sub">' + L('Se retira solo al pasar el día o si cambia tu roster', 'Withdrawn automatically when the day passes or your roster changes') + '</span>' +
      '<span class="sw-bd-ftb"><button class="sw-btn" data-ed="' + p.id + '">' + L('Editar', 'Edit') + '</button><button class="sw-btn" data-wd="' + p.id + '">' + L('Retirar', 'Withdraw') + '</button></span></div>';
    else h += '<div class="sw-bd-ft"><span class="sw-bd-v ' + e + '">' + esc(vtxt) + '</span>' +
      (p.interest ? '<span class="sw-st ok">' + (p.interest === 'accepted' ? L('Aceptado', 'Accepted') : p.interest === 'rejected' ? L('Rechazado', 'Declined') : L('Propuesto', 'Proposed')) + '</span>'
        : e === 'ok' ? '<span class="sw-bd-go">' + L('Me interesa', 'I\'m interested') + '</span>' : '') + '</div>';
    return h + '</div></div>';
  }

  /* Detalle de un anuncio en la hoja inferior: lo que das, lo que recibes y las reglas. */
  /* La ficha de un anuncio sigue el diseño de su tarjeta (mezcla A+B elegida por el
     piloto, 23-oct-2026): a la IZQUIERDA lo que te da (columna teñida con su tipo, como
     el lado izquierdo de la pastilla) y a la DERECHA lo que tú das (teñida con lo que
     pide). Dentro, cada día lleva el color de lo que ES de verdad: un OFF que das sale
     verde aunque la columna sea la del early que pide. Los colores son los de la
     pastilla (tonos claros con tinta oscura), así el contraste no depende del tema. */
  function wantsKey(p) {
    var ws = (p.wants && p.wants.length && p.wants.indexOf('any') < 0) ? p.wants : ['any'];
    return { k: ws.length > 1 ? 'varios' : ws[0], n: ws.length > 1 ? ws.map(catNom).join(' · ') : catNom(ws[0]) };
  }
  function celdaDia(c, base) {
    if (!c || c.kind === 'empty') return '<div class="sw-dx-c pk-otro vacio"><span class="k">—</span><div class="tm">' + L('Sin roster', 'No roster') + '</div></div>';
    var k = MOT.catDe([c], base);
    var h = '<div class="sw-dx-c pk-' + esc(k) + (c.kind !== 'flight' ? ' tierra' : '') + '"><span class="k">' + catIco(k) + esc(catNom(k).toUpperCase()) + '</span>';
    if (c.kind !== 'flight') {
      // Un OFF sin horas no repite «OFF» dos veces: sale el rótulo grande con su icono.
      var txt = c.report != null ? '' : (c.code && c.code !== 'OFF' ? c.code : 'OFF');
      if (txt && txt.toUpperCase() === catNom(k).toUpperCase()) return '<div class="sw-dx-c pk-' + esc(k) + ' tierra"><div class="tm big">' + catIco(k) + esc(txt) + '</div></div>';
      return h + '<div class="tm big">' + (c.report != null ? esc(c.code) + '<small>' + clockN(c.report) + '–' + clockN(c.end) + '</small>' : esc(c.code && c.code !== 'OFF' ? c.code : 'OFF')) + '</div></div>';
    }
    return h + '<div class="tm">' + clockN(c.report) + '<span>→</span>' + clockN(c.end) + '</div>' +
      c.legs.map(function (l) { return '<div class="lg"><b>' + esc(l.dep + '-' + l.arr) + '</b><span>' + clockN(l.std) + '–' + clockN(l.sta) + '</span></div>'; }).join('') +
      '<div class="ft">' + (c.ac ? esc(c.ac) + ' · ' : '') + hhmm(c.block || 0) + L(' vuelo · ', ' flt · ') + hhmm(dutyMin(c)) + L(' act.', ' duty') + '</div></div>';
  }
  function trackDx(a, b, base) {
    var off = useLT() ? -new Date().getTimezoneOffset() : 0;
    var bar = function (c, top) {
      if (!c || c.report == null) return '';
      var s = ((c.report + off) % 1440 + 1440) % 1440, len = Math.min(1440 - s, (c.end + (c.kind === 'flight' ? POST : 0)) - c.report);
      return '<div class="bar pk-' + esc(MOT.catDe([c], base)) + '" style="left:' + (s / 14.4) + '%;width:' + Math.max(2, len / 14.4) + '%;top:' + top + 'px"></div>';
    };
    return '<div class="sw-track sw-dx-tr">' + [6, 12, 18].map(function (hh) { return '<i style="left:' + (hh / 24 * 100) + '%"></i><em style="left:' + (hh / 24 * 100) + '%">' + hh + 'h</em>'; }).join('') +
      bar(a, 3) + bar(b, 12) + '</div>';
  }
  function fichaCambio(p) {
    var base = (S.board && S.board.me && S.board.me.base) || '', k = p.cat || 'otro', w = wantsKey(p);
    /* La columna derecha dice lo que DAS DE VERDAD (tus días), no lo que pide el otro:
       si das un early y él pide OFF, poner «Tú das OFF» encima de tu early mentía
       (reporte del piloto, 23-oct-2026). Si no es lo que pide, se dice debajo. */
    var rk = MOT.catDe(p.gives || [], base), ws = (p.wants || []).filter(function (x) { return x !== 'any'; });
    var pideOtro = ws.length && ws.indexOf(rk) < 0;
    var h = '<div class="sw-dx">' +
      '<div class="sw-dx-bg l pk-' + esc(k) + '"></div><div class="sw-dx-bg r pk-' + esc(rk) + '"></div>' +
      '<div class="sw-dx-hd pk-' + esc(k) + '"><small>' + L('TE DA', 'YOU GET') + '</small><b>' + esc(catNom(k).toUpperCase()) + '</b></div>' +
      '<div class="sw-dx-hd r pk-' + esc(rk) + '"><small>' + L('TÚ DAS', 'YOU GIVE') + '</small><b>' + esc(catNom(rk).toUpperCase()) + '</b>' +
        (pideOtro ? '<em class="sw-dx-pide">' + esc(firstName(p.poster) + L(' pide ', ' wants ') + w.n) + '</em>' : '') + '</div>';
    p.dates.forEach(function (d, i) {
      h += '<div class="sw-dx-d"><b>' + esc(fCorta(d)) + '</b>' + trackDx(p.gets[i], p.gives[i], base) + '</div>' +
        celdaDia(p.gets[i], base) + celdaDia(p.gives[i], base);
    });
    return h + '<span class="sw-dx-x">' + ICO_CAMBIO + '</span></div>';
  }
  function openPost(p) {
    var ev = sheetEls(), e = estadoDe(p), nm = firstName(p.poster);
    var h = '<div class="grab"></div><div class="sw-row sw-dx-top">' + (p.mine ? '' : avatar({ nombre: p.poster.nombre, foto: p.poster.foto }, '')) +
      '<div style="flex:1;min-width:0"><div class="sw-name" style="font-size:17px">' + (p.mine ? L('Tu anuncio', 'Your post') : esc(p.poster.nombre)) + '</div><div class="sw-sub">' + esc(diasTxtB(p.dates)) + '</div></div>' +
      tacoFecha(p.dates) + '</div>';
    if (p.note) h += '<div class="sw-sub" style="margin-top:8px"><i>«' + esc(p.note) + '»</i></div>';
    if (p.match) h += '<div class="sw-bd-mban"><b>¡MATCH!</b> ' + esc(nm) + L(' busca justo lo que ofreces en tu anuncio de esos días, y tú buscas lo que ofrece su anuncio.', ' wants exactly what you offer in your post for those days, and you want what their post offers.') + '</div>';
    if (!p.mine) {
      h += fichaCambio(p);
      var v = p.verdict || {};
      h += '<div class="sw-verdict show" style="margin-top:14px;background:var(' + (v.ok ? '--sw-ok-bg' : '--sw-ko-bg') + ');color:var(' + (v.ok ? '--sw-ok' : '--sw-ko') + ')">' +
           (v.ok ? L('✓ Vueling lo acepta', '✓ Vueling accepts it') : '✗ ' + esc(motivoKo(p))) + '</div>';
      h += '<div style="margin-top:8px">' + checks({ vBad: v.vBad, ftlBad: v.ftlBad, fueraAplica: v.fueraAplica, fueraBad: v.fueraBad, over7: v.over7, max7: v.max7 || 0, sLib: v.sLib, s3: v.s3, inv: v.inv, corte: v.corte, linea: v.linea }) +
        notaFOff(v.fOff && { who: v.fOff.who === 'me' ? L('Tú', 'You') : nm, day: v.fOff.day }, fCorta) +
        notaAerop(v.aerop && { who: v.aerop.who === 'me' ? L('Tú', 'You') : nm, day: v.aerop.day, apt: v.aerop.apt }, fCorta) + '</div>';
      if (v.ok) h += '<div class="sw-sub" style="margin-top:8px">' + L('Tu balance: ', 'Your balance: ') + esc(balTxt(p.bal)) + (p.wantsMatch ? '' : ' · ' + esc(nm + L(' busca ', ' wants ') + wantsTxt(p.wants))) + '</div>';
      if (p.interest) h += '<div class="sw-info" style="margin-top:12px">' + L('Ya le has propuesto este cambio. Lo verás en Propuestas.', 'You have already proposed this swap. You will see it under Proposals.') + '</div>';
      else if (v.ok) h += '<button class="sw-go" id="sw-bd-int" style="width:100%;margin-top:14px">' + L('Proponer a ', 'Propose to ') + esc(nm) + '</button>' +
        '<div class="sw-sub" style="text-align:center;margin-top:6px">' + esc(nm) + L(' solo verá estos días. Tu roster sigue privado.', ' will only see these days. Your roster stays private.') + '</div>';
    } else {
      h += (p.gets || []).map(function (c, i) { return '<div class="sw-card" style="margin-top:10px"><b>' + esc(fCorta(p.dates[i])) + '</b> · ' + esc(resumenDia(c)) + '</div>'; }).join('');
      h += '<div class="sw-sub" style="margin-top:8px">' + L('Buscas: ', 'You want: ') + esc(wantsTxt(p.wants)) + '</div>';
      h += '<button class="sw-go" id="sw-bd-edit" style="width:100%;margin-top:14px">' + L('Editar anuncio', 'Edit post') + '</button>';
    }
    h += '<button class="sw-btn" id="sw-bd-cl" style="width:100%;margin-top:10px">' + L('Cerrar', 'Close') + '</button>';
    ev.sh.innerHTML = h; ev.sh.classList.add('open'); ev.bg.classList.add('open');
    $('sw-bd-cl').onclick = closeSheet;
    if ($('sw-bd-edit')) $('sw-bd-edit').onclick = function () { openPublish(p); };
    var b = $('sw-bd-int');
    if (b) b.onclick = function () {
      b.disabled = true; b.textContent = L('Enviando…', 'Sending…');
      api('/api/swap/board/' + p.id + '/interest', {}).then(function () {
        enviadoFx(b, nm, p.dates); p.interest = 'proposed';
        setTimeout(function () { closeSheet(); renderBoard(); loadBoard(); loadHome(); }, 1500);
      }, function (er) { b.disabled = false; b.textContent = L('Proponer a ', 'Propose to ') + nm; alertErr(er); loadBoard(); });
    };
  }

  /* Publicar: se eligen 1 a 6 días seguidos del roster PROPIO; la categoría la pone el servidor. */
  var PUB = null;
  /* Con un anuncio propio, la misma hoja sirve para EDITARLO: qué buscas y la nota.
     Los días no se cambian ahí — una propuesta ya hecha apunta a esos días; para
     otros días se retira y se publica otro (la hoja lo dice). */
  function openPublish(edit, preDate) {
    var ev = sheetEls();
    PUB = { days: null, picked: [], wants: [], note: '', msg: '', edit: edit || null };
    if (edit) {
      PUB.wants = (edit.wants || []).slice(); PUB.note = edit.note || '';
      ev.sh.classList.add('open'); ev.bg.classList.add('open');
      fillPublish(); return;
    }
    ev.sh.innerHTML = '<div class="grab"></div><div class="sw-empty">' + L('Cargando tu roster…', 'Loading your roster…') + '</div>';
    ev.sh.classList.add('open'); ev.bg.classList.add('open');
    var from = today(), to = addDays(from, 60);
    api('/api/swap/board/days?from=' + from + '&to=' + to).then(function (j) {
      PUB.days = j.days || [];
      // Desde el inicio («Ofrecer este día») llega ya con el día marcado.
      if (preDate) PUB.days.forEach(function (c, i) { if (c.date === preDate && c.kind !== 'empty') PUB.picked = [i]; });
      fillPublish();
    },
      function (e) { ev.sh.innerHTML = '<div class="grab"></div><div class="sw-err">' + esc(e.message) + '</div>'; });
  }
  function fillPublish() {
    if (PUB.edit) return fillEdit();
    var sh = $('sw-sh'), P = PUB, ds = P.days;
    var yaPub = {};
    ((S.board && S.board.posts) || []).forEach(function (p) { if (p.mine) p.dates.forEach(function (d) { yaPub[d] = 1; }); });
    var h = '<div class="grab"></div><div class="sw-name" style="font-size:18px">' + L('Publicar un cambio', 'Post a swap') + '</div>' +
      '<div class="sw-h">' + L('Qué das (1 a 6 días seguidos)', 'What you give (1 to 6 days in a row)') + '</div><div class="sw-bd-days">';
    var ultMes = '';
    ds.forEach(function (c, i) {
      var m = c.date.slice(0, 7);
      if (m !== ultMes) { ultMes = m; h += '<div class="sw-bd-mes">' + MES[+m.slice(5, 7) - 1] + '</div>'; }
      var on = P.picked.indexOf(i) >= 0, dis = !!yaPub[c.date] || c.kind === 'empty';
      h += '<button class="sw-bd-dd' + (on ? ' on k-' + esc(c.cat || 'otro') : '') + '" data-pd="' + i + '"' + (on ? ' data-k="' + esc(c.cat || 'otro') + '"' : '') + (dis ? ' disabled' : '') + '><span>' + WD[wd(c.date)] + '</span><b>' + dnum(c.date) + '</b>' +
           '<i class="sw-dot k-' + esc(c.cat || 'otro') + '"></i><em>' + esc(c.kind === 'empty' ? '—' : c.kind === 'flight' ? c.legs.map(function (l) { return l.arr; }).filter(function (a, k, A) { return k < A.length - 1; }).join('·') || resumenDia(c) : (c.code || 'OFF')) + '</em></button>';
    });
    h += '</div>';
    var sel = P.picked.length ? P.picked.map(function (i) { return ds[i]; }) : [];
    h += '<div class="sw-sub" style="min-height:18px;margin-top:6px">' + esc(P.msg || (sel.length ? sel.map(function (c) { return fCorta(c.date) + ' · ' + resumenDia(c); }).join(' / ') : L('Toca los días que quieres dar', 'Tap the days you want to give'))) + '</div>';
    h += '<div class="sw-h">' + L('Qué buscas', 'What you want') + '</div><div class="sw-bd-chips wrap">' + CAT_ORD.concat(['any']).map(function (k) {
      return '<button class="sw-bd-chip' + (P.wants.indexOf(k) >= 0 ? ' on' : '') + '" data-w="' + k + '">' + (k === 'any' ? '' : '<i class="sw-dot k-' + k + '"></i>') + esc(catNom(k)) + '</button>';
    }).join('') + '</div>';
    h += '<div class="sw-h">' + L('Nota (opcional)', 'Note (optional)') + '</div><input class="sw-input" id="sw-pub-note" maxlength="140" value="' + esc(P.note) + '" placeholder="' + esc(L('Ej.: boda de un amigo, me vale cualquier mañana', 'E.g.: a friend\'s wedding, any morning works')) + '">';
    h += '<div class="sw-sub" style="margin-top:10px">' + L('Lo ven los pilotos de tu base y especialidad. Solo verán estos días, nunca tu roster. Se retira solo al pasar el día o si cambia tu roster.', 'Pilots at your base and in your position will see it. They only see these days, never your roster. It is withdrawn automatically when the day passes or your roster changes.') + '</div>';
    h += '<button class="sw-go' + (P.picked.length && isSegP() ? '' : ' dim') + '" id="sw-pub-go" style="width:100%;margin-top:14px">' + L('Publicar en el tablón', 'Post on the board') + '</button>' +
         '<div class="sw-err" id="sw-pub-err"></div><button class="sw-btn" id="sw-pub-no" style="width:100%;margin-top:8px">' + L('Cancelar', 'Cancel') + '</button>';
    sh.innerHTML = h;
    sh.querySelectorAll('[data-pd]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.pd; P.note = $('sw-pub-note').value; P.msg = '';
        if (P.picked.indexOf(i) >= 0) P.picked = P.picked.filter(function (x) { return x !== i; });
        else if (P.picked.length >= MAXD) P.msg = L('Como máximo ', 'At most ') + MAXD + L(' días', ' days');
        else P.picked = P.picked.concat([i]).sort(function (a, c) { return a - c; });
        if (P.picked.length && !isSegP()) P.msg = L('Tienen que ser días seguidos', 'The days must be in a row');
        else if (P.picked.length) { var cb = corteP(); if (cb) P.msg = cb; }
        fillPublish();
      };
    });
    sh.querySelectorAll('[data-w]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.w; P.note = $('sw-pub-note').value;
        if (k === 'any') P.wants = P.wants.indexOf('any') >= 0 ? [] : ['any'];
        else { P.wants = P.wants.filter(function (x) { return x !== 'any'; }); P.wants = P.wants.indexOf(k) >= 0 ? P.wants.filter(function (x) { return x !== k; }) : P.wants.concat([k]); }
        fillPublish();
      };
    });
    $('sw-pub-no').onclick = closeSheet;
    $('sw-pub-go').onclick = function () {
      var er = $('sw-pub-err');
      if (!P.picked.length || !isSegP()) { er.textContent = L('Elige de 1 a 6 días seguidos', 'Pick 1 to 6 days in a row'); return; }
      var cb = corteP(); if (cb) { er.textContent = cb; return; }
      var go = this; go.disabled = true; go.textContent = L('Publicando…', 'Posting…');
      api('/api/swap/board', { dates: P.picked.map(function (i) { return ds[i].date; }), wants: P.wants, note: $('sw-pub-note').value }).then(function () {
        go.textContent = L('✓ Publicado', '✓ Posted');
        setTimeout(function () { closeSheet(); S.btab = 'mine'; loadBoard(); }, 700);
      }, function (e) { go.disabled = false; go.textContent = L('Publicar en el tablón', 'Post on the board'); er.textContent = e.message; });
    };
  }
  function wantsChips(P) {
    return '<div class="sw-bd-chips wrap">' + CAT_ORD.concat(['any']).map(function (k) {
      return '<button class="sw-bd-chip' + (P.wants.indexOf(k) >= 0 ? ' on' : '') + '" data-w="' + k + '">' + (k === 'any' ? '' : '<i class="sw-dot k-' + k + '"></i>') + esc(catNom(k)) + '</button>';
    }).join('') + '</div>';
  }
  function fillEdit() {
    var sh = $('sw-sh'), P = PUB, p = P.edit;
    var h = '<div class="grab"></div><div class="sw-row" style="justify-content:flex-start;gap:12px"><div style="flex:1"><div class="sw-name" style="font-size:18px">' + L('Editar anuncio', 'Edit post') + '</div>' +
      '<div class="sw-sub">' + esc(diasTxtB(p.dates)) + '</div></div><span class="sw-cat k-' + esc(p.cat) + '">' + esc(catNom(p.cat).toUpperCase()) + '</span></div>';
    h += '<div class="sw-h">' + L('Qué das', 'What you give') + '</div>' + (p.gets || []).map(function (c, i) { return '<div class="sw-card" style="margin-top:6px"><b>' + esc(fCorta(p.dates[i])) + '</b> · ' + esc(resumenDia(c)) + '</div>'; }).join('');
    h += '<div class="sw-sub" style="margin-top:6px">' + L('Para dar otros días, retira este anuncio y publica uno nuevo.', 'To give other days, withdraw this post and publish a new one.') + '</div>';
    h += '<div class="sw-h">' + L('Qué buscas', 'What you want') + '</div>' + wantsChips(P);
    h += '<div class="sw-h">' + L('Nota (opcional)', 'Note (optional)') + '</div><input class="sw-input" id="sw-pub-note" maxlength="140" value="' + esc(P.note) + '" placeholder="' + esc(L('Ej.: boda de un amigo, me vale cualquier mañana', 'E.g.: a friend\'s wedding, any morning works')) + '">';
    h += '<button class="sw-go" id="sw-pub-go" style="width:100%;margin-top:14px">' + L('Guardar cambios', 'Save changes') + '</button>' +
         '<div class="sw-err" id="sw-pub-err"></div><button class="sw-btn" id="sw-pub-no" style="width:100%;margin-top:8px">' + L('Cancelar', 'Cancel') + '</button>' +
         '<button class="sw-btn sw-del" id="sw-pub-del" style="width:100%;margin-top:14px">🗑 ' + L('Retirar anuncio', 'Withdraw post') + '</button>';
    sh.innerHTML = h;
    $('sw-pub-del').onclick = function () { retiraAnuncio(p.id, null); };
    sh.querySelectorAll('[data-w]').forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.w; P.note = $('sw-pub-note').value;
        if (k === 'any') P.wants = P.wants.indexOf('any') >= 0 ? [] : ['any'];
        else { P.wants = P.wants.filter(function (x) { return x !== 'any'; }); P.wants = P.wants.indexOf(k) >= 0 ? P.wants.filter(function (x) { return x !== k; }) : P.wants.concat([k]); }
        fillEdit();
      };
    });
    $('sw-pub-no').onclick = closeSheet;
    $('sw-pub-go').onclick = function () {
      var go = this, er = $('sw-pub-err'); go.disabled = true; go.textContent = L('Guardando…', 'Saving…');
      api('/api/swap/board/' + p.id + '/edit', { wants: P.wants, note: $('sw-pub-note').value }).then(function () {
        go.textContent = L('✓ Guardado', '✓ Saved');
        setTimeout(function () { closeSheet(); S.btab = 'mine'; loadBoard(); }, 600);
      }, function (e) { go.disabled = false; go.textContent = L('Guardar cambios', 'Save changes'); er.textContent = e.message; });
    };
  }
  /* Los bloques de STBY se cambian enteros: lo mismo al publicar en el tablón. */
  function corteP() {
    var P = PUB, ds = P.days; if (!ds || !P.picked.length) return '';
    var c = MOT.corteStby(ds, P.picked[0], P.picked[P.picked.length - 1], 'me');
    if (c) return L('Las STBY van en bloque: elige el bloque entero (', 'Standbys go as a block: pick the whole block (') + fCorta(ds[c.a].date) + (c.b !== c.a ? ' – ' + fCorta(ds[c.b].date) : '') + ')';
    var base = S.dir && S.dir.me && S.dir.me.base;
    var l = MOT.corteLinea(ds, P.picked[0], P.picked[P.picked.length - 1], 'me', base);
    return l ? L('Las líneas con pernocta van enteras: elige la línea completa (', 'Layover lines go as a whole: pick the complete line (') + fCorta(ds[l.a].date) + ' – ' + fCorta(ds[l.b].date) + ')' : '';
  }
  function isSegP() { var p = PUB.picked; return p.length > 0 && p[p.length - 1] - p[0] + 1 === p.length; }

  /* ── los dos rosters ─────────────────────────────────────────────────────── */
  function openPair(partner, preDates, proposal) {
    S.partner = partner; S.proposal = proposal || null; S.picked = []; S.msg = ''; S.state = 'idle'; S.hint = [];
    rotulaAtras(); pintaTabs();
    var body = $('sw-body');
    body.innerHTML = '<div class="sw-pad"><div class="sw-empty">' + L('Cargando los rosters…', 'Loading rosters…') + '</div></div>';
    // Desde el día 1 del mes: la regla de «una imaginaria antes de libre al mes» cuenta el mes entero.
    var t = today(), from = addDays(t, -7).slice(0, 8) + '01', to = addDays(t, 45);
    if (preDates && preDates.length) {
      if (preDates[0] < from) from = addDays(preDates[0], -7);
      if (preDates[preDates.length - 1] > to) to = addDays(preDates[preDates.length - 1], 7);
    }
    /* Un servidor anterior topaba el rango en 70 días: si se queja, se pide el de antes. */
    var pidePar = function (f) {
      return api('/api/swap/pair/' + partner.id + '?from=' + f + '&to=' + to).catch(function (er) {
        var f2 = addDays(t, -7);
        if (/rango/i.test(er.message || '') && f !== f2 && !(preDates && preDates.length && preDates[0] < f2)) return pidePar(f2);
        throw er;
      });
    };
    pidePar(from).then(function (j) {
      /* Un día «vuelo» sin tramos (vuelos importados sin hora programada) tumbaba el
         dibujo entero en c.legs[0]: carriles vacíos y sin un solo error. Se trata como
         una actividad sin horas. El servidor ya no los manda, pero un servidor viejo sí. */
      var sana = function (c) { return c && c.kind === 'flight' && !(c.legs && c.legs.length) ? { date: c.date, kind: 'other', code: c.code || 'FLT', report: null, end: null, legs: [], block: 0 } : c; };
      j.me = (j.me || []).map(sana); j.them = (j.them || []).map(sana);
      S.dates = j.me.map(function (c) { return c.date; });
      S.orig = { me: j.me, them: j.them };
      S.me = j.me.slice(); S.them = j.them.slice(); S.prof = j.profiles;
      S.firstShown = Math.max(0, S.dates.indexOf(t));
      renderPair();
      if (preDates && preDates.length) {
        S.picked = preDates.map(function (d) { return S.dates.indexOf(d); }).filter(function (i) { return i >= 0 && !esPasado(i); }).sort(function (a, b) { return a - b; });
        draw(); ui(); scrollToSel();
        setTimeout(function () { doSwap(); }, 450);
      } else {
        var w = $('sw-wrap'); if (w) w.scrollLeft = S.firstShown * DW;
        mesVisible();
      }
    }, function (e) { body.innerHTML = '<div class="sw-pad"><div class="sw-err">' + esc(e.message) + '</div></div>'; });
  }

  function renderPair() {
    var nm = firstName(S.partner);
    $('sw-body').innerHTML =
      '<div class="sw-top"><div class="sw-title">⇄ ' + L('Swap con ', 'Swap with ') + esc(nm) + '</div>' +
      '<div class="sw-sub">' + L('Pulsa los días que quieres cambiar (1 a 6 seguidos) y luego SWAP.', 'Tap the days you want to swap (1 to 6 in a row), then SWAP.') + '</div>' +
      '<div class="sw-legend"><span>' + (useLT() ? L('Horas locales', 'Local times') : L('Horas Z', 'Z times')) + '</span><span>' + L('Entre días: descanso', 'Between days: rest') + '</span><span style="color:var(--sw-ok)">' + L('verde ≥ 13:30', 'green ≥ 13:30') + '</span><span style="color:var(--sw-ko)">' + L('rojo &lt; 13:30', 'red &lt; 13:30') + '</span></div></div>' +
      '<div class="sw-mesbar"><span class="sw-mes" id="sw-mes"></span></div>' +
      '<div class="sw-wrapo"><div class="sw-wrap" id="sw-wrap"><div class="sw-tl" id="sw-tl"></div></div><div class="sw-lanes" id="sw-lanes" aria-hidden="true"></div></div>' +
      '<div class="sw-dock"><div class="sw-row"><div><div class="sw-stt" id="sw-st"></div><div class="sw-sub" id="sw-ss"></div></div>' +
      '<button class="sw-go dim" id="sw-go">SWAP</button></div>' +
      '<div class="sw-sug" id="sw-sug"></div><div class="sw-verdict" id="sw-vd"></div><div class="sw-info" id="sw-info"></div></div>' +
      '<div id="sw-dr"></div>' +
      '<div class="sw-note">' + L('Se comprueba: 13:30 h de descanso entre vuelos (calzos + 20 min hasta la presentación) o la duración de la actividad anterior si es mayor, descanso FTL de 12 h con cualquier actividad, 10 h fuera de base, 60 h de actividad en 7 días, una sola imaginaria antes de libre al mes y 5 días entre bloques de 3 imaginarias. La decisión final es de Vueling.', 'Checks: 13:30 h rest between flights (on-blocks + 20 min to report) or the previous duty length if longer, 12 h FTL rest after any duty, 10 h away from base, 60 h of duty in 7 days, only one standby before a day off per month and 5 days between blocks of 3 standbys. Vueling has the final say.') + '</div>';
    $('sw-go').onclick = onGo;
    var wr = $('sw-wrap'); if (wr) wr.addEventListener('scroll', mesVisible, { passive: true });
    draw(); ui();
  }

  /* El mes que se está mirando: el del día que cae en el centro de la tira. */
  function mesVisible() {
    var w = $('sw-wrap'), m = $('sw-mes'), G = S.G; if (!w || !m || !G || !S.dates.length) return;
    var cx = w.scrollLeft + w.clientWidth / 2 - 16, i = 0;
    while (i < S.dates.length - 1 && G.x[i] + G.w[i] < cx) i++;
    var d = S.dates[i], t = MES[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
    if (m.textContent !== t) m.textContent = t;
  }

  /* Se cambia de HOY en adelante: los días pasados se cargan (cuentan para los descansos,
     las 60 h en 7 días y la imaginaria del mes) pero no se pueden elegir. */
  function esPasado(i) { return S.dates[i] < today(); }
  function primerDia() { for (var i = 0; i < S.dates.length; i++) if (!esPasado(i)) return i; return S.dates.length; }

  function isSeg() { var p = S.picked; return p.length > 0 && p[p.length - 1] - p[0] + 1 === p.length; }
  function sel() { return isSeg() ? [S.picked[0], S.picked[S.picked.length - 1]] : null; }

  function cardHtml(c, big) {
    if (!c || c.kind === 'empty') return { cls: 'free', html: '<span style="font-size:10px">' + L('Sin roster', 'No roster') + '</span>' };
    if (c.kind === 'flight' && big) {
      return { cls: 'flight big', html:
        '<div class="ft" style="margin-top:0"><span>' + L('Pres. ', 'Rep. ') + '<b>' + clock(c.report) + '</b></span><span>' + esc(c.ac || '') + '</span></div>' +
        c.legs.map(function (l) { return '<div class="lg"><span>' + esc(l.dep + '-' + l.arr) + '</span><span>' + clockN(l.std) + '–' + clockN(l.sta) + '</span></div>'; }).join('') +
        '<div class="ft"><span>' + L('Calzos ', 'In ') + clock(c.end) + '</span><span>' + hhmm(c.block || 0) + ' h</span></div>' };
    }
    if (c.kind === 'flight' && c.legs && c.legs.length) {
      var ap = [c.legs[0].dep].concat(c.legs.map(function (l) { return l.arr; }));
      var route = ap.length > 3 ? ap[0] + '-…-' + ap[ap.length - 1] + ' (' + c.legs.length + ')' : ap.join('-');
      return { cls: 'flight', html: '<b>' + clock(c.report) + '</b>' + esc(route) + '<br>' + clock(c.end) };
    }
    if (c.report != null) return { cls: 'duty', html: '<b>' + esc(c.code) + '</b>' + clock(c.report) + '<br>' + clock(c.end) };
    return { cls: 'free', html: esc(c.code || 'OFF') };
  }

  /* ── motor de reglas: js/swap-motor.js (el mismo que usa el servidor en el Swap Board) ── */
  var MOT = window.SwapMotor;
  function dutyMin(c) { return MOT.dutyMin(c); }
  function hasDuty(c) { return MOT.hasDuty(c); }
  /* La base del dueño del carril: fuera de base el descanso mínimo es de 10 h. */
  function gaps(R) {
    var pr = S.prof || {}, b = R === S.them ? (pr.them && pr.them.base) || (pr.me && pr.me.base) : pr.me && pr.me.base;
    return MOT.gaps(R, null, b || '');
  }
  function swapped(s, e) { return MOT.swapped(S.orig.me, S.orig.them, s, e); }
  function quienEs(k) { return k === 'me' ? L('Tú', 'You') : firstName(S.partner); }
  function check(s, e) {
    var r = MOT.check({ dates: S.dates, me: S.orig.me, them: S.orig.them, s: s, e: e,
      rolMe: S.prof && S.prof.me && S.prof.me.rol, rolThem: S.prof && S.prof.them && S.prof.them.rol,
      baseMe: S.prof && S.prof.me && S.prof.me.base, baseThem: S.prof && S.prof.them && S.prof.them.base,
      left: dayDiff(today(), S.dates[s]) });
    if (r.worst) r.worst.who = quienEs(r.worst.who);
    if (r.training) r.training.who = quienEs(r.training.who);
    if (r.aerop) r.aerop.who = quienEs(r.aerop.who);
    if (r.sLib) r.sLib.who = quienEs(r.sLib.who);
    if (r.s3) r.s3.who = quienEs(r.s3.who);
    if (r.inv) r.inv.who = quienEs(r.inv.who);
    if (r.corte) r.corte.who = quienEs(r.corte.who);
    if (r.linea) r.linea.who = quienEs(r.linea.who);
    if (r.fOff) r.fOff.who = quienEs(r.fOff.who);
    return r;
  }

  /* ── dibujo ──────────────────────────────────────────────────────────────── */
  /* Geometría: los días elegidos se ensanchan para enseñar todos sus vuelos, y las
     tarjetas crecen para que quepan. Todo lo demás se coloca a partir de aquí. */
  function geo() {
    var s = sel(), w = [], x = [], acc = 0, N = S.dates.length;
    for (var i = 0; i < N; i++) { w[i] = s && i >= s[0] && i <= s[1] ? DWX : DW; x[i] = acc; acc += w[i]; }
    var maxLegs = 2;
    if (s) for (var j = s[0]; j <= s[1]; j++) [S.me[j], S.them[j]].forEach(function (c) { if (c && c.legs) maxLegs = Math.max(maxLegs, c.legs.length); });
    var H = s ? 46 + maxLegs * 17 : 66;
    return { w: w, x: x, total: acc, H: H, mk: 24, me: H + 76, div: H + 57, rail: H + 76 + H + 28 };
  }

  function draw() {
    var tl = $('sw-tl'); if (!tl) return;
    var N = S.dates.length, s = sel(), G = geo(), h = '';
    h += '<div class="sw-band mk" style="top:2px;height:' + (G.H + 52) + 'px"></div><div class="sw-band me" style="top:' + (G.H + 62) + 'px;height:' + (G.H + 50) + 'px"></div><div class="sw-div" style="top:' + G.div + 'px"></div>';
    var hoy = today();
    // Hoy sombreado y una raya donde empieza cada mes, para no perderse entre días de meses distintos.
    for (var i = 0; i < N; i++) h += '<div class="sw-col' + (S.dates[i] === hoy ? ' today' : '') + (i > 0 && S.dates[i].slice(8) === '01' ? ' m1' : '') + '" style="left:' + G.x[i] + 'px;width:' + G.w[i] + 'px"></div>';
    if (s) h += '<div class="sw-selbox ' + (S.state === 'ok' ? 'ok' : S.state === 'ko' ? 'ko' : '') + '" style="left:' + (G.x[s[0]] + 2) + 'px;width:' + (G.x[s[1]] + G.w[s[1]] - G.x[s[0]] - 4) + 'px;height:' + (G.rail - 22) + 'px"></div>';
    // Los nombres de los carriles NO van dentro de la tira: la tira rueda y abre en hoy, con
    // meses por detrás, así que un rótulo pegado al día 1 quedaba fuera de la pantalla. Van en
    // una capa encima que no rueda: siempre a la vista, en la esquina de cada carril.
    var ln = $('sw-lanes');
    if (ln) ln.innerHTML = '<div class="sw-lane mk" style="top:5px">' + esc(firstName(S.partner).toUpperCase()) + '</div><div class="sw-lane me" style="top:' + G.div + 'px">' + L('TÚ', 'YOU') + '</div>';
    [['them', 'mk'], ['me', 'me']].forEach(function (k) {
      var R = S[k[0]];
      R.forEach(function (c, i) {
        var x = cardHtml(c, G.w[i] === DWX);
        // Color del DUEÑO original: tras el SWAP tu tarjeta cian se ve en el carril del otro.
        var own = c && c === S.orig.me[i] ? ' own-me' : c && c === S.orig.them[i] ? ' own-mk' : '';
        h += '<div class="sw-blk ' + x.cls + own + '" data-i="' + i + '" data-k="' + k[1] + '" style="left:' + (G.x[i] + 4) + 'px;width:' + (G.w[i] - 8) + 'px;top:' + G[k[1]] + 'px;height:' + G.H + 'px">' + x.html + '</div>';
      });
      gaps(R).forEach(function (g) {
        if (g.b !== g.a + 1) return;
        var need = Math.max(g.needV, g.needF), ok = g.rest >= need;
        h += '<div class="sw-gap ' + (ok ? 'ok' : 'ko') + '" style="left:' + G.x[g.b] + 'px;top:' + (G[k[1]] + G.H + 13) + 'px"><span data-v="' + g.rest + '">' + hhmm(g.rest) + '</span></div>';
      });
    });
    h += '<div class="sw-rail" style="top:' + G.rail + 'px">';
    for (var j = 0; j < N; j++) {
      var on = S.picked.indexOf(j) >= 0, hi = S.hint.indexOf(j) >= 0;
      var esHoy = S.dates[j] === hoy, pas = S.dates[j] < hoy;
      h += '<button class="sw-dl' + (on ? ' on' : '') + (hi ? ' hint' : '') + (esHoy ? ' today' : '') + (pas ? ' past' : '') + '" data-i="' + j + '" aria-pressed="' + on + '"' + (pas ? ' aria-disabled="true"' : '') + ' style="left:' + (G.x[j] + 6) + 'px;width:' + (G.w[j] - 12) + 'px">' + (esHoy ? L('Hoy', 'Today') : WD[wd(S.dates[j])]) + '<b>' + dnum(S.dates[j]) + '</b></button>';
    }
    h += '</div><div class="sw-mons" style="top:' + (G.rail + 56) + 'px">';
    for (var k = 0; k < N; k++) if (k === 0 || S.dates[k].slice(8) === '01') h += '<div class="sw-mon" style="left:' + (G.x[k] + 6) + 'px">' + MES[+S.dates[k].slice(5, 7) - 1] + '</div>';
    h += '</div><div class="sw-plane" id="sw-plane">✈</div>';
    tl.style.width = G.total + 'px';
    tl.style.height = (G.rail + 78) + 'px';
    S.G = G;
    tl.innerHTML = h;
    tl.querySelectorAll('.sw-dl').forEach(function (b) { b.onclick = function () { tapDay(+b.dataset.i); }; });
    tl.querySelectorAll('.sw-blk').forEach(function (b) { b.onclick = function () { openSheet(+b.dataset.i); }; });
    drawDR();
    mesVisible();
  }

  /* ── Lo que das y lo que recibes ─────────────────────────────────────────── */
  function ticket(c, who, cls) {
    if (!c || c.kind === 'empty') return '<div class="sw-tk ' + cls + ' free"><div class="who">' + who + '</div><div class="tm">' + L('Sin roster', 'No roster') + '</div><div class="ft">' + L('No hay nada importado ese día', 'Nothing imported for that day') + '</div></div>';
    if (c.kind !== 'flight') {
      var dutyTxt = c.report != null ? esc(c.code) + ' ' + clockN(c.report) + '–' + clockN(c.end) : '';
      return '<div class="sw-tk ' + cls + ' free"><div class="who">' + who + '</div><div class="tm">' + (dutyTxt ? dutyTxt : 'OFF') + '</div><div class="ft">' + (dutyTxt ? L('Actividad en tierra', 'Ground duty') : (c.code && c.code !== 'OFF' ? esc(c.code) : '')) + '</div></div>';
    }
    return '<div class="sw-tk ' + cls + '"><div class="who">' + who + '</div><div class="tm">' + clockN(c.report) + '<span>→</span>' + clockN(c.end) + '</div>' +
      c.legs.map(function (l) { return '<div class="lg"><b>' + esc(l.dep + '-' + l.arr) + '</b><span>' + clockN(l.std) + '–' + clockN(l.sta) + '</span></div>'; }).join('') +
      '<div class="ft">' + (c.ac ? esc(c.ac) + ' · ' : '') + hhmm(c.block || 0) + L(' h vuelo · ', ' h flight · ') + hhmm(dutyMin(c)) + L(' h act.', ' h duty') + '</div></div>';
  }
  function track(a, b) {
    var off = useLT() ? -new Date().getTimezoneOffset() : 0;
    var bar = function (c, top, col) {
      if (!c || c.report == null) return '';
      var s = ((c.report + off) % 1440 + 1440) % 1440, len = Math.min(1440 - s, (c.end + (c.kind === 'flight' ? POST : 0)) - c.report);
      return '<div class="bar" style="left:' + (s / 14.4) + '%;width:' + Math.max(2, len / 14.4) + '%;top:' + top + 'px;background:' + col + '"></div>';
    };
    return '<div class="sw-track">' + [6, 12, 18].map(function (hh) { return '<i style="left:' + (hh / 24 * 100) + '%"></i><em style="left:' + (hh / 24 * 100) + '%">' + hh + 'h</em>'; }).join('') +
      bar(a, 3, 'var(--sw-me)') + bar(b, 12, 'var(--sw-mk)') + '</div>';
  }
  function drawDR() {
    var el = $('sw-dr'); if (!el) return;
    var s = sel(); if (!s) { el.innerHTML = ''; return; }
    var give = S.orig.me, get = S.orig.them, tg = 0, tr = 0, dg = 0, dr = 0, ng = 0, nr = 0, eg = 0, er = 0, rows = '';
    var fly = function (c) { return c && c.kind === 'flight' ? 1 : 0; };
    var early = function (c) { if (!c || c.report == null || !hasDuty(c)) return 0; var off = useLT() ? -new Date().getTimezoneOffset() : 0; return ((c.report + off) % 1440 + 1440) % 1440 < 7 * 60 ? 1 : 0; };
    for (var i = s[0]; i <= s[1]; i++) {
      tg += (give[i] && give[i].block) || 0; tr += (get[i] && get[i].block) || 0;
      dg += dutyMin(give[i]); dr += dutyMin(get[i]); ng += fly(give[i]); nr += fly(get[i]); eg += early(give[i]); er += early(get[i]);
      rows += '<div class="sw-tday"><div class="sw-tday-h"><b>' + dayShort(i) + '</b>' + track(give[i], get[i]) + '</div>' +
        '<div class="sw-tix">' + ticket(give[i], L('DAS', 'YOU GIVE'), 'me') + '<div class="sw-swp">⇄</div>' + ticket(get[i], L('RECIBES', 'YOU GET'), 'mk') + '</div></div>';
    }
    var cl = function (v) { return v > 0 ? 'up' : v < 0 ? 'dn' : 'eq'; };
    var sg = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + hhmm(Math.abs(v)); };
    var lib = ng - nr, libTxt = lib > 0 ? '+' + lib + ' OFF' : lib < 0 ? lib + ' OFF' : L('mismos días', 'same days');
    var tile = function (k, a, b, d, c) { return '<div class="sw-tile"><div class="k">' + k + '</div><div class="v">' + a + ' <small>→</small> ' + b + '</div><div class="d ' + c + '">' + d + '</div></div>'; };
    el.innerHTML = '<div class="sw-dr"><div class="sw-h" style="margin-top:0">' + L('Lo que das y lo que recibes', 'What you give and what you get') + '</div>' +
      '<div class="sw-bal"><div class="sw-row"><b style="font-size:16px">' + L('Tu balance con el cambio', 'Your balance with the swap') + '</b><span class="sw-sub">' + (s[1] - s[0] + 1) + (s[1] > s[0] ? L(' días', ' days') : L(' día', ' day')) + '</span></div><div class="sw-tiles">' +
      tile(L('Días de vuelo', 'Flying days'), ng, nr, libTxt, cl(lib)) + tile(L('Horas de vuelo', 'Flight hours'), hhmm(tg), hhmm(tr), sg(tr - tg) + ' h', cl(tr - tg)) +
      tile(L('Actividad', 'Duty'), hhmm(dg), hhmm(dr), sg(dr - dg) + ' h', cl(dg - dr)) +
      tile(L('Madrugones', 'Early starts'), eg, er, er < eg ? (eg - er) + L(' menos', ' fewer') : er > eg ? (er - eg) + L(' más', ' more') : L('igual', 'same'), er < eg ? 'up' : er > eg ? 'dn' : 'eq') +
      '</div><div class="sw-sub" style="margin-top:8px">' + L('Madrugón: presentación antes de las 07:00. Verde = mejor para tu descanso o tu nómina; ámbar = te toca más.', 'Early start: report before 07:00. Green = better for your rest or pay; amber = more for you.') + '</div></div>' + rows + '</div>';
  }

  /* ── Ficha del día (hoja inferior) ───────────────────────────────────────── */
  var shI = 0;
  function sheetEls() {
    var bg = $('sw-shbg'), sh = $('sw-sh');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'sw-shbg'; bg.className = 'sw-shbg';
      sh = document.createElement('div'); sh.id = 'sw-sh'; sh.className = 'sw-sheet';
      /* En <body>, no dentro de la pantalla: la barra inferior de la app queda por
         encima de cualquier cosa que viva dentro de un .screen. */
      var root = document.createElement('div'); root.id = 'sw-sheet-root'; root.setAttribute('translate', 'no');
      root.appendChild(bg); root.appendChild(sh); document.body.appendChild(root);
      bg.onclick = closeSheet;
      var x0 = null, y0 = null;
      sh.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      sh.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && S.sheetDia) { if (dx < 0 && shI < S.dates.length - 1) shI++; else if (dx > 0 && shI > 0) shI--; fillSheet(); }
        else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) closeSheet();
        x0 = null;
      }, { passive: true });
    }
    return { bg: bg, sh: sh };
  }
  function openSheet(i) { shI = i; S.sheetDia = true; var e = sheetEls(); fillSheet(); e.sh.classList.add('open'); e.bg.classList.add('open'); }
  function closeSheet() { S.sheetDia = false; var bg = $('sw-shbg'), sh = $('sw-sh'); if (bg) bg.classList.remove('open'); if (sh) sh.classList.remove('open'); }
  function pilotBlock(label, cls, R, i) {
    var c = R[i], g = gaps(R), before = null, after = null;
    g.forEach(function (x) { if (x.b === i && x.a === i - 1) before = x; if (x.a === i && x.b === i + 1) after = x; });
    var rest = function (x) { return x ? '<b style="color:var(' + (x.rest >= Math.max(x.needV, x.needF) ? '--sw-ok' : '--sw-ko') + ')">' + hhmm(x.rest) + '</b>' : '—'; };
    var h = '<div class="sw-shp ' + cls + '"><span class="sw-tag ' + cls + '">' + esc(label) + '</span>';
    if (!c || c.kind === 'empty') h += '<div style="font-size:15px;font-weight:600;margin-top:4px">' + L('Sin roster', 'No roster') + '</div><div class="kv" style="padding-top:0">' + L('No hay nada importado ese día', 'Nothing imported for that day') + '</div>';
    else if (c.kind !== 'flight') h += '<div style="font-size:15px;font-weight:600;margin-top:4px">' + (c.report != null ? esc(c.code) + ' · ' + clock(c.report) + '–' + clock(c.end) : 'OFF' + (c.code && c.code !== 'OFF' ? ' <span style="font-weight:400;font-size:13px;color:var(--sw-muted)">' + esc(c.code) + '</span>' : '')) + '</div>';
    else h += '<div class="kv" style="padding-top:4px"><span>' + L('Presentación', 'Report') + ' <b>' + clock(c.report) + '</b></span><span>' + esc(c.ac || '') + '</span></div>' +
      c.legs.map(function (l) { return '<div class="lg"><b>' + esc(l.fn) + '</b><span>' + esc(l.dep) + ' → ' + esc(l.arr) + '</span><span>' + clock(l.std) + ' – ' + clock(l.sta) + '</span></div>'; }).join('') +
      '<div class="kv"><span>' + L('Calzos', 'On-blocks') + ' <b>' + clock(c.end) + '</b></span><span>' + L('Vuelo', 'Flight') + ' <b>' + hhmm(c.block || 0) + '</b> · ' + L('Actividad', 'Duty') + ' <b>' + hhmm(dutyMin(c)) + '</b></span></div>';
    return h + '<div class="kv"><span>' + L('Descanso antes ', 'Rest before ') + rest(before) + '</span><span>' + L('Descanso después ', 'Rest after ') + rest(after) + '</span></div></div>';
  }
  function fillSheet() {
    var i = shI, sh = $('sw-sh'), t = dayName(i);
    sh.innerHTML = '<div class="grab"></div><div class="sw-row"><button class="sw-nav" id="sw-shp"' + (i === 0 ? ' disabled' : '') + '>‹</button><b style="font-size:17px">' + esc(t.charAt(0).toUpperCase() + t.slice(1)) + '</b><button class="sw-nav" id="sw-shn"' + (i === S.dates.length - 1 ? ' disabled' : '') + '>›</button></div>' +
      pilotBlock(L('TÚ', 'YOU'), 'me', S.me, i) + pilotBlock(firstName(S.partner).toUpperCase(), 'mk', S.them, i) +
      '<button class="sw-go" id="sw-shsel" style="width:100%;margin-top:14px">' + (S.picked.indexOf(i) >= 0 ? L('Quitar este día', 'Remove this day') : L('Elegir este día', 'Pick this day')) + '</button>';
    $('sw-shp').onclick = function () { if (shI > 0) { shI--; fillSheet(); } };
    $('sw-shn').onclick = function () { if (shI < S.dates.length - 1) { shI++; fillSheet(); } };
    $('sw-shsel').onclick = function () { closeSheet(); tapDay(i); };
  }

  function tapDay(i) {
    if (S.state === 'anim') return;
    if (esPasado(i)) { S.msg = L('Ese día ya ha pasado: se cambia de hoy en adelante', 'That day has passed: swaps are from today onwards'); ui(); return; }
    if (S.state !== 'idle') resetSwap();
    S.msg = '';
    if (S.picked.indexOf(i) >= 0) S.picked = S.picked.filter(function (x) { return x !== i; });
    else if (S.picked.length >= MAXD) S.msg = L('Como máximo ', 'At most ') + MAXD + L(' días', ' days');
    else S.picked = S.picked.concat([i]).sort(function (a, b) { return a - b; });
    if (S.picked.length && !isSeg()) S.msg = L('Tienen que ser días seguidos', 'The days must be in a row');
    S.hint = []; draw(); ui(); scrollToSel();
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) {}
  }

  function resetSwap() {
    S.me = S.orig.me.slice(); S.them = S.orig.them.slice(); S.state = 'idle';
    var vd = $('sw-vd'); if (vd) { vd.className = 'sw-verdict'; vd.textContent = ''; }
    if ($('sw-info')) $('sw-info').innerHTML = '';
    if ($('sw-sug')) $('sw-sug').innerHTML = '';
    if ($('sw-go')) { $('sw-go').textContent = 'SWAP'; $('sw-go').dataset.undo = ''; }
  }

  function ui() {
    var go = $('sw-go'), st = $('sw-st'), ss = $('sw-ss'); if (!go) return;
    var s = sel();
    if (!s) {
      st.textContent = S.picked.length ? S.picked.length + L(' días elegidos', ' days picked') : L('Elige los días', 'Pick the days');
      ss.textContent = S.msg || L('Pulsa los días que quieres cambiar', 'Tap the days you want to swap');
      go.className = 'sw-go dim'; return;
    }
    go.className = 'sw-go' + (S.state === 'anim' ? ' dim' : '');
    if (S.state === 'idle') {
      var n = s[1] - s[0] + 1;
      st.textContent = n + (n > 1 ? L(' días', ' days') : L(' día', ' day'));
      ss.textContent = S.msg || ((n > 1 ? L('Del ', 'From ') + dayName(s[0]) + L(' al ', ' to ') + dayName(s[1]) : dayName(s[0])) + L(' · pulsa SWAP', ' · tap SWAP'));
    }
  }

  function scrollToSel() {
    var w = $('sw-wrap'), s = sel(); if (!w || !s) return;
    var G = geo(), l = G.x[s[0]], r = G.x[s[1]] + G.w[s[1]];
    if (l < w.scrollLeft || r > w.scrollLeft + w.clientWidth - 16) w.scrollTo({ left: Math.max(0, l - 30), behavior: 'smooth' });
  }

  function countUp() {
    document.querySelectorAll('#sw-tl .sw-gap span').forEach(function (sp) {
      var v = +sp.dataset.v, t0 = performance.now();
      (function step(t) { var p = Math.min(1, (t - t0) / 700); sp.textContent = hhmm(v * p); if (p < 1) requestAnimationFrame(step); })(t0);
    });
  }

  /* ── SWAP ────────────────────────────────────────────────────────────────── */
  function onGo() {
    if ($('sw-go').dataset.undo === '1') { resetSwap(); draw(); ui(); return; }
    doSwap();
  }

  function doSwap() {
    var s = sel(); if (!s || S.state === 'anim') return;
    if (S.state !== 'idle') { resetSwap(); draw(); }
    S.state = 'anim'; ui();
    var a = s[0], e = s[1], G = geo(), dy = G.me - G.mk, r = check(a, e);
    document.querySelectorAll('#sw-tl .sw-blk').forEach(function (b) {
      var i = +b.dataset.i; if (i < a || i > e) return;
      var up = b.dataset.k === 'me';
      try {
        b.animate([{ transform: 'translateY(0)' },
          { transform: 'translateY(' + (up ? -dy : dy) / 2 + 'px) translateX(' + (up ? -14 : 14) + 'px) scale(1.15) rotate(' + (up ? -4 : 4) + 'deg)', offset: 0.5 },
          { transform: 'translateY(' + (up ? -dy : dy) + 'px)' }], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
      } catch (x) {}
    });
    document.querySelectorAll('#sw-tl .sw-gap').forEach(function (g) { try { g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }); } catch (x) {} });
    var pl = $('sw-plane'), y = (G.me + G.mk) / 2 + G.H / 2;
    try { pl.animate([{ left: (G.x[a] - 20) + 'px', top: y + 'px', opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { left: (G.x[e] + G.w[e]) + 'px', top: (y - 6) + 'px', opacity: 0 }], { duration: 900, easing: 'ease-in-out' }); } catch (x) {}
    setTimeout(function () {
      var R = swapped(a, e); S.me = R.me; S.them = R.them;
      S.state = r.ok ? 'ok' : 'ko';
      draw(); countUp(); ui();
      var vd = $('sw-vd');
      vd.style.background = 'var(' + (r.ok ? '--sw-ok-bg' : '--sw-ko-bg') + ')'; vd.style.color = 'var(' + (r.ok ? '--sw-ok' : '--sw-ko') + ')';
      vd.textContent = r.ok ? L('✓ Vueling lo acepta', '✓ Vueling accepts it') : L('✗ Vueling lo rechaza', '✗ Vueling rejects it');
      requestAnimationFrame(function () { vd.className = 'sw-verdict show'; });
      try { navigator.vibrate && navigator.vibrate(r.ok ? 30 : [40, 60, 40]); } catch (x) {}
      if (r.ok) showOk(a, e, r); else showKo(a, e, r);
    }, 780);
  }

  /* Calzos locales de la predicción de invasión: «23:40» o «00:15 del día libre». */
  function finLocal(f) { var m = ((Math.round(f) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ' LT'; }
  function txtInv(who, cuando) {
    return who + ': ' + L('calzos a las ', 'on-blocks at ') + cuando + L(' la víspera de un día libre. Vueling no lo aceptará por posible invasión de día libre', ' the day before a day off. Vueling won\'t accept it: possible day-off invasion');
  }
  /* Bloques de STBY: «del 21 al 23». Se cambian enteros (piloto, 20-oct-2026). */
  /* Las líneas con pernocta se cambian ENTERAS (piloto, 25-oct-2026): partir una
     deja a uno durmiendo fuera y al otro empezando el día siguiente en otro sitio. */
  function txtLinea(who, a, b, nom) {
    var yo = who === L('Tú', 'You');
    return (yo ? L('Tu línea con pernocta (', 'Your layover line (') : who + L(': su línea con pernocta (', ': their layover line ('))
      + nom(a) + ' – ' + nom(b) + L(') va entera: hay que cambiar la línea completa', ') goes as a whole: the complete line must be swapped');
  }
  function txtCorte(who, a, b, nom) {
    return who + ': ' + L('las STBY van en bloque (', 'standbys go as a block (') + nom(a) + (b !== a ? ' – ' + nom(b) : '') + L('): hay que cambiar el bloque entero', '): the whole block must be swapped');
  }
  /* F detrás de un OFF: no bloquea, es una NOTA (piloto, 20-oct-2026). */
  function notaFOff(f, nom) {
    if (!f) return '';
    var yo = f.who === L('Tú', 'You');
    return '<div class="sw-info sw-nota-f"><b>' + L('F después de un OFF', 'F after an OFF') + ' (' + esc(nom(f.day)) + ').</b> ' +
      (yo ? L('Al aceptar el cambio tienes que estar contactable durante el OFF de la víspera: el franco se programa hasta el día anterior.',
              'By accepting the swap you must be reachable during the OFF the day before: the F day can be scheduled up to the day before.')
          : esc(f.who) + L(' tendrá que estar contactable durante el OFF de la víspera: el franco se programa hasta el día anterior.',
                           ' will have to be reachable during the OFF the day before: the F day can be scheduled up to the day before.')) + '</div>';
  }
  /* Simulador o actividad en tierra dentro del cambio: se puede, pero lo valida
     Training y no puede afectar a las caducidades (Planning, 27-oct-2026). */
  function notaTraining(t, nom) {
    if (!t) return '';
    return '<div class="sw-info"><b>' + L('Incluye un simulador o formación', 'Includes a simulator or training') + ' (' + esc(nom(t.day)) + ').</b> ' +
      L('Se puede cambiar, pero siempre lo valida Training y no puede afectar a las caducidades de ninguno de los dos.',
        'It can be swapped, but Training always has to approve it and it can\'t affect either pilot\'s expiry dates.') + '</div>';
  }
  /* Florencia, San Sebastián, Keflavik y Reykjavik tienen requisitos propios de
     habilitación o especialidad: la app no sabe si el que lo recibe los cumple. */
  function notaAerop(a, nom) {
    if (!a) return '';
    return '<div class="sw-info"><b>' + esc(a.who) + ': ' + esc(a.apt) + ' (' + esc(nom(a.day)) + ').</b> ' +
      L('Es un aeropuerto con requisitos propios de habilitación y especialidad: comprueba que quien lo recibe puede operarlo antes de pedir el cambio.',
        'This airport has its own qualification and position requirements: check that whoever takes it can operate it before requesting the swap.') + '</div>';
  }
  /* Fatiga prevista antes → después del cambio (public/fatiga/swap.js, el MISMO
     motor que la pantalla de Fatiga). No bloquea: Planning sólo comprueba las 60 h
     en 7 días. Se dice también cuando NO cambia, para que «igual» y «no lo he
     mirado» no se vean iguales. */
  var FAT_NIV = { bajo: ['Baja', 'Low'], moderado: ['Moderada', 'Moderate'], alto: ['Alta', 'High'] };
  function fatNiv(n) { var t = FAT_NIV[n] || [n, n]; return L(t[0], t[1]); }
  function fatKss(v) { return v == null ? '' : (EN ? String(v) : String(v).replace('.', ',')); }
  function fatChip(x) {
    if (!x) return '<span class="sw-fz n-no">' + L('Sin jornada', 'No duty') + '</span>';
    return '<span class="sw-fz n-' + x.nivel + '">' + fatNiv(x.nivel) + ' · KSS ' + fatKss(x.kss) + '</span>';
  }
  /* Por qué empeora: los dos primeros factores del día de DESPUÉS que no tenía antes. */
  function fatPorQue(d) {
    if (!d.peor || !d.despues) return '';
    var antes = {}; (d.antes && d.antes.factores || []).forEach(function (f) { antes[f.k] = 1; });
    var hm = function (m) { m = Math.round(m); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
    var hl = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0'); };
    var t = (d.despues.factores || []).filter(function (f) { return !antes[f.k]; }).map(function (f) {
      switch (f.k) {
        case 'firma_wocl': return L('firma a las ', 'report at ') + hl(f.h) + L(', antes de las 05:00', ', before 05:00');
        case 'madrugada': return L('madrugada: firma a las ', 'early start: report at ') + hl(f.h);
        case 'madrugadas_seguidas': return f.n + L('ª madrugada seguida', ' early starts in a row');
        case 'tarde': return L('último aterrizaje a las ', 'last landing at ') + hl(f.h);
        case 'wocl': return L('vuelas entre las 02:00 y las 06:00', 'flying between 02:00 and 06:00');
        case 'poco_sueno': return L('sueño posible: ', 'possible sleep: ') + hm(f.min);
        case 'sectores': return f.n + L(' sectores', ' sectors');
        case 'despierto': return hm(f.min) + L(' despierto', ' awake');
        case 'deuda': return L('deuda de sueño: ', 'sleep debt: ') + hm(f.min);
        default: return '';
      }
    }).filter(Boolean).slice(0, 2);
    return t.length ? '<div class="sw-fat-pq">' + esc(t.join(' · ')) + '</div>' : '';
  }
  function fatCambio(a, e) {
    if (!window.FatigaSwap || !window.FatigaMotor) return null;
    var pr = S.prof || {}, bMe = (pr.me && pr.me.base) || '', bTh = (pr.them && pr.them.base) || bMe;
    var sw = swapped(a, e);
    function off(base) { return function (ms) { return MOT.offMin(new Date(ms).toISOString().slice(0, 10), base); }; }
    try {
      return {
        // Tu perfil de sueño (Fatiga › Tus datos) sólo vale para ti: el compañero, con el modelo de siempre.
        me: FatigaSwap.compara({ dates: S.dates, antes: S.orig.me, despues: sw.me, base: bMe, offset: off(bMe), s: a, e: e, perfil: window.FatigaPerfil ? FatigaPerfil.actual() : null }),
        them: FatigaSwap.compara({ dates: S.dates, antes: S.orig.them, despues: sw.them, base: bTh, offset: off(bTh), s: a, e: e })
      };
    } catch (err) { try { console.warn('[swap] fatiga', err); } catch (_) {} return null; }
  }
  function notaFatiga(a, e) {
    var f = fatCambio(a, e);
    if (!f || (!f.me && !f.them)) return '';
    var nm = firstName(S.partner);
    function bloque(r, quien, yo) {
      if (!r || !r.dias.length) return '';
      var dias = r.dias.slice().sort(function (x, y) { return (y.peor - x.peor) || (y.dNivel - x.dNivel) || (y.dKss - x.dKss); }).slice(0, 4)
        .sort(function (x, y) { return x.i - y.i; });
      var tono = r.sube || r.altoNuevo ? 'peor' : r.baja ? 'mejor' : dias.some(function (d) { return d.peor; }) ? 'peor' : 'mejor';
      return '<div class="sw-fat-p ' + tono + '"><div class="sw-fat-q"><span class="sw-tag ' + (yo ? 'me' : 'mk') + '">' + esc(quien) + '</span>' +
        '<span class="sw-fat-r">' + (r.altoNuevo ? L('Queda en fatiga alta', 'Ends up at high fatigue') : tono === 'peor' ? L('Más cansancio', 'More tired') : L('Menos cansancio', 'Less tired')) + '</span></div>' +
        dias.map(function (d) {
          return '<div class="sw-fat-d" data-fat-dia="' + d.fecha + '"><span class="sw-fat-dn">' + esc(dayName(d.i)) + '</span>' + fatChip(d.antes) +
            '<span class="sw-fat-ar ' + (d.peor ? 'peor' : d.mejor ? 'mejor' : '') + '">→</span>' + fatChip(d.despues) + '</div>' + fatPorQue(d);
        }).join('') + '</div>';
    }
    var h = bloque(f.me, L('TÚ', 'YOU'), true) + bloque(f.them, nm.toUpperCase(), false);
    var hay = !!h;
    return '<div class="sw-fat" data-fat="' + (hay ? 'cambia' : 'igual') + '">' +
      '<div class="sw-fat-h"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>' +
      '<b>' + L('Fatiga prevista', 'Forecast fatigue') + '</b></div>' +
      (hay ? h : '<div class="sw-fat-eq">' + L('No cambia con este cambio: ni para ti ni para ', 'This swap doesn\'t change it: not for you or for ') + esc(nm) + '.</div>') +
      '<div class="sw-fat-pie">' + L('Estimación con el modelo de fatiga de la app (población media, el sueño se supone desde el roster). Orientativa: no impide el cambio.',
        'Estimate from the app\'s fatigue model (population average, sleep assumed from the roster). For guidance only: it doesn\'t stop the swap.') + '</div></div>';
  }
  function checks(r) {
    return [[L('Descanso de Vueling (13:30 h entre vuelos)', 'Vueling rest (13:30 h between flights)'), !r.vBad],
            [L('Descanso FTL (12 h o la actividad anterior)', 'FTL rest (12 h or the previous duty)'), !r.ftlBad]]
      .concat(r.fueraAplica ? [[L('Descanso fuera de base (10 h o la actividad anterior)', 'Rest away from base (10 h or the previous duty)'), !r.fueraBad]] : [])
      .concat(r.simAplica ? [[L('Descanso antes del simulador (13:30 h a 5 días o más · 12 h a menos)', 'Rest before the simulator (13:30 h at 5+ days · 12 h with less)'), !r.simBad]] : [])
      .concat([
            [L('Actividad en 7 días ≤ 60 h (', 'Duty in 7 days ≤ 60 h (') + hhmm(r.max7) + ' h)', !r.over7],
            [L('Una sola imaginaria antes de libre al mes', 'Only one standby before a day off per month'), !r.sLib],
            [L('5 días entre bloques de 3 imaginarias', '5 days between blocks of 3 standbys'), !r.s3],
            [L('Sin posible invasión de día libre (calzos antes de las ', 'No possible day-off invasion (on-blocks before ') + finLocal(MOT.INV_LIBRE_MIN) + L(' la víspera)', ' the day before)'), !r.inv],
            [L('Los bloques de STBY se cambian enteros', 'Standby blocks are swapped whole'), !r.corte],
            [L('Las líneas con pernocta se cambian enteras', 'Layover lines are swapped whole'), !r.linea]])
      .map(function (c) { return '<div class="sw-chk"><span style="color:var(' + (c[1] ? '--sw-ok' : '--sw-ko') + ');font-weight:800">' + (c[1] ? '✓' : '✗') + '</span>' + c[0] + '</div>'; }).join('');
  }

  function showKo(a, e, r) {
    $('sw-go').textContent = 'SWAP'; $('sw-go').dataset.undo = '';
    var st = $('sw-st'), ss = $('sw-ss');
    st.textContent = L('No cuadra', 'Doesn\'t work');
    if (r.roles) ss.textContent = L('Solo se cambia entre la misma especialidad (', 'Swaps only within the same position (') + S.prof.me.rol + ' / ' + S.prof.them.rol + ')';
    else if (r.worst) ss.textContent = r.worst.who + ': ' + hhmm(r.worst.rest) + (r.worst.fuera ? L(' de descanso fuera de base antes del ', ' rest away from base before ') : r.worst.sim ? L(' de descanso antes del simulador del ', ' rest before the simulator on ') : L(' de descanso antes del ', ' rest before ')) + dayName(r.worst.day) + L(' · faltan ', ' · short by ') + hhmm(r.worst.miss);
    else if (r.sLib) ss.textContent = r.sLib.who + ': ' + r.sLib.n + L(' imaginarias antes de libre en ', ' standbys before a day off in ') + MES[+r.sLib.mes.slice(5, 7) - 1] + L(' (máximo 1)', ' (max 1)');
    else if (r.corte) ss.textContent = txtCorte(r.corte.who, r.corte.a, r.corte.b, dayName);
    else if (r.linea) ss.textContent = txtLinea(r.linea.who, r.linea.a, r.linea.b, dayName);
    else if (r.inv) ss.textContent = txtInv(r.inv.who, finLocal(r.inv.fin) + L(' del ', ' on ') + dayName(r.inv.day));
    else if (r.s3) ss.textContent = r.s3.who + ': ' + L('bloque de 3 imaginarias el ', 'block of 3 standbys on ') + dayName(r.s3.day) + L(' con solo ', ' with only ') + r.s3.gap + L(' días desde el anterior (mínimo 5)', ' days since the previous one (min 5)');
    else ss.textContent = L('Pasa de 60 h de actividad en 7 días (', 'Over 60 h of duty in 7 days (') + hhmm(r.max7) + ' h)';
    $('sw-info').innerHTML = notaFOff(r.fOff, dayName) + notaAerop(r.aerop, dayName) + checks(r);
    if (r.roles) return;
    var opts = [], n0 = e - a + 1;
    /* `len` y no `L`: un `var L` aquí tapaba la función L() de los idiomas en TODA
       showKo (el var se eleva) y el «no cuadra» se rompía (Beta.1119). */
    for (var len = n0 + 1; len <= MAXD; len++) for (var x = Math.max(primerDia(), e - len + 1); x <= a && x + len - 1 < S.dates.length; x++) {
      var y = x + len - 1; if (y < e) continue;
      if (check(x, y).ok) opts.push([x, y]);
    }
    S.hint = []; var sug = $('sw-sug');
    opts.slice(0, 3).forEach(function (o) {
      var ex = []; for (var i = o[0]; i <= o[1]; i++) if (i < a || i > e) ex.push(i);
      S.hint = S.hint.concat(ex);
      var c = document.createElement('button'); c.className = 'sw-chip';
      c.textContent = L('Añade ', 'Add ') + ex.map(dayShort).join(' + ') + ' ✓';
      c.onclick = function () { resetSwap(); S.picked = []; for (var i = o[0]; i <= o[1]; i++) S.picked.push(i); S.msg = ''; S.hint = []; draw(); ui(); doSwap(); };
      sug.appendChild(c);
    });
    if (!opts.length) sug.innerHTML = '<span class="sw-sub">' + L('Tampoco cuadra alargándolo hasta ', 'It doesn\'t work even extended to ') + MAXD + L(' días.', ' days.') + '</span>';
    document.querySelectorAll('#sw-tl .sw-dl').forEach(function (d, k) { d.classList.toggle('hint', S.hint.indexOf(k) >= 0); });
  }

  function blockOf(R, a, e) { var t = 0; for (var i = a; i <= e; i++) if (R[i] && R[i].kind === 'flight') t += R[i].block || 0; return t; }
  function dutyOf(R, a, e) { var t = 0; for (var i = a; i <= e; i++) t += dutyMin(R[i]); return t; }
  function sgn(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + hhmm(Math.abs(v)); }

  function showOk(a, e, r) {
    var n = e - a + 1, nm = firstName(S.partner);
    $('sw-st').textContent = n + (n > 1 ? L(' días cambiados', ' days swapped') : L(' día cambiado', ' day swapped'));
    $('sw-ss').textContent = L('Toca DESHACER para volver atrás', 'Tap UNDO to go back');
    $('sw-go').textContent = L('DESHACER', 'UNDO'); $('sw-go').dataset.undo = '1';
    var dMe = blockOf(S.me, a, e) - blockOf(S.orig.me, a, e), dTh = blockOf(S.them, a, e) - blockOf(S.orig.them, a, e);
    var uMe = dutyOf(S.me, a, e) - dutyOf(S.orig.me, a, e);
    var left = dayDiff(today(), S.dates[a]);
    var h = notaFOff(r.fOff, dayName) + notaTraining(r.training, dayName) + notaAerop(r.aerop, dayName) + notaFatiga(a, e) + checks(r);
    h += '<div class="sw-money"><div class="sw-mc me"><span class="sw-tag me">' + L('TÚ', 'YOU') + '</span><b>' + sgn(dMe) + ' h</b><span>' + L('de vuelo · ', 'flight · ') + sgn(uMe) + L(' h de actividad', ' h duty') + '</span></div>' +
         '<div class="sw-mc mk"><span class="sw-tag mk">' + esc(nm.toUpperCase()) + '</span><b>' + sgn(dTh) + ' h</b><span>' + L('de vuelo · lo que cobra lo ve él', 'flight · their pay is theirs to see') + '</span></div></div>';
    h += '<div class="sw-sub" style="margin-top:6px">' + L('El efecto en euros lo calcula Pay Check con las horas programadas; de tu compañero solo se enseñan horas.', 'Pay Check works out the effect in euros from scheduled hours; for your colleague only hours are shown.') + '</div>';
    if (left < 0) h += '<div class="sw-info">' + L('<b>Es un día pasado.</b> Solo sirve para simular.', '<b>This day has passed.</b> It\'s only a simulation.') + '</div>';
    else if (left >= 5) h += '<div class="sw-info">' + L('<b>Se pide en eCrews.</b> Empieza dentro de ', '<b>Request it in eCrews.</b> It starts in ') + '' + left + '' + L(' días: uno lo pide en eCrews, el otro lo acepta y el cambio es inmediato.', ' days: one of you requests it in eCrews, the other accepts and the change is immediate.') + '</div>';
    else h += '<div class="sw-info"><b>' + L('Correo a ', 'Email ') + MAIL_TO + '.</b> ' + L('Empieza dentro de ', 'It starts in ') + left + ' ' + (left === 1 ? L('día', 'day') : L('días', 'days')) + L(': ya no entra por eCrews. Lo manda uno con el otro en copia y lo acepta el Jefe de Base.', ': too late for eCrews. One of you sends it with the other in copy, and the Base Manager approves it.') + '</div>' + mail(a, e);
    if (left >= 0) h += '<div class="sw-sub" style="margin-top:6px">' + L('Cumplir estas reglas no garantiza la aprobación: a veces la oficina revisa el cambio a mano.', 'Meeting these rules doesn\'t guarantee approval: the office sometimes reviews a swap by hand.') + '</div>';
    h += actions(a, e, left);
    $('sw-info').innerHTML = h;
    wireActions(a, e);
  }

  function actions(a, e, left) {
    var p = S.proposal, nm = esc(firstName(S.partner));
    if (p && p.incoming && p.status === 'proposed')
      return '<div style="display:flex;gap:8px;margin-top:12px"><button class="sw-btn" id="sw-rej" style="flex:1"' + L('>Rechazar</button>', '>Decline</button>') + '<button class="sw-btn ok" id="sw-acc" style="flex:2">' + L('Acepto el cambio', 'I accept the swap') + '</button></div>';
    if (p && p.status === 'accepted')
      return '<div class="sw-info"><b>' + (p.incoming ? L('Lo aceptaste.', 'You accepted it.') : nm + L(' lo ha aceptado.', ' has accepted it.')) + '</b> ' +
             (left >= 5 ? (p.incoming ? L('Cuando ', 'When ') + nm + L(' lo pida en eCrews, acéptalo allí.', ' requests it in eCrews, accept it there.') : L('Pídelo ahora en eCrews; ', 'Request it now in eCrews; ') + nm + L(' lo aceptará allí.', ' will accept it there.')) : L('Enviad el correo.', 'Send the email.')) + '</div>';
    if (p && p.status === 'proposed' && !p.incoming)
      return '<div class="sw-info">' + L('Esperando a que ', 'Waiting for ') + '' + nm + '' + L(' responda.</div>', ' to reply.</div>') + '<button class="sw-btn" id="sw-cancel" style="width:100%;margin-top:8px">' + L('Retirar la propuesta', 'Withdraw proposal') + '</button>';
    if (left < 0) return '';
    return '<button class="sw-go" id="sw-prop" style="width:100%;margin-top:12px">' + L('Proponer a ', 'Propose to ') + nm + '</button>';
  }

  function wireActions(a, e) {
    var p = S.proposal;
    var b = $('sw-prop');
    if (b) b.onclick = function () {
      b.disabled = true; b.textContent = L('Enviando…', 'Sending…');
      var ds = S.dates.slice(a, e + 1);
      api('/api/swap/proposals', { partnerId: S.partner.id, dates: ds, summary: { from: ds[0], to: ds[ds.length - 1] } }).then(function () {
        enviadoFx(b, firstName(S.partner), ds);
      }, function (er) { b.disabled = false; b.textContent = L('Proponer a ', 'Propose to ') + firstName(S.partner); alertErr(er); });
    };
    var acc = $('sw-acc'), rej = $('sw-rej'), can = $('sw-cancel');
    if (acc) acc.onclick = function () { api('/api/swap/proposals/' + p.id + '/respond', { accept: true }).then(function () { p.status = 'accepted'; showOk(a, e, check(a, e)); celebraSwap(p, true); }, alertErr); };
    if (rej) rej.onclick = function () { api('/api/swap/proposals/' + p.id + '/respond', { accept: false }).then(function () { S.partner = null; renderHome(); loadHome(); }, alertErr); };
    if (can) can.onclick = function () { api('/api/swap/proposals/' + p.id + '/cancel', {}).then(function () { S.partner = null; renderHome(); loadHome(); }, alertErr); };
  }

  function mail(a, e) {
    var pm = (S.prof && S.prof.me) || {}, pt = (S.prof && S.prof.them) || {};
    var dd = function (i) { var d = S.dates[i]; return WD_ES[wd(d)] + ' ' + dnum(d) + '/' + (+d.slice(5, 7)); };
    var sv = function (c) {
      if (!c || c.kind !== 'flight') return (c && c.code) ? c.code + (c.report != null ? ' ' + clock(c.report) + '–' + clock(c.end) : '') : 'OFF';
      return c.legs.map(function (l) { return (l.fn ? l.fn + ' ' : '') + l.dep + '-' + l.arr; }).join(', ') + ' (presentación ' + clock(c.report) + ', calzos ' + clock(c.end) + ')';
    };
    var lines = function (R) { var o = []; for (var i = a; i <= e; i++) o.push('  · ' + dd(i) + ': ' + sv(R[i])); return o.join('\n'); };
    var who = function (p) { return [p.nombre || '', [p.rol, p.base].filter(Boolean).join(', '), p.empleado ? 'nº ' + p.empleado : ''].filter(Boolean).join(' · '); };
    var subj = 'Solicitud de cambio de servicio ' + dd(a) + (e > a ? ' – ' + dd(e) : '') + ' – ' + (pm.nombre || '') + ' / ' + (pt.nombre || '');
    var body = 'Buenos días,\n\nSolicitamos el siguiente cambio de servicio entre tripulantes. Ambos estamos de acuerdo (' + (firstName(pt)) + ' en copia).\n\n' +
      who(pm) + ' pasa a realizar:\n' + lines(S.me) + '\n\n' + who(pt) + ' pasa a realizar:\n' + lines(S.them) +
      '\n\nHemos comprobado que los dos cumplimos con los descansos mínimos.\n\nUn saludo,\n' + (pm.nombre || '');
    var href = 'mailto:' + MAIL_TO + '?cc=' + encodeURIComponent(pt.email || '') + '&subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
    var falta = [];
    if (!pm.nombre) falta.push(L('tu nombre', 'your name')); if (!pm.empleado) falta.push(L('tu nº de empleado', 'your employee no.'));
    return '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px">' + L('Ver el correo', 'Show the email') + '</summary><div class="sw-mail">' +
      esc(L('Para: ', 'To: ') + MAIL_TO + '\nCC: ' + (pt.email || '') + L('\nAsunto: ', '\nSubject: ') + subj + '\n\n' + body) + '</div></details>' +
      (falta.length ? '<div class="sw-sub" style="margin-top:6px">' + L('Rellena en Mi perfil ', 'Add ') + falta.join(L(' y ', ' and ')) + L(' para que el correo salga completo.', ' in My profile so the email is complete.') + '</div>' : '') +
      '<a class="sw-go" style="display:block;text-align:center;text-decoration:none;margin-top:8px" href="' + esc(href) + '">' + L('✉ Abrir correo', '✉ Open email') + '</a>';
  }

  /* ── La campana del Home ───────────────────────────────────────────────────
     Una fuente más del registro de avisos (pilotosAvisosFuente). Los ids son
     ESTABLES y llevan el estado dentro: «aceptada» es un aviso distinto de
     «propuesta», así el compañero ve las dos cosas y ninguna vuelve a encenderse.
     Al tocar un push el Service Worker abre la campana: de ahí se entra aquí. */
  function abrePropuesta(p) {
    window.swapOpen();
    var t0 = Date.now();
    (function espera() {
      var c = S.contacts.filter(function (x) { return x.partner.id === p.partnerId && x.status === 'accepted'; })[0];
      if (c) return openPair(c.partner, p.dates, p);
      if (p.summary && p.summary.board) return openPair({ id: p.partnerId, nombre: p.partnerName }, p.dates, p);
      if (Date.now() - t0 < 6000) setTimeout(espera, 250);
    })();
  }
  /* ── La campanilla del Swap ────────────────────────────────────────────────
     Sonido PROPIO para que el piloto lo reconozca sin mirar: dos tonos que se
     CRUZAN (uno sube y otro baja: un intercambio) y un toque de campanilla al
     final. Se sintetiza con Web Audio: sin fichero, funciona sin red.
     Suena una vez por aviso nuevo (ids en localStorage). El navegador no deja
     sonar nada sin un toque previo del usuario: si está bloqueado, suena con
     el primer toque en la pantalla. */
  var SONADOS_KEY = 'pilotos_swap_sonados', _actx = null;
  function chime() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      _actx = _actx || new AC();
      if (_actx.state === 'suspended') { _actx.resume(); if (_actx.state === 'suspended') return false; }
      var t = _actx.currentTime + 0.02, out = _actx.createGain();
      out.gain.value = 0.22; out.connect(_actx.destination);
      var tono = function (f0, f1, ini, dur, tipo, vol) {
        var o = _actx.createOscillator(), g = _actx.createGain();
        o.type = tipo; o.frequency.setValueAtTime(f0, ini); o.frequency.exponentialRampToValueAtTime(f1, ini + dur * 0.8);
        g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(vol, ini + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
        o.connect(g); g.connect(out); o.start(ini); o.stop(ini + dur + 0.05);
      };
      tono(660, 1320, t, 0.32, 'triangle', 0.6);          // sube
      tono(1320, 660, t, 0.32, 'triangle', 0.45);         // baja: se cruzan
      tono(1760, 1760, t + 0.36, 0.9, 'sine', 0.55);      // campanilla
      tono(2637, 2637, t + 0.36, 0.6, 'sine', 0.18);      // su brillo
      try { navigator.vibrate && navigator.vibrate([60, 45, 60, 45, 60, 160, 320]); } catch (x) {}
      return true;
    } catch (e) { return false; }
  }
  window.swapChime = chime;
  function suenaSiNuevo(ids) {
    var vistos = [];
    try { vistos = JSON.parse(localStorage.getItem(SONADOS_KEY) || '[]'); } catch (e) {}
    var nuevos = ids.filter(function (id) { return vistos.indexOf(id) < 0; });
    if (!nuevos.length) return;
    var marca = function () { try { localStorage.setItem(SONADOS_KEY, JSON.stringify(vistos.concat(nuevos).slice(-200))); } catch (e) {} };
    if (chime()) return marca();
    var alToque = function () {
      document.removeEventListener('pointerdown', alToque, true);
      setTimeout(function () { if (chime()) marca(); }, 30);
    };
    document.addEventListener('pointerdown', alToque, true);
  }
  /* Push recibido con la app abierta (lo avisa el Service Worker). */
  try {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.tipo === 'pilotos-swap-aviso') {
        try { window.pilotosAvisosCargar && window.pilotosAvisosCargar(); } catch (x) {}
      }
    });
  } catch (e) {}

  /* ── La campana del Swap = HISTORIAL (20-oct-2026) ──────────────────────────
     Reporte: «me llega el pop-up pero en notificaciones no aparecen o se borran».
     Antes se calculaba en vivo (pendiente → sale; respondida → desaparece) y lo
     que solo iba por push no salía nunca. Ahora sale lo que el servidor guardó al
     avisar (/api/swap/avisos): cada aviso se queda, como en una bandeja, y al
     tocarlo lleva a lo suyo. Lo pendiente de ANTES de que existiera el historial
     (HIST_DESDE) se sigue enseñando en vivo para que no se pierda. */
  var HIST_DESDE = Date.parse('2026-10-20T00:00:00Z');
  var ICO = { 'swap-aceptado': '✅', 'swap-rechazado': '✖️', 'swap-caducada': '⏳', 'swap-match': '💜', 'swap-cuadra': '✨' };
  if (typeof window.pilotosAvisosFuente === 'function') window.pilotosAvisosFuente(async function () {
    if (!token()) return [];
    var r = await Promise.all([api('/api/swap/contacts'), api('/api/swap/proposals'),
      api('/api/swap/avisos').catch(function () { return { avisos: [] }; })]);
    S.contacts = r[0].contacts || []; S.proposals = r[1].proposals || []; badge();
    var t = function (s) { return Date.parse(s || '') || 0; };
    var out = (r[2].avisos || []).map(function (a) {
      var ir = function () { window.swapOpen(); };
      if (a.post) ir = function () { abreMatch(a.post); };
      else if (a.prop) ir = function () {
        var p = S.proposals.filter(function (x) { return x.id === a.prop; })[0];
        if (p && p.status !== 'cancelled') abrePropuesta(p); else window.swapOpen();
      };
      return { id: 'swap-n:' + a.id, icono: ICO[a.tag] || '⇄', titulo: a.title, texto: a.body, cuando: t(a.at), ir: ir };
    });
    // Lo pendiente de antes del historial, en vivo.
    S.contacts.forEach(function (c) {
      if (!(c.incoming && c.status === 'pending' && t(c.created_at) < HIST_DESDE)) return;
      var nm = c.partner.nombre || c.partner.email;
      out.push({ id: 'swap-c:' + c.id, icono: '⇄', titulo: nm + L(' quiere conectar contigo', ' wants to connect with you'), texto: L('Acéptalo para ver el roster del otro y proponeros cambios.', 'Accept to see each other\'s roster and propose swaps.'), cuando: t(c.created_at), ir: window.swapOpen });
    });
    S.proposals.forEach(function (p) {
      if (!(p.incoming && p.status === 'proposed' && t(p.created_at) < HIST_DESDE)) return;
      out.push({ id: 'swap-p:' + p.id + ':proposed', icono: '⇄', titulo: p.partnerName + L(' te propone un swap', ' proposes a swap'), texto: datesTxt(p.dates) + L(' · toca para ver qué das y qué recibes.', ' · tap to see what you give and get.'), cuando: t(p.created_at), ir: function () { abrePropuesta(p); } });
    });
    /* Suena solo por lo reciente: abrir la app una semana después no tiene que sonar. */
    suenaSiNuevo(out.filter(function (a) { return Date.now() - (a.cuando || 0) < 3 * 864e5; }).map(function (a) { return a.id; }));
    return out;
  });

  /* ── Al día sin recargar ────────────────────────────────────────────────────
     Reporte 16-oct: una petición enviada desde otro aparato no aparecía en la
     campana ni en el Swap de la app YA ABIERTA — solo se miraba al arrancar.
     Con la app en pantalla: cada minuto se pregunta (ligero: solo el Swap) y, si
     ha cambiado algo, se recarga la campana (que hace sonar la campanilla) y el
     globo. Con el Swap abierto en su lista, cada 20 s. En segundo plano, nada. */
  var _firma = '';
  function firmaDe(c, p) {
    return (c || []).map(function (x) { return x.id + x.status; }).join(',') + '|' + (p || []).map(function (x) { return x.id + x.status; }).join(',');
  }
  function vigila() {
    if (document.visibilityState !== 'visible' || !token()) return;
    Promise.all([api('/api/swap/contacts'), api('/api/swap/proposals')]).then(function (r) {
      var c = r[0].contacts || [], p = r[1].proposals || [], f = firmaDe(c, p);
      var cambio = _firma && f !== _firma;
      _firma = f; S.contacts = c; S.proposals = p; badge();
      if (cambio) {
        try { window.pilotosAvisosCargar && window.pilotosAvisosCargar(); } catch (e) {}
        if (pantalla() === 'swap' && (!S.partner && S.view !== 'board')) renderHome();
      }
    }, function () {});
  }
  setInterval(vigila, 60000);
  setInterval(function () { if (pantalla() === 'swap' && (!S.partner && S.view !== 'board') && document.visibilityState === 'visible') loadHome(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') vigila(); });

  /* Avisos pendientes en la tarjeta de Herramientas, sin abrir el Swap. */
  setTimeout(vigila, 6000);   // la primera pasada fija la «firma»: a partir de ahí, solo cambios
})();
