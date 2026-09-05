/* ══════════════════════════════════════════════════════════════════════════════
   ecrews-legs-import.js — Traer al logbook los vuelos YA VOLADOS de eCrews.
   ------------------------------------------------------------------------------
   Distinto del import de roster: el roster trae la PROGRAMACIÓN; esto trae lo que
   de verdad pasó, tal y como lo publica AIMS en la ventana "Details for Pairing":

     · hora REAL de calzos fuera / calzos dentro   (OUT / IN)
     · bloque por leg, ya calculado por AIMS
     · MATRÍCULA y tipo de avión POR LEG (pueden cambiar a media jornada)
     · legs DHC (el piloto viaja de pasajero) marcadas como posicionamiento

   Lo que eCrews NO da y por tanto aquí no se inventa:
     · OFF/ON de aire (despegue/aterrizaje). Sólo publica calzos. `std`/`sta` del
       logbook se dejan VACÍAS: las pone el piloto.
     · La tripulación. La ventana trae "Crew members on board" y devuelve
       "(No crew found)" incluso en vuelos ya volados. Los nombres siguen a mano.

   UN MES POR IMPORTACIÓN. El backend abre una ventana por pairing (~14 en un mes),
   así que un año serían varios minutos de navegador headless.

   Tema: la hoja se reconstruye entera en cada apertura leyendo `html.day`, con la
   MISMA paleta que la hoja del menú del logbook (ldToggleMenu). Por eso no hay
   colores fijos aquí abajo: todo sale de TH().

   Depende de globales de index.html (ldEntries, ldSaveData, ldGenDeterministicId,
   RST_IATA_ICAO, ldAcDbSet, showToast…). Como todo se ejecuta al pulsar y nada en
   carga, el orden de los <script> no importa.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LEGS = [];          // legs devueltas por el backend
  var SEL = {};           // clave de leg → seleccionada (bool)
  var MONTH = '';
  var ERRORES = [];
  var RANGO = null;       // 'CPT' | 'FO' según la ficha de eCrews (manda sobre la deducción local)

  function api() { return (typeof lsGet === 'function' ? lsGet('cafi_backend_url', 'https://api.pilotos.aero') : 'https://api.pilotos.aero'); }
  function tok() { return localStorage.getItem('cafi_auth_token'); }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function icao(x) { var u = String(x || '').toUpperCase(); return (window.RST_IATA_ICAO && window.RST_IATA_ICAO[u]) || u; }
  function legKey(l) { return l.date + '|' + l.flightNum + '|' + l.dep + '|' + l.arr; }

  // ── Paleta ─────────────────────────────────────────────────────────────────
  // Los valores son los mismos que usa la hoja del menú del logbook: si allí se
  // lee, aquí también. En día el acento es el cian oscuro (8,145,178); el claro
  // (#22D3EE) sobre fondo blanco no se lee.
  function TH() {
    var day = false;
    try { day = document.documentElement.classList.contains('day'); } catch (e) {}
    return day ? {
      day: true,
      scrim: 'rgba(10,22,48,.50)',
      sheet: 'linear-gradient(180deg,rgba(240,252,255,.99) 0%,rgba(226,246,255,1) 100%)',
      solid: '#EFFAFF',                       // cabecera pegajosa: opaca de verdad
      line: 'rgba(13,148,136,.22)',
      txt: '#0A1628',
      sub: '#475569',
      faint: '#64748B',
      acc: '#0E7490',
      accSoft: 'rgba(8,145,178,.10)',
      accLine: 'rgba(8,145,178,.30)',
      cardOn: 'rgba(8,145,178,.13)',
      cardOnLine: 'rgba(8,145,178,.55)',
      cardOff: 'rgba(15,23,42,.035)',
      cardLine: 'rgba(15,23,42,.12)',
      chipBg: 'rgba(15,23,42,.09)',
      chipTxt: '#475569',
      warn: '#B45309',
      warnBg: 'rgba(245,158,11,.12)',
      warnLine: 'rgba(180,83,9,.32)',
      btnBg: 'linear-gradient(135deg,rgba(8,145,178,.16),rgba(59,130,246,.12))',
      btnLine: 'rgba(8,145,178,.55)',
      closeBg: 'rgba(15,23,42,.07)',
      closeTxt: '#475569',
      check: '#0E7490', checkTxt: '#FFFFFF'
    } : {
      day: false,
      scrim: 'rgba(2,8,20,.65)',
      sheet: 'linear-gradient(180deg,rgba(8,22,40,.97) 0%,rgba(4,14,28,.99) 100%)',
      solid: '#08172A',
      line: 'rgba(34,211,238,.2)',
      txt: 'rgba(248,250,252,.92)',
      sub: 'rgba(226,232,240,.55)',
      faint: 'rgba(226,232,240,.42)',
      acc: '#22D3EE',
      accSoft: 'rgba(34,211,238,.07)',
      accLine: 'rgba(34,211,238,.22)',
      cardOn: 'rgba(34,211,238,.09)',
      cardOnLine: 'rgba(34,211,238,.4)',
      cardOff: 'rgba(148,163,184,.04)',
      cardLine: 'rgba(148,163,184,.14)',
      chipBg: 'rgba(148,163,184,.16)',
      chipTxt: 'rgba(226,232,240,.6)',
      warn: '#F59E0B',
      warnBg: 'rgba(245,158,11,.08)',
      warnLine: 'rgba(245,158,11,.28)',
      btnBg: 'linear-gradient(135deg,rgba(34,211,238,.22),rgba(59,130,246,.16))',
      btnLine: 'rgba(34,211,238,.5)',
      closeBg: 'rgba(255,255,255,.08)',
      closeTxt: 'rgba(248,250,252,.5)',
      check: '#22D3EE', checkTxt: '#0B1220'
    };
  }
  var t = TH(); // paleta vigente; se refresca en cada apertura

  function mesLabel(ym) {
    var M = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    var p = ym.split('-');
    return M[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  // ── ¿esta leg ya está en el logbook? ───────────────────────────────────────
  // Se compara por fecha + ruta (en ICAO, que es como se guarda) y, si lo hay,
  // por número de vuelo. Sin esto, reimportar un mes duplicaría el logbook.
  function yaEsta(l) {
    if (!window.ldEntries) return false;
    var d = icao(l.dep), a = icao(l.arr);
    var num = String(l.flightNum || '').replace(/^VY/, '');
    return ldEntries.some(function (e) {
      if (!e || e.date !== l.date) return false;
      var en = String(e.flight || '').replace(/^VY/, '');
      if (num && en && num === en) return true;
      return icao(e.dep) === d && icao(e.arr) === a;
    });
  }

  // ── Avión: tipo y MOTOR a partir de la matrícula ───────────────────────────
  // eCrews da un código comercial ('32Q', '32A') y NUNCA el motor. La app ya trae una
  // base de la flota por matrícula con el tipo canónico Y el motor, así que esa manda:
  // si conoce la matrícula, el piloto no tiene que tocar nada.
  var AC_ECREWS = {
    '318': 'A318', '319': 'A319', '320': 'A320', '321': 'A321',
    '32A': 'A320', '32B': 'A321',            // con sharklets
    '32N': 'A320neo', '32Q': 'A321neo', '32S': 'A320'
  };
  function avionDe(l) {
    var reg = String(l.reg || '').toUpperCase();
    var sabido = null;
    try { if (reg && typeof ldAcDbGet === 'function') sabido = ldAcDbGet(reg); } catch (e) {}
    if (sabido && sabido.acType) {
      // La base gana: trae el tipo canónico y el motor.
      return { acType: sabido.acType, engine: sabido.engine || '', nuevo: false };
    }
    var cod = String(l.acType || '').toUpperCase().trim();
    // Si el código no está mapeado se deja tal cual: mejor el dato de eCrews que nada,
    // y el piloto lo corrige. Inventarse un tipo en un documento legal es peor.
    return { acType: AC_ECREWS[cod] || cod, engine: '', nuevo: !!reg };
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  // Se reconstruye en cada apertura: así coge el tema vigente sin tener que
  // repintar nada cuando el piloto cambia de día a noche.
  function ov() {
    var vieja = document.getElementById('eclg-overlay');
    if (vieja) vieja.remove();
    t = TH();
    var el = document.createElement('div');
    el.id = 'eclg-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:' + t.scrim + ';-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:0';
    el.innerHTML =
      '<div style="width:100%;max-width:520px;min-height:100%;background:' + t.sheet + '">' +
      '<div style="position:sticky;top:0;z-index:2;background:' + t.solid + ';border-bottom:1px solid ' + t.line + ';padding:16px 16px 12px;display:flex;align-items:flex-start;gap:10px">' +
      '<div style="flex:1">' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:17px;font-weight:800;color:' + t.txt + '">Vuelos de eCrews</div>' +
      '<div id="eclg-sub" style="font-family:\'Space Mono\',monospace;font-size:11px;color:' + t.sub + ';margin-top:3px">Elige el mes que quieres importar</div>' +
      '</div>' +
      '<button onclick="ldECrewsLegsClose()" style="background:' + t.closeBg + ';border:none;border-radius:50%;width:32px;height:32px;color:' + t.closeTxt + ';font-size:17px;cursor:pointer;flex-shrink:0">✕</button>' +
      '</div>' +
      '<div id="eclg-body" style="padding:14px 16px 28px"></div>' +
      '</div>';
    document.body.appendChild(el);
    return el;
  }
  // Todo cambio de pantalla pasa por aquí, así que es el sitio natural para apagar el
  // rotador de mensajes del cargador y no dejar un intervalo huérfano corriendo.
  function body(html) {
    pararRotador();
    var b = document.getElementById('eclg-body');
    if (b) b.innerHTML = html;
  }
  function sub(s) { var e = document.getElementById('eclg-sub'); if (e) e.textContent = s; }

  // ── Animación del cargador ─────────────────────────────────────────────────
  // Un avión recorre un arco de gran círculo que se va dibujando a su paso. Todo en
  // SVG+CSS: la PWA vuela sin red y no puede depender de ninguna librería. El vuelo
  // usa SMIL (animateMotion) en vez de offset-path porque iOS lo lleva soportando
  // desde siempre, y las transiciones CSS puras se reanudan solas si el sistema
  // suspende la pestaña — un rAF no.
  var ROT = null;
  function pararRotador() { if (ROT) { clearInterval(ROT); ROT = null; } }

  function inyectarCSS() {
    if (document.getElementById('eclg-anim-css')) return;
    var s = document.createElement('style');
    s.id = 'eclg-anim-css';
    s.textContent =
      '@keyframes eclg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}' +
      '@keyframes eclg-barra{0%{left:-38%}100%{left:100%}}' +
      '@keyframes eclg-msg{0%{opacity:0;transform:translateY(5px)}14%{opacity:1;transform:none}86%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-5px)}}' +
      '#eclg-fly{animation:eclg-bob 3.4s ease-in-out infinite}' +
      '#eclg-msg{animation:eclg-msg 3.2s ease-in-out infinite}' +
      '#eclg-barra-in{position:absolute;top:0;height:100%;width:38%;border-radius:99px;animation:eclg-barra 1.5s cubic-bezier(.55,0,.45,1) infinite}' +
      '@media (prefers-reduced-motion:reduce){#eclg-fly,#eclg-msg,#eclg-barra-in{animation:none}#eclg-msg{opacity:1}}';
    document.head.appendChild(s);
  }

  // Ni una palabra de CÓMO se saca: sólo qué está apareciendo.
  var MENSAJES = [
    'Conectando con eCrews…',
    'Recuperando tus vuelos…',
    'Leyendo matrículas…',
    'Calzos y tiempos de bloque…',
    'Pasando las horas a zulú…',
    'Ordenando por jornada…',
    'Casi está…'
  ];

  function cargadorHTML() {
    inyectarCSS();
    var A = t.acc;
    // Arco de gran círculo: el avión lo recorre y la estela se dibuja a su paso, ambos
    // con la misma duración para que la punta de la estela quede bajo el avión.
    return '' +
      '<div style="text-align:center;padding:46px 20px 40px">' +
        '<div id="eclg-fly" style="position:relative;width:250px;height:120px;margin:0 auto 10px">' +
          '<svg viewBox="0 0 250 120" width="250" height="120" style="overflow:visible">' +
            '<defs>' +
              '<linearGradient id="eclg-g" x1="0" y1="0" x2="1" y2="0">' +
                '<stop offset="0%" stop-color="' + A + '" stop-opacity=".15"/>' +
                '<stop offset="100%" stop-color="' + A + '" stop-opacity="1"/>' +
              '</linearGradient>' +
            '</defs>' +
            // arco guía, tenue y punteado
            '<path id="eclg-arc" d="M24,92 Q125,2 226,92" fill="none" stroke="' + A + '" stroke-opacity=".22" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>' +
            // Estela. El dasharray es la longitud REAL del arco (getTotalLength()=226.2),
            // no una estimación: con un valor de más la estela se descuelga del avión.
            '<path d="M24,92 Q125,2 226,92" fill="none" stroke="url(#eclg-g)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="227" stroke-dashoffset="227">' +
              '<animate attributeName="stroke-dashoffset" values="227;0" dur="3.2s" repeatCount="indefinite"/>' +
            '</path>' +
            // aeropuertos de salida y llegada
            '<circle cx="24" cy="92" r="4.5" fill="' + A + '" fill-opacity=".9"/>' +
            '<circle cx="226" cy="92" r="4.5" fill="' + A + '" fill-opacity=".28"/>' +
            '<circle cx="226" cy="92" r="4.5" fill="none" stroke="' + A + '" stroke-width="1.5">' +
              '<animate attributeName="r" values="4.5;13" dur="1.9s" repeatCount="indefinite"/>' +
              '<animate attributeName="stroke-opacity" values=".7;0" dur="1.9s" repeatCount="indefinite"/>' +
            '</circle>' +
            // el avión, dibujado centrado en (0,0) y apuntando a +x para que rotate="auto" lo alinee
            '<g>' +
              '<path d="M13,0 L-5,-6 L-1.5,0 L-5,6 Z" fill="' + A + '"/>' +
              '<animateMotion dur="3.2s" repeatCount="indefinite" rotate="auto">' +
                '<mpath xlink:href="#eclg-arc" href="#eclg-arc"/>' +
              '</animateMotion>' +
            '</g>' +
          '</svg>' +
        '</div>' +
        '<div id="eclg-msg" style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:' + t.txt + ';min-height:21px">' + MENSAJES[0] + '</div>' +
        '<div style="position:relative;width:170px;height:3px;margin:16px auto 0;border-radius:99px;background:' + t.cardLine + ';overflow:hidden">' +
          '<div id="eclg-barra-in" style="background:' + A + '"></div>' +
        '</div>' +
        '<div style="font-family:\'Space Mono\',monospace;font-size:10.5px;color:' + t.faint + ';margin-top:14px">Puede tardar un minuto · no cierres la app</div>' +
      '</div>';
  }

  function arrancarRotador() {
    pararRotador();
    var i = 0;
    ROT = setInterval(function () {
      var el = document.getElementById('eclg-msg');
      if (!el) { pararRotador(); return; }          // se cambió de pantalla
      i++;
      // Al llegar al final se queda en "Casi está…": repetir el ciclo cuando ya lleva
      // un minuto sonaría a que se ha colgado.
      el.textContent = MENSAJES[Math.min(i, MENSAJES.length - 1)];
    }, 3200);
  }

  // ── 1) Selector de mes ─────────────────────────────────────────────────────
  window.ldECrewsLegsOpen = function () {
    LEGS = []; SEL = {}; ERRORES = [];
    var o = ov(); o.style.display = 'flex'; document.body.style.overflow = 'hidden';
    sub('Elige el mes que quieres importar');

    var hoy = new Date(), botones = '';
    for (var i = 0; i < 13; i++) {
      var d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      var ym = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      botones += '<button onclick="ldECrewsLegsFetch(\'' + ym + '\')" style="width:100%;padding:13px 15px;margin-bottom:8px;background:' + t.accSoft + ';border:1px solid ' + t.accLine + ';border-radius:12px;color:' + t.txt + ';font-family:\'Space Mono\',monospace;font-size:13px;font-weight:700;cursor:pointer;text-align:left;letter-spacing:.5px">' +
        mesLabel(ym) + (i === 0 ? '<span style="float:right;color:' + t.acc + ';font-size:10px;letter-spacing:1px">MES ACTUAL</span>' : '') + '</button>';
    }
    var hoyISO = new Date().toISOString().slice(0, 10);
    body(
      '<div style="background:' + t.accSoft + ';border:1px solid ' + t.accLine + ';border-radius:12px;padding:12px 14px;margin-bottom:16px">' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;line-height:1.65;color:' + t.sub + '">' +
      'Trae de eCrews la <b style="color:' + t.acc + '">hora real de calzos</b>, el <b style="color:' + t.acc + '">bloque</b> y la <b style="color:' + t.acc + '">matrícula</b> de cada vuelo.' +
      '</div></div>' +
      // Un día suelto es lo normal cuando acabas de aterrizar: tarda segundos.
      '<div style="font-size:10px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:' + t.acc + ';margin:0 0 8px;font-family:\'Space Mono\',monospace;opacity:.85">Un día suelto</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<input id="eclg-dia" type="date" value="' + hoyISO + '" max="' + hoyISO + '" style="flex:1;min-width:0;padding:12px;background:' + t.cardOff + ';border:1px solid ' + t.cardLine + ';border-radius:12px;color:' + t.txt + ';font-family:\'Space Mono\',monospace;font-size:13px;-webkit-appearance:none">' +
        '<button onclick="ldECrewsLegsDia()" style="padding:12px 16px;background:' + t.btnBg + ';border:1.5px solid ' + t.btnLine + ';border-radius:12px;color:' + t.acc + ';font-family:\'Space Grotesk\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Traer</button>' +
      '</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:' + t.faint + ';margin-bottom:20px">Mucho más rápido que el mes entero.</div>' +
      '<div style="font-size:10px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:' + t.acc + ';margin:0 0 8px;font-family:\'Space Mono\',monospace;opacity:.85">O un mes completo</div>' +
      botones
    );
  };

  window.ldECrewsLegsDia = function () {
    var el = document.getElementById('eclg-dia');
    var v = el && el.value;
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('Elige una fecha', 'info'); return; }
    window.ldECrewsLegsFetch(v);
  };

  window.ldECrewsLegsClose = function () {
    pararRotador();   // cerrar a media importación no puede dejar el intervalo vivo
    var o = document.getElementById('eclg-overlay');
    if (o) o.style.display = 'none';
    document.body.style.overflow = '';
  };

  // ── 2) Descarga ────────────────────────────────────────────────────────────
  // ym = 'YYYY-MM' (mes entero) o 'YYYY-MM-DD' (una sola jornada, cuestión de segundos).
  window.ldECrewsLegsFetch = function (ym) {
    var esDia = /^\d{4}-\d{2}-\d{2}$/.test(ym);
    MONTH = ym.slice(0, 7);
    sub(esDia ? (ym.slice(8, 10) + '/' + ym.slice(5, 7) + '/' + ym.slice(0, 4)) : mesLabel(MONTH));
    body(cargadorHTML());
    arrancarRotador();

    fetch(api() + '/api/ecrews/legs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok() },
      body: JSON.stringify(esDia ? { day: ym } : { month: ym })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, s: r.status, j: j }; }); })
      .then(function (res) {
        if (res.j && res.j.status === 'NEEDS_LOGIN') return necesitaLogin();
        if (!res.ok) return error(res.j && (res.j.error || res.j.detail) || ('HTTP ' + res.s));
        LEGS = (res.j && res.j.legs) || [];
        ERRORES = (res.j && res.j.errores) || [];
        RANGO = (res.j && res.j.rango) || null;
        // Por defecto se marca lo que aún no está en el logbook y NO es posicionamiento:
        // una leg DHC es un vuelo como pasajero, no horas del piloto.
        SEL = {};
        LEGS.forEach(function (l) { SEL[legKey(l)] = !yaEsta(l) && !l.isPositioning; });
        render();
      })
      .catch(function (e) { error(e.message); });
  };

  function necesitaLogin() {
    sub('Sesión de eCrews caducada');
    body(
      '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:32px;margin-bottom:12px">🔐</div>' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:' + t.txt + ';margin-bottom:8px">Hay que volver a entrar en eCrews</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:' + t.sub + ';line-height:1.7;margin-bottom:20px">Tendrás que aprobar el acceso en el móvil,<br>igual que al sincronizar el roster.</div>' +
      '<button onclick="ldECrewsLegsClose(); if(typeof ldECrewsSyncOpen===\'function\') ldECrewsSyncOpen();" style="padding:12px 22px;background:' + t.btnBg + ';border:1px solid ' + t.btnLine + ';border-radius:12px;color:' + t.acc + ';font-family:\'Space Grotesk\',sans-serif;font-size:14px;font-weight:700;cursor:pointer">Conectar con eCrews</button>' +
      '</div>'
    );
  }

  function error(msg) {
    sub('No se pudo leer');
    body(
      '<div style="text-align:center;padding:40px 20px">' +
      '<div style="font-size:32px;margin-bottom:12px">⚠️</div>' +
      '<div style="font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;color:' + t.warn + ';margin-bottom:10px">No se pudo leer eCrews</div>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:' + t.sub + ';line-height:1.7;word-break:break-word">' + String(msg || '').slice(0, 200) + '</div>' +
      '</div>'
    );
  }

  // ── 3) Revisión ────────────────────────────────────────────────────────────
  window.ldECrewsLegsToggle = function (k) { SEL[k] = !SEL[k]; render(); };

  function render() {
    if (!LEGS.length) {
      sub(mesLabel(MONTH) + ' · sin vuelos');
      body('<div style="text-align:center;padding:44px 20px"><div style="font-size:30px;margin-bottom:12px">📭</div>' +
        '<div style="font-family:\'Space Mono\',monospace;font-size:12px;color:' + t.sub + ';line-height:1.7">eCrews no devolvió vuelos para ' + mesLabel(MONTH) + '.</div></div>');
      return;
    }

    var dias = {};
    LEGS.forEach(function (l) { (dias[l.date] = dias[l.date] || []).push(l); });
    var fechas = Object.keys(dias).sort();
    var nSel = Object.keys(SEL).filter(function (k) { return SEL[k]; }).length;
    sub(mesLabel(MONTH) + ' · ' + LEGS.length + ' vuelos · ' + nSel + ' seleccionados');

    var h = '';
    if (ERRORES.length) {
      h += '<div style="background:' + t.warnBg + ';border:1px solid ' + t.warnLine + ';border-radius:11px;padding:10px 13px;margin-bottom:14px;font-family:\'Space Mono\',monospace;font-size:10.5px;color:' + t.warn + ';line-height:1.6">' +
        '⚠ ' + ERRORES.length + ' jornada' + (ERRORES.length === 1 ? '' : 's') + ' no se pudo leer. Vuelve a intentarlo o mete esos vuelos a mano.</div>';
    }

    fechas.forEach(function (f) {
      var dd = f.slice(8, 10) + '/' + f.slice(5, 7);
      h += '<div style="font-family:\'Space Mono\',monospace;font-size:10px;letter-spacing:1.3px;color:' + t.acc + ';font-weight:700;margin:16px 0 7px;opacity:.8">' + dd + '</div>';
      dias[f].forEach(function (l) {
        var k = legKey(l), dup = yaEsta(l), on = !!SEL[k];
        var bg = on ? t.cardOn : t.cardOff;
        var bd = on ? t.cardOnLine : t.cardLine;
        h += '<div onclick="ldECrewsLegsToggle(\'' + k.replace(/'/g, "\\'") + '\')" style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:11px;padding:10px 12px;margin-bottom:7px;cursor:pointer;display:flex;align-items:center;gap:11px' + (dup && !on ? ';opacity:.62' : '') + '">' +
          '<div style="width:19px;height:19px;flex-shrink:0;border-radius:5px;border:1.5px solid ' + (on ? t.check : t.cardLine) + ';background:' + (on ? t.check : 'transparent') + ';display:flex;align-items:center;justify-content:center;color:' + t.checkTxt + ';font-size:12px;font-weight:900">' + (on ? '✓' : '') + '</div>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-family:\'Space Mono\',monospace;font-size:12.5px;color:' + t.txt + ';font-weight:700">' +
          l.flightNum + ' <span style="color:' + t.sub + '">' + l.dep + '–' + l.arr + '</span>' +
          (l.isPositioning ? ' <span style="background:' + t.warnBg + ';color:' + t.warn + ';font-size:9px;padding:1px 5px;border-radius:4px;letter-spacing:.5px">PASAJERO</span>' : '') +
          (dup ? ' <span style="background:' + t.chipBg + ';color:' + t.chipTxt + ';font-size:9px;padding:1px 5px;border-radius:4px">YA ESTÁ</span>' : '') +
          '</div>' +
          '<div style="font-family:\'Space Mono\',monospace;font-size:10.5px;color:' + t.faint + ';margin-top:3px">' +
          (l.std_actual || l.std || '--:--') + ' → ' + (l.sta_actual || l.sta || '--:--') + ' z' +
          (l.block ? '  ·  ' + l.block : '') +
          (l.reg ? '  ·  <span style="color:' + t.acc + ';font-weight:700">' + l.reg + '</span>' : '') +
          (l.acType ? ' ' + l.acType : '') +
          '</div></div></div>';
      });
    });

    h += '<button onclick="ldECrewsLegsConfirm()" style="width:100%;margin-top:18px;padding:15px;background:' + t.btnBg + ';border:1.5px solid ' + t.btnLine + ';border-radius:15px;color:' + t.acc + ';font-family:\'Space Grotesk\',sans-serif;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.3px">' +
      'Importar ' + nSel + ' vuelo' + (nSel === 1 ? '' : 's') + '</button>' +
      '<div style="font-family:\'Space Mono\',monospace;font-size:10px;color:' + t.faint + ';text-align:center;margin-top:10px;line-height:1.6">Entran con las horas de calzos reales.<br>El despegue y el aterrizaje los pones tú.</div>';
    body(h);
  }

  // ── 4) Alta en el logbook ──────────────────────────────────────────────────
  window.ldECrewsLegsConfirm = function () {
    var elegidas = LEGS.filter(function (l) { return SEL[legKey(l)]; });
    if (!elegidas.length) { toast('No has seleccionado ningún vuelo', 'info'); return; }

    // Rol: manda lo que dice eCrews. `_ldDominantRole()` lo deduce del historial y, sin
    // historial, devuelve 'FO' por defecto — así que un comandante que estrena la app se
    // anotaba sus vuelos como copiloto justo en la importación que hace para no teclear.
    var rol = RANGO || (typeof _ldDominantRole === 'function' && _ldDominantRole()) || lsGet('ld_pref_role') || 'FO';
    var libres = Infinity;
    if (typeof isPro === 'function' && !isPro() && typeof ldRealEntryCount === 'function') {
      libres = Math.max(0, (window.PLAN_FREE_LOGBOOK_LIMIT || 25) - ldRealEntryCount());
    }

    var n = 0, tope = false;
    elegidas.forEach(function (l) {
      if (n >= libres) { tope = true; return; }
      var dep = icao(l.dep), arr = icao(l.arr);
      var av = avionDe(l);
      ldEntries.unshift({
        id: ldGenDeterministicId('EC', l.date, dep, arr, l.std || l.std_actual || ''),
        // ★ CONTRATO: sin savedAt de AHORA el vuelo entra en local y NO sale nunca del
        //   dispositivo — ldDeltaPush sólo sube lo que tenga savedAt > último sync.
        savedAt: new Date().toISOString(),
        source: 'ECREWS',
        date: l.date,
        flight: l.flightNum || '',
        dep: dep, arr: arr,
        // Programadas por un lado, REALES por otro. `atd`/`ata` son OUT/IN de calzos:
        // es lo que publica AIMS y de donde sale su propio bloque (comprobado: A0458 →
        // A0652 = 01:54, el mismo Block que imprime eCrews).
        sched_out: l.std || '', sched_in: l.sta || '',
        atd: l.std_actual || null, ata: l.sta_actual || null,
        aobt: l.std_actual || null, aibt: l.sta_actual || null,
        // OFF/ON de aire: eCrews NO las publica. Vacías a propósito — las pone el piloto.
        std: '', sta: '',
        block: l.block || '',
        acType: av.acType, engine: av.engine, reg: l.reg || '',
        role: rol,
        positioning: !!l.isPositioning,
        isPositioning: !!l.isPositioning
      });
      // Sólo se escribe en la base de matrículas lo que ella NO sabía. Llamar a
      // ldAcDbSet(reg, tipo) sin motor guarda engine:'' y le BORRA el motor a una
      // matrícula que la app ya traía de fábrica.
      if (av.nuevo && l.reg && av.acType && typeof ldAcDbSet === 'function') {
        try { ldAcDbSet(l.reg, av.acType, av.engine); } catch (e) {}
      }
      n++;
    });

    if (!n) { if (typeof showPlanToast === 'function') showPlanToast('limit'); return; }
    if (typeof ldSaveData === 'function') ldSaveData();
    if (typeof ldRender === 'function') ldRender();
    if (typeof ldStats === 'function') ldStats();
    if (typeof ldBgSync === 'function') ldBgSync({ delay: 3000, force: true });
    window.ldECrewsLegsClose();
    toast('✅ ' + n + ' vuelo' + (n === 1 ? '' : 's') + ' con horas reales' + (tope ? ' (tope del plan gratuito)' : ''), 'success');
  };
})();
