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
  /* Víspera de un día libre: Vueling no acepta un cambio que deje el FIN de la
     actividad (calzos + 20 min de debriefing) más tarde de las 23:59 LT, o sea
     calzos como muy tarde a las 23:39 LT (Planning de Vueling, correo del
     27-oct-2026; antes era un ~23:30 «por confirmar»). Se marca desde las 23:40. */
  var INV_LIBRE_MIN = 24 * 60 - POST;
  /* Descanso antes de un SIMULADOR o CHEQUEO (Planning, 27-oct-2026): 13:30 h si el
     cambio se pide con 5 días o más (D+5, por eCrews) y 12 h si es a D+4 o menos
     (por correo). Sin la antelación se exige la más estricta. */
  var FUERA_MIN = 10 * 60, SIM_D5_MIN = 13 * 60 + 30, SIM_D4_MIN = 12 * 60, PLAZO_ECREWS = 5;
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
  /* Aeropuertos con requisitos propios de habilitación o de especialidad (piloto,
     27-oct-2026): no se sabe desde aquí si el que lo recibe los cumple, así que AVISA
     y no bloquea. IATA y OACI, que conviven en el roster. */
  var AEROP_ESP = { FLR: 'Florencia', LIRQ: 'Florencia', EAS: 'San Sebastián', LESO: 'San Sebastián',
                    KEF: 'Keflavik', BIKF: 'Keflavik', RKV: 'Reykjavik', BIRK: 'Reykjavik' };
  function aeropEsp(c) {
    if (!c || c.kind !== 'flight' || !c.legs) return '';
    for (var i = 0; i < c.legs.length; i++) {
      var l = c.legs[i], a = String(l.dep || '').toUpperCase(), b = String(l.arr || '').toUpperCase();
      if (AEROP_ESP[a]) return AEROP_ESP[a];
      if (AEROP_ESP[b]) return AEROP_ESP[b];
    }
    return '';
  }
  function esSim(c) { return !!c && c.kind === 'training'; }
  /* left = días de antelación con que se pide el cambio (null = no se sabe). */
  /* base = la del piloto: un descanso que empieza fuera de base (el día acaba en
     otro aeropuerto) se mide con FUERA_MIN (10 h o la actividad anterior), no con
     las 13:30 de Vueling ni las 12 h de base. Sin base no se sabe y se exige lo de base. */
  function gaps(R, left, base) {
    var out = [], prev = null, simMin = (left == null || left >= PLAZO_ECREWS) ? SIM_D5_MIN : SIM_D4_MIN;
    var B = base ? baseDe(R, base) : '';
    R.forEach(function (c, i) {
      if (!hasDuty(c)) return;
      var start = i * 1440 + c.report;
      if (prev) {
        var p = R[prev.i], endP = prev.i * 1440 + p.end + (p.kind === 'flight' ? POST : 0);
        var rest = start - endP, dPrev = p.kind === 'standby' ? (p.end - p.report) : dutyMin(p);
        var both = p.kind === 'flight' && c.kind === 'flight', sim = esSim(c);
        var fuera = !!B && !!_fin(p) && _fin(p) !== B;
        var needV = sim ? Math.max(simMin, dPrev) : both ? Math.max(fuera ? FUERA_MIN : VUELING_MIN, dPrev) : 0;
        out.push({ a: prev.i, b: i, from: endP, rest: rest, needV: needV, needF: Math.max(fuera ? FUERA_MIN : FTL_MIN, dPrev), sim: sim && !both, fuera: fuera });
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

  /* ── Las LÍNEAS con pernocta se cambian ENTERAS (piloto, 25-oct-2026) ───────
     «Aquí me deja hacer el cambio cuando las líneas se deberían cambiar en bloque.»
     Una línea es una secuencia de días de vuelo unidos por noches fuera de base: un día
     que acaba fuera (pernocta) o el siguiente que empieza fuera. Cambiar solo un trozo
     dejaría a cada piloto durmiendo en un sitio y empezando el día siguiente en otro.
     Se mira en el roster de la COMPAÑÍA de los dos, igual que los bloques de STBY. */
  function _fin(c) { return c && c.kind === 'flight' && c.legs && c.legs.length ? String(c.legs[c.legs.length - 1].arr || '').toUpperCase() : ''; }
  function _ini(c) { return c && c.kind === 'flight' && c.legs && c.legs.length ? String(c.legs[0].dep || '').toUpperCase() : ''; }
  /* La base se compara con los CÓDIGOS del propio roster: el perfil puede decir
     LEBL con los tramos en BCN (o al revés). Si la del perfil no aparece en ningún
     tramo, se deduce: una jornada que sale después de un día SIN vuelo (OFF,
     franco, guardia) sale de casa. */
  function baseDe(R, base) {
    var B = String(base || '').toUpperCase(), n = {}, top = '', usa = false;
    for (var i = 0; i < R.length; i++) {
      var x = _ini(R[i]); if (!x) continue;
      if (x === B || _fin(R[i]) === B) usa = true;
      if (i > 0 && R[i - 1] && R[i - 1].kind !== 'flight') { n[x] = (n[x] || 0) + 1; if (!top || n[x] > n[top]) top = x; }
    }
    return usa ? B : (top || B);
  }
  function unidos(a, b, B) {
    if (!a || !b || a.kind !== 'flight' || b.kind !== 'flight' || !B) return false;
    return (!!_fin(a) && _fin(a) !== B) || (!!_ini(b) && _ini(b) !== B);
  }
  function bloquesLinea(R, base) {
    var out = [], i = 0, B = baseDe(R, base);
    while (i < R.length) {
      var j = i; while (j + 1 < R.length && unidos(R[j], R[j + 1], B)) j++;
      if (j > i) out.push([i, j]);
      i = j + 1;
    }
    return out;
  }
  function corteLinea(O, s, e, who, base) {
    var b = bloquesLinea(O, base);
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
    var R = swapped(o.me, o.them, s, e), worst = null, ftlBad = false, vBad = false, simBad = false, simAplica = false, fueraAplica = false, fueraBad = false, aerop = null, training = null, max7 = 0, sLib = null, s3 = null, inv = null, corte = null, linea = null, fOff = null;
    var bases = { me: o.baseMe || '', them: o.baseThem || o.baseMe || '' };
    ['me', 'them'].forEach(function (k) {
      /* Invasión de día libre predicha: la víspera del tramo y sus días. Solo se
         culpa al cambio de lo que NO estaba ya en el roster de la compañía. */
      for (var d = Math.max(0, s - 1); d <= e && d < dates.length - 1 && !inv; d++) {
        var f = invLibre(R[k], dates, d, bases[k]);
        if (f != null && invLibre(O[k], dates, d, bases[k]) == null) inv = { who: k, day: d, fin: f };
      }
      corte = corte || corteStby(O[k], s, e, k);
      linea = linea || corteLinea(O[k], s, e, k, bases[k]);
      for (var f = Math.max(1, s); f <= e + 1 && f < dates.length && !fOff; f++)
        if (fTrasOff(R[k], f) && !fTrasOff(O[k], f)) fOff = { who: k, day: f };
      var rs = reglasStby(R[k], O[k], dates, k);
      sLib = sLib || rs.libre; s3 = s3 || rs.tres;
      /* Simuladores y tierra se pueden cambiar, pero siempre los valida Training y no
         pueden afectar a las caducidades (Planning, 27-oct-2026): no bloquea, se avisa. */
      for (var t = s; t <= e && !training; t++) if (esSim(R[k][t]) || esSim(O[k][t])) training = { who: k, day: t };
      /* Solo cuenta el que RECIBE un día con uno de esos aeropuertos que no tenía ya. */
      for (var t2 = s; t2 <= e && !aerop; t2++) { var ap = aeropEsp(R[k][t2]); if (ap && ap !== aeropEsp(O[k][t2])) aerop = { who: k, day: t2, apt: ap }; }
      gaps(R[k], o.left, bases[k]).forEach(function (g) {
        if (g.b < s || g.a > e) return;                     // solo lo que toca el tramo y sus bordes
        var need = Math.max(g.needV, g.needF);
        if (g.sim) simAplica = true;
        if (g.fuera) fueraAplica = true;
        if (g.fuera) { if (g.rest < need) fueraBad = true; }
        else {
          if (g.rest < g.needF) ftlBad = true;
          if (g.needV && g.rest < g.needV) { if (g.sim) simBad = true; else vBad = true; }
        }
        if (g.rest < need && (!worst || need - g.rest > worst.miss)) worst = { who: k, day: g.b, rest: g.rest, miss: need - g.rest, ftl: g.rest < g.needF, sim: g.sim, fuera: g.fuera };
      });
      for (var d = s; d <= e + 6 && d < dates.length; d++) {
        var sum = 0; for (var j = Math.max(0, d - 6); j <= d; j++) sum += dutyMin(R[k][j]);
        max7 = Math.max(max7, sum);
      }
    });
    var roles = !!(o.rolMe && o.rolThem && o.rolMe !== o.rolThem);
    return { worst: worst, ftlBad: ftlBad, vBad: vBad, simBad: simBad, simAplica: simAplica, fueraAplica: fueraAplica, fueraBad: fueraBad, aerop: aerop, training: training, max7: max7, over7: max7 > MAX7, roles: roles, sLib: sLib, s3: s3, inv: inv,
             corte: corte, linea: linea, fOff: fOff,
             ok: !worst && max7 <= MAX7 && !roles && !sLib && !s3 && !inv && !corte && !linea };
  }

  /* La CATEGORÍA de un día (o de un tramo de días) la pone la app a partir del roster,
     no quien publica. Early: firma antes de las 10:00 locales · Late: desde las 12:00 ·
     Línea: el resto. Vive AQUÍ para que el tablón (servidor) y la ficha (cliente)
     pinten el mismo día con el mismo color. */
  function pernocta(c, base) {
    if (!c || c.kind !== 'flight' || !c.legs || !c.legs.length) return false;
    var fin = String(c.legs[c.legs.length - 1].arr || '').toUpperCase();
    return fin !== String(c.legs[0].dep || '').toUpperCase() && fin !== base;
  }
  function catDe(cards, base) {
    cards = (cards || []).filter(Boolean);
    if (cards.some(function (c) { return pernocta(c, base); })) return 'pernocta';
    var c = cards.filter(function (x) { return x.kind === 'flight'; })[0] || cards.filter(esStby)[0] || cards[0];
    if (!c) return 'otro';
    if (c.kind === 'flight') { var l = (((c.report + offMin(c.date, base)) % 1440) + 1440) % 1440; return l < 600 ? 'early' : l >= 720 ? 'late' : 'linea'; }
    if (esStby(c)) return 'imag';
    if (c.kind === 'off' || c.kind === 'franco' || c.kind === 'flexi') return 'libre';
    return 'otro';
  }

  return { VUELING_MIN: VUELING_MIN, FTL_MIN: FTL_MIN, POST: POST, MAX7: MAX7, STBY3_HUECO: STBY3_HUECO,
           INV_LIBRE_MIN: INV_LIBRE_MIN, FUERA_MIN: FUERA_MIN, AEROP_ESP: AEROP_ESP, aeropEsp: aeropEsp, SIM_D5_MIN: SIM_D5_MIN, SIM_D4_MIN: SIM_D4_MIN, PLAZO_ECREWS: PLAZO_ECREWS, esSim: esSim, offMin: offMin, invLibre: invLibre,
           bloquesStby: bloquesStby, corteStby: corteStby, bloquesLinea: bloquesLinea, corteLinea: corteLinea, esFranco: esFranco, fTrasOff: fTrasOff,
           dutyMin: dutyMin, hasDuty: hasDuty, gaps: gaps, esStby: esStby, esLibre: esLibre, swapped: swapped, check: check, catDe: catDe };
});
