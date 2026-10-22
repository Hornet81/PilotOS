/* ════════ PilotOS · barra inferior (Hoy · Roster · [vuelo] · Logbook · Más) ════════
   Las CINCO posiciones son fijas — como en cabina, el dedo va solo al mismo sitio —
   y lo que cambia es el CONTENIDO:

   · Botón central: dice en qué fase del día está el piloto, sacado del roster LOCAL
     (funciona sin red). Libre → SkyView · víspera/día de servicio → ruta + cuenta
     atrás a la firma · en servicio → el siguiente salto · tras aterrizar → «Cerrar día»,
     que lleva al logbook a completar los vuelos (es cuando el piloto se acuerda).
   · Avisos: Logbook = vuelos del roster ya volados que aún no están en el logbook;
     Más = documentos caducados o que caducan en ≤30 días. Se dan por VISTOS al abrir
     la pestaña y sólo vuelven si el número SUBE: un aviso que no se va nunca deja de
     mirarse.
   · Más: hoja con CAFI, Pay Check, Examen, Documentos, Herramientas, perfil, plan y guía.
   · En el Home la barra se aparta al bajar y vuelve al subir. En el resto de pantallas
     se queda como estaba (en vertical fija; en el móvil apaisado la mueve el cromo
     general, `chrome-off`).

   Depende de globales del index: goTo, curScreen, dhUpcomingFlights, dhStdOf, dhStaOf,
   dhArrMsOf, dhDutyLabelOf, rstIsWork, rstWorkStartMin, pilotosHoraTxt, _ldOACI,
   showToast; y de js/docs.js (DOCS_META, docStatus). Todo se llama en tiempo de
   ejecución y cada uso va protegido: si algo falta, la barra cae a «SkyView» sin avisos. */
(function(){
  'use strict';
  var EN = function(){ return window.pilotosLang === 'en'; };
  var t  = function(es, en){ return EN() ? en : es; };
  var ACK_KEY = 'app_bnav_ack';     // sin prefijo pilotos_: no lo barre el cierre de sesión
  var SEEN_KEY = 'app_bnav_v2';

  function lsJSON(k, def){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch(e){ return def; } }
  function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  // ── Datos ───────────────────────────────────────────────────────────────────
  function rosterEntries(){
    var e = lsJSON('pilotOS_roster', []);
    if ((!Array.isArray(e) || !e.length) && window.RST && Array.isArray(RST.entries)) e = RST.entries;
    return Array.isArray(e) ? e : [];
  }
  function logbookEntries(){
    if (Array.isArray(window.ldEntries) && window.ldEntries.length) return window.ldEntries;
    var e = lsJSON('pilotOS_logbook_v1', []);
    return Array.isArray(e) ? e : [];
  }
  function oaci(c){
    c = String(c || '').replace(/^\*/, '').toUpperCase();
    try { if (typeof _ldOACI === 'function') return String(_ldOACI(c) || c).toUpperCase(); } catch(e){}
    return c;
  }
  function iata(c){ return String(c || '').replace(/^\*/, '').toUpperCase(); }
  function isPos(f){ return !!(f.isPositioning || f.positioning || f.type === 'positioning' || String(f.dep || '').charAt(0) === '*'); }
  function sortKey(f){ return (f.date || '') + (typeof dhStdOf === 'function' ? (dhStdOf(f) || '00:00') : (f.std || '')); }

  // Instante UTC de la salida de un tramo (las horas del roster son zulú).
  function depMs(f){
    var std = typeof dhStdOf === 'function' ? dhStdOf(f) : String(f.std || '').slice(0, 5);
    if (!f.date || !std) return null;
    var p = String(f.date).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2], +std.slice(0, 2), +std.slice(3, 5), 0);
  }
  function arrMs(f){ try { return typeof dhArrMsOf === 'function' ? dhArrMsOf(f) : null; } catch(e){ return null; } }
  function reportMs(nd){
    var m = null;
    try { if (typeof rstWorkStartMin === 'function') m = rstWorkStartMin(nd); } catch(e){}
    // rstWorkStartMin vive en el código del Roster y no existe hasta entrar en él: misma
    // regla a mano (firma declarada → inicio → STD − 55 min), como la tarjeta de Report.
    if (m == null){
      var mm = function(x){ if (!x || String(x).indexOf(':') < 0) return null; var p = String(x).replace(/^[ASE]/, '').split(':'); var v = (+p[0] || 0) * 60 + (+p[1] || 0); return isNaN(v) ? null : v; };
      m = mm(nd.checkin);
      if (m == null) m = mm(nd.start);
      if (m == null){ var s = mm(nd.std || nd.std_actual || nd.std_estimated); if (s != null) m = nd.type === 'flight' ? s - 55 : s; }
    }
    if (m == null || !nd.date) return null;
    var p = String(nd.date).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2], 0, m);   // los minutos normalizan el cruce de día
  }
  function horaTxt(hhmm){
    try { if (typeof pilotosHoraTxt === 'function') return pilotosHoraTxt(hhmm, ' '); } catch(e){}
    return hhmm;
  }
  function durTxt(ms){
    var h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h ? (h + 'h ' + String(m).padStart(2, '0') + 'm') : (m + 'm');
  }

  // Vuelos del roster ya aterrizados (últimos 14 días) que no están en el logbook.
  // Se casa por día + origen + destino en OACI, con ±1 día de margen: el logbook
  // puede guardar la fecha local y el roster la zulú.
  function pendingLog(nowMs){
    var have = {};
    logbookEntries().forEach(function(e){
      if (!e || !e.date || e.type === '__ac_db__') return;
      have[e.date + '|' + oaci(e.dep) + '|' + oaci(e.arr)] = 1;
    });
    var from = nowMs - 14 * 86400000, out = [];
    rosterEntries().forEach(function(f){
      if (!f || f.type !== 'flight' || isPos(f)) return;
      var a = arrMs(f);
      if (a == null || a > nowMs - 15 * 60000 || a < from) return;
      var k = '|' + oaci(f.dep) + '|' + oaci(f.arr), d = new Date(f.date + 'T12:00:00Z');
      for (var i = -1; i <= 1; i++){
        var dd = new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10);
        if (have[dd + k]) return;
      }
      out.push(f);
    });
    return out;
  }

  function docsAlert(){
    var n = 0;
    try {
      if (typeof DOCS_META === 'undefined' || typeof docStatus !== 'function') return 0;
      Object.keys(DOCS_META).forEach(function(id){
        var s = docStatus(id);
        if (s && (s.state === 'exp' || (s.state === 'warn' && s.days <= 30))) n++;
      });
    } catch(e){}
    return n;
  }

  // ── Fase del botón central ─────────────────────────────────────────────────
  function phase(){
    var now = Date.now();
    var entries = rosterEntries();
    if (!entries.length || typeof dhUpcomingFlights !== 'function') return { k: 'sky' };
    var flights = entries.filter(function(e){ return e && e.type === 'flight'; })
                         .sort(function(a, b){ return sortKey(a).localeCompare(sortKey(b)); });
    var duties = flights;
    try {
      if (typeof rstIsWork === 'function' && typeof rstWorkStartMin === 'function'){
        duties = entries.filter(rstIsWork).sort(function(a, b){
          var sa = rstWorkStartMin(a), sb = rstWorkStartMin(b);
          return (a.date + String(10000 + (sa == null ? 9999 : sa))).localeCompare(b.date + String(10000 + (sb == null ? 9999 : sb)));
        });
      }
    } catch(e){}
    var nd = dhUpcomingFlights(duties, now)[0] || null;
    var rep = nd ? reportMs(nd) : null;

    // 1 · En servicio: el siguiente salto de la jornada (o el que está en el aire).
    if (nd && rep != null && rep <= now){
      var legs = dhUpcomingFlights(flights, now).filter(function(f){
        return f.date === nd.date && (f.checkin || '') === (nd.checkin || '');
      });
      for (var i = 0; i < legs.length; i++){
        var f = legs[i], d = depMs(f), a = arrMs(f);
        if (d != null && a != null && d <= now && now < a)
          return { k: 'air', t: iata(f.dep) + ' → ' + iata(f.arr), s: t('llega ', 'ETA ') + horaTxt(dhStaOf(f)) };
        if (d != null && d > now)
          return { k: 'leg', t: iata(f.dep) + ' → ' + iata(f.arr), s: 'STD ' + horaTxt(dhStdOf(f)) };
      }
    }
    // 2 · Firma en las próximas 24 h: ruta (o servicio) + cuenta atrás.
    if (nd && rep != null && rep > now && rep - now <= 24 * 3600000){
      var title = nd.type === 'flight' ? (iata(nd.dep) + ' → ' + iata(nd.arr)) : (typeof dhDutyLabelOf === 'function' ? dhDutyLabelOf(nd) : t('Servicio', 'Duty'));
      return { k: rep - now <= 2 * 3600000 ? 'due' : 'pre', t: title, s: t('firma en ', 'report in ') + durTxt(rep - now) };
    }
    // 3 · Recién aterrizado y con vuelos por pasar al logbook.
    var pend = pendingLog(now).filter(function(f){ var a = arrMs(f); return a != null && now - a < 18 * 3600000; });
    if (pend.length)
      return { k: 'close', t: t('Cerrar día', 'Close day'), s: pend.length + ' ' + t(pend.length === 1 ? 'vuelo' : 'vuelos', pend.length === 1 ? 'flight' : 'flights') };
    return { k: 'sky' };
  }

  var ICON_SKY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20 11a4 4 0 0 1-2.5 8z"/></svg>';

  function paintCenter(){
    var el = document.getElementById('bt-center');
    if (!el) return;
    var p; try { p = phase(); } catch(e){ p = { k: 'sky' }; }
    var key = JSON.stringify(p);
    if (el.__bnKey === key) return;          // sin cambio → sin repintado
    el.__bnKey = key;
    el.className = 'btc st-' + p.k;
    el.dataset.phase = p.k;
    if (p.k === 'sky') el.innerHTML = ICON_SKY + '<span class="btc-t">SkyView</span>';
    else el.innerHTML = '<span class="btc-t">' + p.t + '</span><span class="btc-s">' + p.s + '</span>';
    el.setAttribute('aria-label', p.k === 'sky' ? 'SkyView' : (p.t + ' · ' + p.s));
  }

  // ── Avisos (badges) ────────────────────────────────────────────────────────
  function badge(tabId, n, ackKey){
    var tab = document.getElementById(tabId);
    if (!tab) return;
    var ack = lsJSON(ACK_KEY, {});
    var show = n > 0 && n > (ack[ackKey] || 0);
    var b = tab.querySelector('.bn-badge');
    if (!show){ if (b) b.remove(); return; }
    if (!b){ b = document.createElement('span'); b.className = 'bn-badge'; tab.appendChild(b); }
    b.textContent = n > 9 ? '9+' : String(n);
  }
  function ackCount(ackKey, n){
    var ack = lsJSON(ACK_KEY, {});
    ack[ackKey] = n; lsSet(ACK_KEY, ack);
  }
  var counts = { log: 0, docs: 0 };
  function paintBadges(){
    try { counts.log = pendingLog(Date.now()).length; } catch(e){ counts.log = 0; }
    counts.docs = docsAlert();
    // Si el número BAJA (se resolvió algo), el "visto" baja con él: así un aviso nuevo
    // vuelve a salir aunque el total no supere el máximo de antes.
    var ack = lsJSON(ACK_KEY, {});
    if ((ack.log || 0) > counts.log){ ack.log = counts.log; lsSet(ACK_KEY, ack); }
    if ((ack.docs || 0) > counts.docs){ ack.docs = counts.docs; lsSet(ACK_KEY, ack); }
    badge('bt-logbook', counts.log, 'log');
    badge('bt-mas', counts.docs, 'docs');
  }

  function refresh(){ paintCenter(); paintBadges(); }

  // ── Hoja «Más» ─────────────────────────────────────────────────────────────
  var I = function(d){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  function items(){
    return [
      { k: 'cafi',    ic: I('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="12" cy="10" r="2.5"/>'), l: 'CAFI', s: t('Asistente IA · FCOM y convenio', 'AI assistant · FCOM and agreement') },
      { k: 'pay',     ic: I('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>'), l: 'Pay Check', s: t('Nómina, dietas y gastos', 'Payslip, allowances and expenses') },
      { k: 'oes',     ic: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'), l: t('Examen oral', 'Oral exam'), s: t('Preparación de chequeos', 'Check preparation') },
      { k: 'docs',    ic: I('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'), l: t('Documentos', 'Documents'), s: t('Licencia, médico y caducidades', 'Licence, medical and expiry dates'), badge: counts.docs },
      { k: 'tools',   ic: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'), l: t('Herramientas', 'Tools'), s: t('Calculadoras', 'Calculators') },
      { k: 'perfil',  ic: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'), l: t('Mi perfil', 'My profile'), s: '' },
      { k: 'upgrade', ic: I('<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>'), l: t('Tu plan', 'Your plan'), s: '' },
      { k: 'guide',   ic: I('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/>'), l: t('Guía de uso', 'User guide'), s: '' }
    ];
  }
  function openMore(){
    closeMore(true);
    var ov = document.createElement('div');
    ov.id = 'bn-more-ov';
    ov.onclick = function(ev){ if (ev.target === ov) closeMore(); };
    var html = '<div class="bn-more" role="dialog" aria-label="' + t('Más secciones', 'More sections') + '">'
             + '<div class="bn-more-grab"></div><div class="bn-more-ttl">' + t('Más secciones', 'More sections') + '</div><div class="bn-more-grid">';
    items().forEach(function(it){
      html += '<button class="bn-more-it" data-k="' + it.k + '">'
            + '<span class="bn-more-ic">' + it.ic + (it.badge ? '<span class="bn-badge">' + (it.badge > 9 ? '9+' : it.badge) + '</span>' : '') + '</span>'
            + '<span class="bn-more-tx"><span class="bn-more-l">' + it.l + '</span>' + (it.s ? '<span class="bn-more-s">' + it.s + '</span>' : '') + '</span></button>';
    });
    html += '</div></div>';
    ov.innerHTML = html;
    ov.querySelectorAll('.bn-more-it').forEach(function(b){
      b.onclick = function(){
        var k = b.getAttribute('data-k'); closeMore();
        // La guía es un iframe de carga perezosa: goTo('guide') a secas abre una pantalla
        // vacía. openGuide() le pone el src y luego navega.
        try { if (k === 'guide' && typeof openGuide === 'function') openGuide(); else goTo(k); } catch(e){}
      };
    });
    document.body.appendChild(ov);
    requestAnimationFrame(function(){ ov.classList.add('open'); });
    ackCount('docs', counts.docs);
    badge('bt-mas', 0, 'docs');
  }
  function closeMore(now){
    var ov = document.getElementById('bn-more-ov');
    if (!ov) return;
    if (now){ ov.remove(); return; }
    ov.classList.remove('open');
    setTimeout(function(){ if (ov.parentNode) ov.remove(); }, 220);
  }

  // ── Botón central ──────────────────────────────────────────────────────────
  function centerTap(){
    var el = document.getElementById('bt-center');
    if (el && el.dataset.phase === 'close'){ try { goTo('logbook'); } catch(e){} return; }
    try { goTo('skyview'); } catch(e){}
  }

  // ── Home: la barra se aparta al bajar y vuelve al subir ────────────────────
  var LAND = window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 520px)') : null;
  var hy = 0, hacc = 0;
  function homeHide(off){ document.documentElement.classList.toggle('bn-home-off', !!off); hacc = 0; }
  function onHomeScroll(ev){
    var el = ev.target;
    if (typeof curScreen !== 'undefined' && curScreen !== 'home') return;   // `let` del index: global léxico, no window
    if (LAND && LAND.matches){ homeHide(false); return; }   // en el móvil apaisado manda el cromo general
    var y = el.scrollTop, max = el.scrollHeight - el.clientHeight;
    if (y <= 28){ hy = y; homeHide(false); return; }
    if (y < 0 || y > max){ hy = y; return; }              // rebote elástico de iOS: no es un gesto
    var d = y - hy; hy = y;
    if (!d) return;
    if ((hacc > 0) !== (d > 0)) hacc = 0;                  // histéresis: cambia de sentido → a cero
    hacc += d;
    if (hacc >= 32) homeHide(true);
    else if (hacc <= -48) homeHide(false);
  }

  // Lo llama updateTabs() en cada cambio de pantalla.
  function afterNav(key){
    if (key !== 'home') homeHide(false);
    if (key === 'logbook') ackCount('log', counts.log);
    if (key === 'docs') ackCount('docs', counts.docs);
    closeMore(true);
    refresh();
  }

  window.bnRefresh = refresh;
  window.bnAfterNav = afterNav;
  window.bnOpenMore = openMore;
  window.bnCenterTap = centerTap;

  function init(){
    var sc = document.getElementById('dh-scroll');
    if (sc) sc.addEventListener('scroll', onHomeScroll, { passive: true });
    refresh();
    setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) refresh(); });
    window.addEventListener('storage', function(ev){ if (!ev.key || ev.key === 'pilotOS_roster' || ev.key === 'pilotOS_logbook_v1' || ev.key === 'pilotos_docs') refresh(); });
    // Una sola vez: explicar dónde han ido las pestañas que ya no están.
    if (!lsJSON(SEEN_KEY, false)){
      setTimeout(function(){
        try { showToast(t('Exam, Tools, CAFI y Pay Check están ahora en «Más»', 'Exam, Tools, CAFI and Pay Check are now under «More»')); } catch(e){}
        lsSet(SEEN_KEY, true);
      }, 2500);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
