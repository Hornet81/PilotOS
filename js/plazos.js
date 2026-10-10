/* ═══════════════════════════════════════════════════════════════════════════
   PLAZOS — ROFF, vacaciones, XOFF y reducciones de jornada

   Las fechas viven en Supabase (`plazos_reglas`, migración 0002) como REGLAS
   que se repiten cada mes o cada año, no como fechas sueltas: si un plazo
   cambia se edita una fila y todas las apps lo leen. Este módulo es lo ÚNICO
   que convierte una regla en fechas concretas, y lo cargan la app, el servidor
   y los bancos (UMD, como `roster-changes.js`). Una segunda forma de calcularlo
   —en SQL, o copiada en otra pantalla— acabaría diciendo otra fecha.

   ⚠ REGLAS_DEFECTO es la COPIA de lo que hay en la tabla, y no es un adorno:
     · sin cobertura la app tiene que seguir avisando;
     · y en beta, una ruta nueva del backend nace rota hasta producción.
   Cuando la tabla contesta, manda la tabla. El banco `plazos-test` compara
   esta copia con la migración fila a fila: si se separan, sale rojo.

   ⚠ EL CIERRE ALEATORIO DEL ROFF. Vueling Crew cierra la puja a una hora
   aleatoria entre las 12:00 del día 11 y las 10:00 del día 12. El plazo ÚTIL
   es el PRIMERO de los dos: pasado ese momento puede estar cerrada ya. Por eso
   cada ocurrencia lleva `cierra` (lo que hay que cumplir) y `fin` (cuándo es
   seguro que ya ha cerrado), y los textos dicen las dos cosas con la palabra
   «aleatorio». Avisar del día 12 es hacerle perder la puja a alguien.
   (El convenio dice 10 y 11; el piloto confirmó el 10-oct-2026 que la web de
   la compañía dice 11 y 12, y que el convenio está mal. Por eso esa regla va
   sin referencia.)

   ⚠ HORAS EN HORA LOCAL DE `tz` (Europe/Madrid). Se pasan a instante con la
   doble pasada de siempre para los saltos de horario; el `Intl.DateTimeFormat`
   se construye UNA vez por huso — construirlo por llamada costó 39.120
   construcciones por render en Gastos (Beta.708).
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plazos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = 'IV Convenio · Art. ';
  /* Mismo orden de columnas que el INSERT de la migración. */
  function R(id, tipo, clase, titulo, detalle, recurrencia, objetivo_meses,
             abre_mes, abre_dia, abre_hora, cierra_mes, cierra_dia, cierra_hora,
             aleatorio_hasta_dia, aleatorio_hasta_hora, excluir, audiencia, fuente, orden, activo) {
    return { id: id, tipo: tipo, clase: clase, titulo: titulo, detalle: detalle,
      recurrencia: recurrencia, objetivo_meses: objetivo_meses,
      abre_mes: abre_mes, abre_dia: abre_dia, abre_hora: abre_hora,
      cierra_mes: cierra_mes, cierra_dia: cierra_dia, cierra_hora: cierra_hora,
      aleatorio_hasta_dia: aleatorio_hasta_dia, aleatorio_hasta_hora: aleatorio_hasta_hora,
      excluir_meses_objetivo: excluir, audiencia: audiencia, tz: 'Europe/Madrid',
      fuente: fuente, orden: orden, activo: activo,
      vigente_desde: '2025-01-01', vigente_hasta: null };
  }
  var FAM = { reduccion: ['familiar'] };
  var REGLAS_DEFECTO = [
    R('roff_puja','roff','ventana','Puja de ROFF · {mes}',
      'Se puede pujar hasta una hora aleatoria entre las 12:00 del día 11 y las 10:00 del día 12, dos meses antes del mes de disfrute.',
      'mensual',2, null,5,'00:00', null,11,'12:00', 12,'10:00', [], {}, null, 10, true),
    R('xoff_preferencias','xoff','ventana','Preferencias de XOFF',
      'Comunica tus preferencias para los periodos de Navidad en Vueling Crew.',
      'anual',0, 9,15,'00:00', 9,30,'23:59', null,null, [], { patron: 'libre' }, C + '12.2.1', 20, true),
    R('xoff_publicacion','xoff','hito','La compañía comunica los XOFF',
      null,'anual',0, null,null,null, 10,5,'00:00', null,null, [], { patron: 'libre' }, C + '12.2.1', 21, true),
    R('vac_ronda1','vacaciones','ventana','Vacaciones · 1.ª ronda',
      'Inserta en CREW los periodos de vacaciones del año siguiente.',
      'anual',0, 10,1,'00:00', 10,10,'23:59', null,null, [], {}, C + '12.11.3', 30, true),
    R('vac_ronda2','vacaciones','ventana','Vacaciones · 2.ª ronda',
      'Inserta en CREW los periodos para la segunda asignación.',
      'anual',0, 10,13,'00:00', 10,21,'23:59', null,null, [], {}, C + '12.11.3', 31, true),
    R('vac_asignacion','vacaciones','hito','Publicación de las vacaciones asignadas',
      null,'anual',0, null,null,null, 11,1,'00:00', null,null, [], {}, C + '12.11.4', 32, true),
    R('vac_dia31','vacaciones','ventana','Vacaciones · pedir el día 31',
      'Comunica por escrito a la oficina del piloto si quieres desplazar un bloque al día 31.',
      'anual',0, 11,1,'00:00', 11,10,'23:59', null,null, [], {}, C + '12.11.1', 33, true),
    R('vac_descuento_enero','vacaciones','ventana','Fechas de descuento de enero',
      'Elige qué días libres de enero pasan a ser de trabajo por tus vacaciones.',
      'anual',0, 11,1,'00:00', 11,5,'23:59', null,null, [], { patron: 'fijo' }, C + '12.11.1', 34, true),
    R('redfam_pct_febmay','reduccion','limite','Reducción familiar · solicitar % de feb–may',
      'Para febrero–mayo del año siguiente.','anual',0, null,null,null, 5,31,'23:59', null,null, [], FAM, C + '5.11.1', 40, true),
    R('redfam_pct_junsep','reduccion','limite','Reducción familiar · solicitar % de jun–sep',
      'Para junio–septiembre del año siguiente.','anual',0, null,null,null, 9,30,'23:59', null,null, [], FAM, C + '5.11.1', 41, true),
    R('redfam_pct_octene','reduccion','limite','Reducción familiar · solicitar % de oct–ene',
      'Para octubre–enero de este año.','anual',0, null,null,null, 1,31,'23:59', null,null, [], FAM, C + '5.11.1', 42, true),
    R('redfam_var_febmay','reduccion','limite','Reducción familiar · variar o cancelar feb–may',
      'Una sola vez por cuatrimestre.','anual',0, null,null,null, 9,30,'23:59', null,null, [], FAM, C + '5.11.6', 43, true),
    R('redfam_var_junsep','reduccion','limite','Reducción familiar · variar o cancelar jun–sep',
      'Una sola vez por cuatrimestre.','anual',0, null,null,null, 1,31,'23:59', null,null, [], FAM, C + '5.11.6', 44, true),
    R('redfam_var_octene','reduccion','limite','Reducción familiar · variar o cancelar oct–ene',
      'Una sola vez por cuatrimestre.','anual',0, null,null,null, 5,31,'23:59', null,null, [], FAM, C + '5.11.6', 45, true),
    R('redfam_baja_febmay','reduccion','ventana','Reducción familiar · bajar el % de feb–may',
      'Al porcentaje inmediato inferior, una vez por periodo.','anual',0, 10,1,'00:00', 11,15,'23:59', null,null, [], FAM, C + '5.11.7', 46, true),
    R('redfam_baja_junsep','reduccion','ventana','Reducción familiar · bajar el % de jun–sep',
      'Al porcentaje inmediato inferior, una vez por periodo.','anual',0, 2,1,'00:00', 3,15,'23:59', null,null, [], FAM, C + '5.11.7', 47, true),
    R('redfam_baja_octene','reduccion','ventana','Reducción familiar · bajar el % de oct–ene',
      'Al porcentaje inmediato inferior, una vez por periodo.','anual',0, 6,1,'00:00', 8,15,'23:59', null,null, [], FAM, C + '5.11.7', 48, true),
    R('redfam_fechas','reduccion','limite','Reducción familiar · fechas de {mes}',
      'Elige tu bloque de reducción: como muy tarde el último día del tercer mes anterior.',
      'mensual',3, null,null,null, null,-1,'23:59', null,null, [12, 1], FAM, C + '5.11.1', 49, true),
    R('redfam_fechas_dicene','reduccion','limite','Reducción familiar · fechas de diciembre y enero',
      'Antes del 30 de septiembre, para poder asignar los XOFF.','anual',0, null,null,null, 9,29,'23:59', null,null, [], FAM, C + '5.11.1', 50, true),
    R('red_hijos16','reduccion','limite','Reducción por hijos de 12 a 16 años · solicitud',
      'Antes del 10 de septiembre, para todo el año siguiente.','anual',0, null,null,null, 9,9,'23:59', null,null, [], { reduccion: ['hijos16'] }, C + '5.12', 60, true),
    R('red_mayores55','reduccion','limite','Reducción para mayores de 55 · solicitud o cambio',
      'Antes del 20 de agosto. Se puede pedir por primera vez el año en que cumples 54.','anual',0, null,null,null, 8,19,'23:59', null,null, [], { reduccion: ['mayores55'], edad_min_en_anio: 54 }, C + '5.16', 61, true),
    R('red_mayores55_conf','reduccion','hito','Reducción para mayores de 55 · confirmación',
      'La compañía confirma antes del 1 de septiembre.','anual',0, null,null,null, 8,31,'23:59', null,null, [], { reduccion: ['mayores55'], edad_min_en_anio: 54 }, C + '5.16', 62, true),
    R('red_anual','reduccion','limite','Reducción de jornada anual · solicitud',
      'Antes del 10 de septiembre, para todo el año siguiente.','anual',0, null,null,null, 9,9,'23:59', null,null, [], { reduccion: ['anual'] }, C + '5.17', 63, true),
    R('patron_fijo_abr','patron','ventana','Vacantes de patrón fijo · 1.er proceso',
      'Asignación antes del 25 de abril; empieza el 1 de julio.','anual',0, 4,1,'00:00', 4,15,'23:59', null,null, [], {}, C + '12.2.2', 70, false),
    R('patron_fijo_sep','patron','ventana','Vacantes de patrón fijo · 2.º proceso',
      'Asignación antes del 25 de septiembre; empieza el 1 de febrero.','anual',0, 9,1,'00:00', 9,15,'23:59', null,null, [], {}, C + '12.2.2', 71, false),
    R('estac_venta_libres','estacionalidad','ventana','Venta de días libres de verano',
      'Ofrece hasta dos días libres al mes de junio a septiembre del año siguiente.','anual',0, 8,1,'00:00', 9,5,'23:59', null,null, [], {}, C + '8.1.2.1', 80, false),
    R('estac_medidas_otono','estacionalidad','ventana','Medidas voluntarias de estacionalidad',
      'Para el año siguiente.','anual',0, 9,26,'00:00', 10,5,'23:59', null,null, [], {}, C + '8.5.1', 81, false),
    R('estac_medidas_junio','estacionalidad','ventana','Medidas voluntarias · noviembre y diciembre',
      null,'anual',0, 6,6,'00:00', 6,15,'23:59', null,null, [], {}, C + '8.5.2', 82, false)
  ];

  /* Los textos en inglés van AQUÍ y no en el diccionario de i18n: el título
     lleva el mes dentro («Puja de ROFF · diciembre»), así que no hay clave
     exacta posible, y una palabra suelta como clave es GLOBAL. Una regla nueva
     de la tabla sin entrada aquí sale en castellano — dicho, no inventado. */
  var EN = {
    roff_puja: ['ROFF bidding · {mes}', 'Bidding closes at a random time between 12:00 on the 11th and 10:00 on the 12th, two months before the month you want off.'],
    xoff_preferencias: ['XOFF preferences', 'Send your Christmas period preferences in Vueling Crew.'],
    xoff_publicacion: ['The company publishes the XOFF', null],
    vac_ronda1: ['Leave · 1st round', 'Enter next year’s leave periods in CREW.'],
    vac_ronda2: ['Leave · 2nd round', 'Enter your periods for the second allocation.'],
    vac_asignacion: ['Leave allocation published', null],
    vac_dia31: ['Leave · request the 31st', 'Tell the pilot office in writing if you want a block moved to the 31st.'],
    vac_descuento_enero: ['January offset days', 'Choose which January days off become work days because of your leave.'],
    redfam_pct_febmay: ['Family reduction · request % for Feb–May', 'For February–May next year.'],
    redfam_pct_junsep: ['Family reduction · request % for Jun–Sep', 'For June–September next year.'],
    redfam_pct_octene: ['Family reduction · request % for Oct–Jan', 'For October–January this year.'],
    redfam_var_febmay: ['Family reduction · change or cancel Feb–May', 'Once per four-month period.'],
    redfam_var_junsep: ['Family reduction · change or cancel Jun–Sep', 'Once per four-month period.'],
    redfam_var_octene: ['Family reduction · change or cancel Oct–Jan', 'Once per four-month period.'],
    redfam_baja_febmay: ['Family reduction · lower the % for Feb–May', 'To the next lower percentage, once per period.'],
    redfam_baja_junsep: ['Family reduction · lower the % for Jun–Sep', 'To the next lower percentage, once per period.'],
    redfam_baja_octene: ['Family reduction · lower the % for Oct–Jan', 'To the next lower percentage, once per period.'],
    redfam_fechas: ['Family reduction · dates for {mes}', 'Choose your reduction block: by the last day of the third month before.'],
    redfam_fechas_dicene: ['Family reduction · December and January dates', 'Before 30 September, so the XOFF can be allocated.'],
    red_hijos16: ['Reduction for children aged 12–16 · request', 'Before 10 September, for the whole of next year.'],
    red_mayores55: ['Over-55 reduction · request or change', 'Before 20 August. First possible in the year you turn 54.'],
    red_mayores55_conf: ['Over-55 reduction · confirmation', 'The company confirms before 1 September.'],
    red_anual: ['Annual reduction · request', 'Before 10 September, for the whole of next year.'],
    patron_fijo_abr: ['Fixed pattern vacancies · 1st round', 'Allocated before 25 April; starts 1 July.'],
    patron_fijo_sep: ['Fixed pattern vacancies · 2nd round', 'Allocated before 25 September; starts 1 February.'],
    estac_venta_libres: ['Summer days-off sale', 'Offer up to two days off a month for June–September next year.'],
    estac_medidas_otono: ['Voluntary seasonality measures', 'For next year.'],
    estac_medidas_junio: ['Voluntary measures · November and December', null]
  };
  var MESES = {
    es: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
    en: ['January','February','March','April','May','June','July','August','September','October','November','December']
  };

  // ── Hora local ⇄ instante ───────────────────────────────────────────────
  var _dtf = {};
  function _dtfDe(tz) {
    if (!_dtf[tz]) _dtf[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return _dtf[tz];
  }
  /* Minutos que el huso va por delante de UTC en ese instante. */
  function offsetMin(ms, tz) {
    var p = {};
    _dtfDe(tz).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((comoUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  /* Doble pasada: la primera estimación puede caer al otro lado de un cambio
     de hora; la segunda usa el desfase del instante bueno. */
  function localAMs(y, m, d, hora, tz) {
    var hm = String(hora || '00:00').split(':');
    var g = Date.UTC(y, m - 1, d, +hm[0] || 0, +hm[1] || 0);
    var t = g - offsetMin(g, tz) * 60000;
    return g - offsetMin(t, tz) * 60000;
  }
  function diasMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function sumaMes(y, m, n) { var i = y * 12 + (m - 1) + n; return { y: Math.floor(i / 12), m: (i % 12) + 1 }; }
  function dia(y, m, d) { return d === -1 ? diasMes(y, m) : Math.min(d, diasMes(y, m)); }
  function ym(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }
  function hhmm(h) { return String(h || '00:00').slice(0, 5); }

  // ── A quién afecta una regla ───────────────────────────────────────────
  /* Lo que el piloto NO ha dicho no excluye: sin patrón en el perfil se le
     avisa de los XOFF igual, porque callarlos sería decidir por él. Lo que SÍ
     exige un dato es la reducción: avisar a todos de cada plazo de reducción
     es el ruido que hace que se dejen de leer los avisos. */
  function aplica(regla, perfil) {
    var a = regla.audiencia || {}, p = perfil || {};
    if (a.patron && p.patron && p.patron !== a.patron) return false;
    if (a.reduccion && a.reduccion.length) {
      var mias = p.reducciones || [];
      if (!a.reduccion.some(function (r) { return mias.indexOf(r) >= 0; })) return false;
    }
    if (a.edad_min_en_anio && p.anioNac && p.anio && (p.anio - p.anioNac) < a.edad_min_en_anio) return false;
    return true;
  }

  function vigente(regla, ms) {
    var d = new Date(ms).toISOString().slice(0, 10);
    if (regla.vigente_desde && d < String(regla.vigente_desde).slice(0, 10)) return false;
    if (regla.vigente_hasta && d > String(regla.vigente_hasta).slice(0, 10)) return false;
    return true;
  }

  /* Una ocurrencia = una regla en un mes (mensual) o en un año (anual).
     `clave` es ESTABLE —regla + ocurrencia— porque es lo que se marca como
     hecho y como visto: un id que cambia hace que un aviso vuelva solo. */
  function construye(regla, y, m, exc) {
    var tz = regla.tz || 'Europe/Madrid', occ, abreMs = null, cierraMs, aleaMs = null, objetivo = null;
    if (regla.recurrencia === 'mensual') {
      var o = sumaMes(y, m, regla.objetivo_meses || 0);
      if ((regla.excluir_meses_objetivo || []).indexOf(o.m) >= 0) return null;
      objetivo = ym(o.y, o.m);
      occ = ym(y, m);
      if (regla.abre_dia != null) abreMs = localAMs(y, m, dia(y, m, regla.abre_dia), regla.abre_hora, tz);
      cierraMs = localAMs(y, m, dia(y, m, regla.cierra_dia), regla.cierra_hora, tz);
      if (regla.aleatorio_hasta_dia != null) aleaMs = localAMs(y, m, dia(y, m, regla.aleatorio_hasta_dia), regla.aleatorio_hasta_hora, tz);
    } else {
      occ = String(y);
      var cm = regla.cierra_mes;
      cierraMs = localAMs(y, cm, dia(y, cm, regla.cierra_dia), regla.cierra_hora, tz);
      if (regla.abre_mes != null && regla.abre_dia != null) {
        var ay = regla.abre_mes > cm ? y - 1 : y;          // una ventana que cruza el año
        abreMs = localAMs(ay, regla.abre_mes, dia(ay, regla.abre_mes, regla.abre_dia), regla.abre_hora, tz);
      }
      if (regla.aleatorio_hasta_dia != null) aleaMs = localAMs(y, cm, dia(y, cm, regla.aleatorio_hasta_dia), regla.aleatorio_hasta_hora, tz);
    }
    var x = exc && exc[regla.id + '|' + occ];
    if (x) {
      if (x.cancelado) return null;
      if (x.abre) abreMs = Date.parse(x.abre);
      if (x.cierra) cierraMs = Date.parse(x.cierra);
      if (x.aleatorio_hasta) aleaMs = Date.parse(x.aleatorio_hasta);
    }
    if (regla.clase !== 'ventana') abreMs = null;
    return {
      clave: regla.id + ':' + occ, regla: regla.id, ocurrencia: occ,
      tipo: regla.tipo, clase: regla.clase, orden: regla.orden || 100,
      titulo: regla.titulo, detalle: regla.detalle || '', fuente: regla.fuente || '',
      objetivo: objetivo, tz: tz,
      abre: abreMs, cierra: cierraMs,
      aleatorio: aleaMs != null,
      fin: aleaMs != null ? aleaMs : cierraMs,
      cierraHora: hhmm(regla.cierra_hora), finHora: aleaMs != null ? hhmm(regla.aleatorio_hasta_hora) : null
    };
  }

  /* Todas las ocurrencias que tocan [desde, hasta]. */
  function ocurrencias(reglas, opts) {
    opts = opts || {};
    var desde = opts.desde, hasta = opts.hasta;
    var perfil = opts.perfil || null, tipos = opts.tipos || null;
    var exc = {};
    (opts.excepciones || []).forEach(function (e) { exc[e.regla_id + '|' + e.ocurrencia] = e; });
    var d0 = new Date(desde), d1 = new Date(hasta), out = [];
    (reglas || REGLAS_DEFECTO).forEach(function (r) {
      if (!r || r.activo === false) return;
      if (tipos && tipos[r.tipo] === false) return;
      if (perfil && !aplica(r, Object.assign({ anio: d0.getUTCFullYear() }, perfil))) return;
      var cand = [];
      if (r.recurrencia === 'mensual') {
        for (var i = -2; ; i++) {
          var p = sumaMes(d0.getUTCFullYear(), d0.getUTCMonth() + 1, i);
          if (p.y * 12 + p.m > d1.getUTCFullYear() * 12 + d1.getUTCMonth() + 2) break;
          cand.push(construye(r, p.y, p.m, exc));
        }
      } else {
        for (var y = d0.getUTCFullYear() - 1; y <= d1.getUTCFullYear() + 1; y++) cand.push(construye(r, y, 0, exc));
      }
      cand.forEach(function (o) {
        if (!o || !vigente(r, o.cierra)) return;
        var ini = o.abre != null ? o.abre : o.cierra;
        if (o.fin < desde || ini > hasta) return;
        out.push(o);
      });
    });
    out.sort(function (a, b) { return (a.cierra - b.cierra) || (a.orden - b.orden); });
    return out;
  }

  /* 'proximo'   · aún no abre (o el hito aún no ha llegado)
     'abierto'   · se puede hacer
     'aleatorio' · pasado el primer momento del cierre aleatorio: PUEDE estar cerrado ya
     'cerrado'   · terminado                                                       */
  function estado(o, ahora) {
    if (o.clase === 'hito') return ahora < o.cierra ? 'proximo' : 'cerrado';
    if (o.abre != null && ahora < o.abre) return 'proximo';
    if (ahora < o.cierra) return 'abierto';
    if (o.aleatorio && ahora < o.fin) return 'aleatorio';
    return 'cerrado';
  }

  // ── Textos ──────────────────────────────────────────────────────────────
  function _lang(l) { return l === 'en' ? 'en' : 'es'; }
  function partes(ms, tz) {
    var p = {};
    _dtfDe(tz || 'Europe/Madrid').formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: p.hour === '24' ? '00' : p.hour, mi: p.minute };
  }
  function fechaCorta(ms, lang, tz) {
    var p = partes(ms, tz), L = _lang(lang);
    return L === 'en' ? p.d + ' ' + MESES.en[p.m - 1].slice(0, 3) : p.d + ' ' + MESES.es[p.m - 1].slice(0, 3);
  }
  function hora(ms, tz) { var p = partes(ms, tz); return p.h + ':' + p.mi; }
  function nombreMes(objetivo, lang, refMs, tz) {
    if (!objetivo) return '';
    var y = +objetivo.slice(0, 4), m = +objetivo.slice(5, 7), L = _lang(lang);
    var s = MESES[L][m - 1];
    if (refMs != null && partes(refMs, tz).y !== y) s += ' ' + y;
    return s;
  }
  function titulo(o, lang) {
    var L = _lang(lang), t = (L === 'en' && EN[o.regla]) ? EN[o.regla][0] : o.titulo;
    return String(t || '').replace('{mes}', nombreMes(o.objetivo, L, o.cierra, o.tz));
  }
  function detalle(o, lang) {
    var L = _lang(lang);
    if (L === 'en' && EN[o.regla]) return EN[o.regla][1] || '';
    return o.detalle || '';
  }
  /* La línea que dice CUÁNDO, con el cierre aleatorio dicho siempre con la
     palabra y con sus dos extremos. */
  function cuando(o, ahora, lang) {
    var L = _lang(lang), en = L === 'en', tz = o.tz;
    var hoy = partes(ahora, tz), man = partes(ahora + 864e5, tz);
    var igual = function (a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; };
    /* «de hoy» · «de mañana» · «del 12 oct» — el día dicho como se dice. */
    var de = function (ms) {
      var p = partes(ms, tz);
      if (igual(p, hoy)) return en ? 'today' : 'de hoy';
      if (igual(p, man)) return en ? 'tomorrow' : 'de mañana';
      return (en ? 'on ' : 'del ') + fechaCorta(ms, L, tz);
    };
    var esHoy = igual(partes(o.cierra, tz), hoy), esMan = igual(partes(o.cierra, tz), man);
    var st = estado(o, ahora);
    if (o.clase === 'hito') return (en ? 'On ' : 'El ') + fechaCorta(o.cierra, L, tz);
    if (st === 'proximo' && o.abre != null)
      return (en ? 'Opens ' : 'Abre ') + (igual(partes(o.abre, tz), man) ? (en ? 'tomorrow' : 'mañana') : (en ? 'on ' : 'el ') + fechaCorta(o.abre, L, tz)) +
        (o.aleatorio ? (en ? ' · random close from ' : ' · cierre aleatorio desde el ') + fechaCorta(o.cierra, L, tz) : '');
    if (o.aleatorio) {
      if (st === 'aleatorio') return en
        ? 'Random close: it may already be closed (it will be by ' + o.finHora + ' ' + de(o.fin) + ')'
        : 'Cierre aleatorio: puede estar cerrado ya (lo estará seguro a las ' + o.finHora + ' ' + de(o.fin) + ')';
      if (st === 'cerrado') return en ? 'Closed' : 'Cerrado';
      return en
        ? 'Random close between ' + o.cierraHora + ' ' + de(o.cierra) + ' and ' + o.finHora + ' ' + de(o.fin) + '. Bid before ' + o.cierraHora + ' ' + de(o.cierra) + '.'
        : 'Cierre aleatorio entre las ' + o.cierraHora + ' ' + de(o.cierra) + ' y las ' + o.finHora + ' ' + de(o.fin) + '. Puja antes de las ' + o.cierraHora + ' ' + de(o.cierra) + '.';
    }
    if (st === 'cerrado') return (en ? 'Closed on ' : 'Cerró el ') + fechaCorta(o.cierra, L, tz);
    var hh = o.cierraHora === '23:59' ? '' : (en ? ' at ' : ' a las ') + o.cierraHora;
    if (esHoy) return (en ? 'Closes today' : 'Cierra hoy') + hh;
    if (esMan) return (en ? 'Closes tomorrow' : 'Cierra mañana') + hh;
    return (en ? 'Until ' : 'Hasta el ') + fechaCorta(o.cierra, L, tz) + hh;
  }
  /* Cuenta atrás hasta el plazo ÚTIL (cierra), o hasta que abre. */
  function falta(o, ahora) {
    var st = estado(o, ahora);
    var obj = st === 'proximo' ? (o.abre != null ? o.abre : o.cierra) : o.cierra;
    var ms = Math.max(0, obj - ahora);
    return { ms: ms, d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
  }
  function cuentaTxt(o, ahora, lang) {
    var f = falta(o, ahora), en = _lang(lang) === 'en';
    if (f.d >= 2) return f.d + (en ? ' days' : ' días');
    if (f.d === 1) return (en ? '1 day ' : '1 día ') + f.h + ' h';
    if (f.h >= 1) return f.h + ' h ' + f.m + ' min';
    return f.m + ' min';
  }
  /* Cuánto del plazo ha pasado (0–1), para la barra. */
  function progreso(o, ahora) {
    if (o.abre == null) return null;
    var t = (ahora - o.abre) / Math.max(1, o.cierra - o.abre);
    return Math.max(0, Math.min(1, t));
  }

  /* ── Qué aviso toca AHORA de una ocurrencia (la app cerrada: push y email) ──
     Vive aquí, y no en el servidor, para que la campana de la app y el móvil
     bloqueado digan lo mismo: un plazo «urge» exactamente cuando la tarjeta de
     la app se pone roja. Dos criterios para la misma pregunta acabarían
     discrepando (ES_AIRPORTS / ES_IATA).
       'abre' · está abierto (o, si no tiene apertura, cierra en ≤ 45 días)
       'urge' · últimas 48 h antes del PRIMER momento del cierre
       null   · nada que avisar (próximo, cerrado, hito, o ya en el aleatorio:
                ahí puede estar cerrado y avisar «corre» sería mentir)        */
  var URGE_MS = 48 * 36e5, AHORA_LIMITE_MS = 45 * 864e5;
  function fase(o, ahora) {
    if (o.clase === 'hito') return null;
    if (estado(o, ahora) !== 'abierto') return null;
    var queda = o.cierra - ahora;
    if (queda < URGE_MS) return 'urge';
    if (o.abre == null && queda > AHORA_LIMITE_MS) return null;
    return 'abre';
  }

  return {
    REGLAS_DEFECTO: REGLAS_DEFECTO, EN: EN, URGE_MS: URGE_MS, AHORA_LIMITE_MS: AHORA_LIMITE_MS, fase: fase,
    ocurrencias: ocurrencias, estado: estado, aplica: aplica,
    titulo: titulo, detalle: detalle, cuando: cuando, falta: falta, cuentaTxt: cuentaTxt, progreso: progreso,
    fechaCorta: fechaCorta, hora: hora, localAMs: localAMs, offsetMin: offsetMin
  };
});
