/* ═══════════════════════════════════════════════════════════════════════════
   SkyView › MAPAS › SIGWX — carta de tiempo significativo sobre nuestro mapa
   ───────────────────────────────────────────────────────────────────────────
   Datos: WAFS SigWx, emitido conjuntamente por los WAFC de Londres y Washington,
   servido por la NOAA/AWC y proxeado por api.pilotos.aero (/api/wx/sigwx).

   ★★ REGLA DE ESTE MÓDULO: si un dato no se puede garantizar, SE DICE EN
   PANTALLA. No se pinta un mapa bonito con información vieja o incompleta —
   es el fallo que ya costó caro con los NOTAM, donde tres veces mintió la
   PANTALLA y no la fuente. Concretamente:
     · El sello (ciclo emisor + hora de validez en Z) va SIEMPRE visible.
     · Si el ciclo tiene más de 7 h o alguna capa vino vacía por error de red,
       sale aviso ámbar. Nunca se sirve caché mudo.
     · Se rotula "no sustituye a la carta del OFP" porque la propia AWC dice de
       su representación: "These are not designed for, and should not be used
       as, briefing charts". Los DATOS son los oficiales; el dibujo no es la
       carta certificada.

   ★ SEMÁNTICA EXACTA DE CADA CAPA (verificada contra el producto real, no
     supuesta — los valores posibles se comprobaron sobre el fichero):
     · CB     extent = OCNL | FRQ ; top = NIVEL DEL TOPE del CB ; base = "XXX"
              SIEMPRE. El CB NO trae base: no se puede escribir "SFC" ni
              inventarse un suelo. Se muestra sólo el tope.
     · TURB   severity = moderate | severe ; base/top = capa afectada.
     · ICING  severity = moderate | severe ; base/top (base puede ser "XXX").
     · JET    fleche[] = puntos del eje con velocidad (kt) y nivel del núcleo.
     · TROP   height = nivel de la tropopausa en el contorno.
     · VOLC / TC = volcán en erupción y ciclón tropical (marcadores).
     "XXX" = no especificado; se rotula tal cual, como en la carta.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ★★ NADA DE index.html SE LEE A PELO DESDE AQUÍ.
     `mono`, `sans`, `SKY_THEME` y `useSkyDay` se declaran dentro del IIFE de
     SkyView, así que en este fichero —otro bloque <script>— no están en ámbito.
     Con `mono` sin proteger eso NO era un `undefined`: era un ReferenceError en
     pleno render, y React responde desmontando el árbol ENTERO. El piloto pulsa
     SIGWX y se queda con la pantalla en blanco — la app entera, no la pestaña.

     El index los exporta ahora como SKY_MONO / SKY_SANS / SKY_THEME / useSkyDay.
     Aquí se leen de `window` con respaldo literal, para que el módulo también
     sirva cargado suelto en un banco. El respaldo NO es la guarda que escondía
     el fallo: allí faltaba la exportación, aquí existe y el valor es el mismo. */
  var W = window;
  var mono = (typeof W.SKY_MONO === 'string' && W.SKY_MONO) || "'Space Mono','Courier New',monospace";
  var sans = (typeof W.SKY_SANS === 'string' && W.SKY_SANS) || "'Space Grotesk','Segoe UI',system-ui,sans-serif";
  /* Se resuelven UNA vez, al cargar el módulo, y no en cada render: `useSkyDay`
     es un hook y el número de hooks de un componente no puede cambiar entre
     renders. Con el índice ya ejecutado (este script va con `defer`) siempre
     están; si faltaran, faltarían siempre. */
  var SKY_DAY   = (typeof W.useSkyDay === 'function') ? W.useSkyDay : null;
  var SKY_THEME = (typeof W.SKY_THEME === 'function') ? W.SKY_THEME : null;

  /* Paleta por capa. Los colores siguen el criterio de la carta: rojo lo
     convectivo, ámbar la turbulencia, cian el hielo, verde el chorro. */
  /* `col` es el tono de NOCHE y `dcol` el de DÍA, y son dos colores distintos por
     obligación, no por gusto: los de noche son neones pensados para fondo negro y
     sobre la carta clara desaparecen. Medido sobre el mar y la tierra de día, con
     el código anterior (un solo color para los dos temas):

        capa     sobre mar   sobre tierra
        JET        1,14         1,22        ← el chorro, invisible
        TURB       1,16         1,61
        ICING      1,21         1,68
        TROP       1,47         2,03
        CB         2,16         2,98

     Ninguna llegaba a 3:1. No es «se ve flojo»: es que el dato del SIGWX —lo
     único que esta pantalla existe para enseñar— no estaba en la pantalla. Es la
     familia del avión inventado y de la luna de las pernoctas: la app afirmando
     algo que el piloto no puede ver. Con `dcol` el peor caso es 4,10:1. */
  var LAY = {
    CB:    { name: 'CUMULONIMBUS', col: '#ff4d6d', dcol: '#BE123C', lbl: 'CB',    kind: 'area' },
    TURB:  { name: 'TURBULENCIA',  col: '#FFB800', dcol: '#92400E', lbl: 'TURB',  kind: 'area' },
    ICING: { name: 'ENGELAMIENTO', col: '#22D3EE', dcol: '#0C5D74', lbl: 'ICING', kind: 'area' },
    JET:   { name: 'CORRIENTE EN CHORRO', col: '#4dff91', dcol: '#065F46', lbl: 'JET', kind: 'jet' },
    TROP:  { name: 'TROPOPAUSA',   col: '#8ab4d8', dcol: '#3B5F8A', lbl: 'TROP',  kind: 'line' },
    VOLC:  { name: 'VOLCÁN EN ERUPCIÓN', col: '#FF6B1A', dcol: '#9A3412', lbl: 'VOLC', kind: 'pt' },
    TC:    { name: 'CICLÓN TROPICAL',    col: '#FF6B1A', dcol: '#9A3412', lbl: 'TC',   kind: 'pt' }
  };
  var ORDER = ['ICING', 'TURB', 'CB', 'JET', 'TROP', 'VOLC', 'TC'];
  var HOURS = [12, 15, 18, 24, 30, 36];

  /* Frentes: color y símbolo estándar. El SIGWX de alto nivel NO los trae —
     son análisis de superficie, otro producto (ver /api/wx/fronts). */
  var FRONT = {
    COLD:  { col: '#3b82f6', dcol: '#1D4ED8', name: 'FRENTE FRÍO',         sym: 'tri' },
    WARM:  { col: '#ef4444', dcol: '#B91C1C', name: 'FRENTE CÁLIDO',       sym: 'semi' },
    OCFNT: { col: '#a855f7', dcol: '#7E22CE', name: 'FRENTE OCLUIDO',      sym: 'alt' },
    STNRY: { col: '#94a3b8', dcol: '#475569', name: 'FRENTE ESTACIONARIO', sym: 'stat' },
    TROF:  { col: '#f59e0b', dcol: '#92400E', name: 'VAGUADA',             sym: null }
  };

  var SEV = { severe: 'SEVERA', moderate: 'MODERADA' };
  var EXT = { OCNL: 'OCASIONAL', FRQ: 'FRECUENTE', ISOL: 'AISLADO' };

  /* ── Iconos de las pestañas de MAPAS ──
     Los emoji traen su propio color y sobre el fondo oscuro de noche se pierden
     (🗺 y ⛰ son gris marengo). Estos SVG usan currentColor, así que heredan el
     color de la pestaña y se ven igual de bien en día y en noche. */
  window.MAP_TAB_ICONS = {
    perfil:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 5-7 4 4"/><path d="M3 21h18"/></svg>',
    surface: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/></svg>',
    radar:   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13a5 5 0 016-4.9A6 6 0 0119 10a3.5 3.5 0 01-.5 7H7a4 4 0 01-1-7.9z"/><path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2"/></svg>',
    wind:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a3 3 0 10-3-3"/><path d="M3 13h15a3 3 0 11-3 3"/><path d="M3 18h8"/></svg>',
    sigwx:   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16a4 4 0 011-7.9A5 5 0 0115 7a4 4 0 011 8"/><path d="M9 20l2-4M14 20l2-4"/><path d="M12 12l-2 3h4l-2 3"/></svg>',
    turb:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/><path d="M3 15c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/></svg>'
  };

  /* giro del botón de actualizar (el index tiene muchas keyframes; se añade la
     propia para no depender del nombre que use otro módulo) */
  try {
    if (!document.getElementById('sigwx-css')) {
      var st = document.createElement('style');
      st.id = 'sigwx-css';
      st.textContent = '@keyframes pilotosSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
  } catch (e) {}

  /* ── nivel: lo que dice la carta, sin adornos ── */
  function flNum(v) { var n = parseInt(v, 10); return isFinite(n) ? n : null; }
  function bandTxt(p, key) {
    var top = flNum(p.top), base = flNum(p.base);
    if (key === 'CB') return top ? 'TOPE FL' + top : 'TOPE no especificado';
    if (top == null && base == null) return 'niveles no especificados';
    return (base == null ? 'XXX' : 'FL' + base) + ' – ' + (top == null ? 'XXX' : 'FL' + top);
  }
  /* ¿corta mi nivel de crucero? El CB se cuenta desde abajo hasta su tope (no
     trae base); en TURB/ICING una base "XXX" significa que baja por debajo de
     lo representado, así que se trata como sin suelo. */
  function affects(p, key, fl) {
    var top = flNum(p.top), base = flNum(p.base);
    if (key === 'CB') return top == null || fl <= top + 10;
    if (top == null) return true;
    return fl <= top + 10 && fl >= (base == null ? 0 : base - 10);
  }

  /* ══ proyección Mercator ══ */
  function my(lat) { var p = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return Math.log(Math.tan(Math.PI / 4 + p / 2)) * 180 / Math.PI; }
  function unmy(y) { var p = y * Math.PI / 180;
    return (2 * Math.atan(Math.exp(p)) - Math.PI / 2) * 180 / Math.PI; }

  /* ═══════════════════════════════════════════════════════════════════════
     LECTOR DE COORDENADAS PEGADAS
     Ya NO hay interfaz para pegarlas: el piloto no tiene las coordenadas, para
     eso está adjuntar el OFP. Se mantiene el lector porque está probado
     (scripts/route-parse-test.js) y lo reutiliza cualquier importación futura.
     Acepta lo que de verdad sale de un navlog o de una hoja de cálculo:
       N4130.2 E00204.5      grados + minutos decimales (formato OFP)
       4130N 00204E          estilo ARINC
       41 30.2 N  002 04.5 E
       41.297 2.078          decimal, LATITUD PRIMERO (como el navlog)
       [[lon,lat], ...]      JSON, longitud primero (como GeoJSON)
     Devuelve [[lon,lat], ...] — el orden interno del mapa.
     ═══════════════════════════════════════════════════════════════════════ */
    function parseRoutePoints(txt) {
    var s = String(txt || '').trim();
    if (!s) return [];

    if (s[0] === '[') {
      try {
        var j = JSON.parse(s);
        if (Array.isArray(j)) {
          return j.map(function (p) {
            if (Array.isArray(p)) return [+p[0], +p[1]];
            if (p && p.lon != null) return [+p.lon, +p.lat];
            return null;
          }).filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); });
        }
      } catch (e) { /* no era JSON */ }
    }

    /* Descompone un número "empaquetado" (4117.8 / 00204.6 / 5128).
       degDigits = cuántos dígitos ocupa la parte de grados (2 lat, 3 lon).
       Si la parte entera no es más larga que eso, ya viene en grados decimales. */
    function packed(v, degDigits) {
      var t = String(v).replace(',', '.');
      var ent = t.split('.')[0];
      if (ent.length <= degDigits) return parseFloat(t);
      var deg = parseInt(ent.slice(0, ent.length - 2), 10);
      var dec = t.indexOf('.') >= 0 ? '.' + t.split('.')[1] : '';
      var min = parseFloat(ent.slice(-2) + dec);
      return deg + min / 60;
    }

    /* Una pasada, tres formas, por orden de preferencia:
         1) N41 17.8      hemisferio + grados + minutos separados
         2) N4117.8       hemisferio + dígitos pegados
         3) 4117.8N       dígitos + hemisferio detrás  */
    /* ★ La letra del hemisferio NO puede venir pegada a otra letra, y la de
       detrás no puede llevar letra después. Sin esta guarda, las columnas de un
       navlog envenenan la ruta: "GS440" se lee como S440 = 4°40'S, y "12NM" como
       12N. Se usa un grupo "carácter previo" en vez de lookbehind, que en Safari
       viejo de iPad no existe. */
    var re = /(^|[^A-Za-z])(?:([NSEW])\s*(\d{1,3})[°\s]+(\d{1,2}(?:[.,]\d+)?)['´]?|([NSEW])\s*(\d{2,7}(?:[.,]\d+)?)|(\d{2,7}(?:[.,]\d+)?)\s*([NSEW])(?![A-Za-z]))/gi;
    /* "N4117.8E00204.6" sin separador: el grupo de caracter previo se comio el
       digito, asi que la longitud quedaria fuera. Se separa antes de escanear.
       No rompe "4117N" (queda "4117 N", que la forma con hemisferio detras sigue
       casando) ni "12NM" (lo corta el lookahead de letra). */
    s = s.replace(/([\d.])([NSEW])/gi, '$1 $2');

    var lats = [], lons = [], m;
    while ((m = re.exec(s))) {
      var hemi, val, sep = null;
      if (m[2]) { hemi = m[2]; val = m[3]; sep = m[4]; }
      else if (m[5]) { hemi = m[5]; val = m[6]; }
      else { hemi = m[8]; val = m[7]; }
      if (!hemi) continue;
      hemi = hemi.toUpperCase();
      var esLat = (hemi === 'N' || hemi === 'S');
      var deg;
      if (sep != null) deg = parseInt(val, 10) + parseFloat(String(sep).replace(',', '.')) / 60;
      else deg = packed(val, esLat ? 2 : 3);
      if (!isFinite(deg)) continue;
      if (hemi === 'S' || hemi === 'W') deg = -deg;
      if (esLat) { if (Math.abs(deg) <= 90) lats.push(deg); }
      else { if (Math.abs(deg) <= 180) lons.push(deg); }
    }
    var out = [];
    if (lats.length && lats.length === lons.length) {
      for (var i = 0; i < lats.length; i++) out.push([lons[i], lats[i]]);
      return out;
    }

    /* Sin hemisferios: pares decimales, LATITUD primero (como el navlog) */
    var reD = /(-?\d{1,2}(?:[.,]\d+))\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+))/g;
    while ((m = reD.exec(s))) {
      var a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) out.push([b, a]);
    }
    return out;
  }

window.pilotosParseRoutePoints = parseRoutePoints;   // reutilizable (OFP, ARIA…)

  /* Nombres de los puntos. En un navlog cada renglón es un waypoint: su
     identificador y sus coordenadas. Se procesa línea a línea, y sólo se acepta
     el nombre si esa línea ha dado exactamente UN punto — así no se cuelga una
     etiqueta al waypoint equivocado. */
    function parseRouteWithNames(txt) {
    var lines = String(txt || '').split(/[\r\n]+/);
    var pts = [], names = [], any = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var p = parseRoutePoints(ln);
      if (p.length !== 1) { if (p.length > 1) return { pts: parseRoutePoints(txt), names: null }; continue; }
      /* El identificador es lo primero de la línea; si se busca en toda la línea
         se acaba cogiendo "GS440" o "FL360" de las columnas de la derecha. */
      var head = ln.split(/[NS]\s*\d|\d{2,7}\s*[NS]/)[0] || '';
      var m = head.match(/\b([A-Z]{2,5}\d{0,3})\b/);
      var nm = m ? m[1] : '';
      if (/^(N|S|E|W|FL|KT|NM|TAS|GS|IAS|ETO|ATO|ZFW|TOW|MACH|DIST|TRK|WIND|TEMP|SAT|ISA)$/.test(nm)) nm = '';
      pts.push(p[0]); names.push(nm); if (nm) any = true;
    }
    if (pts.length < 2) return { pts: parseRoutePoints(txt), names: null };
    return { pts: pts, names: any ? names : null };
  }

window.pilotosParseRoute = parseRouteWithNames;

  function haversineNm(a, b) {
    var R = Math.PI / 180, r = 3440.065;
    var dLa = (b[1] - a[1]) * R, dLo = (b[0] - a[0]) * R;
    var s1 = Math.sin(dLa / 2), s2 = Math.sin(dLo / 2);
    return 2 * r * Math.asin(Math.sqrt(s1 * s1 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * s2 * s2));
  }

  function greatCircle(a, b, n) {
    var out = [], R = Math.PI / 180;
    var la1 = a[1] * R, lo1 = a[0] * R, la2 = b[1] * R, lo2 = b[0] * R;
    var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((la2 - la1) / 2), 2) +
            Math.cos(la1) * Math.cos(la2) * Math.pow(Math.sin((lo2 - lo1) / 2), 2)));
    if (!d) return [a, b];
    for (var i = 0; i <= n; i++) {
      var f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
      var y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
      var z = A * Math.sin(la1) + B * Math.sin(la2);
      out.push([Math.atan2(y, x) / R, Math.atan2(z, Math.sqrt(x * x + y * y)) / R]);
    }
    return out;
  }

  /* LA BARRA DE SEVERIDAD. Cruza el asta por su punto medio, perpendicular, y
     va un 25 % más gruesa que el trazo: a 9 px sobre un área ya coloreada, una
     barra del mismo grosor se confunde con el propio asta y entonces «moderado»
     y «severo» se ven IGUAL — que es exactamente lo que no puede pasar, porque
     entre los dos hay una decisión operativa.

     La usa SÓLO el engelamiento: en la turbulencia la severidad se marca con un
     segundo galón encima, que es lo que dice la hoja. Quise unificar el gesto y
     estaba inventando. */
  function barra(ctx, x0, y0, x1, y1, r) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    var ux = dx / L, uy = dy / L;
    var mx = x0 + ux * L * 0.55, my = y0 + uy * L * 0.55;
    /* El semiancho lleva un MÍNIMO absoluto: proporcional a secas, a tamaño de
       leyenda (r=7) la barra aportaba 4 px de tinta —un 8 %— y «moderada» y
       «severa» se veían prácticamente iguales. Lo cazó el banco midiendo los
       píxeles de los dos dibujos, no mirándolos. */
    var b = Math.max(3.6, r * 0.58);
    var g = ctx.lineWidth;
    ctx.lineWidth = Math.max(1.8, g * 1.5);
    ctx.beginPath();
    ctx.moveTo(mx + uy * b, my - ux * b);
    ctx.lineTo(mx - uy * b, my + ux * b);
    ctx.stroke();
    ctx.lineWidth = g;
  }

  function dibujaSimbolo(ctx, x, y, key, sev, col, r) {
    r = r || 7;
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1.4, r * 0.22);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    if (key === 'TURB') {
      /* ★★ Segunda corrección del piloto, y esta vez el símbolo estaba mal
         ENTERO. No es un galón con asta: es una LÍNEA HORIZONTAL con un PICO
         en el medio —la línea sigue a los dos lados del pico— y la SEVERA
         lleva una V invertida ENCIMA del pico.

         Yo venía dibujando un chevron grande con una bandera, que no se parece
         a esto en nada. Dos rondas para llegar aquí, y las dos por lo mismo:
         estaba interpretando la hoja en vez de copiarla. Un símbolo de carta no
         se interpreta — el piloto lo tiene delante en el OFP y o es el mismo o
         le obliga a traducir. */
      var y0 = r * 0.32;                              // la línea de base
      ctx.beginPath();
      ctx.moveTo(-r, y0);
      ctx.lineTo(-r * 0.34, y0);
      ctx.lineTo(0, -r * 0.42);                       // el pico
      ctx.lineTo(r * 0.34, y0);
      ctx.lineTo(r, y0);
      ctx.stroke();
      if (sev) {
        /* la V invertida encima, apoyada sobre el pico */
        ctx.beginPath();
        ctx.moveTo(-r * 0.30, -r * 0.38);
        ctx.lineTo(0, -r * 0.95);
        ctx.lineTo(r * 0.30, -r * 0.38);
        ctx.stroke();
      }
    } else if (key === 'ICING') {
      /* Engelamiento: la copa sobre su asta.
           MODERADO → copa + asta
           SEVERO   → lo mismo con la BARRA CRUZADA en el asta */
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r * 0.62, Math.PI, 0, true);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.2); ctx.lineTo(0, r * 0.95); ctx.stroke();
      if (sev) barra(ctx, 0, -r * 0.2, 0, r * 0.95, r);
    } else if (key === 'CB') {
      /* El CB no tiene símbolo propio en el Model SN: su área se delimita
         con línea FESTONEADA (§4.1) y se rotula ISOL/OCNL/FRQ/EMBD. Lo que
         va dentro es la abreviatura, que es lo que dice la carta. */
      ctx.font = '700 ' + Math.round(r * 1.5) + 'px ' + sans;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CB', 0, 0);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else if (key === 'VOLC') {
      /* Erupción volcánica: el cono con el penacho. */
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.8); ctx.lineTo(-r * 0.3, -r * 0.2);
      ctx.lineTo(r * 0.3, -r * 0.2); ctx.lineTo(r, r * 0.8);
      ctx.closePath(); ctx.stroke();
      [[-r * 0.45, -r * 0.6], [0, -r * 0.9], [r * 0.45, -r * 0.6]].forEach(function (q) {
        ctx.beginPath(); ctx.arc(q[0], q[1], r * 0.15, 0, 7); ctx.fill();
      });
    } else if (key === 'JET') {
      /* Eje del chorro: la flecha con su banderola de 50 kt (§4.3). */
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.35); ctx.lineTo(r * 0.75, -r * 0.35); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.75, -r * 0.35); ctx.lineTo(r * 0.15, -r * 0.3);
      ctx.lineTo(r * 0.5, r * 0.12); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, r * 0.05); ctx.lineTo(-r * 0.15, -r * 0.75);
      ctx.lineTo(r * 0.15, -r * 0.2); ctx.closePath(); ctx.fill();
    } else if (key === 'TROP') {
      /* Tropopausa: el nivel dentro de su rectángulo, que es como va en la
         carta («flight levels inside small rectangles», §4.1). */
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.strokeRect(-r * 0.95, -r * 0.5, r * 1.9, r);
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0); ctx.stroke();
    } else if (key === 'TC') {
      /* Ciclón tropical: el «6» de la hoja — el bucle abajo y el gancho
         subiendo a la derecha. (Antes eran dos espirales enfrentadas: otra
         interpretación mía que no está en la tabla.) */
      ctx.beginPath();
      ctx.arc(0, r * 0.42, r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.42);
      ctx.bezierCurveTo(-r * 0.55, -r * 0.55, r * 0.1, -r * 1.0, r * 0.55, -r * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }
  window.SIGWX_SIMBOLO = dibujaSimbolo;   // la leyenda lo usa fuera del lienzo

  /* ══════════════════════════════════════════════════════════════════════
     Componente
     ══════════════════════════════════════════════════════════════════════ */
  window.MapSigwx = function MapSigwx(props) {
    var leg = (props && props.leg) || {};
    var R = window.React;
    var h = R.createElement;
    var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef;

    var _d = useState(null),        data = _d[0],     setData = _d[1];
    var _e = useState(null),        err = _e[0],      setErr = _e[1];
    var _h = useState(12),          hour = _h[0],     setHour = _h[1];
    var _o = useState({ ICING: true, TURB: true, CB: true, JET: true, TROP: true, VOLC: true, TC: true }),
        on = _o[0], setOn = _o[1];
    var _f = useState(true),        flOnly = _f[0],   setFlOnly = _f[1];
    var _s = useState(null),        sel = _s[0],      setSel = _s[1];
    var _r = useState(null),        route = _r[0],    setRoute = _r[1];
    var _n = useState(0),           nonce = _n[0],    setNonce = _n[1];   // fuerza recarga
    var _of = useState(null),       ofp = _of[0],     setOfp = _of[1];   // cabecera del OFP leido
    var _ob = useState(false),      ofpBusy = _ob[0], setOfpBusy = _ob[1];
    var _fr = useState(null),       fronts = _fr[0],  setFronts = _fr[1];
    var _sc = useState(null),       chart = _sc[0],   setChart = _sc[1];
    /* ALTO = SIGWX de crucero (FL250–630): chorro, CB, turbulencia, hielo,
       tropopausa. BAJO = superficie: frentes y centros de presión. Están
       separados porque son productos distintos y porque un frente no dice nada
       a FL360: mezclarlos es lo que hace ilegible una carta. */
    var _bd = useState('high'),     band = _bd[0],    setBand = _bd[1];
    /* ── LA CARTA MANDA (Beta.771) ────────────────────────────────────────
       «Lo importante aquí es el mapa, por lo tanto tiene que ocupar el máximo
       posible» (7-sep-2026). El mapa tenía la altura CABLEADA a 290 px y se
       quedaba en el 46 % de un iPhone 14 Pro; los mandos —banda, horas, capas,
       sello— vivían en la columna, encima y debajo. Ahora la carta ocupa todo
       lo que queda y los mandos flotan DENTRO, en cristal.

       Es el mismo pecado que el `top:74px` del modo inspección: un número fijo
       donde tenía que haber «lo que quede». */
    var _fu = useState(false),      full = _fu[0],    setFull = _fu[1];
    var _ho = useState(false),      hrsAb = _ho[0],   setHrsAb = _ho[1];
    var _al = useState(290),        alto = _al[0],    setAlto = _al[1];
    var frOn = band === 'low';

    /* Día/noche con los tokens de SkyView (SKY_THEME + useSkyDay), no con una
       paleta propia: si no, en modo día el panel queda plano e ilegible.
       Con respaldo por si el módulo se carga suelto (banco de pruebas). */
    var day = SKY_DAY ? SKY_DAY()
            : document.documentElement.classList.contains("day");
    var T = SKY_THEME ? SKY_THEME(day) : (day ? {
      tx1: '#0C1B33', tx2: '#3C4F6B', tx3: '#5C6E8C', cyan: '#0891B2', red: '#E11D48',
      amb: '#C2710C', grn: '#059669', line: 'rgba(20,65,130,.13)', line2: 'rgba(20,65,130,.20)', surf1: '#FFFFFF'
    } : {
      tx1: '#EDF4FF', tx2: '#9DB2D6', tx3: '#62769C', cyan: '#46E3F2', red: '#FF3F62',
      amb: '#FFB020', grn: '#2BE5A0', line: 'rgba(120,190,255,.12)', line2: 'rgba(120,190,255,.22)', surf1: '#0E1828'
    });

    /* ★ UN SOLO resolutor de color por capa, y lo llaman las DOS mitades: el
       lienzo y los chips del DOM. Escribir `LAY[k].col` en un sitio y `LC(k)` en
       otro sería `ES_AIRPORTS` / `ES_IATA` dentro del mismo fichero — la leyenda
       diciendo un color y el mapa pintando otro. */
    function LC(k) { var e = LAY[k];   return (day && e && e.dcol) || (e && e.col); }
    function FC(k) { var e = FRONT[k]; return (day && e && e.dcol) || (e && e.col); }

    /* El acento. `T.cyan` de día es #0891B2 y sobre blanco da **3,68:1**: vale
       para un icono, no para los rótulos de 7-9 px que lleva este módulo (el
       sello del ciclo, la banda activa, el FILTRADO, la hora elegida). Se baja
       un escalón al cian oscuro que la app ya usa en día — 5,4:1 — y el token de
       SkyView se queda como está: cambiarlo movería las seis pestañas de MAPAS
       y las de WX y NOTAM, que no es lo que se ha pedido. */
    var ACC = day ? '#0E7490' : T.cyan;
    /* Y el ámbar de los avisos, por lo mismo: #C2710C a 7 px da 3,68:1. */
    var AMB = day ? '#92400E' : T.amb;
    /* La ruta con puntos va NARANJA, como en la carta de ruta del iPad. En día
       el naranja de noche sobre la carta clara da 2,1:1, así que baja a #C2410C
       — 3,75:1 sobre el mar, y encima lleva su halo blanco debajo.

       ⚠ El naranja va LITERAL, no `C.orange`: `C` es la paleta de SkyView y vive
       dentro de su IIFE, así que aquí es `undefined`. Es `mono` y `sans` otra
       vez —quinta— y estaba ya puesta como bomba dormida: el código anterior
       leía `C.orange` en la rama de la traza ADS-B, o sea que la carta habría
       reventado el día que un piloto tuviera su vuelo en el aire. No saltaba
       porque esa rama casi nunca corre. Lo destapó este cambio al leerlo en el
       render, y lo caza el banco midiendo los DOS temas. */
    var RUTA = day ? '#C2410C' : '#FF6B1A';
    /* Lo SELECCIONADO. Un tinte del 8 % sobre blanco se distingue por un matiz,
       no por contraste: «¿cuál está puesto?» era una pregunta legítima mirando
       la pantalla. De día pasa a relleno SÓLIDO con texto blanco (5,36:1). De
       noche se queda el tinte, que ahí sí funciona sobre fondo oscuro. */
    var SEL_BG = day ? '#0E7490' : 'rgba(126,251,254,.13)';
    var SEL_TX = day ? '#FFFFFF' : T.cyan;

    /* El SUELO de la carta lo pone `window.ATLAS_DIA`, la MISMA tabla que pinta
       el mapa del logbook (index.html, justo encima de `LDM`). No es reutilizar
       por ahorrar: este módulo empezó con suelo propio —mar `#bcd7ee`, tierra
       crema— y el piloto lo devolvió dos veces, «muy plano» y «el crema es muy
       feo», mientras el del logbook llevaba meses gustando. Copiar los valores a
       mano habría sido `ES_AIRPORTS` / `ES_IATA`: dos mapas de la misma app
       pintando el mismo mundo de dos formas.

       El respaldo literal es el mismo atlas, para que el módulo también sirva
       cargado suelto en un banco; no es una segunda paleta.

       ⚠ La NOCHE es SUYA y no sale de la tabla: `#00081c` con tierra `#0c2447`
       es la que el piloto pidió no tocar («la de noche está muy guapa»), y la
       del logbook es otra. Se comparte el problema que estaba resuelto en un
       sitio y roto en el otro, no la pantalla entera. */
    var ATL = (typeof W !== 'undefined' && W.ATLAS_DIA) || {
      mar:    [[0, '#A7C8E2'], [.5, '#C2DCEF'], [1, '#9FC1DC']],
      tierra: [[0, 'rgba(244,247,238,.97)'], [.55, 'rgba(233,238,225,.97)'], [1, 'rgba(222,229,212,.97)']],
      costa:  'rgba(30,64,124,.30)',
      malla:  'rgba(30,64,124,.10)'
    };
    var SUELO = day
      ? { mar: ATL.mar, tierra: ATL.tierra, costa: ATL.costa, malla: ATL.malla,
          borde: 'rgba(30,64,124,.34)', caja: 'rgba(255,255,255,.92)', anchoCosta: 0.8 }
      : { mar: '#00081c', tierra: '#0c2447', costa: 'rgba(126,251,254,.22)',
          malla: 'rgba(126,251,254,.06)', borde: T.line, caja: 'rgba(0,10,32,.82)', anchoCosta: 0.9 };

    /* ══ RELIEVE ══ (Beta.769)
       «Quiero que añadas un color más oscuro parecido a la foto, que marque la
       geografía del terreno» (7-sep-2026, con la carta del iPad al lado). En la
       carta del OFP la tierra es casi blanca y encima lleva un lavado OCRE que
       sube con la altitud: los Pirineos, la Meseta, Sierra Nevada y el Atlas se
       leen de un vistazo. Sin él la tierra es una silueta plana.

       El dato es altitud DE VERDAD (`public/js/relieve.js`, teselas terrarium
       de AWS Terrain Tiles: SRTM/3DEP/GMTED). Un sombreado dibujado a ojo sería
       el avión inventado otra vez — y con una carta encima es peor, porque el
       piloto la lee como terreno.

       Se pinta RECORTADO A LA TIERRA: la rejilla es de 0,25° y su borde no
       coincide con la costa, así que sin recorte el ocre se metería en el mar.

       El lienzo se construye en (lon, my(lat)), que es exactamente el espacio
       en el que `P()` es afín, así que va a pantalla con UN `drawImage` en vez
       de con 220 tiras. Se cachea por tema: rehacerlo por frame serían 83.600
       píxeles de trabajo para dejarlo donde ya estaba. */
    var RAMPA_DIA = [
      null,                       /* 0 · mar o llanura: no se pinta nada */
      'rgba(226,214,180,.30)', 'rgba(223,207,166,.42)', 'rgba(219,199,152,.52)',
      'rgba(214,190,138,.60)', 'rgba(208,180,124,.67)', 'rgba(201,169,111,.73)',
      'rgba(193,157,99,.78)',  'rgba(184,145,88,.82)',  'rgba(174,132,78,.85)',
      'rgba(163,119,69,.88)',  'rgba(151,106,61,.90)',  'rgba(139,94,54,.92)',
      'rgba(127,83,48,.93)',   'rgba(115,73,43,.94)',   'rgba(104,64,38,.95)'
    ];
    /* De noche el suelo es `#0c2447` y el ocre no pinta nada ahí: el relieve
       sube en CLARO. Y sube POCO a propósito —tope .36 de alfa—: la carta de
       noche es la que el piloto pidió no tocar («la de noche está muy guapa») y
       encima van las capas SIGWX en neón. Un relieve tan claro como el dato
       compite con el dato, que es lo único que esta pantalla existe para
       enseñar. El suelo sitúa; no puede gritar. */
    var RAMPA_NOCHE = [
      null,
      'rgba(74,120,170,.07)', 'rgba(78,125,175,.09)', 'rgba(83,130,180,.11)',
      'rgba(88,136,185,.13)', 'rgba(94,142,190,.15)', 'rgba(100,148,195,.17)',
      'rgba(106,154,200,.19)', 'rgba(113,161,205,.21)', 'rgba(120,168,210,.24)',
      'rgba(127,175,214,.26)', 'rgba(135,182,218,.28)', 'rgba(143,189,222,.30)',
      'rgba(151,196,226,.32)', 'rgba(159,203,230,.34)', 'rgba(167,210,234,.36)'
    ];

    /* ══ COSTAS · volver a coser lo que el antimeridiano partió ══
       Trece de los 133 anillos de `COSTAS_MUNDO` son TIRAS ABIERTAS: la masa
       Afro-Euroasiática viene en dos trozos porque el recorte del antimeridiano
       la cortó, y lo mismo América. Eso deja dos cicatrices, y las dos las vio
       el piloto como «una línea en el medio del mapa que corta»:

       · el CONTORNO, si se cierra el trazado: una recta de Mauritania
         (-16,3 · 19,1) hasta lon 180, cruzando el mapa entero;
       · el RELLENO, aunque no se cierre: las cuerdas implícitas de los dos
         trozos no coinciden, y entre ellas queda una cuña sin pintar por la
         que se veía el mar sobre Asia.

       Cosiendo A con B cuando el final de A ES el principio de B, la cuerda de
       cierre pasa a correr POR el antimeridiano —donde no se ve— y las dos
       desaparecen. Desaparecían al hacer zoom porque a partir de cierto
       encuadre se cambia a `LDM.LANDS`, que sólo cubre EUR/MED y no lleva el
       corte: no era el zoom, era la otra tabla.

       Se hace una vez y se guarda: son 133 anillos y el mapa repinta a 60 Hz. */
    /* ⚠ LA COSTURA VIVE EN `coastline.js`, con el dato. Nació aquí y el mapa del
       logbook, al pasar a ser mundial, necesitaba exactamente la misma: copiarla
       habría sido ES_AIRPORTS / ES_IATA con una función. Esto ya dependía de
       `window.COSTAS_MUNDO`, así que no añade dependencia — la hace explícita. Y
       si algún día falta, se DICE en consola en vez de devolver la tierra sin
       coser y dejar que la raya vuelva en silencio. */
    var _avisado = false;
    function costasUnidas(land) {
      var f = (typeof W !== 'undefined' && W.pilotosCostasUnidas) ||
              (typeof window !== 'undefined' && window.pilotosCostasUnidas);
      if (typeof f === 'function') return f(land);
      if (!_avisado) { _avisado = true;
        try { console.warn('[sigwx] falta js/coastline.js → costas sin coser: vuelve la raya del antimeridiano'); } catch (e) {} }
      return land;
    }

    var _relCache = {};
    function relieveCapas(esDia) {
      var R = (typeof W !== 'undefined' && W.RELIEVE) || (typeof RELIEVE !== 'undefined' ? RELIEVE : null);
      if (!R || !R.capas || typeof document === 'undefined') return null;
      var clave = esDia ? 'd' : 'n';
      if (_relCache[clave] !== undefined) return _relCache[clave];
      try {
        /* la rampa se descompone UNA vez: hacerlo por píxel serían cientos de
           miles de expresiones regulares para pintar un fondo. */
        var rampa = (esDia ? RAMPA_DIA : RAMPA_NOCHE).map(function (c) {
          var m = c && /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(c);
          return m ? [+m[1], +m[2], +m[3], Math.round(+m[4] * 255)] : null;
        });
        _relCache[clave] = R.capas.map(function (g) { return lienzoDe(g, rampa); }).filter(Boolean);
      } catch (e) { _relCache[clave] = null; }
      return _relCache[clave];
    }
    function lienzoDe(g, rampa) {
      var niv = g.niveles();
      var yTop = my(g.LA1), yBot = my(g.LA0);
      var MW = g.GW;
      var MH = Math.round(MW * (yTop - yBot) / (g.LO1 - g.LO0));
      if (!(MW > 0 && MH > 0)) return null;
      /* El borde de la ventana fina se DIFUMINA. Sin esto queda una costura
         recta —se veía cruzando el Sáhara y por Arabia— entre el trozo con
         detalle y el del mundo, y una recta en un mapa se lee como un dato.
         La del mundo da la vuelta entera y no tiene borde que difuminar. */
      var pluma = (g.LO1 - g.LO0) > 359 ? 0 : 10;
      var cv = document.createElement('canvas');
      cv.width = MW; cv.height = MH;
      var ctx2 = cv.getContext('2d');
      var img = ctx2.createImageData(MW, MH), px = img.data;
      /* se recorren las filas del LIENZO —que es Mercator— y para cada una se
         busca su celda de la rejilla, que es lineal en latitud. Al revés
         quedarían huecos por redondeo cerca del polo. */
      for (var j = 0; j < MH; j++) {
        var lat = unmy(yTop - (j + 0.5) * (yTop - yBot) / MH);
        var gy = Math.floor((g.LA1 - lat) / g.PASO);
        if (gy < 0) gy = 0; if (gy >= g.GH) gy = g.GH - 1;
        for (var i2 = 0; i2 < MW; i2++) {
          var c = rampa[niv[gy * g.GW + i2]];
          if (!c) continue;
          var f = 1;
          if (pluma) {
            var dx = Math.min(i2, MW - 1 - i2), dy = Math.min(j, MH - 1 - j);
            f = Math.min(1, Math.min(dx, dy) / pluma);
            if (f <= 0) continue;
          }
          var o = (j * MW + i2) * 4;
          px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = Math.round(c[3] * f);
        }
      }
      ctx2.putImageData(img, 0, 0);
      return { cv: cv, LO0: g.LO0, LO1: g.LO1, LA0: g.LA0, LA1: g.LA1 };
    }

    /* mar y tierra pueden venir como lista de paradas (degradado vertical, que
       es lo que da profundidad al atlas) o como color plano. */
    function pinta(ctx, v, H) {
      if (!v) return null;
      if (typeof v === 'string') return v;
      var g = ctx.createLinearGradient(0, 0, 0, H);
      v.forEach(function (p) { g.addColorStop(p[0], p[1]); });
      return g;
    }

    var wrapRef = useRef(null);
    /* la cámara la ha movido el piloto: entonces un cambio de tamaño NO puede
       re-encuadrar por su cuenta y tirarle el zoom que acaba de hacer */
    var camTocada = useRef(false);
    var ptrs = useRef({});          // punteros vivos, para la pinza
    var pinza = useRef(null);
    var ultTap = useRef(0);
    var cvRef = useRef(null);
    var camRef = useRef({ lon: 0, lat: 45, z: 1, sc: 1, W: 0, HH: 0 });
    var legRef = useRef(null);

    /* ★ Al cambiar de leg en el selector de arriba hay que soltarlo TODO: la
       ruta (incluida una pegada a mano, que si no se quedaría pegada al leg
       anterior), la selección y el encuadre. Si no, el mapa sigue mostrando el
       vuelo que ya no estás mirando — y eso es justo un dato incorrecto. */
    var legKey = (leg.flight || '') + '|' + (leg.dep || '') + '|' + (leg.arr || '') + '|' + (leg.std || '');
    if (legRef.current !== null && legRef.current !== legKey) {
      legRef.current = legKey;
      if (route) setRoute(null);
      if (sel) setSel(null);
      camRef.current.z = 1;            // vuelve a encuadrar sobre el leg nuevo
    } else if (legRef.current === null) {
      legRef.current = legKey;
    }

    var CRUISE = leg.cruiseFL || 360;
    var depC = apCoord(leg.dep), arrC = apCoord(leg.arr);

    /* Coordenadas del aeropuerto: se tira de lo que ya hay en la app (el mapa
       del logbook trae una tabla amplia) y, si no está, de ROUTE_COORDS. */
    function apCoord(iata) {
      var c = String(iata || '').toUpperCase();
      if (!c) return null;
      /* IATA y ICAO conviven en la misma tabla del roster, así que se prueban
         las dos y el puente entre ellas. Mirar sólo `LDM.AP` (que es IATA) deja
         sin coordenadas a todo leg que venga en ICAO — y sin coordenadas no hay
         puntos, sin puntos `fit()` se sale, y el mapa abre sobre el mundo. */
      try {
        if (window.LDM && LDM.AP && LDM.AP[c]) return LDM.AP[c];
        var icao = (window.IATA_TO_ICAO && window.IATA_TO_ICAO[c]) || c;
        var t = window.LD_AIRPORTS && window.LD_AIRPORTS[icao];
        if (t) return Array.isArray(t) ? t : [t.lon, t.lat];
        if (window.LDM && LDM.AP) {
          for (var k in LDM.AP) {
            if (((window.IATA_TO_ICAO && window.IATA_TO_ICAO[k]) || '') === c) return LDM.AP[k];
          }
        }
      } catch (e) {}
      try {
        var k = (leg.dep || '') + '-' + (leg.arr || '');
        var rc = window.ROUTE_COORDS && ROUTE_COORDS[k];
        if (rc && rc.length) {
          var p = iata === leg.dep ? rc[0] : rc[rc.length - 1];
          return [p[1], p[0]];                 // ROUTE_COORDS va [lat,lon]
        }
      } catch (e) {}
      return null;
    }

    /* ── 1 · SIGWX ── */
    useEffect(function () {
      var dead = false;
      setErr(null); setData(null); setSel(null);
      var bb = bboxOfRoute();
      var url = ldBackendUrl() + '/api/wx/sigwx?hour=' + hour +
                (bb ? '&bbox=' + bb.join(',') : '') + (nonce ? '&fresh=1' : '');
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        if (dead) return;
        if (j && j.error) throw new Error(j.error);
        setData(j);
      }).catch(function (e) {
        if (!dead) setErr(e.message || 'sin conexión');
      });
      return function () { dead = true; };
    }, [hour, leg.dep, leg.arr, nonce]);

    /* ── 1a · La hora que interesa es la DE TU VUELO ──
       Abrir siempre en +12h es arbitrario: el pronóstico útil es el de la hora
       a la que estarás volando. En cuanto se sabe el ciclo emisor se salta a la
       hora de pronóstico más cercana al STD del leg. Sólo mientras el piloto no
       haya tocado el selector: a partir de ahí manda él. */
    var hourTouched = useRef(false);
    useEffect(function () {
      if (!data || hourTouched.current || !leg.std) return;
      var hm = String(leg.std).replace(':', '').padStart(4, '0');
      var cyc = data.cycle || '';
      if (cyc.length < 11) return;
      var cycMs = Date.UTC(+cyc.slice(0, 4), +cyc.slice(4, 6) - 1, +cyc.slice(6, 8), +cyc.slice(9, 11));
      var want = cycMs;
      // el STD es hora del día: se busca el primer instante >= ciclo que cuadre
      var d0 = new Date(cycMs);
      want = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate(), +hm.slice(0, 2), +hm.slice(2));
      if (want < cycMs) want += 86400000;
      var best = HOURS[0], bd = Infinity;
      HOURS.forEach(function (H) {
        var d = Math.abs((cycMs + H * 3600000) - want);
        if (d < bd) { bd = d; best = H; }
      });
      if (best !== hour) setHour(best);
    }, [data && data.cycle, leg.std]);

    /* ── 1b · Frentes de superficie ──
       Van aparte del SIGWX porque son OTRO producto: el de alto nivel no lleva
       frentes. Se dibujan donde la fuente llega; donde no, se dice. */
    useEffect(function () {
      var dead = false;
      fetch(ldBackendUrl() + '/api/wx/fronts' + (nonce ? '?fresh=1' : ''))
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!dead && j && j.lines) setFronts(j); })
        .catch(function () {});
      return function () { dead = true; };
    }, [nonce]);

    /* ── 2 · Ruta ──
       Prioridad: base de rutas de la compañía → traza ADS-B real → gran círculo.
       La base manda porque es la ruta que de verdad se vuela y la ha puesto un
       piloto; el ADS-B sólo existe si el avión está en el aire ahora mismo. */
    useEffect(function () {
      var dead = false;
      // una ruta pegada a mano manda sobre cualquier búsqueda automática:
      // el piloto la ha puesto a propósito y un refresco no debe borrársela
      if (route && route.src === 'paste') return;
      setRoute(null);
      if (!leg.dep || !leg.arr) return;
      var base = ldBackendUrl();

      fetch(base + '/api/route/' + leg.dep + '/' + leg.arr)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (dead) return null;
          if (j && j.ok && j.pts && j.pts.length > 1) {
            setRoute({ pts: j.pts, names: j.names || null, src: 'db', label: 'BASE DE RUTAS', when: j.updatedAt });
            return null;
          }
          var cs = callsignOf(leg);
          if (!cs) return null;
          return fetch(base + '/api/route/callsign/' + cs + (nonce ? '?fresh=1' : ''))
                   .then(function (r) { return r.json(); });
        })
        .then(function (j) {
          if (dead || !j) return;
          if (j.ok && j.pts.length > 1) {
            setRoute({ pts: j.pts, src: 'adsb', label: 'TRAZA ADS-B',
                       reg: j.reg, type: j.type, samples: j.samples });
          }
        })
        .catch(function () {});
      return function () { dead = true; };
    }, [leg.dep, leg.arr, leg.flight, nonce]);

    /* Indicativo OACI a partir del número de vuelo del roster (VY1234 → VLG1234) */
    function callsignOf(l) {
      var f = String(l.flight || '').toUpperCase().replace(/\s/g, '');
      if (!f) return null;
      var m = f.match(/^([A-Z]{2,3})?(\d{1,4}[A-Z]?)$/);
      if (!m) return null;
      var pre = m[1] || 'VY';
      if (pre === 'VY') pre = 'VLG';
      return pre + m[2];
    }

    function routePts() {
      if (route && route.pts && route.pts.length > 1) return route.pts;
      if (depC && arrC) return greatCircle(depC, arrC, 48);
      return null;
    }
    function bboxOfRoute() {
      var p = (route && route.pts) || (depC && arrC ? [depC, arrC] : null);
      if (!p) return null;
      var lo = p.map(function (q) { return q[0]; }), la = p.map(function (q) { return q[1]; });
      return [Math.min.apply(null, lo).toFixed(1), Math.min.apply(null, la).toFixed(1),
              Math.max.apply(null, lo).toFixed(1), Math.max.apply(null, la).toFixed(1)];
    }

    /* ── pintado ── */
    function fit() {
      var cam = camRef.current, pts = routePts();
      if (!pts || !cam.W) return;
      var lo = pts.map(function (p) { return p[0]; }),
          la = pts.map(function (p) { return my(p[1]); });
      var w = Math.max.apply(null, lo) - Math.min.apply(null, lo),
          hh = Math.max.apply(null, la) - Math.min.apply(null, la);
      cam.lon = (Math.max.apply(null, lo) + Math.min.apply(null, lo)) / 2;
      cam.lat = unmy((Math.max.apply(null, la) + Math.min.apply(null, la)) / 2);
      cam.sc = 1;
      cam.z = Math.min(cam.W / (w + 16), cam.HH / (hh + 12));
    }

    function draw() {
      var cv = cvRef.current; if (!cv) return;
      var ctx = cv.getContext('2d'), cam = camRef.current;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = cv.getBoundingClientRect();
      if (!rect.width) return;
      /* ⚠ El lienzo se redimensiona mirando LAS DOS medidas, y con el MISMO
         redondeo en la comparación y en la asignación.
         Antes la guarda miraba sólo el ANCHO —`cv.width !== round(w*dpr)`— y
         asignaba sin redondear (`cv.width = w*dpr`, que trunca). De ahí salían
         los dos fallos, y el que se veía dependía del dispositivo:
           · a dpr 1 la parte decimal caía por encima de .5, así que truncado y
             redondeado NUNCA coincidían y el lienzo se rehacía en CADA frame
             (borrándolo entero para volver a pintarlo igual);
           · a dpr 2 —todo móvil y todo iPad— coincidían siempre, así que tras
             el primer dibujo el búfer se quedaba CONGELADO. Y el alto sí crece
             después: el módulo nace con `alto` 290 y `mide()` lo sube a lo que
             quede de pantalla. Resultado medido a 430×852: búfer 753×752 sobre
             una caja que pide 753×1365 — el mapa dibujado a la mitad de
             resolución vertical y ESTIRADO por el navegador al doble. Eso es
             «el mapa queda deformado».
         El alto cambia sin que cambie el ancho en todo lo que hace esta carta
         —volver a la pestaña, replegar, girar, entrar en inmersivo—, así que
         una guarda que sólo mira el ancho no se entera nunca. */
      var bufW = Math.round(rect.width * dpr), bufH = Math.round(rect.height * dpr);
      if (cv.width !== bufW || cv.height !== bufH) { cv.width = bufW; cv.height = bufH; }
      cam.W = rect.width; cam.HH = rect.height;
      /* Si el LIENZO ha cambiado de tamaño —crecer al ocupar la pantalla,
         girar el móvil, entrar en pantalla completa— hay que volver a
         encuadrar: `fit()` sólo corría con `cam.z === 1`, así que el piloto se
         quedaba con el encuadre del tamaño anterior. Pero sólo si NO ha tocado
         la cámara: re-encuadrar encima de su zoom sería peor que no hacerlo. */
      if (cam._W !== rect.width || cam._H !== rect.height) {
        cam._W = rect.width; cam._H = rect.height;
        if (!camTocada.current) cam.z = 1;
      }
      if (!cam.z || cam.z === 1) fit();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var W = cam.W, H = cam.HH;

      function P(lon, lat) {
        return [W / 2 + (lon - cam.lon) * cam.sc * cam.z,
                H / 2 - (my(lat) - my(cam.lat)) * cam.sc * cam.z];
      }
      /* El proyector, exportado para los bancos. `P` vive en el closure de
         `draw()` y se rehace en cada frame con la cámara vigente, así que un
         banco que quiera saber DÓNDE cae un punto del mundo en la pantalla no
         puede recalcularlo por su cuenta sin escribir una segunda proyección —
         que es el fallo `ES_AIRPORTS` / `ES_IATA` metido en un banco. Mismo
         criterio que `window.__ariaQaContext`.

         ⚠ Va a `window` y NO a `W`: dentro de `draw()` hay un `var W = cam.W`
         —el ancho— que TAPA el `W = window` del módulo, y asignarle una
         propiedad a un número es un no-op silencioso. El banco salía «no está
         exportado» con la línea puesta. */
      try { window.SIGWX_PROJ = P; } catch (e) {}

      function path(ring, close) {
        ctx.beginPath();
        for (var i = 0; i < ring.length; i++) {
          var q = P(ring[i][0], ring[i][1]);
          if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
        }
        if (close) ctx.closePath();
      }
      function boxBg() { return SUELO.caja; }

      /* ══ SÍMBOLOS DE LA CARTA · ICAO Anexo 3, «Model SN — Sheet of notations
         used in flight documentation», apartado 1 (Symbols for significant
         weather) ═══════════════════════════════════════════════════════════

         Estos son LOS del estándar, no unos parecidos. Antes había aquí una
         cuña y un gancho inventados por mí: se leían, pero no eran los que el
         piloto tiene en la carta del OFP, así que le obligaban a aprenderse una
         segunda simbología para la misma información. Una carta que usa sus
         propios símbolos no es una carta.

         Van DIBUJADOS con trazados y no escritos con un carácter — es la luna de
         las pernoctas: un glifo lo pinta la tipografía del móvil, no el código,
         y «no hay turbulencia» y «tu aparato no tiene ese símbolo» se ven igual.

         Todo se dibuja en una caja de −r..+r centrada en (0,0) y lo coloca el
         llamante. Un solo sitio: el mapa y la leyenda llaman a la MISMA función,
         porque una leyenda que dibuje su propia versión del símbolo es
         `ES_AIRPORTS` / `ES_IATA` con forma de icono. */
      function simbolo(x, y, key, sev, col, r) { dibujaSimbolo(ctx, x, y, key, sev, col, r); }

      /* Banderolas y plumas del viento máximo (§4.3). El asta se dibuja
         PERPENDICULAR al eje del chorro y las barbas salen de ella, que es como
         va en la carta. */
      /* ⚠ El TAMAÑO de estas barbas es la mitad del dato. «No se ve… hazlas
         mucho más grandes» (8-sep-2026, con una captura del chorro acercado):
         a 15 px de asta y banderolas de 6,5 la intensidad del viento estaba
         dibujada pero no se podía CONTAR, que es para lo único que sirve.
         Todo lo de aquí va al doble. Un símbolo que hay que adivinar es el 0
         mudo de las pernoctas — la luna en hueco, otra vez. */
      function plumas(x, y, ang, kt, col) {
        var v = Math.max(0, Math.round((+kt || 0) / 5) * 5);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.lineWidth = 2.4; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        var L = 30;                              // asta perpendicular, hacia -y
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L); ctx.stroke();
        var n50 = Math.floor(v / 50); v -= n50 * 50;
        var n10 = Math.floor(v / 10); v -= n10 * 10;
        var n5  = v >= 5 ? 1 : 0;
        var paso = 7.2, pos = -L;
        for (var i = 0; i < n50; i++) {          // banderola: triángulo relleno
          ctx.beginPath();
          ctx.moveTo(0, pos); ctx.lineTo(13, pos + 5.2); ctx.lineTo(0, pos + 10.4);
          ctx.closePath(); ctx.fill();
          pos += 11.6;
        }
        if (n50 && (n10 || n5)) pos += 3.2;
        for (var j = 0; j < n10; j++) {          // pluma entera
          ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(13, pos + 5.2); ctx.stroke();
          pos += paso;
        }
        if (n5) { ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(6.4, pos + 2.6); ctx.stroke(); }
        ctx.restore();
      }

      /* §4.3 «Arrows indicate direction». Dos cosas, y las dos hacen falta:
         · una flecha EN LA PUNTA, siempre — «en las puntas del jet hay siempre
           una flecha mostrando hacia dónde va el jetstream» (8-sep-2026). Es
           donde el piloto la busca;
         · y otras repartidas cada ~78 px por el eje, porque un chorro que cruza
           la pantalla tiene sus dos puntas fuera y se quedaría sin dirección
           —el mismo fallo que las áreas mudas—.
         Van al doble de tamaño que en Beta.773: a 9 px no se veían. */
      function punta(x, y, ux, uy, L, A) {
        if (!(x > -30 && x < W + 30 && y > -30 && y < H + 30)) return;
        ctx.beginPath();
        ctx.moveTo(x + ux * L, y + uy * L);
        ctx.lineTo(x - ux * L * 0.32 - uy * A, y - uy * L * 0.32 + ux * A);
        ctx.lineTo(x - ux * L * 0.32 + uy * A, y - uy * L * 0.32 - ux * A);
        ctx.closePath(); ctx.fill();
      }
      function flechasEje(ring, col, gordo) {
        var pr = ring.map(function (p) { return P(p[0], p[1]); });
        if (pr.length < 2) return;
        var PASO = 78, next = PASO * 0.5;
        var L = gordo ? 21 : 18, A = gordo ? 10.5 : 9;
        ctx.fillStyle = col;
        for (var i = 1; i < pr.length; i++) {
          var a = pr[i - 1], b = pr[i];
          var dx = b[0] - a[0], dy = b[1] - a[1], seg = Math.hypot(dx, dy);
          if (seg < 0.01) continue;
          var ux = dx / seg, uy = dy / seg, d = next;
          while (d <= seg) { punta(a[0] + ux * d, a[1] + uy * d, ux, uy, L, A); d += PASO; }
          next = d - seg;
        }
        /* LA PUNTA: el último vértice, con la dirección del último tramo que
           tenga longitud. Se dibuja aparte para que no dependa de dónde cayera
           el reparto de las intermedias. */
        var fin = pr[pr.length - 1], k = pr.length - 2;
        while (k >= 0 && Math.hypot(fin[0] - pr[k][0], fin[1] - pr[k][1]) < 0.5) k--;
        if (k >= 0) {
          var vx = fin[0] - pr[k][0], vy = fin[1] - pr[k][1], m = Math.hypot(vx, vy);
          punta(fin[0], fin[1], vx / m, vy / m, L * 1.25, A * 1.2);
        }
      }

      /* Línea FESTONEADA — «scalloped line = demarcation of areas of significant
         weather» (§4.1). Es como se delimita un área de CB en la carta de
         verdad, y por eso el contorno del CB deja de ser una línea lisa. */
      function festoneada(ring) {
        var pr = ring.map(function (p) { return P(p[0], p[1]); });
        var R = 3.4;                       // radio del festón, en píxeles
        ctx.beginPath();
        for (var i = 1; i < pr.length; i++) {
          var a = pr[i - 1], b = pr[i];
          var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
          if (L < 0.5) continue;
          var n = Math.max(1, Math.round(L / (R * 2)));
          var ux = dx / L, uy = dy / L;
          for (var k = 0; k < n; k++) {
            var x0 = a[0] + ux * (L * k / n), y0 = a[1] + uy * (L * k / n);
            var x1 = a[0] + ux * (L * (k + 1) / n), y1 = a[1] + uy * (L * (k + 1) / n);
            var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
            var rad = Math.hypot(x1 - x0, y1 - y0) / 2;
            var ang = Math.atan2(y1 - y0, x1 - x0);
            ctx.arc(mx, my, rad, ang + Math.PI, ang, true);   // festón hacia FUERA
          }
        }
        ctx.closePath();
      }

      /* ══ DÓNDE SE MARCA UN ÁREA ═══════════════════════════════════════════
         «Al pulsar con el mouse, la información de nubes desaparece. Vuelve de
         nuevo cuando haces zoom out» (8-sep-2026).

         No era el clic: el clic ACERCA —el doble toque hace zoom— y al
         acercarse pasaban las dos cosas a la vez:

         · el SÍMBOLO salía del centroide del anillo ENTERO, y se devolvía
           `null` en cuanto ese punto se iba del lienzo;
         · la ETIQUETA de niveles se dibujaba en el PRIMER VÉRTICE del anillo,
           que también se va fuera — y entonces el texto se pinta en un sitio
           que no existe, sin error ninguno.

         Con el área ocupando media pantalla los dos anclajes están fuera casi
         siempre: el área seguía dibujada pero **muda**, sin decir de qué es ni
         a qué niveles. Y volvía al alejar, que es exactamente como lo describió
         el piloto. Es el 0 mudo de las pernoctas, en la carta.

         Ahora las dos salen del centro de **lo que se ve**: el anillo se
         recorta contra el lienzo y se ancla ahí. Mientras se vea un trozo del
         área, su identidad se ve. */
      function recortaAlLienzo(pr, m) {
        var ix = function (a, b, x) { var t = (x - a[0]) / ((b[0] - a[0]) || 1e-9); return [x, a[1] + t * (b[1] - a[1])]; };
        var iy = function (a, b, y) { var t = (y - a[1]) / ((b[1] - a[1]) || 1e-9); return [a[0] + t * (b[0] - a[0]), y]; };
        function paso(pts, dentro, corta) {
          var out = [];
          for (var i = 0; i < pts.length; i++) {
            var a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
            var da = dentro(a), db = dentro(b);
            if (db) { if (!da) out.push(corta(a, b)); out.push(b); }
            else if (da) out.push(corta(a, b));
          }
          return out;
        }
        var r = pr;
        r = paso(r, function (q) { return q[0] >= m; },     function (a, b) { return ix(a, b, m); });     if (r.length < 3) return [];
        r = paso(r, function (q) { return q[0] <= W - m; }, function (a, b) { return ix(a, b, W - m); }); if (r.length < 3) return [];
        r = paso(r, function (q) { return q[1] >= m; },     function (a, b) { return iy(a, b, m); });     if (r.length < 3) return [];
        r = paso(r, function (q) { return q[1] <= H - m; }, function (a, b) { return iy(a, b, H - m); });
        return r.length < 3 ? [] : r;
      }
      /* {c:[x,y], w, h} del TROZO VISIBLE del área, o null si no se ve nada */
      function anclaVisible(ring) {
        var pr = ring.map(function (p) { return P(p[0], p[1]); });
        var v = recortaAlLienzo(pr, 16);
        if (!v.length) return null;
        var sx = 0, sy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (var i = 0; i < v.length; i++) {
          sx += v[i][0]; sy += v[i][1];
          if (v[i][0] < minx) minx = v[i][0]; if (v[i][0] > maxx) maxx = v[i][0];
          if (v[i][1] < miny) miny = v[i][1]; if (v[i][1] > maxy) maxy = v[i][1];
        }
        return { c: [sx / v.length, sy / v.length], w: maxx - minx, h: maxy - miny };
      }

      /* Rótulo EN CAJA, como la carta. El texto suelto sobre el relieve ocre
         de Beta.769 no se lee: el suelo ya tiene tinta y el dato tiene que
         seguir ganando. */
      var COLA = [];
      /* `px` opcional: el FL del chorro va GRANDE («y altitud», 8-sep-2026).
         A 8 px se perdía entre las barbas nuevas — y la altitud del núcleo es
         justo el dato que decide si el chorro te toca o no. */
      function rotulo(x, y, txt, col, px) { COLA.push([x, y, txt, col, px || 8]); }
      /* ⚠ Los rótulos se pintan TODOS AL FINAL, no donde se calculan. Cada capa
         dibuja encima de la anterior, así que el eje del chorro cruzaba por
         media caja de la turbulencia y el nivel dejaba de leerse. Las cajas van
         detrás de todo el dibujo — el dato tiene que ganar a la geometría. */
      function pintaRotulos() {
        for (var i = 0; i < COLA.length; i++) {
          var x = COLA[i][0], y = COLA[i][1], txt = String(COLA[i][2]), col = COLA[i][3];
          var px = COLA[i][4], alto = px + 5, pad = px > 9 ? 5 : 3;
          ctx.font = '700 ' + px + 'px ' + mono;
          var an = ctx.measureText(txt).width;
          var x0 = Math.max(2, Math.min(W - an - pad * 2 - 2, x - an / 2 - pad));
          var y0 = Math.max(2, Math.min(H - alto - 2, y - alto / 2));
          ctx.fillStyle = boxBg(); ctx.fillRect(x0, y0, an + pad * 2, alto);
          ctx.strokeStyle = col + 'bb'; ctx.lineWidth = px > 9 ? 1.4 : 1;
          ctx.strokeRect(x0, y0, an + pad * 2, alto);
          ctx.fillStyle = col; ctx.fillText(txt, x0 + pad, y0 + alto - Math.round(px * 0.3));
        }
        /* Lo PINTADO, para el banco. No es un contador de intenciones: se
           escribe aquí, en la pasada que de verdad dibuja, así que si un
           rótulo se queda por el camino tampoco aparece. Mismo criterio que
           `window.SIGWX_PROJ`. */
        try { window.SIGWX_ROTULOS = COLA.map(function (r) { return { t: String(r[2]), x: Math.round(r[0]), y: Math.round(r[1]) }; }); } catch (e) {}
        COLA.length = 0;
      }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = pinta(ctx, SUELO.mar, H); ctx.fillRect(0, 0, W, H);

      /* meridianos y paralelos */
      ctx.strokeStyle = SUELO.malla;
      ctx.lineWidth = 1;
      for (var g = -60; g <= 70; g += 10) { var a = P(g, 10), b = P(g, 80);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      for (var t = 10; t <= 80; t += 10) { var c = P(-70, t), d = P(80, t);
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); }

      /* ── costas ──
         `COSTAS_MUNDO` es Natural Earth 1:110m SIMPLIFICADO a una décima de
         grado: se hizo para una bola de 88 px que no se amplía, y a ese detalle
         las Baleares y las Canarias **no existen**. Medido: 0 puntos en las dos
         cajas. `LDM.LANDS` —el mapa del logbook— es 1:50m y sí las tiene (21 y
         42 puntos), pero sólo cubre EUR/MED.

         Así que se elige por ENCUADRE: si lo que se ve cabe dentro de la ventana
         de LANDS, se dibuja con ella; fuera, con la del mundo. No se mezclan las
         dos —dibujaría Europa dos veces a dos resoluciones— y no se copia
         ninguna: es el puente de `LDM.pt()`, que ya resuelve esto mismo. */
      var land = window.COSTAS_MUNDO, finas = false;
      try {
        var lm = window.LDM;
        if (lm && lm.LANDS && lm.LANDS.length) {
          var mitadX = (W / 2) / (cam.sc * cam.z), mitadY = (H / 2) / (cam.sc * cam.z);
          var loA = cam.lon - mitadX, loB = cam.lon + mitadX;
          var laA = unmy(my(cam.lat) - mitadY), laB = unmy(my(cam.lat) + mitadY);
          if (loA >= lm.L0 && loB <= lm.L1 && laA >= lm.A0 && laB <= lm.A1) {
            land = lm.LANDS; finas = true;
          }
        }
      } catch (e) {}
      /* ⚠ NO se cierra el trazado para el CONTORNO, y no es un descuido.
         Trece de los 133 anillos de `COSTAS_MUNDO` son TIRAS ABIERTAS: la masa
         Afro-Euroasiática viene partida en el antimeridiano, así que un trozo
         acaba en (180, 69) y el siguiente arranca en (-16.3, 19.1) —Mauritania—.
         Con `closePath()` el navegador une esos dos extremos y dibuja una recta
         que cruza el mapa entero de lado a lado: la «línea en el medio que
         corta». Desaparecía al hacer zoom porque a partir de cierto encuadre se
         cambia a `LDM.LANDS`, que sólo cubre EUR/MED y no tiene el corte.

         El RELLENO sí la necesita —y la tiene: `fill()` cierra cada subtrazado
         él solo—, así que la tierra se pinta igual de bien. Lo que se quita es
         únicamente el TRAZO de ese segmento inventado. */
      if (land) {
        land = costasUnidas(land);
        /* ⚠ El relleno va anillo por anillo, NO en un trazado único. Con todos
           dentro del mismo `fill()` manda la regla nonzero: los anillos que se
           solapan con sentidos de giro opuestos se CANCELAN y sale un hueco —se
           veía como una cuña clara cruzando Asia—. Sólo el RECORTE y el
           CONTORNO usan el trazado entero, y ninguno de los dos rellena. */
        if (SUELO.tierra) {
          ctx.fillStyle = pinta(ctx, SUELO.tierra, H);
          for (var i = 0; i < land.length; i++) { path(land[i], false); ctx.fill(); }
        }

        /* un solo trazado con todas las masas: recorta el relieve y luego se
           contornea sobre él mismo */
        ctx.beginPath();
        for (var i = 0; i < land.length; i++) {
          var ring = land[i];
          for (var j = 0; j < ring.length; j++) {
            var q = P(ring[j][0], ring[j][1]);
            if (j === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
          }
        }

        var caps = relieveCapas(day);
        if (caps && caps.length) {
          ctx.save();
          ctx.clip();                        /* el relieve NO se sale al mar */
          ctx.imageSmoothingEnabled = true;
          try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
          caps.forEach(function (c) {
            var a = P(c.LO0, c.LA1), b = P(c.LO1, c.LA0);
            if (b[0] <= 0 || a[0] >= W || b[1] <= 0 || a[1] >= H) return;
            ctx.drawImage(c.cv, a[0], a[1], b[0] - a[0], b[1] - a[1]);
          });
          ctx.restore();
        }

        ctx.strokeStyle = SUELO.costa;
        ctx.lineWidth = SUELO.anchoCosta;
        ctx.stroke();
      }

      /* ── frentes de superficie, con la simbología de la carta ──
         Triángulos al lado del avance en el frío, semicírculos en el cálido,
         alternados en el ocluido, y enfrentados en el estacionario. */
      if (frOn && fronts && fronts.lines) {
        fronts.lines.forEach(function (ln) {
          var F = FRONT[ln.kind]; if (!F) return;
          var scr = ln.pts.map(function (p) { return P(p[0], p[1]); });
          // fuera de pantalla: no gastar en símbolos
          if (scr.every(function (q) { return q[0] < -40 || q[0] > W + 40 || q[1] < -40 || q[1] > H + 40; })) return;
          ctx.beginPath();
          scr.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
          ctx.strokeStyle = FC(ln.kind); ctx.lineWidth = ln.kind === 'TROF' ? 1.6 : 2.4;
          ctx.setLineDash(ln.kind === 'TROF' ? [6, 4] : []);
          ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]);
          if (!F.sym) return;

          /* símbolos a intervalo constante recorriendo la polilínea entera.
             STNRY: triángulo y semicírculo a lados OPUESTOS (es lo que lo
             distingue). OCFNT: los dos al mismo lado, alternándose. */
          var STEP = 34, next = STEP * 0.6, flip = 0;
          for (var i = 1; i < scr.length; i++) {
            var a = scr[i - 1], b = scr[i];
            var dx = b[0] - a[0], dy = b[1] - a[1], seg = Math.hypot(dx, dy);
            if (seg < 0.01) continue;
            var ux = dx / seg, uy = dy / seg;
            var d = next;
            while (d <= seg) {
              var x = a[0] + ux * d, y = a[1] + uy * d;
              var isTri = (F.sym === 'tri') || ((F.sym === 'alt' || F.sym === 'stat') && flip % 2 === 0);
              var side = (F.sym === 'stat' && !isTri) ? -1 : 1;
              var nx = -uy * side, ny = ux * side;
              ctx.fillStyle = F.sym === 'stat' ? (isTri ? FC('COLD') : FC('WARM')) : FC(ln.kind);
              if (isTri) {
                ctx.beginPath();
                ctx.moveTo(x - ux * 4, y - uy * 4);
                ctx.lineTo(x + ux * 4, y + uy * 4);
                ctx.lineTo(x + nx * 6.5, y + ny * 6.5);
                ctx.closePath(); ctx.fill();
              } else {
                var ang = Math.atan2(uy, ux);
                ctx.beginPath();
                ctx.arc(x, y, 4.5, ang + (side > 0 ? Math.PI : 0), ang + (side > 0 ? 2 * Math.PI : Math.PI));
                ctx.fill();
              }
              flip++; d += STEP;
            }
            next = d - seg;
          }
        });
        /* centros de alta y baja */
        (fronts.highs || []).concat([]).forEach(function (x) { mark(x, 'A', '#3b82f6'); });
        (fronts.lows || []).forEach(function (x) { mark(x, 'B', '#ef4444'); });
        function mark(x, letra, col) {
          var q = P(x.c[0], x.c[1]);
          if (q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > H) return;
          ctx.fillStyle = col; ctx.font = '700 13px ' + sans;
          ctx.textAlign = 'center'; ctx.fillText(letra, q[0], q[1] + 4);
          ctx.font = '700 7px ' + mono; ctx.fillStyle = col + 'cc';
          ctx.fillText(String(x.p), q[0], q[1] + 13);
          ctx.textAlign = 'left';
        }
        /* ★ el límite de la fuente, dibujado: sin esto un mapa vacío al este
           de Greenwich se lee como "no hay frentes", que es falso */
        var cov = fronts.coverage;
        if (cov && cov.lonMax != null) {
          var qa = P(cov.lonMax, 80), qb = P(cov.lonMax, 5);
          if (qa[0] > -20 && qa[0] < W + 20) {
            ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(148,163,184,.55)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); ctx.stroke();
            ctx.setLineDash([]);
            ctx.save(); ctx.translate(qa[0] + 3, Math.max(14, Math.min(H - 6, H * 0.5)));
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = 'rgba(148,163,184,.8)'; ctx.font = '700 7px ' + mono;
            ctx.fillText('LÍMITE DE LOS FRENTES →', 0, 0);
            ctx.restore();
          }
        }
      }

      /* Las capas SIGWX sólo en ALTO. Ojo: NO se puede salir aquí con return,
         porque la ruta y los aeropuertos se pintan más abajo y desaparecerían
         mientras cargan los datos. */
      var L = (band === 'high' && data) ? (data.layers || {}) : {};

      /* áreas: engelamiento y turbulencia */
      ['ICING', 'TURB'].forEach(function (key) {
        if (!on[key]) return;
        var col = LC(key);
        (L[key] || []).forEach(function (f) {
          var live = !flOnly || affects(f.p, key, CRUISE), isSel = (f === sel);
          f.c.forEach(function (ring) {
            path(ring, true);
            ctx.fillStyle = col + (live ? (isSel ? '3c' : '20') : '08');
            ctx.fill();
            ctx.strokeStyle = col + (live ? (isSel ? 'ff' : 'cc') : '30');
            ctx.lineWidth = isSel ? 2.2 : 1.3;
            ctx.setLineDash(key === 'TURB' ? [5, 3] : []);
            ctx.stroke(); ctx.setLineDash([]);
          });
          if (live) {
            /* Símbolo y niveles VIAJAN JUNTOS y sobre el trozo visible del
               área. El símbolo sólo si el trozo da para él —uno de 9 px dentro
               de una mancha de 12 no señala nada—, pero el DATO se pone
               siempre. */
            var an = anclaVisible(f.c[0]);
            if (an) {
              var hayHueco = an.w >= 26 && an.h >= 26;
              if (hayHueco) simbolo(an.c[0], an.c[1], key, /SEV/i.test(f.p.severity || ''), col, 9);
              rotulo(an.c[0], an.c[1] + (hayHueco ? 17 : 0), bandTxt(f.p, key), col);
            }
          }
        });
      });

      /* CB — la AWC los entrega como contorno cerrado del área */
      if (on.CB) (L.CB || []).forEach(function (f) {
        var live = !flOnly || affects(f.p, 'CB', CRUISE), isSel = (f === sel), col = LC('CB');
        f.c.forEach(function (ring) {
          /* §4.1: el área de tiempo significativo se delimita con línea
             FESTONEADA. El relleno va por el trazado liso —el festón deja
             mordiscos y el relleno saldría dentado— y el contorno por el
             festoneado, que es el que se ve. */
          path(ring, true);
          ctx.fillStyle = col + (live ? (isSel ? '38' : '1c') : '08'); ctx.fill();
          festoneada(ring);
          ctx.strokeStyle = col + (live ? 'ee' : '30'); ctx.lineWidth = isSel ? 2 : 1.4;
          ctx.stroke();
        });
        if (live) {
          var ac = anclaVisible(f.c[0]);
          if (ac) {
            var cabe = ac.w >= 26 && ac.h >= 26;
            if (cabe) simbolo(ac.c[0], ac.c[1], 'CB', false, col);
            rotulo(ac.c[0], ac.c[1] + (cabe ? 17 : 0),
                   (f.p.extent || 'CB') + ' ' + bandTxt(f.p, 'CB'), col);
          }
        }
      });

      /* tropopausa */
      if (on.TROP) (L.TROP || []).forEach(function (f) {
        ctx.setLineDash([2, 4]); ctx.strokeStyle = LC('TROP') + '88'; ctx.lineWidth = 1;
        f.c.forEach(function (r) { path(r, false); ctx.stroke(); });
        ctx.setLineDash([]);
        /* La caja del nivel iba SIEMPRE en el punto medio de la línea, así que
           una tropopausa que cruza la pantalla con su mitad fuera perdía su
           altitud. Se pone en el punto medio de lo que SE VE. */
        var vis = f.c[0].map(function (p2) { return P(p2[0], p2[1]); })
          .filter(function (q) { return q[0] > 8 && q[0] < W - 8 && q[1] > 8 && q[1] < H - 8; });
        if (vis.length) rotulo(vis[Math.floor(vis.length / 2)][0],
                               vis[Math.floor(vis.length / 2)][1], f.p.height, LC('TROP'));
      });

      /* ══ CORRIENTE EN CHORRO ══════════════════════════════════════════════
         «Los jetstreams deberían marcar la DIRECCIÓN, la ALTITUD y la
         INTENSIDAD del viento con los triángulos» (8-sep-2026). Es la
         simbología del Model SN §4.3, y en la carta del OFP son tres cosas
         distintas sobre el mismo eje:

         · DIRECCIÓN → puntas de flecha sobre el eje, hacia donde sopla;
         · INTENSIDAD → banderola (triángulo relleno) = 50 kt · pluma = 10 kt ·
           media pluma = 5 kt. Un «110kt» escrito obliga a LEER; las plumas se
           ven de un vistazo, que es para lo que están;
         · ALTITUD → el FL del núcleo, en caja, y **sólo cuando cambia**. Antes
           se escribía en CADA punto del eje: cuatro «FL340» encima del mismo
           chorro, que es ruido, no dato.

         ⚠ La dirección sale del ORDEN de los vértices del eje, que es como lo
         publica el WAFS. No hay otra fuente: sin presión no se puede deducir el
         sentido del flujo. Si algún día una carta sale con la flecha del revés,
         el sitio es éste — y las plumas usan el mismo orden, así que fallarían
         las dos a la vez y no una sola. */
      if (on.JET) (L.JET || []).forEach(function (f) {
        var isSel = (f === sel), col = LC('JET');
        f.c.forEach(function (r) {
          path(r, false);
          /* GRUESA: «lo puedes hacer más gruesa la línea del jet». El eje del
             chorro es lo que el piloto sigue con el dedo sobre la carta. */
          ctx.strokeStyle = col + '22'; ctx.lineWidth = 15; ctx.lineCap = 'round'; ctx.stroke();
          path(r, false);
          ctx.strokeStyle = col + (isSel ? 'ff' : 'cc'); ctx.lineWidth = isSel ? 6.4 : 4.6; ctx.stroke();
          flechasEje(r, col, isSel);
        });
        var fl = f.p.fleche || [];
        var ultH = null, ultQ = null, ultB = null;
        fl.forEach(function (a, i) {
          var q = P(a.lon, a.lat);
          if (q[0] < -40 || q[0] > W + 40 || q[1] < -40 || q[1] > H + 40) return;
          /* ⚠ Al doblar el tamaño de las barbas, dos puntos del eje que caen
             cerca en pantalla se solapan y no hay quien las cuente. Se pide una
             separación mínima: mejor tres barbas legibles que seis encimadas. */
          if (ultB && Math.hypot(q[0] - ultB[0], q[1] - ultB[1]) < 58) return;
          ultB = q;
          var b = fl[i + 1] || fl[i - 1] || a;
          var qb = P(b.lon, b.lat);
          var ang = Math.atan2(qb[1] - q[1], qb[0] - q[0]);
          if (!fl[i + 1]) ang += Math.PI;          // el último mira hacia delante
          plumas(q[0], q[1], ang, a.s, col);
          /* el nivel, en caja GRANDE, cuando CAMBIA o cuando el chorro ya se ha
             ido lejos del último rótulo. Va al lado contrario del asta, que
             ahora mide 30 px y se lo comería. */
          if (a.h == null) return;
          var lejos = !ultQ || Math.hypot(q[0] - ultQ[0], q[1] - ultQ[1]) > 170;
          if (String(a.h) !== String(ultH) || lejos) {
            var ly = q[1] + 26 + Math.max(0, Math.cos(ang)) * 8;
            if (q[0] > 20 && q[0] < W - 20 && ly > 12 && ly < H - 12) {
              rotulo(q[0], ly, 'FL' + a.h, col, 12);
              ultH = a.h; ultQ = q;
            }
          }
        });
      });

      /* marcadores */
      ['VOLC', 'TC'].forEach(function (key) {
        if (!on[key]) return;
        (L[key] || []).forEach(function (f) {
          var q = P(f.c[0][0][0], f.c[0][0][1]);
          ctx.fillStyle = LC(key);
          if (key === 'VOLC') {
            ctx.beginPath(); ctx.moveTo(q[0], q[1] - 6);
            ctx.lineTo(q[0] + 6, q[1] + 5); ctx.lineTo(q[0] - 6, q[1] + 5);
            ctx.closePath(); ctx.fill();
          } else {
            ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.lineWidth = 2;
            ctx.strokeStyle = LC(key); ctx.stroke();
          }
          ctx.font = '700 7px ' + mono;
          ctx.fillText(f.p.name || LAY[key].lbl, q[0] + 9, q[1] + 4);
        });
      });

      /* ruta y aeropuertos */
      var pts = routePts();
      if (pts) {
        var isGc = !(route && route.pts);
        ctx.setLineDash(isGc ? [6, 4] : []);
        path(pts, false);
        ctx.strokeStyle = day ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.5)';
        ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
        path(pts, false);
        /* NARANJA Y CONTINUA cuando hay puntos de verdad —los del plan de vuelo,
           la base de rutas o la traza ADS-B—, que es como la pinta la carta de
           ruta del iPad. El gran círculo se queda AZUL Y DE TRAZOS a propósito:
           no es tu ruta, es una recta entre los dos aeropuertos, y las dos cosas
           no pueden verse igual. */
        ctx.strokeStyle = isGc ? (day ? '#0369a1' : T.cyan) : RUTA;
        ctx.lineWidth = isGc ? 2.2 : 2.8; ctx.stroke();
        ctx.setLineDash([]);

        /* ── puntos del plan de vuelo ──
           Si la ruta trae nombres (OFP pegado o base de la compañía) se pintan
           con su identificador; si no, sólo el vértice. */
        var nm = route && route.names;
        var wCol = RUTA;
        if (!isGc) pts.forEach(function (p, i) {
          var q = P(p[0], p[1]);
          if (q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) return;
          var label = nm && nm[i];
          ctx.fillStyle = wCol;
          ctx.beginPath(); ctx.arc(q[0], q[1], label ? 3 : 1.7, 0, 7); ctx.fill();
          if (!label) return;
          ctx.font = '700 7px ' + mono;
          var tw = ctx.measureText(label).width;
          ctx.fillStyle = boxBg();
          ctx.fillRect(q[0] + 5, q[1] - 9, tw + 5, 11);
          ctx.fillStyle = wCol;
          ctx.fillText(label, q[0] + 7.5, q[1] - 1);
        });
      }
      [[leg.dep, depC], [leg.arr, arrC]].forEach(function (a) {
        if (!a[1]) return;
        var q = P(a[1][0], a[1][1]);
        ctx.strokeStyle = day ? '#0b2138' : T.tx1; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.stroke();
        ctx.fillStyle = day ? '#0b2138' : T.tx1;
        ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 7); ctx.fill();
        ctx.font = '700 9px ' + sans; ctx.fillText(a[0] || '', q[0] + 8, q[1] + 3.5);
      });

      pintaRotulos();      // lo último: ninguna línea cruza un dato
    }

    /* ★ Los oyentes de resize/orientación se registran UNA vez (deps []), así
       que se quedan con el `draw` del PRIMER render — uno que no conoce la ruta
       que pegues después. Medido: girar el móvil, abrir el teclado o volver a
       la pestaña repintaba el gran círculo y la ruta desaparecía sin que nadie
       tocara nada. Se guarda el draw vigente en una ref y los oyentes llaman a
       ESE. */
    var drawRef = useRef(null);
    drawRef.current = draw;
    function redraw() { if (drawRef.current) drawRef.current(); }

    useEffect(function () { draw(); });

    /* ── cuánto sitio hay ────────────────────────────────────────────────
       La barra de abajo se MIDE, no se cablea: un número fijo aquí volvería a
       desviarse el día que la barra cambie de alto —que es exactamente lo que
       pasó con la ✕ del modo inspección—.
       ★ La medición vive en `window.svAltoLibre` (index.html) y NO se copia
       aquí: la comparten esta carta y las tres pestañas de mapas Windy, que
       tenían su propio 260 cableado. Dos geometrías para la misma pregunta es
       `ES_AIRPORTS` / `ES_IATA`, y con píxeles los dos números salen
       plausibles. Ahí se arregló además que la barra de SkyView es `absolute`
       y la versión anterior sólo miraba `sticky|fixed`: devolvía 0 y esta
       carta se dibujaba por DEBAJO de la barra. */
    function mide() {
      var el = wrapRef.current; if (!el || full) return;
      var v = window.svAltoLibre(el, 200);
      setAlto(function (prev) { return Math.abs(prev - v) > 2 ? v : prev; });
    }
    useEffect(function () { mide(); });
    useEffect(function () {
      var f = function () { mide(); redraw(); };
      window.addEventListener('resize', f);
      /* en algunas WebView el resize llega antes de que el layout se reasiente:
         el `orientationchange` es el respaldo, como en el mapa del logbook */
      window.addEventListener('orientationchange', function () { setTimeout(f, 120); });
      var ro = null;
      try { ro = new ResizeObserver(f); if (wrapRef.current && wrapRef.current.parentElement) ro.observe(wrapRef.current.parentElement); } catch (e) {}
      return function () {
        window.removeEventListener('resize', f);
        if (ro) try { ro.disconnect(); } catch (e) {}
      };
    }, []);

    /* ── interacción: arrastrar, PELLIZCAR, doble toque y tocar un fenómeno ──
       El lienzo sólo tenía `pointerdown/move/up`: se arrastraba pero NO se
       pellizcaba. En un móvil la pinza es lo primero que intenta cualquiera y
       no hacía nada — el fallo mudo de siempre, esta vez en un gesto. */

    /* zoom ANCLADO a un punto de la pantalla: sin anclar, el trozo de carta que
       el piloto está mirando se le escapa de debajo de los dedos. */
    function zoomA(z2, cx, cy, g) {
      var cam = camRef.current, cv = cvRef.current; if (!cv) return;
      var r = cv.getBoundingClientRect();
      cam.z = Math.max(0.5, Math.min(64, z2));
      var k = cam.sc * cam.z;
      cam.lon = g.lon - ((cx - r.left) - cam.W / 2) / k;
      cam.lat = unmy(my(g.lat) + ((cy - r.top) - cam.HH / 2) / k);
      camTocada.current = true;
    }
    /* qué punto del mundo hay bajo (cx,cy) AHORA */
    function geoEn(cx, cy) {
      var cam = camRef.current, cv = cvRef.current;
      var r = cv.getBoundingClientRect(), k = cam.sc * cam.z;
      return { lon: cam.lon + ((cx - r.left) - cam.W / 2) / k,
               lat: unmy(my(cam.lat) - ((cy - r.top) - cam.HH / 2) / k) };
    }
    function dosDedos() {
      var id = Object.keys(ptrs.current);
      return id.length >= 2 ? [ptrs.current[id[0]], ptrs.current[id[1]]] : null;
    }
    function onDown(e) {
      var cv = cvRef.current, cam = camRef.current;
      if (hrsAb) setHrsAb(false);
      ptrs.current[e.pointerId] = { x: e.clientX, y: e.clientY };
      var dd = dosDedos();
      if (dd) {                       // arranca la pinza: se cancela el arrastre
        cv._drag = null;
        var cx = (dd[0].x + dd[1].x) / 2, cy = (dd[0].y + dd[1].y) / 2;
        pinza.current = { d: Math.max(1, Math.hypot(dd[0].x - dd[1].x, dd[0].y - dd[1].y)),
                          z: cam.z, cx: cx, cy: cy, g: geoEn(cx, cy) };
        return;
      }
      cv._drag = { x: e.clientX, y: e.clientY, lon: cam.lon, lat: cam.lat, moved: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    }
    function onMove(e) {
      var cv = cvRef.current, cam = camRef.current;
      var p = ptrs.current[e.pointerId];
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      var dd = dosDedos();
      if (dd && pinza.current) {
        var d = Math.hypot(dd[0].x - dd[1].x, dd[0].y - dd[1].y);
        if (d < 8) return;
        var pz = pinza.current;
        zoomA(pz.z * (d / pz.d), pz.cx, pz.cy, pz.g);
        draw(); return;
      }
      var st = cv && cv._drag;
      if (!st) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      st.moved = Math.max(st.moved, Math.abs(dx) + Math.abs(dy));
      if (st.moved > 6) camTocada.current = true;
      cam.lon = st.lon - dx / (cam.sc * cam.z);
      cam.lat = unmy(my(st.lat) + dy / (cam.sc * cam.z));
      draw();
    }
    function onUp(e) {
      var cv = cvRef.current, st = cv && cv._drag; cv._drag = null;
      delete ptrs.current[e.pointerId];
      if (!dosDedos()) pinza.current = null;
      if (!st || st.moved > 6) return;
      var ahora = Date.now();
      if (ahora - ultTap.current < 300) {          // DOBLE TOQUE: acercar aquí
        ultTap.current = 0;
        zoomA(camRef.current.z * 1.9, e.clientX, e.clientY, geoEn(e.clientX, e.clientY));
        setSel(null); draw(); return;
      }
      ultTap.current = ahora;
      if (!data) return;
      var r = cv.getBoundingClientRect();
      setSel(pick(e.clientX - r.left, e.clientY - r.top));
    }
    function pick(px, py) {
      var cam = camRef.current, W = cam.W, H = cam.HH, best = null, bd = 14;
      function P(lon, lat) {
        return [W / 2 + (lon - cam.lon) * cam.sc * cam.z,
                H / 2 - (my(lat) - my(cam.lat)) * cam.sc * cam.z];
      }
      function segD(a, b) {
        var vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
        var t = L2 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L2)) : 0;
        return Math.hypot(px - (a[0] + t * vx), py - (a[1] + t * vy));
      }
      function inside(scr) {
        var ins = false;
        for (var i = 0, j = scr.length - 1; i < scr.length; j = i++) {
          var yi = scr[i][1], yj = scr[j][1];
          if ((yi > py) !== (yj > py) &&
              px < (scr[j][0] - scr[i][0]) * (py - yi) / (yj - yi) + scr[i][0]) ins = !ins;
        }
        return ins;
      }
      ORDER.forEach(function (key) {
        if (!on[key]) return;
        var isArea = LAY[key].kind === 'area';
        ((data.layers || {})[key] || []).forEach(function (f) {
          if (flOnly && isArea && !affects(f.p, key, CRUISE)) return;
          f.c.forEach(function (r) {
            var scr = r.map(function (p) { return P(p[0], p[1]); });
            if (isArea && scr.length > 2 && inside(scr)) { bd = 0; best = { f: f, key: key }; return; }
            for (var i = 1; i < scr.length; i++) {
              var d = segD(scr[i - 1], scr[i]);
              if (d < bd) { bd = d; best = { f: f, key: key }; }
            }
            if (scr.length === 1) {
              var d0 = Math.hypot(scr[0][0] - px, scr[0][1] - py);
              if (d0 < bd) { bd = d0; best = { f: f, key: key }; }
            }
          });
        });
      });
      return best && best.f;
    }
    function selKey() {
      if (!sel || !data) return null;
      var found = null;
      ORDER.forEach(function (k) {
        if (found) return;
        if (((data.layers || {})[k] || []).indexOf(sel) >= 0) found = k;
      });
      return found;
    }

    /* ── adjuntar el OFP ──
       El OFP no imprime coordenadas: da nombres y distancias. El servidor los
       cruza con la base de puntos GPL e interpola los que faltan usando las
       propias distancias del OFP. Aqui solo se pinta lo que devuelve, y se
       enseña el CONTROL: si las dos fuentes no cuadran, hay que saberlo. */
    function subeOfp(file) {
      if (!file) return;
      if (!/\.pdf$/i.test(file.name || '')) {
        if (typeof showToast === 'function') showToast('De momento solo el PDF del OFP', 'error');
        return;
      }
      setOfpBusy(true);
      var fr = new FileReader();
      fr.onerror = function () { setOfpBusy(false); if (typeof showToast === 'function') showToast('No se ha podido leer el archivo', 'error'); };
      fr.onload = function () {
        var tok = (typeof ldAuthHeaders === 'function') ? ldAuthHeaders() : null;
        fetch(ldBackendUrl() + '/api/route/ofp', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}),
          body: JSON.stringify({ pdf_buffer: String(fr.result).replace(/^data:[^,]+,/, '') })
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            setOfpBusy(false);
            if (!x.ok || !x.j.ok) {
              if (typeof showToast === 'function') showToast('❌ ' + ((x.j && x.j.error) || 'No se ha podido leer el OFP'), 'error');
              return;
            }
            var r = x.j;
            setOfp(r);
            setRoute({ pts: r.pts, names: r.names, src: 'ofp', label: 'RUTA DEL OFP' });
                camRef.current.z = 1;
            if (typeof showToast === 'function') showToast('✅ ' + r.pts.length + ' puntos del plan de vuelo', 'success');
          }).catch(function () {
            setOfpBusy(false);
            if (typeof showToast === 'function') showToast('❌ Sin conexion', 'error');
          });
      };
      fr.readAsDataURL(file);
    }

    /* ── guardar la ruta que se está viendo en la base compartida ── */
    /* Panel propio: Glass es oscuro fijo y en modo día quedaba un bloque negro
       en medio de una pantalla clara. Aquí se usan los tokens del tema. */
    function Panel(props) {
      return h("div", { style: Object.assign({
        background: T.surf1 || "rgba(0,25,64,.55)",
        border: "1px solid " + (T.line || "rgba(126,251,254,.10)"),
        borderRadius: 11
      }, props.style) }, props.children);
    }

    /* ══ estilos locales ══ */
    /* El rótulo del sello va en tx2, no en tx3: al darle superficie propia el
       fondo de NOCHE sube de #00081c a #0E1828 y tx3 se queda en 3,89:1. Lo
       cazó el banco midiendo los dos temas — el arreglo de día se llevaba por
       delante la noche, que es justo lo que la regla de «las DOS paletas» está
       ahí para evitar. */
    var eyebrow = { fontSize: 8, color: T.tx2, fontFamily: mono, letterSpacing: '1.5px', marginBottom: 7 };
    /* ¿Hay alguna zona SEVERA de esta capa en lo que se está mirando? La
       leyenda tiene que enseñar el símbolo que el piloto va a encontrar en el
       mapa; si siempre dibujara el moderado, la barra de severidad aparecería
       en la carta sin que nada la explicara. */
    function haySevera(k) {
      var L = (data && data.layers) || {};
      return (L[k] || []).some(function (f) { return /SEV/i.test((f.p && f.p.severity) || ''); });
    }

    /* El icono del chip lo pinta la MISMA función que el mapa. Un <canvas> de
       14 px por chip: dibujarlo con CSS sería una segunda versión del símbolo
       —`ES_AIRPORTS` / `ES_IATA` con forma de icono— y acabaría divergiendo. */
    function SimboloChip(pr) {
      var ref = useRef(null);
      useEffect(function () {
        var cv = ref.current; if (!cv) return;
        var d = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = 18 * d; cv.height = 18 * d;
        var c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
        c.clearRect(0, 0, 18, 18);
        c.globalAlpha = pr.on ? 1 : .35;
        try { dibujaSimbolo(c, 9, 9, pr.k, !!pr.sev, pr.col, 7); } catch (e) {}
      }, [pr.k, pr.col, pr.on, pr.sev]);
      return h('canvas', { ref: ref, width: 18, height: 18,
                           title: pr.sev ? 'severa' : 'moderada',
                           style: { width: 18, height: 18, display: 'block', flex: 'none' } });
    }

    /* ── EL CRISTAL de los mandos que van DENTRO del mapa ──────────────────
       AHUMADO en los DOS temas, nunca claro. Encima del lienzo —que en modo día
       es un mar claro— una pastilla clara se queda en fantasma; esta app ya lo
       pagó con `.ld-map-hint` en el mapa del logbook y la regla está escrita:
       las píldoras de dentro del mapa son oscuras en los dos modos.

       El `backdrop-filter` sale barato AQUÍ y no en cualquier sitio: esta carta
       NO tiene bucle de animación —sólo repinta cuando la tocas—, así que el
       desenfoque se compone una vez y no 60 veces por segundo. En el mapa del
       logbook, que sí anima, esto no valdría. */
    /* ⚠ El ahumado es MÁS DENSO en modo día, y no es capricho: debajo hay una
       carta clara, así que al 66 % el compuesto salía casi gris y el rótulo
       activo se quedaba en **4,07:1** — por debajo de AA a 9 px. Medido, no
       mirado; el banco lo caza en los dos temas. */
    var VIDRIO = {
      background: day ? 'rgba(6,20,42,.82)' : 'rgba(6,20,42,.62)',
      WebkitBackdropFilter: 'blur(14px) saturate(1.35)',
      backdropFilter: 'blur(14px) saturate(1.35)',
      border: '1px solid rgba(255,255,255,.20)',
      boxShadow: '0 6px 20px rgba(4,16,36,.34)',
      color: '#E9F4FF', fontFamily: mono
    };
    var VID_ON = 'rgba(34,211,238,.26)', VID_TX = '#8FF3FF', VID_OFF = 'rgba(233,244,255,.62)';
    function vidrio(extra) { return Object.assign({}, VIDRIO, extra); }
    /* botón de un segmentado de cristal */
    function segV(txt, act, onC, sub) {
      return h('button', { key: txt, onClick: onC, style: {
        border: 'none', borderRadius: 9, padding: '6px 11px', cursor: 'pointer',
        fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '.6px',
        background: act ? VID_ON : 'transparent',
        boxShadow: act ? 'inset 0 0 0 1px rgba(126,251,254,.5)' : 'none',
        color: act ? VID_TX : VID_OFF
      } }, txt, sub ? h('div', { style: { fontSize: 6, fontWeight: 400, opacity: .85, marginTop: 1, letterSpacing: '.4px' } }, sub) : null);
    }
    /* chip de capa sobre cristal — el de la columna (`chipS`) está calculado
       contra `surf1` y sobre el ahumado se cae */
    /* ⚠ Los chips de capa son la LEYENDA: su color tiene que ser el MISMO con el
       que se pinta el área, o dejan de explicar nada. Y la paleta de DÍA es
       oscura a propósito —está calculada contra una carta clara—, así que sobre
       el cristal ahumado se cae: `TROP` (#3B5F8A) sobre el cristal daba un
       rótulo que no se leía. La salida NO es cambiarle el color al chip —eso
       sería una leyenda que miente—: es darle al chip su propia superficie
       CLARA en modo día, para que el color de la carta siga valiendo encima. */
    function chipV(act, col) {
      /* en día la superficie del chip va CASI OPACA: con .72 el blanco se
         mezclaba con el ahumado de debajo y `TROP` (#3B5F8A) se quedaba en
         3,19:1 sobre el gris resultante */
      var fondo = day ? (act ? '#FFFFFF' : 'rgba(255,255,255,.94)')
                      : (act ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.04)');
      return { fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: '.5px',
               padding: '4px 7px', borderRadius: 8, cursor: 'pointer', flex: 'none',
               border: 'none',
               boxShadow: 'inset 0 0 0 1px ' + (act ? col + '99' : (day ? 'rgba(12,40,75,.22)' : 'rgba(255,255,255,.14)')),
               background: fondo,
               color: act ? col : (day ? '#475569' : VID_OFF),
               display: 'flex', alignItems: 'center', gap: 4 };
    }

    var chipS = function (act, col) {
      return { fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: '.6px',
               padding: '5px 8px', borderRadius: 7, cursor: 'pointer',
               border: '1px solid ' + (act ? col + '55' : T.line),
               /* `transparent` aquí era el degradado de la página, no una
                  superficie: el chip apagado se leía a 3,2:1. Apagado = la
                  superficie del módulo; encendido = su tinte encima de ella. */
               /* El tinte del chip encendido va COMPUESTO sobre la superficie,
                  no suelto: con `background: col+'1c'` a secas lo que hay debajo
                  es el degradado de la página y el recuento se leía a 2,9:1. */
               backgroundColor: T.surf1,
               backgroundImage: act ? 'linear-gradient(' + col + '1c,' + col + '1c)' : 'none',
               color: act ? T.tx1 : T.tx2, display: 'flex', alignItems: 'center', gap: 5 };
    };

    /* ── frescura: sello y avisos ── */
    var stale = null, partial = null;
    if (data) {
      var vt = new Date(data.validAt);
      /* ★ Lo que hay que avisar NO es la edad del ciclo. Medido contra el
         producto real: a las 09Z el ciclo de las 06Z todavía no está publicado,
         así que un aviso "el ciclo tiene 9 h" saltaría a diario y acabaría
         ignorándose — un aviso que cría lobos es tan inútil como el silencio.
         Lo que sí importa, y siempre es cierto, es estar mirando una previsión
         para una hora que YA HA PASADO. */
      var lateH = (Date.now() - vt.getTime()) / 3600000;
      if (lateH > 0.5) stale = 'Estás viendo la previsión de las ' + z(data.validAt) +
        ', que ya ha pasado hace ' + (lateH < 1 ? Math.round(lateH * 60) + ' min' : Math.round(lateH) + ' h') +
        '. Elige una hora posterior.';
      var tot = Object.keys(data.counts || {}).reduce(function (s, k) { return s + data.counts[k]; }, 0);
      if (!tot) partial = 'No ha llegado ningún fenómeno para esta hora y esta zona. ' +
                          'Puede ser que no haya (buen tiempo) o que la descarga fallara — no se puede distinguir.';
    }
    function z(iso) {
      try { var d = new Date(iso);
        return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2) + 'Z';
      } catch (e) { return '—'; }
    }
    /* El VALID del boletín codificado viene en MMDDHH ("090706Z" = 7 de
       septiembre, 06Z). Enseñarlo crudo se lee como un día 9 que no es. */
    function validFronts(v) {
      var m = String(v || '').match(/^(\d{2})(\d{2})(\d{2})Z?$/);
      if (!m) return v || '—';
      return m[2] + '/' + m[1] + ' ' + m[3] + ':00Z';
    }

    var kids = [];

    /* cabecera con el sello y el botón de actualizar.
       ★ Va sobre SUPERFICIE, como todo lo demás de este módulo: los tokens de
       `SKY_THEME(day)` están calculados contra `surf1`, así que apoyados en el
       degradado azul de la página se caen (el sello medía 2,22:1). */
    /* ── El SELLO y la BANDA ya no viven en la columna ────────────────────
       Los dos se han mudado DENTRO del mapa, en cristal: eran 100 px de alto
       robados a la carta para decir dos cosas que caben en una pastilla. El
       sello sigue SIEMPRE visible, que es la norma de este módulo — sólo que
       ahora se lee encima de la carta en vez de encima de ella. */
    /* ⚠ El «SIGWX WAFS» / «ANÁLISIS DE SUPERFICIE» no es decoración: es QUÉ
       producto se está mirando. Al mudar el sello lo recorté para que cupiera y
       el sello se quedó diciendo sólo un ciclo — y de paso dos bancos perdieron
       su asidero, que es como se vio. Cabe en dos líneas. */
    var selloTxt = band === 'high'
      ? ['SIGWX WAFS · CICLO ', h('b', { key: 'c', style: { color: VID_TX } },
            data ? (data.cycle || '').slice(6, 8) + '/' + (data.cycle || '').slice(4, 6) + ' ' + (data.cycle || '').slice(9, 11) + 'Z' : '…'),
         data ? ' · VÁLIDO ' + z(data.validAt) + ' (+' + data.hour + 'h)' : ' · CARGANDO…']
      : ['ANÁLISIS DE SUPERFICIE · ', h('b', { key: 'v', style: { color: VID_TX } },
            fronts ? 'VÁLIDO ' + validFronts(fronts.valid) : 'CARGANDO…')];

    /* ══ EL MAPA, con sus mandos DENTRO ═══════════════════════════════════
       Alto: lo que quede (`alto`, medido) o la pantalla entera en inmersivo.
       Los mandos flotan en cristal ahumado; el sello va abajo a la izquierda,
       siempre visible. */
    var INM = full;
    var arriba = INM ? 'calc(10px + env(safe-area-inset-top))' : 8;
    var abajoP = INM ? 'calc(10px + env(safe-area-inset-bottom))' : 8;

    var mapaEl = h('div', { key: 'map', ref: wrapRef, style: INM ? {
      position: 'fixed', inset: 0, zIndex: 2147483000, height: '100%', width: '100%',
      /* ⚠ `SUELO.mar` de día es una LISTA de paradas de degradado, no un color:
         puesta en `background` sale una cadena sin sentido. Aquí sólo hace falta
         un color de respaldo mientras el lienzo se dimensiona. */
      overflow: 'hidden', background: day ? '#AECBDD' : '#00081c', padding: 0, boxSizing: 'border-box'
    } : {
      position: 'relative', height: alto, borderRadius: 12, overflow: 'hidden',
      padding: day ? 5 : 0, boxSizing: 'border-box',
      border: '1px solid ' + SUELO.borde,
      background: day ? T.surf1 : SUELO.mar,
      /* de día la carta es lo más claro de la pantalla y flota sobre el degradado
         azul de SkyView: el borde solo no la despega, la sombra sí */
      boxShadow: day ? '0 6px 18px rgba(12,40,75,.20)' : 'none'
    } },
      h('canvas', {
        key: 'cv', ref: cvRef,
        onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp,
        onWheel: function (e) {
          camTocada.current = true;
          zoomA(camRef.current.z * (e.deltaY < 0 ? 1.16 : 0.86), e.clientX, e.clientY, geoEn(e.clientX, e.clientY));
          draw();
        },
        style: { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab',
                 borderRadius: (day && !INM) ? 7 : 0 }
      }),

      /* ── inmersivo: quién eres y por dónde se sale ── */
      INM ? h('div', { key: 'tit', style: vidrio({ position: 'absolute', left: 8, top: arriba,
          borderRadius: 11, padding: '8px 11px', fontSize: 9, fontWeight: 700, letterSpacing: '.8px', zIndex: 4 }) },
        /* sin leg NO se escribe una ruta: `'--' + '→' + '--'` es el dato
           inventado de siempre, en la cabecera de la carta */
        (leg.flight || 'SIGWX'),
        /* ⚠ `leg.dep` puede venir como `'--'`, que es TRUTHY: con un `&&` a
           secas el título salía «SIGWX --→--», una ruta inventada en la
           cabecera de la carta. Se exige un código de verdad. */
        (/^[A-Z]{3,4}$/.test(leg.dep || '') && /^[A-Z]{3,4}$/.test(leg.arr || ''))
          ? h('span', { style: { opacity: .6, marginLeft: 6 } }, leg.dep + '→' + leg.arr) : null) : null,

      /* ── ALTO / BAJO ── segmentado de cristal, arriba a la izquierda ── */
      h('div', { key: 'band', style: vidrio({ position: 'absolute', left: 8,
          top: INM ? 'calc(56px + env(safe-area-inset-top))' : arriba,
          borderRadius: 12, padding: 3, display: 'flex', gap: 3, zIndex: 4 }) },
        segV('ALTO', band === 'high', function () { setBand('high'); setSel(null); setHrsAb(false); }, 'FL250–630'),
        segV('BAJO', band === 'low',  function () { setBand('low');  setSel(null); setHrsAb(false); }, 'frentes')),

      /* ── HORAS ── desplegable; sólo ALTO, que es lo único que es pronóstico ── */
      band === 'high' ? h('div', { key: 'hrs', style: { position: 'absolute', right: 8,
          top: INM ? 'calc(56px + env(safe-area-inset-top))' : arriba, zIndex: 5 } },
        h('button', { onClick: function () { setHrsAb(!hrsAb); },
          style: vidrio({ borderRadius: 12, padding: '8px 11px', cursor: 'pointer', fontSize: 9,
                          fontWeight: 700, letterSpacing: '.6px', display: 'flex', alignItems: 'center', gap: 6 }) },
          h('span', { style: { opacity: .58 } }, 'PRON.'),
          h('b', { style: { color: VID_TX } }, '+' + hour + 'h'),
          h('span', { style: { opacity: .7, fontSize: 8 } }, hrsAb ? '▴' : '▾')),
        hrsAb ? h('div', { style: vidrio({ position: 'absolute', right: 0, top: 36, borderRadius: 12,
            padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 76 }) },
          HOURS.map(function (H) {
            return segV('+' + H + 'h', hour === H, function () {
              hourTouched.current = true; setHour(H); setHrsAb(false);
            });
          })) : null) : null,

      /* ── CAPAS ── tira que rueda, pegada abajo. Sólo ALTO. ── */
      band === 'high' ? h('div', { key: 'cap', style: vidrio({ position: 'absolute',
          left: 8, right: 8, bottom: abajoP, borderRadius: 13, padding: '6px 7px',
          display: 'flex', gap: 5, overflowX: 'auto', zIndex: 4 }) },
        ORDER.filter(function (k) { return !data || (data.counts && data.counts[k]); }).map(function (k) {
          var n = data && data.counts ? data.counts[k] : 0;
          return h('button', { key: k, style: chipV(on[k], LC(k)),
            onClick: function () { var o = Object.assign({}, on); o[k] = !o[k]; setOn(o); setSel(null); } },
            h(SimboloChip, { k: k, col: LC(k), on: on[k], sev: haySevera(k) }),
            LAY[k].lbl,
            /* #64748B sobre el chip blanco daba 4,44:1 — por debajo de AA a 8 px */
            h('span', { style: { color: day ? '#475569' : 'rgba(233,244,255,.7)', fontWeight: 400 } }, String(n)));
        })) : null,

      /* ── SELLO ── la norma del módulo: no puede esconderse nunca ── */
      h('div', { key: 'sel', style: vidrio({ position: 'absolute', left: 8,
          bottom: band === 'high' ? 'calc(' + (typeof abajoP === 'string' ? abajoP : abajoP + 'px') + ' + 38px)' : abajoP,
          /* ⚠ NADA de `ellipsis` aquí: el sello es la procedencia del dato y
             recortarlo con puntos suspensivos deja «VÁLIDO 12:00Z …», que es
             justo la mitad que hay que leer. Cabe en dos líneas. */
          borderRadius: 10, padding: '4px 8px', fontSize: 7, letterSpacing: '.8px',
          lineHeight: 1.45, maxWidth: 'calc(100% - 80px)', zIndex: 4 }) },
        selloTxt, band === 'high' ? ' · ' + (flOnly ? 'FL' + CRUISE : 'TODOS') : ''),

      !data && !err ? h('div', { key: 'ld', style: {
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: mono, fontSize: 9, color: T.tx3
      } }, 'DESCARGANDO SIGWX…') : null,

      /* ── mandos de cámara + pantalla completa ── */
      h('div', { key: 'zm', style: { position: 'absolute', right: 8,
          bottom: 'calc(' + (typeof abajoP === 'string' ? abajoP : abajoP + 'px') + ' + ' + (band === 'high' ? 44 : 34) + 'px)',
          display: 'flex', flexDirection: 'column', gap: 4, zIndex: 4 } },
        ['+', '−', '⤢', INM ? '✕' : '⛶'].map(function (etq, i) {
          return h('button', {
            key: i,
            /* el título no es adorno: es lo que hace que estos botones se
               puedan encontrar sin depender del glifo — hay más ✕ en la app */
            title: ['Acercar', 'Alejar', 'Encuadrar la ruta',
                    INM ? 'Salir de pantalla completa' : 'Pantalla completa'][i],
            onClick: function () {
              var cam = camRef.current;
              if (i === 0) { camTocada.current = true; cam.z = Math.min(64, cam.z * 1.3); }
              else if (i === 1) { camTocada.current = true; cam.z = Math.max(0.5, cam.z / 1.3); }
              else if (i === 2) { camTocada.current = false; cam.z = 1; fit(); }
              else { setHrsAb(false); setFull(!full); return; }
              draw();
            },
            style: vidrio({ width: 28, height: 28, borderRadius: 9, cursor: 'pointer',
                            fontSize: i >= 2 ? 11 : 14, padding: 0, lineHeight: 1 })
          }, etq);
        })));

    /* ⚠ En INMERSIVO el mapa se saca por PORTAL a <body>.
       Un `position:fixed` con `z-index` altísimo NO basta: el módulo cuelga de
       `#scr-skyview`, que es `position:fixed; z-index:50` y CREA UN CONTEXTO DE
       APILAMIENTO — dentro de él, 2.000 millones siguen valiendo 50 por fuera, y
       la cabecera de MAPAS y la barra de abajo se pintaban ENCIMA de la carta.
       Se veía como que el inmersivo «casi» funcionaba, que es lo peor.
       El portal lo saca de ese contexto y entonces sí tapa la app entera. */
    if (INM && window.ReactDOM && window.ReactDOM.createPortal) {
      kids.push(h('div', { key: 'map' }, window.ReactDOM.createPortal(mapaEl, document.body)));
    } else {
      kids.push(mapaEl);
    }

    /* error de red */
    if (err) kids.push(h(Panel, { key: 'err', style: { padding: '10px 11px', marginTop: 9, border: '1px solid ' + T.red + '44' } },
      h('div', { style: { fontSize: 7, fontFamily: mono, color: T.red, letterSpacing: '1.2px', marginBottom: 4 } }, 'NO SE PUDO LEER EL SIGWX'),
      h('div', { style: { fontSize: 9, color: T.tx2, lineHeight: 1.5 } },
        err + '. No se muestra nada antes que mostrar algo viejo sin avisar.')));

    /* avisos de frescura */
    [['stale', stale, AMB, 'AVISO DE VIGENCIA'], ['part', partial, AMB, 'SIN FENÓMENOS']]
      .forEach(function (w) {
        if (!w[1]) return;
        kids.push(h(Panel, { key: w[0], style: { padding: '9px 11px', marginTop: 9, border: '1px solid ' + w[2] + '44' } },
          h('div', { style: { fontSize: 7, fontFamily: mono, color: w[2], letterSpacing: '1.2px', marginBottom: 4 } }, w[3]),
          h('div', { style: { fontSize: 9, color: T.tx2, lineHeight: 1.5 } }, w[1])));
      });

    /* Las HORAS y las CAPAS ya no van aquí: se han mudado DENTRO del mapa,
       en cristal (ver el bloque del mapa). Eran otras dos filas por debajo de
       la carta que obligaban a bajar la vista para tocarlas. */

    /* leyenda de frentes — sólo BAJO */
    if (band === 'low' && fronts) {
      var cnt = {};
      (fronts.lines || []).forEach(function (l) { cnt[l.kind] = (cnt[l.kind] || 0) + 1; });
      kids.push(h('div', { key: 'frleg', style: { display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 } },
        Object.keys(FRONT).filter(function (k) { return cnt[k]; }).map(function (k) {
          return h('div', { key: k, style: Object.assign(chipS(true, FC(k)), { cursor: 'default' }) },
            h('span', { style: { width: 12, height: 3, borderRadius: 2, background: FC(k) } }),
            FRONT[k].name,
            h('span', { style: { color: T.tx3, fontWeight: 400 } }, String(cnt[k])));
        })));
    }

    /* ── frentes: qué son y hasta dónde llegan ── */
    if (fronts && frOn) {
      var covers = depC && arrC &&
        Math.max(depC[0], arrC[0]) <= (fronts.coverage ? fronts.coverage.lonMax : -1);
      kids.push(h(Panel, { key: 'frnote', style: {
        padding: '9px 11px', marginTop: 9,
        border: '1px solid ' + (covers ? T.line : T.amb + '44')
      } },
        h('div', { style: { fontSize: 7, fontFamily: mono, letterSpacing: '1.2px', marginBottom: 4,
                            color: covers ? T.tx3 : T.amb } },
          covers ? 'FRENTES · ANÁLISIS DE SUPERFICIE' : 'FRENTES · TU RUTA QUEDA FUERA DE LA FUENTE'),
        h('div', { style: { fontSize: 9, color: T.tx2, lineHeight: 1.55 } },
          covers
            ? 'El SIGWX de alto nivel no lleva frentes: esto es el análisis de superficie del WPC (NOAA), '
              + 'trazado a mano cada 3 h. Válido ' + validFronts(fronts.valid) + '.'
            : 'El boletín codificado del WPC sólo expresa longitud oeste, así que se corta en Greenwich '
              + 'y no llega a tu ruta. Que no veas frentes aquí NO significa que no los haya. '
              + 'Para esta zona, la carta oficial del DWD:'),
        h('button', {
          onClick: function () {
            if (chart) { setChart(null); return; }
            fetch(ldBackendUrl() + '/api/wx/surface-chart')
              .then(function (r) { return r.json(); })
              .then(function (j) { setChart(j); })
              .catch(function () { if (typeof showToast === 'function') showToast('No se pudo abrir la carta', 'error'); });
          },
          style: { marginTop: 8, width: '100%', padding: '8px', borderRadius: 8, cursor: 'pointer',
                   border: '1px solid ' + (covers ? T.line : T.amb),
                   background: covers ? 'transparent' : 'rgba(255,184,0,.10)',
                   color: covers ? T.tx2 : T.amb, fontFamily: mono, fontSize: 8,
                   fontWeight: 700, letterSpacing: '.8px' }
        }, chart ? 'CERRAR CARTA' : 'VER CARTA DE SUPERFICIE OFICIAL (DWD · ~5 MB)')));

      if (chart) kids.push(h('div', { key: 'chart', style: { marginTop: 9 } },
        h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx3, letterSpacing: '1.2px', marginBottom: 5 } },
          (chart.product || '').toUpperCase() + ' · ' + (chart.area || '')),
        h('div', { style: { borderRadius: 10, overflow: 'auto', border: '1px solid ' + T.line,
                            background: '#fff', maxHeight: 420, WebkitOverflowScrolling: 'touch' } },
          h('img', { src: chart.url, alt: 'Carta de superficie DWD',
                     style: { display: 'block', width: '190%', maxWidth: 'none' } })),
        h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx3, marginTop: 5, lineHeight: 1.5 } },
          'Arrastra dentro del recuadro para moverte. Fuente: ' + (chart.source || 'DWD') + '.')));
    }

    /* filtro por nivel — sólo ALTO */
    if (band === 'high') kids.push(h('div', { key: 'fl', style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      marginTop: 9, border: '1px solid ' + T.line, borderRadius: 9, padding: '8px 10px',
      background: T.surf1, boxShadow: T.cardSh
    } },
      h('div', { style: { fontFamily: mono, fontSize: 8.5, letterSpacing: '.6px', color: T.tx2 } },
        'SÓLO MI NIVEL · FL' + CRUISE,
        h('small', { style: { display: 'block', color: T.tx2, fontSize: 7, marginTop: 2 } },
          'atenúa lo que no corta el crucero')),
      h('div', {
        onClick: function () { setFlOnly(!flOnly); setSel(null); },
        style: { width: 38, height: 21, borderRadius: 11, position: 'relative', cursor: 'pointer', flex: 'none',
                 border: '1px solid ' + (flOnly ? T.cyan : T.line),
                 background: flOnly ? 'rgba(126,251,254,.18)' : 'rgba(0,0,0,.25)' }
      }, h('i', { style: { position: 'absolute', top: 2, left: flOnly ? 20 : 2, width: 15, height: 15,
                           borderRadius: '50%', background: flOnly ? T.cyan : T.tx3, transition: '.16s' } }))));

    /* ficha del fenómeno seleccionado */
    var sk = selKey();
    if (sel && sk) {
      var rows = [];
      var p = sel.p;
      if (sk === 'JET') {
        var mx = 0, hh2 = null;
        (p.fleche || []).forEach(function (a) { if (a.s > mx) { mx = a.s; hh2 = a.h; } });
        if (mx) rows.push(['VIENTO MÁXIMO', mx + ' kt']);
        if (hh2) rows.push(['NIVEL DEL NÚCLEO', 'FL' + hh2]);
      } else if (sk === 'TROP') {
        rows.push(['ALTURA', 'FL' + p.height]);
      } else if (sk === 'VOLC' || sk === 'TC') {
        rows.push(['NOMBRE', p.name || '—']);
      } else {
        if (p.severity) rows.push(['INTENSIDAD', SEV[p.severity] || p.severity.toUpperCase()]);
        if (p.extent) rows.push(['EXTENSIÓN', EXT[p.extent] || p.extent]);
        rows.push([sk === 'CB' ? 'TOPE' : 'CAPA AFECTADA', bandTxt(p, sk)]);
        rows.push(['TU FL' + CRUISE, affects(p, sk, CRUISE) ? '⚠ DENTRO' : '✓ FUERA']);
      }
      kids.push(h(Panel, { key: 'sel', style: { padding: '10px 11px', marginTop: 9, border: '1px solid ' + LC(sk) + '33' } },
        h('div', { style: { fontSize: 7, fontFamily: mono, color: LC(sk), letterSpacing: '1.2px', marginBottom: 6 } }, LAY[sk].name),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 } },
          rows.map(function (r, i) {
            var warn = /DENTRO/.test(r[1]);
            return h('div', { key: i },
              h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx3, marginBottom: 2 } }, r[0]),
              h('div', { style: { fontSize: 11, fontWeight: 700, fontFamily: mono, color: warn ? T.red : T.tx1 } }, r[1]));
          })),
        sk === 'CB' ? h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx3, marginTop: 7, lineHeight: 1.5 } },
          'La carta da el TOPE del CB; no publica base (base "XXX"), así que aquí tampoco se inventa.') : null));
    } else if (data && band === 'high') {
      kids.push(h(Panel, { key: 'sel0', style: { padding: '10px 11px', marginTop: 9 } },
        h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx2, letterSpacing: '1.2px', marginBottom: 4 } },
          'TOCA UN FENÓMENO EN EL MAPA'),
        h('div', { style: { fontSize: 9, color: T.tx2, lineHeight: 1.5 } },
          'Áreas, chorro y contornos son seleccionables: dan intensidad y niveles exactos.')));
    }

    /* ruta */
    kids.push(h('div', { key: 'rt-eb', style: Object.assign({}, eyebrow, { marginTop: 16 }) }, 'RUTA DEL VUELO'));
    kids.push(h(Panel, { key: 'rt', style: { padding: '10px 11px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontSize: 7, fontFamily: mono, letterSpacing: '1.2px', marginBottom: 3,
                              color: route ? ((route.src === 'db' || route.src === 'ofp') ? T.cyan : RUTA) : T.tx3 } },
            route ? route.label : 'GRAN CÍRCULO'),
          h('div', { style: { fontSize: 9, color: T.tx2, fontFamily: mono, lineHeight: 1.5 } },
            route && route.src === 'ofp'
              ? ((ofp && ofp.meta && ofp.meta.ofpRoute ? 'Ruta ' + ofp.meta.ofpRoute + ' · ' : 'Del plan de vuelo: ')
                 + route.pts.length + ' puntos'
                 + (ofp && ofp.guardada ? ' · guardada en la base' : ''))
              : route && route.src === 'paste'
                ? 'Puntos pegados a mano: ' + route.pts.length + '.'
                : route && route.src === 'db'
                  ? 'Ruta guardada para ' + leg.dep + '–' + leg.arr + '. Es la que manda.'
                  : route && route.src === 'adsb'
                    ? 'Traza real ' + (route.reg ? route.reg + ' · ' : '') + (route.samples || route.pts.length) + ' posiciones · adsb.lol (ODbL)'
                    : 'No hay ruta guardada ni traza en el aire: línea recta entre aeropuertos, no es por donde se pasa.'))),

      /* ── adjuntar el OFP: la via buena, porque las coordenadas no las tiene
         el piloto y aqui no hace falta que las tenga ── */
      h('label', {
        style: { marginTop: 9, width: '100%', padding: '10px 8px', borderRadius: 8,
                 cursor: ofpBusy ? 'wait' : 'pointer', display: 'block', textAlign: 'center',
                 border: '1px solid ' + T.cyan, background: T.cyan + '18', color: T.cyan,
                 fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '.8px',
                 opacity: ofpBusy ? .6 : 1 }
      },
        ofpBusy ? 'LEYENDO EL OFP…' : '📎 ADJUNTAR OFP (PDF)',
        h('input', {
          type: 'file', accept: 'application/pdf,.pdf', disabled: ofpBusy,
          onChange: function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; subeOfp(f); },
          style: { display: 'none' }
        })),

      ofp ? h('div', { style: { marginTop: 8, padding: '9px 10px', borderRadius: 9,
                                border: '1px solid ' + T.line, background: T.surf1 } },
        h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx3, letterSpacing: '1.2px', marginBottom: 5 } },
          'LEIDO DEL OFP' + (ofp.meta.ofpRoute ? ' · RUTA ' + ofp.meta.ofpRoute : '')),
        h('div', { style: { fontSize: 9, fontFamily: mono, color: T.tx2, lineHeight: 1.6 } },
          [ofp.meta.flight, ofp.meta.callsign].filter(Boolean).join(' · ') + (ofp.meta.reg ? '  ' + ofp.meta.reg : '') +
          (ofp.meta.acType ? ' ' + ofp.meta.acType : ''),
          h('br'),
          (ofp.meta.dep || '?') + '/' + (ofp.meta.rwyDep || '--') + ' → ' + (ofp.meta.arr || '?') + '/' + (ofp.meta.rwyArr || '--') +
          (ofp.meta.altn ? '   ALTN ' + ofp.meta.altn : ''),
          h('br'),
          (ofp.meta.cruiseFL ? 'FL' + ofp.meta.cruiseFL + '   ' : '') + ofp.distNm + ' NM   ' +
          ofp.pts.length + ' puntos'),
        /* ★ la comprobacion, a la vista: dos fuentes independientes tienen que
           coincidir, y si no coinciden el piloto tiene que enterarse */
        ofp.control && ofp.control.tramos ? h('div', {
          style: { fontSize: 7.5, fontFamily: mono, marginTop: 6, lineHeight: 1.5,
                   color: ofp.control.peor <= 3 ? T.grn : T.amb }
        }, (ofp.control.peor <= 3 ? '✓ ' : '⚠ ') + 'contraste base de puntos vs distancias del OFP: ' +
           ofp.control.medio + ' NM de media, ' + ofp.control.peor + ' NM el peor (' + ofp.control.tramos + ' tramos)') : null,
        ofp.interpolados ? h('div', { style: { fontSize: 7, fontFamily: mono, color: T.tx3, marginTop: 5, lineHeight: 1.5 } },
          ofp.resueltos + ' puntos salen de la base; ' + ofp.interpolados + ' no estan en ella y se colocan por su distancia en el OFP: ' +
          ofp.desconocidos.slice(0, 6).join(' ') + (ofp.desconocidos.length > 6 ? '…' : '')) : null) : null));

    /* procedencia — siempre visible, no en un "acerca de" */
    kids.push(h('div', { key: 'src', style: {
      fontFamily: mono, fontSize: 7, color: T.tx2, lineHeight: 1.6, marginTop: 10,
      paddingTop: 9, borderTop: '1px solid rgba(126,251,254,0.07)'
    } },
      'Datos: WAFS SigWx de los WAFC de Londres y Washington, vía NOAA/AWC. ',
      h('b', { style: { color: T.amb } }, 'Esta representación no es una carta de briefing'),
      ' — la propia AWC lo advierte de la suya. Para la carta oficial, el OFP. ',
      'Horas en Z. Traza de ruta: adsb.lol (ODbL).'));

    return h('div', { className: 'sigwx-mod' }, kids);
  };
})();
