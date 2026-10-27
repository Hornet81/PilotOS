/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — el perfil de sueño del piloto (cuestionario de la primera entrada)

   El modelo de fatiga (motor.js) estima el sueño con reglas de población media:
   te levantas 90 min antes de firmar, necesitas 8 h, te acuestas a las 23:00…
   Seis preguntas cambian esas reglas por las de ESTE piloto:

     coche     min de casa a la base           ┐ prepCasa  = coche + arreglarse
     prep      min para arreglarte y salir     ┘ (antes, 90 fijos para todos)
     hotel     min del hotel al aeropuerto      → prepHotel = hotel + 30
     acostar   hora de acostarte en día libre   ┐ bloque MCTQ (Roenneberg 2003):
     levantar  hora de despertarte sin alarma   │ de aquí salen el CRONOTIPO y
     sdw       horas que duermes antes de una   │ lo que necesitas dormir
               jornada de mañana                ┘

   Del bloque MCTQ:
     SDf    = levantar − acostar                 (duración en día libre)
     MSF    = acostar + SDf/2                    (medio sueño en día libre)
     SDweek = (5·SDw + 2·SDf) / 7
     MSFsc  = MSF − (SDf − SDweek)/2  si SDf > SDw  (corrige el sueño de recuperación)
     cronotipo → la fase del ritmo se mueve lo que MSFsc se aparte del de
                 referencia, con tope ±1h30 (criterio de la app, sin calibrar)
     necesidad = (SDw + SDf)/2, en cuartos de hora (criterio de la app: el día
                 libre lleva recuperación y el de trabajo va recortado)

   Los valores por defecto SON los del modelo: quien no cambia nada calcula
   exactamente igual que antes (MSFsc del perfil por defecto = referencia, y
   (7 h + 9 h)/2 = 8 h). Un perfil guardado con el formato anterior (sueno,
   crono) sigue valiendo con sus reglas de entonces.

   Además apunta el tiempo en coche que mide ARIA en cada briefing
   (`apuntaCoche`): sólo los minutos, la hora y cuánto faltaba para salir. La
   posición nunca se guarda. Con eso «Tus datos de sueño» dice lo medido junto
   a lo que contestó el piloto; NO cambia nada solo.

   Se guarda en el perfil (`fatPerfil`, una cadena JSON: así sincroniza por
   /api/profile sin tocar el servidor). «Ahora no» también se guarda.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(null);
  else root.FatigaPerfil = factory(root);
})(this, function (W) {
  'use strict';
  var DEF = { coche: 30, prep: 60, hotel: 30, acostar: 23 * 60, levantar: 8 * 60, sdw: 7 * 60 };
  var OPC = {
    coche: [10, 20, 30, 45, 60, 90],
    prep: [30, 45, 60, 75, 90],
    hotel: [10, 15, 20, 30, 45, 60],
    acostar: [21 * 60 + 30, 22 * 60, 22 * 60 + 30, 23 * 60, 23 * 60 + 30, 24 * 60, 24 * 60 + 30],
    levantar: [6 * 60, 6 * 60 + 30, 7 * 60, 7 * 60 + 30, 8 * 60, 8 * 60 + 30, 9 * 60],
    sdw: [300, 330, 360, 390, 420, 450, 480]
  };
  var FASE_BASE = 16.8;                       // la de motor.js
  var FASE_TOPE = 90;                         // min, ±
  var HOTEL_PREP = 30;                        // arreglarse en el hotel
  var MARCA = 'pilotos_fat_intro';            // sobrevive al logout (clearAllUserData)
  var LS = 'pilotos_fat_perfil';              // respaldo sin módulo de perfil
  var LS_COCHE = 'pilotos_fat_coche';         // lo que ha medido ARIA

  // Formato anterior (Beta.1209): se respeta tal cual.
  var V1 = { sueno: [360, 390, 420, 450, 480, 510, 540], crono: ['m', 'i', 'n'] };
  var FASE_V1 = { m: -1, i: 0, n: 1 };

  /* El coche admite además un minuto exacto: el que ha medido ARIA y el piloto
     ha aceptado (propuestaCoche). Lo demás, sólo las opciones de la hoja. */
  function valido(k, v) {
    if (k === 'coche' && typeof v === 'number' && v === Math.round(v) && v >= COCHE_MIN && v <= COCHE_TOPE) return true;
    return OPC[k] && OPC[k].indexOf(v) >= 0;
  }
  var COCHE_MIN = 5, COCHE_TOPE = 240;
  function completa(r) {
    var o = {};
    Object.keys(DEF).forEach(function (k) { o[k] = r && valido(k, r[k]) ? r[k] : DEF[k]; });
    return o;
  }
  function esV1(r) { return !!r && r.sdw == null && (r.sueno != null || r.crono != null); }

  /* El bloque MCTQ → cronotipo y necesidad. Puro: lo usan los parámetros, la
     línea de resultado de la hoja y el banco. */
  function mctq(c) {
    var sdf = ((c.levantar - c.acostar) % 1440 + 1440) % 1440;
    var msf = c.acostar + sdf / 2;
    var sdweek = (5 * c.sdw + 2 * sdf) / 7;
    var msfsc = sdf > c.sdw ? msf - (sdf - sdweek) / 2 : msf;
    var nec = Math.round((c.sdw + sdf) / 2 / 15) * 15;
    return { sdf: sdf, msf: msf, msfsc: msfsc, necesidad: Math.max(360, Math.min(540, nec)),
             deuda: Math.max(0, sdf - c.sdw) };
  }
  var REF = mctq(DEF).msfsc;
  function desfase(c) { return Math.max(-FASE_TOPE, Math.min(FASE_TOPE, mctq(c).msfsc - REF)); }
  function cronotipo(c) { var d = desfase(c); return d <= -30 ? 'm' : d >= 30 ? 'n' : 'i'; }

  /* Respuestas → parámetros del motor. null = el modelo de siempre. */
  function params(r) {
    if (!r || r.omitido) return null;
    if (esV1(r)) {
      var coche = valido('coche', r.coche) ? r.coche : DEF.coche, prep = OPC.prep.indexOf(r.prep) >= 0 ? r.prep : DEF.prep;
      var aco = OPC.acostar.indexOf(r.acostar) >= 0 ? r.acostar : DEF.acostar, lev = OPC.levantar.indexOf(r.levantar) >= 0 ? r.levantar : DEF.levantar;
      return { prepCasa: coche + prep, objetivo: V1.sueno.indexOf(r.sueno) >= 0 ? r.sueno : 480, acostar: aco,
               levantarLibre: lev, levantar: Math.max(4 * 60, lev - 60),
               fase: FASE_BASE + (FASE_V1[r.crono] || 0) };
    }
    var c = completa(r), m = mctq(c);
    return { prepCasa: c.coche + c.prep, prepHotel: c.hotel + HOTEL_PREP, objetivo: m.necesidad,
             acostar: c.acostar, levantarLibre: c.levantar, levantar: Math.max(4 * 60, c.levantar - 60),
             fase: FASE_BASE + desfase(c) / 60 };
  }

  /* ── Lectura y guardado (sólo en la app) ─────────────────────────────── */
  function lee() {
    if (!W) return null;
    var s = '';
    try { if (W.PilotProfile) s = W.PilotProfile.get('fatPerfil', ''); } catch (e) {}
    if (!s) try { s = W.localStorage.getItem(LS) || ''; } catch (e) {}
    try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function guarda(r) {
    var s = JSON.stringify(r);
    try { W.localStorage.setItem(LS, s); } catch (e) {}
    try { if (W.PilotProfile) W.PilotProfile.save({ fatPerfil: s }); } catch (e) {}
    try { W.dispatchEvent(new W.CustomEvent('pilotos-fatiga-perfil')); } catch (e) {}
  }
  function uid() {
    try { var u = JSON.parse(W.localStorage.getItem('cafi_auth_user') || '{}'); return String(u.id || u.email || ''); } catch (e) { return ''; }
  }
  function toca() {
    var r = lee();
    if (r && (r.omitido || r.at)) return false;
    try { return W.localStorage.getItem(MARCA) !== (uid() || '-'); } catch (e) { return false; }
  }
  function marca() { try { W.localStorage.setItem(MARCA, uid() || '-'); } catch (e) {} }

  /* ── El tiempo en coche que mide ARIA ─────────────────────────────────
     Vale sólo una medición hecha CON TIEMPO para ir a trabajar: entre 15 min y
     4 h antes de la primera salida de la jornada (desde casa; el servidor ya no
     manda `drive` si el primer sector no sale de la base). Más lejos no se sabe
     si el piloto está en casa. Una por jornada: regenerar el briefing no cuenta
     dos veces el mismo trayecto. */
  var COCHE_MAX = 20, COCHE_ANTES = [15, 240];
  function apuntaCoche(drive, legs, ahora) {
    if (!W || !drive || !(drive.minutes > 0) || drive.minutes > 240) return false;
    ahora = ahora || Date.now();
    var dep = null;
    (legs || []).forEach(function (l) { var t = l && +l.depMs; if (t > 0 && (dep == null || t < dep)) dep = t; });
    if (dep == null) return false;
    var antes = (dep - ahora) / 60000;
    if (antes < COCHE_ANTES[0] || antes > COCHE_ANTES[1]) return false;
    var a = medidas();
    a = a.filter(function (x) { return x.dep !== dep; });
    a.push({ at: ahora, min: Math.round(drive.minutes), km: drive.km || null, dep: dep, antes: Math.round(antes) });
    a = a.slice(-COCHE_MAX);
    try { W.localStorage.setItem(LS_COCHE, JSON.stringify(a)); } catch (e) { return false; }
    return true;
  }
  function medidas() {
    if (!W) return [];
    try { var a = JSON.parse(W.localStorage.getItem(LS_COCHE) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  /* Resumen: n mediciones, mediana y si son COHERENTES (todas a ±10 min de la
     mediana). Sirve para decirlo; no cambia el perfil. */
  function resumenCoche(a) {
    a = (a || medidas()).map(function (x) { return x.min; }).filter(function (v) { return v > 0; });
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
    var med = n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2);
    return { n: n, mediana: med, coherente: n >= 3 && s.every(function (v) { return Math.abs(v - med) <= 10; }) };
  }

  /* ── La propuesta: cambiar la respuesta por lo medido ──────────────────
     Sólo con 3 o más mediciones COHERENTES (±10 min de la mediana) y si la
     mediana se aparta 10 min o más de lo que contestó el piloto (menos es
     ruido del tráfico). Nunca se cambia sola: la acepta el piloto. Si dice que
     no, no se vuelve a proponer hasta que la mediana se mueva otros 10 min. */
  var LS_NO = 'pilotos_fat_coche_no', PROP_DIF = 10;
  function cocheActual() {
    var r = lee();
    return r && !r.omitido && valido('coche', r.coche) ? r.coche : DEF.coche;
  }
  function propuestaCoche() {
    if (!W) return null;
    var rc = resumenCoche();
    if (!rc || !rc.coherente) return null;
    var med = Math.max(COCHE_MIN, Math.min(COCHE_TOPE, rc.mediana)), act = cocheActual();
    if (Math.abs(med - act) < PROP_DIF) return null;
    try { var no = JSON.parse(W.localStorage.getItem(LS_NO) || 'null'); if (no && Math.abs(no.med - med) < PROP_DIF) return null; } catch (e) {}
    return { mediana: med, actual: act, n: rc.n };
  }
  function aceptaCoche() {
    var p = propuestaCoche(); if (!p) return false;
    var g = lee(), r;
    if (g && esV1(g)) { r = JSON.parse(JSON.stringify(g)); }
    else r = completa(g && !g.omitido ? g : null);
    r.coche = p.mediana; r.at = Date.now(); r.cocheAria = p.n;
    guarda(r);
    try { W.localStorage.removeItem(LS_NO); } catch (e) {}
    return true;
  }
  function rechazaCoche() {
    var p = propuestaCoche(); if (!p) return false;
    try { W.localStorage.setItem(LS_NO, JSON.stringify({ med: p.mediana, at: Date.now() })); } catch (e) { return false; }
    try { W.dispatchEvent(new W.CustomEvent('pilotos-fatiga-perfil')); } catch (e) {}
    return true;
  }

  return { DEF: DEF, OPC: OPC, HOTEL_PREP: HOTEL_PREP, completa: completa, params: params,
           mctq: mctq, desfase: desfase, cronotipo: cronotipo,
           lee: lee, guarda: guarda, toca: toca, marca: marca,
           apuntaCoche: apuntaCoche, medidas: medidas, resumenCoche: resumenCoche,
           propuestaCoche: propuestaCoche, aceptaCoche: aceptaCoche, rechazaCoche: rechazaCoche, valido: valido,
           actual: function () { return params(lee()); } };
});
