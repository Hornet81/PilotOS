/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — el PLAN del día: qué hacer para llegar más despierto al aterrizaje

   Puro: sin DOM. Recibe la jornada (j) y el resultado del motor (r) y devuelve
   medidas con su hora y su efecto. Dos clases de efecto, y la pantalla las
   distingue SIEMPRE:
     · calc  — calculado con el MISMO modelo (r.prueba): la siesta antes de
               firmar y el descanso controlado en cabina son sueño, y el modelo
               sabe sumar sueño. Se da la vigilia del aterrizaje antes y después.
     · guia  — recomendación con su fuente: la cafeína, la luz, moverse o comer
               no están en el modelo de tres procesos y no se inventa un número.

   Cifras que salen de la evidencia (ver public/fatiga/documento.js):
     · cafeína: efecto a los 20–30 min; nada en las 6 h antes de dormir
       (Drake 2013); un café ≈ 80–100 mg, un té ≈ 30–50 mg (EFSA 2015).
     · siesta corta (Brooks y Lack 2006: la de 10 min, la más eficaz; la de 30
       empeora al principio): aquí 20 min; larga 90 min, un ciclo entero.
     · descanso controlado: 20 min, terminado al menos 30 min antes del inicio
       del descenso (se supone 30 min antes del aterrizaje): son los 20–30 min
       de inercia al despertar. Sólo si el OM-A del operador lo permite.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.FatigaPlan = factory();
})(this, function () {
  'use strict';
  var MIN = 60000, H = 3600000;
  var C = {
    cafeEfecto: 30, cafeAntes: 60, cafeCorte: 6 * 60, teCorte: 4 * 60,
    siestaCorta: 20, siestaLarga: 90, siestaMargen: 30, siestaTrasDormir: 3 * 60,
    descanso: 20, descansoTrasDespegue: 25, descansoRecupera: 30, desciende: 30, descansoMinBloque: 110,
    ganaMin: 0.15
  };

  function minA(f, j) {
    var m = null;
    (j.aterrizajes || []).forEach(function (x) { var e = f(x.ms); if (e && (m == null || e.A < m)) m = e.A; });
    return m;
  }
  function horaLocal(ms, offset) { var l = ms + offset(ms) * MIN; return ((l % 86400000) + 86400000) % 86400000 / MIN; }

  /* El siguiente sueño estimado después de la jornada (para el corte de la cafeína
     y para la recuperación). */
  function sigSueno(j, r) {
    var s = null;
    (r.suenos || []).forEach(function (e) { if (e.ini >= j.fin && (!s || e.ini < s.ini)) s = e; });
    return s;
  }

  function calcula(j, r, offset) {
    offset = offset || function () { return 0; };
    var out = [];
    if (!j || !r || !r.prueba || !(j.aterrizajes || []).length) return out;
    var base = j.A;
    var peor = j.peor || { ms: j.fin };
    var ojo = j.nivel !== 'bajo';
    var hIni = horaLocal(j.inicio, offset);

    /* 1 · Siesta antes de firmar. La ventana: desde 3 h después de levantarte
       (antes no hay sueño que coger) hasta la hora de salir de casa. */
    var prep = (j.fuera ? 60 : 90) * MIN;
    var w0 = j.ultimoSueno ? j.ultimoSueno.fin + C.siestaTrasDormir * MIN : j.inicio - 10 * H;
    var w1 = j.inicio - prep - C.siestaMargen * MIN;
    if (w1 - w0 >= C.siestaCorta * MIN && (ojo || hIni >= 14 * 60)) {
      // Para cada duración, la mejor hora de la ventana la elige el modelo (la de
      // primera hora de la tarde aprovecha la bajada circadiana; la tardía, la
      // cercanía a la firma).
      var mejorDe = function (dur) {
        var m = null;
        for (var ini = w0; ini + dur * MIN <= w1; ini += 15 * MIN) {
          var a = minA(r.prueba([{ ini: ini, fin: ini + dur * MIN }]), j);
          if (a != null && (!m || a > m.A)) m = { ini: ini, fin: ini + dur * MIN, dur: dur, A: a };
        }
        return m;
      };
      var larga = mejorDe(C.siestaLarga), corta = mejorDe(C.siestaCorta);
      // La corta manda salvo que la larga gane de verdad: es la que se puede hacer.
      var prin = larga && (!corta || larga.A - corta.A > 0.2) ? larga : corta;
      var otra = prin === larga ? corta : larga;
      if (prin && prin.A - base >= C.ganaMin) {
        out.push({ k: 'siesta', tipo: 'calc', prio: 1, ini: prin.ini, fin: prin.fin, dur: prin.dur, antes: base, despues: prin.A,
          alt: otra && otra.A - base >= 0.05 ? otra : null });
      }
    }

    /* 2 · Descanso controlado en cabina, en un crucero largo: 20 min, empezando
       después de la subida y terminando con margen para la inercia antes del
       descenso. Se prueba cada hora posible y manda el modelo. */
    if (ojo) {
      var mejorD = null;
      (j.aterrizajes || []).forEach(function (x) {
        if (!x.sal || x.ms - x.sal < C.descansoMinBloque * MIN) return;
        var d0 = x.sal + C.descansoTrasDespegue * MIN;
        var d1 = x.ms - (C.desciende + C.descansoRecupera + C.descanso) * MIN;
        for (var t = d0; t <= d1; t += 10 * MIN) {
          var a = minA(r.prueba([{ ini: t, fin: t + C.descanso * MIN }]), j);
          if (a != null && (!mejorD || a > mejorD.A)) mejorD = { ini: t, fin: t + C.descanso * MIN, A: a, sector: x };
        }
      });
      if (mejorD && mejorD.A - base >= C.ganaMin) {
        out.push({ k: 'descanso', tipo: 'calc', prio: 2, ini: mejorD.ini, fin: mejorD.fin, dur: C.descanso, antes: base, despues: mejorD.A,
          dep: mejorD.sector.dep, arr: mejorD.sector.arr, limite: mejorD.sector.ms - (C.desciende + C.descansoRecupera) * MIN });
      }
    }

    /* 3 · Cafeína: hacia una hora antes del aterrizaje más crítico (efecto a los
       20–30 min, cubre el descenso). Nunca en las 6 h antes del siguiente sueño:
       entre 6 y 4 h, té (menos cafeína); por debajo, nada. */
    var sig = sigSueno(j, r);
    var corte = sig ? sig.ini - C.cafeCorte * MIN : null;
    var corteTe = sig ? sig.ini - C.teCorte * MIN : null;
    var tc = Math.max(j.inicio, peor.ms - C.cafeAntes * MIN);
    if (ojo || hIni < 7 * 60) {
      // Si la hora ideal cae ya dentro del corte, se adelanta al último momento
      // permitido (y se dice que es el último): un café a las 03:00 te deja sin
      // dormir al llegar a las 05:00.
      var bebida = 'cafe', tarde = false;
      if (corte && tc > corte) {
        if (corte >= j.inicio) { tc = corte; tarde = true; }
        else if (corteTe && corteTe >= j.inicio && tc > corteTe) { tc = corteTe; bebida = 'te'; tarde = true; }
        else if (corteTe && tc <= corteTe) bebida = 'te';
        else bebida = null;
      }
      out.push({ k: 'cafeina', tipo: 'guia', prio: bebida ? 3 : 6, ini: bebida ? tc : null, bebida: bebida, ultimo: tarde, ideal: peor.ms - C.cafeAntes * MIN,
        corte: corte, corteTe: corteTe, firma: hIni < 7 * 60 ? j.inicio : null });
    }

    /* 4 · Moverse: en cada escala, y una vez por hora en crucero. */
    var esc = [];
    var at = j.aterrizajes || [];
    for (var i = 0; i < at.length - 1; i++) if (at[i + 1].sal && at[i + 1].sal > at[i].ms) esc.push({ ini: at[i].ms, fin: at[i + 1].sal });
    out.push({ k: 'moverse', tipo: 'guia', prio: ojo ? 4 : 7, escalas: esc });

    /* 5 · Luz y 6 · comida: siempre, con más peso si se vuela de noche. */
    var noche = (j.factores || []).some(function (f) { return f.k === 'wocl' || f.k === 'tarde'; });
    out.push({ k: 'luz', tipo: 'guia', prio: noche ? 3.5 : 8, noche: noche });
    out.push({ k: 'comida', tipo: 'guia', prio: noche ? 5 : 9, noche: noche });

    /* 7 · Recuperación: el sueño que toca al llegar. */
    if (sig) out.push({ k: 'recupera', tipo: 'guia', prio: ojo ? 5.5 : 10, ini: sig.ini, fin: sig.fin, noche: noche });

    /* 8 · Decirlo: el compañero y, si no estás apto, el reporte. */
    if (j.nivel === 'alto') out.push({ k: 'decirlo', tipo: 'guia', prio: 0.5 });

    out.sort(function (a, b) { return a.prio - b.prio; });
    return out;
  }

  return { calcula: calcula, C: C };
});
