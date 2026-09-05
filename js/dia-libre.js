/* ══════════════════════════════════════════════════════════════════════════
   INVASIÓN DE DÍA LIBRE — motor de reglas (puro, sin dependencias de DOM)
   Art. 13.23 del IV Convenio Colectivo de pilotos de Vueling

   QUÉ DICE EL ARTÍCULO, y por qué está implementado así
   ─────────────────────────────────────────────────────
   «Si la actividad, incluyendo tareas post vuelo si las hubiere, del día previo
   al día libre, independientemente de la hora programada inicialmente,
   finalizara, EN EJECUCIÓN, a partir de las 00:00 (hora local) del día libre
   programado, el piloto tendrá derecho a que se le abonen…»

   Tres franjas por la hora de fin —00:00-00:59, 01:00-01:59, 02:00 en
   adelante—, y cada una paga UNA DIETA NACIONAL más el importe del Anexo A
   según especialidad. «No procederá devolución del día libre invadido», salvo
   el caso del avión que se queda fuera de base y el piloto vuelve operando.

   LO QUE NO ES
   Que te metan una jornada ENTERA dentro del día libre no es este artículo:
   eso es quitarte el día, y va por otro sitio. Aquí solo se paga el derrame de
   la jornada de la víspera por encima de medianoche.

   LAS TRES DECISIONES, y de dónde salen
   ─────────────────────────────────────
   Ninguna sale del texto sin preguntar, así que las tres son constantes en
   REGLAS y están confirmadas con el piloto:

   · «HORA LOCAL» = la de España (`Europe/Madrid`). El roster se guarda en UTC:
     aterrizar a las 22:10Z en julio son las 00:10 locales, una invasión que
     mirando el UTC no se ve. Y al revés en invierno. Esta conversión no es un
     detalle de formato — decide si hay invasión y en qué franja.

   · FIN DE ACTIVIDAD = calzos + 20 min, siempre. Salvo contratiempo en que la
     compañía alargue la actividad, y eso solo lo sabe el piloto: por eso hay
     una marca para corregir la hora de fin a mano.

   · Y QUÉ CALZOS: los REALES. En la vida real una invasión de día libre no se
     decide con el horario publicado, así que el orden es
     **A → L (logbook) → E → la vigente**, y la programada (`_scheduled`) NO
     entra nunca. El logbook va por delante de la estimada porque lo apunta el
     piloto con los calzos delante: es un dato ejecutado, no una previsión. Con
     el mes recién publicado solo hay S y la cuenta sale de ahí —que es lo que
     hace útil el simulador—, pero en cuanto hay logbook, o eCrews da la A,
     mandan ellos.

   · CUENTAN todos los días libres, y vacaciones y reducción de jornada también.

   POR QUÉ ES UN MÓDULO APARTE Y ES ISOMORFO
   Lo cargan el backend (server.js), el cliente y los bancos, igual que
   roster-changes.js y expense-engine.js. Y va SEPARADO de roster-changes.js a
   propósito, porque las dos lecturas del roster son opuestas y mezclarlas sería
   el error caro: el Art. 12.9 mira SOLO la hora programada y este mira SOLO la
   ejecutada. Un `||` de más entre los dos y el mes entero sale mal sin un error.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ─────────────── 1. Las constantes del artículo ─────────────── */
var REGLAS = {
  /* Fin de actividad = calzos + este margen. «Finalización de calzos + 20 min
     siempre el periodo de actividad», confirmado por el piloto. */
  postVueloMin: 20,

  /* «Hora local»: la de España. El artículo no dice de dónde, y la lectura es
     que es TU día libre, así que tu hora. Se deja como constante porque un
     destacamento fuera de España la cambiaría. */
  tz: 'Europe/Madrid',

  /* Las tres franjas del artículo, en minutos desde la medianoche LOCAL del día
     libre. El corte de arriba es abierto: 00:59 entra en b1 y 01:00 en b2. */
  franjas: [
    { id: 'b1', desde: 0,   hasta: 60,   etiqueta: '00:00 – 00:59' },
    { id: 'b2', desde: 60,  hasta: 120,  etiqueta: '01:00 – 01:59' },
    { id: 'b3', desde: 120, hasta: null, etiqueta: '02:00 en adelante' }
  ],

  /* Vacaciones y reducción de jornada cuentan como día libre. Confirmado:
     «si todos esos días son libres, cualquier invasión se computa y se paga». */
  cuentaVacaciones: true
};

/* Respaldo del Anexo A para los bancos y el cliente; el backend pasa las de
   convenio_anexo_a.json por parámetro. */
var TARIFAS_2026 = {
  cmd:  { b1: 86.77, b2: 240.24, b3: 547.16 },
  cop:  { b1: 43.80, b2: 154.30, b3: 301.62 },
  cop6: { b1: 43.80, b2: 154.30, b3: 301.62 }
};
// Dieta nacional (Anexo A 2026): una por invasión, además del importe de franja.
var DIETA_NAC = { importe: 67.22, exento: 36.06, sujeto: 31.16 };

/* ─────────────── 2. Qué es un DÍA LIBRE, y qué no ───────────────
   El artículo define el día libre como aquel «del que dispone libremente el
   piloto sin que pueda ser requerido para que efectúe cualquier tipo de actividad
   o servicio alguno». Eso deja fuera el **FRANCO**: un franco es programable, la
   compañía puede meterte servicio en él, así que no es un día del que dispongas
   libremente y el 13.23 no aplica.

   Es la distinción que ya hace el parser de eCrews con el tipo de la entrada:
     type 'off' → familia OFF (OFF, AOFF, ROFF, SROF, NROF, NOFF…) = día libre
     type 'f'   → familia FRANCO (F, F2, FR)                        = programable
   Se listan además los códigos por si el roster viene de un PDF y trae el código
   crudo sin normalizar.

   OJO: esta lista NO es la misma que `COD_FRANCO` de roster-changes.js, y la
   diferencia es DELIBERADA — allí «franco» agrupa todo lo que no es servicio,
   para excluirlo del Art. 12.9; aquí hay que separar el franco del día libre
   porque solo el segundo cobra. El banco fija esa diferencia para que nadie las
   vuelva a unificar «arreglando» una incoherencia que no lo es. */
/* LISTA EXPLÍCITA, y a propósito. `type:'off'` NO vale de red: el parser de eCrews
   mete en ese tipo un montón de PERMISOS —maternidad, paternidad, boda, lactancia,
   mudanza, falta— que no son días libres y que estaban contando. Lo que no está
   aquí, no cuenta: preferible perder un código raro y que el piloto lo diga, que
   decirle que reclame un día que no le tocaba.
   Confirmados por el piloto: OFF · VAC · AOFF · SOFF · NOFF. El resto son la
   familia OFF del mapa de eCrews (EC_MAP en index.html). */
var COD_DIA_LIBRE = ['OFF','AOFF','SOFF','NOFF','ROFF','VOFF','>OFF','REST','XSOF',
                     'CDOF','LOFF','DOFF','PAOF','DCOF','XOF1','XOF2','XOF3',
                     'NROF','SROF','DIA LIBRE',
                     /* Part time: los días que el piloto de jornada reducida NO
                        trabaja son días libres suyos, y el piloto los clasifica
                        así. Van aquí y no con las vacaciones: no dependen de
                        `cuentaVacaciones`, cuentan siempre.
                        Ojo con `PTA`, que es un posicional y NO entra: la
                        comparación es exacta, no por prefijo. */
                     'PT','PTME','PTM'];
/* ⚠️ FZ/FZNA (forzoso) NO están en la lista, y no es un olvido. Hasta Beta.720 el
   parser los normalizaba a 'OFF' y contaban aquí como día libre sin que nadie lo
   hubiera decidido. Un forzoso es lo contrario: «te han cambiado o añadido una
   actividad en un día que YA TRABAJABAS» (piloto, 5-sep-2026). No hay día libre
   que invadir, así que el 13.23 no aplica por ese lado. */
/* ⚠ Un límite que no se puede arreglar desde aquí: el parser NORMALIZA muchos de
   esos permisos a `code:'OFF'` (BOD, LAC, MUD, PER, EMB, FALT…), así que una vez
   importados son indistinguibles de un día libre de verdad. MAT y PAT sí conservan
   el suyo y por eso quedan fuera. Si algún día el parser guarda el código crudo,
   esta lista puede afinar más. */
/* Franco y compañía: programables, así que NO son día libre por mucho que el
   parser los guarde con `type:'off'` en algún camino. `DS` tampoco —es «día sin
   cambios», que es una petición, no un día libre— ni `MEOF`, que es un día
   médico. */
var COD_NO_LIBRE   = ['F','F2','FR','FR2','HFR','RF','DS','EF','MEOF',
                      // Permisos y situaciones personales: no son días libres.
                      'MAT','PAT','BOD','LAC','EMB','MUD','PER','RPER','FALT',
                      'INC','SICK','SIND','MED','ASEP','PERM','LIC','HOSP','HIGH'];
// Vacaciones y sus variantes. NO entran bajas ni permisos: no son días libres.
var COD_VACACIONES = ['VAC','RVAC','PVAC','VAI','PVAI','RVAI','VICC'];

function up(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
function enLista(codes, lista){
  for (var i = 0; i < codes.length; i++) if (lista.indexOf(codes[i]) > -1) return true;
  return false;
}

/* ─────────────── 3. Horas ───────────────
   `--:--` es un valor de verdad que manda eCrews cuando no hay hora. Una cadena
   de `||` se para ahí porque es truthy — el mismo mordisco que ya costó dos
   rondas en las duraciones del roster. */
function hm(v){
  if (v == null) return null;
  var m = /^(\d{1,2}):?(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 47 || mi > 59) return null;
  return h * 60 + mi;
}
function primeraLegible(){
  for (var i = 0; i < arguments.length; i++){
    var t = hm(arguments[i]);
    if (t != null) return t;
  }
  return null;
}
function hhmm(min){
  var m = ((Math.round(min) % 1440) + 1440) % 1440;
  return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
}
function diaMs(fecha){
  var p = String(fecha||'').split('-');
  if (p.length !== 3) return null;
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}
function msADia(ms){ return new Date(ms).toISOString().slice(0,10); }
function diaAntes(fecha){ var t = diaMs(fecha); return t == null ? null : msADia(t - 86400000); }

/* ─────────────── 4. El huso ───────────────
   Se usa el de expense-engine (`NGasto`), que ya tiene la tabla IATA→huso y
   resuelve los saltos de DST con doble pasada. Si no está —un banco que cargue
   este módulo suelto—, se cae a un offset fijo, pero el banco lo detecta. */
function motorTz(){
  try { if (typeof require === 'function') return require('./expense-engine.js'); } catch(e){}
  try { if (root.NGasto) return root.NGasto; } catch(e){}
  return null;
}
/* Instante UTC → {fecha:'YYYY-MM-DD', min} en la hora local de tz. */
function aLocal(utcMs, tz){
  var ng = motorTz();
  if (ng && ng.utcToLocal){
    var l = ng.utcToLocal(utcMs, tz || REGLAS.tz);
    return { fecha: l.y + '-' + String(l.m).padStart(2,'0') + '-' + String(l.d).padStart(2,'0'),
             min: l.min };
  }
  return null;                       // sin motor de husos no se inventa una hora
}

/* Cuánto puede separarse un debrief creíble de los calzos. Las tareas post vuelo
   son minutos; el margen deja sitio a un contratiempo razonable y corta las horas
   sueltas que no son el debrief de ese tramo. Más allá, la corrección a mano. */
var DEBRIEF_MAX_TRAS_CALZOS = 180;

/* La hora que se usa para MEDIR, en el orden que manda el artículo: lo ejecutado.
     1. `_actual`     — la A de eCrews: los calzos de verdad. Es la buena.
     2. LOGBOOK       — lo que apuntó el piloto, con los calzos delante. Es un dato
                        EJECUTADO, así que va por delante de cualquier previsión.
     3. `_estimated`  — la E: la mejor previsión mientras no haya calzos.
     4. la vigente    — lo que haya (`sta`), que es también lo que teclea el piloto
                        al simular. La programada (`_scheduled`) NO entra NUNCA:
                        una invasión de día libre no se decide con el horario
                        publicado, sino con lo que pasó.
   El Art. 12.9 hace justo lo contrario —solo mira la programada—, y por eso los
   dos motores viven separados: un `||` de más entre ellos y el mes sale mal. */
function horaEjecutada(){
  return primeraLegible.apply(null, arguments);
}

/* El logbook se pasa POR PARÁMETRO, como las marcas: este módulo no toca
   localStorage ni el DOM. `normApt` también, porque el mapa IATA↔ICAO vive en el
   cliente y aquí no se puede inventar: sin él se comparan los códigos tal cual.
   Un apunte del logbook casa con un tramo por el número de vuelo (sin el VY) o,
   a falta de él, por origen+destino. Mismo criterio que la ficha del día. */
function buscaLogbook(leg, logbook, normApt){
  if (!leg || !logbook) return null;
  /* El cliente pasa una FUNCIÓN: allí el emparejamiento ya existe
     (`rstFindLogbookMatch`, que normaliza IATA↔ICAO, desempata por STD y no
     asigna nada cuando hay ambigüedad). Una segunda copia de esas reglas acabaría
     como ES_AIRPORTS / ES_IATA. La lista de abajo es para el servidor y los bancos. */
  if (typeof logbook === 'function'){ try { return logbook(leg) || null; } catch(e){ return null; } }
  if (!logbook.length) return null;
  var na = normApt || function(c){ return up(c); };
  var num = function(v){ return up(v).replace(/^VY/, ''); };
  for (var i = 0; i < logbook.length; i++){
    var lb = logbook[i];
    if (!lb || !lb.date || lb.date !== leg.date) continue;
    var a = num(lb.flight || lb.flightNum), b = num(leg.flightNum || leg.flight);
    if (a && b){ if (a === b) return lb; continue; }
    if (na(lb.dep) === na(leg.dep) && na(lb.arr) === na(leg.arr)) return lb;
  }
  return null;
}

/* ─────────────── 5. El fin de actividad de un día ───────────────
   Se mide EN EJECUCIÓN: manda la hora real (A), luego la estimada (E), y solo a
   falta de las dos la vigente. Es lo contrario del Art. 12.9.

   Devuelve el instante UTC en que acaba la actividad, ya con los 20 minutos de
   tareas post vuelo, y de dónde ha salido — porque un importe de 547 € que no
   dice de qué hora sale no se puede reclamar. */
function finActividad(fecha, entries, opts){
  opts = opts || {};
  var base = diaMs(fecha);
  if (base == null) return null;
  var mejor = null;

  /* Arranque del día SIN mover nada, para poder juzgar después si una bandera de
     cruce de medianoche es creíble. */
  var inicioDia = null;
  (entries || []).forEach(function(e){
    if (!e || e.date !== fecha || e.type === 'overnight_continuation') return;
    if (e.crossesMidnight) return;      // el ancla la ponen los tramos que NO se discuten
    var _lb0 = buscaLogbook(e, opts.logbook, opts.normApt);
    var t = horaEjecutada(e.std_actual, _lb0 && _lb0.std, e.std_estimated, e.std, e.start);
    if (t != null && (inicioDia == null || t < inicioDia)) inicioDia = t;
  });
  if (inicioDia != null) inicioDia = base + inicioDia * 60000;
  /* Ninguna jornada llega a 16 h; el FDP máximo son 13. Si creer la bandera da un
     día imposible, la bandera está vieja. Pasó de verdad: un sector 21:40→22:39
     con un `crossesMidnight` heredado de antes de editarlo se colocaba en el día
     siguiente y una invasión de 153,99 € salía por 614,38 €. Es el mismo criterio
     que descarta una firma que no es la de ese día: no se juzga si la bandera
     parece razonable, sino si el resultado es físicamente posible. */
  var creible = function(finMs){
    return inicioDia == null || (finMs - inicioDia) <= 16 * 3600000;
  };

  (entries || []).forEach(function(e){
    if (!e || e.date !== fecha) return;
    if (e.type === '__deleted__') return;

    /* La cola de una jornada que cruzó medianoche: eCrews la deja en el día
       siguiente como `overnight_continuation` con la hora de llegada, y el
       parser propaga `invasionEnd` a las entradas del día invadido. Aquí NO se
       usa: esa cola pertenece al día INVADIDO, y lo que se mide es el fin de la
       actividad de la VÍSPERA. Se ignora a propósito. */
    if (e.type === 'overnight_continuation') return;

    if (e.type === 'flight'){
      var lb  = buscaLogbook(e, opts.logbook, opts.normApt);
      var sta = horaEjecutada(e.sta_actual, lb && lb.sta, e.sta_estimated, e.sta);
      var std = horaEjecutada(e.std_actual, lb && lb.std, e.std_estimated, e.std);
      if (sta == null) return;
      // De dónde ha salido la hora, para poder enseñarlo: un importe de 547 € que
      // no dice si sale de los calzos reales o de una previsión no se reclama.
      var cual = hm(e.sta_actual) != null ? 'real'
               : (lb && hm(lb.sta) != null ? 'logbook'
               : (hm(e.sta_estimated) != null ? 'estimada' : 'prevista'));
      /* El tramo que cruza medianoche llega al día siguiente. Con la llegada ANTES
         que la salida no hay duda ninguna; la bandera solo hace falta para el leg
         que sale Y llega de madrugada (00:10→01:54, que no envuelve), y esa sí
         puede venir vieja, así que se comprueba antes de creerla. */
      var cruza = (std != null && sta < std);
      if (!cruza && e.crossesMidnight &&
          creible(base + (sta + 1440) * 60000 + REGLAS.postVueloMin * 60000)) cruza = true;
      var ms = base + (sta + (cruza ? 1440 : 0)) * 60000 + REGLAS.postVueloMin * 60000;
      if (mejor == null || ms > mejor.ms)
        mejor = { ms: ms, fuente: 'calzos+' + REGLAS.postVueloMin, hora: cual };

      /* Si eCrews declara un debrief POSTERIOR a los calzos, ése manda: es el
         contratiempo que el artículo contempla —la compañía alarga la actividad—
         y ahí los 20 minutos de tabla se quedan cortos.

         Pero solo si es de VERDAD el debrief de este tramo. Una hora suelta que
         cae mucho después de los calzos no puede serlo: las tareas post vuelo son
         minutos, no horas. Antes se daba por hecho que un debrief anterior a la
         llegada era del día siguiente, y un `debrief` de 11:10 sobre unos calzos
         de 22:01 se colocaba 13 horas más tarde: una invasión de 153,99 € salía
         por 614,38 €, con la franja equivocada, que es lo caro.
         Es la misma regla que la firma vieja y la bandera de medianoche: un valor
         que contradice la aritmética no manda sobre ella. Y si la compañía alargó
         de verdad más de esto, el piloto lo corrige a mano. */
      var db = hm(e.debrief);
      if (db != null){
        var tras = (((db - sta) % 1440) + 1440) % 1440;      // minutos DESPUÉS de calzos
        if (tras <= DEBRIEF_MAX_TRAS_CALZOS){
          var msd = base + (sta + (cruza ? 1440 : 0)) * 60000 + tras * 60000;
          if (mejor == null || msd > mejor.ms) mejor = { ms: msd, fuente: 'debrief', hora: cual };
        }
      }
    } else {
      // Actividad de tierra (simulador, curso, oficina): acaba cuando acaba.
      var fin = horaEjecutada(e.sta_actual, e.sta_estimated, e.sta, e.end);
      var ini = horaEjecutada(e.std_actual, e.std_estimated, e.std, e.start);
      // La actividad de tierra no está en el logbook: ahí no hay L que buscar.
      if (fin == null) return;
      var ms2 = base + (fin + (ini != null && fin < ini ? 1440 : 0)) * 60000;
      if (mejor == null || ms2 > mejor.ms)
        mejor = { ms: ms2, fuente: 'fin de actividad',
                  hora: hm(e.sta_actual) != null ? 'real' : (hm(e.sta_estimated) != null ? 'estimada' : 'prevista') };
    }
  });

  /* La corrección del piloto manda sobre todo lo demás: es el «contratiempo en
     que llama a la compañía y se lo alargan», que no está en ningún dato. */
  var man = opts.correcciones && opts.correcciones[fecha];
  if (man && hm(man.fin) != null){
    var mm = hm(man.fin);
    // La hora corregida es LOCAL; se pasa a UTC con el huso del artículo.
    var ng = motorTz(), p = String(fecha).split('-');
    if (ng && ng.localToUTC){
      var msm = ng.localToUTC(+p[0], +p[1], +p[2], Math.floor(mm/60), mm%60, opts.tz || REGLAS.tz);
      if (man.diaSiguiente) msm += 86400000;
      return { ms: msm, fuente: 'corregido por el piloto', hora: 'real' };
    }
  }
  return mejor;
}

/* ─────────────── 6. Los días libres del mes ─────────────── */
function esDiaLibre(codes, tipos){
  // Vacaciones primero: viajan con `type:'off'` y si no se miran antes saldrían
  // como día libre normal y se perdería la etiqueta.
  if (enLista(codes, COD_VACACIONES) || tipos.indexOf('vacation') > -1)
    return REGLAS.cuentaVacaciones ? 'vacaciones' : null;
  // El franco es programable: no es día libre, por mucho que el tipo diga 'off'.
  if (enLista(codes, COD_NO_LIBRE) || tipos.indexOf('f') > -1) return null;
  if (enLista(codes, COD_DIA_LIBRE)) return 'libre';
  return null;
}
function porDia(entries){
  var dias = {};
  (entries || []).forEach(function(e){
    if (!e || !e.date || e.type === '__deleted__') return;
    var d = dias[e.date] || (dias[e.date] = { date: e.date, codes: [], tipos: [], nVuelos: 0 });
    if (e.code){ var c = up(e.code); if (d.codes.indexOf(c) < 0) d.codes.push(c); }
    if (e.type){ var t = String(e.type); if (d.tipos.indexOf(t) < 0) d.tipos.push(t); }
    if (e.type === 'flight') d.nVuelos++;
  });
  return dias;
}

function franjaDe(minLocal){
  for (var i = 0; i < REGLAS.franjas.length; i++){
    var f = REGLAS.franjas[i];
    if (minLocal >= f.desde && (f.hasta == null || minLocal < f.hasta)) return f;
  }
  return REGLAS.franjas[REGLAS.franjas.length - 1];
}

/* ─────────────── 7. El motor ───────────────
   opts = {
     entries     : roster del mes (y conviene el último día del mes anterior)
     mes         : 'YYYY-MM'
     especialidad: 'cmd' | 'cop' | 'cop6'
     tarifas     : { cmd:{b1,b2,b3}, … }  del Anexo A
     dieta       : { importe, exento, sujeto }
     logbook     : apuntes del logbook del piloto — [{date, flight, dep, arr, std, sta}]
     normApt     : (codigo) => codigo normalizado, para casar IATA con ICAO
     marcas      : { 'YYYY-MM-DD': { devuelto:true, motivo:'volví operando' } }
     correcciones: { 'YYYY-MM-DD': { fin:'02:40', diaSiguiente:true } }  ← la del
                   día de la VÍSPERA, en hora local
     tz          : huso de la «hora local»
   } */
function detectar(opts){
  opts = opts || {};
  var esp     = (opts.especialidad || 'cmd').toLowerCase();
  var tabla   = (opts.tarifas || TARIFAS_2026)[esp] || (opts.tarifas || TARIFAS_2026).cmd || TARIFAS_2026.cmd;
  var dieta   = opts.dieta || DIETA_NAC;
  var marcas  = opts.marcas || {};
  var tz      = opts.tz || REGLAS.tz;
  var dias    = porDia(opts.entries);
  var mes     = opts.mes || null;

  var invasiones = [], sinDatos = [];
  Object.keys(dias).sort().forEach(function(fecha){
    if (mes && fecha.slice(0,7) !== mes) return;
    var d = dias[fecha];
    var tipoLibre = esDiaLibre(d.codes, d.tipos);
    if (!tipoLibre) return;

    var visp = diaAntes(fecha);
    var dv   = dias[visp];
    /* Sin la víspera en el roster no se puede afirmar NADA: puede haber habido
       invasión y no tenerla importada. Se dice, en vez de contar 0 en silencio. */
    if (!dv || (!dv.nVuelos && dv.tipos.indexOf('off') > -1)) return;

    var fin = finActividad(visp, opts.entries, { correcciones: opts.correcciones, tz: tz,
                                                 logbook: opts.logbook, normApt: opts.normApt });
    if (!fin){
      if (dv.nVuelos) sinDatos.push({ date: fecha, vispera: visp, causa: 'sin_hora',
        detalle: 'la víspera tiene actividad pero no hay hora de fin legible' });
      return;
    }
    var loc = aLocal(fin.ms, tz);
    if (!loc){
      sinDatos.push({ date: fecha, vispera: visp, causa: 'sin_huso',
        detalle: 'no se ha podido pasar la hora a local' });
      return;
    }
    // La invasión existe si el fin cae YA en el día libre, en hora local.
    if (loc.fecha < fecha) return;

    var minLocal = loc.fecha > fecha ? 1440 : loc.min;   // acabar en D+1 es b3 de sobra
    var fr = franjaDe(minLocal);
    var marca = marcas[fecha] || null;
    invasiones.push({
      date: fecha,
      tipoDia: tipoLibre,
      vispera: visp,
      finLocal: hhmm(loc.min),
      finUtc: msADia(fin.ms) + ' ' + hhmm(Math.round((fin.ms - diaMs(msADia(fin.ms))) / 60000)),
      fuente: fin.fuente,
      hora: fin.hora || 'prevista',        // 'real' (A) · 'estimada' (E) · 'prevista'
      franja: fr.id,
      franjaEtiqueta: fr.etiqueta,
      importe: tabla[fr.id] || 0,
      dietaImporte: dieta.importe,
      dietaExenta: dieta.exento,
      dietaSujeta: dieta.sujeto,
      total: Math.round(((tabla[fr.id] || 0) + dieta.importe) * 100) / 100,
      diaDevuelto: !!(marca && marca.devuelto),
      motivoDevuelto: marca && marca.devuelto ? (marca.motivo || null) : null,
      motivo: 'la jornada del ' + visp + ' acabó a las ' + hhmm(loc.min) +
              ' hora local, ya dentro de tu día libre'
    });
  });

  var porFranja = { b1: 0, b2: 0, b3: 0 };
  var importe = 0, dietas = 0, dietaSuj = 0, dietaExe = 0;
  invasiones.forEach(function(i){
    porFranja[i.franja] = (porFranja[i.franja] || 0) + 1;
    importe  += i.importe;
    dietas   += i.dietaImporte;
    dietaSuj += i.dietaSujeta;
    dietaExe += i.dietaExenta;
  });
  var r2 = function(n){ return Math.round(n * 100) / 100; };

  return {
    mes: mes, especialidad: esp,
    n: invasiones.length, porFranja: porFranja,
    importe: r2(importe),                 // solo el Anexo A (cód. 2043)
    dietas: r2(dietas),                   // las dietas nacionales que lo acompañan
    dietaSujeta: r2(dietaSuj), dietaExenta: r2(dietaExe),
    total: r2(importe + dietas),
    diasDevueltos: invasiones.filter(function(i){ return i.diaDevuelto; }).length,
    invasiones: invasiones,
    sinDatos: sinDatos
  };
}

/* ─────────────── 8. Escenarios ───────────────
   Viven aquí, con el motor, y no en el banco: los corre también el autotest de
   la app. Si estuvieran en el banco, la app probaría una cosa y el banco otra.
   Es el fallo de ES_AIRPORTS otra vez.

   Las horas de los escenarios son UTC, como el roster. `zUtc` es la hora UTC que
   hay que poner para caer en una hora LOCAL concreta: en verano España es UTC+2
   y en invierno UTC+1, así que un escenario con la hora cableada probaría una
   cosa en julio y otra en enero. */
function zUtc(fechaLocal, hhmmLocal, tz){
  var ng = motorTz();
  if (!ng || !ng.localToUTC) return null;
  var p = String(fechaLocal).split('-'), m = hm(hhmmLocal);
  var ms = ng.localToUTC(+p[0], +p[1], +p[2], Math.floor(m/60), m%60, tz || REGLAS.tz);
  return { fecha: msADia(ms), hora: hhmm(Math.round((ms - diaMs(msADia(ms))) / 60000)) };
}

/* Un día con un vuelo que aterriza a la hora LOCAL indicada del día siguiente
   (o del mismo día), más el día libre detrás. */
function _mes(finLocalFecha, finLocalHora, codigoLibre, extra){
  var libre = finLocalFecha;                       // el día libre
  var visp  = diaAntes(libre);
  var z = zUtc(finLocalFecha, finLocalHora);       // calzos en UTC
  if (!z) return null;
  // Los calzos son 20 min antes del fin de actividad.
  var calzosMin = hm(z.hora) - REGLAS.postVueloMin;
  var cruza = false, fechaLeg = z.fecha;
  if (calzosMin < 0){ calzosMin += 1440; fechaLeg = diaAntes(z.fecha); }
  if (fechaLeg !== visp){ cruza = true; fechaLeg = visp; calzosMin += 1440; }
  var e = [
    { date: visp, type: 'flight', flightNum: 'VY1', dep: 'BCN', arr: 'BCN',
      std: '18:00', sta: hhmm(calzosMin), crossesMidnight: cruza },
    { date: libre, type: 'off', code: codigoLibre || 'OFF' }
  ];
  return extra ? e.concat(extra) : e;
}

var ESCENARIOS = [
  { nombre: 'acaba a las 00:10 locales → b1', espera: 'b1',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:10'), tarifas:T });
                        return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'acaba a las 00:59 → todavía b1', espera: 'b1',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:59'), tarifas:T });
                        return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'a las 01:00 clavadas ya es b2', espera: 'b2',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','01:00'), tarifas:T });
                        return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'a las 01:59 sigue en b2', espera: 'b2',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','01:59'), tarifas:T });
                        return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'a las 02:00 salta a b3', espera: 'b3',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','02:00'), tarifas:T });
                        return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  /* Acabar a las 23:50 de la víspera no invade nada: el artículo pide pasar de
     las 00:00. Se construye a mano —y no con _mes, que por diseño coloca el fin
     DENTRO del día libre— porque el caso que hay que probar es el contrario. */
  { nombre: 'a las 23:50 de la víspera NO invade', espera: 0,
    hacer: function(T){ var z = zUtc('2026-07-14', '23:30');   // calzos: 23:30 + 20 = 23:50
      return detectar({ mes:'2026-07', entries:[
        { date:z.fecha, type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN', std:'18:00', sta:z.hora },
        { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T }).n; } },
  { nombre: 'y a las 23:59 tampoco', espera: 0,
    hacer: function(T){ var z = zUtc('2026-07-14', '23:39');
      return detectar({ mes:'2026-07', entries:[
        { date:z.fecha, type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN', std:'18:00', sta:z.hora },
        { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T }).n; } },
  { nombre: 'las 00:00 clavadas ya invaden', espera: 1,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:00'), tarifas:T }).n; } },
  { nombre: 'si el día siguiente NO es libre, no hay invasión', espera: 0,
    hacer: function(T){ var e = _mes('2026-07-15','01:30');
                        e[1] = { date:'2026-07-15', type:'flight', flightNum:'VY9', dep:'BCN', arr:'CDG', std:'08:00', sta:'10:00' };
                        return detectar({ mes:'2026-07', entries:e, tarifas:T }).n; } },
  { nombre: 'vacaciones también son día libre', espera: 1,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','01:30','VAC'), tarifas:T }).n; } },
  { nombre: 'una baja NO es un día libre', espera: 0,
    hacer: function(T){ var e = _mes('2026-07-15','01:30');
                        e[1] = { date:'2026-07-15', type:'sick', code:'SICK' };
                        return detectar({ mes:'2026-07', entries:e, tarifas:T }).n; } },
  { nombre: 'un día de part time es día libre', espera: 1,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:30','PT'), tarifas:T }).n; } },
  { nombre: 'y cuenta aunque las vacaciones no cuenten', espera: 1,
    hacer: function(T){ var g = REGLAS.cuentaVacaciones; REGLAS.cuentaVacaciones = false;
      try { return detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:30','PT'), tarifas:T }).n; }
      finally { REGLAS.cuentaVacaciones = g; } } },
  { nombre: 'PTA es un posicional, no un día libre', espera: 0,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:30','PTA'), tarifas:T }).n; } },
  { nombre: 'un CMD en b3 cobra la tarifa de b3', espera: 547.16,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','03:00'),
                                          especialidad:'cmd', tarifas:T }).importe; } },
  { nombre: 'y un FO, la suya', espera: 301.62,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','03:00'),
                                          especialidad:'cop', tarifas:T }).importe; } },
  { nombre: 'cada invasión lleva UNA dieta nacional', espera: 67.22,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:30'), tarifas:T }).dietas; } },
  { nombre: 'dos días libres invadidos son dos invasiones', espera: 2,
    hacer: function(T){ var e = _mes('2026-07-15','00:30').concat(_mes('2026-07-22','01:30'));
                        return detectar({ mes:'2026-07', entries:e, tarifas:T }).n; } },
  { nombre: 'el día libre sin víspera importada no se inventa', espera: 0,
    hacer: function(T){ return detectar({ mes:'2026-07',
             entries:[{ date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T }).n; } },
  { nombre: 'la marca del piloto no quita el dinero, devuelve el día', espera: '1/1',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','02:30'),
                          tarifas:T, marcas:{ '2026-07-15': { devuelto:true, motivo:'volví operando' } } });
                        return r.n + '/' + r.diasDevueltos; } },
  { nombre: 'y con el día devuelto se sigue cobrando', espera: true,
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','02:30'),
                          tarifas:T, marcas:{ '2026-07-15': { devuelto:true } } });
                        return r.importe > 0; } },
  /* El mismo aterrizaje UTC, en julio y en enero: en verano España es UTC+2 y en
     invierno UTC+1, así que 22:10Z invade en julio y NO en enero. Es la prueba de
     que la conversión existe de verdad. */
  { nombre: '22:10Z en julio son las 00:10 locales → invade', espera: 1,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:[
      { date:'2026-07-14', type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN', std:'18:00', sta:'21:50' },
      { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T }).n; } },
  { nombre: 'el mismo 21:50Z en enero son las 22:10 → no invade', espera: 0,
    hacer: function(T){ return detectar({ mes:'2026-01', entries:[
      { date:'2026-01-14', type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN', std:'18:00', sta:'21:50' },
      { date:'2026-01-15', type:'off', code:'OFF' }], tarifas:T }).n; } },
  { nombre: 'manda la hora REAL, no la programada', espera: 'b2',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:[
      { date:'2026-07-14', type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN',
        std_scheduled:'14:00', sta_scheduled:'18:00', std:'18:00', sta:'21:00',
        std_actual:'19:40', sta_actual:'23:20' },
      { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T });
      return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'un debrief posterior manda sobre los 20 min', espera: 'b3',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:[
      { date:'2026-07-14', type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN',
        std:'18:00', sta:'23:30', debrief:'00:10' },
      { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T });
      return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'la corrección del piloto manda sobre todo', espera: 'b3',
    hacer: function(T){ var r = detectar({ mes:'2026-07', entries:_mes('2026-07-15','00:20'),
      tarifas:T, correcciones:{ '2026-07-14': { fin:'02:40', diaSiguiente:true } } });
      return r.n === 1 ? r.invasiones[0].franja : 'nada'; } },
  { nombre: 'una actividad de tierra que se pasa de medianoche invade', espera: 1,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:[
      { date:'2026-07-14', type:'training', code:'SIM', std:'18:00', sta:'22:30' },
      { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T }).n; } },
  { nombre: 'la víspera con actividad y sin horas se DICE, no se calla', espera: 1,
    hacer: function(T){ return detectar({ mes:'2026-07', entries:[
      { date:'2026-07-14', type:'flight', flightNum:'VY1', dep:'BCN', arr:'BCN', std:'--:--', sta:'--:--' },
      { date:'2026-07-15', type:'off', code:'OFF' }], tarifas:T }).sinDatos.length; } }
];

function autotest(tarifas){
  return ESCENARIOS.map(function(e){
    var obtuvo;
    try { obtuvo = e.hacer(tarifas || TARIFAS_2026); }
    catch (ex){ obtuvo = 'ERROR: ' + ex.message; }
    return { nombre: e.nombre, espera: e.espera, obtuvo: obtuvo, ok: obtuvo === e.espera };
  });
}

/* ─────────────── export ─────────────── */
var API = {
  REGLAS: REGLAS, TARIFAS_2026: TARIFAS_2026, DIETA_NAC: DIETA_NAC,
  COD_DIA_LIBRE: COD_DIA_LIBRE, COD_NO_LIBRE: COD_NO_LIBRE,
  COD_VACACIONES: COD_VACACIONES,
  hm: hm, hhmm: hhmm, diaAntes: diaAntes, aLocal: aLocal, zUtc: zUtc,
  finActividad: finActividad, esDiaLibre: esDiaLibre, franjaDe: franjaDe,
  buscaLogbook: buscaLogbook,
  DEBRIEF_MAX_TRAS_CALZOS: DEBRIEF_MAX_TRAS_CALZOS,
  detectar: detectar, ESCENARIOS: ESCENARIOS, autotest: autotest
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.DiaLibre = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
