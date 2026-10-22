/* ════════════════════════════════════════════════════════════════════════════
   SWAP · motor de reglas (UMD): lo usan el cliente (js/swap.js) y el servidor
   (swap-routes.js, Swap Board). Una sola copia de las reglas: si el Swap y el
   tablón comprobaran distinto, el mismo cambio saldría ✓ en un sitio y ✗ en otro.

   Días = tarjetas de swap-routes.dayCard: minutos UTC desde las 00:00 del día.
   check() devuelve quién falla como 'me' / 'them'; los nombres los pone quien pinta.
   ════════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.SwapMotor = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VUELING_MIN = 13 * 60 + 30, FTL_MIN = 12 * 60, POST = 20, MAX7 = 60 * 60, STBY3_HUECO = 5;
  /* ⏳ POR CONFIRMAR (piloto, 17-oct-2026): Vueling no acepta un cambio, aunque sea
     legal, si deja una jornada con calzos programados a partir de ~23:30 LT la
     víspera de un día libre: predice una invasión de día libre (Art. 13.23). La
     hora exacta está pendiente de confirmar; vive SOLO aquí. */
  var INV_LIBRE_MIN = 23 * 60 + 30;
  var CANARIAS = /^(LPA|TFN|TFS|ACE|FUE|SPC|VDE|GMZ|GCLP|GCXO|GCTS|GCRR|GCFV|GCLA|GCHI|GCGM)$/;
  var _off = {};
  /* Minutos que la hora local de la base va por delante de UTC ese día (con su DST). */
  function offMin(date, base) {
    var tz = CANARIAS.test(base || '') ? 'Atlantic/Canary' : 'Europe/Madrid', k = tz + date;
    if (_off[k] != null) return _off[k];
    var off = 0;
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(date + 'T12:00:00Z'));
      var h = 0, m = 0; p.forEach(function (x) { if (x.type === 'hour') h = +x.value; if (x.type === 'minute') m = +x.value; });
      off = h * 60 + m - 12 * 60;
    } catch (e) { off = 0; }
    return (_off[k] = off);
  }

  function dutyMin(c) {
    if (!c || c.report == null || c.end == null) return 0;
    if (c.kind === 'flight') return c.end + POST - c.report;
    if (c.kind === 'standby') return Math.round((c.end - c.report) * 0.25);   // imaginaria en casa: 25 %
    return c.end - c.report;
  }
  function hasDuty(c) { return !!c && c.report != null && c.end != null && c.kind !== 'flexi' && c.kind !== 'franco'; }
  function gaps(R) {
    var out = [], prev = null;
    R.forEach(function (c, i) {
      if (!hasDuty(c)) return;
      var start = i * 1440 + c.report;
      if (prev) {
        var p = R[prev.i], endP = prev.i * 1440 + p.end + (p.kind === 'flight' ? POST : 0);
        var rest = start - endP, dPrev = p.kind === 'standby' ? (p.end - p.report) : dutyMin(p);
        var both = p.kind === 'flight' && c.kind === 'flight';
        out.push({ a: prev.i, b: i, from: endP, rest: rest, needV: both ? Math.max(VUELING_MIN, dPrev) : 0, needF: Math.max(FTL_MIN, dPrev) });
      }
      prev = { i: i };
    });
    return out;
  }

  /* ── Imaginarias (convenio) ────────────────────────────────────────────────
     1) Solo UNA imaginaria seguida de día libre por mes natural (el de la imaginaria).
     2) Entre dos bloques de 3 imaginarias seguidas, al menos 5 días naturales completos.
     Un cambio solo se culpa de lo que EMPEORA respecto al roster de la compañía. */
  function esStby(c) {
    if (!c || c.kind === 'flight') return false;
    return c.kind === 'standby' || /SBY|^OSB|^RSF/i.test(c.code || '');
  }
  function esLibre(c) { return !!c && c.kind === 'off'; }
  function stbyLibrePorMes(R, dates) {
    var m = {};
    for (var i = 0; i < R.length - 1; i++) if (esStby(R[i]) && esLibre(R[i + 1])) { var k = dates[i].slice(0, 7); m[k] = (m[k] || 0) + 1; }
    return m;
  }
  function bloques3(R) {
    var out = [], i = 0;
    while (i < R.length) {
      if (!esStby(R[i])) { i++; continue; }
      var j = i; while (j + 1 < R.length && esStby(R[j + 1])) j++;
      if (j - i + 1 >= 3) out.push([i, j]);
      i = j + 1;
    }
    return out;
  }
  function stby3Juntos(R, dates) {
    var b = bloques3(R), o = {};
    for (var k = 1; k < b.length; k++) { var hueco = b[k][0] - b[k - 1][1] - 1; if (hueco < STBY3_HUECO) o[dates[b[k][0]]] = { day: b[k][0], gap: hueco }; }
    return o;
  }
  function reglasStby(R, O, dates, who) {
    var res = { libre: null, tres: null };
    var a = stbyLibrePorMes(R, dates), b = stbyLibrePorMes(O, dates);
    Object.keys(a).forEach(function (m) { if (a[m] > 1 && a[m] > (b[m] || 0) && !res.libre) res.libre = { who: who, mes: m, n: a[m] }; });
    var x = stby3Juntos(R, dates), y = stby3Juntos(O, dates);
    Object.keys(x).forEach(function (d) { if (!y[d] && !res.tres) res.tres = { who: who, day: x[d].day, gap: x[d].gap }; });
    return res;
  }

  /* ── Los bloques de STBY se cambian ENTEROS (piloto, 20-oct-2026) ──────────
     «Cuando hay bloques de STBY se tienen que cambiar todos enteros. Sea bloque
     de dos o de tres. No se pueden cambiar de forma individual.» Bloque = 2 o más
     STBY seguidas en el roster de la COMPAÑÍA (el original, no el que sale del
     cambio). Si el tramo coge parte de un bloque y deja otra parte fuera, no vale. */
  function bloquesStby(R) {
    var out = [], i = 0;
    while (i < R.length) {
      if (!esStby(R[i])) { i++; continue; }
      var j = i; while (j + 1 < R.length && esStby(R[j + 1])) j++;
      if (j > i) out.push([i, j]);
      i = j + 1;
    }
    return out;
  }
  function corteStby(O, s, e, who) {
    var b = bloquesStby(O);
    for (var k = 0; k < b.length; k++) {
      var a = b[k][0], z = b[k][1];
      if (z >= s && a <= e && (a < s || z > e)) return { who: who, a: a, b: z };
    }
    return null;
  }

  /* ── F detrás de un OFF: NO bloquea, es una NOTA (piloto, 20-oct-2026) ──────
     «Cambiar F después de OFF: tienes que aceptar que tienes que estar contactable
     durante el OFF.» El franco se programa hasta la víspera, y la víspera es el OFF.
     Se avisa a quien, por el cambio, se queda con un F justo detrás de un OFF que no
     tenía en su roster. Se mira del primer día del tramo al día siguiente del último
     (recibir un OFF delante de tu propio F también te lo deja así). */
  function esFranco(c) { return !!c && (c.kind === 'franco' || /^F$/i.test(c.code || '')); }
  function fTrasOff(R, d) { return d > 0 && esFranco(R[d]) && esLibre(R[d - 1]); }

  /* Calzos LOCALES (min desde las 00:00 del día, pueden pasar de 1440) de un día
     de vuelo seguido de un día LIBRE, si llegan al umbral; si no, null.
     El franco no cuenta: es programable y no es día libre (13.23). */
  function invLibre(R, dates, d, base) {
    var c = R[d], n = R[d + 1];
    if (!c || c.kind !== 'flight' || c.end == null || !esLibre(n)) return null;
    var fin = c.end + offMin(dates[d], base);
    return fin >= INV_LIBRE_MIN ? fin : null;
  }

  function swapped(me, them, s, e) {
    var a = me.slice(), b = them.slice();
    for (var i = s; i <= e; i++) { var t = a[i]; a[i] = b[i]; b[i] = t; }
    return { me: a, them: b };
  }

  /* o = { dates, me, them, s, e, rolMe, rolThem } — me/them son los rosters
     ORIGINALES (la compañía); s..e los índices que se cambian. */
  function check(o) {
    var s = o.s, e = o.e, dates = o.dates, O = { me: o.me, them: o.them };
    var R = swapped(o.me, o.them, s, e), worst = null, ftlBad = false, vBad = false, max7 = 0, sLib = null, s3 = null, inv = null, corte = null, fOff = null;
    var bases = { me: o.baseMe || '', them: o.baseThem || o.baseMe || '' };
    ['me', 'them'].forEach(function (k) {
      /* Invasión de día libre predicha: la víspera del tramo y sus días. Solo se
         culpa al cambio de lo que NO estaba ya en el roster de la compañía. */
      for (var d = Math.max(0, s - 1); d <= e && d < dates.length - 1 && !inv; d++) {
        var f = invLibre(R[k], dates, d, bases[k]);
        if (f != null && invLibre(O[k], dates, d, bases[k]) == null) inv = { who: k, day: d, fin: f };
      }
      corte = corte || corteStby(O[k], s, e, k);
      for (var f = Math.max(1, s); f <= e + 1 && f < dates.length && !fOff; f++)
        if (fTrasOff(R[k], f) && !fTrasOff(O[k], f)) fOff = { who: k, day: f };
      var rs = reglasStby(R[k], O[k], dates, k);
      sLib = sLib || rs.libre; s3 = s3 || rs.tres;
      gaps(R[k]).forEach(function (g) {
        if (g.b < s || g.a > e) return;                     // solo lo que toca el tramo y sus bordes
        var need = Math.max(g.needV, g.needF);
        if (g.rest < g.needF) ftlBad = true;
        if (g.needV && g.rest < g.needV) vBad = true;
        if (g.rest < need && (!worst || need - g.rest > worst.miss)) worst = { who: k, day: g.b, rest: g.rest, miss: need - g.rest, ftl: g.rest < g.needF };
      });
      for (var d = s; d <= e + 6 && d < dates.length; d++) {
        var sum = 0; for (var j = Math.max(0, d - 6); j <= d; j++) sum += dutyMin(R[k][j]);
        max7 = Math.max(max7, sum);
      }
    });
    var roles = !!(o.rolMe && o.rolThem && o.rolMe !== o.rolThem);
    return { worst: worst, ftlBad: ftlBad, vBad: vBad, max7: max7, over7: max7 > MAX7, roles: roles, sLib: sLib, s3: s3, inv: inv,
             corte: corte, fOff: fOff,
             ok: !worst && max7 <= MAX7 && !roles && !sLib && !s3 && !inv && !corte };
  }

  return { VUELING_MIN: VUELING_MIN, FTL_MIN: FTL_MIN, POST: POST, MAX7: MAX7, STBY3_HUECO: STBY3_HUECO,
           INV_LIBRE_MIN: INV_LIBRE_MIN, offMin: offMin, invLibre: invLibre,
           bloquesStby: bloquesStby, corteStby: corteStby, esFranco: esFranco, fTrasOff: fTrasOff,
           dutyMin: dutyMin, hasDuty: hasDuty, gaps: gaps, esStby: esStby, esLibre: esLibre, swapped: swapped, check: check };
});
