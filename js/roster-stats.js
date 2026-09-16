/* ══════════════════════════════════════════════════════════════════════════
   ESTADÍSTICAS DEL ROSTER — el motor
   ══════════════════════════════════════════════════════════════════════════
   Contesta dos preguntas distintas y conviene no mezclarlas:

     ESTE MES  qué te han añadido sobre la programación INICIAL publicada.
               Necesita las dos fotos: la v0 que sella el servidor y el roster
               que el piloto tiene delante.
     TU AÑO    cómo ha sido tu año. Sale ENTERO del roster local, así que
               funciona volando y no espera a ningún deploy.

   ── Lo que NO hace, y por qué ─────────────────────────────────────────────
   No ordena tramos, no ancla jornadas y no decide qué es un cambio: todo eso
   lo hace `RstCambios.jornadas()`, que ya tiene su banco. Este archivo SUMA lo
   que aquél devuelve. Una cuarta copia de la lógica de ordenar es el fallo que
   este proyecto lleva pagando desde que había tres (CLAUDE.md).

   Por lo mismo las listas de códigos NO se escriben aquí: la de guardias y la
   de formación salen de `RstCambios`, y las de día libre y vacaciones de
   `DiaLibre`. Si alguna hace falta, se importa; no se copia.

   ── La medida del duty, y en qué NO es la de la tira de pills ─────────────
   Aquí el duty de un día es `fin − inicio` de su ventana anclada: la firma (o
   el primer despegue tras el mayor hueco) hasta la última hora del día. Es la
   ÚNICA medida que se puede aplicar a las dos fotos, porque la v0 guarda
   firma y horas programadas y NADA MÁS — ni `dutyH` de eCrews, ni debrief, ni
   el 25 % de una guardia.

   Y eso es exactamente lo que la hace válida para comparar: las dos fotos se
   miden igual. Comparar «mi cálculo sobre la v0» contra «el duty oficial de
   eCrews de hoy» daría un delta que mide el MÉTODO, no el cambio.

   Consecuencia que hay que decir en pantalla y no esconder: este total puede
   no coincidir con el «Duty hours» de la tira de pills, que usa el cómputo
   oficial de eCrews cuando lo hay. No son el mismo número y no lo pretenden.

   ── Los posicionales: la regla de la APP, y sólo en TU AÑO ────────────────
   eCrews NO escribe asteriscos: escribe `isPositioning:true` con el `dep`
   limpio («AGP»). Medido sobre el enero REAL de un piloto: 0 entradas con `*`
   y 2 con la bandera, así que un filtro que sólo mirase el `*` no excluye
   NUNCA nada — la pantalla contaba 28 sectores y 52h00 donde se volaron 26 y
   48h44. Un filtro que dice filtrar y no filtra es el 0 mudo de siempre.

   La regla buena YA EXISTE en la app —`isPositioningLeg` en server.js,
   `isPosLeg` en index.html—: bandera explícita O el `*` del roster. Escribir
   aquí una segunda, más pobre, fue `ES_AIRPORTS` / `ES_IATA` otra vez.

   Se aplica en la PROYECCIÓN `volado()`, que ya reescribe las entradas para
   resolver la hora: marca el `dep` con `*` cuando el tramo es posicional, y con
   eso la convención que el contador ya tenía pasa a ser VERDAD. `jornadas()` no
   se toca: sólo conserva `num·dep·arr·std·sta`, así que la bandera no llegaría
   nunca al contador por sí sola.

   ⚠ Y NO se aplica en ESTE MES, a propósito. `_adelgaza` (server.js) no guarda
   la bandera en la v0, así que corregir sólo la foto actual haría que el delta
   midiera el MÉTODO en vez del cambio — la trampa que este archivo ya documenta
   para las horas. Las dos fotos siguen con el `*`: el criterio más pobre, pero
   el MISMO. El día que la v0 guarde la bandera, este modo sube también.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ⚠ Los dos módulos se resuelven TARDE, en la primera llamada, y no al cargar.
   Leídos al cargar, `root.DiaLibre` vale `undefined` —este archivo va en el
   `<script>` de antes que `dia-libre.js`— y la constante se queda con ese
   undefined PARA SIEMPRE: la pantalla moría con «Cannot read properties of
   undefined (reading 'esDiaLibre')» y se quedaba en «Calculando…».
   Es la familia de `window.RST_IATA_ICAO`, ahora por orden de carga. Resuelto
   así, el orden de las etiquetas deja de importar — que es lo que hay que
   poder afirmar cuando alguien reordene los `<script>` dentro de un año. */
var _rc = null, _dl = null;
function RC(){
  if (!_rc) _rc = (typeof module !== 'undefined' && module.exports)
    ? require('./roster-changes.js') : root.RstCambios;
  return _rc;
}
function DL(){
  if (!_dl) _dl = (typeof module !== 'undefined' && module.exports)
    ? require('./dia-libre.js') : root.DiaLibre;
  return _dl;
}

function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
function enLista(codes, lista){
  for (var i = 0; i < (codes||[]).length; i++) if (lista.indexOf(codes[i]) > -1) return true;
  return false;
}
function delMes(entries, mes){
  if (!mes) return entries || [];
  return (entries || []).filter(function(e){ return e && e.date && e.date.slice(0,7) === mes; });
}
/* Un posicional no es tiempo de vuelo. LA REGLA ES LA DE LA APP —la misma que
   `isPositioningLeg` (server.js) y `isPosLeg` (index.html)—: bandera explícita
   o el `*` del roster. NO se adivina por la forma del nº de vuelo: un 851D es
   un sector real, no un posicional. */
function esPosLeg(e){
  if (!e) return false;
  return !!(e.isPositioning || e.positioning ||
    String(e.dep || '').charAt(0) === '*' ||
    String(e.flightNum || e.flight_number || e.flight || '').charAt(0) === '*');
}
/* Lo que ve el CONTADOR, que sólo recibe el `dep` que le deja `jornadas()`.
   Es cierto porque `volado()` marca ese `dep` antes de entregarlo. */
function esPos(dep){ return String(dep || '').charAt(0) === '*'; }
/* Un tramo nunca dura más de 24 h, así que el cruce de medianoche se resuelve
   con el módulo y no hace falta desenrollar nada. */
function durLeg(v){
  if (v.std == null || v.sta == null) return 0;
  return ((v.sta - v.std) % 1440 + 1440) % 1440;
}

/* ─────────────── con qué HORA se mide cada pregunta ───────────────
   Las dos pestañas de esta pantalla NO se miden con la misma hora, y
   confundirlas es lo que hizo salir 363 sectores en 157h20 —26 minutos por
   sector— en el año de un piloto:

   ESTE MES compara con la programación inicial. Las dos fotos van con la hora
   PROGRAMADA, que es lo único que guarda la v0 y lo que dice el Art. 12.9.
   TU AÑO cuenta lo que has VOLADO. Ahí la programada no sirve: **eCrews sólo
   manda `std_scheduled` en la PRIMERA importación del mes**, así que quien
   importa después de volar tiene el mes entero sin ella —y `jornadas()` lee
   sólo esa, a propósito, porque es el motor del 12.9—. Medido: 40 sectores con
   **0h00** de bloque.

   El orden es el que ya usan el 13.23 y el Home: **A → E → la vigente**.

   Se resuelve la hora ANTES de entregar las entradas al motor, y se entrega en
   `std`/`sta`, que en este esquema significan «la hora que hay». `jornadas()`
   no se toca: su regla es del 12.9 y tiene su propio banco. Es el mismo patrón
   que `_adelgaza` en server.js, que también proyecta antes de medir. */
function primeraLegibleStr(){
  for (var i = 0; i < arguments.length; i++)
    if (RC().hm(arguments[i]) != null) return arguments[i];
  return null;
}
function horaVolada(e, cual){
  return primeraLegibleStr(e[cual + '_actual'], e[cual + '_estimated'],
                           e[cual], e[cual + '_scheduled']);
}
/* Devuelve las entradas con la hora VOLADA ya resuelta. Copia: no se toca lo
   que el piloto tiene guardado. */
function volado(entries){
  return (entries || []).map(function(e){
    if (!e || e.type !== 'flight') return e;
    var o = {}; for (var k in e) o[k] = e[k];
    o.std = horaVolada(e, 'std');
    o.sta = horaVolada(e, 'sta');
    /* Fuera, o `jornadas()` la leería ANTES que la resuelta y volveríamos a
       medir lo programado. */
    delete o.std_scheduled; delete o.sta_scheduled;
    /* El `*` que el contador espera. `jornadas()` sólo conserva
       num·dep·arr·std·sta, así que la bandera de eCrews no llega hasta él: se
       escribe en el único campo que sí viaja. Idempotente. */
    if (esPosLeg(e)) o.dep = '*' + String(o.dep || '').replace(/^\*+/, '');
    return o;
  });
}

/* ─────────────── qué es cada día ───────────────
   El orden IMPORTA y es el de menos a más discutible: si el día tiene vuelos
   es un día de vuelo, aunque además traiga el código de la guardia de la que
   te sacaron. Al revés, un OSB3 con vuelo contaría como guardia y el reparto
   del año diría que has volado menos de lo que has volado. */
function claseDia(j){
  if (j.vuelos && j.vuelos.length) return 'vuelo';
  if (esGuardia(j))                return 'guardia';
  if (esFormacion(j))              return 'formacion';
  var l = DL().esDiaLibre(j.codes, j.tipos);
  if (l === 'vacaciones')          return 'vacaciones';
  if (l === 'libre')               return 'libre';
  if (esFranco(j))                 return 'franco';
  return 'otros';
}
function esGuardia(j){
  return j.tipos.indexOf('standby') > -1 || j.tipos.indexOf('osb') > -1
      || enLista(j.codes, RC().COD_RESERVA);
}
function esFormacion(j){
  if (j.tipos.indexOf('training') > -1 || j.tipos.indexOf('lm') > -1
   || j.tipos.indexOf('ebt') > -1 || j.tipos.indexOf('eva') > -1) return true;
  for (var i = 0; i < j.codes.length; i++) if (/^LM/.test(j.codes[i])) return true;
  return enLista(j.codes, RC().COD_FORMACION);
}
function esFranco(j){ return j.tipos.indexOf("f") > -1 || enLista(j.codes, DL().COD_NO_LIBRE); }
/* Con actividad = hay algo que hacer ese día. Es el denominador de «días
   tocados»: los días libres no se pueden «tocar» sin dejar de serlo, y
   meterlos dentro haría subir la estabilidad de un mes por tener más OFF. */
function conActividad(j){
  var c = claseDia(j);
  return c === 'vuelo' || c === 'guardia' || c === 'formacion' || c === 'otros';
}

/* ─────────────── las medidas de UNA foto ─────────────── */
/* `modo`: 'volada' (lo ejecutado — TU AÑO) o 'programada' (la hora publicada —
   el comparador del mes). Los DOS sitios lo pasan explícitamente: un defecto
   silencioso aquí es exactamente el fallo que se está arreglando. */
function medidas(entries, mes, modo){
  var src = (modo === 'programada') ? entries : volado(entries);
  var J = RC().jornadas(delMes(src, mes));
  var o = { dutyMin:0, dutyDias:0, bloqueMin:0, sectores:0, posicionales:0, sinHora:0,
            diasActividad:0, guardias:0, libres:0, dias:Object.keys(J).length };
  Object.keys(J).forEach(function(d){
    var j = J[d];
    if (j.inicio != null && j.fin != null && j.fin > j.inicio){
      o.dutyMin += (j.fin - j.inicio); o.dutyDias++;
    }
    (j.vuelos || []).forEach(function(v){
      if (esPos(v.dep)) { o.posicionales++; return; }
      o.sectores++;
      /* Un sector cuya hora no se puede leer SIGUE siendo un sector —lo has
         volado— pero no puede sumar 0 minutos en silencio: así es como 363
         sectores salían en 157h20 sin que nada avisara. Se cuenta aparte y la
         pantalla lo dice. */
      if (v.std == null || v.sta == null) { o.sinHora++; return; }
      o.bloqueMin += durLeg(v);
    });
    var c = claseDia(j);
    if (c === 'guardia') o.guardias++;
    if (c === 'libre' || c === 'vacaciones') o.libres++;
    if (conActividad(j)) o.diasActividad++;
  });
  return o;
}

/* ─────────────── de qué tipo es cada día tocado ───────────────
   Pedido el 12-sep-2026: «de franco a vuelo · de franco a STBY · de STBY a
   vuelo · cambios realizados (importante) que sean cambios en TIPO DE VUELO, no
   ajustes de horas en los mismos vuelos. Cada uno en un color distinto.»

   Lo que de verdad cambia es lo último: hasta ahora un día salía «tocado» igual
   si le habían cambiado el vuelo que si sólo le habían movido la hora, y no son
   lo mismo ni de lejos — el primero es trabajo distinto, el segundo es el mismo
   trabajo media hora después. Se separan, y el recuento grande cuenta los
   cambios DE VERDAD; los de sólo hora van aparte, con su color apagado y dichos,
   que desaparecer no es una opción (el 0 mudo).

   ⚠ El ORDEN de las ramas es la lógica. Un día que era libre y ahora vuela
   también tiene los números de vuelo distintos, así que si `cambio_vuelo` fuera
   antes se lo tragaría todo y las tres primeras categorías no saldrían nunca.

   ⚠ Y «franco» aquí es lo que el piloto llama franco —un día sin servicio—, que
   incluye el OFF, las vacaciones y el franco programable (`type:'f'`). La
   distinción entre día libre y franco importa para el 13.23, que paga; aquí no
   se paga nada y lo que cuenta es que no trabajabas y ahora sí. */
var CATEGORIAS = ['libre_vuelo','libre_act','guardia_vuelo','retirado','cambio_vuelo','solo_hora','otro'];
function categoriaTocado(a, b){
  var ca = claseDia(a), cb = claseDia(b);
  var sinServicio = !conActividad(a);
  if (sinServicio && cb === 'vuelo')       return 'libre_vuelo';
  if (sinServicio && conActividad(b))      return 'libre_act';      // guardia, formación u otra
  if (ca === 'guardia' && cb === 'vuelo')  return 'guardia_vuelo';
  if (conActividad(a) && !conActividad(b)) return 'retirado';       // te lo han quitado
  if (a.numeros !== b.numeros)             return 'cambio_vuelo';   // el importante
  if (a.inicio !== b.inicio || a.fin !== b.fin) return 'solo_hora'; // mismos vuelos, otra hora
  return 'otro';                        // cambia el tipo de día sin tocar vuelos ni horas
}

/* ─────────────── programación inicial ↔ ahora ───────────────
   «Tocado» es EL MISMO criterio que usa el servidor para apuntar cuándo se vio
   por primera vez que un día se apartaba de la inicial (`anotaDivergencias`):
   cambia el número de vuelo, o se mueve el inicio, o se mueve el fin.

   ⚠ No es el contador del Art. 12.9 y no tiene por qué coincidir. Aquél cuenta
   por VUELO (dos sectores sustituidos el mismo día son dos cambios) y además
   exige umbral, dirección y cambio de vuelo simultáneos. Éste cuenta DÍAS y no
   pide umbral: es una foto de cuánto te han movido el mes, no una reclamación.
   Los dos números salen juntos en la pantalla y hay que rotularlos, o parecen
   un fallo. */
function compara(iniEntries, actEntries, mes){
  /* El comparador va con la hora PROGRAMADA en las DOS fotos: es lo único que
     la v0 guarda, y medir una con lo volado y otra con lo publicado daría un
     delta que mide el método. */
  var Ji = RC().jornadas(delMes(iniEntries, mes));
  var Ja = RC().jornadas(delMes(actEntries, mes));
  var ini = medidas(iniEntries, mes, 'programada'), act = medidas(actEntries, mes, 'programada');
  var fechas = {};
  Object.keys(Ji).forEach(function(d){ fechas[d] = 1; });
  Object.keys(Ja).forEach(function(d){ fechas[d] = 1; });

  var tocados = [], libresTocados = [], denom = 0, soloIni = 0, soloAct = 0;
  var cats = {}, catDe = {};
  CATEGORIAS.forEach(function(k){ cats[k] = []; });
  Object.keys(fechas).sort().forEach(function(d){
    var a = Ji[d], b = Ja[d];
    if (a && conActividad(a) || b && conActividad(b)) denom++;
    if (!a){ soloAct++; }
    if (!b){ soloIni++; }
    /* Un día que sólo está en UNA foto no es un día tocado: casi siempre es un
       import parcial —media quincena que la foto actual no cubre—, y contarlo
       llenaría el mes de falsos. El motor del 12.9 tiene la misma cautela con
       `cubiertos`. Se cuentan aparte y se dicen. */
    if (!a || !b) return;
    /* ⚠ Aquí el criterio es un SUPERCONJUNTO del que usa el servidor. El suyo
       (`anotaDivergencias`) mira números de vuelo y horas, que es lo que decide
       el Art. 12.9. Pero un día que pasa de OFF a guardia no tiene vuelos NI
       horas en ninguna de las dos fotos, así que por ese criterio no ha pasado
       nada — y el piloto pidió expresamente ver «de franco a STBY».
       Se añade el TIPO de día. Todo lo que el servidor considera cambiado sigue
       contando: se amplía, no se sustituye. Y por eso este recuento puede ser
       mayor que el del 12.9, que además cuenta por vuelo. */
    var igual = a.numeros === b.numeros && a.inicio === b.inicio && a.fin === b.fin
                && claseDia(a) === claseDia(b);
    if (igual) return;
    tocados.push(d);
    var cat = categoriaTocado(a, b);
    cats[cat].push(d); catDe[d] = cat;
    /* Un día libre tocado se juzga por lo que ERA en la inicial: si estaba
       libre y ahora tiene actividad, te han quitado el día. Al revés —trabajo
       que pasa a libre— no es una pérdida y no entra. */
    var eraLibre = !!DL().esDiaLibre(a.codes, a.tipos);
    if (eraLibre && conActividad(b))
      libresTocados.push({ date:d, antes:(DL().esDiaLibre(a.codes,a.tipos)||'libre'),
                           vuelos:(b.vuelos||[]).length });
  });

  return {
    mes: mes, ini: ini, act: act,
    dDuty: act.dutyMin - ini.dutyMin,
    dBloque: act.bloqueMin - ini.bloqueMin,
    dSectores: act.sectores - ini.sectores,
    dGuardias: act.guardias - ini.guardias,
    dLibres: act.libres - ini.libres,
    tocados: tocados, nTocados: tocados.length,
    /* El número GRANDE son los cambios de verdad. Los de sólo hora se cuentan
       aparte a petición del piloto: «no ajustes de horas en los mismos vuelos». */
    cats: cats, catDe: catDe,
    nCambios: tocados.length - cats.solo_hora.length,
    nSoloHora: cats.solo_hora.length,
    conActividad: denom,
    libresTocados: libresTocados,
    soloIni: soloIni, soloAct: soloAct,
    clases: (function(){ var m = {}; Object.keys(Ja).forEach(function(d){ m[d] = claseDia(Ja[d]); }); return m; })()
  };
}

/* ─────────────── guardias del periodo ───────────────
   ACTIVADA = te asignaron vuelo o te tocó actividad aeroportuaria. Es el mismo
   criterio que usa la nómina (`activada` en /api/paycheck), y se copia el
   criterio, no el código: allí vive entre imaginarias, dietas y bloques que
   aquí no pintan nada.

   Lo que NO se afirma: que este recuento sea el que paga la nómina. El bloque
   de tres que eCrews reescribe cuando te sacan varios días seguidos declara
   más días de los que quedan a la vista, y esa aritmética es del convenio, no
   de una pantalla de estadísticas. Aquí se cuentan los días de guardia que el
   ROSTER enseña, y la pantalla lo dice así. */
var COD_AEROPUERTO = ['AA','AAI'];
function guardias(entries, desde, hasta){
  var J = RC().jornadas(entries || []);
  var dias = Object.keys(J).filter(function(d){
    return (!desde || d >= desde) && (!hasta || d <= hasta) && esGuardia(J[d]);
  }).sort();
  var act = {};
  Object.keys(J).forEach(function(d){
    act[d] = (J[d].vuelos && J[d].vuelos.length > 0) || enLista(J[d].codes, COD_AEROPUERTO);
  });
  var bloques = [];
  dias.forEach(function(d){
    var last = bloques[bloques.length-1];
    if (last && diaSig(last.hasta) === d){ last.hasta = d; last.dias++; last.fechas.push(d); }
    else bloques.push({ desde:d, hasta:d, dias:1, fechas:[d] });
  });
  bloques.forEach(function(b){
    b.activada = b.fechas.some(function(d){ return act[d]; });
  });
  return {
    dias: dias.length,
    bloques: bloques,
    total: bloques.length,
    activadas: bloques.filter(function(b){ return b.activada; }).length,
    diasActivados: dias.filter(function(d){ return act[d]; }).length
  };
}
function diaSig(iso){
  var t = Date.parse(iso + 'T00:00:00Z');
  return new Date(t + 86400000).toISOString().slice(0,10);
}

/* ─────────────── el año, repartido ─────────────── */
function reparto(entries, desde, hasta){
  var J = RC().jornadas(entries || []);
  var o = { vuelo:0, guardia:0, formacion:0, vacaciones:0, libre:0, franco:0, otros:0, total:0 };
  Object.keys(J).forEach(function(d){
    if ((desde && d < desde) || (hasta && d > hasta)) return;
    var c = claseDia(J[d]);
    if (o[c] == null) o[c] = 0;
    o[c]++; o.total++;
  });
  return o;
}

/* Findes trabajados. Sólo cuentan los sábados y domingos de los MESES que el
   piloto tiene importados: sobre el año natural entero, un piloto con cuatro
   meses dentro saldría con un 30 % de findes trabajados que no significa nada. */
function findes(entries, desde, hasta){
  var J = RC().jornadas(entries || []);
  var meses = {};
  Object.keys(J).forEach(function(d){
    if ((desde && d < desde) || (hasta && d > hasta)) return;
    meses[d.slice(0,7)] = 1;
  });
  var total = 0, trabajados = 0;
  Object.keys(meses).forEach(function(m){
    var p = m.split('-'), y = +p[0], mo = +p[1];
    var n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (var i = 1; i <= n; i++){
      var ds = m + '-' + String(i).padStart(2,'0');
      if ((desde && ds < desde) || (hasta && ds > hasta)) continue;
      var dow = new Date(ds + 'T00:00:00Z').getUTCDay();
      if (dow !== 0 && dow !== 6) continue;
      total++;
      var j = J[ds];
      if (j && conActividad(j)) trabajados++;
    }
  });
  return { trabajados: trabajados, total: total };
}

/* Qué meses hay dentro. Un dato de dos líneas que evita el peor fallo de esta
   pantalla: dar una media o un total del «año» sobre cuatro meses sin decirlo. */
function meses(entries, desde, hasta){
  var m = {};
  (entries || []).forEach(function(e){
    if (!e || !e.date) return;
    if ((desde && e.date < desde) || (hasta && e.date > hasta)) return;
    m[e.date.slice(0,7)] = 1;
  });
  return Object.keys(m).sort();
}

function hhmm(min){
  var s = min < 0 ? '-' : '', a = Math.abs(Math.round(min));
  return s + Math.floor(a/60) + 'h' + String(a%60).padStart(2,'0');
}

var API = {
  CATEGORIAS: CATEGORIAS, categoriaTocado: categoriaTocado,
  medidas: medidas, compara: compara, volado: volado, horaVolada: horaVolada, guardias: guardias, reparto: reparto,
  findes: findes, meses: meses, claseDia: claseDia, conActividad: conActividad,
  esGuardia: esGuardia, esPos: esPos, esPosLeg: esPosLeg, durLeg: durLeg, hhmm: hhmm,
  COD_AEROPUERTO: COD_AEROPUERTO
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.RstStats = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
