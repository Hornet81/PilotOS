/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — lo que un cambio del Swap le hace a la fatiga prevista

   Un cambio puede ser legal y dejarte una semana mucho más cansada: Planning
   sólo comprueba las 60 h en 7 días (27-oct-2026). Esto lo DICE; no bloquea
   nada. Es el MISMO motor (public/fatiga/motor.js) que la pantalla de Fatiga,
   aplicado a las tarjetas del Swap antes y después del cambio.

   Puro: sin DOM. Entra lo que ya tiene el Swap:
     dates  ['YYYY-MM-DD', …]
     antes / despues  tarjetas de swap-routes.dayCard (minutos UTC desde las
                      00:00 de su día; legs con std/sta, que pueden pasar de 1440)
     base   la del piloto (fuera de base = el día acaba en otro aeropuerto)
     offset(ms) → minutos que la hora de la base va por delante de UTC
   Devuelve los días que cambian, el peor de antes y el de después.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./motor.js'));
  else root.FatigaSwap = factory(root.FatigaMotor);
})(this, function (MotorCarga) {
  'use strict';
  var MIN = 60000, ORDEN = { bajo: 0, moderado: 1, alto: 2 };
  // Un cambio de KSS por debajo de esto, sin cambiar de nivel, no se cuenta: el
  // modelo es de población media y medio punto es ruido, no un dato.
  var KSS_UMBRAL = 0.5;
  // Días DESPUÉS del tramo que se miran: el sueño que quita un cambio se nota en
  // la jornada siguiente (y la deuda de 3 días, hasta tres más allá).
  var COLA = 3;

  function motor() { return MotorCarga || (typeof window !== 'undefined' && window.FatigaMotor) || null; }

  function finDe(c) { return c && c.legs && c.legs.length ? String(c.legs[c.legs.length - 1].arr || '').toUpperCase() : ''; }
  function mismo(a, b) {
    a = String(a || '').toUpperCase(); b = String(b || '').toUpperCase();
    if (!a || !b) return false;
    if (a === b) return true;
    try { if (typeof window !== 'undefined' && window.pilotosMismoApt) return !!window.pilotosMismoApt(a, b); } catch (e) {}
    return false;
  }

  /* Tarjetas del Swap → jornadas del motor. Cuentan los días de vuelo y de
     formación con horas, como en el roster: un libre o una imaginaria en casa
     no son jornada. */
  function jornadas(dates, cards, base) {
    var out = [];
    (cards || []).forEach(function (c, i) {
      if (!c || !dates[i] || c.report == null || c.end == null) return;
      if (c.kind !== 'flight' && c.kind !== 'training') return;
      var dur = c.end - c.report;
      if (!(dur > 0) || dur > 16 * 60) return;
      var t0 = Date.parse(dates[i] + 'T00:00:00Z');
      if (!isFinite(t0)) return;
      var ater = (c.legs || []).filter(function (l) { return l && l.sta != null; }).map(function (l) {
        return { ms: t0 + l.sta * MIN, sal: l.std != null ? t0 + l.std * MIN : null, pos: !!l.pos,
                 dep: String(l.dep || ''), arr: String(l.arr || '') };
      });
      var fin = finDe(c);
      out.push({ fecha: dates[i], inicio: t0 + c.report * MIN, fin: t0 + c.end * MIN, aterrizajes: ater,
                 sectores: ater.filter(function (x) { return !x.pos; }).length,
                 fuera: !!(base && fin && !mismo(fin, base)) });
    });
    return out;
  }

  function resumen(r) { return r ? { nivel: r.nivel, kss: r.kss, A: r.A, sueno: r.sueno, factores: r.factores } : null; }
  function peorDe(lista) {
    var m = null;
    lista.forEach(function (x) { if (x && (!m || ORDEN[x.nivel] > ORDEN[m.nivel] || (ORDEN[x.nivel] === ORDEN[m.nivel] && x.kss > m.kss))) m = x; });
    return m;
  }

  /* s, e = índices del tramo que se cambia. */
  function compara(o) {
    var M = motor();
    if (!M || !o || !o.dates) return null;
    var off = o.offset || function () { return 0; };
    var A = M.calcula({ jornadas: jornadas(o.dates, o.antes, o.base), offset: off, perfil: o.perfil || null });
    var D = M.calcula({ jornadas: jornadas(o.dates, o.despues, o.base), offset: off, perfil: o.perfil || null });
    var a0 = Math.max(0, o.s), a1 = Math.min(o.dates.length - 1, o.e + COLA);
    var dias = [], pa = [], pd = [];
    for (var i = a0; i <= a1; i++) {
      var f = o.dates[i], x = resumen(A.porFecha[f]), y = resumen(D.porFecha[f]);
      if (x) pa.push(x); if (y) pd.push(y);
      if (!x && !y) continue;
      var dn = x && y ? ORDEN[y.nivel] - ORDEN[x.nivel] : 0;
      var dk = x && y ? Math.round((y.kss - x.kss) * 10) / 10 : 0;
      // Un día que aparece o desaparece (cambias un libre por un vuelo) sí cuenta.
      var cambia = !x || !y || dn !== 0 || Math.abs(dk) >= KSS_UMBRAL;
      if (!cambia) continue;
      dias.push({ i: i, fecha: f, antes: x, despues: y, dNivel: dn, dKss: dk,
                  peor: (!x && y && y.nivel !== 'bajo') || dn > 0 || (dn === 0 && dk >= KSS_UMBRAL),
                  mejor: (x && !y && x.nivel !== 'bajo') || dn < 0 || (dn === 0 && dk <= -KSS_UMBRAL) });
    }
    var peorA = peorDe(pa), peorD = peorDe(pd);
    var sube = !!(peorD && (!peorA || ORDEN[peorD.nivel] > ORDEN[peorA.nivel]));
    var baja = !!(peorA && (!peorD || ORDEN[peorD.nivel] < ORDEN[peorA.nivel]));
    return { dias: dias, peorAntes: peorA, peorDespues: peorD, sube: sube, baja: baja,
             altoNuevo: dias.some(function (d) { return d.despues && d.despues.nivel === 'alto' && (!d.antes || d.antes.nivel !== 'alto'); }) };
  }

  return { compara: compara, jornadas: jornadas, KSS_UMBRAL: KSS_UMBRAL, COLA: COLA };
});
