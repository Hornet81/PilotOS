/* ══════════════════════════════════════════════════════════════════════════
   CAMBIOS DE PROGRAMACIÓN — motor de reglas (puro, sin dependencias)
   Art. 12.9 del IV Convenio Colectivo de pilotos de Vueling (vigente 1-ene-2025)

   QUÉ DICE EL ARTÍCULO, y por qué está implementado así
   ─────────────────────────────────────────────────────
   Se compara «la programación inicial (publicada) con la ejecutada, una vez
   finalizado el mes». Es UNA sola comparación, no una cadena de versiones: por
   eso aquí entran dos fotos del mes y nada más.

   Un cambio solo se considera si conlleva, SIMULTÁNEAMENTE:
     · un cambio de número de vuelo, Y
     · un ADELANTO de la hora de inicio de actividad o un RETRASO de la hora de
       fin, de MÁS de 60 minutos.
   La asimetría es del convenio y es deliberada: cuenta lo que invade el
   descanso (levantarse antes, terminar más tarde), no lo que lo devuelve. Un
   día que empieza 3 h más tarde y acaba a la misma hora NO cuenta.

   También cuenta:
     · la asignación de una pernocta que no estaba en la programación inicial;
     · una imaginaria que ANTES de ser activada se sustituye por otra actividad
       (o al revés) con ese mismo movimiento de más de 60 min.

   No se remunera nunca: ART, e-learning y simuladores. Ni los cambios en
   ejecución, los pedidos por el piloto, las permutas, o los que salen de una
   situación personal suya (enfermedad, permisos, licencias, actividad
   sindical). Ni la asignación de actividad en días de franco o reserva, ni la
   activación de imaginaria — salvo que la activación de una imaginaria AISLADA
   o la ÚLTIMA de un bloque suponga pernocta.

   Escalera mensual (Anexo A): el 1.º y el 2.º no devengan; del 3.º al 10.º,
   49,11 €; del 11.º en adelante, 73,66 €. Ojo: el 1.º y el 2.º SÍ cuentan para
   la numeración — el artículo cuenta «cambios mensuales que no sean en
   ejecución», no «cambios abonados».

   POR QUÉ ESTE MÓDULO ES ISOMORFO
   Lo cargan el backend (server.js), el cliente (index.html, para el autotest de
   ⋮ → Pruebas) y los bancos. Una segunda copia de estas reglas acabaría como
   ES_AIRPORTS y ES_IATA, que eran la misma lista en dos sitios, se separaron y
   cada día con un sector de Alicante salía a dieta internacional.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ─────────────── 1. Las tres constantes del artículo ───────────────
   En un solo sitio y con nombre, para que cambiar la lectura del convenio sea
   tocar una línea y no perseguir números por el archivo. */
var REGLAS = {
  // «de MÁS de 60 minutos» — estrictamente mayor. Un `>=` aquí regala un cambio
  // entero (49,11 €) cada vez que el movimiento cae en 60 clavados.
  umbralMin: 60,
  // El 1.º y el 2.º del mes no devengan, pero cuentan para la numeración.
  gratisAlMes: 2,
  // La unidad de cambio es la JORNADA. Un día que cumple a la vez la regla del
  // vuelo y la de la pernocta es UN cambio, no dos.
  unidad: 'jornada'
};

/* Tarifas del Anexo A. Se pasan por parámetro (el backend las lee de
   convenio_anexo_a.json); esto es solo el respaldo para los bancos y el cliente. */
var TARIFAS_2026 = { del3al10: 49.11, del11enAdelante: 73.66 };

/* ─────────────── 2. Códigos ───────────────
   Mismas familias que server.js. Se comparan SIEMPRE en mayúsculas. */
var COD_FORMACION = ['ART','SIM','LPC','OPC','LFT','EBT','EVA','EVAL','SBTL','SBTO',
                     'TRT','RFSV','RFSM','RFT','CUR','IET'];
var COD_FRANCO    = ['F','F2','FR','FR2','HFR','RF','OFF','SROF','NOFF','AOFF','NROF',
                     'MEOF','EF','>OFF','PT','PTME','PTM'];
var COD_RESERVA   = ['SBY','STBY','HSBY','XSBY','ZSBY','TSBY','RSBY','ESBY','OSBY',
                     'FSBY','RSF','LSBY','ASBY','NSBY','OASF','1SBY','2SBY','3SBY',
                     '4SBY','5SBY','8SBY','NBY1','NBY2','NBY3','NBY4','NBY5','CSBY',
                     'SBYS','SBYM','SBYK','SBYA','SB21','D5BY','CHBY','HS21','2HBY',
                     '3HBY','2CHY','3CHY','AA','AAI'];
var COD_PERSONAL  = ['SICK','SIND','MED','ASEP','PERM','LIC','MAT','PAT','HOSP',
                     'VAC','RVAC','PVAC','VAI','PVAI','RVAI','VICC'];
/* Forzoso del Art. 12.6: cambio de servicio EN EJECUCIÓN. Es un dato del roster,
   no una deducción — por eso el descarte que provoca no es rebatible. */
var COD_FORZOSO   = ['FZ','FZNA'];

function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
function enLista(codes, lista){
  for (var i = 0; i < codes.length; i++) if (lista.indexOf(codes[i]) > -1) return true;
  return false;
}
// El e-learning llega como LM, LMF2, LMCC, LMFE, LMSL, LMCE… Un prefijo, no una lista.
function esELearning(codes){
  for (var i = 0; i < codes.length; i++) if (/^LM/.test(codes[i])) return true;
  return false;
}
function esFormacion(d){ return esELearning(d.codes) || enLista(d.codes, COD_FORMACION) || d.tipos.indexOf('lm') > -1 || d.tipos.indexOf('training') > -1 || d.tipos.indexOf('ebt') > -1 || d.tipos.indexOf('eva') > -1; }
function esFranco(d){ return enLista(d.codes, COD_FRANCO) || d.tipos.indexOf('off') > -1; }
function esReserva(d){ return enLista(d.codes, COD_RESERVA) || d.tipos.indexOf('standby') > -1; }
function esPersonal(d){ return enLista(d.codes, COD_PERSONAL) || d.tipos.indexOf('sick') > -1 || d.tipos.indexOf('vacation') > -1; }
function tieneForzoso(d){ return enLista(d.codes, COD_FORZOSO); }

/* ─────────────── 3. Horas ───────────────
   `--:--` es un valor DE VERDAD que manda eCrews cuando no hay hora programada.
   Una cadena de `||` se para ahí porque es truthy y lo que venga detrás —la hora
   real— no se mira nunca. Costó el bloque, las posicionales y las nocturnas del
   mes entero, todo a cero a la vez y sin un solo error. */
function hm(s){
  if (!s) return null;
  var m = String(s).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function primeraLegible(){
  for (var i = 0; i < arguments.length; i++){ var v = hm(arguments[i]); if (v != null) return v; }
  return null;
}
/* Desenrolla una secuencia de horas de reloj a minutos absolutos crecientes.
   Sin esto, una jornada que sale a las 18:10 y aterriza a las 00:40 mide −17h30
   en vez de 6h30, y el ±60 min del artículo se calcula contra un reloj que ha
   dado la vuelta. Una jornada nunca dura más de 24 h, así que la monotonía no
   es ambigua. */
function desenrolla(mins){
  var out = [], prev = null;
  for (var i = 0; i < mins.length; i++){
    var v = mins[i];
    if (v == null){ out.push(null); continue; }
    if (prev != null) while (v < prev) v += 1440;
    out.push(v); prev = v;
  }
  return out;
}

/* ─────────────── 4. De entradas de roster a jornadas ───────────────
   Solo se mira la hora SCHEDULED. Es el filtro antifalsos-positivos más
   importante de todo el módulo: eCrews reescribe las estimadas continuamente y
   sin este filtro el contador se iría a treinta cambios al mes. Una E no es un
   cambio de programación; es la misma programación con más información. */
function jornadas(entries){
  var dias = {};
  (entries || []).forEach(function(e){
    if (!e || !e.date) return;
    if (e.type === '__deleted__' || e.type === 'overnight_continuation') return;
    var d = dias[e.date] || (dias[e.date] = {
      date: e.date, codes: [], tipos: [], vuelos: [], firma: null, _seq: []
    });
    if (e.code) { var c = up(e.code); if (d.codes.indexOf(c) < 0) d.codes.push(c); }
    if (e.type) { var t = String(e.type); if (d.tipos.indexOf(t) < 0) d.tipos.push(t); }

    var fi = primeraLegible(e.checkin, e.report);
    if (fi != null && (d.firma == null || fi < d.firma)) d.firma = fi;

    if (e.type === 'flight'){
      // SOLO la scheduled. `std_estimated` / `std_actual` quedan fuera a propósito.
      var std = primeraLegible(e.std_scheduled, e.std);
      var sta = primeraLegible(e.sta_scheduled, e.sta);
      d.vuelos.push({
        num: up(e.flightNum || e.flight_number || e.flight),
        dep: up(e.dep), arr: up(e.arr), std: std, sta: sta
      });
    } else {
      // Actividades de tierra: su ventana también cuenta para inicio y fin.
      var s1 = primeraLegible(e.std, e.start), s2 = primeraLegible(e.sta, e.end);
      if (s1 != null || s2 != null) d._seq.push([s1, s2]);
    }
  });
  Object.keys(dias).forEach(function(k){ ventana(dias[k]); });
  return dias;
}

/* Inicio y fin de actividad de una jornada, en minutos desenrollados.
   Inicio = la firma si la hay; si no, el primer despegue programado. */
function ventana(d){
  var crudo = [];
  if (d.firma != null) crudo.push(d.firma);
  d.vuelos.forEach(function(v){ crudo.push(v.std); crudo.push(v.sta); });
  d._seq.forEach(function(p){ crudo.push(p[0]); crudo.push(p[1]); });
  var abs = desenrolla(crudo).filter(function(v){ return v != null; });
  d.inicio = abs.length ? abs[0] : null;
  d.fin    = abs.length ? abs[abs.length - 1] : null;
  // Firma de los vuelos del día, para comparar «cambio de número de vuelo».
  d.numeros = d.vuelos.map(function(v){ return v.num; }).filter(Boolean).sort().join(',');
  return d;
}

/* ─────────────── 5. El motor ───────────────
   opts = {
     inicial      : entradas del roster de la programación INICIAL (v0)
     actual       : entradas del roster vigente / ejecutado
     pernoctasIni : ['YYYY-MM-DD', …]  noches de la inicial (fecha en que SALE)
     pernoctasAct : ['YYYY-MM-DD', …]  noches de lo ejecutado
     marcas       : { 'YYYY-MM-DD': { mine:true, motivo:'permuta', at:iso } }
     vistoEn      : { 'YYYY-MM-DD': iso }  cuándo se vio por primera vez la diferencia
     cubiertos    : ['YYYY-MM-DD', …]  días que la foto ACTUAL cubre de verdad
     tarifas      : { del3al10, del11enAdelante }
     mes          : 'YYYY-MM'
   } */
function detectar(opts){
  opts = opts || {};
  var tarifas = opts.tarifas || TARIFAS_2026;
  var ini = jornadas(opts.inicial), act = jornadas(opts.actual);
  var marcas = opts.marcas || {}, vistoEn = opts.vistoEn || {};
  var pIni = {}, pAct = {};
  (opts.pernoctasIni || []).forEach(function(d){ pIni[d] = true; });
  (opts.pernoctasAct || []).forEach(function(d){ pAct[d] = true; });

  /* Cobertura: un import parcial NO puede leerse como servicios eliminados. Si no
     se declara, se toman como cubiertos los días que la foto actual trae — que es
     lo mismo que hace `_ecApplyMonthReplace` con `_ecDays` al reemplazar el mes. */
  var cubre = {};
  if (opts.cubiertos && opts.cubiertos.length) opts.cubiertos.forEach(function(d){ cubre[d] = true; });
  else Object.keys(act).forEach(function(d){ cubre[d] = true; });

  var fechas = Object.keys(ini).concat(Object.keys(act))
    .filter(function(v, i, a){ return a.indexOf(v) === i; })
    .filter(function(d){ return !opts.mes || d.slice(0, 7) === opts.mes; })
    .sort();

  var computables = [], descartados = [];

  fechas.forEach(function(fecha){
    if (!cubre[fecha]) return;                 // día que la foto actual no cubre
    var a = ini[fecha] || vacio(fecha);
    var b = act[fecha] || vacio(fecha);

    var dIni = (a.inicio != null && b.inicio != null) ? (b.inicio - a.inicio) : null;
    var dFin = (a.fin    != null && b.fin    != null) ? (b.fin    - a.fin)    : null;
    // «Adelanto del inicio» o «retraso del fin», ambos de MÁS de 60 min.
    var mueve = (dIni != null && dIni < -REGLAS.umbralMin) ||
                (dFin != null && dFin >  REGLAS.umbralMin);
    var cambiaVuelo = a.numeros !== b.numeros;
    var pernoctaNueva = !!pAct[fecha] && !pIni[fecha];

    // ── Qué sería, si nada lo excluyera ──
    var cand = null;
    if (esReserva(a) && !esReserva(b)){
      /* Imaginaria que deja de serlo. Si se sustituyó ANTES de activarse, es un
         cambio del artículo; si lo que pasó es que la activaron, no lo es —
         salvo que esa activación (aislada o última de un bloque) traiga pernocta.
         Lo único que los distingue es CUÁNDO apareció la diferencia. */
      var activada = fueEnEjecucion(fecha, a, b, vistoEn);
      if (activada === true){
        if (pernoctaNueva && aisladaOUltima(fecha, ini)) {
          cand = { tipo:'imaginaria_pernocta', motivo:'imaginaria activada con pernocta' };
        }
      } else if (mueve){
        cand = { tipo:'imaginaria_sust',
                 motivo:'imaginaria sustituida antes de activarse' + txtMov(dIni, dFin) };
      }
    }
    if (!cand && pernoctaNueva && !esReserva(a) && !esFranco(a)){
      cand = { tipo:'pernocta', motivo:'pernocta que no estaba en la programación inicial' };
    }
    if (!cand && cambiaVuelo && mueve){
      cand = { tipo:'vuelo_tiempo', motivo:'cambia el nº de vuelo' + txtMov(dIni, dFin) };
    }
    if (!cand) return;                         // no encaja en el artículo: informativo

    var base = {
      date: fecha, tipo: cand.tipo, motivo: cand.motivo,
      dIni: dIni, dFin: dFin,
      vuelosIni: a.vuelos, vuelosAct: b.vuelos,
      inicioIni: a.inicio, finIni: a.fin, inicioAct: b.inicio, finAct: b.fin,
      firmaIni: a.firma, firmaAct: b.firma
    };

    // ── Excluyentes, en el orden en que manda el artículo ──
    var ex = excluye(fecha, a, b, cand, marcas, vistoEn);
    if (ex){ descartados.push(mezcla(base, ex)); return; }
    computables.push(base);
  });

  // ── Escalera. El orden es cronológico, y el 1.º y el 2.º cuentan. ──
  var abonados = 0, importe = 0;
  computables.forEach(function(c, i){
    c.ordinal = i + 1;
    c.importe = importeDe(c.ordinal, tarifas);
    if (c.importe > 0) abonados++;
    importe += c.importe;
  });
  // Qué recuperaría cada descartado si el piloto le quitara la marca: se calcula
  // metiéndolo en su sitio cronológico, no al final.
  descartados.forEach(function(d){
    if (!d.revisable) return;
    var pos = 1; computables.forEach(function(c){ if (c.date < d.date) pos++; });
    d.seria = { ordinal: pos, importe: importeDe(pos, tarifas) };
  });

  return {
    mes: opts.mes || null,
    computables: computables,
    descartados: descartados,
    nComputables: computables.length,
    nAbonan: abonados,
    importe: Math.round(importe * 100) / 100,
    tarifas: tarifas
  };
}

function vacio(fecha){ return { date:fecha, codes:[], tipos:[], vuelos:[], firma:null, _seq:[], inicio:null, fin:null, numeros:'' }; }
function mezcla(a, b){ var o = {}; Object.keys(a).forEach(function(k){ o[k] = a[k]; }); Object.keys(b).forEach(function(k){ o[k] = b[k]; }); return o; }

function txtMov(dIni, dFin){
  if (dIni != null && dIni < -REGLAS.umbralMin) return ' y el inicio se adelanta ' + hhmm(-dIni);
  if (dFin != null && dFin >  REGLAS.umbralMin) return ' y el fin se retrasa ' + hhmm(dFin);
  return '';
}
function hhmm(m){ var h = Math.floor(m / 60), r = m % 60; return h ? (h + 'h' + (r ? String(r).padStart(2,'0') : '')) : (r + ' min'); }

function importeDe(ordinal, tarifas){
  if (ordinal <= REGLAS.gratisAlMes) return 0;
  return ordinal <= 10 ? tarifas.del3al10 : tarifas.del11enAdelante;
}

/* ¿La diferencia apareció con la jornada ya empezada? Dos fuentes, y no valen lo
   mismo: el código FZ/FZNA es un DATO del roster y no se discute; la hora en que
   la app vio la diferencia es una DEDUCCIÓN suya. Devuelve true / false / null
   (no se puede afirmar).

   La deducción solo vale DENTRO de la ventana de la actividad original. Que la
   diferencia se viera DESPUÉS de que la jornada acabara no significa que el
   cambio se hiciera durante ella: significa que nos enteramos tarde — un piloto
   que sincroniza el lunes, o un mes entero importado a posteriori. Con la
   comparación de «después del arranque» a secas, importar un mes ya cerrado
   marcaba TODOS sus cambios como en ejecución y el piloto no cobraba ninguno. */
function fueEnEjecucion(fecha, a, b, vistoEn){
  if (tieneForzoso(b) || tieneForzoso(a)) return true;
  var iso = vistoEn[fecha];
  if (!iso) return null;
  var visto = new Date(iso);
  if (isNaN(visto.getTime())) return null;
  /* El ancla es el arranque de la actividad ORIGINAL, no el de la nueva: es la que
     ya estaba en marcha cuando llegó el cambio. Con el de la nueva, activar una
     imaginaria a las 10:00 para una firma a las 12:00 se leería como sustitución
     previa — y pagaría 49,11 € que el artículo excluye. */
  var arranque = (a.inicio != null ? a.inicio : b.inicio);
  var cierre   = (a.fin    != null ? a.fin    : b.fin);
  if (arranque == null) return null;
  var base = new Date(fecha + 'T00:00:00Z').getTime();
  var t0 = base + arranque * 60000;
  if (visto.getTime() < t0) return false;                 // se supo antes: no es en ejecución
  if (cierre == null) return null;
  var t1 = base + cierre * 60000;
  return visto.getTime() <= t1 ? true : null;             // pasada la jornada, no se puede afirmar
}

/* Una imaginaria es AISLADA o la ÚLTIMA de un bloque si el día siguiente de la
   programación inicial ya no es reserva. Es lo que pide el artículo para que su
   activación con pernocta llegue a contar. */
function aisladaOUltima(fecha, ini){
  var sig = new Date(fecha + 'T00:00:00Z');
  sig.setUTCDate(sig.getUTCDate() + 1);
  var k = sig.toISOString().slice(0, 10);
  return !(ini[k] && esReserva(ini[k]));
}

/* Los excluyentes. `revisable` marca los que el piloto puede rebatir: una
   conjetura de la app que no se puede discutir es una conjetura que quita dinero
   en silencio. Una regla del convenio o un dato del roster, no. */
function excluye(fecha, a, b, cand, marcas, vistoEn){
  if (esFormacion(a) || esFormacion(b))
    return { causa:'formacion', detalle:'ART, e-learning o simulador — excluido por el artículo', revisable:false };

  var m = marcas[fecha];
  if (m && m.mine)
    return { causa:'solicitado_piloto', detalle: m.motivo || 'lo pediste tú', revisable:true, marcadoEn: m.at || null };

  if (esPersonal(b) || esPersonal(a))
    return { causa:'situacion_personal', detalle:'enfermedad, permiso, licencia o actividad sindical', revisable:true };

  /* Franco y reserva: la asignación de actividad ahí no es cambio remunerado en
     ningún caso. La excepción del artículo —imaginaria aislada o última de un
     bloque cuya activación suponga pernocta— ya ha decidido antes que el
     candidato sea `imaginaria_pernocta`, así que aquí se deja pasar. */
  if (cand.tipo !== 'imaginaria_pernocta' && cand.tipo !== 'imaginaria_sust'){
    if (esFranco(a))  return { causa:'franco', detalle:'actividad asignada en día de franco', revisable:false };
    if (esReserva(a)) return { causa:'reserva', detalle:'actividad asignada en día de reserva', revisable:false };
  }

  // El código FZ es un forzoso del Art. 12.6: excluye siempre, venga como venga.
  if (tieneForzoso(a) || tieneForzoso(b))
    return { causa:'en_ejecucion', detalle:'código FZ — cambio forzoso en ejecución (Art. 12.6)', revisable:false };

  /* La deducción por la HORA solo vale para los cambios de servicio y las
     pernoctas. Las dos vías de imaginaria quedan fuera a propósito:
       · la ACTIVACIÓN pasa por definición dentro de la ventana de la imaginaria,
         así que la hora la marcaría siempre como «en ejecución» y se cargaría la
         excepción que el propio artículo concede (imaginaria aislada o última de
         un bloque cuya activación suponga pernocta);
       · y una SUSTITUCIÓN detectada dentro de esa ventana ya se ha clasificado
         antes como activación, no como sustitución.
     Sin esta salvedad, la excepción del convenio no se pagaba nunca. */
  if (cand.tipo === 'vuelo_tiempo' || cand.tipo === 'pernocta'){
    if (fueEnEjecucion(fecha, a, b, vistoEn) === true)
      return { causa:'en_ejecucion_deducido', detalle:'se detectó con la jornada ya empezada', revisable:true };
  }
  return null;
}


/* ═══════════════════════════════════════════════════════════════════════════
   ESCENARIOS — los bordes del artículo, en un solo sitio
   Los corren el banco (scripts/cambios-programacion-test.js) y el autotest de
   ⋮ → Pruebas dentro de la app. Si vivieran en dos sitios, divergirían: es
   exactamente lo que pasó con ES_AIRPORTS.
   Cuatro de ellos viven en el filo de los 60 minutos, porque «más de 60» y «60 o
   más» se diferencian en un carácter y en 49,11 € por cambio.
   ═══════════════════════════════════════════════════════════════════════════ */
var MES = '2026-09';
function V(date, num, dep, arr, std, sta, checkin){
  var e = { date:date, type:'flight', flightNum:num, dep:dep, arr:arr, std:std, sta:sta };
  if (checkin) e.checkin = checkin;
  return e;
}
function ACT(date, code, std, sta){
  return { date:date, type:(/^LM/.test(code) ? 'lm' : 'other'), code:code, std:std, sta:sta };
}
// Jornada tipo: firma, ida y vuelta. `d` desplaza TODAS las horas, en minutos.
function jornada(date, n1, n2, dst, desplazaFin){
  var mm = function(base, off){ var t = base + (off || 0); return String(Math.floor(((t%1440)+1440)%1440/60)).padStart(2,'0') + ':' + String(((t%60)+60)%60).padStart(2,'0'); };
  var f = 370 + (dst||0);            // firma 06:10
  return [
    V(date, n1, 'BCN', 'CDG', mm(430, dst), mm(545, dst), mm(f, 0)),
    V(date, n2, 'CDG', 'BCN', mm(590, dst), mm(700, (dst||0) + (desplazaFin||0)))
  ];
}
var ESCENARIOS = [
  { id:'fin_2h50', nombre:'nº vuelo + fin +2h50', espera:'PAGA', caso:function(){
      return { inicial: jornada('2026-09-14','VY1882','VY1883',0,0),
               actual:  jornada('2026-09-14','VY2310','VY2311',0,170) }; } },

  { id:'fin_61', nombre:'nº vuelo + fin +61 min', espera:'PAGA', caso:function(){
      return { inicial: jornada('2026-09-14','VY1882','VY1883',0,0),
               actual:  jornada('2026-09-14','VY2310','VY2311',0,61) }; } },

  { id:'fin_60', nombre:'nº vuelo + fin +60 min exactos', espera:'no paga', caso:function(){
      return { inicial: jornada('2026-09-14','VY1882','VY1883',0,0),
               actual:  jornada('2026-09-14','VY2310','VY2311',0,60) }; } },

  { id:'fin_45', nombre:'nº vuelo + fin +45 min', espera:'no paga', caso:function(){
      return { inicial: jornada('2026-09-14','VY1882','VY1883',0,0),
               actual:  jornada('2026-09-14','VY2310','VY2311',0,45) }; } },

  { id:'inicio_adelanto', nombre:'nº vuelo + inicio adelantado 1h40', espera:'PAGA', caso:function(){
      return { inicial: jornada('2026-09-22','VY6501','VY6502',0,0),
               actual:  jornada('2026-09-22','VY6733','VY6734',-100,0) }; } },

  { id:'inicio_mas_tarde', nombre:'nº vuelo + inicio 3h más tarde, fin igual', espera:'no paga', caso:function(){
      // El artículo solo nombra el ADELANTO del inicio. Empezar más tarde con el
      // mismo fin le DEVUELVE descanso al piloto: no hay nada que compensar.
      return { inicial: [ V('2026-09-05','VY1000','BCN','LIS','07:00','11:00','06:00') ],
               actual:  [ V('2026-09-05','VY2000','BCN','LIS','10:00','11:00','09:00') ] }; } },

  { id:'mismo_vuelo', nombre:'MISMO nº vuelo + fin +3h', espera:'no paga', caso:function(){
      // Falta la mitad del «simultáneamente»: sin cambio de número de vuelo, no cuenta.
      return { inicial: jornada('2026-09-09','VY1109','VY1110',0,0),
               actual:  jornada('2026-09-09','VY1109','VY1110',0,180) }; } },

  { id:'pernocta_nueva', nombre:'pernocta nueva en destino', espera:'PAGA', caso:function(){
      return { inicial: [ V('2026-09-08','VY1200','BCN','CDG','18:00','20:00','17:00'),
                          V('2026-09-08','VY1201','CDG','BCN','20:45','22:40') ],
               actual:  [ V('2026-09-08','VY1200','BCN','CDG','18:00','20:00','17:00') ],
               pernoctasAct: ['2026-09-08'] }; } },

  { id:'imaginaria_sust', nombre:'imaginaria sustituida antes de activarse', espera:'PAGA', caso:function(){
      return { inicial: [ ACT('2026-09-12','OSBY','08:00','20:00') ],
               actual:  [ V('2026-09-12','VY3300','BCN','AMS','06:20','08:40','05:50') ],
               vistoEn: { '2026-09-12':'2026-09-09T14:00:00Z' } }; } },

  { id:'imaginaria_activada', nombre:'imaginaria activada (sin pernocta)', espera:'no paga', caso:function(){
      return { inicial: [ ACT('2026-09-12','OSBY','08:00','20:00') ],
               actual:  [ V('2026-09-12','VY3300','BCN','AMS','12:00','14:20','11:00'),
                          V('2026-09-12','VY3301','AMS','BCN','15:00','17:20') ],
               vistoEn: { '2026-09-12':'2026-09-12T09:30:00Z' } }; } },

  { id:'imaginaria_pernocta', nombre:'imaginaria aislada activada → pernocta', espera:'PAGA', caso:function(){
      return { inicial: [ ACT('2026-09-27','OSBY','08:00','20:00') ],
               actual:  [ V('2026-09-27','VY6800','BCN','FCO','19:00','21:10','18:00') ],
               pernoctasAct: ['2026-09-27'],
               vistoEn: { '2026-09-27':'2026-09-27T09:00:00Z' } }; } },

  { id:'franco', nombre:'actividad asignada en día de franco', espera:'no paga', caso:function(){
      // Se paga aparte como invasión de día libre (cód. 2043), no como cambio.
      return { inicial: [ ACT('2026-09-04','SROF') ],
               actual:  [ V('2026-09-04','VY4400','BCN','SVQ','05:00','06:30','04:00') ] }; } },

  { id:'elearning', nombre:'cambio en e-learning', espera:'no paga', caso:function(){
      return { inicial: [ ACT('2026-09-16','LMF2','09:00','13:00') ],
               actual:  [ ACT('2026-09-16','LMCC','09:00','17:00') ] }; } },

  { id:'simulador', nombre:'cambio en simulador', espera:'no paga', caso:function(){
      return { inicial: [ ACT('2026-09-18','SIM','08:00','12:00') ],
               actual:  [ ACT('2026-09-18','LPC','04:00','12:00') ] }; } },

  { id:'solo_hora_E', nombre:'solo cambia la hora E (estimada)', espera:'no paga', caso:function(){
      // eCrews reescribe estimadas sin parar. Si contaran, el mes daría 30 cambios.
      var ini = [ V('2026-09-19','VY7000','BCN','ORY','07:00','09:00','06:00') ];
      var act = [ { date:'2026-09-19', type:'flight', flightNum:'VY7000', dep:'BCN', arr:'ORY',
                    std_scheduled:'07:00', sta_scheduled:'09:00', checkin:'06:00',
                    std_estimated:'11:30', sta_estimated:'13:30',
                    std:'11:30', sta:'13:30' } ];
      return { inicial: ini, actual: act }; } },

  { id:'reimportar', nombre:'reimportar el mismo mes', espera:'no paga', caso:function(){
      var m = jornada('2026-09-14','VY1882','VY1883',0,0);
      return { inicial: m, actual: JSON.parse(JSON.stringify(m)) }; } },

  { id:'import_parcial', nombre:'import parcial: media quincena sin cubrir', espera:'no paga', caso:function(){
      // Los días que la foto actual no trae NO son servicios eliminados.
      return { inicial: jornada('2026-09-14','VY1882','VY1883',0,0)
                          .concat(jornada('2026-09-25','VY9000','VY9001',0,0)),
               actual:  jornada('2026-09-14','VY1882','VY1883',0,0),
               cubiertos: ['2026-09-14'] }; } },

  { id:'en_ejecucion', nombre:'cambio con código FZ (en ejecución)', espera:'no paga', caso:function(){
      var act = jornada('2026-09-03','VY1802','VY1803',0,170);
      act.push(ACT('2026-09-03','FZ'));
      return { inicial: jornada('2026-09-03','VY1204','VY1205',0,0), actual: act }; } },

  { id:'visto_tarde', nombre:'mes cerrado importado a posteriori', espera:'PAGA', caso:function(){
      /* La diferencia se ve semanas después de la jornada. Eso no la convierte en
         un cambio en ejecución: solo dice que nos enteramos tarde. Antes esto
         descartaba el mes entero al importar un roster ya pasado. */
      return { inicial: jornada('2026-09-14','VY1882','VY1883',0,0),
               actual:  jornada('2026-09-14','VY2310','VY2311',0,170),
               vistoEn: { '2026-09-14':'2026-10-02T11:00:00Z' } }; } },

  { id:'pedido_piloto', nombre:'marcado por el piloto como suyo', espera:'no paga', caso:function(){
      return { inicial: jornada('2026-09-11','VY7710','VY7711',0,0),
               actual:  jornada('2026-09-11','VY7422','VY7423',-105,0),
               marcas:  { '2026-09-11': { mine:true, motivo:'permuta' } } }; } },

  { id:'escalera_12', nombre:'escalera de 12 cambios', espera:'540,20 €',
    lee:function(r){ return r.importe.toFixed(2).replace('.', ',') + ' €'; },
    caso:function(){
      var ini = [], act = [];
      for (var i = 1; i <= 12; i++){
        var d = MES + '-' + String(i).padStart(2, '0');
        ini = ini.concat(jornada(d, 'VY10' + i, 'VY11' + i, 0, 0));
        act = act.concat(jornada(d, 'VY20' + i, 'VY21' + i, 0, 170));
      }
      return { inicial: ini, actual: act }; } },

  { id:'gratis_dos', nombre:'con 2 cambios no se abona nada', espera:'0,00 €',
    lee:function(r){ return r.importe.toFixed(2).replace('.', ',') + ' €'; },
    caso:function(){
      var ini = [], act = [];
      for (var i = 1; i <= 2; i++){
        var d = MES + '-0' + i;
        ini = ini.concat(jornada(d, 'VY30' + i, 'VY31' + i, 0, 0));
        act = act.concat(jornada(d, 'VY40' + i, 'VY41' + i, 0, 170));
      }
      return { inicial: ini, actual: act }; } }
];

/* Corre los escenarios y devuelve el parte. Lo pinta la app en ⋮ → Pruebas y lo
   imprime el banco; ninguno de los dos toca el roster del piloto. */
function autotest(tarifas){
  return ESCENARIOS.map(function(e){
    var c = e.caso();
    c.mes = c.mes || MES;
    c.tarifas = tarifas || TARIFAS_2026;
    var obtuvo, err = null;
    try {
      var r = detectar(c);
      obtuvo = e.lee ? e.lee(r) : (r.nComputables > 0 ? 'PAGA' : 'no paga');
    } catch (ex){ err = ex.message; obtuvo = 'ERROR'; }
    return { id:e.id, nombre:e.nombre, espera:e.espera, obtuvo:obtuvo,
             ok: obtuvo === e.espera, error:err };
  });
}

/* ─────────────── export ─────────────── */
var API = {
  REGLAS: REGLAS, TARIFAS_2026: TARIFAS_2026,
  COD_FORMACION: COD_FORMACION, COD_FRANCO: COD_FRANCO,
  COD_RESERVA: COD_RESERVA, COD_PERSONAL: COD_PERSONAL, COD_FORZOSO: COD_FORZOSO,
  hm: hm, desenrolla: desenrolla, jornadas: jornadas, ventana: ventana,
  detectar: detectar, importeDe: importeDe, hhmm: hhmm,
  ESCENARIOS: ESCENARIOS, autotest: autotest
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.RstCambios = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
