/* ══════════════════════════════════════════════════════════════════════════
   FORZOSO — cambio de servicio en ejecución · Art. 12.6 del IV Convenio
   Motor puro (sin DOM ni localStorage). Lo cargan la app y los bancos.

   EL ESQUEMA DEL ARTÍCULO (BOE 11-mar-2026, pág. 37138)
     (I) = servicio inicial, antes del cambio · (F) = servicio final, después
     STA = llegada programada · ETA = estimada · ATA = real (calzos)
     Todas son la llegada del ÚLTIMO vuelo operado como tripulante.

     ¿ETA(F) − STA(I) > 120'?
       Sí → ¿ETA(F) − ETA(I) > 120'?  Sí → FZ   (remunerado y ACUMULABLE)
                                      No → FZNA (remunerado y NO acumulable)
       No → ¿ATA(F) − STA(I) > 120'?  Sí → FZNA
                                      No → NO FORZOSO

   «Acumulable» = cuenta para el límite de UNO al mes. Los dos se pagan igual:
   «una compensación igual al valor de dos imaginarias».

   LO QUE EL ARTÍCULO PROHÍBE, y se comprueba aquí:
     · más de un forzoso acumulable (FZ) al mes;
     · acabar en POSICIONAL si la actividad total supera 15 h (salvo que el
       posicional ya viniera en la propia rotación);
     · invadir el día libre, medido con la hora ESTIMADA de fin en el momento
       del aviso (si lo invade por retrasos posteriores, no es ilegal: se cobra
       como invasión, Art. 13.23);
     · dormir fuera de donde tenías programado, salvo la primera noche de una
       línea.
   NO es cambio en ejecución lo causado por huelgas, cierres de espacio aéreo o
   AOG. El desvío al alternativo sí se paga, pero no cuenta para el límite.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

var REGLAS = {
  umbralMin: 120,              // «superior a 120 minutos»: 120 clavados NO cuentan
  maxActividadPosMin: 15 * 60, // posicional final con más de 15 h de actividad total
  debriefMin: 20,              // fin de actividad = calzos + 20 min de tareas post vuelo
  maxAcumulablesMes: 1,
  imaginariasCompensacion: 2,
  tz: 'Europe/Madrid'          // el día libre empieza a las 00:00 hora local
};
var COD_FORZOSO = ['FZ', 'FZNA'];

function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
function hm(s){
  if (s == null) return null;
  var m = String(s).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
function hhmm(min){
  if (min == null) return '--:--';
  var m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
/* Duración con signo, legible: +3h35 · −0h40 · +45 min */
function dur(min){
  if (min == null) return '—';
  var s = min < 0 ? '−' : '+', a = Math.abs(Math.round(min));
  var h = Math.floor(a / 60), r = a % 60;
  return s + (h ? h + 'h' + String(r).padStart(2, '0') : r + ' min');
}
/* Coloca una hora de reloj en la jornada que empieza en `ancla` (min del día).
   Una jornada no dura 24 h: lo que cae más de 2 h ANTES del ancla es del día
   siguiente (vuelo de vuelta que aterriza a las 00:40). */
function tras(ancla, t){
  if (t == null) return null;
  if (ancla == null) return t;
  var v = t;
  while (v < ancla - 120) v += 1440;
  while (v >= ancla + 1440 - 120) v -= 1440;
  return v;
}
function esPos(e){
  return !!(e && (e.isPositioning || e.positioning || (e.dep && String(e.dep).charAt(0) === '*')));
}
function apt(c){ return up(c).replace(/^\*/, ''); }

/* ─────────────── 1. El esquema ───────────────
   h = { staI, etaI, etaF, ataF } en minutos de la MISMA escala (ya anclados).
   Devuelve el veredicto y cada paso recorrido, con la resta, para enseñarla. */
function clasifica(h){
  h = h || {};
  var U = REGLAS.umbralMin, pasos = [];
  function paso(id, a, b){
    var va = h[a], vb = h[b];
    var d = (va != null && vb != null) ? (va - vb) : null;
    var p = { id:id, a:a, b:b, va:va, vb:vb, delta:d, cumple: d == null ? null : d > U };
    pasos.push(p);
    return p;
  }
  var p1 = paso('p1', 'etaF', 'staI');
  if (p1.cumple == null)
    return { veredicto:null, pasos:pasos, falta:faltan(['etaF','staI'], h), pagado:null };
  if (p1.cumple){
    var p2 = paso('p2', 'etaF', 'etaI');
    /* Sin ETA(I) no se sabe si es FZ o FZNA, pero SÍ que se paga: las dos ramas
       que salen de aquí son forzoso. Solo queda en duda el límite mensual. */
    if (p2.cumple == null)
      return { veredicto:null, pasos:pasos, falta:['etaI'], pagado:true, dudaFZ:true };
    return { veredicto: p2.cumple ? 'FZ' : 'FZNA', pasos:pasos, falta:[], pagado:true };
  }
  var p3 = paso('p3', 'ataF', 'staI');
  if (p3.cumple == null)
    return { veredicto:null, pasos:pasos, falta:['ataF'], pagado:null };
  return { veredicto: p3.cumple ? 'FZNA' : 'NO', pasos:pasos, falta:[], pagado:p3.cumple };
}
function faltan(ks, h){ return ks.filter(function(k){ return h[k] == null; }); }

/* El motivo que declara el piloto cambia el resultado:
     · externo (huelga, cierre de espacio aéreo, AOG) → no es cambio en ejecución;
     · desvío al alternativo → se paga, pero no cuenta para el límite (FZ→FZNA). */
function aplicaMotivo(r, motivo){
  var o = {}; Object.keys(r).forEach(function(k){ o[k] = r[k]; });
  o.motivo = motivo || 'operativo';
  if (motivo === 'externo'){ o.veredicto = 'EXCLUIDO'; o.pagado = false; o.dudaFZ = false; }
  else if (motivo === 'desvio' && (o.veredicto === 'FZ' || o.dudaFZ)){ o.veredicto = 'FZNA'; o.dudaFZ = false; o.porDesvio = true; }
  return o;
}

/* ─────────────── 2. Del roster a las horas del día ───────────────
   entries: las entradas del roster de ESE día (como las guarda la app, horas UTC).
   Devuelve lo que el roster sabe; lo que no sabe (STA(I), ETA(I)) queda null. */
function delDia(fecha, entries){
  var codes = [], vuelos = [], firma = null;
  (entries || []).forEach(function(e){
    if (!e || e.date !== fecha || e.type === '__deleted__') return;
    if (e.code){ var c = up(e.code); if (codes.indexOf(c) < 0) codes.push(c); }
    var ci = hm(e.checkin || e.report);
    if (ci != null && e.type === 'flight' && (firma == null || ci < firma)) firma = ci;
    if (e.type === 'flight') vuelos.push(e);
  });
  var codigo = null;
  COD_FORZOSO.forEach(function(c){ if (codes.indexOf(c) > -1 && !codigo) codigo = c; });

  var ancla = firma;
  if (ancla == null && vuelos.length){
    var s0 = vuelos.map(function(v){ return hm(v.std_actual || v.std_scheduled || v.std); })
                   .filter(function(x){ return x != null; });
    if (s0.length) ancla = Math.min.apply(null, s0) - 60;
  }
  var legs = vuelos.map(function(v){
    var std = hm(v.std_actual) != null ? hm(v.std_actual) : hm(v.std_scheduled || v.std);
    var staS = hm(v.sta_scheduled), staE = hm(v.sta_estimated), staA = hm(v.sta_actual), staV = hm(v.sta);
    // `sta` a secas a veces es la real copiada para que la UI la enseñe.
    var staPlan = staS != null ? staS : (staE != null ? staE : (staV != null && staV !== staA ? staV : null));
    var fuentePlan = staS != null ? 'programada' : (staE != null ? 'estimada' : (staPlan != null ? 'programada' : null));
    return {
      num: up(v.flightNum || v.flight_number || v.flight), dep: apt(v.dep), arr: apt(v.arr), pos: esPos(v),
      std: tras(ancla, std),
      staPlan: tras(ancla, staPlan), fuentePlan: fuentePlan,
      staReal: tras(ancla, staA),
      staMejor: tras(ancla, staA != null ? staA : (staE != null ? staE : (staS != null ? staS : staV)))
    };
  }).sort(function(a, b){ return (a.std == null ? 1e9 : a.std) - (b.std == null ? 1e9 : b.std); });

  var operados = legs.filter(function(l){ return !l.pos; });
  var ultOp = operados.length ? operados[operados.length - 1] : null;
  var ult = legs.length ? legs[legs.length - 1] : null;
  return {
    fecha: fecha, codigo: codigo, codes: codes, firma: firma, ancla: ancla, legs: legs,
    ultimoOperado: ultOp, ultimo: ult,
    etaF: ultOp ? ultOp.staPlan : null, fuenteEtaF: ultOp ? ultOp.fuentePlan : null,
    ataF: ultOp ? ultOp.staReal : null,
    primeraSalida: legs.length ? legs[0].dep : null,
    finEn: ult ? ult.arr : null,
    finPos: !!(ult && ult.pos),
    finPosLlegada: ult && ult.pos ? ult.staMejor : null,
    finPosLlegadaPlan: ult && ult.pos ? (ult.staPlan != null ? ult.staPlan : ult.staMejor) : null
  };
}

/* ─────────────── 3. Lo que el artículo prohíbe ───────────────
   c = {
     veredicto, fecha,
     acumulablesAntes : FZ del mes ANTERIORES a este día
     firma            : min (ancla de la jornada)
     finPos, finPosLlegadaPlan, finPosLlegada : posicional al final
     finEtaUtcMin     : fin estimado al avisar (llegada ETA(F) del último tramo), min desde 00:00Z de `fecha`
     finRealUtcMin    : fin real (calzos), idem
     diaSigLibre      : true | false | null
     aLocal           : fn(utcMs) → {fecha, min} en hora local (opcional)
     base, primeraSalida, finEn, pernoctaIni
   }
   Cada comprobación: { id, estado:'ok'|'ilegal'|'aviso'|'sin_datos', dato } */
function legalidad(c){
  c = c || {};
  var out = [];

  // 1. Límite mensual: solo el FZ cuenta.
  if (c.veredicto === 'FZ'){
    var ord = (c.acumulablesAntes || 0) + 1;
    out.push({ id:'limite', estado: ord > REGLAS.maxAcumulablesMes ? 'ilegal' : 'ok', dato:{ ordinal: ord } });
  } else if (c.veredicto === 'FZNA'){
    out.push({ id:'limite', estado:'ok', dato:{ noCuenta:true } });
  } else if (c.dudaFZ){
    var ord2 = (c.acumulablesAntes || 0) + 1;
    out.push({ id:'limite', estado: ord2 > REGLAS.maxAcumulablesMes ? 'aviso' : 'ok', dato:{ ordinal: ord2, duda:true } });
  }

  // 2. Acabar en posicional con más de 15 h de actividad total.
  if (c.finPos){
    var fin = c.finPosLlegadaPlan != null ? c.finPosLlegadaPlan : c.finPosLlegada;
    if (c.firma == null || fin == null) out.push({ id:'pos15', estado:'sin_datos', dato:{} });
    else {
      var act = fin - c.firma;
      out.push({ id:'pos15', estado: act > REGLAS.maxActividadPosMin ? 'ilegal' : 'ok', dato:{ actividad: act } });
    }
  } else {
    out.push({ id:'pos15', estado:'ok', dato:{ noAplica:true } });
  }

  // 3. Día libre: se mide con la ESTIMADA al avisar, no con lo que acabó pasando.
  if (c.diaSigLibre === true){
    var base = Date.parse(c.fecha + 'T00:00:00Z');
    var loc = function(min){
      if (min == null || isNaN(base)) return null;
      var ms = base + (min + REGLAS.debriefMin) * 60000;
      if (typeof c.aLocal === 'function'){ try { return c.aLocal(ms); } catch(e){} }
      var d = new Date(ms);
      return { fecha: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
    };
    var le = loc(c.finEtaUtcMin), lr = loc(c.finRealUtcMin);
    var invEta = le && le.fecha > c.fecha, invReal = lr && lr.fecha > c.fecha;
    if (!le && !lr) out.push({ id:'libre', estado:'sin_datos', dato:{} });
    else if (invEta) out.push({ id:'libre', estado:'ilegal', dato:{ fin: le } });
    else if (invReal) out.push({ id:'libre', estado:'aviso', dato:{ fin: lr, porRetraso:true } });
    else out.push({ id:'libre', estado:'ok', dato:{ fin: le || lr } });
  } else if (c.diaSigLibre === false){
    out.push({ id:'libre', estado:'ok', dato:{ noAplica:true } });
  } else {
    out.push({ id:'libre', estado:'sin_datos', dato:{} });
  }

  // 4. Pernocta: donde tenías programado dormir.
  var finEn = apt(c.finEn), baseA = apt(c.base), iniEn = apt(c.pernoctaIni);
  if (!finEn) out.push({ id:'pernocta', estado:'sin_datos', dato:{} });
  else {
    /* Sin dato del servicio inicial se asume que ibas a dormir donde empezaste la
       jornada (lo normal en un servicio de ida y vuelta). */
    var prog = iniEn || apt(c.primeraSalida);
    if (!prog || prog === finEn) out.push({ id:'pernocta', estado:'ok', dato:{ en: finEn } });
    else {
      /* La excepción: la PRIMERA noche de una línea. Solo cabe si el servicio
         inicial ya te hacía dormir fuera de base y la jornada salía de base. */
      var salesDeBase = !baseA || apt(c.primeraSalida) === baseA;
      var iniFuera = iniEn ? iniEn !== baseA : null;
      if (iniEn && iniFuera && salesDeBase) out.push({ id:'pernocta', estado:'ok', dato:{ en: finEn, excepcion:true, prog: prog } });
      else if (!iniEn && salesDeBase) out.push({ id:'pernocta', estado:'aviso', dato:{ en: finEn, prog: prog, pregunta:true } });
      else out.push({ id:'pernocta', estado:'ilegal', dato:{ en: finEn, prog: prog } });
    }
  }
  return out;
}

/* Todo junto, para un día. opts = {
     entries, fecha, datos:{staI, etaI, etaF, ataF, motivo, pernoctaIni} (HH:MM UTC, del piloto),
     inicial:{staI, pernoctaIni} (lo que se sepa de la programación: min / apt),
     acumulablesAntes, diaSigLibre, base, aLocal, tarifaImaginaria
   } */
function evaluar(opts){
  opts = opts || {};
  var d = delDia(opts.fecha, opts.entries);
  var dat = opts.datos || {}, ini = opts.inicial || {};
  var A = d.ancla;
  var pick = function(piloto, roster){ var v = hm(piloto); return v != null ? { v: tras(A, v), f:'piloto' } : (roster != null ? { v: roster, f:'roster' } : { v:null, f:null }); };
  var staI = pick(dat.staI, ini.staI != null ? tras(A, ini.staI) : null);
  var etaI = pick(dat.etaI, null);
  var etaF = pick(dat.etaF, d.etaF);
  var ataF = pick(dat.ataF, d.ataF);
  var horas = { staI: staI.v, etaI: etaI.v, etaF: etaF.v, ataF: ataF.v };
  var fuentes = { staI: staI.f === 'roster' ? 'inicial' : staI.f, etaI: etaI.f,
                  etaF: etaF.f === 'roster' ? (d.fuenteEtaF || 'programada') : etaF.f, ataF: ataF.f === 'roster' ? 'real' : ataF.f };
  var r = aplicaMotivo(clasifica(horas), dat.motivo);

  /* El veredicto que manda para el límite: el calculado si se puede; si no, el
     código que puso la compañía en el roster. */
  var efectivo = r.veredicto || (d.codigo === 'FZ' || d.codigo === 'FZNA' ? d.codigo : null);
  if (r.veredicto === 'EXCLUIDO') efectivo = 'EXCLUIDO';
  var pagado = r.pagado != null ? r.pagado : (d.codigo === 'FZ' || d.codigo === 'FZNA');
  if (r.veredicto === 'EXCLUIDO') pagado = false;

  var legal = (efectivo === 'EXCLUIDO') ? [] : legalidad({
    veredicto: efectivo, dudaFZ: !efectivo && r.dudaFZ, fecha: opts.fecha,
    acumulablesAntes: opts.acumulablesAntes || 0,
    firma: d.firma != null ? d.firma : d.ancla,
    finPos: d.finPos, finPosLlegada: d.finPosLlegada, finPosLlegadaPlan: d.finPosLlegadaPlan,
    finEtaUtcMin: d.ultimo ? (d.ultimo.pos ? d.finPosLlegadaPlan : horas.etaF) : null,
    finRealUtcMin: d.ultimo ? (d.ultimo.pos ? d.finPosLlegada : horas.ataF) : null,
    diaSigLibre: opts.diaSigLibre == null ? null : opts.diaSigLibre,
    aLocal: opts.aLocal, base: opts.base,
    primeraSalida: d.primeraSalida, finEn: d.finEn,
    pernoctaIni: dat.pernoctaIni || ini.pernoctaIni || null
  });
  var ilegal = legal.some(function(x){ return x.estado === 'ilegal'; });
  var aviso = legal.some(function(x){ return x.estado === 'aviso' || x.estado === 'sin_datos'; });
  var tarifa = opts.tarifaImaginaria || 144.23;
  return {
    fecha: opts.fecha, dia: d, horas: horas, fuentes: fuentes,
    esquema: r, veredicto: efectivo, calculado: r.veredicto, codigo: d.codigo,
    discrepa: !!(r.veredicto && d.codigo && r.veredicto !== d.codigo && r.veredicto !== 'EXCLUIDO'),
    pagado: pagado,
    importe: pagado ? Math.round(REGLAS.imaginariasCompensacion * tarifa * 100) / 100 : 0,
    legalidad: legal, ilegal: ilegal, revisar: !ilegal && aviso
  };
}

/* El mes entero, en orden, para numerar los FZ contra el límite.
   dias = [{ fecha, entries, datos, inicial, diaSigLibre }] */
function evaluarMes(dias, comun){
  comun = comun || {};
  var acum = 0;
  return (dias || []).slice().sort(function(a, b){ return a.fecha < b.fecha ? -1 : 1; }).map(function(x){
    var o = {}; Object.keys(comun).forEach(function(k){ o[k] = comun[k]; });
    Object.keys(x).forEach(function(k){ o[k] = x[k]; });
    o.acumulablesAntes = acum;
    var r = evaluar(o);
    if (r.veredicto === 'FZ') acum++;
    return r;
  });
}

/* ─────────────── 4. Escenarios: los bordes del artículo ─────────────── */
function V(fecha, num, dep, arr, std, sta, extra){
  var e = { date:fecha, type:'flight', flightNum:num, dep:dep, arr:arr, std_scheduled:std, sta_scheduled:sta, std:std, sta:sta, checkin: extra && extra.checkin };
  if (extra) Object.keys(extra).forEach(function(k){ e[k] = extra[k]; });
  return e;
}
var ESCENARIOS = [
  { id:'fz', nombre:'nueva estimada +3h sobre lo programado y +2h30 sobre la estimada → FZ',
    espera:{ veredicto:'FZ', pagado:true },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1000','BCN','MAD','08:00','09:20',{checkin:'07:00'}), V('2026-09-10','VY1003','MAD','PMI','16:40','18:00',{sta_actual:'18:05'})],
           datos:{ staI:'15:00', etaI:'15:30' }, diaSigLibre:false } },
  { id:'fzna_retraso', nombre:'ya ibas con retraso: +1h30 sobre la estimada → FZNA',
    espera:{ veredicto:'FZNA', pagado:true },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','PMI','16:40','18:00',{checkin:'07:00'})],
           datos:{ staI:'15:00', etaI:'16:30' }, diaSigLibre:false } },
  { id:'fzna_real', nombre:'al avisar +1h45, pero aterriza +2h20 → FZNA',
    espera:{ veredicto:'FZNA', pagado:true },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','BCN','15:30','16:45',{checkin:'07:00', sta_actual:'17:20'})],
           datos:{ staI:'15:00', etaI:'15:00' }, diaSigLibre:false } },
  { id:'no', nombre:'al avisar +1h45 y aterriza +1h50 → NO FORZOSO',
    espera:{ veredicto:'NO', pagado:false },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','BCN','15:30','16:45',{checkin:'07:00', sta_actual:'16:50'})],
           datos:{ staI:'15:00', etaI:'15:00' }, diaSigLibre:false } },
  { id:'filo120', nombre:'exactamente +120 no es «superior a 120» → NO FORZOSO',
    espera:{ veredicto:'NO', pagado:false },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','BCN','15:40','17:00',{checkin:'07:00', sta_actual:'17:00'})],
           datos:{ staI:'15:00', etaI:'15:00' }, diaSigLibre:false } },
  { id:'sin_etaI', nombre:'sin ETA(I): se paga seguro, falta saber si cuenta para el límite',
    espera:{ veredicto:'FZ', pagado:true },   // el código del roster decide mientras
    opts:{ fecha:'2026-09-04', entries:[{date:'2026-09-04',code:'FZ',type:'off'}, V('2026-09-04','VY7822','BCN','LGW',null,null,{checkin:'15:50',std_actual:'18:22',sta_actual:'20:48',std:'18:22',sta:'20:48'}), V('2026-09-04','VY7823','LGW','BCN',null,null,{checkin:'15:50',std_actual:'21:26',sta_actual:'23:25',std:'21:26',sta:'23:25'})],
           datos:{ staI:'19:00', etaF:'23:20' }, diaSigLibre:false } },
  { id:'externo', nombre:'AOG / huelga / espacio aéreo → no es cambio en ejecución',
    espera:{ veredicto:'EXCLUIDO', pagado:false },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','PMI','16:40','18:00',{checkin:'07:00'})],
           datos:{ staI:'15:00', etaI:'15:30', motivo:'externo' }, diaSigLibre:false } },
  { id:'desvio', nombre:'desvío al alternativo: se paga pero no cuenta → FZNA',
    espera:{ veredicto:'FZNA', pagado:true },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','PMI','16:40','18:00',{checkin:'07:00'})],
           datos:{ staI:'15:00', etaI:'15:30', motivo:'desvio' }, diaSigLibre:false } },
  { id:'segundo_fz', nombre:'segundo FZ del mes → ILEGAL',
    espera:{ veredicto:'FZ', ilegal:['limite'] },
    opts:{ fecha:'2026-09-20', acumulablesAntes:1, entries:[V('2026-09-20','VY1003','MAD','BCN','16:40','18:00',{checkin:'07:00'})],
           datos:{ staI:'15:00', etaI:'15:00' }, diaSigLibre:false } },
  { id:'pos15', nombre:'acaba en posicional con 15h40 de actividad → ILEGAL',
    espera:{ veredicto:'FZ', ilegal:['pos15'] },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1001','BCN','AGP','06:00','07:30',{checkin:'05:00'}), V('2026-09-10','VY2000','AGP','LIS','17:30','18:30'), V('2026-09-10','VY2001','LIS','BCN','19:00','20:40',{isPositioning:true})],
           datos:{ staI:'12:00', etaI:'12:00' }, diaSigLibre:false } },
  { id:'pos_ok', nombre:'posicional con 14h de actividad → legal',
    espera:{ veredicto:'FZ', ok:['pos15'] },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1001','BCN','AGP','06:00','07:30',{checkin:'05:00'}), V('2026-09-10','VY2000','AGP','LIS','14:00','16:30'), V('2026-09-10','VY2001','LIS','BCN','17:00','19:00',{isPositioning:true})],
           datos:{ staI:'12:00', etaI:'12:00' }, diaSigLibre:false } },
  { id:'libre_eta', nombre:'la estimada al avisar ya se mete en tu día libre → ILEGAL',
    espera:{ ilegal:['libre'] },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','BCN','22:30','23:50',{checkin:'12:00'})],
           datos:{ staI:'18:00', etaI:'18:00' }, diaSigLibre:true } },
  { id:'libre_retraso', nombre:'al avisar no invadía; lo invadió por retrasos → aviso, no ilegal',
    espera:{ aviso:['libre'] },
    opts:{ fecha:'2026-09-10', entries:[V('2026-09-10','VY1003','MAD','BCN','20:30','22:00',{checkin:'12:00', sta_actual:'23:55'})],
           datos:{ staI:'18:00', etaI:'18:00' }, diaSigLibre:true } },
  { id:'pernocta', nombre:'ibas a dormir en base y te dejan fuera → ILEGAL',
    espera:{ ilegal:['pernocta'] },
    opts:{ fecha:'2026-09-10', base:'BCN', entries:[V('2026-09-10','VY1000','BCN','MAD','08:00','09:20',{checkin:'07:00'}), V('2026-09-10','VY1005','MAD','AGP','16:00','17:20')],
           datos:{ staI:'14:00', etaI:'14:00', pernoctaIni:'BCN' }, diaSigLibre:false } },
  { id:'pernocta_linea', nombre:'primer día de línea: cambia el sitio donde duermes → permitido',
    espera:{ ok:['pernocta'] },
    opts:{ fecha:'2026-09-10', base:'BCN', entries:[V('2026-09-10','VY1000','BCN','MAD','08:00','09:20',{checkin:'07:00'}), V('2026-09-10','VY1005','MAD','AGP','16:00','17:20')],
           datos:{ staI:'09:20', etaI:'09:20', pernoctaIni:'MAD' }, diaSigLibre:false } }
];
function autotest(){
  return ESCENARIOS.map(function(s){
    var r = evaluar(s.opts), e = s.espera, fallos = [];
    if ('veredicto' in e && r.veredicto !== e.veredicto) fallos.push('veredicto ' + r.veredicto + ' ≠ ' + e.veredicto);
    if ('pagado' in e && r.pagado !== e.pagado) fallos.push('pagado ' + r.pagado + ' ≠ ' + e.pagado);
    var est = {}; r.legalidad.forEach(function(x){ est[x.id] = x.estado; });
    (e.ilegal || []).forEach(function(k){ if (est[k] !== 'ilegal') fallos.push(k + ' = ' + est[k] + ' ≠ ilegal'); });
    (e.aviso || []).forEach(function(k){ if (est[k] !== 'aviso') fallos.push(k + ' = ' + est[k] + ' ≠ aviso'); });
    (e.ok || []).forEach(function(k){ if (est[k] !== 'ok') fallos.push(k + ' = ' + est[k] + ' ≠ ok'); });
    return { id:s.id, nombre:s.nombre, ok:!fallos.length, fallos:fallos };
  });
}

var API = {
  REGLAS: REGLAS, COD_FORZOSO: COD_FORZOSO,
  hm: hm, hhmm: hhmm, dur: dur, tras: tras,
  clasifica: clasifica, aplicaMotivo: aplicaMotivo, delDia: delDia,
  legalidad: legalidad, evaluar: evaluar, evaluarMes: evaluarMes,
  ESCENARIOS: ESCENARIOS, autotest: autotest
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.Forzoso = API;
})(typeof window !== 'undefined' ? window : this);
