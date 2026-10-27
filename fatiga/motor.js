/* ═══════════════════════════════════════════════════════════════════════
   FatigaMotor — fatiga prevista a partir del roster (F1 del sistema de fatiga)

   Modelo de tres procesos de Åkerstedt y Folkard (publicado, sin licencia):
     A = S + C + W
     S  presión de sueño: despierto  S = La + (S0 − La)·e^(−kWake·t)
                          durmiendo  S = Ha − (Ha − S0)·e^(−kSleep·t)
     C  ritmo circadiano: C = M·cos(2π·(h − fase)/24), h = hora local de la base
     W  inercia al despertar: W = Wc·e^(−kW·t)
   A < 7 es la zona de somnolencia peligrosa de la literatura del modelo.
   KSS ≈ 10,6 − 0,6·A es una conversión APROXIMADA, para que el número se lea.

   El sueño NO lo sabe el roster: se ESTIMA de los huecos de descanso con las
   reglas de P (acostarse 23:00, adelantar como mucho a 21:30, levantarse 07:00
   o lo que obligue la firma, un sueño que empieza de día se corta a 5 h…).
   Es un modelo de población media; lo que el piloto mida (F2/F3) lo corrige.

   Puro: sin DOM ni localStorage. El huso entra por parámetro (`offset`), así
   que se prueba con cualquier día del año. Lo cargan la app y los bancos.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.FatigaMotor = factory();
})(this, function () {
'use strict';

var MIN = 60000;
var P = {
  // Modelo (Åkerstedt y Folkard)
  La: 2.4, Ha: 14.3, kWake: 0.0353, kSleep: 0.381,
  M: 2.5, fase: 16.8, Wc: -5.72, kW: 1.51,
  // Niveles sobre A (y su KSS aproximado)
  umbralAlto: 7, umbralMod: 8.5,
  // Reglas del sueño estimado (minutos, hora local de la base)
  acostar: 23 * 60, acostarMin: 21 * 60 + 30,
  levantar: 7 * 60, levantarLibre: 8 * 60, levantarTope: 11 * 60,
  prepCasa: 90, prepHotel: 60, postCasa: 45, postHotel: 30,
  objetivo: 8 * 60, topeDia: 5 * 60, minEpisodio: 60,
  debrief: 20,
  // Deuda que sube el nivel un escalón (regla de la app, no del modelo: el
  // modelo de tres procesos recupera rápido y subestima la deuda acumulada)
  deudaEscalon: 6 * 60,
  paso: 5
};

function kss(A){ return Math.max(1, Math.min(9, Math.round((10.6 - 0.6 * A) * 10) / 10)); }
function nivel(A){ return A == null ? null : A < P.umbralAlto ? 'alto' : A < P.umbralMod ? 'moderado' : 'bajo'; }
var ORDEN = ['bajo', 'moderado', 'alto'];

/* Medianoche local (en ms UTC) del día local que contiene t. */
function medianoche(t, offset){
  var off = offset(t);
  var l = t + off * MIN;
  var m = l - (((l % 86400000) + 86400000) % 86400000);
  // el offset de la medianoche puede ser otro (cambio de hora): una pasada más
  return m - offset(m - off * MIN) * MIN;
}
function horaLocal(t, offset){ var l = t + offset(t) * MIN; return ((l % 86400000) + 86400000) % 86400000 / MIN; }
function local(dia0, minuto, offset){
  // dia0 = medianoche local; minuto local del día (puede pasar de 1440)
  var g = dia0 + minuto * MIN;
  var corr = offset(g) - offset(dia0);
  return g - corr * MIN;
}

function tocaWocl(j, offset){
  for (var t = j.inicio; t <= j.fin; t += 15 * MIN){
    var h = horaLocal(t, offset);
    if (h >= 2 * 60 && h < 6 * 60) return true;
  }
  return false;
}

/* ── Episodios de sueño estimados entre jornadas ── */
function suenos(jor, desde, hasta, offset){
  var eps = [];
  var huecos = [];
  var prevFin = desde, prevFuera = false;
  for (var i = 0; i <= jor.length; i++){
    var j = jor[i];
    var R = j ? j.inicio : hasta;
    huecos.push({
      a: prevFin + (i === 0 ? 0 : (prevFuera ? P.postHotel : P.postCasa) * MIN),
      b: R - (j ? (prevFuera ? P.prepHotel : P.prepCasa) * MIN : 0),
      siguiente: j || null, previa: jor[i - 1] || null
    });
    if (j){ prevFin = j.fin; prevFuera = !!j.fuera; }
  }
  var diasConJornada = {};
  jor.forEach(function(j){ diasConJornada[medianoche(j.inicio, offset)] = true; });

  huecos.forEach(function(h){
    if (h.b - h.a < P.minEpisodio * MIN) return;
    var propios = [];
    for (var d = medianoche(h.a, offset) - 86400000; d <= h.b; d = medianoche(d + 36 * 3600000, offset)){
      var manana = medianoche(d + 36 * 3600000, offset);
      var acostar = local(d, P.acostar, offset);
      var levantar = local(manana, diasConJornada[manana] ? P.levantar : P.levantarLibre, offset);
      var fin = Math.min(levantar, h.b);
      // Si madruga, adelanta la hora de acostarse para buscar el objetivo, pero
      // antes de las 21:30 no se duerme.
      if (fin - acostar < P.objetivo * MIN)
        acostar = Math.max(local(d, P.acostarMin, offset), Math.min(acostar, fin - P.objetivo * MIN));
      var ini = Math.max(acostar, h.a);
      // Llegó tarde: se levanta más tarde, como mucho a las 11:00.
      if (ini > local(d, P.acostar, offset) && fin === levantar)
        fin = Math.min(h.b, Math.max(levantar, Math.min(ini + P.objetivo * MIN, local(manana, P.levantarTope, offset))));
      if (fin - ini >= P.minEpisodio * MIN) propios.push({ ini: ini, fin: fin });
    }
    // Sueño de recuperación tras una jornada NOCTURNA (que tocó las 02:00–05:59)
    // y acaba por la mañana: de día el ritmo circadiano no deja dormir más de 5 h.
    // Tras una madrugada normal no se supone siesta: eso lo dirá el piloto (F2).
    var hA = horaLocal(h.a, offset);
    if (h.previa && tocaWocl(h.previa, offset) && hA >= 4 * 60 && hA < 12 * 60){
      var r = { ini: h.a, fin: Math.min(h.a + P.topeDia * MIN, h.b) };
      var choca = propios.some(function(e){ return e.ini < r.fin && r.ini < e.fin; });
      if (!choca && r.fin - r.ini >= P.minEpisodio * MIN) propios.push(r);
    }
    propios.forEach(function(e){ eps.push(e); });
  });
  eps.sort(function(x, y){ return x.ini - y.ini; });
  // fusiona solapes
  var out = [];
  eps.forEach(function(e){
    var u = out[out.length - 1];
    if (u && e.ini <= u.fin) u.fin = Math.max(u.fin, e.fin); else out.push({ ini: e.ini, fin: e.fin });
  });
  return out;
}

/* ── Simulación de S y A ── */
function simula(eps, desde, hasta, offset){
  var paso = P.paso * MIN;
  var n = Math.ceil((hasta - desde) / paso) + 1;
  var S = new Float64Array(n), dormido = new Uint8Array(n), despierto = new Float64Array(n);
  var s = 12.5, k = 0, ultimoDespertar = desde - 5 * 3600000;
  for (var i = 0; i < n; i++){
    var t = desde + i * paso;
    while (k < eps.length && eps[k].fin <= t) k++;
    var dur = k < eps.length && eps[k].ini <= t && t < eps[k].fin;
    if (i > 0){
      var h = paso / 3600000;
      if (dur) s = P.Ha - (P.Ha - s) * Math.exp(-P.kSleep * h);
      else s = P.La + (s - P.La) * Math.exp(-P.kWake * h);
    }
    if (!dur && i > 0 && dormido[i - 1]) ultimoDespertar = t;
    S[i] = s; dormido[i] = dur ? 1 : 0; despierto[i] = ultimoDespertar;
  }
  function en(t){
    var i = Math.max(0, Math.min(n - 1, Math.round((t - desde) / paso)));
    var h = horaLocal(t, offset) / 60;
    var C = P.M * Math.cos(2 * Math.PI * (h - P.fase) / 24);
    var tw = (t - despierto[i]) / 3600000;
    var W = dormido[i] ? 0 : P.Wc * Math.exp(-P.kW * Math.max(0, tw));
    return { A: Math.round((S[i] + C + W) * 100) / 100, S: S[i], C: C, W: W, despierto: t - despierto[i], dormido: !!dormido[i] };
  }
  return en;
}

function solape(eps, a, b){
  var m = 0;
  eps.forEach(function(e){ var x = Math.max(a, e.ini), y = Math.min(b, e.fin); if (y > x) m += y - x; });
  return m / MIN;
}

/* jornadas: [{ fecha, inicio (ms UTC, firma), fin (ms UTC, último calzo),
               aterrizajes:[{ms, pos}], sectores, fuera }]
   offset(ms) → minutos que suma la hora local de la base a UTC. */
function calcula0(opts){
  opts = opts || {};
  var offset = opts.offset || function(){ return 0; };
  var jor = (opts.jornadas || []).filter(function(j){
    return j && isFinite(j.inicio) && isFinite(j.fin) && j.fin > j.inicio;
  }).map(function(j){
    return { fecha: j.fecha, inicio: j.inicio, fin: j.fin + P.debrief * MIN, ultimo: j.fin,
             aterrizajes: (j.aterrizajes || []).slice().sort(function(a, b){ return a.ms - b.ms; }),
             sectores: j.sectores || 0, fuera: !!j.fuera };
  }).sort(function(a, b){ return a.inicio - b.inicio; });
  var res = { porFecha: {}, lista: [], parametros: P };
  if (!jor.length) return res;

  var desde = medianoche(jor[0].inicio, offset) - 3 * 86400000 + 12 * 3600000;
  var hasta = jor[jor.length - 1].fin + 86400000;
  var eps = suenos(jor, desde, hasta, offset);
  var en = simula(eps, desde, hasta, offset);
  // Para dibujar: los sueños estimados y la vigilia en cualquier tramo. La
  // pantalla no recalcula nada: lee lo mismo que decide el nivel.
  res.suenos = eps;
  res.desde = desde; res.hasta = hasta;
  res.serie = function(a, b, pasoMin){
    var out = [], d = (pasoMin || 30) * MIN;
    a = Math.max(a, desde); b = Math.min(b, hasta);
    for (var t = a; t <= b; t += d){ var e = en(t); out.push({ ms: t, A: e.A, dormido: e.dormido }); }
    return out;
  };
  res.en = function(t){ return t < desde || t > hasta ? null : en(t); };
  /* «¿Y si duermo además esto?»: el mismo modelo con sueños añadidos (una siesta
     antes de firmar, un descanso controlado en cabina). Devuelve en(t) nuevo; los
     sueños estimados no se tocan. Es lo que deja al Plan dar un efecto CALCULADO
     en vez de una promesa. */
  res.prueba = function(extra){
    var e2 = eps.concat((extra || []).filter(function(e){ return e && e.fin > e.ini; })).sort(function(x, y){ return x.ini - y.ini; });
    var u = [];
    e2.forEach(function(e){ var z = u[u.length - 1]; if (z && e.ini <= z.fin) z.fin = Math.max(z.fin, e.fin); else u.push({ ini: e.ini, fin: e.fin }); });
    var f = simula(u, desde, hasta, offset);
    return function(t){ return t < desde || t > hasta ? null : f(t); };
  };

  var madrugadas = 0, fechaPrev = null;
  jor.forEach(function(j){
    var hIni = horaLocal(j.inicio, offset), hFin = horaLocal(j.ultimo, offset);
    var operados = j.aterrizajes.filter(function(x){ return !x.pos; });
    var puntos = (operados.length ? operados : [{ ms: j.ultimo }]).map(function(x){
      var e = en(x.ms); return { ms: x.ms, sal: x.sal || null, A: e.A, kss: kss(e.A), dep: x.dep || '', arr: x.arr || '' };
    });
    var peor = puntos.reduce(function(m, p){ return !m || p.A < m.A ? p : m; }, null);
    var peorJornada = null;
    for (var t = j.inicio; t <= j.ultimo; t += 15 * MIN){
      var e2 = en(t); if (!peorJornada || e2.A < peorJornada.A) peorJornada = { ms: t, A: e2.A };
    }
    // El último sueño antes de firmar (el episodio más reciente), no la suma de
    // 24 h: con una madrugada, la cola de la noche anterior inflaría la cifra.
    var ultimoSueno = null;
    eps.forEach(function(e){ if (e.ini < j.inicio && (!ultimoSueno || e.ini > ultimoSueno.ini)) ultimoSueno = e; });
    var sueno = ultimoSueno ? (Math.min(ultimoSueno.fin, j.inicio) - ultimoSueno.ini) / MIN : 0;
    var deuda = Math.max(0, 3 * P.objetivo - solape(eps, j.inicio - 72 * 3600000, j.inicio));
    var despierto = en(j.ultimo).despierto / MIN;

    // Factores: lo que explica el nivel. Horas locales de la base.
    var f = [];
    var temprana = hIni < 7 * 60;
    if (hIni < 5 * 60) f.push({ k: 'firma_wocl', h: hIni });
    else if (temprana) f.push({ k: 'madrugada', h: hIni });
    var dia = medianoche(j.inicio, offset);
    var seguida = fechaPrev != null && dia - fechaPrev <= 30 * 3600000;
    madrugadas = temprana ? (seguida ? madrugadas + 1 : 1) : 0;
    if (madrugadas >= 3) f.push({ k: 'madrugadas_seguidas', n: madrugadas });
    fechaPrev = dia;
    if (hFin >= 23 * 60 || (j.ultimo - j.inicio > 0 && hFin < 2 * 60 && hFin < hIni)) f.push({ k: 'tarde', h: hFin });
    // Invade la ventana de bajo rendimiento circadiano (02:00–05:59 locales)
    if (tocaWocl({ inicio: j.inicio, fin: j.ultimo }, offset)) f.push({ k: 'wocl' });
    if (sueno < 6 * 60) f.push({ k: 'poco_sueno', min: Math.round(sueno) });
    if (j.sectores >= 4) f.push({ k: 'sectores', n: j.sectores });
    if (despierto >= 16 * 60) f.push({ k: 'despierto', min: Math.round(despierto) });
    if (deuda >= 4 * 60) f.push({ k: 'deuda', min: Math.round(deuda) });

    var niv = nivel(peor.A), ajuste = false;
    if (deuda >= P.deudaEscalon && niv !== 'alto'){ niv = ORDEN[ORDEN.indexOf(niv) + 1]; ajuste = true; }

    var r = {
      fecha: j.fecha, inicio: j.inicio, fin: j.ultimo, sectores: j.sectores, fuera: j.fuera, nivel: niv, A: peor.A, kss: peor.kss, peor: peor,
      aterrizajes: puntos, peorJornada: peorJornada,
      sueno: Math.round(sueno), deuda: Math.round(deuda), despierto: Math.round(despierto),
      ajusteDeuda: ajuste, factores: f,
      ultimoSueno: ultimoSueno ? { ini: ultimoSueno.ini, fin: Math.min(ultimoSueno.fin, j.inicio) } : null
    };
    res.porFecha[j.fecha] = r; res.lista.push(r);
  });
  return res;
}

/* ── El perfil del piloto (public/fatiga/perfil.js, el cuestionario de la
   primera entrada): cambia SÓLO las reglas del sueño estimado y la fase del
   ritmo circadiano, cada una dentro de un rango. P es de módulo, así que se
   cambia mientras se calcula y se DEVUELVE; y como la serie, `en` y `prueba`
   calculan después, también se envuelven: si no, la pantalla dibujaría con un
   piloto y el nivel saldría con otro. */
var AJUSTABLE = { prepCasa: [20, 240], objetivo: [300, 600], acostar: [21 * 60, 25 * 60],
                  levantar: [4 * 60, 12 * 60], levantarLibre: [5 * 60, 12 * 60], fase: [14, 20],
                  prepHotel: [20, 180] };
function conP(perfil, fn){
  if (!perfil) return fn();
  var viejo = {};
  Object.keys(AJUSTABLE).forEach(function(k){
    var v = perfil[k], r = AJUSTABLE[k];
    if (typeof v === 'number' && isFinite(v)){ viejo[k] = P[k]; P[k] = Math.max(r[0], Math.min(r[1], v)); }
  });
  if ('acostar' in viejo){ viejo.acostarMin = P.acostarMin; P.acostarMin = P.acostar - 90; }
  try { return fn(); } finally { Object.keys(viejo).forEach(function(k){ P[k] = viejo[k]; }); }
}
function calcula(opts){
  var perfil = opts && opts.perfil;
  if (!perfil) return calcula0(opts);
  var res = conP(perfil, function(){ var r = calcula0(opts); r.parametros = JSON.parse(JSON.stringify(P)); return r; });
  ['serie', 'en'].forEach(function(k){
    var f = res[k]; if (f) res[k] = function(){ var a = arguments; return conP(perfil, function(){ return f.apply(null, a); }); };
  });
  if (res.prueba){
    var pr = res.prueba;
    res.prueba = function(extra){
      var g = conP(perfil, function(){ return pr(extra); });
      return function(t){ return conP(perfil, function(){ return g(t); }); };
    };
  }
  return res;
}

return { P: P, AJUSTABLE: AJUSTABLE, calcula: calcula, kss: kss, nivel: nivel, _suenos: suenos, _medianoche: medianoche };
});
