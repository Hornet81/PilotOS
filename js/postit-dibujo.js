/* ═══════════════════════════════════════════════════════════════════════════
   EL DIBUJO DEL POST-IT DEL CALLSIGN — UNA sola copia

   Lo usan la app (js/callsign.js: la vista previa y el vídeo que flota) y la
   página suelta de Safari (pip/postit.html). Escrito dos veces, el día que uno
   cambie la ventana flotante saldría distinta según por dónde se fije: es
   ES_AIRPORTS / ES_IATA con un dibujo.

   · COLOR: seis papeles (el primero, el degradado de PilotOS, por defecto), cada uno con su versión de DÍA (papel claro, tinta
     oscura) y de NOCHE (papel oscuro, tinta clara). No es estética: el post-it
     flota encima del EFB, y un amarillo chillón sobre la carta de noche
     deslumbra, igual que uno oscuro se pierde de día. Los contrastes se miden
     en scripts/callsign-postit-test.js (≥ 7:1, se lee desde el asiento).
   · FORMA: post-it, tarjeta o etiqueta. La ventana flotante es siempre un
     rectángulo; la forma se dibuja DENTRO.
   · LO PEQUEÑO: ruta y horas arriba, nº de chequeo de CPT y FO abajo. Lo
     grande sigue siendo el callsign, que es lo que se lee cuando te llaman.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var W = 640, H = 360;
  var COLORES = {
    // PilotOS: el degradado del logo (#08C6F8 → #613DF9), aclarado de día y
    // hundido de noche para que la tinta pase 7:1 en LOS DOS extremos. `papel2`
    // es el segundo tono: un papel con degradado se mide contra los dos.
    pilotos:  { dia: { papel: '#B5EEFD', papel2: '#CFC8FE', tinta: '#0B1446', aviso: '#5B1A0A' }, noche: { papel: '#06344C', papel2: '#20156B', tinta: '#B9EEFF', aviso: '#FDBA74' } },
    amarillo: { dia: { papel: '#FDE68A', tinta: '#1C1917', aviso: '#7C2D12' }, noche: { papel: '#262006', tinta: '#FDE68A', aviso: '#FDBA74' } },
    verde:    { dia: { papel: '#BBF7D0', tinta: '#052E16', aviso: '#7C2D12' }, noche: { papel: '#06261A', tinta: '#86EFAC', aviso: '#FDBA74' } },
    azul:     { dia: { papel: '#BAE6FD', tinta: '#082F49', aviso: '#7C2D12' }, noche: { papel: '#071E33', tinta: '#7DD3FC', aviso: '#FDBA74' } },
    rosa:     { dia: { papel: '#FBCFE8', tinta: '#4A0626', aviso: '#691F0D' }, noche: { papel: '#2E0819', tinta: '#F9A8D4', aviso: '#FDBA74' } },
    blanco:   { dia: { papel: '#F8FAFC', tinta: '#0F172A', aviso: '#7C2D12' }, noche: { papel: '#0B1220', tinta: '#E2E8F0', aviso: '#FDBA74' } }
  };
  var ORDEN_COLORES = ['pilotos', 'amarillo', 'verde', 'azul', 'rosa', 'blanco'];
  var FORMAS = ['postit', 'tarjeta', 'etiqueta'];
  // Lo que queda fuera de la forma: el fondo de la ventana flotante.
  var FONDO = { dia: '#CBD5E1', noche: '#020617' };

  function estiloDe(e) {
    e = e || {};
    return {
      color: COLORES[e.color] ? e.color : 'pilotos',
      tema: e.tema === 'dia' || e.tema === 'noche' ? e.tema : 'auto',
      forma: FORMAS.indexOf(e.forma) >= 0 ? e.forma : 'postit'
    };
  }
  /* «auto» sigue a la app (html.day lo pone el modo día automático). Se resuelve
     al pintar, que es cuando se sabe. */
  function temaDe(e, diaAhora) {
    e = estiloDe(e);
    if (e.tema !== 'auto') return e.tema;
    if (diaAhora != null) return diaAhora ? 'dia' : 'noche';
    try { return document.documentElement.classList.contains('day') ? 'dia' : 'noche'; } catch (x) { return 'dia'; }
  }
  function paleta(e, diaAhora) { e = estiloDe(e); return COLORES[e.color][temaDe(e, diaAhora)]; }

  function redondo(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  // La caja donde va el texto, según la forma (la etiqueta guarda sitio al agujero).
  // El relleno del papel: liso, o en diagonal si la paleta trae `papel2`.
  function relleno(c, p) {
    if (!p.papel2) return p.papel;
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, p.papel); g.addColorStop(1, p.papel2); return g;
  }
  /* EL RELIEVE (pedido 16-oct-2026: «que parezca un tag totalmente real»). Tres
     capas, y ninguna toca la tinta:
       1. SOMBRA que la pieza proyecta sobre el fondo (más marcada de día; de
          noche el fondo ya es casi negro y se cambia por un filo de luz).
       2. LUZ de arriba: el papel se aclara un poco arriba y se oscurece abajo,
          como un objeto iluminado desde el techo de la cabina.
       3. BISEL: un filo claro en el canto de arriba y uno oscuro en el de abajo.
     Lo pequeño de arriba y de abajo es justo donde más cambia el papel, así que
     las cantidades están medidas para que la tinta siga en ≥ 7:1 sobre el papel
     YA iluminado (lo mide el banco con el píxel de verdad). */
  var LUZ = { dia: { alto: .30, bajo: .07, sombra: 'rgba(15,23,42,.42)', filo: 'rgba(255,255,255,.75)', canto: 'rgba(15,23,42,.22)' },
              noche: { alto: .07, bajo: .22, sombra: 'rgba(0,0,0,.9)', filo: 'rgba(255,255,255,.22)', canto: 'rgba(0,0,0,.45)' } };
  function relieve(c, camino, p, tema, y0, y1) {
    var L = LUZ[tema];
    // 1 · la sombra: se rellena la forma con sombra y luego se vuelve a pintar el papel encima
    c.save(); c.shadowColor = L.sombra; c.shadowBlur = tema === 'dia' ? 18 : 14; c.shadowOffsetY = 7;
    camino(); c.fillStyle = relleno(c, p); c.fill(); c.restore();
    // 2 · la luz, recortada a la forma
    c.save(); camino(); c.clip();
    var g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,255,255,' + L.alto + ')'); g.addColorStop(.42, 'rgba(255,255,255,0)');
    g.addColorStop(.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + L.bajo + ')');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // 3 · el bisel: el trazo del contorno desplazado, que dentro del recorte deja sólo el canto
    c.lineWidth = 5;
    c.save(); c.translate(0, 2.5); camino(); c.strokeStyle = L.filo; c.stroke(); c.restore();
    c.save(); c.translate(0, -2.5); camino(); c.strokeStyle = L.canto; c.stroke(); c.restore();
    c.restore();
  }
  function forma(c, e, p, tema) {
    c.fillStyle = FONDO[tema]; c.fillRect(0, 0, W, H);
    if (e.forma === 'tarjeta') {
      relieve(c, function () { redondo(c, 12, 10, W - 24, H - 26, 34); }, p, tema, 10, H - 16);
      c.lineWidth = 6; c.strokeStyle = p.tinta; redondo(c, 24, 22, W - 48, H - 50, 26); c.globalAlpha = .55; c.stroke(); c.globalAlpha = 1;
      return { x0: 32, x1: W - 32 };
    }
    if (e.forma === 'etiqueta') {
      var tag = function () {
        c.beginPath();
        c.moveTo(96, 12); c.lineTo(W - 22, 12); c.quadraticCurveTo(W - 10, 12, W - 10, 24);
        c.lineTo(W - 10, H - 28); c.quadraticCurveTo(W - 10, H - 16, W - 22, H - 16);
        c.lineTo(96, H - 16); c.lineTo(12, H / 2 - 2); c.closePath();
      };
      relieve(c, tag, p, tema, 12, H - 16);
      // El agujero: un ojal con su arandela, hundido (sombra dentro, luz abajo).
      var hx = 70, hy = H / 2 - 2;
      c.beginPath(); c.arc(hx, hy, 22, 0, Math.PI * 2); c.fillStyle = p.tinta; c.globalAlpha = .16; c.fill(); c.globalAlpha = 1;
      c.beginPath(); c.arc(hx, hy, 15, 0, Math.PI * 2); c.fillStyle = FONDO[tema]; c.fill();
      c.save(); c.beginPath(); c.arc(hx, hy, 15, 0, Math.PI * 2); c.clip();
      c.beginPath(); c.arc(hx, hy + 5, 15, 0, Math.PI * 2); c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,' + (tema === 'dia' ? .28 : .6) + ')'; c.stroke(); c.restore();
      c.beginPath(); c.arc(hx, hy, 15, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = p.tinta; c.globalAlpha = .45; c.stroke(); c.globalAlpha = 1;
      // y el cordel que lo cuelga, saliendo por el borde: es lo que dice «esto es una etiqueta»
      c.save(); c.lineCap = 'round'; c.lineWidth = 5; c.strokeStyle = tema === 'dia' ? '#7C5A3A' : '#A08360';
      c.beginPath(); c.moveTo(hx - 9, hy - 9); c.quadraticCurveTo(30, 96, 2, 70); c.stroke();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(hx - 10, hy - 11); c.quadraticCurveTo(30, 93, 2, 67); c.stroke(); c.restore();
      return { x0: 104, x1: W - 22 };
    }
    // post-it: la hoja suelta sobre el fondo, con la tira de pegamento arriba y la esquina doblada abajo a la derecha
    var X0 = 14, Y0 = 8, X1 = W - 14, Y1 = H - 18, F = 46;
    var hoja = function () { c.beginPath(); c.moveTo(X0, Y0); c.lineTo(X1, Y0); c.lineTo(X1, Y1 - F); c.lineTo(X1 - F, Y1); c.lineTo(X0, Y1); c.closePath(); };
    relieve(c, hoja, p, tema, Y0, Y1);
    c.fillStyle = p.tinta; c.globalAlpha = .08; c.fillRect(X0, Y0, X1 - X0, 12); c.globalAlpha = 1;
    // la esquina doblada: su sombra sobre la hoja y la solapa con su propio degradado
    c.save(); c.shadowColor = 'rgba(0,0,0,' + (tema === 'dia' ? .3 : .7) + ')'; c.shadowBlur = 8; c.shadowOffsetX = -3; c.shadowOffsetY = -3;
    c.beginPath(); c.moveTo(X1, Y1 - F); c.lineTo(X1 - F, Y1 - F); c.lineTo(X1 - F, Y1); c.closePath();
    var gs = c.createLinearGradient(X1 - F, Y1 - F, X1 - F / 2, Y1 - F / 2);
    gs.addColorStop(0, p.papel2 || p.papel); gs.addColorStop(1, p.papel); c.fillStyle = gs; c.fill(); c.restore();
    c.beginPath(); c.moveTo(X1, Y1 - F); c.lineTo(X1 - F, Y1 - F); c.lineTo(X1 - F, Y1); c.closePath();
    var gd = c.createLinearGradient(X1 - F, Y1 - F, X1 - F / 2, Y1 - F / 2);
    gd.addColorStop(0, 'rgba(0,0,0,' + (tema === 'dia' ? .16 : .35) + ')'); gd.addColorStop(1, 'rgba(255,255,255,' + (tema === 'dia' ? .35 : .08) + ')');
    c.fillStyle = gd; c.fill();
    return { x0: 34, x1: W - 34, xb1: X1 - F - 14 };   // abajo, la línea pequeña no puede meterse bajo la esquina doblada
  }

  /* Las sillas de ruedas por tipo: WCHR (puede subir escaleras), WCHS (no
     sube escaleras), WCHC (inmovilizada). Se escriben en ese orden, que es el de
     menos a más asistencia, y sólo las que hay: «WCH R2 S1 C4». Un post-it sin
     tipos de antes (`wch`) sigue diciendo «WCH 2». */
  function wchTxt(d) {
    var o = [];
    ['R', 'S', 'C'].forEach(function (k) { var n = +d['wch' + k] || 0; if (n > 0) o.push(k + n); });
    if (o.length) return 'WCH ' + o.join(' ');
    return d.wch && +d.wch > 0 ? 'WCH ' + d.wch : '';
  }
  /* datos: { cs, fl, conf, dep, arr, std, sta, suf, cpt, fo, pax, wchR, wchS, wchC (wch: el de antes, sin tipo) }
     txt:   { sinConf } — los rótulos ya en el idioma de quien pinta. */
  function pinta(cv, datos, estilo, txt, diaAhora) {
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    var c = cv.getContext('2d'), e = estiloDe(estilo), tema = temaDe(e, diaAhora), p = COLORES[e.color][tema];
    var d = datos || {}, t = txt || {};
    var caja = forma(c, e, p, tema), cx = (caja.x0 + caja.x1) / 2, ancho = caja.x1 - caja.x0;
    var MONO = '"Space Mono", ui-monospace, Menlo, monospace';
    c.textBaseline = 'middle'; c.fillStyle = p.tinta;

    // Arriba, pequeño: ruta a la izquierda, horas a la derecha.
    var ruta = d.dep && d.arr ? d.dep + ' → ' + d.arr : '';
    var horas = d.std || d.sta ? (d.std || '··:··') + '–' + (d.sta || '··:··') + (d.suf ? ' ' + d.suf : '') : '';
    c.font = '700 27px ' + MONO;
    if (ruta) { c.textAlign = 'left'; c.fillText(ruta, caja.x0 + 8, 44); }
    if (horas) { c.textAlign = ruta ? 'right' : 'center'; c.fillText(horas, ruta ? caja.x1 - 8 : cx, 44); }

    // El callsign, grande; se encoge para caber.
    var cs = d.cs || '—', tam = 124;
    c.textAlign = 'center';
    do { c.font = '800 ' + tam + 'px ' + MONO; tam -= 4; } while (c.measureText(cs).width > ancho - 16 && tam > 60);
    c.fillText(cs, cx, 168);

    // Debajo, el nº de vuelo; y si no está confirmado, se dice EN el post-it.
    c.font = '700 50px ' + MONO;
    c.fillText(d.fl || '', cx, 252);
    if (d.cs && !d.conf) {
      c.font = '800 21px -apple-system, system-ui, sans-serif'; c.fillStyle = p.aviso;
      c.fillText(t.sinConf || 'SIN CONFIRMAR', cx, 86);
      c.fillStyle = p.tinta;
    }

    // Abajo, pequeño: nº de chequeo de los dos pilotos, pasajeros y sillas de
    // ruedas (WCH). La WCH sólo si hay alguna: un «WCH 0» es ruido. Se encoge
    // para caber, nunca se corta.
    var trip = [];
    if (d.cpt) trip.push('CPT ' + d.cpt);
    if (d.fo) trip.push('FO ' + d.fo);
    if (d.pax) trip.push('PAX ' + d.pax);
    var w = wchTxt(d);
    if (w) trip.push(w);
    if (trip.length) {
      var linea = trip.join(trip.length > 2 ? '  ·  ' : '   ·   '), tl = 27;
      var anchoB = 2 * (Math.min(caja.xb1 || caja.x1, caja.x1) - cx);
      do { c.font = '700 ' + tl + 'px ' + MONO; tl -= 1; } while (c.measureText(linea).width > anchoB - 16 && tl > 16);
      c.fillText(linea, cx, 316);
    }
    return { tema: tema, paleta: p };
  }

  root.PilotosPostit = { W: W, H: H, COLORES: COLORES, ORDEN_COLORES: ORDEN_COLORES, FORMAS: FORMAS, FONDO: FONDO,
    estiloDe: estiloDe, temaDe: temaDe, paleta: paleta, pinta: pinta, wchTxt: wchTxt, LUZ: LUZ };
})(typeof window !== 'undefined' ? window : this);
