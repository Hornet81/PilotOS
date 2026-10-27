/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — las figuras del documento «Cómo funciona»

   Cada sección del documento (documento.js) lleva un dibujo de la parte de la
   pantalla de la que habla, con sus piezas numeradas y explicadas debajo. Son
   esquemas en SVG, no capturas: se leen en los dos temas (colores por las
   variables --f-* de fatiga.css), no pesan y no hay que rehacerlos cuando
   cambia un dato. Las cifras de ejemplo son de un día inventado y lo dice el
   pie de cada figura.

   Uso: FatigaDocFig.html('hoy', 'es') → '<figure …>'. Un nombre que no existe
   devuelve '' (el documento sigue sin la figura).
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var C = { tx: 'var(--f-tx)', mut: 'var(--f-mut)', line: 'var(--f-line)', acc: 'var(--f-acc)', red: 'var(--f-red)', amb: 'var(--f-amb)', teal: 'var(--f-teal)', blue: 'var(--f-blue)', vio: 'var(--f-vio)', glass: 'var(--f-glass)', track: 'var(--f-track)', tip: 'var(--f-tip)' };
  function t(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.fs || 10) + '" fill="' + (o.c || C.tx) + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + (o.w ? ' font-weight="' + o.w + '"' : '') + (o.mono ? ' font-family="JetBrains Mono,monospace"' : ' font-family="Space Grotesk,sans-serif"') + '>' + esc(s) + '</text>';
  }
  /* Un número en un círculo: la llamada que se explica en el pie. */
  function n(x, y, k) {
    return '<circle cx="' + x + '" cy="' + y + '" r="7" fill="' + C.acc + '"/>' + '<text x="' + x + '" y="' + (y + 3.5) + '" font-size="9" font-weight="700" text-anchor="middle" fill="var(--f-accOn)" font-family="Space Grotesk,sans-serif">' + k + '</text>';
  }
  function caja(x, y, w, h, r) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 8) + '" fill="' + C.glass + '" stroke="' + C.line + '"/>'; }
  function arcPath(cx, cy, r, v1, v2) {
    function p(v) { var a = Math.PI * (1 - (v - 2) / 12); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    var a = p(v1), b = p(v2);
    return 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1);
  }

  var F = {};

  /* 1 · Qué hace: la pestaña Hoy. */
  F.hoy = function (L) {
    var cx = 160, cy = 118, s = '';
    s += caja(4, 4, 312, 142, 12);
    s += '<path d="' + arcPath(cx, cy, 84, 2, 7) + '" stroke="' + C.red + '" stroke-width="10" fill="none"/>';
    s += '<path d="' + arcPath(cx, cy, 84, 7, 8.5) + '" stroke="' + C.amb + '" stroke-width="10" fill="none"/>';
    s += '<path d="' + arcPath(cx, cy, 84, 8.5, 14) + '" stroke="' + C.teal + '" stroke-width="10" fill="none"/>';
    var a = Math.PI * (1 - (10.2 - 2) / 12);
    s += '<line x1="' + (cx + 64 * Math.cos(a)).toFixed(1) + '" y1="' + (cy - 64 * Math.sin(a)).toFixed(1) + '" x2="' + (cx + 92 * Math.cos(a)).toFixed(1) + '" y2="' + (cy - 92 * Math.sin(a)).toFixed(1) + '" stroke="' + C.tx + '" stroke-width="3" stroke-linecap="round"/>';
    s += t(cx, 100, '10.2', { fs: 24, w: 700, a: 'middle', mono: 1 });
    s += '<rect x="' + (cx - 46) + '" y="108" width="92" height="16" rx="8" fill="var(--f-tealBg)"/>' + t(cx, 120, L('BAJO · KSS ≈ 4', 'LOW · KSS ≈ 4'), { fs: 9, w: 700, a: 'middle', c: 'var(--f-tealTx)' });
    s += t(14, 22, L('VIGILIA (A)', 'ALERTNESS (A)'), { fs: 8, c: C.mut, w: 700 });
    s += n(cx - 58, 92, 1) + n(cx + 58, 116, 2) + n(cx + 96, 40, 3);
    s += caja(4, 152, 312, 30, 10) + t(14, 171, L('Momento más crítico · Aterrizaje BCN → VGO', 'Most critical moment · Landing BCN → VGO'), { fs: 10, w: 600 }) + t(306, 171, '09:20', { fs: 11, w: 700, a: 'end', mono: 1 }) + n(260, 167, 4);
    return { svg: s, h: 188, pie: [
      L('La vigilia prevista (A) en tu peor aterrizaje. Cuanto más alta, más despierto.', 'Forecast alertness (A) at your worst landing. Higher means more alert.'),
      L('El nivel y su equivalente en la escala KSS de somnolencia.', 'The level and its equivalent on the KSS sleepiness scale.'),
      L('La aguja sobre los colores: rojo alto, ámbar moderado, verde azulado bajo.', 'The pointer on the colours: red high, amber moderate, teal low.'),
      L('Qué aterrizaje es el más delicado y a qué hora (de tu base).', 'Which landing is the most delicate and when (base time).')] };
  };

  /* 2 · De dónde salen los datos: una jornada del roster. */
  F.roster = function (L) {
    var s = '', x0 = 20, w = 280;
    function X(h) { return x0 + (h - 5) / 12 * w; }
    s += '<line x1="' + x0 + '" y1="62" x2="' + (x0 + w) + '" y2="62" stroke="' + C.track + '" stroke-width="2"/>';
    for (var h = 6; h <= 16; h += 2) s += t(X(h), 80, String(h).padStart(2, '0') + ':00', { fs: 8, a: 'middle', c: C.mut, mono: 1 });
    s += '<rect x="' + X(6.58) + '" y="40" width="3" height="30" fill="' + C.amb + '"/>' + t(X(6.58), 34, L('Firma', 'Report'), { fs: 9, a: 'middle', w: 600 });
    [[7.4, 9.2, 'BCN→VGO'], [9.9, 11.6, 'VGO→BCN'], [12.4, 14.1, 'BCN→PMI']].forEach(function (g, i) {
      s += '<rect x="' + X(g[0]) + '" y="52" width="' + (X(g[1]) - X(g[0])) + '" height="20" rx="5" fill="var(--f-ambBg)" stroke="' + C.amb + '"/>' + t((X(g[0]) + X(g[1])) / 2, 66, g[2], { fs: 8, a: 'middle', mono: 1 });
      s += '<circle cx="' + X(g[1]) + '" cy="48" r="4" fill="' + C.acc + '"/>';
    });
    s += n(X(6.58) - 12, 50, 1) + n(X(9.2) + 6, 30, 2) + n(x0 + w - 6, 96, 3);
    s += t(x0 + w, 112, L('hora de tu base (Madrid · Canarias)', 'your base time (Madrid · Canaries)'), { fs: 9, a: 'end', c: C.mut });
    return { svg: s, h: 120, pie: [
      L('La firma: de ella sale cuándo tienes que levantarte.', 'The report time: it decides when you have to get up.'),
      L('Cada aterrizaje (punto verde) se evalúa; manda el peor.', 'Every landing (green dot) is evaluated; the worst one counts.'),
      L('Todo se mide con la hora de tu cuerpo, que es la de tu base.', 'Everything is measured in your body\'s time, which is your base time.')] };
  };

  /* 3 · El modelo: A = S + C + W a lo largo de un día. */
  F.modelo = function (L) {
    var s = '', x0 = 26, w = 280, y0 = 20, hgt = 100;
    function X(h) { return x0 + h / 24 * w; }
    function Y(v, lo, hi) { return y0 + hgt - (v - lo) / (hi - lo) * hgt; }
    var pS = '', pC = '', pW = '', pA = '';
    for (var i = 0; i <= 96; i++) {
      var h = i / 4, awake = h >= 7, ta = h - 7;
      var S = awake ? 2.4 + (14.3 - 2.4) * Math.exp(-0.0353 * ta) : 14.3 - (14.3 - 7) * Math.exp(-0.381 * (h + 1));
      var Cc = 2.5 * Math.cos(2 * Math.PI * (h - 16.8) / 24);
      var Wv = awake ? -5.72 * Math.exp(-1.51 * ta) : 0;
      var A = S + Cc + Wv;
      var cmd = i ? 'L' : 'M';
      pS += cmd + X(h).toFixed(1) + ' ' + Y(S, 0, 16).toFixed(1);
      pC += cmd + X(h).toFixed(1) + ' ' + Y(Cc + 8, 0, 16).toFixed(1);
      if (awake) pW += (pW ? 'L' : 'M') + X(h).toFixed(1) + ' ' + Y(Wv + 8, 0, 16).toFixed(1);
      if (awake) pA += (pA ? 'L' : 'M') + X(h).toFixed(1) + ' ' + Y(A, 0, 16).toFixed(1);
    }
    s += '<rect x="' + X(0) + '" y="' + y0 + '" width="' + (X(7) - X(0)) + '" height="' + hgt + '" fill="var(--f-tip)"/>' + t(X(3.5), y0 + 12, L('durmiendo', 'asleep'), { fs: 8, a: 'middle', c: C.mut });
    s += '<path d="' + pS + '" stroke="' + C.blue + '" stroke-width="1.6" fill="none"/>';
    s += '<path d="' + pC + '" stroke="' + C.vio + '" stroke-width="1.6" fill="none" stroke-dasharray="4 3"/>';
    s += '<path d="' + pW + '" stroke="' + C.amb + '" stroke-width="1.6" fill="none"/>';
    s += '<path d="' + pA + '" stroke="' + C.acc + '" stroke-width="3" fill="none"/>';
    [0, 6, 12, 18, 24].forEach(function (h) { s += t(X(h), y0 + hgt + 12, String(h).padStart(2, '0') + 'h', { fs: 8, a: 'middle', c: C.mut, mono: 1 }); });
    var ley = [[C.acc, 'A', L('vigilia', 'alertness')], [C.blue, 'S', L('presión de sueño', 'sleep pressure')], [C.vio, 'C', L('ritmo circadiano', 'circadian rhythm')], [C.amb, 'W', L('inercia al despertar', 'waking inertia')]];
    ley.forEach(function (l, i) { var x = 8 + (i % 2) * 156, y = y0 + hgt + 30 + Math.floor(i / 2) * 15; s += '<rect x="' + x + '" y="' + (y - 7) + '" width="14" height="4" rx="2" fill="' + l[0] + '"/>' + t(x + 20, y - 2, l[1] + ' · ' + l[2], { fs: 9 }); });
    return { svg: s, h: 170, pie: [
      L('Un día cualquiera: duermes hasta las 07:00 y luego estás despierto. La línea gruesa (A) es la suma de las otras tres.', 'Any day: you sleep until 07:00 and then stay awake. The thick line (A) is the sum of the other three.')] };
  };

  /* 4 · Los niveles. */
  F.niveles = function (L) {
    var s = '', x0 = 46, w = 262;
    function X(v) { return x0 + (v - 2) / 12 * w; }
    s += '<rect x="' + X(2) + '" y="30" width="' + (X(7) - X(2)) + '" height="16" rx="4" fill="' + C.red + '"/>';
    s += '<rect x="' + X(7) + '" y="30" width="' + (X(8.5) - X(7)) + '" height="16" fill="' + C.amb + '"/>';
    s += '<rect x="' + X(8.5) + '" y="30" width="' + (X(14) - X(8.5)) + '" height="16" rx="4" fill="' + C.teal + '"/>';
    s += t((X(2) + X(7)) / 2, 22, L('ALTO', 'HIGH'), { fs: 9, w: 700, a: 'middle', c: 'var(--f-redTx)' });
    s += t((X(7) + X(8.5)) / 2, 22, L('MOD.', 'MOD.'), { fs: 9, w: 700, a: 'middle', c: 'var(--f-ambTx)' });
    s += t((X(8.5) + X(14)) / 2, 22, L('BAJO', 'LOW'), { fs: 9, w: 700, a: 'middle', c: 'var(--f-tealTx)' });
    [2, 4, 6, 7, 8.5, 10, 12, 14].forEach(function (v) { s += t(X(v), 60, String(v).replace('.', L(',', '.')), { fs: 8, a: 'middle', mono: 1, c: C.mut }); });
    s += t(6, 60, 'A', { fs: 9, w: 700 });
    [2, 4, 6, 7, 8.5, 10, 12, 14].forEach(function (v) { var k = Math.round((10.6 - 0.6 * v) * 10) / 10; s += t(X(v), 78, String(k).replace('.', L(',', '.')), { fs: 8, a: 'middle', mono: 1, c: C.mut }); });
    s += t(6, 78, 'KSS', { fs: 9, w: 700 });
    return { svg: s, h: 88, pie: [L('Arriba la vigilia A; debajo, la misma cifra en la escala KSS (1 muy despierto · 9 luchando contra el sueño).', 'Top, alertness A; below, the same figure on the KSS scale (1 very alert · 9 fighting sleep).')] };
  };

  /* 5 · Cómo se estima tu sueño: una noche antes de un madrugón. */
  F.sueno = function (L) {
    var s = '', x0 = 14, w = 292;
    function X(h) { return x0 + (h - 20) / 20 * w; }   // de 20:00 a 16:00 del día siguiente
    s += '<rect x="' + X(26) + '" y="24" width="' + (X(30) - X(26)) + '" height="46" fill="var(--f-vio)" opacity=".18"/>' + t((X(26) + X(30)) / 2, 20, L('ventana baja 02–06', 'low window 02–06'), { fs: 8, a: 'middle', c: C.vio });
    s += '<rect x="' + X(21.5) + '" y="40" width="' + (X(29.33) - X(21.5)) + '" height="16" rx="5" fill="' + C.blue + '" opacity=".85"/>' + t((X(21.5) + X(29.33)) / 2, 51, L('sueño estimado', 'estimated sleep'), { fs: 9, a: 'middle', w: 700, c: '#062a5a' });
    s += '<rect x="' + X(29.33) + '" y="44" width="' + (X(30.83) - X(29.33)) + '" height="8" rx="3" fill="' + C.mut + '" opacity=".5"/>';
    s += '<rect x="' + X(30.83) + '" y="40" width="' + (X(38.5) - X(30.83)) + '" height="16" rx="5" fill="var(--f-ambBg)" stroke="' + C.amb + '"/>' + t((X(30.83) + X(38.5)) / 2, 51, L('jornada', 'duty'), { fs: 9, a: 'middle', w: 700 });
    s += '<line x1="' + x0 + '" y1="76" x2="' + (x0 + w) + '" y2="76" stroke="' + C.track + '"/>';
    [20, 24, 28, 32, 36, 40].forEach(function (h) { s += t(X(h), 88, String(h % 24).padStart(2, '0') + ':00', { fs: 8, a: 'middle', mono: 1, c: C.mut }); });
    s += n(X(21.5), 34, 1) + n(X(29.33), 66, 2) + n(X(30.83) + 6, 34, 3) + n(X(38.5), 66, 4);
    return { svg: s, h: 96, pie: [
      L('Te acuestas: a las 23:00, o antes (hasta las 21:30) si al día siguiente madrugas.', 'You go to bed: at 23:00, or earlier (down to 21:30) if you start early the next day.'),
      L('Te levantas el tiempo de casa a la base más el de arreglarte antes de firmar (90 min si no lo has contado).', 'You get up your home-to-base time plus your getting-ready time before reporting (90 min if you have not said).'),
      L('La firma (06:50 en el ejemplo).', 'The report (06:50 in the example).'),
      L('La jornada acaba en el último calzo más 20 minutos.', 'The duty ends at the last on-blocks plus 20 minutes.')] };
  };

  /* 6 · Tus datos de sueño: la hoja del cuestionario. */
  F.datos = function (L) {
    var s = caja(4, 4, 312, 128, 12);
    s += t(14, 24, L('¿Cuánto tardas de casa a tu base?', 'How long from home to your base?'), { fs: 10, w: 600 });
    [['10', 0], ['20', 0], ['30', 1], ['45', 0], ['60', 0], ['90', 0]].forEach(function (b, i) {
      var x = 14 + i * 45;
      s += '<rect x="' + x + '" y="32" width="41" height="26" rx="7" fill="' + (b[1] ? C.acc : C.glass) + '" stroke="' + (b[1] ? C.acc : C.line) + '"/>' + t(x + 20.5, 47, b[0] + ' min', { fs: 9, w: 600, a: 'middle', c: b[1] ? 'var(--f-accOn)' : C.tx }) + (b[1] ? t(x + 20.5, 55, L('habitual', 'typical'), { fs: 6.5, a: 'middle', c: 'var(--f-accOn)' }) : '');
    });
    s += t(14, 72, L('ARIA lo ha medido 4 veces: 38 min de mediana.', 'ARIA has measured it 4 times: 38 min median.'), { fs: 9, c: C.acc });
    s += '<rect x="14" y="82" width="292" height="40" rx="8" fill="' + C.tip + '" stroke="' + C.line + '"/>';
    s += t(22, 98, L('Cronotipo intermedio · necesitas unas 8h00', 'Chronotype: intermediate · you need about 8h00'), { fs: 9.5, w: 700 });
    s += t(22, 113, L('Con una firma a las 06:00 te levantas a las 04:30…', 'With a 06:00 report you get up at 04:30…'), { fs: 9 });
    s += n(296, 45, 1) + n(296, 69, 2) + n(296, 100, 3);
    return { svg: s, h: 138, pie: [
      L('Cada pregunta viene marcada con lo que el modelo supone sin tus datos («habitual»).', 'Each question comes with what the model assumes without your details («typical»).'),
      L('Lo que ARIA ha medido en tus briefings, para que lo compares. No cambia tu respuesta.', 'What ARIA has measured in your briefings, for you to compare. It does not change your answer.'),
      L('El resultado: tu cronotipo, lo que necesitas dormir y qué haría el modelo con una firma temprana.', 'The result: your chronotype, how much sleep you need and what the model would do with an early report.')] };
  };

  /* 7 · Qué significa cada número: las tres fichas y un motivo. */
  F.numeros = function (L) {
    var s = '';
    [[L('ÚLTIMO SUEÑO', 'LAST SLEEP'), '6h10', .77, C.teal], [L('DESPIERTO', 'AWAKE'), '9h40', .6, C.teal], [L('DEUDA 3 DÍAS', '3-DAY DEBT'), '2h20', .4, C.amb]].forEach(function (f, i) {
      var x = 4 + i * 105;
      s += caja(x, 4, 100, 50, 10) + t(x + 8, 18, f[0], { fs: 7.5, w: 700, c: C.mut }) + t(x + 8, 37, f[1], { fs: 15, w: 700, mono: 1 });
      s += '<rect x="' + (x + 8) + '" y="44" width="84" height="3" rx="1.5" fill="' + C.track + '"/><rect x="' + (x + 8) + '" y="44" width="' + (84 * f[2]) + '" height="3" rx="1.5" fill="' + f[3] + '"/>';
      s += n(x + 90, 14, i + 1);
    });
    s += caja(4, 60, 312, 26, 10) + t(16, 77, L('Madrugón: firmas a las 06:35', 'Early start: you report at 06:35'), { fs: 10, w: 600 }) + n(304, 73, 4);
    return { svg: s, h: 92, pie: [
      L('El último episodio de sueño antes de firmar (no la suma de 24 h).', 'The last sleep episode before reporting (not the 24-hour total).'),
      L('Horas desde que te levantas hasta el último aterrizaje.', 'Hours from getting up to the last landing.'),
      L('Lo que te falta para 24 h de sueño en las 72 h antes de firmar.', 'What you are short of 24 h of sleep in the 72 h before reporting.'),
      L('Cada motivo que pesa en tu jornada, con su «?» para saber por qué.', 'Each reason that weighs on your duty, with its «?» to learn why.')] };
  };

  /* 8 · El check antes de firmar. */
  F.check = function (L) {
    var s = caja(4, 4, 312, 44, 10) + t(14, 18, L('¿Cómo de despierto estás? (KSS)', 'How alert are you? (KSS)'), { fs: 9, w: 600 });
    for (var k = 1; k <= 9; k++) { var x = 14 + (k - 1) * 33, on = k === 4; s += '<rect x="' + x + '" y="24" width="29" height="18" rx="5" fill="' + (on ? C.acc : C.glass) + '" stroke="' + (on ? C.acc : C.line) + '"/>' + t(x + 14.5, 37, String(k), { fs: 10, w: 700, a: 'middle', c: on ? 'var(--f-accOn)' : C.tx, mono: 1 }); }
    s += '<rect x="4" y="54" width="312" height="70" rx="12" fill="' + C.tip + '" stroke="' + C.line + '" stroke-dasharray="4 3"/>';
    s += '<circle cx="160" cy="80" r="12" fill="' + C.amb + '"/>' + t(160, 112, L('toca cuando se encienda · 3 min', 'tap when it lights up · 3 min'), { fs: 9, a: 'middle', c: C.mut });
    s += t(300, 80, '287 ms', { fs: 11, w: 700, a: 'end', mono: 1 });
    s += n(304, 14, 1) + n(186, 72, 2) + n(270, 96, 3);
    return { svg: s, h: 130, pie: [
      L('Cómo te notas, del 1 (muy despierto) al 9 (luchando contra el sueño).', 'How you feel, from 1 (very alert) to 9 (fighting sleep).'),
      L('La luz se enciende cada 2 a 5 segundos al azar.', 'The light comes on at random every 2 to 5 seconds.'),
      L('Tu tiempo de reacción. Se compara con tu propia base en este teléfono.', 'Your reaction time. It is compared with your own baseline on this phone.')] };
  };

  /* 9 · El plan: siesta, descanso controlado y café sobre la jornada. */
  F.plan = function (L) {
    var s = '', x0 = 14, w = 292;
    function X(h) { return x0 + (h - 10) / 14 * w; }   // de 10:00 a 24:00
    s += '<rect x="' + X(13.5) + '" y="34" width="' + (X(14.0) - X(13.5)) + '" height="14" rx="4" fill="' + C.blue + '"/>' + t(X(13.75), 28, L('siesta 20 min', '20-min nap'), { fs: 8, a: 'middle', c: C.blue, w: 700 });
    s += '<rect x="' + X(16) + '" y="52" width="' + (X(23.4) - X(16)) + '" height="16" rx="5" fill="var(--f-ambBg)" stroke="' + C.amb + '"/>' + t(X(16) + 6, 63, L('jornada', 'duty'), { fs: 8.5, w: 600 });
    s += '<rect x="' + X(19.2) + '" y="55" width="' + (X(19.53) - X(19.2)) + '" height="10" rx="3" fill="' + C.blue + '"/>' + t(X(19.37), 84, L('descanso 20′', 'rest 20′'), { fs: 8, a: 'middle', c: C.blue, w: 700 });
    s += '<circle cx="' + X(21.8) + '" cy="42" r="5" fill="' + C.amb + '"/>' + t(X(21.8), 30, L('café', 'coffee'), { fs: 8, a: 'middle', c: 'var(--f-ambTx)', w: 700 });
    s += '<rect x="' + X(22.7) + '" y="38" width="' + (X(24) - X(22.7)) + '" height="8" fill="' + C.red + '" opacity=".25"/>';
    [10, 14, 18, 22].forEach(function (h) { s += t(X(h), 100, h + ':00', { fs: 8, a: 'middle', mono: 1, c: C.mut }); });
    s += '<line x1="' + x0 + '" y1="90" x2="' + (x0 + w) + '" y2="90" stroke="' + C.track + '"/>';
    s += caja(4, 108, 312, 28, 10) + t(14, 126, L('Vigilia en el aterrizaje', 'Alertness at landing'), { fs: 9, w: 600 }) + t(306, 126, '7,4 → 8,3', { fs: 11, w: 700, a: 'end', mono: 1, c: C.acc });
    s += n(X(13.75) - 16, 41, 1) + n(X(19.37) + 14, 60, 2) + n(X(21.8) + 12, 42, 3) + n(200, 122, 4);
    return { svg: s, h: 142, pie: [
      L('Siesta antes de firmar: el modelo la suma y elige la mejor hora (calculado).', 'Nap before reporting: the model adds it and picks the best time (calculated).'),
      L('Descanso controlado en crucero, si tu OM-A lo permite (calculado).', 'Controlled rest in cruise, if your OM-A allows it (calculated).'),
      L('Café hacia una hora antes del aterrizaje crítico; la franja roja es el corte de 6 h antes de dormir (recomendación).', 'Coffee about an hour before the critical landing; the red band is the 6-hour cut-off before sleep (guidance).'),
      L('Lo que cambia la vigilia del aterrizaje con las medidas calculadas: antes → después.', 'How the calculated measures change landing alertness: before → after.')] };
  };

  function html(nombre, lg) {
    var f = F[nombre]; if (!f) return '';
    var L = function (es, en) { return lg === 'en' ? en : es; };
    var o = f(L);
    var pie = o.pie.length > 1
      ? '<ol>' + o.pie.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol>'
      : '<p>' + esc(o.pie[0]) + '</p>';
    return '<figure class="fdoc-fig" data-fig="' + nombre + '"><svg viewBox="0 0 320 ' + o.h + '" role="img" aria-label="' + esc(L('Figura: ', 'Figure: ') + o.pie.join(' ')) + '">' + o.svg + '</svg>' +
      '<figcaption>' + pie + '<span class="fdoc-fig-ej">' + esc(L('Ejemplo con un día inventado.', 'Example with a made-up day.')) + '</span></figcaption></figure>';
  }
  root.FatigaDocFig = { html: html, nombres: Object.keys(F) };
})(typeof window !== 'undefined' ? window : this);
