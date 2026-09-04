/* ══════════════════════════════════════════════════════════════════════════
   NOTAS DE GASTO — motor de reglas (puro, sin dependencias)
   Spec: "Notas de gasto\NOTAS-DE-GASTO-SPEC.md"

   Diseñado para portarse tal cual a index.html (var/function, sin ES modules).
   Todo lo específico de la compañía vive en VY_RULES → un JSON por aerolínea.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* ─────────────── 1. RULESET (esto es lo único que cambia por aerolínea) ─────────────── */

var VY_RULES = {
  airline: 'VY',
  currency: 'EUR',
  claimDeadlineDays: 90,
  portal: { url: 'le-workflowsrrhh-spa.vueling.app', maxReceiptsPerNote: 5 },

  // 'day' = art. 15.18 (cualquier despegue/aterrizaje del día en el extranjero
  // hace internacional TODO el día). 'sector' = solo el tramo implicado.
  scopeBasis: 'day',

  // Art. 10.1 IV Convenio — "en actividad, en todo o en parte" → basta 1 minuto.
  // from/to en minutos desde medianoche, hora LOCAL.
  slots: [
    { id: 'breakfast', label: 'Desayuno',   from:  6 * 60, to: 10 * 60,
      portal: { nat: 'National breakfast',        int: 'International breakfast' },
      items: ['1 fruta o yogurt', '1 sándwich o equivalente', '1 croissant o bollería'],
      principal: ['1 sándwich o equivalente'] },
    { id: 'lunch',     label: 'Comida',     from: 13 * 60, to: 15 * 60,
      portal: { nat: 'National lunch',            int: 'International lunch' },
      items: ['1.º ensalada', '2.º plato caliente', 'postre', 'pan'],
      principal: ['1.º ensalada', '2.º plato caliente'] },
    { id: 'dinner',    label: 'Cena',       from: 20 * 60, to: 22 * 60 + 30,
      portal: { nat: 'National dinner',           int: 'International dinner' },
      items: ['1.º ensalada', '2.º plato caliente', 'postre', 'pan'],
      principal: ['1.º ensalada', '2.º plato caliente'] },
    { id: 'night',     label: 'Refrigerio', from:  0,      to:  5 * 60,
      portal: { nat: 'National late-night snack', int: 'International late-night snack' },
      items: ['1 snack frío', '1 sándwich o equivalente', '1 yogurt o fruta'],
      principal: ['1 sándwich o equivalente'] }
  ],

  // Topes — tabla oficial del Acuerdo Voucher (CONVENIO-IV).
  caps: {
    incident:  { nat: 23.21, int: 29.02 },   // Operational incidents
    position:  { nat: 23.21, int: 29.02 },   // Position Flight (misma fila en la tabla)
    oven:      { nat: 28.21, int: 34.02 },   // Inoperative oven
    voucher:   { std: 23.21, special: 34.82 } // ⚠️ el hotel NO distingue nac/int
  },

  // ⏳ PENDIENTE: lista real del Acuerdo Voucher. Provisional.
  specialCities: ['CDG', 'ORY', 'AMS', 'LHR', 'LGW'],

  // Ventana de fechas admitidas para el ticket, en días respecto al del gasto.
  ticketWindow: {
    incident_meal:  [0, 1],      // comida no cargada
    incident_coffee:[0],         // cafeteras inoperativas
    oven:           [-1, 0, 1],
    position:       [-1, 0, 1],
    voucher:        [-1, 0, 1]   // + todos los días de la línea
  },

  // Expense types del portal (nivel 1) → cómo los rellena la app.
  portalTypes: {
    incident: 'Operational incidents',   // requiere ISO number + Reason
    position: 'Position Flight',
    oven:     'Inoperative oven',
    voucher:  'Hotel Voucher'
  },
  reasons: ['Airport activity', 'Crew meal not loaded', 'Oven not working',
            'Flight delayed', 'AOG', 'Charter flight'],
  voucherSubtypes: ['Voucher Hotel', 'Voucher Especial', 'Voucher Incidence',
    'Split Duty normal', 'Split Duty especial', 'Standby normal', 'Standby especial',
    'Firma tarde Last Day normal', 'Firma tarde Last Day especial']
};

/* ─────────────── 2. Husos horarios ───────────────
   El roster da horas LOCALES de cada aeropuerto. Para comparar franjas entre
   aeropuertos de husos distintos hay que pasar por UTC. */

var TZ = {
  // España
  BCN:'Europe/Madrid', AGP:'Europe/Madrid', BIO:'Europe/Madrid', GRX:'Europe/Madrid',
  IBZ:'Europe/Madrid', LCG:'Europe/Madrid', LEI:'Europe/Madrid', MAH:'Europe/Madrid',
  OVD:'Europe/Madrid', PMI:'Europe/Madrid', RJL:'Europe/Madrid', SCQ:'Europe/Madrid',
  SDR:'Europe/Madrid', SVQ:'Europe/Madrid', XRY:'Europe/Madrid', MAD:'Europe/Madrid',
  VLC:'Europe/Madrid', ALC:'Europe/Madrid', VGO:'Europe/Madrid', ZAZ:'Europe/Madrid',
  // Canarias
  TFN:'Atlantic/Canary', TFS:'Atlantic/Canary', LPA:'Atlantic/Canary',
  FUE:'Atlantic/Canary', ACE:'Atlantic/Canary', SPC:'Atlantic/Canary',
  // Europa
  AMS:'Europe/Amsterdam', ATH:'Europe/Athens',   JTR:'Europe/Athens',
  BER:'Europe/Berlin',    DUS:'Europe/Berlin',   MUC:'Europe/Berlin', STR:'Europe/Berlin',
  HAM:'Europe/Berlin',    FRA:'Europe/Berlin',
  BLQ:'Europe/Rome',      BRI:'Europe/Rome',     GOA:'Europe/Rome',   MXP:'Europe/Rome',
  NAP:'Europe/Rome',      OLB:'Europe/Rome',     VCE:'Europe/Rome',   FCO:'Europe/Rome',
  CTA:'Europe/Rome',      PMO:'Europe/Rome',     FLR:'Europe/Rome',   PSA:'Europe/Rome',
  BOD:'Europe/Paris',     NCE:'Europe/Paris',    NTE:'Europe/Paris',  ORY:'Europe/Paris',
  CDG:'Europe/Paris',     MRS:'Europe/Paris',    TLS:'Europe/Paris',  LYS:'Europe/Paris',
  BRU:'Europe/Brussels',  CPH:'Europe/Copenhagen', GVA:'Europe/Zurich', ZRH:'Europe/Zurich',
  FAO:'Europe/Lisbon',    LIS:'Europe/Lisbon',   OPO:'Europe/Lisbon',
  LGW:'Europe/London',    LHR:'Europe/London',   LTN:'Europe/London',  MAN:'Europe/London',
  EDI:'Europe/London',    BHX:'Europe/London',   DUB:'Europe/Dublin',
  MLA:'Europe/Malta',     PRG:'Europe/Prague',   TIA:'Europe/Tirane',  VIE:'Europe/Vienna',
  WAW:'Europe/Warsaw',    OSL:'Europe/Oslo',     ARN:'Europe/Stockholm',
  // Norte de África
  RAK:'Africa/Casablanca', TNG:'Africa/Casablanca', CMN:'Africa/Casablanca',
  TUN:'Africa/Tunis',      ALG:'Africa/Algiers',    CAI:'Africa/Cairo'
};
var TZ_FALLBACK = 'Europe/Madrid';
function tzFor(iata) { return TZ[String(iata || '').toUpperCase()] || TZ_FALLBACK; }

/* Offset del huso (en minutos) para un instante UTC dado.

   ⚠️ El formateador se CACHEA por huso, y no es un adorno: construir un
   `Intl.DateTimeFormat` es de lo más caro que hace un motor de JS —carga los
   datos ICU del huso— y aquí se llamaba una vez por invocación, con
   `localToUTC` llamando DOS veces por la doble pasada del DST. Detectar los
   gastos de un histórico de 12 meses tardaba 3,2 s y el de 24, 8,9 s: la
   pestaña Gastos se quedaba clavada al abrirla y la app entera con ella,
   porque esto corre en el hilo principal. Con el formateador cacheado el
   resultado es idéntico —mismo objeto, mismas opciones— y el coste se paga
   una vez por huso. Los husos son ~50, así que el mapa no crece. */
var _DTF = {};
function _dtfDe(tz) {
  var f = _DTF[tz];
  if (!f) f = _DTF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return f;
}
function tzOffsetMin(utcMs, tz) {
  var parts = _dtfDe(tz).formatToParts(new Date(utcMs));
  var p = {};
  for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
  var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return (asUTC - utcMs) / 60000;
}
/* Hora local (y-m-d h:m en tz) → instante UTC. Doble pasada por los saltos de DST. */
function localToUTC(y, m, d, hh, mm, tz) {
  var guess = Date.UTC(y, m - 1, d, hh, mm);
  var off = tzOffsetMin(guess, tz);
  off = tzOffsetMin(guess - off * 60000, tz);
  return guess - off * 60000;
}
/* Instante UTC → {y,m,d,min} en la hora local de tz. */
function utcToLocal(utcMs, tz) {
  var off = tzOffsetMin(utcMs, tz);
  var t = new Date(utcMs + off * 60000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
           min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/* ─────────────── 3. Utilidades ─────────────── */

function hhmmToMin(s) {
  var m = /^(\d{1,2}):?(\d{2})$/.exec(String(s || '').trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function parseDate(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function addDays(dt, n) {
  var t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
function fmtDate(dt) {
  return dt.y + '-' + String(dt.m).padStart(2, '0') + '-' + String(dt.d).padStart(2, '0');
}
function fmtMin(min) {
  var m = ((min % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/* Aeropuerto español — mismo criterio que isSpanishAirport() del backend
   (server.js:842): IATA conocidos + ICAO que empiezan por LE, GC o GE. */
var ES_IATA = [
  // Península y Baleares (ICAO LE**)
  'ALC','LEI','OVD','ODB','BJZ','BCN','BIO','RGS','LCG','GRO','GRX','HSK',
  'IBZ','XRY','MJV','RMU','MAD','AGP','MAH','PMI','PNA','REU','SLM','EAS',
  'SDR','SCQ','SVQ','TOJ','VLC','VLL','VGO','VIT','ZAZ','LEN','CQM','RJL','MLC',
  // Canarias (GC**)
  'LPA','TFN','TFS','ACE','FUE','SPC','VDE','GMZ',
  // Ceuta y Melilla (GE**)
  'MLN',
];
function isSpanishAirport(a) {
  a = String(a || '').trim().toUpperCase();
  if (!a) return false;
  if (ES_IATA.indexOf(a) >= 0) return true;
  return /^(LE|GC|GE)[A-Z]{2}$/.test(a);
}

/* ─────────────── 4. Timeline de la jornada ───────────────
   ★ Las horas del roster son UTC (la app las etiqueta así: "14:10 – 15:55 UTC",
   y coincide con lo guardado en roster_entries). NO son locales de cada
   aeropuerto. Verificado con vuelos que cruzan huso: BCN→JTR 05:28-08:33 son
   3h05 en UTC — leídas como locales darían 2h05, imposible para Santorini.
   Esto simplifica: todo vive en un único reloj y solo hay que convertir a local
   para comparar contra las franjas.

   Devuelve segmentos [utcStart, utcEnd], cada uno con el huso del sitio donde
   está el piloto:
     · tierra antes del 1er vuelo  → huso del aeropuerto de salida
     · vuelo                        → huso del DESTINO ("donde vas a comer")
     · tierra en escala             → huso de la escala
     · tierra tras el último vuelo  → huso del aeropuerto de llegada */
function buildTimeline(day) {
  var segs = [], legs = day.legs || [], i;
  if (!legs.length) return segs;

  var dt0 = parseDate(day.date);
  function utcOn(min) { return Date.UTC(dt0.y, dt0.m - 1, dt0.d, Math.floor(min / 60), min % 60); }

  // El STA puede caer en el día siguiente (cruce de medianoche).
  var abs = legs.map(function (lg) {
    var std = hhmmToMin(lg.std), sta = hhmmToMin(lg.sta);
    if (std == null || sta == null) return null;
    var depUTC = utcOn(std), arrUTC = utcOn(sta);
    if (arrUTC < depUTC) arrUTC += 86400000;          // aterriza al día siguiente
    return { dep: lg.dep, arr: lg.arr, tzD: tzFor(lg.dep), tzA: tzFor(lg.arr),
             depUTC: depUTC, arrUTC: arrUTC,
             pos: !!(lg.positioning || lg.isPositioning ||
                     String(lg.dep || '').charAt(0) === '*' ||
                     String(lg.flightNum || '').charAt(0) === '*') };
  }).filter(Boolean);
  if (!abs.length) return segs;

  // ★ DÍA DE SERVICIO, no día natural. Los legs se ordenan por tiempo
  // transcurrido desde la FIRMA, nunca por hora de reloj: si no, una jornada
  // que cruza medianoche (firma 18:10, último vuelo a las 00:10) pone ese
  // vuelo el primero, arrastra la firma al día anterior y se inventa una
  // jornada de horas que no existió. Es el mismo fallo que ya se arregló en el
  // parser del roster (parseDayTokensJS, "midnight crossing").
  var ci = hhmmToMin(day.checkin);
  var anchor = ci != null ? utcOn(ci) : null;
  if (anchor != null) {
    abs.forEach(function (a) {
      while (a.depUTC < anchor) { a.depUTC += 86400000; a.arrUTC += 86400000; }
    });
  }
  abs.sort(function (a, b) { return a.depUTC - b.depUTC; });
  // Un leg posterior con depUTC anterior al arrUTC previo = otro día natural.
  for (i = 1; i < abs.length; i++) {
    while (abs[i].depUTC < abs[i - 1].arrUTC - 60000) {
      abs[i].depUTC += 86400000; abs[i].arrUTC += 86400000;
    }
  }

  if (anchor != null) {
    segs.push({ from: anchor, to: abs[0].depUTC, tz: abs[0].tzD, where: abs[0].dep,
                kind: 'ground', feeder: abs[0].pos ? 'self' : 'catering',
                apts: [abs[0].dep, abs[0].arr] });
  }

  for (i = 0; i < abs.length; i++) {
    segs.push({ from: abs[i].depUTC, to: abs[i].arrUTC, tz: abs[i].tzA, where: abs[i].arr,
                kind: 'flight', feeder: abs[i].pos ? 'self' : 'catering',
                apts: [abs[i].dep, abs[i].arr] });
    if (i + 1 < abs.length) {
      // Escala: quien te da de comer es el vuelo que viene después (si el
      // siguiente sector es posicional, en esa espera ya nadie te alimenta).
      segs.push({ from: abs[i].arrUTC, to: abs[i + 1].depUTC, tz: abs[i].tzA,
                  where: abs[i].arr, kind: 'ground',
                  feeder: abs[i + 1].pos ? 'self' : 'catering',
                  apts: [abs[i + 1].dep, abs[i + 1].arr] });
    }
  }

  // Debrief tras el último vuelo (20 min si el roster no lo trae).
  var last = abs[abs.length - 1];
  var db = hhmmToMin(day.debrief), endUTC;
  if (db != null) {
    endUTC = utcOn(db);
    while (endUTC < last.arrUTC) endUTC += 86400000;
  } else {
    endUTC = last.arrUTC + 20 * 60000;
  }
  segs.push({ from: last.arrUTC, to: endUTC, tz: last.tzA, where: last.arr,
              kind: 'ground', feeder: last.pos ? 'self' : 'catering',
              apts: [last.dep, last.arr] });
  return segs;
}

/* ─────────────── 5. Franjas invadidas ───────────────
   Art. 10.1: basta que la actividad solape la franja "en todo o en parte".
   Se evalúa en la hora local del sitio donde está el piloto (el huso del
   segmento), no en la de su base. */
function slotsInvaded(segs, rules) {
  rules = rules || VY_RULES;
  var hits = {};
  segs.forEach(function (sg) {
    if (!(sg.to > sg.from)) return;
    // Días locales que toca el segmento (uno o dos).
    var l0 = utcToLocal(sg.from, sg.tz), l1 = utcToLocal(sg.to, sg.tz);
    var days = [{ y: l0.y, m: l0.m, d: l0.d }];
    if (l1.d !== l0.d || l1.m !== l0.m) days.push({ y: l1.y, m: l1.m, d: l1.d });
    days.forEach(function (dd) {
      rules.slots.forEach(function (sl) {
        var a = localToUTC(dd.y, dd.m, dd.d, Math.floor(sl.from / 60), sl.from % 60, sg.tz);
        var b = localToUTC(dd.y, dd.m, dd.d, Math.floor(sl.to   / 60), sl.to   % 60, sg.tz);
        var ov = Math.min(sg.to, b) - Math.max(sg.from, a);
        if (ov <= 0) return;                                  // ni un minuto
        var key = sl.id + '@' + fmtDate(dd);
        var h = hits[key];
        if (!h) {
          h = hits[key] = { slot: sl.id, label: sl.label, date: fmtDate(dd),
            where: sg.where, tz: sg.tz, kind: sg.kind,
            localFrom: fmtMin(sl.from), localTo: fmtMin(sl.to),
            overlapMin: 0, self: false, catering: false,
            aptsSelf: [], aptsCatering: [] };
        }
        // ★ Quién te da de comer en esa franja. Si CUALQUIER trozo lo pagas tú
        // (esperando o volando de pasajero), la franja es reclamable: el
        // catering solo cubre lo que estás a bordo operando.
        // Los aeropuertos del sector implicado deciden el ÁMBITO de la línea:
        // el ámbito es del POSICIONAL, no del día (art. 15.18 rige la dieta).
        var bag = sg.feeder === 'self' ? h.aptsSelf : h.aptsCatering;
        (sg.apts || []).forEach(function (a) { if (a && bag.indexOf(a) < 0) bag.push(a); });
        if (sg.feeder === 'self') h.self = true; else h.catering = true;
        if (Math.round(ov / 60000) > h.overlapMin) {
          h.overlapMin = Math.round(ov / 60000);
          h.where = sg.where; h.tz = sg.tz; h.kind = sg.kind;
        }
      });
    });
  });
  return Object.keys(hits).map(function (k) { return hits[k]; })
    .sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 :
        VY_RULES.slots.findIndex(function (s) { return s.id === a.slot; }) -
        VY_RULES.slots.findIndex(function (s) { return s.id === b.slot; });
    });
}

/* ─────────────── 6. Ámbito nacional / internacional ───────────────
   Art. 15.18: internacional si CUALQUIER despegue o aterrizaje del día se
   produce en el extranjero. */
function dayScope(day) {
  var intl = (day.legs || []).some(function (lg) {
    return (lg.dep && !isSpanishAirport(lg.dep)) || (lg.arr && !isSpanishAirport(lg.arr));
  });
  return intl ? 'int' : 'nat';
}

/* ¿La ciudad de la pernocta está en la lista del Acuerdo Voucher? */
function isSpecialCity(city, rules) {
  rules = rules || VY_RULES;
  return rules.specialCities.indexOf(String(city || '').toUpperCase()) >= 0;
}

/* Hora LOCAL de la firma, en minutos desde medianoche (la del sitio donde firma).
   Sirve para "un voucher adicional por firma posterior a las 12:00 el último
   día de la línea". */
function reportLocalMin(segs) {
  if (!segs || !segs.length) return null;
  var s = segs[0];
  return utcToLocal(s.from, s.tz).min;
}

/* ─────────────── 7. Motor: derechos de un día ───────────────
   day = { date, checkin, debrief, legs:[{dep,arr,std,sta,positioning,flightNum}],
           layover:bool, layoverCity, incidents:[{type:'meal'|'coffee'|'oven', ...}] }
   Devuelve las NOTAS (una por incidencia/evento) con sus LÍNEAS (una por franja). */
function detectDay(day, opts) {
  opts = opts || {};
  var rules = opts.rules || VY_RULES;
  var segs  = buildTimeline(day);
  var slots = slotsInvaded(segs, rules);
  var scope = dayScope(day);
  var notes = [];

  var isPos = (day.legs || []).some(function (lg) {
    return !!(lg.positioning || lg.isPositioning ||
      String(lg.dep || '').charAt(0) === '*' || String(lg.flightNum || '').charAt(0) === '*');
  });

  // ★ Sólo son reclamables las franjas que el piloto se paga de su bolsillo
  // (feeder 'self': de pasajero o esperando un posicional). Las que pasa
  // operando las cubre el catering, y sólo dan nota si hubo INCIDENCIA.
  var claimable = slots.filter(function (s) { return s.self; });
  var byCatering = slots.filter(function (s) { return !s.self; });

  // ★ Si durmió en hotel, el DESAYUNO de esa mañana lo cubre el voucher de la
  // noche anterior — no se reclama aparte aunque lo pille ya de pasajero.
  var byHotel = [];
  if (day.hotelPrevNight) {
    byHotel = claimable.filter(function (s) { return s.slot === 'breakfast'; });
    claimable = claimable.filter(function (s) { return s.slot !== 'breakfast'; });
  }

  // ★ ÁMBITO: por defecto el del DÍA, no el del sector.
  // Art. 15.18: "cuando CUALQUIERA de los aterrizajes o despegues producidos EN
  // EL DÍA se realicen en territorio extranjero". Validado contra una nota REAL
  // pagada (NG-2026-065079, 22-jun-2026): el posicional era IBZ→BCN (nacional)
  // pero la jornada siguió a Túnez y la Compañía lo abonó como International
  // dinner. Configurable con rules.scopeBasis = 'sector' por si cambia.
  function scopeOf(apts) {
    return (apts || []).some(function (a) { return a && !isSpanishAirport(a); }) ? 'int' : 'nat';
  }
  function mkLines(kind, list, useCatering) {
    var cap = rules.caps[kind];
    return (list || claimable).map(function (s) {
      var sl = rules.slots.filter(function (x) { return x.id === s.slot; })[0];
      var apts = useCatering ? s.aptsCatering : s.aptsSelf;
      var sc = rules.scopeBasis === 'sector'
        ? scopeOf(apts.length ? apts : s.aptsSelf.concat(s.aptsCatering))
        : scope;   // 'day' (por defecto)
      return {
        date: s.date,
        portalSubtype: sl.portal[sc],
        slot: s.slot, slotLabel: s.label, where: s.where,
        scope: sc, apts: apts,
        window: s.localFrom + '–' + s.localTo + ' LT',
        overlapMin: s.overlapMin,
        cap: cap[sc],
        items: sl.items, principal: sl.principal
      };
    });
  }

  if (isPos && claimable.length) {
    notes.push({
      kind: 'position', portalType: rules.portalTypes.position,
      title: 'Posicional', auto: true, needsISO: false,
      ticketWindow: rules.ticketWindow.position,
      lines: mkLines('position'),
      maxTotal: +mkLines('position').reduce(function (a, l) { return a + l.cap; }, 0).toFixed(2)
    });
  }

  // La incidencia afecta a lo que NO te dieron a bordo: sus franjas son las que
  // cubría el catering (más las que ya te pagabas tú, si también fallaron).
  (day.incidents || []).forEach(function (inc) {
    var kind = inc.type === 'oven' ? 'oven' : 'incident';
    var scopeSlots = inc.slots
      ? slots.filter(function (s) { return inc.slots.indexOf(s.slot) >= 0; })
      : byCatering;
    var lines = mkLines(kind, scopeSlots, true);
    if (!lines.length) return;
    notes.push({
      kind: kind,
      // ★ el horno SIEMPRE por su propio expense type: 28,21 en vez de 23,21
      portalType: rules.portalTypes[kind],
      title: inc.type === 'oven' ? 'Horno inoperativo'
           : inc.type === 'coffee' ? 'Cafeteras inoperativas' : 'Comida no cargada',
      reason: inc.type === 'oven' ? 'Oven not working' : 'Crew meal not loaded',
      // El horno pide el mismo nº de ISO que la incidencia: es una avería técnica.
      auto: false, needsISO: kind === 'incident' || kind === 'oven',
      ticketWindow: inc.type === 'coffee' ? rules.ticketWindow.incident_coffee
                  : inc.type === 'oven'   ? rules.ticketWindow.oven
                  : rules.ticketWindow.incident_meal,
      onlyHotDrinks: inc.type === 'coffee',
      lines: lines,
      maxTotal: +lines.reduce(function (a, l) { return a + l.cap; }, 0).toFixed(2)
    });
  });

  // La pernocta NO emite nota aquí: los vouchers de una línea van en UNA sola
  // nota por la suma (guía, sección Voucher de hotel) → lo hace detectPeriod().
  var voucherNight = null;
  if (day.layover) {
    voucherNight = {
      date: day.date, city: day.layoverCity || null,
      special: isSpecialCity(day.layoverCity, rules)
    };
  }

  return { date: day.date, scope: scope, positioning: isPos, layover: !!day.layover,
           segments: segs, slots: slots, voucherNight: voucherNight,
           reportLocal: reportLocalMin(segs),
           coveredByCatering: byCatering.map(function (s) { return s.slot; }),
           coveredByVoucher: byHotel.map(function (s) { return s.slot; }),
           notes: notes };
}

/* ─────────────── 7-bis. Periodo completo: consolida las LÍNEAS ───────────────
   Una línea = racha de días seguidos durmiendo fuera de base. Todos sus
   vouchers van en UNA sola nota por la suma (guía, sección Voucher de hotel),
   con una línea por voucher y su subtipo del portal. */
function detectPeriod(days, opts) {
  opts = opts || {};
  var rules = opts.rules || VY_RULES;
  var results = days.map(function (d) { return detectDay(d, opts); });

  // Agrupar noches consecutivas fuera de base.
  var lines = [], cur = null;
  results.forEach(function (r, i) {
    if (r.voucherNight) {
      if (!cur) cur = { nights: [], startIdx: i };
      cur.nights.push(r.voucherNight);
      cur.endIdx = i;
    } else if (cur) {
      // El día en que vuelve a base cierra la línea: es su "último día".
      cur.lastDay = r; lines.push(cur); cur = null;
    }
  });
  if (cur) lines.push(cur);

  lines.forEach(function (ln) {
    var noteLines = ln.nights.map(function (n) {
      return { date: n.date, city: n.city,
        portalSubtype: n.special ? 'Voucher Especial' : 'Voucher Hotel',
        cap: n.special ? rules.caps.voucher.special : rules.caps.voucher.std };
    });

    // ★ +1 voucher si la firma del ÚLTIMO día de la línea es posterior a las
    // 12:00 hora local (te quedas en el hotel toda la mañana).
    var ld = ln.lastDay;
    if (ld && ld.reportLocal != null && ld.reportLocal >= 12 * 60) {
      var lastNight = ln.nights[ln.nights.length - 1];
      noteLines.push({ date: ld.date, city: lastNight.city, lateSignature: true,
        portalSubtype: 'Firma tarde Last Day ' + (lastNight.special ? 'especial' : 'normal'),
        cap: lastNight.special ? rules.caps.voucher.special : rules.caps.voucher.std });
    }

    var total = +noteLines.reduce(function (a, l) { return a + l.cap; }, 0).toFixed(2);
    var note = {
      kind: 'voucher', portalType: rules.portalTypes.voucher,
      title: 'Línea ' + noteLines[0].date + ' → ' + (ld ? ld.date : noteLines[noteLines.length - 1].date) +
             ' · ' + [].concat.apply([], ln.nights.map(function (n) { return n.city; }))
               .filter(function (v, i, a) { return v && a.indexOf(v) === i; }).join('/'),
      auto: true, needsISO: false, single: true,
      ticketWindow: rules.ticketWindow.voucher,
      vouchers: noteLines.length, lines: noteLines, maxTotal: total,
      receipts: packReceipts(noteLines.length, rules),
      note: 'Una única nota por la suma de todos los vouchers. El portal NO valida este tope.'
    };
    // Se cuelga del primer día de la línea.
    results[ln.startIdx].notes.push(note);
  });

  var all = [];
  results.forEach(function (r) { r.notes.forEach(function (n) { all.push({ date: r.date, note: n }); }); });
  return { days: results, lines: lines,
           total: +all.reduce(function (a, x) { return a + (x.note.maxTotal || 0); }, 0).toFixed(2),
           notes: all };
}

/* ─────────────── 8. Tickets ───────────────
   ★ Se pueden ACUMULAR varios tickets en la misma línea hasta llegar al tope.
   Por eso la unidad de validación es la LÍNEA con su bolsa de tickets, no el
   ticket suelto: el margen que queda es tope − suma de lo ya computable. */

/* Importe computable de UN ticket: solo productos alimenticios. El alcohol
   distinto de vino/cerveza de menú y lo no alimentario no suman. */
function computableOf(ticket) {
  return +(ticket.items || []).filter(function (it) { return it.food; })
    .reduce(function (a, it) { return a + (+it.amount || 0); }, 0).toFixed(2);
}

/* Un ticket suelto: fecha, imagen y plazo. No decide el importe — eso es de la línea. */
function checkTicket(line, ticket, rules) {
  rules = rules || VY_RULES;
  var out = [], ok = true;

  var d0 = parseDate(line.date), dt = parseDate(ticket.date);
  if (d0 && dt) {
    var diff = Math.round((Date.UTC(dt.y, dt.m - 1, dt.d) - Date.UTC(d0.y, d0.m - 1, d0.d)) / 86400000);
    var win = line.ticketWindow || [0];
    if (win.indexOf(diff) >= 0) out.push({ level: 'ok', msg: 'Fecha dentro de ventana (D' + (diff >= 0 ? '+' : '') + diff + ')' });
    else { ok = false; out.push({ level: 'error', msg: 'Fecha fuera de ventana: admite D' + win.join(', D') }); }
  }
  var food = computableOf(ticket);
  if (food < (+ticket.total || 0)) {
    out.push({ level: 'info', msg: 'Computable ' + food.toFixed(2) + ' € de ' + (+ticket.total || 0).toFixed(2) +
      ' € (excluido lo no alimentario y el alcohol fuera de menú)' });
  }
  if (food <= 0) { ok = false; out.push({ level: 'error', msg: 'Nada computable en este ticket' }); }
  if (!ticket.hasImage) { ok = false; out.push({ level: 'error', msg: 'Sin foto del ticket no se aprueba' }); }

  if (d0 && ticket.today) {
    var td = parseDate(ticket.today);
    var age = Math.round((Date.UTC(td.y, td.m - 1, td.d) - Date.UTC(d0.y, d0.m - 1, d0.d)) / 86400000);
    var left = rules.claimDeadlineDays - age;
    if (left < 0) { ok = false; out.push({ level: 'error', msg: 'Fuera del plazo de 3 meses' }); }
    else if (left <= 15) out.push({ level: 'warn', msg: 'Caduca en ' + left + ' días' });
  }
  return { ok: ok, computable: food, checks: out };
}

/* La línea con TODOS sus tickets acumulados. */
function validateLine(line, tickets, rules) {
  rules = rules || VY_RULES;
  tickets = tickets || [];
  var per = tickets.map(function (t) { return checkTicket(line, t, rules); });
  var valid = per.filter(function (p) { return p.ok; });
  var sum = +valid.reduce(function (a, p) { return a + p.computable; }, 0).toFixed(2);
  var claim = +Math.min(sum, line.cap).toFixed(2);
  var room = +(line.cap - claim).toFixed(2);

  var checks = [];
  if (!tickets.length) checks.push({ level: 'error', msg: 'Sin tickets adjuntos no se aprueba' });
  if (room > 0 && tickets.length) {
    checks.push({ level: 'info', msg: 'Te quedan ' + room.toFixed(2) + ' € de margen — puedes añadir otro ticket' });
  }
  if (sum > line.cap) {
    checks.push({ level: 'warn', msg: 'Los tickets suman ' + sum.toFixed(2) + ' €; el tope es ' +
      line.cap.toFixed(2) + ' € — reclamas el tope' });
  }
  if (room === 0 && tickets.length) checks.push({ level: 'ok', msg: 'Tope alcanzado' });

  return {
    ok: claim > 0 && valid.length === tickets.length && tickets.length > 0,
    claim: claim, computable: sum, cap: line.cap, room: room,
    tickets: per, checks: checks
  };
}

/* Reparto de los tickets de una nota en el límite de recibos del portal. */
function packReceipts(noteTicketCount, rules) {
  rules = rules || VY_RULES;
  var max = rules.portal.maxReceiptsPerNote;
  return { notesNeeded: Math.max(1, Math.ceil(noteTicketCount / max)), maxPerNote: max };
}

/* ─────────────── export ─────────────── */
var API = {
  VY_RULES: VY_RULES, tzFor: tzFor, localToUTC: localToUTC, utcToLocal: utcToLocal, tzOffsetMin: tzOffsetMin,
  isSpanishAirport: isSpanishAirport, buildTimeline: buildTimeline,
  slotsInvaded: slotsInvaded, dayScope: dayScope, detectDay: detectDay,
  detectPeriod: detectPeriod, isSpecialCity: isSpecialCity,
  computableOf: computableOf, checkTicket: checkTicket, validateLine: validateLine,
  packReceipts: packReceipts, fmtMin: fmtMin
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.NGasto = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
