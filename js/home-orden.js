/* ═══════════════════════════════════════════════════════════════════════════
   TARJETAS DEL HOME REORDENABLES — como los iconos/widgets del iPhone

   Mantener pulsada una tarjeta (350 ms) entra en modo edición: la pulsada se
   levanta y sigue al dedo; las demás se apartan con animación. En modo edición
   basta una pulsación corta (120 ms) para levantar otra, y el ⤢ de
   cada tarjeta cambia su tamaño: pequeña (1/3) · mediana (1/2) · ancha.

   Por qué va así, y no de otra forma:
   · Sólo se mueve `transform` (arrastre y recolocado, técnica FLIP): la compone
     la GPU sin rehacer el layout, que se recalcula UNA vez por recolocación.
   · NO tiemblan. El temblor de Beta.1056 animaba `rotate` en las diez tarjetas
     a la vez, y en el iPhone eso iba lento («va muy lento», 13-oct-2026): el
     modo edición se marca con un contorno, que no cuesta nada por frame.
   · Mientras dura el modo edición se apagan los desenfoques de cristal DE LAS
     TARJETAS (CSS `html.dh-edit`): mover algo con desenfoque obliga a rehacerlo
     cada frame. Sólo las tarjetas: apagarlos en todo el Home repintaba la
     pantalla entera al entrar y al salir.
   · El empaquetado estira la última tarjeta de cada fila para que no queden
     huecos. En el iPhone los iconos son iguales; aquí no, y una fila 1/2 + 1/3
     dejaría una columna vacía.
   · Hasta que se cumple la pulsación larga NO se toca el scroll: un dedo que se
     mueve antes es un scroll y se deja pasar. Sólo con la tarjeta levantada se
     bloquea el `touchmove` (listener no pasivo).
   · En el iPhone no hay vibración: Safari no da acceso al motor háptico.

   Se guarda en el aparato (`pilotos_home_cards`) CON EL UID DENTRO y viaja a la
   nube (`/api/home-layout`, user_settings `home_cards`):
   · sobrevive al logout (está en la lista de supervivientes de
     `clearAllUserData`), pero no se aplica a OTRA cuenta en el mismo aparato;
   · gana la copia más nueva ENTERA por `at`, como el perfil de nómina;
   · dos orígenes, como `/api/plazos`: una ruta nueva nace rota en beta si sólo
     se pregunta a producción.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SPAN = { s: 2, m: 3, l: 6 };
  /* Dibujados, no caracteres: un «−» lo pintaría la fuente del móvil. */
  var ICONO_MENOS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>';
  var ICONO_MAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
  var PULSA_MS = 350, PULSA_EDIT_MS = 120, HOLGURA = 10;
  /* La barra de «Listo» es UNA para todas las rejillas: actúa sobre la que está
     en edición. Sólo puede haber una a la vez (cada una vive en su pantalla). */
  var ACTIVA = null;
  var TODAS = [];
  /* El `style` original de cada tarjeta (ver restaura). Es COMÚN a las dos
     rejillas: una tarjeta puede viajar de Tools al Home y llevarse su estilo. */
  var ORIG = new Map();

  /* ── viajar entre rejillas ───────────────────────────────────────────────
     «Que los iconos de Tools puedan viajar a la página principal, de un sitio a
     otro» (16-oct-2026). Cada rejilla sigue guardando SU orden; una tarjeta está
     donde la pone el orden guardado MÁS NUEVO que la nombra. Por eso al moverla
     se guardan las dos rejillas a la vez, y el servidor no cambia: el `order` de
     cada una ya es una lista libre de claves. Cada tarjeta recuerda su rejilla de
     fábrica (`data-origen`) para que «Restablecer» la devuelva a casa. */
  var ICONO_SUBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  var ICONO_BAJA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
  (function estilos() {
    if (document.getElementById('dh-move-css')) return;
    var s = document.createElement('style'); s.id = 'dh-move-css';
    s.textContent =
      '.dh-movebtn{display:none;position:absolute;left:50%;top:10px;transform:translateX(-50%);white-space:nowrap;z-index:3;border:1px solid rgba(255,255,255,.55);border-radius:999px;' +
      'background:rgba(162,28,175,.92);color:#fff;font:700 11px/1 system-ui,-apple-system,sans-serif;padding:6px 10px 6px 7px;cursor:pointer;' +
      'align-items:center;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent}' +
      '.dh-movebtn svg{width:13px;height:13px;stroke:#fff;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}' +
      'html.dh-edit .dh-cards[data-ed]>[data-dhk]>.dh-movebtn{display:inline-flex}' +
      'html.dh-edit .dh-cards[data-ed]>[data-ultima]>.dh-movebtn{display:none}' +
      /* En la tarjeta de 1/3 no cabe el texto entre el «−» y el ⤢: solo la flecha. */
      '.dh-cards>[data-sz="s"]>.dh-movebtn{padding:6px}.dh-cards>[data-sz="s"]>.dh-movebtn span{display:none}';
    (document.head || document.documentElement).appendChild(s);
  })();

  /* Una rejilla reordenable. El Home y Tools son DOS instancias de lo mismo:
     una segunda copia del arrastre sería ES_AIRPORTS / ES_IATA con el dedo. */
  function crea(cfg) {
  var KEY = cfg.key;
  /* Las que llevan una lista o un gráfico dentro no caben en un tercio. */
  var MINIMO = cfg.minimo || {};

  var DEF = null;          // orden y tamaños de fábrica, leídos del HTML
  var editando = false;
  var P = null;            // pulsación en curso
  var D = null;            // arrastre en curso
  var raf = 0;
  var YO = null;

  function grid() { return document.getElementById(cfg.grid); }
  function scroller() { return cfg.scroller(); }
  function cards() {
    var g = grid(); if (!g) return [];
    return [].slice.call(g.children).filter(function (c) { return c.dataset && c.dataset.dhk; });
  }
  function tamanosDe(k) {
    /* Con el calendario completo el roster va a lo ancho: 7 columnas de días no
       caben en media tarjeta. */
    if (k === 'roster' && calOn()) return ['l'];
    var min = MINIMO[k] || 's';
    return ['s', 'm', 'l'].slice(['s', 'm', 'l'].indexOf(min));
  }

  /* ── estado guardado ───────────────────────────────────────────────────── */
  function uid() { try { return String(localStorage.getItem('pilotOS_last_uid') || ''); } catch (e) { return ''; } }
  function valido(j) { return !!(j && Array.isArray(j.order) && j.sz && typeof j.sz === 'object'); }
  /* El formato anterior (sin uid) vale: es de quien ya estaba en este aparato. */
  function crudo() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); return valido(j) ? j : null; } catch (e) { return null; } }
  function deOtro(j) { var u = uid(); return !!(j && j.uid && u && j.uid !== u); }
  function lee() { var j = crudo(); return j && !deOtro(j) ? j : null; }
  function oculta(c) { return c.hasAttribute('data-oculta'); }
  function visibles() { return cards().filter(function (c) { return !oculta(c); }); }
  function estadoActual() {
    var o = [], sz = {}, hid = [];
    cards().forEach(function (c) {
      o.push(c.dataset.dhk); sz[c.dataset.dhk] = c.dataset.sz;
      if (oculta(c)) hid.push(c.dataset.dhk);
    });
    return { order: o, sz: sz, cal: calOn(), hid: hid };
  }
  function guarda() {
    var st = estadoActual(); st.uid = uid(); st.at = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
    sube();
  }

  /* ── nube ──────────────────────────────────────────────────────────────── */
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
  /* Un 404 o un fallo de red pasa al siguiente origen; otra respuesta es LA respuesta. */
  function api(body) {
    var o = origenes(), i = 0, tk = token();
    var h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk };
    function prueba(ult) {
      if (i >= o.length) return Promise.reject(ult || new Error('sin_red'));
      return fetch(o[i++] + '/api/home-layout' + (cfg.nube ? '/' + cfg.nube : ''), { method: body ? 'POST' : 'GET', headers: h,
          body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
        .then(function (r) {
          if (r.status === 404) return prueba(new Error('404'));
          return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; });
        }, function (e) { return prueba(e); });
    }
    return prueba();
  }
  var _subeT = null;
  function sube() {
    clearTimeout(_subeT);
    _subeT = setTimeout(function () {
      var st = lee(); if (!st || !token()) return;
      api({ order: st.order, sz: st.sz, cal: !!st.cal, hid: st.hid || [], at: +st.at || Date.now() })
        .catch(function (e) { console.warn('[home-orden] no se ha podido subir', e && e.message); });
    }, 800);
  }
  var _traidoAt = 0;
  /* Al arrancar, al volver al Home y al volver del segundo plano (con 30 s de
     mínimo entre medias). Nunca a mitad de una edición: no se le mueven las
     tarjetas al piloto debajo del dedo. */
  function sincroniza(forzar) {
    if (!DEF || editando || D) return Promise.resolve(false);
    /* Otra cuenta en este aparato: lo guardado no es suyo → de fábrica. */
    if (deOtro(crudo())) { aplica(DEF); try { localStorage.removeItem(KEY); } catch (e) {} }
    if (!token() || (!forzar && Date.now() - _traidoAt < 30000)) return Promise.resolve(false);
    _traidoAt = Date.now();
    return api(null).then(function (j) {
      var n = j && j.layout, loc = lee(), tl = loc ? (+loc.at || 0) : 0;
      if (valido(n) && (+n.at || 0) > tl) {
        if (editando || D) return false;
        flip(function () { aplica(n); }, null);
        var g = { order: n.order, sz: n.sz, cal: !!n.cal, hid: n.hid || [], uid: uid(), at: +n.at };
        try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) {}
        return true;
      }
      if (loc && (!valido(n) || tl > (+n.at || 0))) sube();
      return false;
    }, function () { return false; });
  }

  /* ── colocar y empaquetar ──────────────────────────────────────────────── */
  function aplica(st) {
    var g = grid(); if (!g || !st) return;
    var porK = {}, tocadas = [];
    cards().forEach(function (c) { porK[c.dataset.dhk] = c; });
    /* Una clave de mi orden que vive en OTRA rejilla: me la quedo si esa rejilla
       no la nombra en su orden guardado, o si mi copia es más nueva. */
    st.order.forEach(function (k) {
      if (porK[k]) return;
      TODAS.forEach(function (o) {
        if (o === YO || porK[k]) return;
        var c = o.tarjeta && o.tarjeta(k); if (!c) return;
        var su = o.guardado && o.guardado();
        if (su && su.order.indexOf(k) >= 0 && (+su.at || 0) >= (+st.at || 0)) return;
        porK[k] = c; if (tocadas.indexOf(o) < 0) tocadas.push(o);
      });
    });
    st.order.forEach(function (k) {
      var c = porK[k]; if (!c) return;          // tarjeta que ya no existe
      g.appendChild(c); delete porK[k];
    });
    tocadas.forEach(function (o) { try { o.empaqueta(); o.refresca(); } catch (e) {} });
    /* Una tarjeta NUEVA de la app (no está en lo guardado) va al final: no puede
       desaparecer por no estar en el orden de alguien. */
    Object.keys(porK).forEach(function (k) { g.appendChild(porK[k]); });
    /* El calendario va ANTES de los tamaños: decide cuáles valen para el roster. */
    var rc = calCard();
    if (rc) { if (st.cal) rc.dataset.cal = '1'; else delete rc.dataset.cal; }
    cards().forEach(function (c) {
      var s = st.sz[c.dataset.dhk];
      if (s && tamanosDe(c.dataset.dhk).indexOf(s) >= 0) c.dataset.sz = s;
    });
    if (rc && st.cal) rc.dataset.sz = 'l';
    /* Ocultas. Una copia que las oculte TODAS (a mano, o de una versión con
       otras tarjetas) no puede dejar el Home vacío: entonces no se oculta nada. */
    var H = {};
    (Array.isArray(st.hid) ? st.hid : []).forEach(function (k) { H[k] = 1; });
    var todas = cards(), quedan = todas.filter(function (c) { return !H[c.dataset.dhk]; }).length;
    todas.forEach(function (c) {
      if (H[c.dataset.dhk] && quedan > 0) c.setAttribute('data-oculta', '1'); else c.removeAttribute('data-oculta');
    });
    empaqueta();
    if (DEF) botones();
    rotulaMover();
    refrescaOcultas();
    calSync();
  }

  /* Filas de 6 columnas. Si la siguiente no cabe, el hueco que queda se reparte
     entre las de esa fila, empezando por la más estrecha. */
  function empaqueta() {
    var fila = [], usado = 0;
    function cierra() {
      var r = 6 - usado;
      while (cfg.rellena !== false && r > 0 && fila.length) {
        var min = fila[0];
        fila.forEach(function (f) { if (f.sp <= min.sp) min = f; });
        min.sp++; r--;
      }
      fila.forEach(function (f) { if (f.c.dataset.sp !== String(f.sp)) f.c.dataset.sp = f.sp; });
      fila = []; usado = 0;
    }
    cards().forEach(function (c) {
      if (c.style.display === 'none' || oculta(c)) return;
      var sp = SPAN[c.dataset.sz] || 2;
      if (usado + sp > 6) cierra();
      fila.push({ c: c, sp: sp }); usado += sp;
    });
    cierra();
  }

  /* FLIP: se apunta dónde se VE cada tarjeta, se cambia el layout, y se anima
     desde lo apuntado hasta su sitio nuevo con `transform`. */
  function flip(cambia, salvo) {
    var g = grid(), antes = new Map();
    cards().forEach(function (c) { if (c !== salvo) antes.set(c, c.getBoundingClientRect()); });
    cambia();
    var gr = g.getBoundingClientRect();
    antes.forEach(function (r, c) {
      var dx = r.left - (gr.left + c.offsetLeft), dy = r.top - (gr.top + c.offsetTop);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      c.style.transition = 'none';
      c.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
    });
    void g.offsetWidth;   // un solo reflow para todas
    antes.forEach(function (r, c) {
      if (!c.style.transform) return;
      c.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
      c.style.transform = '';
      setTimeout(function () { restaura(c); }, 230);
    });
  }

  /* El atributo `style` de cada tarjeta se deja EXACTAMENTE como venía del HTML.
     Escribir un `transform` en línea hace que el navegador reescriba el atributo
     entero, y al reescribirlo convierte `#FFB800` en `rgb(255, 184, 0)`: las reglas
     de modo día que buscan el color en el atributo dejaban de casar y las tarjetas
     perdían su degradado oscuro (13-oct-2026). Cuando la tarjeta está quieta se le
     devuelve el texto original. */
  function restaura(c) {
    if (!ORIG.has(c) || (D && D.c === c) || c.style.transform) return;
    if (c.getAttribute('style') !== ORIG.get(c)) c.setAttribute('style', ORIG.get(c));
  }

  /* ── modo edición ──────────────────────────────────────────────────────── */
  function restablece() {
    flip(function () {
      /* Las visitantes vuelven a su rejilla de fábrica, y las mías vuelven a casa. */
      cards().forEach(function (c) {
        if (c.dataset.origen && c.dataset.origen !== cfg.grid) {
          var o = TODAS.filter(function (x) { return x.gridId === c.dataset.origen; })[0];
          if (o) o.recibe(c);
        }
      });
      DEF.order.forEach(function (k) {
        if (cards().some(function (c) { return c.dataset.dhk === k; })) return;
        TODAS.forEach(function (o) { var c = o !== YO && o.tarjeta && o.tarjeta(k); if (c) { grid().appendChild(c); o.empaqueta(); o.refresca(); o.guarda(); } });
      });
      aplica(DEF);
    }, null);
    /* Se GUARDA el de fábrica (no se borra): así el restablecer también llega
       al otro aparato, que si no conservaría su copia y la volvería a subir. */
    guarda();
  }
  function entra() {
    if (editando) return;
    if (ACTIVA && ACTIVA !== YO) ACTIVA.sale();
    editando = true;
    ACTIVA = YO;
    barra();
    var g = grid(); if (g) g.setAttribute('data-ed', '1');
    document.documentElement.classList.add('dh-edit');
    refrescaOcultas();
  }
  function sale() {
    if (!editando) return;
    if (D) suelta();
    editando = false;
    if (ACTIVA === YO) ACTIVA = null;
    var g = grid(); if (g) g.removeAttribute('data-ed');
    document.documentElement.classList.remove('dh-edit');
    refrescaOcultas();
    guarda();
  }

  /* ── pulsación y arrastre ──────────────────────────────────────────────── */
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (D || P) return;
    var c = e.target.closest && e.target.closest('#' + cfg.grid + ' > [data-dhk]');
    if (!c || e.target.closest('.dh-szbtn, .dh-calbtn, .dh-hidebtn, .dh-movebtn')) return;
    P = { c: c, x: e.clientX, y: e.clientY, id: e.pointerId,
          t: setTimeout(function () { levanta(); }, editando ? PULSA_EDIT_MS : PULSA_MS) };
  }
  function cancelaPulsa() { if (P) { clearTimeout(P.t); P = null; } }

  function levanta() {
    if (!P) return;
    var c = P.c, x = P.x, y = P.y;
    P = null;
    entra();
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    D = { c: c, px: x, py: y, ultimo: null };
    mide();
    D.gx = x - (D.gl + D.cajas.get(c).l);
    D.gy = y - (D.gt - D.st + D.cajas.get(c).t);
    c.classList.add('dh-lift');
    c.style.transition = 'none';
    pinta();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function onMove(e) {
    if (P) {
      if (Math.abs(e.clientX - P.x) > HOLGURA || Math.abs(e.clientY - P.y) > HOLGURA) cancelaPulsa();
      return;
    }
    if (!D) return;
    D.px = e.clientX; D.py = e.clientY; D.movido = true;
  }

  /* Toda la geometría se MIDE aquí: al levantar y tras cada recolocación (que ya
     ha rehecho el layout). Por frame no se lee ni una posición del DOM: leer
     geometría después de escribir un transform obliga al navegador a recalcular,
     y eso por frame es justo lo que da tirones. Medido: 81 layouts en 40
     movimientos leyendo en cada frame, contra 3 en reposo. */
  function mide() {
    var g = grid(), sc = scroller(), gr = g.getBoundingClientRect();
    D.st = sc ? sc.scrollTop : 0;
    D.gl = gr.left; D.gt = gr.top + D.st;          // arriba de la rejilla, en coordenadas del scroll
    D.sr = sc ? sc.getBoundingClientRect() : null;
    D.max = sc ? sc.scrollHeight - sc.clientHeight : 0;
    D.cajas = new Map();
    visibles().forEach(function (c) {
      D.cajas.set(c, { l: c.offsetLeft, t: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight });
    });
  }

  function pinta() {
    var c = D.c, k = D.cajas.get(c);
    var dx = D.px - D.gx - (D.gl + k.l);
    var dy = D.py - D.gy - (D.gt - D.st + k.t);
    c.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(1.05)';
  }

  function tick() {
    raf = 0;
    if (!D) return;
    /* Auto-scroll al acercarse a los bordes del área visible. */
    var sc = scroller(), sr = D.sr;
    if (sc && sr) {
      var borde = 80, v = 0;
      if (D.py < sr.top + borde) v = -Math.ceil((sr.top + borde - D.py) / 6);
      else if (D.py > sr.bottom - borde) v = Math.ceil((D.py - (sr.bottom - borde)) / 6);
      v = Math.max(-16, Math.min(16, v));
      var st = Math.max(0, Math.min(D.max, D.st + v));
      /* El scroll lo lleva la cuenta propia (D.st): leer scrollTop por frame
         también fuerza layout. */
      if (st !== D.st) { D.st = st; sc.scrollTop = st; }
    }
    recoloca();
    pinta();
    raf = requestAnimationFrame(tick);
  }

  function recoloca() {
    var g = grid();
    var x = D.px - D.gl, y = D.py - (D.gt - D.st), sobre = null;
    D.cajas.forEach(function (k, c) {
      if (c === D.c || sobre) return;
      if (x >= k.l && x <= k.l + k.w && y >= k.t && y <= k.t + k.h) sobre = c;
    });
    /* Sin histéresis, dos tarjetas de distinto tamaño se intercambian en bucle:
       la que acaba de moverse no vuelve a contar hasta que el dedo sale de ella. */
    if (!sobre) { D.ultimo = null; return; }
    if (sobre === D.ultimo) return;
    D.ultimo = sobre;
    var lista = cards(), i = lista.indexOf(D.c), j = lista.indexOf(sobre);
    flip(function () {
      g.insertBefore(D.c, i < j ? sobre.nextSibling : sobre);
      empaqueta();
    }, D.c);
    mide();
  }

  function suelta() {
    cancelaPulsa();
    if (!D) return;
    var c = D.c;
    D = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    c.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
    c.style.transform = '';
    setTimeout(function () { c.classList.remove('dh-lift'); c.style.transition = ''; restaura(c); }, 190);
    guarda();
  }

  /* ── tamaño ────────────────────────────────────────────────────────────── */
  var ICONO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
  function botones() {
    cards().forEach(function (c) {
      /* Cada botón por separado: una tarjeta que llega de la otra rejilla puede
         traer unos y no otros, según en qué momento del arranque viajó. */
      if (!c.querySelector(':scope > .dh-movebtn')) {
        var m0 = document.createElement('button');
        m0.type = 'button'; m0.className = 'dh-movebtn';
        c.appendChild(m0);
      }
      if (c.querySelector(':scope > .dh-szbtn')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'dh-szbtn';
      b.setAttribute('aria-label', 'Cambiar el tamaño de la tarjeta');
      b.innerHTML = '<i>' + ICONO + '</i>';
      c.appendChild(b);
      var h = document.createElement('button');
      h.type = 'button'; h.className = 'dh-hidebtn';
      h.setAttribute('aria-label', 'Ocultar esta tarjeta');
      h.innerHTML = '<i>' + ICONO_MENOS + '</i>';
      c.appendChild(h);
      var u = document.createElement('span');
      u.className = 'dh-sinuso';
      u.setAttribute('data-i18n-en', 'Not opened in a month');
      u.textContent = 'Hace un mes que no la abres';
      c.appendChild(u);
    });
    var rc = calCard();
    if (rc && !rc.querySelector(':scope > .dh-calbtn')) {
      var cb = document.createElement('button');
      cb.type = 'button'; cb.className = 'dh-calbtn';
      cb.setAttribute('aria-label', 'Mostrar el calendario completo del roster');
      cb.innerHTML = '<i>' + ICONO_CAL + '<span>Calendario</span></i>';
      rc.appendChild(cb);
    }
  }
  /* El rótulo del botón depende de DÓNDE está la tarjeta ahora, no de su origen. */
  function rotulaMover() {
    var esHome = cfg.grid === 'dh-cards';
    cards().forEach(function (c) {
      var b = c.querySelector(':scope > .dh-movebtn'); if (!b) return;
      b.innerHTML = esHome ? ICONO_BAJA + '<span>Herramientas</span>' : ICONO_SUBE + '<span>Inicio</span>';
      b.setAttribute('aria-label', esHome ? 'Llevar a Herramientas' : 'Llevar a Inicio');
    });
  }
  function otra() { return TODAS.filter(function (o) { return o !== YO; })[0] || null; }
  function mueve(c) {
    var o = otra(); if (!o) return;
    if (!oculta(c) && visibles().length <= 1) return;      // el Home no se queda vacío
    flip(function () { o.recibe(c); empaqueta(); }, c);
    refrescaOcultas();
    guarda();
    var n = nombre(c), aHome = o.gridId === 'dh-cards';
    try { if (typeof window.showToast === 'function') window.showToast((aHome ? '↑ ' : '↓ ') + n + (aHome ? ' está ahora en Inicio' : ' vuelve a Herramientas')); } catch (e) {}
  }
  /* Llega una tarjeta de la otra rejilla: al final, visible y con un tamaño válido aquí. */
  function recibe(c, sinGuardar) {
    var g = grid(); if (!g) return;
    c.removeAttribute('data-oculta'); c.removeAttribute('data-sinuso');
    c.style.transform = ''; c.classList.remove('dh-lift');
    g.appendChild(c);
    var t = tamanosDe(c.dataset.dhk);
    if (t.indexOf(c.dataset.sz) < 0) c.dataset.sz = t[0];
    restaura(c);
    botones(); empaqueta(); rotulaMover(); refrescaOcultas();
    if (!sinGuardar) guarda();
  }
  function cambiaTamano(c) {
    var t = tamanosDe(c.dataset.dhk), i = t.indexOf(c.dataset.sz);
    var sig = t[(i + 1) % t.length];
    flip(function () { c.dataset.sz = sig; empaqueta(); }, null);
    guarda();
  }

  /* ── ocultar ───────────────────────────────────────────────────────────────
     «Esconderla porque no la usa» (13-oct-2026). Una tarjeta oculta NO se
     borra: se queda en su sitio del orden con `data-oculta` y vuelve a él al
     restaurarla desde la bandeja «Ocultas», que sólo se ve en modo edición.
     Viaja en el mismo almacén que el orden (`hid`), así que sigue al piloto
     entre aparatos y sobrevive al logout. Lo que NO toca: los avisos. La
     campana tiene sus fuentes propias (plazos, notas de gasto…) y no mira si
     la tarjeta se ve: ocultar el Pay Check no puede callar una nota a punto
     de caducar. */
  function ocultaTarjeta(c) {
    if (oculta(c) || visibles().length <= 1) return;   // siempre queda una
    flip(function () { c.setAttribute('data-oculta', '1'); empaqueta(); }, c);
    refrescaOcultas();
    guarda();
  }
  function muestraTarjeta(k) {
    var c = cards().filter(function (x) { return x.dataset.dhk === k; })[0];
    if (!c || !oculta(c)) return;
    flip(function () { c.removeAttribute('data-oculta'); empaqueta(); }, null);
    refrescaOcultas();
    guarda();
  }
  function nombre(c) {
    var k = c.dataset.dhk, n = cfg.nombres && cfg.nombres[k];
    if (n) return n;
    // Una tarjeta visitante: su nombre lo sabe su rejilla de origen.
    TODAS.forEach(function (o) { if (!n && o.nombres) n = o.nombres[k]; });
    if (n) return n;
    var t = c.querySelector('.dh-card-title');
    return (t && t.textContent.trim()) || k;
  }
  function refrescaOcultas() {
    var g = grid(); if (!g) return;
    var box = document.getElementById(cfg.grid + '-ocultas');
    if (!box) {
      box = document.createElement('div');
      box.id = cfg.grid + '-ocultas';
      box.className = 'dh-ocultas';
      box.hidden = true;
      g.parentNode.insertBefore(box, g.nextSibling);
    }
    var oc = cards().filter(oculta), vis = visibles();
    /* La última que queda no lleva «−»: el Home no puede quedarse vacío. */
    cards().forEach(function (c) {
      if (vis.length === 1 && c === vis[0]) c.setAttribute('data-ultima', '1'); else c.removeAttribute('data-ultima');
    });
    /* Una restaurada recibe su marca de «sin uso» sin salir de la edición. */
    if (editando) marcaSinUso();
    box.hidden = !(editando && oc.length);
    if (box.hidden) { box.textContent = ''; return; }
    box.innerHTML = '<div class="dh-oc-tit">Ocultas</div><div class="dh-oc-list"></div>';
    var l = box.querySelector('.dh-oc-list');
    oc.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'dh-oc-it';
      b.setAttribute('data-k', c.dataset.dhk);
      b.setAttribute('translate', 'no');
      b.innerHTML = '<i>' + ICONO_MAS + '</i>';
      var sp = document.createElement('span'); sp.textContent = nombre(c);
      b.appendChild(sp);
      l.appendChild(b);
    });
  }

  /* ── «hace un mes que no la abres» ─────────────────────────────────────────
     Sólo una SUGERENCIA, en modo edición: nunca se oculta nada solo. Se apunta
     cuándo se abrió cada tarjeta por última vez (en el aparato, con su uid) y
     desde cuándo se apunta: hasta que no lleve 30 días apuntando no se marca
     nada, o el primer día saldrían todas como «sin abrir». */
  var USO_KEY = cfg.key + '_uso', MES = 30 * 864e5;
  function usoLee() {
    try {
      var j = JSON.parse(localStorage.getItem(USO_KEY) || 'null');
      if (j && j.uid === uid() && j.k && +j.desde) return j;
    } catch (e) {}
    return { uid: uid(), desde: Date.now(), k: {} };
  }
  function usoGuarda(j) { try { localStorage.setItem(USO_KEY, JSON.stringify(j)); } catch (e) {} }
  function usoApunta(k) { var j = usoLee(); j.k[k] = Date.now(); usoGuarda(j); }
  function marcaSinUso() {
    var j = usoLee(), ahora = Date.now();
    usoGuarda(j);                       // fija `desde` la primera vez
    var vale = ahora - j.desde >= MES;
    cards().forEach(function (c) {
      var u = +j.k[c.dataset.dhk] || j.desde;
      if (vale && ahora - u >= MES && !oculta(c)) c.setAttribute('data-sinuso', '1'); else c.removeAttribute('data-sinuso');
    });
  }

  /* En modo edición los toques NO abren la tarjeta. Captura sobre el documento:
     se para el clic antes de que llegue al `onclick` de la tarjeta. */
  function onClickCaptura(e) {
    if (!editando) return;
    var t = e.target;
    var sz = t.closest && t.closest('.dh-szbtn');
    if (sz) { e.stopPropagation(); e.preventDefault(); cambiaTamano(sz.parentNode); return; }
    var mb = t.closest && t.closest('.dh-movebtn');
    if (mb && mb.parentNode && mb.parentNode.parentNode === grid()) { e.stopPropagation(); e.preventDefault(); mueve(mb.parentNode); return; }
    var hb = t.closest && t.closest('.dh-hidebtn');
    if (hb && hb.parentNode && hb.parentNode.parentNode === grid()) { e.stopPropagation(); e.preventDefault(); ocultaTarjeta(hb.parentNode); return; }
    var oc = t.closest && t.closest('#' + cfg.grid + '-ocultas');
    if (oc) {
      e.stopPropagation(); e.preventDefault();
      var it = t.closest('[data-k]');
      if (it) muestraTarjeta(it.getAttribute('data-k'));
      return;
    }
    var cb = t.closest && t.closest('.dh-calbtn');
    if (cb) { e.stopPropagation(); e.preventDefault(); cambiaCal(); return; }
    if (t.closest && t.closest('#dh-edit-bar')) return;
    if (t.closest && t.closest('#' + cfg.grid)) { e.stopPropagation(); e.preventDefault(); return; }
    /* Tocar fuera de las tarjetas termina, como en el iPhone. Dentro del Home
       ese toque no hace nada más; fuera (la barra de abajo) sigue su curso. */
    var enHome = t.closest && t.closest('#' + cfg.pantalla);
    sale();
    if (enHome) { e.stopPropagation(); e.preventDefault(); }
  }

  /* Los logos de las tarjetas son SVG de Illustrator y repiten ids de degradado
     (`SVGID_1_` está en cinco tarjetas). Un `url(#SVGID_1_)` usa el PRIMERO del
     documento, así que mover una tarjeta delante de otra le cambiaba los colores
     a las dos. Antes de mover nada se fija la resolución de hoy: cada referencia
     apunta al elemento que la resolvía en el orden de fábrica, y los duplicados
     se renombran. Así el orden deja de influir en el dibujo. */
  function ids(g) {
    var primero = {}, n = 0;
    [].slice.call(document.querySelectorAll('[id]')).forEach(function (el) {
      if (!(el.id in primero)) primero[el.id] = el;
    });
    /* El que ganaba se queda con su id y las referencias no se tocan: siguen
       apuntando a él. Sólo los que perdían se renombran, y así ningún orden
       puede volver a ponerlos delante. */
    [].slice.call(g.querySelectorAll('svg[id], svg [id]')).forEach(function (el) {
      if (primero[el.id] !== el) el.id = 'dhid' + (++n) + '-' + el.id;
    });
  }


  /* ── calendario completo del roster ───────────────────────────────────────
     «Si el piloto quiere tener el roster visible al completo, que en la página
     principal lo pueda hacer» (13-oct-2026). La tarjeta del roster pasa a lo
     ancho y enseña el MISMO calendario de la pantalla Roster.

     Es un ESPEJO, no una segunda copia del render: rstRenderCalendar vive en el
     closure del roster y pinta celdas, colores por código, lunas de pernocta y
     marcas de cambios — escribir otra versión aquí sería ES_AIRPORTS / ES_IATA con
     un calendario. Se clona su tabla cada vez que cambia (MutationObserver, sólo
     con el calendario puesto) y la rejilla comparte sus reglas de CSS vía :is().

     ⚠ El clon NO puede llevar `data-date`: media app busca el día con
     `document.querySelector('[data-date="…"]')` —entre ellas la entrada al roster,
     que hace .click() en la celda de hoy— y el Home va antes en el documento, así
     que encontraría la celda del clon. Se renombra a `data-dhd` y se quitan los
     `onclick` y los ids. */
  var ICONO_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  var calObs = null, calT = 0;
  function calCard() { var g = cfg.calendario && grid(); return g ? g.querySelector('[data-dhk="roster"]') : null; }
  function calOn() { var c = calCard(); return !!(c && c.dataset.cal === '1'); }

  function cambiaCal() {
    var c = calCard(); if (!c) return;
    var on = !calOn();
    flip(function () {
      if (on) { c.dataset.cal = '1'; c.dataset.sz = 'l'; }
      else { delete c.dataset.cal; c.dataset.sz = (DEF && DEF.sz.roster) || 'm'; }
      empaqueta();
    }, null);
    calSync();
    /* Al ACTIVARLO se enseña el mes en curso: el Roster puede haberse quedado
       mirando otro, y entonces salía ése y había que pulsar «Hoy» (13-oct-2026). */
    if (on) { calAlMesActual(); calPinta(); }
    guarda();
  }

  function calCaja(c) {
    var box = document.getElementById('dh-calendar');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'dh-calendar';
    box.innerHTML =
      '<div class="dh-cal-cab">' +
        '<button type="button" data-caln="-1" aria-label="Mes anterior">‹</button>' +
        '<span class="dh-cal-mes"></span>' +
        '<button type="button" class="dh-cal-hoy" data-caln="0" hidden>Hoy</button>' +
        '<button type="button" data-caln="1" aria-label="Mes siguiente">›</button>' +
      '</div>' +
      '<div class="dh-cal-tabla"></div>' +
      '<div class="dh-cal-vacio" hidden>Sin roster importado</div>';
    var ancla = c.querySelector('#dh-roster-flights-r1');
    if (ancla && ancla.nextSibling) c.insertBefore(box, ancla.nextSibling); else c.appendChild(box);
    box.addEventListener('click', calClic);
    return box;
  }

  function calSync() {
    var c = calCard(); if (!c) return;
    if (!calOn()) { if (calObs) { calObs.disconnect(); calObs = null; } return; }
    calCaja(c);
    var src = document.getElementById('rst-cal-tbody');
    if (!calObs && src && window.MutationObserver) {
      calObs = new MutationObserver(calProgr);
      calObs.observe(src, { childList: true, subtree: true, attributes: true, characterData: true });
      var lab = document.getElementById('rst-month-label');
      if (lab) calObs.observe(lab, { childList: true, subtree: true, characterData: true });
    }
    calPrepara();
    calPinta();
  }
  /* El calendario del Roster NO se pinta al arrancar la app: sólo al entrar en
     su pantalla (o al llegar datos de la nube). Con el calendario puesto en el
     Home hay que pedírselo, o la tarjeta saldría vacía hasta visitar el Roster. */
  function calPrepara() {
    if (document.querySelector('#rst-cal-tbody [data-date]')) return;
    var R = window.RST;
    if (!R || typeof window.rstRenderCalendar !== 'function') return;
    try { if (typeof window.rstLoad === 'function') window.rstLoad(); } catch (e) {}
    if (!R.entries || !R.entries.length) return;
    var now = new Date();
    R.viewYear = now.getFullYear(); R.viewMonth = now.getMonth();
    try { window.rstRenderCalendar(); } catch (e) {}
  }
  /* Un render del roster son decenas de mutaciones seguidas: un clon al acabar.
     Se agrupan hasta el SIGUIENTE FRAME, no con un temporizador: el render es
     síncrono, así que cuando llega el frame ya ha terminado. Con los 120 ms de
     antes, cambiar de mes tardaba 160–260 ms en verse (CPU 4×) y casi todo era
     espera; clonar la tabla cuesta ~1 ms (medido, 13-oct-2026). */
  function calProgr() {
    if (calT) return;
    calT = requestAnimationFrame(function () { calT = 0; calPinta(); });
  }

  function calPinta() {
    var box = document.getElementById('dh-calendar');
    if (!box || !calOn()) return;
    var tabla = document.getElementById('rst-cal-grid');
    var hueco = box.querySelector('.dh-cal-tabla');
    var vacio = box.querySelector('.dh-cal-vacio');
    var n = tabla ? tabla.querySelectorAll('#rst-cal-tbody [data-date]').length : 0;
    if (!tabla) { hueco.textContent = ''; vacio.hidden = false; return; }
    var cl = tabla.cloneNode(true);
    cl.id = 'dh-cal-grid';
    [].slice.call(cl.querySelectorAll('[id]')).forEach(function (el) {
      if (!el.closest('svg')) el.removeAttribute('id');      // los de los SVG resuelven sus degradados
    });
    [].slice.call(cl.querySelectorAll('[onclick]')).forEach(function (el) { el.removeAttribute('onclick'); });
    [].slice.call(cl.querySelectorAll('[data-date]')).forEach(function (el) {
      el.setAttribute('data-dhd', el.getAttribute('data-date')); el.removeAttribute('data-date');
    });
    hueco.textContent = '';
    hueco.appendChild(cl);
    /* Sin un solo día pintado no hay calendario que enseñar, y una rejilla vacía
       se lee como «este mes no tienes nada». */
    vacio.hidden = n > 0;
    cl.style.display = n > 0 ? '' : 'none';
    var lab = document.getElementById('rst-month-label');
    box.querySelector('.dh-cal-mes').textContent = lab ? lab.textContent : '';
    var R = window.RST, now = new Date();
    box.querySelector('.dh-cal-hoy').hidden =
      !R || (R.viewYear === now.getFullYear() && R.viewMonth === now.getMonth());
  }

  /* Tocar un día abre ESE día en el Roster. La entrada al roster vuelve al mes en
     curso y a los 80 ms pulsa la celda de hoy: se espera a eso y luego se va al
     mes y al día tocados. */
  function calClic(e) {
    if (editando) return;
    var nav = e.target.closest('[data-caln]');
    if (nav) {
      e.stopPropagation(); e.preventDefault();
      var d = +nav.getAttribute('data-caln'), R = window.RST;
      if (d && typeof window.rosterNavMonth === 'function') window.rosterNavMonth(d);
      else if (!d && R && typeof window.rstRenderCalendar === 'function') {
        var now = new Date(); R.viewYear = now.getFullYear(); R.viewMonth = now.getMonth();
        window.rstRenderCalendar();
      }
      /* El render ya ha terminado: se clona ya, en el mismo toque. */
      if (calObs) calObs.takeRecords();      // lo que ya está clonado no se vuelve a clonar
      if (calT) { cancelAnimationFrame(calT); calT = 0; }
      calPinta();
      return;
    }
    var cel = e.target.closest('[data-dhd]');
    if (!cel || typeof window.goTo !== 'function') return;
    e.stopPropagation(); e.preventDefault();
    var f = cel.getAttribute('data-dhd');
    window.goTo('roster');
    setTimeout(function () {
      var now = new Date(), y = +f.slice(0, 4), m = +f.slice(5, 7) - 1;
      var dif = (y - now.getFullYear()) * 12 + (m - now.getMonth());
      try { if (dif && window.rosterNavMonth) window.rosterNavMonth(dif); } catch (er) {}
      try { if (window.rosterSelectDay) window.rosterSelectDay(f); } catch (er) {}
    }, 200);
  }

  /* El Home enseña el mes EN CURSO al volver: el que se quedara mirando en el
     Roster es de otra visita. */
  function calAlMesActual() {
    var R = window.RST, now = new Date();
    if (!calOn() || !R || typeof window.rstRenderCalendar !== 'function') return;
    if (R.viewYear === now.getFullYear() && R.viewMonth === now.getMonth()) return;
    R.viewYear = now.getFullYear(); R.viewMonth = now.getMonth();
    try { window.rstRenderCalendar(); } catch (e) {}
  }

  function init() {
    var g = grid(); if (!g || DEF) return;
    ids(g);
    cards().forEach(function (c) {
      ORIG.set(c, c.getAttribute('style') || '');
      if (!c.dataset.origen) c.dataset.origen = cfg.grid;
    });
    DEF = estadoActual();
    botones();
    rotulaMover();
    var st = lee();
    if (st) aplica(st); else { empaqueta(); refrescaOcultas(); }

    g.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', suelta);
    document.addEventListener('pointercancel', suelta);
    /* Con la tarjeta levantada el dedo mueve la tarjeta, no la página. */
    document.addEventListener('touchmove', function (e) { if (D) e.preventDefault(); }, { passive: false });
    g.addEventListener('contextmenu', function (e) { if (P || D || editando) e.preventDefault(); });
    document.addEventListener('click', onClickCaptura, true);
    /* Abrir una tarjeta (fuera de edición) cuenta como uso. */
    g.addEventListener('click', function (e) {
      if (editando) return;
      var c = e.target.closest && e.target.closest('#' + cfg.grid + ' > [data-dhk]');
      if (c) usoApunta(c.dataset.dhk);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sale(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { suelta(); sale(); } else sincroniza();
    });
    calSync();
    setTimeout(function () { sincroniza(true); }, 1500);
  }

  YO = { entra: entra, sale: sale, estado: estadoActual, aplica: aplica,
         empaqueta: empaqueta, fabrica: function () { return DEF; },
         calendario: cambiaCal, calAlMesActual: calAlMesActual,
         sincroniza: sincroniza, restablece: restablece,
         oculta: function (k) { var c = cards().filter(function (x) { return x.dataset.dhk === k; })[0]; if (c) ocultaTarjeta(c); },
         muestra: muestraTarjeta, marcaSinUso: marcaSinUso,
         editando: function () { return editando; },
         /* Para viajar entre rejillas (ver «viajar entre rejillas» arriba). */
         gridId: cfg.grid, nombres: cfg.nombres || {},
         tarjeta: function (k) { return cards().filter(function (x) { return x.dataset.dhk === k; })[0] || null; },
         guardado: function () { return lee(); },
         recibe: recibe, guarda: guarda,
         refresca: function () { rotulaMover(); refrescaOcultas(); },
         reaplica: function () { var st = lee(); if (DEF && st) aplica(st); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  return YO;
  }   // ── fin de crea()

  /* ── Las etiquetas de arriba del Home (`.dh-stats-row`) ─────────────────────
     La misma mecánica, pero SÓLO EN HORIZONTAL (pedido 13-oct-2026): la etiqueta
     levantada sigue al dedo de lado y las demás se apartan. No hay tamaños.
     El orden NO tiene almacén propio: es el de «Personalizar paneles»
     (`dhStatsGetLayout` / `dhStatsSaveLayout`, que ya sube a la nube). Dos
     almacenes para el mismo orden acabarían diciendo cosas distintas. Las
     ocultas conservan su sitio en la lista; sólo se arrastran las visibles. */
  function creaFila() {
    var editando = false, P = null, D = null, raf = 0, YO = null;
    function fila() { return document.querySelector('#scr-home .dh-stats-row'); }
    function wrap() { var f = fila(); return f ? f.parentNode : null; }
    function chips() {
      var f = fila(); if (!f) return [];
      return [].slice.call(f.children).filter(function (c) {
        var k = c.getAttribute('data-metric');
        return k && k !== '__edit' && c.offsetWidth > 0;
      }).sort(function (a, b) { return a.offsetLeft - b.offsetLeft; });
    }
    function layout() { return typeof window.dhStatsGetLayout === 'function' ? window.dhStatsGetLayout() : null; }
    function aplicaL(L) { if (L && typeof window._dhApplyLayoutArr === 'function') window._dhApplyLayoutArr(L); }

    function entra() {
      if (editando) return;
      if (ACTIVA && ACTIVA !== YO) ACTIVA.sale();
      editando = true; ACTIVA = YO; barra();
      var f = fila(); if (f) f.setAttribute('data-ed', '1');
      document.documentElement.classList.add('dh-edit');
      botonesFila(); refrescaOcultasFila();
    }
    function sale() {
      if (!editando) return;
      if (D) suelta();
      editando = false;
      if (ACTIVA === YO) ACTIVA = null;
      var f = fila(); if (f) f.removeAttribute('data-ed');
      document.documentElement.classList.remove('dh-edit');
      refrescaOcultasFila();
    }
    /* ── ocultar una etiqueta: el mismo `visible` de «Personalizar paneles» ── */
    function todasF() {
      var f = fila(); if (!f) return [];
      return [].slice.call(f.children).filter(function (c) { var k = c.getAttribute('data-metric'); return k && k !== '__edit'; });
    }
    function botonesFila() {
      todasF().forEach(function (c) {
        if (c.querySelector(':scope > .dh-hidebtn')) return;
        var h = document.createElement('button');
        h.type = 'button'; h.className = 'dh-hidebtn';
        h.setAttribute('aria-label', 'Ocultar esta etiqueta');
        h.innerHTML = '<i>' + ICONO_MENOS + '</i>';
        c.appendChild(h);
      });
    }
    function cuantasVisibles(L) { return L.filter(function (x) { return x.visible !== false && x.key !== '__edit'; }).length; }
    function ponVisible(k, v) {
      var L = layout(); if (!L) return;
      var it = L.filter(function (x) { return x.key === k; })[0];
      if (!it) return;
      if (!v && cuantasVisibles(L) <= 1) return;      // siempre queda una
      it.visible = v;
      flipFila(function () { aplicaL(L); }, null);
      if (typeof window.dhStatsSaveLayout === 'function') window.dhStatsSaveLayout(L);
      refrescaOcultasFila();
    }
    function refrescaOcultasFila() {
      var w = wrap(); if (!w) return;
      var box = document.getElementById('dh-chips-ocultas');
      if (!box) {
        box = document.createElement('div');
        box.id = 'dh-chips-ocultas'; box.className = 'dh-ocultas'; box.hidden = true;
        w.parentNode.insertBefore(box, w.nextSibling);
      }
      var L = layout() || [], vis = cuantasVisibles(L), porK = {};
      todasF().forEach(function (c) { porK[c.getAttribute('data-metric')] = c; });
      todasF().forEach(function (c) {
        var it = L.filter(function (x) { return x.key === c.getAttribute('data-metric'); })[0];
        if (vis === 1 && it && it.visible !== false) c.setAttribute('data-ultima', '1'); else c.removeAttribute('data-ultima');
      });
      var oc = L.filter(function (x) { return x.visible === false && porK[x.key]; });
      box.hidden = !(editando && oc.length);
      if (box.hidden) { box.textContent = ''; return; }
      box.innerHTML = '<div class="dh-oc-tit">Ocultas</div><div class="dh-oc-list"></div>';
      var l = box.querySelector('.dh-oc-list');
      oc.forEach(function (x) {
        var lb = porK[x.key].querySelector('.dh-stat-lbl');
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'dh-oc-it'; b.setAttribute('data-k', x.key);
        b.innerHTML = '<i>' + ICONO_MAS + '</i>';
        var sp = document.createElement('span'); sp.textContent = lb ? lb.textContent.trim() : x.key;
        b.appendChild(sp); l.appendChild(b);
      });
    }
    function guarda() { if (D && D.L && typeof window.dhStatsSaveLayout === 'function') window.dhStatsSaveLayout(D.L); }

    function onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (D || P) return;
      var c = e.target.closest && e.target.closest('.dh-stats-row > .dh-stat[data-metric]');
      if (!c || c.getAttribute('data-metric') === '__edit' || e.target.closest('.dh-hidebtn')) return;
      P = { c: c, x: e.clientX, y: e.clientY,
            t: setTimeout(levanta, editando ? PULSA_EDIT_MS : PULSA_MS) };
    }
    function cancelaPulsa() { if (P) { clearTimeout(P.t); P = null; } }
    function levanta() {
      if (!P) return;
      var c = P.c, x = P.x; P = null;
      var L = layout(); if (!L) return;
      entra();
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
      D = { c: c, k: c.getAttribute('data-metric'), px: x, L: L, n: 0 };
      mide();
      /* Dónde se ha cogido, en coordenadas de PANTALLA: con la fila ya
         desplazada, `D.fl` va en coordenadas del scroll y olvidarse de restar
         D.sl hacía saltar la etiqueta lo desplazado al levantarla — encima de
         la vecina (13-oct-2026, foto del iPhone). */
      D.gx = x - (D.fl - D.sl + D.cajas.get(c).l);
      c.classList.add('dh-chip-lift');
      c.style.transition = 'none';
      pinta();
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function onMove(e) {
      if (P) {
        if (Math.abs(e.clientX - P.x) > HOLGURA || Math.abs(e.clientY - P.y) > HOLGURA) cancelaPulsa();
        return;
      }
      if (D) D.px = e.clientX;
    }
    /* Como en las tarjetas: la geometría se mide al levantar y tras cada
       recolocación; por frame no se lee nada. El scroll lateral lo lleva D.sl. */
    function mide() {
      var f = fila(), w = wrap();
      D.sl = w ? w.scrollLeft : 0;
      D.fl = f.getBoundingClientRect().left + D.sl;   // borde izquierdo de la fila, en coordenadas del scroll
      D.wr = w ? w.getBoundingClientRect() : null;
      D.max = w ? w.scrollWidth - w.clientWidth : 0;
      D.cajas = new Map();
      chips().forEach(function (c) { D.cajas.set(c, { l: c.offsetLeft, w: c.offsetWidth }); });
    }
    function pinta() {
      var k = D.cajas.get(D.c);
      var dx = D.px - D.gx - (D.fl - D.sl + k.l);
      D.c.style.transform = 'translate3d(' + dx + 'px,0,0) scale(1.04)';
    }
    function tick() {
      raf = 0;
      if (!D) return;
      var w = wrap(), wr = D.wr;
      if (w && wr) {
        var borde = 36, v = 0;   /* estrecho: una etiqueta mide ~150 px y la de al lado cae casi en el borde */
        if (D.px < wr.left + borde) v = -Math.ceil((wr.left + borde - D.px) / 4);
        else if (D.px > wr.right - borde) v = Math.ceil((D.px - (wr.right - borde)) / 4);
        v = Math.max(-10, Math.min(10, v));
        var sl = Math.max(0, Math.min(D.max, D.sl + v));
        if (sl !== D.sl) { D.sl = sl; w.scrollLeft = sl; }
      }
      /* Las etiquetas con cuenta atrás cambian de ancho mientras se arrastra:
         se vuelven a medir cada ~250 ms, no por frame. */
      if (++D.n % 15 === 0) mide();
      recoloca();
      pinta();
      raf = requestAnimationFrame(tick);
    }
    /* Se cambia de sitio cuando el BORDE de la levantada pasa del centro de la
       vecina, no cuando el dedo entra en ella: con el dedo cogiendo la etiqueta
       por el medio, esperar al dedo dejaba media vecina tapada antes de que se
       apartase. Las cajas son las del layout (sin transform), así que lo que se
       compara es dónde VA a quedar cada una. */
    function recoloca() {
      var yo = D.cajas.get(D.c);
      var izq = D.px - D.gx - (D.fl - D.sl), der = izq + yo.w;
      var L = D.L, idx = function (k) { for (var i = 0; i < L.length; i++) if (L[i].key === k) return i; return -1; };
      var meta = null, aDcha = false, mejor = 0;
      D.cajas.forEach(function (k, c) {
        if (c === D.c) return;
        var centro = k.l + k.w / 2;
        if (k.l > yo.l && der > centro && k.l > mejor) { meta = c; aDcha = true; mejor = k.l; }
      });
      if (!meta) {
        mejor = Infinity;
        D.cajas.forEach(function (k, c) {
          if (c === D.c) return;
          var centro = k.l + k.w / 2;
          if (k.l < yo.l && izq < centro && k.l < mejor) { meta = c; aDcha = false; mejor = k.l; }
        });
      }
      if (!meta) return;
      var i = idx(D.k), sk = meta.getAttribute('data-metric');
      if (i < 0 || idx(sk) < 0) return;
      var it = L.splice(i, 1)[0];
      var j = idx(sk);
      L.splice(aDcha ? j + 1 : j, 0, it);
      flipFila(function () { aplicaL(L); }, D.c);
      mide();
    }
    /* FLIP horizontal: sólo `transform`. El «antes» es donde se VE cada una
       (con su transform a medias si venía de otro cambio), no su caja de
       layout: con dos cambios seguidos la de en medio saltaba de golpe. */
    function flipFila(cambia, salvo) {
      var antes = new Map();
      chips().forEach(function (c) { if (c !== salvo) antes.set(c, c.getBoundingClientRect().left); });
      cambia();
      var desp = [];
      antes.forEach(function (l, c) {
        c.style.transition = 'none'; c.style.transform = '';
        var d = l - c.getBoundingClientRect().left;
        if (Math.abs(d) > 0.5) desp.push([c, d]);
      });
      desp.forEach(function (p) { p[0].style.transform = 'translate3d(' + p[1] + 'px,0,0)'; });
      void fila().offsetWidth;
      antes.forEach(function (l, c) { c.style.transition = ''; });
      desp.forEach(function (p) {
        p[0].style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
        p[0].style.transform = '';
        var c = p[0]; clearTimeout(c._flipT); c._flipT = setTimeout(function () { c.style.transition = ''; }, 220);
      });
    }
    function suelta() {
      cancelaPulsa();
      if (!D) return;
      var c = D.c;
      guarda();
      D = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      c.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
      c.style.transform = '';
      setTimeout(function () { c.classList.remove('dh-chip-lift'); c.style.transition = ''; }, 190);
    }
    function restablece() {
      var L = layout(); if (!L) return;
      var vis = {}; L.forEach(function (x) { vis[x.key] = x.visible !== false; });
      /* «Restablecer» vuelve a enseñarlas TODAS, como en las tarjetas. */
      var D0 = (window.DH_STATS_DEFAULT || []).map(function (k) { return { key: k, visible: true }; });
      flipFila(function () { aplicaL(D0); }, null);
      if (typeof window.dhStatsSaveLayout === 'function') window.dhStatsSaveLayout(D0);
      refrescaOcultasFila();
    }
    /* En edición un toque en una etiqueta no la abre; tocar fuera termina. */
    function onClickCaptura(e) {
      if (!editando) return;
      var t = e.target;
      if (t.closest && t.closest('#dh-edit-bar')) return;
      var hb = t.closest && t.closest('.dh-stats-row .dh-hidebtn');
      if (hb) { e.stopPropagation(); e.preventDefault(); ponVisible(hb.parentNode.getAttribute('data-metric'), false); return; }
      var oc = t.closest && t.closest('#dh-chips-ocultas');
      if (oc) {
        e.stopPropagation(); e.preventDefault();
        var it = t.closest('[data-k]'); if (it) ponVisible(it.getAttribute('data-k'), true);
        return;
      }
      if (t.closest && t.closest('.dh-stats-row')) { e.stopPropagation(); e.preventDefault(); return; }
      var enHome = t.closest && t.closest('#scr-home');
      sale();
      if (enHome) { e.stopPropagation(); e.preventDefault(); }
    }
    function init() {
      var f = fila(); if (!f || YO.listo) return;
      YO.listo = true;
      f.addEventListener('pointerdown', onDown);
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerup', suelta);
      document.addEventListener('pointercancel', suelta);
      document.addEventListener('touchmove', function (e) { if (D) e.preventDefault(); }, { passive: false });
      f.addEventListener('contextmenu', function (e) { if (P || D || editando) e.preventDefault(); });
      document.addEventListener('click', onClickCaptura, true);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sale(); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) { suelta(); sale(); } });
    }
    YO = { entra: entra, sale: sale, restablece: restablece, sincroniza: function () {},
           oculta: function (k) { ponVisible(k, false); }, muestra: function (k) { ponVisible(k, true); },
           editando: function () { return editando; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    return YO;
  }

  function barra() {
    var b = document.getElementById('dh-edit-bar');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'dh-edit-bar';
    b.innerHTML =
      '<button type="button" class="dh-eb-rst">Restablecer</button>' +
      '<span class="dh-eb-txt">Arrastra para ordenar · − para ocultar</span>' +
      '<button type="button" class="dh-eb-ok">Listo</button>';
    b.querySelector('.dh-eb-ok').addEventListener('click', function () { if (ACTIVA) ACTIVA.sale(); });
    b.querySelector('.dh-eb-rst').addEventListener('click', function () { if (ACTIVA) ACTIVA.restablece(); });
    document.body.appendChild(b);
    return b;
  }

  window.dhEditando = function () { return !!ACTIVA; };
  window.dhHomeOrden = crea({
    grid: 'dh-cards', pantalla: 'scr-home', key: 'pilotos_home_cards', nube: '',
    scroller: function () { return document.getElementById('dh-scroll'); },
    minimo: { roster: 'm', cafi: 'm', career: 'm', logbook: 'm' }, calendario: true,
    nombres: { roster: 'Roster', cafi: 'CAFI', weather: 'Weather', pay: 'Pay Check', fatigue: 'Fatigue',
               oes: 'Live Training', docs: 'Documents', sim: 'Simulator', career: 'Career', logbook: 'Logbook' }
  });
  /* Tools: la misma mecánica. Hoy con una sola herramienta se puede cambiar su
     tamaño y el orden queda listo para cuando haya más. Aquí NO se rellenan los
     huecos: estirar una sola tarjeta a lo ancho cambiaría su aspecto sin que
     nadie lo haya pedido. */
  window.dhToolsOrden = crea({
    grid: 'tl-cards', pantalla: 'scr-tools', key: 'pilotos_tools_cards', nube: 'tools',
    scroller: function () { return document.querySelector('#scr-tools .scroll-body'); },
    minimo: { descent: 'm' }, rellena: false,
    nombres: { descent: 'Approach Path Calculator', swap: 'Swap', sim: 'Simulator' }
  });
  window.dhChipsOrden = creaFila();
  TODAS.push(window.dhHomeOrden, window.dhToolsOrden);
  /* Al arrancar, el Home se colocó antes de existir Tools: no pudo reclamar las
     tarjetas que el piloto se llevó allí. Ahora que están las dos, otra pasada. */
  function reconcilia() { TODAS.forEach(function (o) { try { o.reaplica(); } catch (e) {} }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(reconcilia, 0); });
  else reconcilia();
})();
