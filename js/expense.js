/* ════════════════════════════════════════════════════════════════════════════
   NOTAS DE GASTO — pestaña "🧾 Gastos" de Pay Check
   Spec: "Notas de gasto\NOTAS-DE-GASTO-SPEC.md"

   Depende de:
     · js/expense-engine.js  → window.NGasto (motor de reglas, puro)
     · globales de index.html: lsGet, showToast, ldBackendUrl, ldToken, isPro
   Se pinta en #pc-tab-gastos. NO toca nada de Pay Check: solo lee el roster.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var BASE_DEFAULT = 'BCN';

/* ── Tipos de gasto: un color por tipo, como las tiras del calendario ── */
var TIPOS = [
  { id:'position', portal:'Position Flight', lbl:'Posicional', col:'#FBB040', ic:'✈',
    meals:true, cap:{nat:23.21,int:29.02}, win:[-1,0,1] },
  { id:'voucher',  portal:'Hotel Voucher', lbl:'Pernocta / hotel', col:'#C4B0FF', ic:'🛏',
    vouchers:true, win:[-1,0,1] },
  { id:'incident', portal:'Operational incidents', lbl:'Incidencia operativa', col:'#FF8095', ic:'⚠',
    meals:true, iso:true, cap:{nat:23.21,int:29.02}, win:[0,1] },
  /* El horno va por «Inoperative oven», que es un expense type distinto de la
     incidencia, pero el portal le pide el MISMO nº de ISO: un horno que no
     calienta es una incidencia técnica y la tripulación abre su ISO igual. Sin
     esta marca el campo no salía en la hoja y la nota se presentaba incompleta. */
  { id:'oven',     portal:'Inoperative oven', lbl:'Horno inoperativo', col:'#FF6B1A', ic:'🔥',
    meals:true, iso:true, cap:{nat:28.21,int:34.02}, win:[-1,0,1] },
  { id:'second',   portal:'Second Residence', lbl:'2ª residencia', col:'#4EE6AE', ic:'🅿', libre:true, win:[-1,0,1] },
  { id:'medical',  portal:'Medical certificates and licences', lbl:'Médicos y licencias', col:'#7AD6FB', ic:'⚕', libre:true, win:[-1,0,1] },
  { id:'training', portal:'Training', lbl:'Training', col:'#9BDEFF', ic:'🎓', libre:true, win:[-1,0,1] },
  { id:'ops',      portal:'Flight operations', lbl:'Flight Ops', col:'#8FA8D8', ic:'📋', libre:true, win:[-1,0,1] }
];
function tipoDe(k){ for (var i=0;i<TIPOS.length;i++) if (TIPOS[i].id===k) return TIPOS[i]; return TIPOS[0]; }

var MEAL_SUB = [
  { slot:'breakfast', lbl:'Desayuno',   nat:'National breakfast',        int:'International breakfast' },
  { slot:'lunch',     lbl:'Comida',     nat:'National lunch',            int:'International lunch' },
  { slot:'dinner',    lbl:'Cena',       nat:'National dinner',           int:'International dinner' },
  { slot:'night',     lbl:'Refrigerio', nat:'National late-night snack', int:'International late-night snack' }
];
var VOU_SUB = [
  { s:'Voucher Hotel', cap:23.21 }, { s:'Voucher Especial', cap:34.82 },
  { s:'Voucher Incidence', cap:23.21 },
  { s:'Split Duty normal', cap:23.21 }, { s:'Split Duty especial', cap:34.82 },
  { s:'Standby normal', cap:23.21 },   { s:'Standby especial', cap:34.82 },
  { s:'Firma tarde Last Day normal', cap:23.21 }, { s:'Firma tarde Last Day especial', cap:34.82 }
];
var SLOTS = [
  { id:'breakfast', ic:'🥐', lbl:'06–10' }, { id:'lunch', ic:'🍽️', lbl:'13–15' },
  { id:'dinner', ic:'🌙', lbl:'20–22:30' }, { id:'night', ic:'🌃', lbl:'00–05' }
];
var CIUDAD = { SVQ:'Sevilla', IBZ:'Ibiza', AMS:'Ámsterdam', LHR:'Londres', LGW:'Londres',
  CDG:'París', ORY:'París', OLB:'Olbia', TUN:'Túnez', JTR:'Santorini', BIO:'Bilbao',
  MAH:'Menorca', SCQ:'Santiago', TFN:'Tenerife', PMI:'Palma', BCN:'Barcelona', MXP:'Milán',
  FCO:'Roma', NAP:'Nápoles', VCE:'Venecia', PRG:'Praga', CPH:'Copenhague', BRU:'Bruselas' };
function ciudad(c){ return CIUDAD[c] || c || ''; }

var MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var DIA = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
var DEADLINE = 90;

function eur(n){ return (Number(n)||0).toFixed(2).replace('.',',') + ' €'; }
function fdate(s){ var d = new Date(s+'T12:00:00Z');
  return DIA[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MES[d.getUTCMonth()]; }
function sinDia(s){ return s.split(' ').slice(1).join(' '); }
function daysLeft(s){ var d = new Date(s+'T12:00:00Z');
  return DEADLINE - Math.round((Date.now() - d.getTime())/86400000); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

/* ── estado local ── */
/* EX.mes: mes seleccionado ('YYYY-MM') o '*' para verlo todo. Vive solo en
   memoria a propósito — al volver a entrar manda otra vez lo que caduca antes,
   no lo último que se estuvo mirando.
   EX.tkSum / EX.tkLine: lo que suman los tickets, por nota y por línea. Es lo
   que convierte el tope del convenio en lo que de verdad vas a cobrar. */
var EX = { auto: [], manual: [], sent: {}, pend: {}, tkCount: {}, tkSum: {}, tkLine: {},
           base: (window.ppGet&&ppGet('base'))||BASE_DEFAULT, mes: null, estado: 'falta',
           sync: null,
           /* Envío al portal. Se inicializan AQUÍ y no sólo en sus loaders: si
              algún día se pinta la pestaña sin pasar por exInit, un `EX.paid`
              undefined reventaría al marcar una nota como cobrada. */
           portal: {}, paid: {}, sheets: [], vistas: {}, vistasN: {}, fechas: {}, motivos: {}, flash: {}, sel: {}, selMode: false };
var ARRANCADO = false;
var K_SENT = 'pilotos_gastos_enviadas', K_MAN = 'pilotos_gastos_manual',
    K_PEND = 'pilotos_gastos_porsubir', K_SYNCAT = 'pilotos_gastos_sync';
function loadLocal(){
  try { EX.sent = JSON.parse(localStorage.getItem(K_SENT) || '{}'); } catch(e){ EX.sent = {}; }
  if (Array.isArray(EX.sent)) { var o={}; EX.sent.forEach(function(i){o[i]=1;}); EX.sent=o; }
  try { EX.manual = JSON.parse(localStorage.getItem(K_MAN) || '[]'); } catch(e){ EX.manual = []; }
  try { EX.pend = JSON.parse(localStorage.getItem(K_PEND) || '{}'); } catch(e){ EX.pend = {}; }
  try { EX.syncAt = localStorage.getItem(K_SYNCAT) || null; } catch(e){ EX.syncAt = null; }
  if (!EX.pend || typeof EX.pend !== 'object') EX.pend = {};
}
function saveSent(){ try { localStorage.setItem(K_SENT, JSON.stringify(EX.sent)); } catch(e){} }
function saveMan(){ try { localStorage.setItem(K_MAN, JSON.stringify(EX.manual)); } catch(e){} }
/* ── Cola de lo que este dispositivo ha tocado y el servidor aún no sabe ──
   Sin cola no hay sincronización honesta: si el móvil va en modo avión al crear
   la nota, la llamada falla, el .catch() se la traga y esa nota no se reintenta
   jamás. Con la cola, lo tocado aquí se sube en el siguiente arranque con red
   y, hasta que suba, MANDA sobre lo que diga el servidor.
   Clave 'n:<id>' (nota) o 't:<id>' (ticket) → { op:'up'|'del', note:<id nota> } */
function marcarPend(clave, op, nota){
  EX.pend[clave] = { op: op || 'up' };
  if (nota) EX.pend[clave].note = nota;
  savePend();
}
function savePend(){ try { localStorage.setItem(K_PEND, JSON.stringify(EX.pend)); } catch(e){} }
function todas(){ return EX.auto.concat(EX.manual); }

/* ════════ TOPE ≠ LO QUE COBRAS ════════
   El convenio pone un TOPE por franja; el portal paga lo que sumen tus tickets
   HASTA ese tope. Enseñar solo el tope hace leer 128 € y cobrar 40 — y el que
   se lleva esa sorpresa deja de fiarse del resto de la pantalla. Van siempre
   los tres números: tope, lo que llevas en tickets y lo que reclamas.
   Los centros de coste "libres" (2ª residencia, médicos, training, Flight Ops)
   no tienen tope de convenio: ahí reclamas lo que sumen los tickets. */
/* El título que entiende el piloto. El motor titula la pernocta con su rango de
   fechas ("Línea 2026-07-18 → 2026-07-19 · TFN"), que sirve para depurar pero no
   para leer: la tarjeta y el desglose dicen los dos "Pernocta en Tenerife". */
function tituloDe(n){
  if (n.kind === 'voucher' && n.lines && n.lines.length)
    return 'Pernocta en ' + ciudad(n.lines[0].where);
  return n.title || tipoDe(n.kind).lbl;
}
function topeDe(n){ return tipoDe(n.kind).libre ? null : (Number(n.maxTotal)||0); }
function r2(v){ return Math.round(v*100)/100; }
function tkDe(n){ return r2(EX.tkSum[n.id] || 0); }
function tkDeLinea(n, i){ return r2(EX.tkLine[n.id + '#' + i] || 0); }
function reclamaDe(n){ var t = tkDe(n), c = topeDe(n); return r2(c === null ? t : Math.min(t, c)); }
function sumaDe(list, fn){ return r2((list||[]).reduce(function(a,n){ return a + (fn(n)||0); }, 0)); }

/* ════════ TICKETS: IndexedDB (las fotos no caben en localStorage) ════════ */
var DBN = 'pilotos_gastos', STORE = 'tickets', _db = null;
function db(){
  if (_db) return Promise.resolve(_db);
  return new Promise(function(res, rej){
    var r; try { r = indexedDB.open(DBN, 1); } catch(e){ return rej(e); }
    r.onupgradeneeded = function(){
      var s = r.result.createObjectStore(STORE, { keyPath:'id' });
      s.createIndex('lineKey','lineKey',{unique:false});
    };
    r.onsuccess = function(){ _db = r.result; res(_db); };
    r.onerror = function(){ rej(r.error); };
  });
}
function tx(mode){ return db().then(function(d){ return d.transaction(STORE, mode).objectStore(STORE); }); }
function tkAll(){ return tx('readonly').then(function(s){ return new Promise(function(res,rej){
  var r = s.getAll(); r.onsuccess=function(){res(r.result||[]);}; r.onerror=function(){rej(r.error);}; }); }); }
function tkPut(rec){ return tx('readwrite').then(function(s){ return new Promise(function(res,rej){
  var r = s.put(rec); r.onsuccess=function(){res(rec.id);}; r.onerror=function(){rej(r.error);}; }); }); }
function tkDel(id){ return tx('readwrite').then(function(s){ return new Promise(function(res,rej){
  var r = s.delete(id); r.onsuccess=function(){res();}; r.onerror=function(){rej(r.error);}; }); }); }

/* Reescalado: una foto de móvil son 3-5 MB; un ticket legible cabe en ~200 KB.
   Importa para el espacio y, sobre todo, para poder subirla con mala cobertura. */
function shrink(file){
  return new Promise(function(res){
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function(){
      var M = 1600, sc = Math.min(1, M/Math.max(img.width,img.height));
      var c = document.createElement('canvas');
      c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ res(b||file); }, 'image/jpeg', .82);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}
/* ★ Sin `onerror` esta promesa NO se resolvía nunca si la foto no se podía
   leer (en iOS un blob guardado en IndexedDB puede volverse ilegible): el envío
   se quedaba en «Enviando a Vueling» para siempre sin llegar a salir del móvil. */
function blobToB64(b){ return new Promise(function(res, rej){
  var fr = new FileReader();
  var mal = function(){ rej(new Error('No se pudo leer la foto de un ticket. Vuelve a adjuntarla y envía de nuevo.')); };
  fr.onload = function(){ res(String(fr.result).split(',')[1]); };
  fr.onerror = mal; fr.onabort = mal;
  try { fr.readAsDataURL(b); } catch(e){ mal(); } }); }

/* Ninguna espera del envío puede ser infinita: si algo no contesta, se corta y
   se dice, en vez de dejar el círculo girando. */
function conTope(p, ms, msg){
  return new Promise(function(res, rej){
    var t = setTimeout(function(){ rej(new Error(msg)); }, ms);
    p.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
  });
}
var ENVIO_PREP_MS = 30000, ENVIO_MS = 240000;
var MSG_PREP = 'No se pudieron preparar los tickets del móvil. Cierra y abre la app y vuelve a intentarlo.';
var MSG_TARDA = 'El portal de Vueling no ha contestado a tiempo. Antes de reintentar, mira si la nota ya aparece en el portal.';

/* Sacar el ticket del móvil. En iOS la hoja de compartir permite "Guardar
   imagen" al carrete, que es de donde lo cogerá el portal; <a download> es
   poco fiable dentro de la PWA (mismo criterio que el export del logbook). */
function sacarFuera(blob, filename){
  try {
    var f = new File([blob], filename, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files:[f] })) {
      return navigator.share({ files:[f], title: filename }).catch(function(){});
    }
  } catch(e){}
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
  return Promise.resolve();
}

/* ════════ BACKEND ════════ */
/* ⚠️ EL TOKEN ES EL DEL LOGBOOK, y se pide por su misma función.
   Aquí se leía 'pilotos_token' / 'cafi_token' — dos claves que NO EXISTEN en la
   app: la sesión vive en 'cafi_auth_token'. Resultado: todas las llamadas salían
   sin Authorization (401) y la sincronización ni se intentaba, porque su primer
   paso es comprobar que hay token. Silencio absoluto: el piloto veía sus notas
   en el móvil, no en el ordenador, y en la consola no había ni un error.
   ldAuthHeaders() ya descarta además el 'demo-bypass-token', que tampoco vale
   para escribir en la nube. Nada de leer localStorage a mano: se usa la misma
   puerta que el logbook, que es justo lo que se pidió. */
function exToken(){
  try { if (typeof ldAuthHeaders === 'function') return ldAuthHeaders() || null; } catch(e){}
  try { var t = localStorage.getItem('cafi_auth_token') || '';
        return (t && t !== 'demo-bypass-token') ? t : null; } catch(e){ return null; }
}
function api(path, opts){
  opts = opts || {};
  var base = (typeof ldBackendUrl === 'function') ? ldBackendUrl() : 'https://api.pilotos.aero';
  var tok = exToken();
  return fetch(base + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'Content-Type':'application/json' },
      tok ? { 'Authorization':'Bearer ' + tok } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function(r){ return r.json().then(function(j){ return { status:r.status, body:j }; }); });
}
function exIsPro(){ try { return typeof isPro === 'function' ? !!isPro() : false; } catch(e){ return false; } }

/* ════════ DERIVAR LOS DERECHOS DESDE EL ROSTER ════════
   El roster vive en RST.entries y, sobre todo, en localStorage 'pilotOS_roster'
   (lo escribe la pestaña ROSTER). Las horas son UTC; las franjas del convenio
   son hora LOCAL — de eso ya se encarga el motor. Aquí sólo se agrupa por día y
   se decide dónde duerme. */
function rosterRows(){
  // ⚠️ Antes se leía window.rstEntries, que NO lo escribe nadie en toda la app:
  // esta pestaña se quedaba siempre sin roster y no detectaba ni un posicional
  // ni una pernocta — el motor estaba bien, no le llegaba el roster.
  // Mismo orden que dhUpdateRosterCard() en index.html: localStorage manda,
  // porque RST.entries está vacío si el piloto no ha entrado en Roster en esta
  // sesión (Gastos vive en Pay Check y se llega sin pasar por allí).
  var r = [];
  try {
    var raw = localStorage.getItem('pilotOS_roster');
    if (raw){ var parsed = JSON.parse(raw); if (Array.isArray(parsed)) r = parsed; }
  } catch(e){}
  if (!r.length && window.RST && Array.isArray(window.RST.entries)) r = window.RST.entries;
  if (!r.length && Array.isArray(window.rstEntries)) r = window.rstEntries;
  return r;
}
function construirDias(rows){
  if (!rows) rows = rosterRows();
  var byDay = {};
  rows.forEach(function(e){
    var d = e.date || (e.raw_data||{}).date; if (!d) return;
    (byDay[d] = byDay[d] || []).push(e);
  });
  var dates = Object.keys(byDay).sort();
  if (!dates.length) return [];

  /* La hora que cuenta es la que el piloto vivió: el roster guarda la REAL en
     std_actual/sta_actual, la de la compañía en *_estimated y la programada en
     std/sta pelado. Un día ya volado suele traer solo las reales, así que
     mirando únicamente std/sta las legs se quedaban sin hora → el motor las
     descartaba y el día entero salía sin derechos. */
  function legHora(x, k){
    var v = x.raw_data || x;
    return x[k+'_actual'] || x[k+'_estimated'] || x[k] ||
           v[k+'_actual'] || v[k+'_estimated'] || v[k] || '';
  }
  function rawDay(d){
    var rs = byDay[d] || [], rd = {};
    rs.forEach(function(x){ var v = x.raw_data || x;
      if (!rd.checkin && v.checkin) rd.checkin = v.checkin;
      if (!rd.debrief && v.debrief) rd.debrief = v.debrief; });
    return {
      date: d, checkin: rd.checkin, debrief: rd.debrief,
      // ★ Un día de GUARDIA no trae vuelos, y eso no lo convierte en un día
      // vacío: si no se activa y el piloto sigue en el hotel, la guía le paga
      // su voucher. El motor lo necesita para distinguirlo de un día libre.
      standby: rs.some(function(x){ return (x.entry_type||x.type)==='standby'; }),
      legs: rs.filter(function(x){ return (x.entry_type||x.type)==='flight' && x.dep && x.arr; })
        .map(function(x){ return { dep:x.dep, arr:x.arr, std:legHora(x,'std'), sta:legHora(x,'sta'),
          flightNum: x.flight_number || x.flightNum,
          // Misma convención que el resto de la app: bandera explícita o el '*'
          // del roster en el aeropuerto de salida / nº de vuelo.
          positioning: !!(x.positioning || (x.raw_data||{}).isPositioning || x.isPositioning ||
            String(x.dep||'').charAt(0)==='*' ||
            String(x.flight_number||x.flightNum||'').charAt(0)==='*') }; })   // posicional-ok: fin del normalizador: mira las tres marcas
    };
  }
  /* ⚠️ El último aterrizaje NO es el de mayor hora de reloj: con una jornada
     que cruza medianoche, el vuelo de las 01:54 es el ÚLTIMO. Se lo preguntamos
     al timeline del motor, que ordena por día de servicio. */
  function finDe(d){
    var day = rawDay(d); if (!day.legs.length) return null;
    var segs = window.NGasto.buildTimeline(day);
    return segs.length ? segs[segs.length-1].where : null;
  }
  /* Dónde duerme: se le sigue la pista día a día desde la base. Un día sin
     vuelos (guardia) le deja donde estaba — si se encadena por "¿mañana sale
     de aquí?", una guardia en medio de la línea hace perder las pernoctas. */
  var donde = EX.base, place = {};
  dates.forEach(function(d){ donde = finDe(d) || donde; place[d] = donde; });

  return dates.map(function(d, i){
    var day = rawDay(d);
    var ends = place[d], prev = i>0 ? place[dates[i-1]] : EX.base;
    day.layover = ends !== EX.base;
    day.layoverCity = ends !== EX.base ? ends : null;
    day.hotelPrevNight = prev !== EX.base;
    day.incidents = [];
    return day;
  /* ⚠️ Un día SIN VUELOS no es un día sin derechos. Aquí se filtraba por
     `legs.length` a secas, y con eso una guardia en el hotel —o cualquier día
     que te deja fuera de base sin volar— no llegaba al motor: su noche no
     existía y la línea pagaba una pernocta menos. Reporte AD8BF: línea 3→7 sep
     en Palma con un 2SBY el día 6 que no se activó; la app daba 92,84 € (3
     noches + firma tarde) donde había 4 noches + la guardia. Y el calendario
     del roster YA pintaba su luna, así que las dos pantallas se contradecían.
     Lo que decide es dónde duermes, no si has volado: pasan los días con
     vuelos y los que acaban fuera de base. */
  }).filter(function(d){ return d.legs.length || d.layover; });
}

/* ── Firma barata del roster ──────────────────────────────────────────────
   `detectar()` recorre TODO el histórico y se llamaba en cada `exRender()` —
   o sea en cada cambio de pestaña, cada nota marcada y cada sincronización—
   aunque el roster fuera exactamente el mismo. Es el primo hermano de
   `rdlAsegura` con el logbook: si un dato entra en el cálculo, entra en la
   clave de caché. Aquí entran las filas del roster y la BASE del piloto.
   Hash rodante sin construir cadenas: recorrer 2.400 filas cuesta ~1 ms y no
   deja basura, mientras que la detección completa cuesta cientos. */
function _mez(h, v){
  var s = v == null ? '' : String(v);
  for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h * 33) | 0;
}
function firmaRoster(rows){
  var h = 5381 ^ rows.length;
  for (var i = 0; i < rows.length; i++){
    var e = rows[i], v = e.raw_data || e;
    h = _mez(h, e.date || v.date);
    h = _mez(h, e.entry_type || e.type);
    h = _mez(h, e.dep); h = _mez(h, e.arr);
    h = _mez(h, e.std_actual || e.std_estimated || e.std);
    h = _mez(h, e.sta_actual || e.sta_estimated || e.sta);
    h = _mez(h, e.flight_number || e.flightNum);
    h = _mez(h, (e.positioning || v.isPositioning || e.isPositioning) ? 1 : 0);
    h = _mez(h, v.checkin); h = _mez(h, v.debrief);
  }
  return h + '|' + EX.base;
}
var _DET_FIRMA = null;

function detectar(rows){
  if (!window.NGasto) { EX.auto = []; _DET_FIRMA = null; return; }
  if (!rows) rows = rosterRows();
  var firma = firmaRoster(rows);
  if (firma === _DET_FIRMA) return;      // mismo roster, misma base: EX.auto vale
  _DET_FIRMA = firma;
  var days = construirDias(rows);
  if (!days.length) { EX.auto = []; return; }
  var res = window.NGasto.detectPeriod(days);
  /* ── EL ID DE UNA NOTA NO PUEDE DEPENDER DE CUÁNTO HISTORIAL HAYA ──────────
     Era `kind + '-' + fecha + '-' + i`, con `i` la posición de la nota en la
     lista de TODO el historial. Medido: la MISMA noche del 3 de agosto sale
     `voucher-2026-08-03-0` en un aparato con un mes importado y
     `voucher-2026-08-03-2` en otro con dos. De dos notas compartidas coincidían
     CERO — y como la marca «ya la pasé» se guarda POR ID, el piloto la marcaba
     en el móvil y en el ordenador seguía saliendo pendiente. La sincronización
     funcionaba perfectamente: lo que llegaba era un id que allí no existe.
     Y en un solo aparato es una bomba dormida: importar un mes viejo renumera
     todas las notas y se lleva por delante todas las marcas, sin un solo error.
     Ahora el ordinal es DENTRO de su mismo tipo y fecha, que no depende de nada
     de fuera del día. */
  var _ord = {};
  EX.auto = res.notes.map(function(x){
    var n = x.note, d = null;
    var _kf = n.kind + '-' + x.date;
    var i = (_ord[_kf] = (_ord[_kf] || 0) + 1) - 1;
    for (var k=0;k<days.length;k++) if (days[k].date===x.date) d = days[k];
    var rd = null;
    for (var j=0;j<res.days.length;j++) if (res.days[j].date===x.date) rd = res.days[j];
    return {
      id: n.kind + '-' + x.date + '-' + i, date: x.date, kind: n.kind,
      portalType: n.portalType, title: n.title || '',
      route: (d && d.legs || []).map(function(l){ return (l.positioning?'✱':'') + l.dep + '→' + l.arr; }).join('  '),   // posicional-ok: legs ya normalizadas al entrar
      scope: rd ? rd.scope : 'nat', needsISO: !!n.needsISO, single: !!n.single,
      maxTotal: n.maxTotal, ticketWindow: n.ticketWindow,
      lines: (n.lines||[]).map(function(l){ return {
        date:l.date, subtype:l.portalSubtype, cap:l.cap, slot:l.slot||null,
        slotLabel: l.slotLabel || (l.lateSignature ? 'Firma tarde'
                                 : l.standby ? 'Guardia en hotel' : 'Pernocta'),
        window: l.window||null, where: l.where||l.city||null }; }),
      covered: { catering: rd ? rd.coveredByCatering : [], voucher: rd ? rd.coveredByVoucher : [] },
      // ★ El motor ya calcula el porqué (segmentos con su huso y quién te
      // alimenta, franjas con los minutos exactos de solape). Antes se tiraba;
      // ahora se guarda para poder ENSEÑARLO.
      segments: rd ? rd.segments : [],
      slots: rd ? rd.slots : [],
      legs: (d && d.legs) || []
    };
  });
}

/* ── RESCATE DE LAS MARCAS YA GUARDADAS ────────────────────────────────────────
   Arreglar cómo se calcula el id no arregla lo que ya está guardado — es el caso
   `/401`→515 de la nómina y el `2055`/`2043`, tercera vez. Las marcas «ya la
   pasé» de antes de este arreglo (y las que sigan bajando del servidor de un
   aparato sin actualizar) llevan el ordinal viejo y no apuntan a ninguna nota:
   desde fuera, «no la has mandado» y «la marca se perdió al renumerar» se ven
   exactamente igual.

   Se mueven SOLO cuando no hay duda: la marca huérfana dice tipo y fecha, y hay
   EXACTAMENTE UNA nota de ese tipo ese día. Con dos, no se toca — antes que
   marcar la nota equivocada, nada; la marca dice dinero ya reclamado.
   La nota rescatada se encola para que el servidor aprenda el id nuevo, o el
   siguiente aparato volvería a bajar el viejo. */
function rescatarMarcas(){
  try {
    var vivas = {}, porTipoFecha = {};
    EX.auto.forEach(function(n){
      vivas[n.id] = 1;
      var k = n.kind + '-' + n.date;
      (porTipoFecha[k] = porTipoFecha[k] || []).push(n.id);
    });
    (EX.manual || []).forEach(function(m){ if (m && m.id) vivas[m.id] = 1; });
    var movidas = 0;
    Object.keys(EX.sent || {}).forEach(function(id){
      if (vivas[id]) return;
      var m = String(id).match(/^([a-z]+)-(\d{4}-\d{2}-\d{2})-\d+$/);
      if (!m) return;                                   // manual ('man-…') o basura: no se toca
      var cand = porTipoFecha[m[1] + '-' + m[2]] || [];
      if (cand.length !== 1) return;                    // ante la duda, nada
      var nuevo = cand[0];
      if (!EX.sent[nuevo]) { EX.sent[nuevo] = EX.sent[id]; marcarPend('n:' + nuevo, 'up'); movidas++; }
      delete EX.sent[id];
    });
    if (movidas) { saveSent(); EX.syncOtra = true; }
  } catch(e){ /* silencioso */ }
}

/* ════════ EL PORQUÉ ════════
   Por qué existe: un piloto no manda al portal un importe que no sabe
   justificar. Y si el motor se equivoca, quien lo va a ver es él. */
function pct(v, a, b){ return Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100)); }
function hLocal(utc, tz){ var l = window.NGasto.utcToLocal(utc, tz); return window.NGasto.fmtMin(l.min); }

function porque(n){
  var segs = n.segments || [], slots = n.slots || [];
  if (!segs.length) return '';
  var t0 = segs[0].from, t1 = segs[segs.length-1].to;
  if (!(t1 > t0)) return '';

  /* ── La barra del día ──
     El eje va en tiempo REAL (UTC por dentro), que es lo único monótono
     cuando cruzas husos; las etiquetas y las franjas se pintan en la hora
     LOCAL de cada sitio, que es como manda el convenio. Pintar el eje en UTC
     y rotularlo en UTC haría pensar que la app calcula mal cuando lo que
     estaría mal es la pantalla. */
  var bandas = SLOTS.map(function(s){
    var hit = null;
    slots.forEach(function(x){ if (x.slot === s.id) hit = x; });
    var tz = (hit && hit.tz) || segs[segs.length-1].tz;
    var dd = window.NGasto.utcToLocal((t0+t1)/2, tz);
    var sl = null;
    window.NGasto.VY_RULES.slots.forEach(function(r){ if (r.id === s.id) sl = r; });
    var a = window.NGasto.localToUTC(dd.y, dd.m, dd.d, Math.floor(sl.from/60), sl.from%60, tz);
    var b = window.NGasto.localToUTC(dd.y, dd.m, dd.d, Math.floor(sl.to/60),   sl.to%60,   tz);
    if (b <= t0 || a >= t1) return '';
    var cls = hit && hit.self ? 'on' : hit ? 'cat' : '';
    return '<div class="ex-band '+cls+'" style="left:'+pct(a,t0,t1)+'%;width:'+
      (pct(b,t0,t1)-pct(a,t0,t1))+'%"><span>'+s.ic+'</span></div>';
  }).join('');

  var tramos = segs.map(function(g){
    var cls = (g.feeder === 'self' ? 'self' : 'cat') + ' ' + g.kind;
    var lbl = g.kind === 'flight' ? g.where : '';
    return '<div class="ex-seg '+cls+'" style="left:'+pct(g.from,t0,t1)+'%;width:'+
      (pct(g.to,t0,t1)-pct(g.from,t0,t1))+'%" title="'+esc(g.where)+'">'+esc(lbl)+'</div>';
  }).join('');

  var ini = segs[0], fin = segs[segs.length-1];
  var barra = '<div class="ex-tl">'+
      '<div class="ex-tl-bands">'+bandas+'</div>'+
      '<div class="ex-tl-segs">'+tramos+'</div>'+
    '</div>'+
    '<div class="ex-tl-ax"><span>'+hLocal(ini.from, ini.tz)+' '+esc(ini.where)+'</span>'+
      '<span>hora local</span><span>'+hLocal(fin.to, fin.tz)+' '+esc(fin.where)+'</span></div>';

  /* ── Una frase por franja, en cristiano ── */
  var frases = slots.map(function(s){
    var sl = null;
    window.NGasto.VY_RULES.slots.forEach(function(r){ if (r.id === s.slot) sl = r; });
    /* Minutos de solape de CADA tramo con la franja. Ojo: los minutos que
       justifican el dinero son los del tramo que te pagas TÚ, no el máximo del
       día — si no, una franja que pasas casi entera volando (catering) diría
       "invades 96 min" junto a la frase de la espera, que duró 24. */
    function solape(g){
      var dd = window.NGasto.utcToLocal((g.from+g.to)/2, s.tz);
      var a = window.NGasto.localToUTC(dd.y, dd.m, dd.d, Math.floor(sl.from/60), sl.from%60, s.tz);
      var b = window.NGasto.localToUTC(dd.y, dd.m, dd.d, Math.floor(sl.to/60), sl.to%60, s.tz);
      return Math.max(0, Math.min(g.to,b) - Math.max(g.from,a));
    }
    var dentro = segs.filter(function(g){ return solape(g) > 0; });
    var mio = dentro.filter(function(g){ return g.feeder === 'self'; });
    var minMio = Math.round(mio.reduce(function(a,g){ return a + solape(g); }, 0) / 60000);
    var donde = (mio[0] || dentro[0] || {}).where || s.where;
    var txt;
    if (s.self){
      var g = mio.slice().sort(function(a,b){ return solape(b)-solape(a); })[0] || {};
      txt = (g.kind === 'flight'
        ? 'Vas de <b>pasajero</b> en el tramo a '+esc(g.where)
        : 'Estás en tierra en <b>'+esc(donde)+'</b> esperando un <b>posicional</b>') +
        ', así que esa comida te la pagas tú. Invades <b>'+minMio+' min</b> → cuenta.';
    } else {
      txt = 'La pasas <b>operando</b>: el catering va a bordo, así que no genera nota '+
            '(salvo que falle y lo marques como incidencia).';
    }
    return '<div class="ex-why-row '+(s.self?'on':'')+'">'+
      '<div class="ex-why-h">'+iconoSlot(s.slot)+' <b>'+esc(s.label)+'</b> · '+
        s.localFrom+'–'+s.localTo+' hora local de '+esc(donde)+'</div>'+
      '<div class="ex-why-t">'+txt+'</div></div>';
  }).join('');

  return '<div class="ex-why">'+barra+frases+
    '<div class="ex-why-foot">Franjas del <b>art. 10.1 del IV Convenio</b>: basta estar en '+
    'actividad «en todo o en parte» durante la franja.'+
    '<span class="ex-why-bug" onclick="event.stopPropagation();exNoCuadra(\''+n.id+'\')">Esto no me cuadra</span>'+
    '</div></div>';
}
function iconoSlot(id){ var o=''; SLOTS.forEach(function(s){ if(s.id===id) o=s.ic; }); return o; }

window.exWhy = function(id, el){
  var box = document.getElementById('why-'+id);
  if (!box) return;
  var abierto = box.style.display !== 'none' && box.innerHTML;
  if (abierto){ box.style.display='none'; el.textContent='¿por qué?'; return; }
  var n = notaDe(id);
  if (!box.innerHTML) box.innerHTML = porque(n);
  box.style.display=''; el.textContent='ocultar';
};

/* Copia el diagnóstico del día para pegarlo en un reporte. */
window.exNoCuadra = function(id){
  var n = notaDe(id); if (!n) return;
  var l = [];
  l.push('NOTA DE GASTO QUE NO CUADRA');
  l.push('fecha: '+n.date+'  ·  tipo: '+n.portalType+'  ·  ámbito: '+(n.scope==='int'?'INT':'NAC'));
  l.push('importe que calcula la app: '+eur(n.maxTotal));
  l.push('');
  l.push('VUELOS (horas UTC del roster):');
  (n.legs||[]).forEach(function(g){   // posicional-ok: legs ya normalizadas al entrar
    l.push('  '+(g.positioning?'*':' ')+(g.flightNum||'')+' '+g.dep+'>'+g.arr+'  '+g.std+'-'+g.sta); });
  l.push('');
  l.push('JORNADA (hora local · quién te da de comer):');
  (n.segments||[]).forEach(function(g){
    l.push('  '+hLocal(g.from,g.tz)+'-'+hLocal(g.to,g.tz)+'  '+g.kind+' @'+g.where+
      '  ['+(g.feeder==='self'?'TÚ':'catering')+']'); });
  l.push('');
  l.push('FRANJAS:');
  (n.slots||[]).forEach(function(s){
    l.push('  '+s.label+' '+s.localFrom+'-'+s.localTo+' @'+s.where+
      '  solape '+s.overlapMin+' min  → '+(s.self?'RECLAMABLE':'catering')); });
  l.push('');
  l.push('lo que yo esperaba: ');
  var txt = l.join('\n');
  if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function(){});
  if (typeof showToast === 'function')
    showToast('📋 Diagnóstico copiado — pégalo en el reporte y di qué esperabas', 'info');
  else alert(txt);
};

/* ════════ MESES ════════
   Un piloto no piensa "mis gastos", piensa "lo de julio" — y el roster guarda
   varios meses a la vez, así que un total sin mes no dice nada. Tira de chips
   en vez de desplegable: el desplegable esconde justo lo que hay que ver, que
   es que existen OTROS meses con dinero dentro. */
function mesesDe(list){
  var g = {}, orden = [];
  list.forEach(function(n){
    var k = String(n.date||'').slice(0,7); if (k.length !== 7) return;
    if (!g[k]){ g[k] = { k:k, notas:0, tope:0, tickets:0, urge:false }; orden.push(k); }
    g[k].notas++; g[k].tope += topeDe(n)||0; g[k].tickets += tkDe(n);
    if (!EX.sent[n.id] && daysLeft(n.date) <= 20) g[k].urge = true;
  });
  orden.sort(function(a,b){ return b.localeCompare(a); });   // el más reciente primero
  return orden.map(function(k){ g[k].tope = r2(g[k].tope); g[k].tickets = r2(g[k].tickets); return g[k]; });
}
function mesLbl(k){ return MES[Number(k.slice(5,7))-1].toUpperCase() + ' ' + k.slice(2,4); }
function mesLargo(k){ return MES[Number(k.slice(5,7))-1].toUpperCase() + ' ' + k.slice(0,4); }
/* Por defecto, el mes de la nota que caduca ANTES — no el mes en curso: el
   plazo son 90 días por nota, así que lo urgente es siempre lo viejo. */
function mesPorDefecto(pend, meses){
  if (!meses.length) return '*';
  var urge = pend.slice().sort(function(a,b){ return daysLeft(a.date)-daysLeft(b.date); })[0];
  return urge ? urge.date.slice(0,7) : meses[0].k;
}
window.exMes = function(k){ EX.mes = k; exRender(); };

/* Estado de la nube. Se dice SOLO cuando aporta: que algo está esperando a
   subir, o que la última ronda falló. El "todo bien" no se anuncia cada vez —
   una pantalla que grita "sincronizado" acaba siendo ruido y deja de leerse
   justo el día que pone otra cosa. */
/* El estado de la nube, dicho siempre. Antes solo hablaba cuando algo iba mal,
   así que el piloto no tenía forma de saber si sus notas estaban a salvo en su
   cuenta o solo en ese teléfono — y durante días NO lo estuvieron sin que nada
   lo dijera (las llamadas salían sin sesión y fallaban en silencio). Cuatro
   estados, y ninguno es el silencio. */
function haceCuanto(iso){
  var ms = Date.now() - Date.parse(iso||'');
  if (!isFinite(ms) || ms < 0) return '';
  var m = Math.round(ms/60000);
  if (m < 1)  return 'hace un momento';
  if (m < 60) return 'hace '+m+' min';
  var h = Math.round(m/60);
  if (h < 24) return 'hace '+h+' h';
  return 'hace '+Math.round(h/24)+' días';
}
function nubeEstado(){
  var enCola = Object.keys(EX.pend || {}).length;
  if (!exToken()) return '<div class="ex-nube warn">☁ sin sesión · tus notas viven '+
    '<b>solo en este dispositivo</b>. Inicia sesión para tenerlas en todos.</div>';
  if (enCola) return '<div class="ex-nube warn">☁ '+enCola+
    (enCola===1 ? ' cambio sin subir' : ' cambios sin subir')+
    ' · sube solo en cuanto haya red</div>';
  if (EX.syncEstado === 'err') return '<div class="ex-nube warn">☁ sin conexión con tu cuenta · '+
    'lo de este dispositivo está a salvo, pero no se está sincronizando</div>';
  if (EX.syncEstado === 'ok') return '<div class="ex-nube ok">☁ sincronizado con tus otros '+
    'dispositivos'+(EX.syncAt ? ' · '+haceCuanto(EX.syncAt) : '')+'</div>';
  return '<div class="ex-nube">☁ sincronizando…</div>';
}

function mesesStrip(meses){
  var chips = meses.map(function(m){
    return '<div class="ex-mchip'+(EX.mes===m.k?' on':'')+(m.urge?' urge':'')+'" '+
      'onclick="exMes(\''+m.k+'\')">'+mesLbl(m.k)+'<span>'+eur(m.tope)+'</span></div>';
  }).join('');
  return '<div class="ex-meses">'+chips+
    '<div class="ex-mchip'+(EX.mes==='*'?' on':'')+'" onclick="exMes(\'*\')">TODO'+
      '<span>'+eur(sumaDe(meses, function(m){ return m.tope; }))+'</span></div></div>';
}

/* ════════ LOS TRES PASOS DE UNA NOTA ════════
   No es una categoría más: es lo único que el piloto quiere saber al entrar —
   qué le falta para cobrar. El orden es el del trabajo:
     falta   → ni un solo ticket. Sin ticket el portal no abona NADA.
     lista   → ya tiene alguno; queda pasarla por el portal.
     enviado → hecha.
   `lista` mira si hay ALGÚN ticket, no si están todos: una nota de dos noches
   con una sola foto ya ha empezado, y el chip de la tarjeta dice «1 de 2» en
   ámbar para que la mitad que falta no se dé por buena. Poner el listón en
   «todas» dejaría esa nota en «SIN TICKET» teniendo una foto dentro, que es
   justo el 0 mudo que este archivo lleva persiguiendo. */
var PASOS = [
  { k:'falta',   l:'SIN TICKET',
    vacio:'Ninguna nota sin ticket. Todo lo de este mes está justificado.' },
  { k:'lista',   l:'CON TICKET',
    vacio:'Todavía ninguna nota con ticket adjunto.' },
  { k:'enviado', l:'ENVIADO',
    vacio:'Aún no has marcado ninguna como enviada.' }
];
function pasoDe(k){ for (var i=0;i<PASOS.length;i++) if (PASOS[i].k===k) return PASOS[i]; return PASOS[0]; }
function lineasConTk(n){
  var k = 0;
  (n.lines||[]).forEach(function(_, i){ if (tkDeLinea(n, i) > 0) k++; });
  return k;
}
function estadoDe(n){
  if (EX.sent[n.id]) return 'enviado';
  return lineasConTk(n) > 0 ? 'lista' : 'falta';
}
/* El paso que se abre es el primero que TENGA algo, no el último que se miró:
   al entrar en Gastos lo que interesa es lo que bloquea el cobro. */
function primerPaso(g){
  for (var i=0;i<PASOS.length;i++) if (g[PASOS[i].k] && g[PASOS[i].k].length) return PASOS[i].k;
  return 'falta';
}
window.exPaso = function(k){ EX.estado = k; exRender(); };

/* ── El detalle de la tarjeta, plegado ────────────────────────────────────────
   La tarjeta abierta ocupaba media pantalla para decir un número: con dos notas
   ya no cabía nada más. Plegada entran ocho. El estado NO se guarda —al volver
   a Gastos lo que interesa es la lista, no la nota que se dejó abierta— y el
   atajo a la cámara vive en el chip de tickets, así que la foto sigue a UN
   toque desde la lista: plegar no puede alejar la única tarea de la pantalla. */
window.exToggle = function(id, el){
  var b = document.getElementById('exb-'+id); if (!b) return;
  var abierto = b.style.display !== 'none';
  b.style.display = abierto ? 'none' : '';
  if (el) el.classList.toggle('open', !abierto);
};

/* ════════ EL ICONO DEL TIPO ════════
   ⚠️ DIBUJADO, no escrito con un carácter. Un glifo (✈ 🛏 ⚠) lo pinta la fuente
   instalada en el móvil del piloto: el mismo código sale sólido en un aparato y
   en hueco en otro, y ahí «no tienes nota» y «tu teléfono pinta el avión de un
   pelo» se ven igual. Es la lección de la luna de las pernoctas, y por eso el
   icono va en <path fill>: un trazado no adelgaza en otro sistema ni se lo
   sustituye un emoji. El color sale del MISMO `--tcol` que la tira lateral, así
   que icono y tira no pueden discrepar. */
var ICONOS = {
  /* avión de perfil */
  position:'<path d="M15 8c0 .5-.4.9-.9.9l-4.3.3-2.2 5.2c-.1.2-.3.4-.6.4h-.8c-.3 0-.5-.3-.4-.6'+
    'l1.2-5-3 .2-1.2 1.6c-.1.1-.2.2-.4.2h-.5c-.2 0-.4-.2-.3-.5L2.3 8l-.7-2.7c-.1-.3.1-.5.3-.5h.5'+
    'c.2 0 .3.1.4.2l1.2 1.6 3 .2-1.2-5c-.1-.3.1-.6.4-.6h.8c.3 0 .5.2.6.4l2.2 5.2 4.3.3'+
    'c.5 0 .9.4.9.9z"/>',
  /* cama */
  voucher:'<rect x="1.3" y="3.6" width="1.9" height="8.8" rx=".8"/>'+
    '<rect x="4.1" y="5.6" width="3.2" height="2.6" rx="1.1"/>'+
    '<rect x="4.1" y="8.2" width="10.4" height="4.2" rx="1.2"/>',
  /* triángulo de aviso */
  incident:'<path d="M8 2.1 14.7 13.7H1.3z" fill="none" stroke="currentColor" stroke-width="1.6" '+
    'stroke-linejoin="round"/><rect x="7.2" y="6.2" width="1.6" height="3.5" rx=".8"/>'+
    '<circle cx="8" cy="11.5" r=".95"/>',
  /* llama */
  oven:'<path d="M8.7 1.1c.3 2 1.3 2.9 2.3 4 .9 1 1.5 2.1 1.5 3.5A4.5 4.5 0 0 1 8 13.1'+
    'a4.5 4.5 0 0 1-4.5-4.5c0-1.6.8-2.7 1.8-3.5.2.7.6 1.1 1.2 1.3C6 4.5 6.9 2.4 8.7 1.1z"/>',
  /* casa */
  second:'<path d="M8 1.7 14.9 7.7H1.1z"/><rect x="3.2" y="7.7" width="9.6" height="6.6" rx=".9"/>',
  /* cruz sanitaria */
  medical:'<rect x="6.3" y="1.6" width="3.4" height="12.8" rx="1.1"/>'+
    '<rect x="1.6" y="6.3" width="12.8" height="3.4" rx="1.1"/>',
  /* birrete */
  training:'<path d="M8 1.9 15.5 5.6 8 9.3.5 5.6z"/>'+
    '<path d="M3.7 7.9v3c0 1.4 1.9 2.5 4.3 2.5s4.3-1.1 4.3-2.5v-3L8 10.4z"/>',
  /* portapapeles */
  ops:'<rect x="2.9" y="2.9" width="10.2" height="11.2" rx="1.7" fill="none" '+
    'stroke="currentColor" stroke-width="1.5"/><rect x="5.8" y="1.2" width="4.4" height="2.8" rx="1.1"/>'+
    '<rect x="5.4" y="7" width="5.2" height="1.4" rx=".7"/>'+
    '<rect x="5.4" y="10" width="3.4" height="1.4" rx=".7"/>'
};
function icono(kind){
  return '<svg class="ex-ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" '+
    'fill="currentColor">'+(ICONOS[kind] || ICONOS.ops)+'</svg>';
}

/* ════════ LA CABECERA DE TIPO ════════
   Pedido el 11-sep-2026: «que encima de estado ponga TICKET Horno inoperativo».
   Y tenía razón de fondo: la tarjeta decía en qué ESTADO está la nota antes de
   decir QUÉ nota es. El tipo salía sólo en un icono de 16 px y, para las notas
   automáticas, repetido en el título — dos sitios diciendo lo mismo y ninguno
   diciéndolo en el primero donde cae la vista.

   ── LA SEGUNDA VERSIÓN, Y POR QUÉ ──────────────────────────────────────────
   La primera llevaba OCHO TEXTURAS, una por concepto (rayas, cuadrículas,
   puntos). Veredicto del piloto: «se ve bastante feo». Y al mirarlo con eso en
   la cabeza, tenía razón por un motivo que se puede decir: una trama es RUIDO
   REPETIDO — ocho tarjetas seguidas con ocho rayados distintos convierten una
   lista en una manta de retales, y encima cada trama compite con el rótulo que
   tiene justo encima. La textura llamaba la atención sobre sí misma en vez de
   sobre la nota.

   Lo que hay ahora son TRES capas, ninguna repetida:

     1. un LAVADO del color del tipo que entra por la izquierda —donde está la
        tira— y se apaga antes de llegar al centro. Un degradado, no una trama:
        no tiene grano, así que no puede competir con el texto.
     2. una LÍNEA DE LUZ abajo, del color del tipo, con su halo. Es lo que hace
        que la cabecera parezca una pieza y no un rectángulo pintado.
     3. y la MARCA DEL TIPO en grande, muy tenue, saliéndose por el borde
        derecho: el mismo trazado que el icono pequeño, a 46 px y al 13 %.

   La tercera es la que distingue un tipo de otro de un vistazo, y es honesta:
   **es el símbolo del propio concepto, no un rayado inventado**. Una sola forma
   grande se lee de lejos; ocho rayados distintos, no. Y el color sigue saliendo
   del MISMO `--tcol` que la tira y el icono, así que no hay una cuarta cosa que
   mantener sincronizada.

   ⚠️ Nada de esto baja al CUERPO de la tarjeta. Ahí hay importes, topes y el
   desglose línea a línea, y algo pintado detrás de un número es un fallo que
   este proyecto ya pagó caro: el ✦ de los campos importados se embaldosó por
   todo el input y los números quedaron detrás de un enrejado violeta — y NO se
   detecta midiendo contraste, porque los puntos de muestreo caen entre los
   trazos. La cabecera no tiene ni una cifra. */
function cabeceraTipo(n, T){
  return '<div class="ex-tipo">'+
    /* La marca grande va PRIMERO en el DOM y detrás en pintura: es fondo, no
       contenido. `aria-hidden` porque no dice nada que el rótulo no diga. */
    '<span class="ex-tipo-marca" aria-hidden="true">'+
      '<svg viewBox="0 0 16 16" width="46" height="46" fill="currentColor">'+
        (ICONOS[n.kind] || ICONOS.ops)+'</svg></span>'+
    '<span class="ex-tipo-ic">'+icono(n.kind)+'</span>'+
    '<span class="ex-tipo-k">TICKET</span>'+
    '<span class="ex-tipo-v">'+esc(T.lbl)+'</span>'+
  '</div>';
}

/* ════════ RENDER ════════ */
function exRender(){
  var host = document.getElementById('pc-tab-gastos');
  if (!host) return;
  loadLocal();
  arrancar();
  syncSiToca();
  var rows = rosterRows();     // una sola lectura: la usan detectar() y el aviso
  detectar(rows);
  /* Fuera de `detectar` a propósito: aquélla cachea por FIRMA del roster y se sale
     por un `return` cuando el mes no ha cambiado — y las marcas sí cambian sin que
     el roster se mueva, porque llegan del otro aparato. Colgando el rescate de
     ella, la marca vieja que baja de la nube no se rescataba nunca. */
  rescatarMarcas();

  var all = todas();
  var pendAll = all.filter(function(n){ return !EX.sent[n.id]; });
  var meses = mesesDe(all);
  var claves = meses.map(function(m){ return m.k; });
  if (EX.mes !== '*' && claves.indexOf(EX.mes) < 0) EX.mes = mesPorDefecto(pendAll, meses);
  function enMes(n){ return EX.mes === '*' || String(n.date||'').slice(0,7) === EX.mes; }

  var pend = pendAll.filter(enMes);
  var done = all.filter(function(n){ return EX.sent[n.id]; }).filter(enMes);
  var tope = sumaDe(pend, topeDe);
  var recl = sumaDe(pend, reclamaDe);
  var margen = r2(tope - recl);
  /* Ya pasadas: lo que reclamaste según los tickets que tiene la app. Si de esa
     nota no guardaste ninguno, la app no puede saberlo → se enseña su tope. */
  var totS = sumaDe(done, function(n){ return tkDe(n) ? reclamaDe(n) : (topeDe(n)||0); });
  /* ⚠️ La caducidad se mira SIEMPRE sobre TODO lo pendiente, filtre lo que
     filtre el mes: un filtro que esconde un vencimiento es peor que no tener
     filtro. Si la que caduca antes es de otro mes, la baldosa lo dice y lleva
     a ese mes de un toque. */
  var prox = pendAll.slice().sort(function(a,b){ return daysLeft(a.date)-daysLeft(b.date); })[0];
  var proxMes = prox ? prox.date.slice(0,7) : null;
  var proxFuera = !!(prox && EX.mes !== '*' && proxMes !== EX.mes);

  var h = '';
  if (!rows.length){
    /* Sin botón de "importar roster" a propósito: sacaría al piloto de Gastos
       para hacer algo que ya hace por su cuenta en su pantalla. El aviso
       explica qué falta y justo debajo tiene "Nueva nota", que sí se queda aquí. */
    h += '<div class="ex-empty">Importa tu roster (en la pantalla <b>Roster</b>) y la app '+
         'detectará sola los posicionales y las pernoctas.<br>Mientras tanto, puedes crear '+
         'notas a mano aquí abajo.</div>';
  }

  if (meses.length > 1) h += mesesStrip(meses);

  /* ════════ EL NÚMERO GRANDE ES LO QUE RECLAMAS, NO EL TOPE ════════
     Hasta Beta.770 mandaba el TOPE del convenio y justo debajo iba una línea
     diciendo que sin tickets no se abona nada: el número que domina la pantalla
     contradiciendo a la frase que tiene debajo. El tope es un máximo teórico —
     dinero que no está—, así que pasa a segundo plano y manda lo que de verdad
     vas a cobrar con los tickets que llevas puestos. La barra enseña cuánto de
     ese tope llevas cubierto, que es el trabajo que queda por hacer. */
  var pct = tope > 0 ? Math.max(0, Math.min(100, Math.round(recl / tope * 100))) : 0;
  h += '<div class="ex-hero">'+
    '<div class="ex-lbl">RECLAMAS · '+(EX.mes==='*' ? 'TODOS LOS MESES' : mesLargo(EX.mes))+'</div>'+
    '<div class="ex-big">'+eur(recl)+'</div>'+
    '<div class="ex-sub">de <b>'+eur(tope)+'</b> posibles · '+pend.length+
      (pend.length===1?' nota' : ' notas')+' · '+
      pend.reduce(function(a,n){return a+n.lines.length;},0)+' líneas</div>'+
    (pend.length ? '<div class="ex-pbar"><i style="width:'+pct+'%"></i></div>' : '')+
    avisos(pend, prox, proxFuera, proxMes)+
    nubeEstado()+'</div>';

  /* ════════ LOS TRES PASOS ════════
     El piloto no piensa "mis notas de gasto": piensa "¿qué me falta para cobrar
     esto?". Los tres pasos son esa respuesta, con su recuento a la vista — así
     que filtrar no esconde nada: lo que hay en los otros dos lo dice el propio
     mando. Se eligen los que están, no un número guardado: si no queda nada sin
     ticket, entrar en Gastos abre por el paso que sí tiene trabajo. */
  var grupos = { falta:[], lista:[], enviado:[] };
  all.filter(enMes).forEach(function(n){ grupos[estadoDe(n)].push(n); });
  if (!grupos[EX.estado] || !grupos[EX.estado].length) EX.estado = primerPaso(grupos);

  if (all.length){
    h += '<div class="ex-pasos">'+ PASOS.map(function(p){
      return '<div class="ex-paso'+(EX.estado===p.k?' on':'')+
        (p.k==='falta' && grupos.falta.length ? ' urge':'')+'" onclick="exPaso(\''+p.k+'\')">'+
        '<div class="n">'+grupos[p.k].length+'</div><div class="l">'+p.l+'</div></div>';
    }).join('') +'</div>';

    var lista = grupos[EX.estado];
    if (lista.length) h += EX.estado === 'enviado' ? porEnvio(lista) : porMeses(lista, false);
    else h += '<div class="ex-empty">'+pasoDe(EX.estado).vacio+'</div>';
  }

  /* Lo que Vueling ha hecho con tus notas. Va antes de "añadir a mano": es
     dinero que reclamaste y no vas a cobrar, y hasta hoy sólo estaba en un
     correo del bot que nadie relee. */
  h += bannerPortal();

  /* Al final y no arriba: lo que se viene a hacer a esta pantalla es mirar lo
     que falta, no crear una nota. La app detecta sola las dos que más salen. */
  h += '<div class="ex-sect">AÑADIR A MANO</div>'+
    '<div class="ex-new" onclick="exPickTipo()">＋ Nueva nota de gasto</div>'+
    '<div class="ex-note" style="margin:6px 4px 0">La app detecta sola los posicionales y las '+
    'pernoctas. Lo demás — una incidencia, el horno, un reconocimiento médico — lo marcas tú.</div>';

  /* ⚠️ LA TIRA DE MESES SE REHACE EN CADA RENDER, Y CON ELLA SU SCROLL
     `exMes` llama a `exRender`, que reescribe el `innerHTML` entero: la tira
     nace de nuevo pegada a la izquierda. Si el piloto arrastraba hasta ABR y lo
     pulsaba, el mes SÍ cambiaba pero la tira saltaba al principio y el chip que
     acababa de tocar se iba de la pantalla — desde fuera es idéntico a «no me
     lo ha seleccionado», y se acaba pulsando tres veces. Se conserva la
     posición y se trae el elegido a la vista. */
  var tira = host.querySelector('.ex-meses');
  var scroll = tira ? tira.scrollLeft : 0;
  host.innerHTML = h;
  /* El deslizamiento se engancha por DELEGACIÓN y una sola vez —las tarjetas se
     rehacen enteras aquí—, y el aviso cierra las que hubiera abiertas: tras el
     repintado, la tarjeta de esa posición puede ser otra nota. */
  try { exSwipeInit(); } catch(e){}
  try { window.dispatchEvent(new Event('pilotos-gastos-render')); } catch(e){}
  var nueva = host.querySelector('.ex-meses');
  if (nueva){
    nueva.scrollLeft = scroll;
    var on = nueva.querySelector('.ex-mchip.on');
    /* Sin `smooth`: es la posición de partida, no una animación que enseñar. */
    if (on && on.scrollIntoView) try { on.scrollIntoView({ block:'nearest', inline:'nearest' }); } catch(e){}
  }
  barraSel();                       // la barra de "enviar varias", si toca
}

/* ── Los avisos del resumen ───────────────────────────────────────────────────
   Dos frases como mucho, y las dos sobre algo que el piloto puede arreglar hoy.
   ⚠️ La CADUCIDAD se mira siempre sobre TODO lo pendiente, filtre lo que filtre
   el mes: un filtro que esconde un vencimiento es peor que no tener filtro. Si
   la que caduca antes es de otro mes, la línea lo dice y lleva a ese mes de un
   toque. Y un plazo pasado se dice con PALABRAS: «-158 días» es una resta, no
   un estado, y se lee como si aún quedara algo. */
function avisos(pend, prox, proxFuera, proxMes){
  var linea = [], clase = '', d = prox ? daysLeft(prox.date) : null;
  var sinTk = pend.filter(function(n){ return !lineasConTk(n); }).length;
  if (sinTk){
    linea.push('Sin ticket <b>no se abona nada</b>: '+
      (sinTk===1 ? 'falta 1 nota por justificar' : 'faltan '+sinTk+' notas por justificar'));
    clase = ' warn';
  }
  if (prox){
    linea.push(
      (d < 0 ? 'La 1ª <b>caducó hace '+(-d)+(d===-1?' día':' días')+'</b>'
             : d === 0 ? 'La 1ª <b>caduca hoy</b>'
             : 'La 1ª caduca en <b>'+d+(d===1?' día':' días')+'</b>')+
      (proxFuera ? ' · está en <b>'+mesLbl(proxMes)+'</b>' : ''));
    /* Un plazo vencido manda sobre todo lo demás; verde no es un color para un
       plazo, ni siquiera cuando queda lejos. */
    if (d < 0) clase = ' bad'; else if (d <= 30 && clase !== ' bad') clase = ' warn';
    else if (!clase) clase = ' info';
  }
  if (!linea.length) return '';
  return '<div class="ex-real'+clase+'"'+
    (proxFuera ? ' onclick="exMes(\''+proxMes+'\')"' : '')+'>'+
    linea.join('<br>')+'</div>';
}

/* Las notas se agrupan por MES, con su subtotal: un piloto no piensa "mis
   gastos", piensa "lo de julio". Y el plazo de 3 meses también va por mes. */
function porMeses(list, isDone){
  var g = {}, orden = [];
  list.slice().sort(function(a,b){ return b.date.localeCompare(a.date); })
      .forEach(function(n){
        var k = n.date.slice(0,7);
        if (!g[k]) { g[k] = []; orden.push(k); }
        g[k].push(n);
      });
  /* Con un mes elegido el rótulo del mes iba DOS veces —la píldora de arriba y
     esta fila— y el recuento una tercera, en el resumen. Aquí sólo hay más de un
     grupo cuando se mira TODO, así que la fila del mes existe únicamente ahí; con
     un mes puesto, su recuento se recoge en el propio título de la sección. */
  /* UNA fila de cabecera, no tres. Antes iban seguidos el rótulo del paso, la
     fila del mes y el enlace del desglose — y con un mes elegido los tres decían
     casi lo mismo, porque el mes ya lo dice la píldora de arriba y el paso el
     mando de los tres pasos. Aquí sólo hay más de un grupo cuando se mira TODO,
     que es cuando el nombre del mes vuelve a hacer falta. */
  var uno = orden.length === 1 && EX.mes !== '*';
  var cnt = function(l){ var t = sumaDe(l, topeDe), r = sumaDe(l, reclamaDe);
    return l.length+(l.length===1?' nota · ':' notas · ')+eur(t)+(r>0 ? ' · reclamas '+eur(r) : ''); };
  var h = '';
  orden.forEach(function(k){
    var id = k + (isDone ? '-d' : '-p');
    DSG[id] = g[k];
    /* Botón de verdad, no un texto subrayado con puntitos: el chevron dice que
       despliega, y girándolo dice si está abierto. Ancho fijo, así que la fila
       no se mueve al usarlo. */
    h += '<div class="ex-mesbar">'+
           '<span class="m">'+(uno ? '' : mesLbl(k)+' · ')+cnt(g[k])+'</span>'+
           '<span class="ex-dsgb" onclick="exDesglose(\''+id+'\',this)">'+
             '<span class="l">Desglose</span>'+
             '<svg viewBox="0 0 10 10" width="9" height="9" fill="currentColor" aria-hidden="true">'+
               '<path d="M1.1 3.3h7.8L5 8z"/></svg>'+
           '</span>'+
         '</div>'+
         '<div class="ex-dsgbox" id="dsg-'+id+'" style="display:none"></div>';
    g[k].forEach(function(n){ h += card(n, isDone); });
  });
  return h;
}

/* ════════ LO ENVIADO, AGRUPADO POR LO QUE TOCA HACER ════════
   Pedido el 14-sep-2026: todas las enviadas eran tarjetas verdes iguales,
   ordenadas por la fecha del servicio, y no se sabía qué se mandó cuándo ni
   qué había que mirar. Ahora, de arriba abajo:
     1. RECHAZADAS / NO SALIERON — en rojo, lo único que pide hacer algo.
     2. EN VUELING — por DÍA DE ENVÍO, que es como aparecen en el portal.
     3. PAGADAS — plegadas, por mes de cobro.
   Dentro de cada grupo, por fecha de servicio (lo que recuerda el tripulante). */
function importeHecho(n){ return tkDe(n) ? reclamaDe(n) : (topeDe(n)||0); }
function diaLocal(iso){
  if (typeof iso !== 'string') return null;
  var d = new Date(iso); if (isNaN(d.getTime())) return null;
  var p = function(x){ return (x < 10 ? '0' : '') + x; };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}
EX.pagAbierto = EX.pagAbierto || {};
window.exPagToggle = function(k){ EX.pagAbierto[k] = !EX.pagAbierto[k]; exRender(); };

function porEnvio(list){
  var porFecha = function(a, b){ return b.date.localeCompare(a.date); };
  var mal = [], viv = {}, ordV = [], pag = {}, ordP = [];
  list.forEach(function(n){
    var st = estadoEnvio(n), k;
    if (st === 'rej' || st === 'err'){ mal.push(n); return; }
    if (st === 'paid'){
      k = (diaLocal(EX.paid[n.id]) || 'sin').slice(0, 7);
      if (!pag[k]){ pag[k] = []; ordP.push(k); } pag[k].push(n); return;
    }
    k = diaLocal(EX.sent[n.id]) || 'sin';
    if (!viv[k]){ viv[k] = []; ordV.push(k); } viv[k].push(n);
  });
  var desc = function(a, b){ return a === 'sin' ? 1 : b === 'sin' ? -1 : b.localeCompare(a); };
  var cnt = function(l){ return l.length + (l.length === 1 ? ' nota · ' : ' notas · ') + eur(sumaDe(l, importeHecho)); };
  var h = '';

  if (mal.length){
    h += '<div class="ex-sect ex-gsect bad">RECHAZADAS O NO SALIERON · ' + cnt(mal) + '</div>';
    mal.sort(porFecha).forEach(function(n){ h += card(n, true); });
  }
  if (ordV.length){
    h += '<div class="ex-sect ex-gsect">EN VUELING · PENDIENTES DE COBRO</div>';
    ordV.sort(desc).forEach(function(k){
      h += '<div class="ex-mesbar"><span class="m">' +
        (k === 'sin' ? 'Sin fecha de envío' : 'Enviadas el ' + fdate(k).toLowerCase()) +
        ' · ' + cnt(viv[k]) + '</span></div>';
      viv[k].sort(porFecha).forEach(function(n){ h += card(n, true); });
    });
  }
  if (ordP.length){
    h += '<div class="ex-sect ex-gsect">PAGADAS</div>';
    ordP.sort(desc).forEach(function(k){
      var ab = !!EX.pagAbierto[k];
      h += '<div class="ex-mesbar plegable' + (ab ? ' abierto' : '') + '" onclick="exPagToggle(\'' + k + '\')">' +
        '<span class="m">' + (k === 'sin' ? 'Sin fecha' : 'Cobradas en ' + mesLbl(k)) + ' · ' + cnt(pag[k]) + '</span>' +
        '<svg viewBox="0 0 10 10" width="9" height="9" fill="currentColor" aria-hidden="true">' +
          '<path d="M1.1 3.3h7.8L5 8z"/></svg></div>';
      if (ab) pag[k].sort(porFecha).forEach(function(n){ h += card(n, true); });
    });
  }
  return h;
}

/* Las TRES fechas de una nota, cada una con su nombre. Antes salía sólo la del
   servicio, sin rótulo, y se confundía con la del ticket y con la del envío. */
function diasEntre(a, b){
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}
function fechasFila(n, isDone){
  var dd = function(f){ return sinDia(fdate(f)).toUpperCase(); };
  var h = '<span class="f"><i>SERVICIO</i>' + esc(fdate(n.date).toUpperCase()) + '</span>';
  var fs = (EX.tkFechas || {})[n.id] || [];
  if (fs.length){
    var win = n.ticketWindow || tipoDe(n.kind).win;
    /* En las pernoctas cada línea es de un día distinto: ahí la ventana se mide
       por línea y desde la tarjeta no se puede juzgar sin dar falsos avisos. */
    var fuera = n.kind !== 'voucher' && Array.isArray(win) && win.length && fs.some(function(f){
      var d = diasEntre(n.date, f);
      return d < Math.min.apply(null, win) || d > Math.max.apply(null, win);
    });
    var txt = (fs.length === 1 && fs[0] === n.date) ? 'MISMO DÍA' : fs.slice().sort().map(dd).join(', ');
    h += '<span class="f' + (fuera ? ' warn' : '') + '"><i>TICKET</i>' + esc(txt) +
         (fuera ? ' · FUERA DE PLAZO' : '') + '</span>';
  }
  var s = diaLocal(EX.sent[n.id]);
  if (isDone && s) h += '<span class="f"><i>ENVIADA</i>' + esc(dd(s)) + '</span>';
  return '<span class="ex-dd ex-fechas">' + h + '</span>';
}

/* ════════ DESGLOSE DEL MES ════════
   La tarjeta cuenta una nota; esto cuenta el MES: de qué día sale cada euro,
   qué tope le pone el convenio y cuánto ticket llevas puesto en esa línea
   concreta. Es lo que se mira antes de sentarse a pasar las notas al portal —
   y lo que enseña, línea a línea, dónde falta la foto. */
var DSG = {};
function desglose(list){
  var filas = (list||[]).slice().sort(function(a,b){ return a.date.localeCompare(b.date); })
    .map(function(n){
      var tit = tituloDe(n);
      return (n.lines||[]).map(function(l, i){
        var tk = tkDeLinea(n, i), cap = Number(l.cap)||0;
        var etq = l.slotLabel && tit.indexOf(l.slotLabel) < 0 ? tit+' · '+l.slotLabel : tit;
        return '<div class="ex-dsg-r">'+
          '<div class="d">'+esc(sinDia(fdate(l.date || n.date)))+'</div>'+
          '<div class="c">'+esc(etq)+
            '<span>'+esc(l.subtype)+(l.window ? ' · '+esc(l.window) : '')+'</span></div>'+
          '<div class="t">'+(cap ? eur(cap) : '—')+'</div>'+
          '<div class="k'+(tk ? (cap && tk > cap ? ' over' : '') : ' no')+'">'+
            (tk ? eur(tk) : 'falta')+'</div>'+
        '</div>';
      }).join('');
    }).join('');
  return '<div class="ex-dsg">'+
    '<div class="ex-dsg-r hd"><div class="d">DÍA</div><div class="c">CONCEPTO</div>'+
      '<div class="t">TOPE</div><div class="k">TICKET</div></div>'+
    filas +
    '<div class="ex-dsg-r tot"><div class="d">TOTAL</div>'+
      '<div class="c">reclamas <b>'+eur(sumaDe(list, reclamaDe))+'</b></div>'+
      '<div class="t">'+eur(sumaDe(list, topeDe))+'</div>'+
      '<div class="k">'+eur(sumaDe(list, tkDe))+'</div></div>'+
    '<div class="ex-dsg-f">El <b>tope</b> es el máximo que abona el convenio para esa franja y '+
      'ese ámbito (art. 10.1 y tablas de dietas); el <b>ticket</b> es lo que llevas justificado. '+
      'Se cobra lo menor de los dos: sin ticket no se aprueba, y lo que pase del tope no se abona.'+
    '</div></div>';
}
/* ⚠️ El texto del botón NO se toca al abrir y cerrar.
   Antes se reescribía a «ver desglose del mes» / «ocultar desglose»: dos
   longitudes distintas para el mismo botón, y la larga no cabía — se partía en
   dos líneas y rompía la fila. Ahora el botón dice siempre lo mismo y lo que
   cambia es el chevron, que gira. Es lo que hace todo el mundo y ocupa igual
   esté abierto o cerrado. */
window.exDesglose = function(id, el){
  var box = document.getElementById('dsg-'+id);
  if (!box) return;
  var abierto = box.style.display !== 'none' && box.innerHTML;
  if (abierto){ box.style.display = 'none'; el.classList.remove('on'); return; }
  if (!box.innerHTML) box.innerHTML = desglose(DSG[id]);
  box.style.display = ''; el.classList.add('on');
};

/* ════════ LA TARJETA: CABECERA A LA VISTA, DETALLE PLEGADO ════════
   Antes cada nota traía de golpe la tira de franjas, el desglose línea a línea,
   el porqué, tres avisos y dos botones: ~300 px por nota, dos notas por
   pantalla. Y de esas seis cosas sólo una decide algo al pasar la lista —
   cuántos tickets llevas—, así que es la única que se queda fuera junto al día,
   el nombre y el importe. El resto sigue ENTERO un toque más allá; nada se
   pierde, sólo deja de gritar a la vez. */
/* ════════ QUÉ FALTA PARA COBRARLA ════════
   El desglose de líneas decía los mismos datos en letra de 10 px y en gris: el
   piloto tenía que RESTAR mentalmente el ticket del tope para saber si esa
   línea estaba lista. Aquí cada requisito de la nota —el nº de ISO cuando lo
   pide, y el ticket de cada línea— dice su estado con una palabra grande y su
   color, y debajo la cuenta que la sostiene.

   Sustituye al desglose, no se suma a él: decir dos veces lo mismo en la misma
   tarjeta es exactamente el ruido que se quitó en Beta.772. */
var REQ_EST = {
  falta:    { l:'PENDIENTE',      c:'warn' },
  parcial:  { l:'INCOMPLETO',     c:'part' },
  ok:       { l:'COMPLETO',       c:'ok'   },
  sobra:    { l:'TOPE SUPERADO',  c:'warn' },
  puesto:   { l:'',               c:'ok'   }   // el ISO: manda el número
};
function requisitos(n){
  var out = [];
  if (n.needsISO) out.push({
    k:'Nº DE ISO', est: isoDe(n) ? 'puesto' : 'falta',
    grande: isoDe(n) || null,
    sub: isoDe(n) ? 'lo dio la tripulación' : 'te lo da la tripulación técnica o de cabina',
    accion:'iso'
  });
  (n.lines||[]).forEach(function(l, i){
    var tk = tkDeLinea(n, i), cap = Number(l.cap) || 0, est, sub;
    if (!tk)                 { est='falta';   sub = cap ? 'hasta '+eur(cap) : 'lo que sume el ticket'; }
    else if (!cap)           { est='ok';      sub = eur(tk)+' justificados'; }
    else if (tk > cap)       { est='sobra';   sub = eur(tk)+' · reclamas '+eur(cap); }
    else if (tk < cap)       { est='parcial'; sub = eur(tk)+' · te faltan '+eur(r2(cap-tk)); }
    else                     { est='ok';      sub = eur(tk)+' · tope alcanzado'; }
    out.push({
      k: sinDia(fdate(l.date||n.date)).toUpperCase()+' · '+String(l.slotLabel||'').toUpperCase()+
         (l.window ? '  '+l.window : (l.where ? '  '+ciudad(l.where) : '')),
      est: est, sub: sub, accion:'tk'
    });
  });
  return out;
}
function bloqueFalta(n, isDone){
  var reqs = requisitos(n);
  if (!reqs.length) return '';
  var listos = reqs.filter(function(r){ return r.est==='ok' || r.est==='puesto' || r.est==='sobra'; }).length;
  var todo = listos === reqs.length;

  return '<div class="ex-falta'+(todo?' full':'')+'">'+
    '<div class="ex-falta-h"><span class="t">'+(isDone ? 'LO QUE LLEVABA' :
      todo ? 'LISTA PARA PASARLA' : 'QUÉ FALTA PARA COBRARLA')+'</span>'+
      '<span class="p">'+listos+' / '+reqs.length+'</span></div>'+
    reqs.map(function(r){
      var E = REQ_EST[r.est];
      return '<div class="ex-req '+E.c+'">'+
        '<div class="ex-req-k">'+esc(r.k)+'</div>'+
        '<div class="ex-req-b">'+
          '<div class="ex-req-v">'+esc(r.grande || E.l)+'</div>'+
          (isDone ? '' :
            r.accion==='iso' && !r.grande
              ? '<span class="ex-req-go" onclick="event.stopPropagation();exSetIso(\''+n.id+'\')">Añadir</span>'
              : r.est!=='ok' && r.est!=='puesto'
                ? '<span class="ex-req-go" onclick="event.stopPropagation();exOpen(\''+n.id+'\')">'+
                  (r.accion==='iso'?'Cambiar':'📷 Foto')+'</span>'
                : '')+
        '</div>'+
        '<div class="ex-req-s">'+esc(r.sub)+'</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

function card(n, isDone){
  var T = tipoDe(n.kind), left = daysLeft(n.date);
  var nL = (n.lines||[]).length, kL = lineasConTk(n), tk = tkDe(n);

  var chip = n.kind==='voucher'
    ? '<span class="ex-chip tipo">'+n.lines.length+' VOUCHER'+(n.lines.length===1?'':'S')+'</span>'
    : '<span class="ex-chip tipo">'+(n.manual?'A MANO':'AUTO')+'</span>';
  var sc = (n.kind!=='voucher' && n.scope==='int') ? '<span class="ex-chip int">INT</span>' : '';

  var bar = '';
  if (n.kind!=='voucher' && n.lines.length && n.lines[0].slot){
    var on = {}, cat = {}, vou = {};
    n.lines.forEach(function(l){ if (l.slot) on[l.slot]=1; });
    (n.covered.catering||[]).forEach(function(s){ cat[s]=1; });
    (n.covered.voucher ||[]).forEach(function(s){ vou[s]=1; });
    bar = '<div class="ex-slots"><div class="ex-slotbar">'+
      SLOTS.map(function(s){
        var cls = on[s.id]?'on':cat[s.id]?'cat':vou[s.id]?'vou':'';
        return '<div class="ex-sl '+cls+'"><span>'+s.ic+'</span></div>'; }).join('')+
      '</div><div class="ex-slotlbl">'+SLOTS.map(function(s){return '<div>'+s.lbl+'</div>';}).join('')+'</div>';
    var leg = [];
    if (Object.keys(on).length)  leg.push('<b>'+Object.keys(on).length+' te la pagas tú</b>');
    if (Object.keys(cat).length) leg.push(Object.keys(cat).length+' las cubre el catering');
    if (Object.keys(vou).length) leg.push('<i>'+Object.keys(vou).length+' la cubre el voucher</i>');
    bar += '<div class="ex-legend">'+leg.join(' · ')+'</div></div>';
  }

  var titulo = tituloDe(n), sub = n.route || '';
  if (n.kind==='voucher' && n.lines.length){
    /* Una guardia en el hotel NO es una noche: es un voucher del día. Contarla
       como noche diría "5 noches" de una línea de 4 y el piloto no podría
       cuadrar el subtítulo con el desglose de debajo. */
    var noches = n.lines.filter(function(l){ return !/Firma|Standby/i.test(l.subtype); }).length;
    var tarde  = n.lines.some(function(l){ return /Firma/i.test(l.subtype); });
    var guard  = n.lines.filter(function(l){ return /Standby/i.test(l.subtype); }).length;
    sub = sinDia(fdate(n.date)) + ' → ' + sinDia(fdate(n.lines[n.lines.length-1].date)) +
          '  ·  ' + noches + (noches===1?' noche':' noches') +
          (guard ? ' + ' + guard + (guard===1?' guardia':' guardias') : '') +
          (tarde?' + firma tarde':'');
  }

  /* Cada línea con SU día: en las pernoctas las noches son de días distintos al
     de la tarjeta, y sin la fecha delante no hay forma de saber de dónde sale
     cada importe. Detrás, lo que llevas de ticket en esa línea concreta. */
  var lines = '<div class="ex-lines">' + n.lines.map(function(l, i){
    var t = tkDeLinea(n, i), cap = Number(l.cap)||0;
    /* Ámbar cuando el ticket pasa del tope: no es que falte, es que ese exceso
       no lo abona nadie — mejor saberlo aquí que al cobrar. */
    var cls = t ? (cap && t > cap ? 'over' : '') : 'no';
    return '<div class="ex-ln"><div class="k"><b>'+esc(sinDia(fdate(l.date||n.date)))+'</b> '+
      esc(l.slotLabel)+
      (l.window?' <span>'+esc(l.window)+'</span>':(l.where?' <span>'+esc(ciudad(l.where))+'</span>':''))+
      '</div><div class="v">'+eur(l.cap)+
      '<i class="'+cls+'">'+(t ? 'ticket '+eur(t)+(cls==='over'?' · pasa del tope':'') : 'sin ticket')+'</i>'+
      '</div></div>'; }).join('') + '</div>';

  /* "¿por qué?" plegado: el que se fía no lo abre nunca; el que duda lo abre
     una vez y ya se fía. Sólo tiene sentido donde hay franjas y jornada. */
  var why = '';
  if ((n.segments||[]).length && (n.slots||[]).length){
    why = '<div class="ex-whybar"><span class="ex-whyb" onclick="event.stopPropagation();exWhy(\''+
      n.id+'\',this)">¿por qué?</span></div>'+
      '<div class="ex-whybox" id="why-'+n.id+'" style="display:none"></div>';
  }

  /* ── El chip de tickets es el ATAJO A LA CÁMARA ──
     Es el único mando que se queda en la tarjeta plegada, y no por adorno: la
     foto es la ÚNICA tarea de esta pantalla, así que no puede quedar detrás de
     un despliegue. Dice además cuánto falta con números, no con un «sin
     tickets» que ya salía cuatro veces en la misma tarjeta. */
  /* Enviada: sin chip. «✓ 211,30 € en tickets» en verde se leía como lo que
     cobras, y el estado ya lo dice la franja — era la tercera vez. */
  var tkc = isDone
    ? ''
    : '<span class="ex-tkchip'+(kL===0 ? '' : kL<nL ? '' : ' ok')+'" '+
        'onclick="event.stopPropagation();exOpen(\''+n.id+'\')">'+
        (kL===0 ? (nL===1 ? 'Falta 1 ticket' : 'Faltan '+nL+' tickets')
                : kL<nL ? kL+' de '+nL+' líneas'
                : '✓ '+eur(tk)+' en tickets')+'</span>';

  /* Un plazo pasado se dice con palabras. «-158 días» es una resta con signo,
     y a primera vista se lee como si aún quedara algo. */
  var plazo = isDone ? ''
    : left < 0  ? '<span class="ex-plazo bad">PLAZO VENCIDO</span>'
    : left <= 20 ? '<span class="ex-plazo warn">'+left+(left===1?' día':' días')+'</span>'
    : '';

  var avisos = '';
  if (!isDone && n.needsISO) avisos += isoDe(n)
    ? '<div class="ex-note">Nº de ISO <b>'+esc(isoDe(n))+'</b> · <span class="ex-lnk" onclick="event.stopPropagation();exSetIso(\''+n.id+'\')">cambiar</span></div>'
    : '<div class="ex-note">Requiere <b>nº de ISO</b> — lo hace la tripulación técnica o de cabina. <span class="ex-lnk" onclick="event.stopPropagation();exSetIso(\''+n.id+'\')">Añadirlo</span></div>';

  var nTk = EX.tkCount[n.id] || 0;
  /* La tarjeta entera se tiñe del estado del ENVÍO y la franja lo dice con
     palabras, plegada o desplegada: es lo primero que se busca al entrar. La
     barra vertical de la izquierda sigue siendo la del TIPO de nota.
     En modo "enviar varias" la tarjeta hace además de casilla — acertar en un
     cuadradito de 18px en el móvil es pedir demasiado. */
  var stE = estadoEnvio(n);
  var selble = EX.selMode && (stE === 'go' || stE === 'new');
  var marcada = selble && (EX.sel || {})[n.id];
  /* El título sólo si DICE algo que la cabecera de tipo no diga ya. En una nota
     automática `tituloDe` devuelve la etiqueta del tipo, así que con la cabecera
     puesta salía «Horno inoperativo» dos veces en cuatro centímetros. Donde sí
     aporta —una pernocta («Pernocta en Roma»), una nota escrita a mano— se queda. */
  var titFuera = titulo && titulo !== T.lbl;

  /* ── UNA zona de toque, la tarjeta plegada entera ──────────────────────────
     Pedido el 11-sep-2026: «que al pulsar sobre el ticket se abra más fácilmente».
     Y no era manía: el único sitio que abría la tarjeta era `.ex-head`, así que la
     franja de estado, la fila de chips y todo el aire alrededor no hacían NADA al
     tocarlos. Desde el asiento del piloto «he fallado el blanco» y «esto no se
     abre» se ven igual — es el fallo mudo, esta vez en un gesto.

     Ahora abre todo lo que se ve con la tarjeta plegada: cabecera de tipo, estado,
     fila principal y chips. El CUERPO se queda FUERA a propósito: ahí dentro hay
     botones, enlaces y el desglose, y tocarlo no puede cerrar la tarjeta que
     estás leyendo. Los mandos de dentro de la zona ya cortan la burbuja con
     `event.stopPropagation()`, que es lo que los mantiene independientes.

     En modo «enviar varias» la tarjeta entera ES la casilla (exSelToggle), así que
     ahí no se cuelga el toggle: si no, el mismo dedo marcaría y desplegaría. */
  return '<div class="ex-day k-'+esc(n.kind)+' st-'+stE+(isDone?' done':'')+((EX.flash||{})[n.id]?' recien':'')+
      (selble?' selble':'')+(marcada?' marcada':'')+'" style="--tcol:'+T.col+'"'+
      ' data-nota="'+n.id+'"'+(n.manual?' data-man="1"':'')+
      (selble?' onclick="exSelToggle(\''+n.id+'\')"':'')+'>'+
    (selble ? '<div class="ex-tick">'+(marcada?'✓':'')+'</div>' : '')+
    /* ⚠ El panel y la zona táctil van DENTRO DEL MISMO envoltorio, no sueltos en
       la tarjeta. Colgando de `.ex-day` el panel medía **151 px de alto contra
       los 139 de lo que se desliza**: los 12 de padding sobraban por abajo y el
       rojo asomaba en forma de L por debajo del contenido. Y llevaba su propio
       radio (14) dentro de una tarjeta de 16 con `overflow:hidden`, así que entre
       los dos quedaba una uña del fondo — «el azul tapa la línea roja». Dentro
       del envoltorio el panel es `inset:0` de EXACTAMENTE lo que se revela y el
       radio es uno solo. Nada de cablear ese 12: un número que tiene que
       coincidir con una altura calculada acaba desviándose siempre.
       Sólo en las notas a mano: las automáticas las manda el roster y volverían a
       salir, así que un borrado ahí sería mentira. */
    '<div class="ex-swipe">'+
    (n.manual ? '<div class="ex-swipe-del" onclick="event.stopPropagation();exDelNota(\''+n.id+'\')">'+
       '<span class="fl" aria-hidden="true">'+iconoFlechaIzq()+'</span>'+
       /* Icono EN DISCO sobre el rótulo, no los dos en fila: en una columna de
          96 px la fila deja el icono pegado al texto y no se lee ninguno de los
          dos. El disco le da un centro a la mirada y hace que parezca un botón
          y no dos glifos flotando sobre un fondo rojo. */
       '<span class="ac"><span class="dk">'+iconoPapelera()+'</span>'+
       '<span class="tx">Eliminar</span></span></div>' : '')+
    '<div class="ex-tap"'+(selble?'':' onclick="exToggle(\''+n.id+'\',this)"')+'>'+
    cabeceraTipo(n, T)+
    franjaEstado(n)+
    '<div class="ex-head">'+
      '<span class="ex-hmid">'+
        fechasFila(n, isDone)+
        (titFuera ? '<span class="ex-title">'+esc(titulo)+'</span>' : '')+
        (sub ? '<span class="ex-route">'+esc(sub)+'</span>' : '')+
      '</span>'+
      '<span class="ex-right">'+
        /* El importe grande es el TOPE (por eso el "hasta"); debajo, lo que de
           verdad reclamas con los tickets que llevas puestos. */
        /* Enviada: manda lo RECLAMADO, y el total del recibo va debajo en gris
           («de 211,30 € de ticket») para que no se lea como dinero a cobrar. */
        (isDone
          ? '<span class="ex-amt">'+eur(importeHecho(n))+
              '<small>'+(tkDe(n) ? 'RECLAMADO' : 'TOPE')+'</small>'+
              (tkDe(n) > reclamaDe(n) ? '<em class="de">de '+eur(tkDe(n))+' de ticket</em>' : '')+'</span>'
          : '<span class="ex-amt">'+eur(topeDe(n)===null ? tkDe(n) : topeDe(n))+
              '<small>HASTA</small>'+
              (tkDe(n) ? '<em>'+eur(reclamaDe(n))+' con tickets</em>' : '')+'</span>')+
        /* El chevron también DIBUJADO: es la misma regla del icono del tipo, y
           un carácter geométrico tampoco lo elige el código. */
        '<span class="ex-caret" aria-hidden="true"><svg viewBox="0 0 10 10" width="10" '+
          'height="10" fill="currentColor"><path d="M1.1 3.3h7.8L5 8z"/></svg></span>'+
      '</span>'+
    '</div>'+
    (tkc || plazo ? '<div class="ex-chips">'+tkc+plazo+'</div>' : '')+
    avisoDup(n)+
    '</div>'+
    '</div>'+
    '<div class="ex-body" id="exb-'+n.id+'" style="display:none">'+
      /* De dónde sale la nota, el ámbito y cuántos vouchers agrupa: contexto
         para cuando ya la estás mirando, no para elegir cuál mirar. */
      '<div class="ex-chips">'+chip+sc+'</div>'+
      bar + bloqueFalta(n, isDone) + why +
      /* El botón de la derecha ya no es "marcar como enviado": lleva la nota por
         su ciclo — Ver la nota → Enviar → Enviada → Pagada — y cambia de color
         con él. "No enviado" se queda para deshacer una marca a mano. */
      '<div class="ex-row">'+
        '<div class="ex-btn" onclick="event.stopPropagation();exOpen(\''+n.id+'\')">'+
          (nTk ? '🧾 '+nTk+' ticket'+(nTk>1?'s':'')+' · abrir' : '📷 Añadir tickets')+'</div>'+
        botonCiclo(n)+
        /* ⋯ = TODO lo que se puede hacer desde este estado. Es el que rompe el
           carril único: «ya me la han pagado» está aquí también cuando la nota
           todavía no se ha enviado. */
        '<button class="ex-mas" title="Más opciones" aria-label="Más opciones" '+
          'onclick="event.stopPropagation();exMasMenu(\''+n.id+'\')">⋯</button>'+
      '</div>'+
      /* ⚠ La papelera va en SU PROPIA FILA, abajo a la derecha, y no apretada al
         final de la de los botones. Medido con la tarjeta desplegada: ahí salía
         de **21 px** de ancho junto a dos botones de 133 —la mitad del mínimo de
         44 que se puede tocar con el pulgar—, y así llegó el reporte: «ha
         desaparecido la papelera». No había desaparecido; era intocable. Es la
         luna de las pernoctas y la ✕ del modo inspección otra vez: el DOM decía
         que estaba y la pantalla decía que no. */
      (n.manual ? '<div class="ex-row ex-row-del">'+
        '<button class="ex-del" title="Eliminar nota" aria-label="Eliminar nota" '+
        'onclick="event.stopPropagation();exDelNota(\''+n.id+'\')">'+
        iconoPapelera()+'<span>Eliminar</span></button></div>' : '')+
    '</div></div>';
}

/* La papelera se DIBUJA. El 🗑 lo pinta la fuente del móvil del piloto —la
   lección de la luna de las pernoctas— y a 13 px salía un borrón: es justo el
   botón que el piloto reportó como «ha desaparecido». Un trazado no adelgaza en
   otro sistema ni se lo sustituye un emoji. */
/* La flecha que dice HACIA DÓNDE se desliza. Dibujada, no un «‹»: un carácter
   lo pinta la fuente del móvil del piloto —la lección de la luna de las
   pernoctas— y aquí es justo lo que tiene que explicar el gesto. */
/* El mismo recibo en otra nota. Va en la tarjeta PLEGADA: es justo antes de
   enviar cuando hay que verlo, no dentro de un desplegable. */
function avisoDup(n){
  var otras = ((EX.tkDup || {})[n.id] || []).map(notaDe).filter(Boolean);
  if (!otras.length) return '';
  return '<div class="ex-dup">⚠ El mismo ticket va también en ' +
    otras.map(function(o){
      return '<b>' + esc(tipoDe(o.kind).lbl) + '</b> del ' + esc(sinDia(fdate(o.date)).toLowerCase());
    }).join(', ') + '. Vueling puede rechazar una de las dos.</div>';
}

function iconoFlechaIzq(){
  return '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">'+
    '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" '+
    'stroke-linejoin="round" d="M14 5l-7 7 7 7"/></svg>';
}

/* ── LA PAPELERA, DE TRAZO ────────────────────────────────────────────────────
   «Modifica el botón de eliminar nota por un icono mucho más bonito. Que se vea
   perfectamente en modo día y modo noche» (12-sep-2026).

   Era una mancha SÓLIDA de 17 px: a ese tamaño una silueta rellena no enseña la
   forma de nada, sólo un bulto oscuro con el contorno de un bote. El trazo sí
   dibuja el objeto —tapa, asa, cuerpo que se estrecha y las dos ranuras— y es
   además **el lenguaje que la app ya tiene**: `iconoFlechaIzq`, que vive tres
   líneas más arriba y se pinta al lado en el mismo panel, es de trazo redondeado.
   Dos iconos vecinos con dos lenguajes distintos se ven como un descuido.

   Sigue DIBUJADA, que es lo que no se negocia: el 🗑 lo pinta la fuente del móvil
   del piloto —la lección de la luna de las pernoctas— y a 13 px salía un borrón,
   que es justo el botón que se reportó como «ha desaparecido».

   El grosor (1,9 sobre 24, o sea ~1,4 px a 18) es un DATO, no un gusto: por
   debajo se adelgaza hasta el pelo de la luna y por encima vuelve a ser el bulto.
   `ticket-papelera-test` cuenta la tinta en los dos temas. */
function iconoPapelera(){
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" '+
    'fill="none" stroke="currentColor" stroke-width="1.9" '+
    'stroke-linecap="round" stroke-linejoin="round">'+
      '<path d="M9.8 6.2V5a1.6 1.6 0 0 1 1.6-1.6h1.2A1.6 1.6 0 0 1 14.2 5v1.2"/>'+  /* el asa */
      '<path d="M4.6 6.6h14.8"/>'+                                                  /* la tapa */
      '<path d="M6.5 6.6l.78 12.4A2.2 2.2 0 0 0 9.47 21h5.06a2.2 2.2 0 0 0 2.19-2l.78-12.4"/>'+
      '<path d="M10.3 10.4v6.6M13.7 10.4v6.6"/>'+                                   /* las ranuras */
    '</svg>';
}

/* ── DESLIZAR A LA IZQUIERDA PARA BORRAR ─────────────────────────────────────
   Pedido el 11-sep-2026. Es el PRIMER deslizamiento de la app: si algún día
   hace falta otro, se saca de aquí y se comparte — no se copia (el fallo de
   `ES_AIRPORTS` / `ES_IATA`).

   Tres cosas que no son adorno:

   · **Sólo las notas a mano.** Las automáticas las manda el roster y volverían
     a salir en el siguiente render; deslizar una y ver cómo reaparece sería
     peor que no poder deslizarla.
   · **El gesto no le roba el scroll a la lista.** Hasta que el dedo no lleva
     más recorrido horizontal que vertical (y 12 px), esto no hace nada: si no,
     bajar por las notas engancharía tarjetas de lado a cada paso.
   · **Deslizar NO borra: descubre el botón.** Un gesto no puede ser la
     confirmación de algo irreversible — se abre el panel y el piloto pulsa,
     y ahí sale el mismo pop-up que en la papelera. Un borrado que pasa con el
     dedo resbalando es dinero reclamado que desaparece sin que nadie lo diga.

   Se engancha por DELEGACIÓN al contenedor de la pestaña, una sola vez: las
   tarjetas se rehacen en cada `exRender()` y unos listeners por tarjeta se
   quedarían colgando del DOM viejo. */
var SW_ANCHO = 96;                      // lo que asoma el panel, y el CSS lo repite
var _swOn = false, _sw = null;
function exSwipeInit(){
  if (_swOn) return;
  var host = document.getElementById('pc-tab-gastos');
  if (!host) return;
  _swOn = true;

  function cierra(card){ if (card) card.classList.remove('sw'); }
  function cierraTodas(menos){
    var abiertas = host.querySelectorAll('.ex-day.sw');
    for (var i = 0; i < abiertas.length; i++) if (abiertas[i] !== menos) cierra(abiertas[i]);
  }

  host.addEventListener('pointerdown', function(ev){
    var card = ev.target.closest && ev.target.closest('.ex-day[data-man="1"]');
    /* Tocar DENTRO del panel abierto es pulsar el botón, no empezar un gesto. */
    if (ev.target.closest && ev.target.closest('.ex-swipe-del')) return;
    if (!card) { cierraTodas(null); return; }
    _sw = { card: card, x0: ev.clientX, y0: ev.clientY, dx: 0, vivo: false,
            abierta: card.classList.contains('sw') };
  }, { passive: true });

  host.addEventListener('pointermove', function(ev){
    if (!_sw) return;
    var dx = ev.clientX - _sw.x0, dy = ev.clientY - _sw.y0;
    if (!_sw.vivo) {
      /* Nada hasta saber que el gesto es HORIZONTAL. */
      if (Math.abs(dy) > Math.abs(dx)) { _sw = null; return; }
      if (Math.abs(dx) < 12) return;
      _sw.vivo = true;
      cierraTodas(_sw.card);
    }
    var base = _sw.abierta ? -SW_ANCHO : 0;
    _sw.dx = Math.max(-SW_ANCHO, Math.min(0, base + dx));
    /* El desplazamiento se escribe en la TARJETA, no en la zona táctil: la zona
       táctil y el panel se mueven JUNTOS con él, así que el panel entra desde
       fuera del borde en vez de estar debajo esperando. Con el panel debajo, la
       zona táctil tenía que taparlo —y no puede: la tarjeta es de cristal—, que
       es exactamente cómo el rojo acabó viéndose con la tarjeta cerrada.
       El contenido del panel CRECE con `--swp`. Son dos variables CSS y no una
       animación: se escriben dos propiedades por frame y de ahí para abajo lo
       compone la GPU —aquí un bucle de rAF ya costó 209 ms por interacción tres
       pantallas más allá—. Al soltar manda la clase `sw`, con su transición. */
    _sw.card.style.setProperty('--dx', _sw.dx + 'px');
    _sw.card.style.setProperty('--swp', (Math.abs(_sw.dx) / SW_ANCHO).toFixed(3));
  }, { passive: true });

  function suelta(){
    if (!_sw) return;
    var card = _sw.card, vivo = _sw.vivo, dx = _sw.dx;
    _sw = null;
    card.style.removeProperty('--dx');       // manda la clase, no el estilo en línea
    card.style.removeProperty('--swp');      // ídem: a partir de aquí decide `sw`
    if (!vivo) return;
    /* Pasado el tercio, se queda abierto; si no, vuelve. */
    if (dx < -SW_ANCHO / 3) card.classList.add('sw'); else card.classList.remove('sw');
  }
  host.addEventListener('pointerup', suelta, { passive: true });
  host.addEventListener('pointercancel', suelta, { passive: true });
  /* Al repintar, ninguna queda abierta: la tarjeta de debajo puede ser otra. */
  window.addEventListener('pilotos-gastos-render', function(){ cierraTodas(null); });
}

/* ════════ HOJA DE DETALLE ════════ */
var SHEET = null, TICKETS = [];
function sheetEl(){
  var s = document.getElementById('ex-sheet');
  if (!s){
    s = document.createElement('div');
    s.id = 'ex-sheet'; s.className = 'ex-sheet';
    s.innerHTML = '<div class="ex-sheetin"><div class="ex-grab"></div><div id="ex-sheetbody"></div></div>';
    s.addEventListener('click', function(ev){ if (ev.target === s) exClose(); });
    document.body.appendChild(s);
  }
  return s;
}
function cargarTickets(){
  TICKETS.forEach(function(t){ if (t.url) URL.revokeObjectURL(t.url); });
  return tkAll().then(function(list){
    TICKETS = list || [];
    TICKETS.forEach(function(t){ if (t.blob) t.url = URL.createObjectURL(t.blob); });
  }).catch(function(){ TICKETS = []; });
}
function lineKey(n,i){ return n.id + '#' + i; }
function tksOf(k){ return TICKETS.filter(function(t){ return t.lineKey === k; }); }
function notaDe(id){ var a = todas(); for (var i=0;i<a.length;i++) if (a[i].id===id) return a[i]; return null; }

window.exOpen = function(id){
  SHEET = id;
  // ⚠️ sheetEl() PRIMERO: crea el contenedor. Si se llama después, drawSheet()
  // escribe sobre un #ex-sheetbody que aún no existe y la hoja no abre. Sólo
  // fallaba al abrir una nota sin haber pasado antes por "Nueva nota" (que sí
  // creaba el contenedor), así que pasaba desapercibido.
  var el = sheetEl();
  cargarTickets().then(function(){ drawSheet(); el.classList.add('on'); });
};
/* Cerrar la hoja llamaba SIEMPRE a contarTickets(), que lee IndexedDB entera y
   repinta toda la pestaña. Abrir «Nueva nota» y cancelar —o mirar una nota sin
   tocarla— no cambia ni un ticket: era un repintado completo por cada vez que
   el piloto asomaba la cabeza. Ahora solo se recuenta si de verdad se ha
   añadido o borrado alguno. */
var TK_SUCIO = false;
window.exClose = function(){
  var s = document.getElementById('ex-sheet'); if (s) s.classList.remove('on');
  SHEET = null; SUBIENDO = null;
  if (TK_SUCIO){ TK_SUCIO = false; contarTickets(); }
};

function drawSheet(){
  var n = notaDe(SHEET); if (!n) return;
  var nTk = 0; n.lines.forEach(function(_,i){ nTk += tksOf(lineKey(n,i)).length; });

  var h = '<div class="ex-lbl2">CALCO DEL PORTAL</div>'+
    '<div class="ex-sh-t">'+esc(n.title||tipoDe(n.kind).lbl)+'</div>'+
    '<div class="ex-sh-s">Toca cada campo para copiarlo · '+n.lines.length+
      (n.lines.length===1?' línea':' líneas')+' en una sola nota</div>';
  h += cp('SELECT EXPENSE TYPE', n.portalType);

  n.lines.forEach(function(l,i){
    var key = lineKey(n,i), tks = tksOf(key);
    var suma = 0; tks.forEach(function(t){ suma += (Number(t.amount)||0); });
    suma = Math.round(suma*100)/100;
    var claim = Math.min(suma, l.cap), room = Math.round((l.cap-claim)*100)/100;

    h += '<div class="ex-grp">▸ ADD NEW EXPENSE LINE · '+(i+1)+' de '+n.lines.length+'</div>';
    /* ★ La FECHA se puede cambiar, y es el campo que más notas tumba.
       El portal admite el ticket aunque la hora y el sitio no cuadren con tu
       actividad —eso la guía lo permite expresamente— pero NO que la fecha se
       salga de la ventana del concepto (§5): comida no cargada D y D+1, horno y
       posicional D-1/D/D+1, cafeteras el día exacto. Como el ticket es de
       cuando fuiste a comprar y no de cuando volaste, la fecha del roster no
       siempre es la del recibo — y hasta ahora no había forma de corregirla.
       Debajo se dice qué días admite este concepto, para no adivinar. */
    var fDia = fechaLinea(n, i), movida = fDia !== (l.date || n.date);
    h += '<div class="ex-cp fecha'+(movida?' movida':'')+'" onclick="exSetFecha(\''+n.id+'\','+i+')">'+
      '<div><div class="k">DATE *</div><div class="v">'+esc(fDia.split('-').reverse().join('/'))+'</div>'+
      '<div class="h">'+(movida ? 'cambiada por ti · ' : '')+ventanaTxt(n)+'</div></div>'+
      '<div class="c">✎</div></div>';
    h += cp('EXPENSE TYPE', l.subtype);
    /* Con número puesto la fila se comporta como las demás: se toca y se copia
       para pegarla en el portal. Sin número no hay nada que copiar, así que lo
       que hace es abrir el campo para escribirlo. */
    if (n.needsISO) h += isoDe(n)
      ? cp('ISO NUMBER *', isoDe(n), 'iso', 'toca para copiar · ✎ para cambiarlo') +
        '<div class="ex-isoed" onclick="exSetIso(\''+n.id+'\')">✎ cambiar el nº de ISO</div>'
      : '<div class="ex-cp iso vacio" onclick="exSetIso(\''+n.id+'\')">'+
        '<div><div class="k">ISO NUMBER *</div><div class="v">Tocar para añadirlo</div>'+
        '<div class="h">te lo da la tripulación técnica o de cabina</div></div><div class="c">✎</div></div>';
    /* REASON: faltaba, y el portal lo pinta en rojo como obligatorio. En las
       incidencias es un desplegable cerrado de seis opciones — se enseña cuál
       va a salir y se puede cambiar sin salir de aquí. */
    h += '<div class="ex-cp motivo" onclick="exSetMotivo(\''+n.id+'\')">'+
      '<div><div class="k">REASON *</div><div class="v">'+esc(motivoDe(n))+'</div>'+
      '<div class="h">'+(reasonCerrado(n)
        ? 'desplegable del portal · toca para elegir otro'
        : 'texto libre · toca para cambiarlo')+'</div></div><div class="c">✎</div></div>';
    h += cp('COST *', (claim>0?claim:l.cap).toFixed(2).replace('.',','), '',
            claim>0 ? 'suma de tus tickets' : 'tope · aún sin tickets');

    /* Los que este aparato ha tocado y la nube aún no sabe. El dato ya existía
       (`EX.pend`, la cola de subida); lo que faltaba era enseñarlo. */
    var sinSubir = tks.filter(function(t){ return !!EX.pend['t:' + t.id]; }).length;

    h += '<div class="ex-tk"><div class="ex-tkhead"><div class="k">TICKETS DE ESTA LÍNEA</div>'+
      '<div class="n">'+tks.length+'</div></div><div class="ex-thumbs">'+
      tks.map(function(t){ return '<div class="ex-th">'+
        (t.url?'<img src="'+t.url+'" alt="ticket">':'<div class="ex-noimg">'+iconoNube()+'</div>')+
        /* ⚠️ DIBUJADA, no el carácter ☁: un glifo lo pinta la fuente del móvil
           del piloto —la lección de la luna de las pernoctas—, y aquí la marca
           es lo único que distingue «está en tu cuenta» de «sólo en este
           teléfono». */
        (EX.pend['t:' + t.id] ? '<div class="nb" title="Aún sin subir">'+iconoNube()+'</div>' : '')+
        '<div class="a">'+(Number(t.amount)||0).toFixed(2).replace('.',',')+'</div>'+
        '<div class="x" onclick="exDelTk(\''+t.id+'\')">✕</div>'+
        '<div class="dl" onclick="exOutTk(\''+t.id+'\')">↓</div></div>'; }).join('')+
      /* La casilla de lo que se está subiendo va DONDE VA A CAER el ticket, en
         su sitio de la tira, y DICE en qué está. */
      (SUBIENDO && SUBIENDO.key === key
        ? '<div class="ex-th cargando"><div class="ex-carga"><span class="ex-spin"></span>'+
          '<span class="t">'+esc(FASE_TXT[SUBIENDO.fase] || 'Un momento…')+'</span></div></div>'
        : '')+
      /* Cámara y galería siguen siendo dos botones —con capture="environment"
         iOS abre la cámara y ya no ofrece la fototeca, así que un ticket ya
         fotografiado no había forma de adjuntarlo (#GA5ST)— pero comparten UNA
         sola entrada de fichero, a la que se le pone o se le quita `capture`
         antes de abrirla.
         Antes eran dos <label> con su <input> dentro. Al cerrar el selector de
         la fototeca tocando FUERA, el primer toque en el otro botón se perdía y
         había que tocar dos veces para que se abriera la cámara: el toque se iba
         en devolver el foco al label anterior. Un onclick que llama a .click()
         se ejecuta en el primer toque, tenga el foco quien lo tenga, y con una
         única entrada no hay dos elementos peleándose por él. */
      '<div class="ex-add'+(exIsPro()?' pro':'')+'" onclick="exPickTk(\''+key+'\',1)">'+
        '<span class="i">📷</span><span class="l">Cámara</span></div>'+
      '<div class="ex-add'+(exIsPro()?' pro':'')+'" onclick="exPickTk(\''+key+'\',0)">'+
        '<span class="i">🖼</span><span class="l">Galería</span></div>'+
      '</div>'+
      (sinSubir
        ? '<div class="ex-nosub">'+iconoNube()+' <b>'+sinSubir+
          (sinSubir===1 ? ' ticket sin subir</b> — se sube solo' : ' tickets sin subir</b> — se suben solos')+
          ' en cuanto haya red. La foto vive en este teléfono; a tu cuenta viaja el importe.</div>'
        : '')+
      '<div class="ex-sum">'+
      (tks.length
        ? 'Suma <b>'+suma.toFixed(2).replace('.',',')+' €</b> · tope '+l.cap.toFixed(2).replace('.',',')+' €<br>'+
          (suma > l.cap
            ? '<span class="over">Te pasas del tope — reclamas '+l.cap.toFixed(2).replace('.',',')+' €</span>'
            : room > 0
              ? 'Te quedan <b>'+room.toFixed(2).replace('.',',')+' €</b> de margen — puedes añadir otro ticket'
              : '<span class="okc">Tope alcanzado</span>')
        : 'Sin tickets. <b>Sin ticket adjunto no se aprueba.</b>')+
      '</div></div>';
  });

  /* La entrada compartida por los botones de Cámara y Galería (ver exPickTk).
     ⚠️ NO con `display:none`: un <input type=file> oculto así lo ignora el
     Safari de iOS en algunos casos y el selector no llega a abrirse — se pulsa
     Galería y no pasa absolutamente nada. Se deja en el árbol de render pero
     invisible y sin tamaño, que es lo que sí respeta. */
  h += '<input type="file" accept="image/*" id="ex-file" ' +
       'style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;' +
       'clip:rect(0 0 0 0);border:0;padding:0">';

  h += '<div class="ex-note">El portal admite <b>5 recibos por nota</b> — llevas '+nTk+'.'+
       (nTk>5 ? ' <b>Te pasas: harán falta 2 notas.</b>' : '')+'</div>';
  h += exIsPro()
    ? '<div class="ex-note">☁️ Copia en la nube activa: tus tickets están también en tu cuenta.</div>'
    : '<div class="ex-plan">⚠️ Plan Free: las fotos se guardan <b>solo en este móvil</b>. '+
      'Si lo pierdes o cambias de teléfono, se pierden. Con Pro se copian a tu cuenta '+
      '(y la IA te lee el ticket y descuenta lo que no computa).</div>';

  /* "Guardar", no "Cerrar": todo se guarda solo según lo tocas, pero el botón
     de salida tiene que leerse como confirmar, no como descartar — si no, da
     la sensación de que se pierde lo hecho. Va en cian (acción principal) y
     "Sacar los N" baja a secundario. */
  /* Enviar desde la hoja: es donde el piloto acaba de poner los tickets y ve
     los importes cuadrados — el momento natural de mandarla. Mismo ciclo que
     el botón de la tarjeta, para que no haya dos verdades sobre el estado. */
  h += (!envioEnCurso(n) && !EX.sent[n.id]
    ? '<div class="ex-row"><div class="ex-btn cic go" onclick="exClose();exEnviar(\''+n.id+'\')">'+
      '✈ Enviar a Vueling</div></div>'
    : '<div class="ex-row"><div class="ex-sent-note">'+
      (envioDe(n) && envioDe(n).state === 'sending' ? 'Enviándose a Vueling…'
        : (EX.paid||{})[n.id] ? 'Pagada'
        : 'Ya está en Vueling' + (envioDe(n) && envioDe(n).number ? ' · ' + esc(envioDe(n).number) : ''))+
      '</div></div>');
  h += '<div class="ex-row"><div class="ex-btn" onclick="exClose()">✓ Guardar</div>'+
       (nTk ? '<div class="ex-btn ghost" onclick="exOutAll()">↓ Sacar los '+nTk+'</div>' : '')+'</div>'+
       /* Se queda para quien la pase a mano en el portal: ahí no molesta y es
          la única forma de meterla en el ciclo sin enviarla desde la app. */
       (EX.sent[n.id] ? '' :
         '<div class="ex-row"><div class="ex-btn ghost" onclick="exMark(\''+n.id+'\');exClose()">'+
         'La he pasado yo a mano</div></div>')+
       /* La MISMA papelera que la tarjeta, dentro de la hoja de edición: es
          donde el piloto está cuando decide que la nota sobra, y hasta ahora
          era un botón de texto que no se parecía en nada al de fuera. */
       (n.manual ? '<div class="ex-row ex-row-del">'+
         '<button class="ex-del" title="Eliminar nota" aria-label="Eliminar nota" '+
         'onclick="exDelNota(\''+n.id+'\')">'+iconoPapelera()+'<span>Eliminar nota</span></button></div>' : '');

  document.getElementById('ex-sheetbody').innerHTML = h;
}
function cp(k,v,cls,hint){
  return '<div class="ex-cp '+(cls||'')+'" onclick="exCopy(this,\''+String(v).replace(/'/g,"\\'")+'\')">'+
    '<div><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div>'+
    (hint?'<div class="h">'+esc(hint)+'</div>':'')+'</div><div class="c">⧉</div></div>';
}
window.exCopy = function(el, txt){
  if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function(){});
  el.classList.add('copied'); setTimeout(function(){ el.classList.remove('copied'); }, 1200);
};

/* ── Nº de ISO ────────────────────────────────────────────────────────────────
   El portal lo pide como campo obligatorio en «Operational incidents» y en
   «Inoperative oven». La hoja solo decía «pídeselo a la tripulación» y no había
   dónde apuntarlo: el piloto lo conseguía a bordo y lo perdía antes de llegar al
   ordenador. Ahora se guarda EN la nota, así que viaja con ella al otro
   dispositivo por el mismo camino que todo lo demás (las notas con ISO son
   siempre manuales, y de las manuales se sincroniza el cuerpo entero).
   Se guarda tal cual lo teclea la tripulación: los formatos de ISO cambian y
   validar una forma que no conocemos sería rechazar números buenos. */
/* ── LA FECHA DE LA LÍNEA ─────────────────────────────────────────────────────
   La del roster es la del VUELO; la que el portal valida es la del TICKET, y no
   tienen por qué coincidir: compras la cena al llegar al hotel, o el desayuno
   la mañana siguiente. Por eso se puede cambiar.

   Lo que NO se puede es salirse de la ventana del concepto (§5 de la spec):
   cada tipo admite unos días alrededor del de la actividad — `win` lo lleva
   dicho desde el primer día y hasta ahora no se usaba para nada. El techo es
   siempre D+1: da igual que la hora y el establecimiento no cuadren (eso la
   guía lo permite), la FECHA no puede pasar de ahí.

   Se guarda aparte de la nota, por línea, porque las notas automáticas se
   vuelven a derivar del roster en cada render: escribir la fecha DENTRO de la
   nota la perdería en el siguiente repintado. Misma razón por la que el nº de
   ISO sólo se podía poner en las manuales — con esto ya no hace falta esa
   excepción para la fecha. */
var K_FECHAS = 'pilotos_gastos_fechas';
function fechasLoad(){
  try { EX.fechas = JSON.parse(localStorage.getItem(K_FECHAS) || '{}') || {}; }
  catch(e){ EX.fechas = {}; }
}
function fechasSave(){ try { localStorage.setItem(K_FECHAS, JSON.stringify(EX.fechas || {})); } catch(e){} }

function fechaLinea(n, i){
  var puesta = (EX.fechas || {})[lineKey(n, i)];
  var base = (n.lines[i] && n.lines[i].date) || n.date;
  if (!puesta) return base;
  /* Si la nota se recalcula y la fecha guardada ya no cabe en la ventana, se
     descarta: vale más la del roster que una fecha que el portal rechazaría. */
  return dentroVentana(n, i, puesta) ? puesta : base;
}
function _dias(a, b){ return Math.round((new Date(a+'T12:00:00Z') - new Date(b+'T12:00:00Z')) / 86400000); }
function ventanaDe(n){
  var w = tipoDe(n.kind).win || [-1, 0, 1];
  return { min: Math.min.apply(null, w), max: Math.max.apply(null, w) };
}
function dentroVentana(n, i, f){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f))) return false;
  var base = (n.lines[i] && n.lines[i].date) || n.date, v = ventanaDe(n), d = _dias(f, base);
  return d >= v.min && d <= v.max;
}
function ventanaTxt(n){
  var v = ventanaDe(n);
  if (v.min === 0 && v.max === 0) return 'sólo el día exacto de la actividad';
  var l = [];
  if (v.min < 0) l.push('el día antes');
  l.push('el mismo día');
  if (v.max > 0) l.push('el siguiente');
  return 'admite ' + l.join(', ');
}

window.exSetFecha = function(id, i){
  var n = notaDe(id); if (!n || !n.lines[i]) return;
  var base = n.lines[i].date || n.date, v = ventanaDe(n);
  var opciones = [];
  for (var d = v.min; d <= v.max; d++){
    var f = new Date(new Date(base + 'T12:00:00Z').getTime() + d * 86400000)
              .toISOString().slice(0, 10);
    opciones.push({ f: f, d: d });
  }
  var actual = fechaLinea(n, i);
  /* Sólo se ofrecen los días que el portal admite para este concepto: si no se
     puede elegir una fecha mala, no hay que validarla ni explicar el error. */
  exPick({
    ic: '📅', titulo: 'Fecha del ticket',
    sub: 'La que <b>pone en tu recibo</b>, no la del vuelo · ' + ventanaTxt(n),
    opciones: opciones.map(function(o){
      return {
        txt: o.f.split('-').reverse().join('/'),
        hint: o.d === 0 ? 'el día de la actividad' : o.d < 0 ? 'el día antes' : 'el día siguiente',
        v: o.f, on: o.f === actual
      };
    }),
    onPick: function(v){
      if (!v) return;
      EX.fechas[lineKey(n, i)] = v; fechasSave();
      if (typeof drawSheet === 'function') drawSheet();
      exRender();
    }
  });
};

/* ── UN SELECTOR QUE SE TOCA ──────────────────────────────────────────────────
   `prompt()` con «escribe el número» es lo que hay a mano, pero es exactamente
   lo que un piloto no debería tener que hacer con una lista de seis opciones y
   el móvil en una mano: se lee el número, se busca el teclado, se escribe. Aquí
   se toca la opción y ya.

   Se apoya en la hoja que ya existe (`ex-send`), así que hereda su estética, su
   modo día y su animación. El callback vive en una variable del módulo porque
   los `onclick` de esta app son cadenas y por ahí no cabe una función. */
/* Los iconos de las opciones se DIBUJAN. Iban dentro del texto como caracteres
   —«✓ La he pasado yo a mano», «🗑 Eliminar la nota»— y eso lo pinta la fuente
   del móvil del piloto, no el código: es la luna de las pernoctas, tercera vez
   en esta pestaña. Un trazado no adelgaza en otro sistema ni se lo sustituye un
   emoji, y además le da a cada fila una FORMA distinta, que es lo que se lee de
   un vistazo cuando tres filas dicen lo mismo en el mismo blanco. */
var PICK_IC = {
  check: '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.5l5 5 10-11"/>',
  euro:  '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M18 6.5A7.5 7.5 0 0 0 7.2 9M18 17.5A7.5 7.5 0 0 1 7.2 15M4 10.5h9M4 13.5h9"/>',
  undo:  '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 9h10a5 5 0 0 1 0 10h-4M4 9l4-4M4 9l4 4"/>',
  trash: '<path fill="currentColor" d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-.8l-1 13.1A2 2 0 0 1 16.2 22H7.8a2 2 0 0 1-2-1.9L4.8 7H4a1 1 0 0 1 0-2h4V4a1 1 0 0 1 1-1zm1 2h4V4.8h-4V5zm-.3 5a.8.8 0 0 0-.8.8v7.4a.8.8 0 0 0 1.6 0V10.8a.8.8 0 0 0-.8-.8zm4.6 0a.8.8 0 0 0-.8.8v7.4a.8.8 0 0 0 1.6 0V10.8a.8.8 0 0 0-.8-.8z"/>'
};
function exOptIc(k){
  if (!k || !PICK_IC[k]) return '';
  return '<span class="ic"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
         PICK_IC[k] + '</svg></span>';
}
var PICK_CB = null;
function exPick(cfg){
  PICK_CB = cfg.onPick || null;
  var el = sendEl();
  /* Un `ic` que empieza por «<» es un TRAZADO y entra tal cual: las hojas que
     borran no pueden llevar su icono en cian —el color de «todo va bien»— ni
     dibujado por la fuente del aparato. */
  var icH = cfg.ic || '☰', crudo = icH.charAt(0) === '<';
  var h = '<div class="ex-send-h' + (cfg.tono ? ' t-' + cfg.tono : '') + '">' +
    '<div class="ex-send-ic' + (crudo ? ' dib' : '') + '">' + (crudo ? icH : esc(icH)) + '</div>' +
    '<div class="ex-send-t">' + esc(cfg.titulo || '') + '</div>' +
    (cfg.sub ? '<div class="ex-send-s">' + cfg.sub + '</div>' : '') + '</div>' +
    '<div class="ex-send-body">' + (cfg.html || '') +
    '<div class="ex-opts">' + (cfg.opciones || []).map(function(o, i){
      return '<div class="ex-opt' + (o.on ? ' on' : '') + (o.ghost ? ' ghost' : '') +
        (o.tono ? ' t-' + o.tono : '') + '" onclick="exPickGo(' + i + ')">' +
        exOptIc(o.ic) +
        '<div class="tx"><div class="t">' + esc(o.txt) + '</div>' +
        (o.hint ? '<div class="h">' + esc(o.hint) + '</div>' : '') + '</div>' +
        (o.on ? '<div class="c">✓</div>' : '') + '</div>';
    }).join('') + '</div></div>' +
    '<div class="ex-send-foot"><div class="ex-btn ghost" onclick="exSendClose()">Cancelar</div></div>';
  document.getElementById('ex-send-box').innerHTML = h;
  el.classList.add('on');
  PICK_OPTS = cfg.opciones || [];
}
var PICK_OPTS = [];
window.exPickGo = function(i){
  var o = PICK_OPTS[i], cb = PICK_CB;
  exSendClose(); PICK_CB = null;
  if (cb && o) cb(o.v, o);
};

/* ── EL MOTIVO (Reason) ───────────────────────────────────────────────────────
   El portal lo marca obligatorio y, en «Operational incidents», NO es un texto
   libre: es un desplegable con seis opciones cerradas. Faltaba en el calco —
   así que el piloto llegaba al portal, se encontraba el campo en rojo y tenía
   que adivinar cuál poner— y sobre todo faltaba en el ENVÍO, que es donde un
   motivo que no sea uno de los suyos se convierte en una nota rechazada.

   Los seis salen de `ExpenseReasons` de la propia API (get-info), no de una
   lista inventada. Se dejan también en texto libre para los tipos que sí lo
   admiten (posicional, voucher, médicos…). */
var REASONS = ['Airport activity', 'Crew meal not loaded', 'Oven not working',
               'Flight delayed', 'AOG', 'Charter flight'];
/* Los tipos cuyo Reason es DESPLEGABLE en el portal. En el resto es texto. */
function reasonCerrado(n){ return n.kind === 'incident'; }

var K_MOTIVOS = 'pilotos_gastos_motivos';
function motivosLoad(){
  try { EX.motivos = JSON.parse(localStorage.getItem(K_MOTIVOS) || '{}') || {}; }
  catch(e){ EX.motivos = {}; }
}
function motivosSave(){ try { localStorage.setItem(K_MOTIVOS, JSON.stringify(EX.motivos || {})); } catch(e){} }

function motivoDe(n){
  var puesto = (EX.motivos || {})[n.id];
  if (puesto) return puesto;
  /* Por defecto, el que corresponde a lo que la app ya sabe de la nota. En una
     incidencia el más habitual con diferencia es que no cargaron la comida. */
  if (n.kind === 'incident') return 'Crew meal not loaded';
  if (n.kind === 'oven')     return 'Oven not working';
  if (n.kind === 'position') return 'Vuelo de posicionamiento' + (n.route ? ' ' + n.route : '');
  if (n.kind === 'voucher')  return 'Voucher de hotel' + (n.route ? ' ' + n.route : '');
  return tituloDe(n);
}

/* Traducción de los seis motivos. El que VIAJA es siempre el inglés —es el que
   el portal tiene en su desplegable— pero el piloto elige leyendo el suyo. */
var REASON_ES = {
  'Airport activity':      'Actividad en el aeropuerto',
  'Crew meal not loaded':  'No cargaron la comida de tripulación',
  'Oven not working':      'Horno inoperativo',
  'Flight delayed':        'Vuelo retrasado',
  'AOG':                   'Avión en tierra (AOG)',
  'Charter flight':        'Vuelo chárter'
};
window.exSetMotivo = function(id){
  var n = notaDe(id); if (!n) return;
  var actual = motivoDe(n);
  if (reasonCerrado(n)){
    exPick({
      ic: '❓', titulo: 'Motivo de la incidencia',
      sub: 'En el portal es un desplegable cerrado: viaja el texto en inglés, tal cual',
      opciones: REASONS.map(function(r){
        return { txt: r, hint: REASON_ES[r] || '', v: r, on: r === actual };
      }),
      onPick: function(v){
        if (!v) return;
        EX.motivos[id] = v; motivosSave();
        if (typeof drawSheet === 'function') drawSheet();
      }
    });
    return;
  }
  var v = prompt('Motivo\n\nEl portal lo exige y se envía tal cual (máximo 400 caracteres).', actual);
  if (v === null) return;
  v = String(v).trim().slice(0, 400);
  if (!v){ alert('El motivo no puede quedar vacío: el portal lo rechaza.'); return; }
  EX.motivos[id] = v; motivosSave();
  if (typeof drawSheet === 'function') drawSheet();
};

function isoDe(n){ return (n && n.iso) ? String(n.iso) : ''; }
window.exSetIso = function(id){
  var n = notaDe(id); if (!n) return;
  /* Las notas que piden ISO se crean a mano (el motor nunca las deriva: en
     expense.js `day.incidents` va siempre vacío). Si algún día las derivara,
     esto avisaría en vez de guardar un número que no se persiste. */
  if (!n.manual){ alert('Esta nota la genera el roster: el nº de ISO todavía no se puede guardar en ella.'); return; }
  var v = prompt('Nº de ISO\n\nTe lo da la tripulación técnica o de cabina.\n' +
                 'Es obligatorio en el portal para esta nota.', isoDe(n));
  if (v === null) return;                       // canceló: no se toca nada
  v = String(v).trim().slice(0, 40);
  if (v) n.iso = v; else delete n.iso;          // vacío = borrarlo
  saveMan(); syncNota(id); exRender();
  // La hoja abierta se repinta para que el número salga ya copiable.
  if (SHEET === id) exOpen(id);
};

/* ── tickets ── */
/* Abre la cámara (camara=1) o la fototeca (camara=0) con la MISMA entrada.
   `capture` es el atributo que decide cuál: puesto, iOS va directo a la cámara;
   quitado, ofrece el selector con la fototeca. */
/* ════════ QUÉ ESTÁ PASANDO CON ESA FOTO ════════
   Entre que el piloto elige la foto y aparece algo pasaban hasta TRES cosas, y
   ninguna se veía:
     1. `shrink()` decodifica y reescala una foto de 4-5 MB — un segundo o dos
        de hilo principal en un móvil;
     2. con plan Pro, `leerConIA()` manda la imagen al backend y espera a que el
        modelo la lea — SEGUNDOS, y con mala cobertura muchos;
     3. y `subirTicket()` dispara `exSync()` sin esperarla, así que la copia a
        la nube era invisible entera.
   Desde el asiento del piloto las tres se ven igual que «no ha pasado nada» —
   es el 0 mudo de las pernoctas, esta vez en la única acción de la pantalla.

   El aviso va DONDE VA A APARECER EL TICKET, no en un toast: la casilla de la
   tira se ocupa ya, con el nombre de lo que se está haciendo. Un giro genérico
   diría «espera»; lo que hace falta es saber si está preparando la foto o
   esperando al modelo, porque duran cosas muy distintas. */
var SUBIENDO = null;              // { key, fase } · fase: foto · ia · guardando
var FASE_TXT = { foto:'Preparando la foto…', ia:'✦ Leyendo el ticket…',
                 guardando:'Guardando…' };
/* Nube DIBUJADA. Vale para la miniatura que vive en otro aparato y para la
   marca de «aún sin subir»: en las dos, el carácter ☁ sale a color en un móvil,
   en hueco en otro y de un pelo en un tercero — y esa marca es todo lo que hay
   para distinguir dos estados de tu dinero. */
function iconoNube(){
  return '<svg class="ex-ic-nb" viewBox="0 0 20 14" width="14" height="10" aria-hidden="true" '+
    'fill="currentColor"><path d="M15.6 5.1A5.1 5.1 0 0 0 5.9 4 4 4 0 0 0 4.3 11.8'+
    'h11a3.4 3.4 0 0 0 .3-6.7z"/></svg>';
}
function faseTk(key, fase){
  SUBIENDO = fase ? { key:key, fase:fase } : null;
  /* Sólo se repinta la hoja: `exRender` recorrería el histórico entero por un
     cambio que no sale de esta tira. */
  try { if (SHEET) drawSheet(); } catch(e){}
}

window.exPickTk = function(key, camara){
  var inp = document.getElementById('ex-file');
  if (!inp) return;
  inp.value = '';
  if (camara) inp.setAttribute('capture', 'environment');
  else        inp.removeAttribute('capture');
  inp.onchange = function(){ exNewTk(inp, key); };
  inp.click();
};

window.exNewTk = function(input, key){
  var file = input.files && input.files[0]; input.value = '';
  if (!file) return;
  faseTk(key, 'foto');
  shrink(file).then(function(blob){
    var id = 'tk-' + Date.now() + '-' + Math.round(Math.random()*1e6);
    // Pro: la IA lee el ticket y separa lo que computa. Free: importe a mano.
    /* La fase se pinta ANTES de llamar al modelo, y `leerConIA` espera a la
       red: eso da al navegador el respiro que necesita para pintarla. Con el
       `prompt()` —que congela la página— delante, no lo habría. */
    if (exIsPro()) faseTk(key, 'ia');
    var pre = exIsPro() ? leerConIA(blob) : Promise.resolve(null);
    return pre.then(function(ia){
      /* ★ EL TICKET NO SE PIERDE NUNCA.
         Antes, si la IA leía un ticket donde no computaba nada (una compra con
         alcohol, por ejemplo), sugería 0 €, el piloto le daba a OK y saltaba
         «Importe no válido»: adiós foto, a hacerla otra vez. Y encima sin decir
         POR QUÉ salía 0.
         Ahora lo que la Compañía no va a aceptar se enseña con nombre y precio
         —es información suya, no un motivo para descartarle el recibo— y el
         importe lo pone él, con lo computable como sugerencia. */
      var sug = ia && ia.computable != null ? String(ia.computable).replace('.',',') : '';
      var fuera = (ia && ia.items || []).filter(function(x){ return x && !x.food; });
      var aviso = '';
      if (fuera.length){
        aviso = '\n\n⚠️ Esto NO te lo van a abonar (' +
          (Number(ia.excluded)||0).toFixed(2).replace('.',',') + ' €):\n' +
          fuera.slice(0, 8).map(function(x){
            return '  · ' + (x.name || x.desc || 'artículo') +
                   (x.amount != null ? '  ' + Number(x.amount).toFixed(2).replace('.',',') + ' €' : '');
          }).join('\n') +
          (fuera.length > 8 ? '\n  · …y ' + (fuera.length - 8) + ' más' : '') +
          '\n\nSolo computan los alimentos. El alcohol de supermercado no, y lo no\n' +
          'alimentario tampoco (el vino o la cerveza de un menú sí).';
      }
      var txt = prompt('Importe del ticket (€)\n\nEscribe lo que vas a reclamar.' +
        (ia ? '\n\n✦ Leído: total ' + ia.total + ' € · computable ' + ia.computable + ' €' : '') +
        aviso, sug);
      if (txt === null) { faseTk(null); return; }
      var amount = parseFloat(String(txt).replace(',', '.'));
      if (!isFinite(amount) || amount < 0) amount = 0;
      if (amount === 0 && !confirm('Vas a guardar el ticket con 0 €: no reclamará nada.\n\n' +
          '¿Lo guardo igualmente?\n\n(Puedes cambiarle el importe luego, o borrarlo.)')) {
        faseTk(null); return;
      }
      faseTk(key, 'guardando');
      var rec = { id:id, lineKey:key, blob:blob, amount:amount,
        shop: ia && ia.shop || null, ticket_date: ia && ia.date || null,
        items: ia && ia.items || null, source: ia ? 'ai' : 'manual',
        added: new Date().toISOString() };
      TK_SUCIO = true;
      /* `cargarTickets` ANTES de subir: la miniatura aparece en cuanto está
         guardada, sin esperar a la red. */
      return tkPut(rec).then(cargarTickets)
        .then(function(){ return subirTicket(rec, key); })
        .then(function(){ faseTk(null); })
        .catch(function(){ faseTk(null); alert('No se pudo guardar el ticket en este navegador.'); });
    });
  /* Sin este catch, una foto que el navegador no sabe decodificar dejaba la
     casilla girando para siempre y sin un solo error a la vista. */
  }).catch(function(){
    faseTk(null);
    alert('No se ha podido preparar esa foto. Prueba con otra o hazla de nuevo.');
  });
};
function leerConIA(blob){
  return blobToB64(blob).then(function(b64){
    return api('/api/expense/scan', { method:'POST', body:{ image_base64:b64, media_type:'image/jpeg' } });
  }).then(function(r){
    if (r.status !== 200) return null;
    return r.body;
  }).catch(function(){ return null; });
}
/* El IMPORTE del ticket sí viaja a la nube; la FOTO no. Es lo que promete el
   plan Free ("las fotos se guardan solo en este móvil") y, sobre todo, es lo
   que hace falta para que el "reclamas X €" dé lo mismo en los dos aparatos:
   en el otro dispositivo el ticket aparece con su importe y la miniatura en ☁,
   porque la imagen está donde se hizo. */
function subirTicket(rec, key){
  marcarPend('t:' + rec.id, 'up', String(key).split('#')[0]);
  exSync();                       // sin esperarla: la hoja no depende de la nube
  return Promise.resolve();       // (y con mala cobertura, esperar la congelaría)
}
window.exDelTk = function(id){
  /* El mismo pop-up de la app que la nota: dos confirmaciones con dos aspectos
     distintos en la misma pantalla es lo que no puede pasar. */
  exPick({
    ic: '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">' + PICK_IC.trash + '</svg>',
    tono: 'danger', titulo: '¿Borrar este ticket?',
    sub: 'La nota se queda; se va sólo esta foto.',
    opciones: [ { v:'si', txt:'Sí, borrarlo', ic:'trash', tono:'danger', hint:'No se puede deshacer' },
                { v:'no', txt:'No, dejarlo', ic:'undo', ghost:true } ],
    onPick: function(v){ if (v === 'si') exDelTkYa(id); }
  });
};
window.exDelTkYa = function(id){
  var t = null; TICKETS.forEach(function(x){ if (x.id===id) t = x; });
  var nota = t ? String(t.lineKey).split('#')[0] : '';
  TK_SUCIO = true;
  tkDel(id).catch(function(){}).then(function(){
    marcarPend('t:' + id, 'del', nota);
    exSync();
    return cargarTickets();
  }).then(drawSheet);
};
function nombreTk(t){
  var n = notaDe(SHEET) || {}, i = Number(String(t.lineKey).split('#')[1]) || 0;
  var l = (n.lines || [])[i] || {};
  return 'VY_' + String(l.date||'').replace(/-/g,'') + '_' +
    String(n.portalType||'').replace(/[^A-Za-z]/g,'').slice(0,12) + '_' + String(t.id).slice(-6) + '.jpg';
}
window.exOutTk = function(id){
  var t = null; TICKETS.forEach(function(x){ if (x.id===id) t = x; });
  if (t && t.blob) sacarFuera(t.blob, nombreTk(t));
};
window.exOutAll = function(){
  var n = notaDe(SHEET); if (!n) return;
  var all = []; n.lines.forEach(function(_,i){ all = all.concat(tksOf(lineKey(n,i))); });
  (function next(k){ if (k >= all.length) return;
    if (all[k].blob) sacarFuera(all[k].blob, nombreTk(all[k])).then(function(){ next(k+1); });
    else next(k+1); })(0);
};
/* Huella de un recibo leído por la IA: comercio + fecha + total de sus líneas.
   El `amount` NO sirve —es lo que se reclama, y el piloto lo ajusta al tope—;
   las líneas del recibo sí son las mismas si es el mismo papel. Sin comercio,
   fecha o líneas no hay huella: un ticket a mano de 23,21 € no dice nada. */
function firmaTicket(t){
  if (!t || !t.shop || !t.ticket_date) return null;
  var it = t.items;
  if (typeof it === 'string'){ try { it = JSON.parse(it); } catch(e){ it = null; } }
  if (!Array.isArray(it) || !it.length) return null;
  var tot = it.reduce(function(a, x){ return a + (Number(x && x.amount)||0); }, 0);
  return String(t.shop).trim().toUpperCase() + '|' + String(t.ticket_date).slice(0, 10) + '|' + tot.toFixed(2);
}
function contarTickets(){
  tkAll().then(function(all){
    EX.tkCount = {}; EX.tkSum = {}; EX.tkLine = {}; EX.tkFechas = {}; EX.tkDup = {};
    var firmas = {};
    (all||[]).forEach(function(t){
      var id = String(t.lineKey).split('#')[0], eur = Number(t.amount)||0;
      EX.tkCount[id] = (EX.tkCount[id]||0) + 1;
      EX.tkSum[id]   = (EX.tkSum[id]||0) + eur;
      // Por LÍNEA (lineKey = idNota#índice): es lo que permite decir en qué
      // franja concreta te falta ticket, no solo que la nota va corta.
      EX.tkLine[t.lineKey] = (EX.tkLine[t.lineKey]||0) + eur;
      /* La fecha IMPRESA en el recibo: no es la del servicio ni la del envío, y
         la tarjeta tiene que poder decir las tres por separado. */
      if (t.ticket_date){
        var fd = String(t.ticket_date).slice(0, 10);
        EX.tkFechas[id] = EX.tkFechas[id] || [];
        if (EX.tkFechas[id].indexOf(fd) < 0) EX.tkFechas[id].push(fd);
      }
      var f = firmaTicket(t);
      if (f){ firmas[f] = firmas[f] || {}; firmas[f][id] = 1; }
    });
    /* El MISMO recibo en dos notas (se escanea dos veces la misma cena): Vueling
       puede tumbar una. Se avisa, no se bloquea — a veces es legítimo repartir. */
    Object.keys(firmas).forEach(function(f){
      var ids = Object.keys(firmas[f]); if (ids.length < 2) return;
      ids.forEach(function(id){
        ids.forEach(function(o){
          if (o === id) return;
          EX.tkDup[id] = EX.tkDup[id] || [];
          if (EX.tkDup[id].indexOf(o) < 0) EX.tkDup[id].push(o);
        });
      });
    });
    exRender();
  }).catch(function(){ exRender(); });
}

/* ── marcar / crear / borrar notas ── */
window.exMark = function(id){
  EX.sent[id] = new Date().toISOString(); saveSent(); syncNota(id); exRender();
};
window.exUnmark = function(id){
  delete EX.sent[id]; saveSent(); syncNota(id); exRender();
};
/* Encolar SIEMPRE y subir después: el orden importa. Si se sube primero y se
   encola solo al fallar, un cierre de app entre medias deja el cambio sin
   registro en ningún sitio. */
function syncNota(id){
  marcarPend('n:' + id, 'up');
  exSync();
}

/* ════════ SINCRONIZACIÓN ENTRE DISPOSITIVOS ════════
   Lo que se metía en el móvil no aparecía en el ordenador (#CVK75): la pestaña
   vivía entera en localStorage e IndexedDB. Ahora:

     1. SUBE lo que este dispositivo tiene en cola (crear, marcar, borrar).
     2. BAJA todo lo del servidor y lo mezcla con lo de aquí.

   Quién gana en un conflicto: lo que está EN COLA, siempre. Es lo último que
   ha tocado el piloto con el dedo en esta pantalla; si el servidor trae otra
   cosa es que viene del otro aparato y aún no sabe de este cambio. Todo lo que
   no está en cola se coge del servidor tal cual.

   Los borrados viajan como LÁPIDA. Sin lápida, el aparato que no se enteró
   vuelve a subir la nota en su siguiente sincronización y el gasto resucita.

   De las notas AUTOMÁTICAS solo viaja el estado: la nota la vuelve a derivar
   del roster cada dispositivo, y el roster ya se sincroniza por su cuenta. Si
   viajara entera, el ordenador acabaría enseñando notas de un roster que allí
   no está importado. */
function cuerpoNota(n, id){
  return { id: id || n.id, date: n.date, kind: n.kind, portalType: n.portalType,
           manual: !!n.manual, status: EX.sent[id || n.id] ? 'sent' : 'pending',
           maxTotal: n.maxTotal, data: n.manual ? n : null };
}
/* ⚠️ LA COLA SE LEE DE IndexedDB, NO DEL ARRAY EN MEMORIA
   `TICKETS` sólo se rellena al ABRIR una nota (`exOpen` → `cargarTickets`), y
   aquí un ticket que no aparecía en él se daba por «ya no existe» y se sacaba
   de la cola — sin enviarlo y sin un solo error. Dos caminos reales:

   · al añadir un ticket, `subirTicket` disparaba `exSync()` ANTES de que
     `cargarTickets()` metiera el nuevo en el array: su importe no llegaba a la
     nube, y el otro aparato reclamaba una cifra distinta del mismo mes;
   · y en un arranque en frío con cola pendiente, `TICKETS` está VACÍO, así que
     la primera sincronización **vaciaba la cola entera** sin subir nada.

   El dato bueno está en IndexedDB, que es donde se guardó. Lo demás es una
   caché de la hoja abierta. */
function subirCola(){
  var claves = Object.keys(EX.pend || {});
  if (!claves.length) return Promise.resolve(0);
  return tkAll().catch(function(){ return []; }).then(function(guardados){
    return _subirCola(claves, guardados);
  });
}
function _subirCola(claves, guardados){
  var notas = [], tickets = [], borrados = [], hechas = [];

  claves.forEach(function(k){
    var op = (EX.pend[k]||{}).op, id = k.slice(2);
    if (k.charAt(0) === 'n'){
      if (op === 'del'){ borrados.push({ k:k, url:'/api/expense/notes/'+encodeURIComponent(id) }); return; }
      var n = notaDe(id);
      // La nota se ha ido de la lista (p.ej. una automática de un roster que ya
      // no está): sin cuerpo no hay nada que subir, se saca de la cola.
      if (!n){ hechas.push(k); return; }
      notas.push(cuerpoNota(n, id)); hechas.push(k);
    } else {
      if (op === 'del'){
        var nota = (EX.pend[k]||{}).note || '';
        borrados.push({ k:k, url:'/api/expense/tickets/'+encodeURIComponent(id)+
                              (nota ? '?note_id='+encodeURIComponent(nota) : '') });
        return;
      }
      var t = null; (guardados||[]).forEach(function(x){ if (x.id === id) t = x; });
      if (!t){ hechas.push(k); return; }   // borrado de verdad: no clava la cola
      tickets.push({ id:t.id, note_id:String(t.lineKey).split('#')[0],
        line_idx:Number(String(t.lineKey).split('#')[1])||0, amount:t.amount,
        shop:t.shop, ticket_date:t.ticket_date, items:t.items, source:t.source });
      hechas.push(k);
    }
  });

  var envios = [];
  if (notas.length)   envios.push(api('/api/expense/notes',   { method:'POST', body:{ notes:notas } }));
  if (tickets.length) envios.push(api('/api/expense/tickets', { method:'POST', body:{ tickets:tickets } }));
  borrados.forEach(function(b){
    envios.push(api(b.url, { method:'DELETE' }).then(function(r){
      if (r && r.status === 200) hechas.push(b.k);
    }));
  });
  return Promise.all(envios).then(function(rs){
    // Solo se saca de la cola lo que el servidor ha confirmado: un 500 o una
    // caída de red y el cambio sigue esperando su turno.
    var ok = rs.every(function(r){ return !r || r.status === undefined || r.status === 200; });
    if (ok) hechas.forEach(function(k){ delete EX.pend[k]; });
    savePend();
    return notas.length + tickets.length + borrados.length;
  });
}
function bajarYMezclar(){
  return Promise.all([api('/api/expense/notes'), api('/api/expense/tickets')])
    .then(function(r){
      var rn = r[0], rt = r[1];
      if (!rn || rn.status !== 200 || !rn.body || !Array.isArray(rn.body.notes)) return false;
      var enCola = function(k){ return !!EX.pend[k]; };

      // ── Notas ──
      var manual = EX.manual.slice();
      (rn.body.notes || []).forEach(function(rw){
        if (enCola('n:' + rw.id)) return;                 // lo de aquí es más nuevo
        var i = -1; manual.forEach(function(m, k){ if (m.id === rw.id) i = k; });
        if (rw.deleted){
          if (i >= 0) manual.splice(i, 1);
          delete EX.sent[rw.id];
          return;
        }
        if (rw.manual && rw.data && rw.data.id) { if (i >= 0) manual[i] = rw.data; else manual.push(rw.data); }
        if (rw.status === 'sent') EX.sent[rw.id] = rw.updated_at || new Date().toISOString();
        else delete EX.sent[rw.id];
      });
      EX.manual = manual; saveMan(); saveSent();
      /* Las marcas con el ordinal viejo no vienen sólo de este aparato: siguen
         bajando del servidor mientras el otro no se actualice. Aquí es donde
         llegan, así que aquí se rescatan también. */
      try { rescatarMarcas(); } catch(e){}

      /* ── Subida de recuperación ──
         Igual que hace el logbook, que empuja todo lo que tiene: lo que existe
         AQUÍ y el servidor no conoce, se encola. Hace falta por dos motivos —
         las notas creadas antes de que existiera la cola no tienen quién las
         suba, y durante el tiempo en que la sesión no se leía bien (se pedía
         una clave que no existe) nada llegó a la nube. Un borrado no resucita
         por esto: las lápidas vienen en el listado, así que el servidor SÍ las
         conoce y no se vuelven a subir. */
      var conocidas = {};
      (rn.body.notes || []).forEach(function(rw){ conocidas[rw.id] = true; });
      var recuperadas = 0;
      EX.manual.forEach(function(m){
        if (!conocidas[m.id] && !enCola('n:'+m.id)){ marcarPend('n:'+m.id, 'up'); recuperadas++; }
      });
      Object.keys(EX.sent).forEach(function(id){      // el "ya la pasé" de las automáticas
        if (!conocidas[id] && !enCola('n:'+id)){ marcarPend('n:'+id, 'up'); recuperadas++; }
      });
      if (recuperadas) EX.syncOtra = true;            // que suban en la ronda siguiente

      // ── Tickets: viaja el IMPORTE, no la foto ──
      // La miniatura del que llegó de fuera sale como ☁ (la hoja ya lo pinta
      // así cuando el registro no trae blob): hay ticket y hay importe, la
      // imagen está en el móvil donde se hizo.
      var tks = (rt && rt.status === 200 && rt.body && rt.body.tickets) || [];
      return tkAll().then(function(locales){
        var porId = {}; (locales||[]).forEach(function(t){ porId[t.id] = t; });
        var conocidosTk = {}; tks.forEach(function(rw){ conocidosTk[rw.id] = true; });
        // Mismo criterio que con las notas: el ticket que solo está aquí, sube.
        (locales||[]).forEach(function(t){
          if (!conocidosTk[t.id] && !enCola('t:'+t.id)){
            marcarPend('t:'+t.id, 'up', String(t.lineKey||'').split('#')[0]); EX.syncOtra = true;
          }
        });
        var faenas = [];
        tks.forEach(function(rw){
          if (enCola('t:' + rw.id)) return;
          var loc = porId[rw.id];
          if (rw.deleted){ if (loc) faenas.push(tkDel(rw.id)); return; }
          var rec = { id: rw.id, lineKey: rw.note_id + '#' + (rw.line_idx||0),
            amount: Number(rw.amount)||0, shop: rw.shop||null, ticket_date: rw.ticket_date||null,
            items: rw.items||null, source: rw.source||'manual', added: rw.updated_at,
            remoto: true };
          if (loc && loc.blob) rec.blob = loc.blob;       // la foto de aquí no se pierde
          faenas.push(tkPut(rec));
        });
        return Promise.all(faenas).then(function(){ return true; });
      });
    })
    .catch(function(){ return false; });
}
/* Una sola sincronización en vuelo: la pestaña se repinta muchas veces y cada
   repintado no puede disparar su propia ronda.
   ⚠️ Pero si algo se toca MIENTRAS hay una ronda en marcha, esa ronda ya leyó
   la cola y no lo lleva: hay que encadenar otra al terminar. Sin esto, crear
   una nota justo al abrir la pestaña —que es cuando arranca la primera
   sincronización— la dejaba en cola hasta la siguiente visita. */
function exSync(){
  if (!exToken()) return Promise.resolve(false);          // sin sesión no hay nube
  if (EX.sync){ EX.syncOtra = true; return EX.sync; }
  EX.sync = subirCola()
    .catch(function(){ return 0; })
    .then(bajarYMezclar)
    .then(function(ok){
      EX.sync = null; EX.syncEstado = ok ? 'ok' : 'err';
      if (ok){ EX.syncAt = new Date().toISOString();
               try { localStorage.setItem(K_SYNCAT, EX.syncAt); } catch(e){} }
      if (ok) contarTickets();                 // repinta con lo que haya llegado
      else exRender();
      /* `contarTickets` repinta la PESTAÑA, no la hoja abierta: sin esto el ☁
         de «sin subir» se quedaba puesto en un ticket que ya estaba en la nube
         hasta que el piloto cerraba y volvía a abrir. */
      if (SHEET) cargarTickets().then(function(){ try { drawSheet(); } catch(e){} });
      if (EX.syncOtra){ EX.syncOtra = false; return exSync(); }
      return ok;
    })
    .catch(function(){ EX.sync = null; EX.syncEstado = 'err'; return false; });
  return EX.sync;
}
window.exSync = exSync;

window.exPickTipo = function(){
  var h = '<div class="ex-lbl2">NUEVA NOTA</div>'+
    '<div class="ex-sh-t">¿Qué tipo de gasto?</div><div class="ex-tsel">'+
    TIPOS.map(function(t){ return '<div class="ex-topt" style="--c:'+t.col+'" onclick="exPickSub(\''+t.id+'\')">'+
      '<div class="i">'+t.ic+'</div><div class="l">'+t.lbl+'</div></div>'; }).join('')+
    '</div><div class="ex-row"><div class="ex-btn ghost" onclick="exClose()">Cancelar</div></div>';
  var el = sheetEl();
  document.getElementById('ex-sheetbody').innerHTML = h;
  el.classList.add('on');
};
window.exPickSub = function(tid){
  var T = tipoDe(tid), hoy = new Date().toISOString().slice(0,10), opts = '';
  if (T.meals){
    opts = '<div class="ex-grp">FRANJA Y ÁMBITO</div><div class="ex-tsel">'+
      MEAL_SUB.map(function(m){ return ['nat','int'].map(function(sc){
        return '<div class="ex-topt" style="--c:'+T.col+'" onclick="exCrear(\''+tid+'\',\''+m[sc]+'\','+T.cap[sc]+',\''+m.slot+'\',\''+m.lbl+'\')">'+
          '<div class="l">'+m.lbl+'<br><span>'+(sc==='nat'?'Nacional':'Internacional')+' · '+
          T.cap[sc].toFixed(2).replace('.',',')+' €</span></div></div>'; }).join(''); }).join('')+'</div>';
  } else if (T.vouchers){
    opts = '<div class="ex-grp">SUBTIPO DEL VOUCHER</div><div class="ex-tsel">'+
      VOU_SUB.map(function(v){ return '<div class="ex-topt" style="--c:'+T.col+'" '+
        'onclick="exCrear(\''+tid+'\',\''+v.s+'\','+v.cap+',null,\'Pernocta\')">'+
        '<div class="l">'+v.s+'<br><span>'+v.cap.toFixed(2).replace('.',',')+' €</span></div></div>'; }).join('')+'</div>';
  } else {
    opts = '<div class="ex-grp">SIN TOPE FIJO</div>'+
      '<div class="ex-note" style="margin:0 0 8px">Este centro de coste no tiene tope de convenio: '+
      'reclamas lo que sumen tus tickets.</div>'+
      '<div class="ex-topt" style="--c:'+T.col+'" onclick="exCrear(\''+tid+'\',\''+T.lbl+'\',0,null,\''+T.lbl+'\')">'+
      '<div class="i">'+T.ic+'</div><div class="l">Crear nota de '+T.lbl+'</div></div>';
  }
  document.getElementById('ex-sheetbody').innerHTML =
    '<div class="ex-lbl2" style="color:'+T.col+'">'+T.ic+' '+T.lbl.toUpperCase()+'</div>'+
    '<div class="ex-sh-s">Portal: <b>'+esc(T.portal)+'</b>'+(T.iso?' · requiere nº de ISO':'')+'</div>'+
    '<div class="ex-grp">FECHA DEL GASTO</div>'+
    '<input class="ex-in" type="date" id="ex-mdate" value="'+hoy+'">'+ opts +
    '<div class="ex-row"><div class="ex-btn ghost" onclick="exPickTipo()">‹ Atrás</div></div>';
};
/* ── ¿Cuadra con el roster? ───────────────────────────────────────────────────
   La Compañía tiene un proceso que cruza cada nota con el roster y la rechaza
   sola: «Automatic rejection. Does not match with Roster». La app mira EL MISMO
   roster, así que puede avisar antes de que el piloto se lleve el rechazo.
   No bloquea —el roster puede estar sin importar, o desactualizado, o el
   posicional haberse dado sobre la marcha— pero lo dice. */
function diaDelRoster(fecha){
  var dias = construirDias();
  for (var i = 0; i < dias.length; i++) if (dias[i].date === fecha) return dias[i];
  return null;
}
function cuadraConRoster(tid, fecha){
  /* Sin roster importado no se avisa de nada: no es que no cuadre, es que no
     hay con qué comparar. */
  if (!rosterRows().length) return { hay: true };
  /* `construirDias` devuelve los días con vuelos y los que te dejan fuera de
     base (una guardia en el hotel es de estos), así que "no está" significa día
     libre en base o sin importar — nunca un día que se haya perdido. */
  var dia = diaDelRoster(fecha);
  if (tid === 'position'){
    if (!dia || !(dia.legs||[]).length)
      return { hay: false, motivo: 'ese día no tienes vuelos en el roster' };
    return (dia.legs || []).some(function(l){ return l.positioning; })
      ? { hay: true }
      : { hay: false, motivo: 'ese día vuelas, pero ningún tramo consta como posicional' };
  }
  if (tid === 'voucher'){
    if (!dia) return { hay: false, motivo: 'ese día no tienes actividad de vuelo en el roster' };
    return dia.layover
      ? { hay: true }
      : { hay: false, motivo: 'ese día el roster te deja en tu base, sin pernocta fuera' };
  }
  /* Los demás (incidencia, horno, médicos…) no se pueden contrastar con el
     roster: dependen de lo que pasó a bordo, no de lo que estaba previsto. */
  return { hay: true };
}

window.exCrear = function(tid, subtype, cap, slot, lbl, fechaFija){
  var T = tipoDe(tid);
  var el = document.getElementById('ex-mdate');
  /* Al volver del aviso del roster, el campo de la fecha ya no está en pantalla
     (lo tapó el aviso): en el reintento se pasa explícita. */
  var d = fechaFija || (el && el.value) || new Date().toISOString().slice(0,10);

  /* Aviso ANTES de crearla, no al enviarla: si no cuadra, lo más probable es
     que se haya equivocado de día — y corregirlo ahora es un toque. */
  var chk = cuadraConRoster(tid, d);
  if (!chk.hay && !EX._saltarChk){
    exPick({
      ic: '⚠', titulo: 'Esto no cuadra con tu roster',
      sub: esc(T.lbl) + ' del ' + d.split('-').reverse().join('/') + ' — ' + esc(chk.motivo) + '.<br>' +
           'Vueling cruza cada nota con el roster y rechaza sola las que no encajan.',
      opciones: [
        { txt: 'Cambiar el día', hint: 'volver y elegir otra fecha', v: 'atras' },
        { txt: 'Crearla igualmente', hint: 'si sabes que es correcta, adelante', v: 'seguir', ghost: true }
      ],
      onPick: function(v){
        if (v !== 'seguir') return;
        EX._saltarChk = true;
        try { exCrear(tid, subtype, cap, slot, lbl, d); } finally { EX._saltarChk = false; }
      }
    });
    return;
  }
  var n = { id:'man-'+Date.now(), date:d, kind:tid, manual:true, portalType:T.portal,
    title:T.lbl, route:'', scope:/International/i.test(subtype)?'int':'nat',
    needsISO:!!T.iso, single:false, maxTotal:cap, ticketWindow:T.win,
    lines:[{ date:d, subtype:subtype, cap:cap, slot:slot||null, slotLabel:lbl, window:null, where:null }],
    covered:{ catering:[], voucher:[] } };
  EX.manual.push(n); saveMan(); syncNota(n.id);
  // Saltar al mes de la nota recién creada. Si no, con el filtro puesto en otro
  // mes —y por defecto se abre el que caduca antes, que suele ser el anterior—
  // la nota se crea y NO se ve: parece que no se ha guardado.
  EX.mes = d.slice(0,7);
  exRender(); exOpen(n.id);
};
/* Confirmar con la hoja de la app (`exPick`), no con `confirm()`. El diálogo
   nativo en una PWA sale con el dominio por delante, no sigue el modo día y en
   iOS lo puede bloquear el propio navegador — y entonces borra sin preguntar o
   no borra y no lo dice. `exPick` ya existe: escribir un segundo confirmador
   sería `ES_AIRPORTS` / `ES_IATA` en los diálogos.
   La línea DICE qué se pierde antes de tocarla: los tickets se van con ella. */
window.exDelNota = function(id){
  var n = (EX.manual || []).filter(function(x){ return x.id === id; })[0];
  var nTk = (EX.tkCount || {})[id] || 0;
  exPick({
    ic: '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">' + PICK_IC.trash + '</svg>',
    tono: 'danger',
    titulo: '¿Eliminar esta nota?',
    sub: (n ? esc(n.title || '') + ' · ' + fdate(n.date) : '') +
         (nTk ? ' — se van con ella ' + nTk + ' ticket' + (nTk > 1 ? 's' : '') : ''),
    /* ⚠ `exPickGo` llama al callback con `(o.v, o)` — el VALOR de la opción, no
       su índice. Mirando el índice, esto borraría con «No, dejarla». */
    opciones: [
      { v: 'si', txt: 'Sí, eliminarla', ic: 'trash', tono: 'danger',
        hint: nTk ? 'Los tickets adjuntos también' : 'No se puede deshacer' },
      { v: 'no', txt: 'No, dejarla', ic: 'undo', ghost: true }
    ],
    onPick: function(v){ if (v === 'si') exDelNotaYa(id); }
  });
};
window.exDelNotaYa = function(id){
  EX.manual = EX.manual.filter(function(n){ return n.id !== id; }); saveMan();
  delete EX.sent[id]; saveSent();
  // Lápida, no borrado a secas: el otro dispositivo tiene que enterarse de que
  // esta nota ya no existe, o la resucita en su siguiente sincronización.
  marcarPend('n:' + id, 'del');
  exSync(); exClose(); exRender();
};

/* ── arranque ──
   exInit() no lo llamaba NADIE: la pestaña solo ejecutaba exRender() al abrirla,
   así que los tickets (que viven en IndexedDB y se leen en asíncrono) no estaban
   cargados en el primer pintado — los importes de "con tus tickets" salían a
   cero hasta que abrías y cerrabas una nota. Ahora el primer render arranca:
   carga los tickets y sincroniza con los otros dispositivos. */
function arrancar(){
  if (ARRANCADO) return;
  ARRANCADO = true;      // ANTES de llamar: contarTickets() vuelve a pintar
  rebotePega();
  contarTickets();
  _ultSync = Date.now();
  exSync();
}

/* ── EL REBOTE DEL TICKET ─────────────────────────────────────────────────────
   Pedido junto a lo de abrir más fácil: «que haga un rebote al pulsar que sea
   dinámico». Dinámico quiere decir que responde al dedo, no que reproduce una
   animación fija: la tarjeta se HUNDE mientras la tienes pulsada —y se hunde más
   cuanto más la tienes, porque la transición de entrada es larga y lenta— y al
   soltar vuelve con una curva que se pasa de largo y se asienta. El rebote sale
   de la curva, así que su amplitud es proporcional a lo que llegó a hundirse:
   un toque seco rebota poco y una pulsación mantenida rebota más. Todo en CSS,
   sin un solo cálculo por frame — en esta app un bucle de animación que nadie
   mira ya costó 209 ms por interacción tres pantallas más allá.

   Va DELEGADO en el contenedor de la pestaña y se engancha UNA vez: `exRender`
   rehace las tarjetas enteras en cada pintado, así que un listener por tarjeta
   se perdería en el siguiente repintado o se acumularía.

   Y no se hunde la ZONA sino la TARJETA: la tira de color del tipo es un
   `:before` de `.ex-day`, así que escalando sólo `.ex-tap` la tira se quedaría
   quieta mientras el resto se mueve. */
var REBOTE = false;
function rebotePega(){
  if (REBOTE) return;
  var host = document.getElementById('pc-tab-gastos'); if (!host) return;
  REBOTE = true;
  /* Los mandos propios NO hunden la tarjeta: tienen su propio `:active` y su
     `stopPropagation`. Hundir la tarjeta entera al tocar el chip de la cámara
     diría que se va a abrir la tarjeta, y lo que se abre es la hoja de tickets. */
  var MANDOS = '.ex-tkchip,.ex-btn,.ex-del,.ex-lnk,.ex-whyb,.ex-estado[onclick],a,button,input,select,textarea';
  var pulsada = null;
  var suelta = function(){
    if (!pulsada) return;
    pulsada.classList.remove('pulsando');
    pulsada = null;
  };
  host.addEventListener('pointerdown', function(ev){
    var zona = ev.target && ev.target.closest ? ev.target.closest('.ex-tap') : null;
    if (!zona) return;
    if (ev.target.closest(MANDOS)) return;
    var card = zona.closest('.ex-day');
    if (!card || card.classList.contains('selble')) return;
    suelta();
    pulsada = card;
    card.classList.add('pulsando');
  }, { passive: true });
  ['pointerup','pointercancel','pointerleave','dragstart'].forEach(function(e){
    host.addEventListener(e, suelta, { passive: true });
  });
  /* Y si el dedo se va de la tarjeta arrastrando (la lista rueda), se suelta:
     sin esto la tarjeta se queda hundida para siempre y parece rota. */
  window.addEventListener('pointerup', suelta, { passive: true });
  window.addEventListener('scroll', suelta, { passive: true, capture: true });
}

/* ── VOLVER A ENTRAR TIENE QUE VOLVER A SINCRONIZAR ────────────────────────────
   `arrancar()` corre UNA vez por carga de página, así que la única sincronización
   era la primera. Medido: entrar en Gastos, salir y volver a entrar = CERO
   llamadas a `/api/expense`. En una PWA que se queda abierta días —que es como se
   usa esto en el iPad— el piloto marcaba la nota en el móvil y en el ordenador
   seguía saliendo pendiente hasta recargar la app. Es «los render corren una vez
   al arrancar y no vuelven», otra vez.

   No sincroniza en CADA pintado: `exRender` corre también al cambiar de mes o al
   marcar una nota, y cada acción ya dispara su `exSync`. Con el mínimo de por
   medio, entrar en la pestaña sincroniza y lo demás no hace ruido. El propio
   `exSync` repinta al terminar, así que el mínimo es además lo que impide que se
   llame a sí mismo. */
var SYNC_MIN_MS = 30000;
var _ultSync = 0;
function syncSiToca(){
  if (Date.now() - _ultSync < SYNC_MIN_MS) return;
  _ultSync = Date.now();
  exSync();
}
/* Y al volver del segundo plano: el otro aparato ha podido marcar algo mientras
   la app estaba dormida, y ahí no hay ningún render que lo dispare. */
try {
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible') return;
    _ultSync = 0;                                   // que la próxima entrada sí sincronice
    var host = document.getElementById('pc-tab-gastos');
    if (host && host.style.display !== 'none' && ARRANCADO) syncSiToca();
  });
} catch(e){}
/* ════════ ENVIAR LA NOTA A LA COMPAÑÍA ══════════════════════════════════════
   Hasta aquí la app te decía qué te deben y te dejaba los campos listos para
   copiar. Esto lo manda: el servidor entra en el portal con la sesión que ya
   aprobaste para eCrews (mismo Microsoft de Vueling, no se te pide nada nuevo)
   y crea la nota con sus líneas y sus tickets.

   Tres cosas que no son negociables en este flujo:
   1. **Doble confirmación.** Mandar una nota a RRHH no se deshace desde la app.
      Primero se revisa lo que va a salir, y luego hay que confirmarlo aparte.
   2. **El estado se ve.** Enviar y no saber si llegó es peor que no enviar. A la
      derecha de la nota queda el chip: enviándose, en Vueling (con su número),
      o no se pudo — con el motivo.
   3. **El motivo del rechazo se enseña tal cual.** Vueling tiene un bot que
      cruza la nota con tu roster y la tumba sola si no cuadra; que el piloto lo
      lea con sus palabras vale más que cualquier mensaje nuestro. */

var K_PORTAL = 'pilotos_gastos_portal';
function portalLoad(){
  try { EX.portal = JSON.parse(localStorage.getItem(K_PORTAL) || '{}') || {}; }
  catch(e){ EX.portal = {}; }
  /* Un «enviando» guardado de hace más de 6 min es un envío que se cortó (app
     cerrada, cuelgue): si se queda así, la nota pierde el botón de Enviar para
     siempre. Pasa a error, que permite reintentar. */
  var ahora = Date.now(), cambio = false;
  Object.keys(EX.portal).forEach(function(id){
    var e = EX.portal[id];
    if (e && e.state === 'sending' && !(ahora - Date.parse(e.at) < 6 * 60000)){
      EX.portal[id] = { state: 'error', at: new Date().toISOString(),
        msg: 'El envío no se completó. Mira si la nota ya aparece en el portal antes de reintentar.' };
      cambio = true;
    }
  });
  if (cambio) portalSave();
}
function portalSave(){ try { localStorage.setItem(K_PORTAL, JSON.stringify(EX.portal)); } catch(e){} }
function envioDe(n){ return (EX.portal || {})[typeof n === 'string' ? n : n.id] || null; }
/* "En curso" = ya salió y no ha vuelto con un fallo. Un envío fallido NO cuenta:
   ahí el piloto tiene que poder reintentar. Uno rechazado tampoco se reenvía
   desde aquí — reenviar lo mismo lo rechazarían otra vez. */
function envioEnCurso(n){
  var e = envioDe(n);
  return !!(e && e.state !== 'error' && e.state !== 'login');
}

/* Cómo se ve cada estado. El texto va en primera persona del piloto: no dice
   "OK/ERROR", dice si está en Vueling o no. */
var ENV_UI = {
  sending:  { cls:'go',   ic:'', txt:'ENVIANDO' },
  sent:     { cls:'ok',   ic:'✓', txt:'EN VUELING' },
  requested:{ cls:'ok',   ic:'✓', txt:'EN VUELING' },
  review:   { cls:'ok',   ic:'✓', txt:'EN REVISIÓN' },
  approved: { cls:'ok',   ic:'✓', txt:'APROBADA' },
  pending_payment:{ cls:'ok', ic:'€', txt:'A COBRAR' },
  paid:     { cls:'paid', ic:'€', txt:'PAGADA' },
  rejected: { cls:'bad',  ic:'✕', txt:'RECHAZADA' },
  cancelled:{ cls:'warn', ic:'—', txt:'ANULADA' },
  error:    { cls:'bad',  ic:'!', txt:'NO SE ENVIÓ' },
  login:    { cls:'warn', ic:'⚠', txt:'ENTRA EN TU CUENTA' }
};

/* ── EL BOTÓN DE TRES ESTADOS ─────────────────────────────────────────────────
   Sustituye al viejo "Ya la pasé". Una nota de gasto tiene tres momentos y el
   botón los recorre, con el color diciendo en cuál estás:

     ✈ ENVIAR    cian    · lo que tienes que hacer
     ⏳ ENVIADA   ámbar   · está en Vueling, falta cobrarla  → tócalo al cobrar
     € PAGADA    verde   · dinero en el bolsillo, cerrada

   El cian es el color de acción del módulo, el ámbar el de "pendiente" y el
   verde el del dinero cobrado: es el mismo semáforo que ya usa la app, no una
   paleta nueva. Fuera de ese ciclo sólo hay dos casos, los dos en rojo: no se
   pudo enviar (se reintenta) y la rechazó la Compañía (se ve el motivo). */
var K_PAID = 'pilotos_gastos_pagadas';
function paidLoad(){
  try { EX.paid = JSON.parse(localStorage.getItem(K_PAID) || '{}') || {}; }
  catch(e){ EX.paid = {}; }
}
function paidSave(){ try { localStorage.setItem(K_PAID, JSON.stringify(EX.paid)); } catch(e){} }

/* UNA sola función decide en qué estado está la nota, y de ella salen el botón,
   el chip y el color de la tarjeta. Si cada uno lo dedujera por su cuenta,
   antes o después dirían cosas distintas de la misma nota. */
function estadoEnvio(n){
  var e = envioDe(n), id = n.id;
  if (e && e.state === 'sending') return 'sending';
  if (e && (e.state === 'error' || e.state === 'login')) return 'err';
  if (e && e.state === 'rejected') return 'rej';
  if ((EX.paid || {})[id]) return 'paid';
  if (EX.sent[id] || (e && e.state)) return 'sent';
  return 'go';
}

/* ── El ciclo: el estado lo dice la FRANJA; los botones hacen cosas ──────────
   Era un solo botón con tres oficios: su rótulo decía DÓNDE ESTÁS y su toque
   hacía LA SIGUIENTE transición («⏳ Enviada» marcaba pagada). Un mando que no
   dice lo que hace, y encima sólo dejaba UN camino por estado — por eso no
   había forma de decir «ya me la han pagado» sin haberla enviado antes, que es
   justo lo que reportó el piloto. Hoy: la franja dice el estado, el botón dice
   la acción, y el ⋯ ofrece TODO lo que se puede hacer desde donde estás. */
function botonCiclo(n){
  var st = estadoEnvio(n), id = n.id;
  var clic = function(fn){ return 'onclick="event.stopPropagation();' + fn + '"'; };
  if (st === 'sending') return '<div class="ex-btn cic go off"><i class="ex-dots"><b></b><b></b><b></b></i> Enviando</div>';
  if (st === 'err')     return '<div class="ex-btn cic err" ' + clic('exEnviar(\'' + id + '\')') + '>↻ Reintentar</div>';
  if (st === 'rej')     return '<div class="ex-btn cic err" ' + clic('exEnvioDetalle(\'' + id + '\')') + '>✕ Rechazada</div>';
  if (st === 'paid')    return '<div class="ex-btn cic paid" ' + clic('exDespagada(\'' + id + '\')') + '>€ Pagada</div>';
  /* Enviada = la mandó la app, o el piloto la pasó a mano y la marcó. Los dos
     caminos acaban aquí, y desde aquí sólo queda cobrarla. */
  if (st === 'new')     return '<div class="ex-btn cic new" ' + clic('exVista(\'' + id + '\')') + '>Ver la nota</div>';
  if (st === 'sent')    return '<div class="ex-btn cic sent" ' + clic('exCobrada(\'' + id + '\')') + '>€ Marcar cobrada</div>';
  return '<div class="ex-btn cic go" ' + clic('exEnviar(\'' + id + '\')') + '>✈ Enviar</div>';
}

/* Se marca vista al abrirla: a partir de ahí ya no es una novedad, es trabajo
   pendiente. Se guarda aparte de las marcas de envío porque no dice nada del
   estado de la nota, sólo de si el piloto la ha visto. */
var K_VISTASN = 'pilotos_gastos_notas_vistas';
function vistasNLoad(){ try { EX.vistasN = JSON.parse(localStorage.getItem(K_VISTASN)||'{}')||{}; } catch(e){ EX.vistasN={}; } }
function vistasNSave(){ try { localStorage.setItem(K_VISTASN, JSON.stringify(EX.vistasN||{})); } catch(e){} }
window.exVista = function(id){ EX.vistasN = EX.vistasN||{}; EX.vistasN[id]=1; vistasNSave(); exRender(); if (window.exOpen) exOpen(id); };

/* Todas las transiciones posibles desde donde esté la nota, en un sitio.
   Antes cada estado ofrecía exactamente UNA —la del carril— y el resto no
   existían: una nota sin enviar no tenía forma de marcarse pagada aunque
   `exCobrada` ya supiera hacerlo («cobrada implica pasada») desde el primer
   día. Faltaba el CAMINO, no el motor. Es el primo de `ppCloudPull`: una
   función que nadie puede llamar no es media función, es ninguna. */
window.exMasMenu = function(id){
  var n = notaDe(id); if (!n) return;
  var st = estadoEnvio(n), ops = [];
  if (st !== 'paid') {
    if (!EX.sent[id]) ops.push({ v:'mano', txt:'La he pasado yo a mano', ic:'check', tono:'ok',
      hint:'La mandaste por el portal, no desde aquí' });
    ops.push({ v:'pagada', txt:'Ya me la han pagado', ic:'euro', tono:'pay',
      hint:'Aunque no la hayas enviado desde la app' });
  }
  if (EX.sent[id] && st !== 'paid') ops.push({ v:'nomano', txt:'No, aún no la he enviado', ic:'undo', ghost:true });
  if (st === 'paid') ops.push({ v:'despagada', txt:'Volver a pendiente de cobro', ic:'undo', ghost:true });
  /* La irreversible va en ROJO y la última. Antes era la fila MÁS apagada de
     las tres —gris pizarra, borde azul, sin un píxel rojo—: la única que no se
     puede deshacer, anunciada como la menos importante. */
  if (n.manual) ops.push({ v:'borrar', txt:'Eliminar la nota', ic:'trash', tono:'danger' });
  if (!ops.length) return;
  exPick({
    ic:'⋯', titulo:tituloDe(n), sub:'¿Qué quieres hacer con esta nota?',
    opciones: ops,
    /* ⚠ `exPickGo` llama con (o.v, o) — el VALOR, no el índice. */
    onPick: function(v){
      if (v === 'mano')           exMark(id);
      else if (v === 'nomano')    exUnmark(id);
      else if (v === 'pagada')    exCobrada(id);
      else if (v === 'despagada') exDespagada(id);
      else if (v === 'borrar')    exDelNota(id);
    }
  });
};

window.exCobrada = function(id){
  var n = notaDe(id); if (!n) return;
  exPick({
    ic:'€', titulo:'¿Ya has recibido el cobro?',
    sub:esc(tituloDe(n)) + ' — es TU control: la app no puede saber cuándo te entra el dinero en la nómina.',
    opciones:[ { v:'si', txt:'Sí, ya está cobrada', ic:'euro', tono:'pay' },
               { v:'no', txt:'Todavía no', ic:'undo', ghost:true } ],
    onPick: function(v){ if (v === 'si') exCobradaYa(id); }
  });
};
window.exCobradaYa = function(id){
  EX.paid[id] = new Date().toISOString(); paidSave();
  /* Cobrada implica pasada: si se marcó pagada sin haber pasado por "enviada"
     (una nota vieja), no puede quedarse en la lista de pendientes. */
  if (!EX.sent[id]){ EX.sent[id] = EX.paid[id]; saveSent(); syncNota(id); }
  exRender();
};
window.exDespagada = function(id){
  exPick({
    ic:'↩', titulo:'¿Volver a pendiente de cobro?',
    sub:'La nota deja de contar como pagada.',
    opciones:[ { v:'si', txt:'Sí, aún no la he cobrado', ic:'undo', tono:'ok' },
               { v:'no', txt:'Déjala pagada', ic:'euro', ghost:true } ],
    onPick: function(v){ if (v !== 'si') return;
      delete EX.paid[id]; paidSave(); exRender(); }
  });
};

/* ── La franja de ESTADO, arriba de cada nota ─────────────────────────────────
   Va SIEMPRE, también cuando la nota está sin tocar ("PENDIENTE"): un estado
   que sólo aparece cuando ya ha pasado algo obliga a deducir el resto por
   ausencia. Cuatro palabras y su color, en el primer sitio donde cae la vista.
   Sustituye al chip que había junto al importe: dos sitios contando lo mismo
   acaban contándolo distinto. */
var EST_TXT = {
  go:'PENDIENTE', sending:'ENVIANDO', sent:'ENVIADO', paid:'PAGADO',
  rej:'RECHAZADO', err:'NO SE ENVIÓ'
};
function franjaEstado(n){
  var st = estadoEnvio(n), e = envioDe(n);
  /* El estado fino del portal (en revisión, a cobrar…) se enseña si lo hay: es
     más informativo que un "enviado" genérico, y no cambia el color. */
  var txt = EST_TXT[st] || 'PENDIENTE';
  if (st === 'sent' && e && ENV_UI[e.state] && e.state !== 'sent') txt = ENV_UI[e.state].txt;
  var pulsable = (st === 'rej' || st === 'err') && e && e.msg;
  return '<div class="ex-estado es-' + st + '"' +
    (pulsable ? ' onclick="event.stopPropagation();exEnvioDetalle(\'' + n.id + '\')"' : '') + '>' +
    '<span class="k">ESTADO</span><span class="v">' + txt + '</span>' +
    (st === 'sending' ? '<i class="ex-dots"><b></b><b></b><b></b></i>' : '') +
    (e && e.number ? '<span class="n">' + esc(e.number) + '</span>' : '') +
    (pulsable ? '<span class="q">ver por qué ›</span>' : '') +
    '</div>';
}

window.exEnvioDetalle = function(id){
  var e = envioDe(id); if (!e || !e.msg) return;
  alert((e.state === 'rejected' ? 'Vueling ha rechazado esta nota:\n\n'
       : 'No se pudo enviar:\n\n') + e.msg +
    (e.number ? '\n\nReferencia: ' + e.number : ''));
};

/* ── Lo que se va a mandar ────────────────────────────────────────────────────
   Se construye ANTES de enseñar la confirmación, para que lo que el piloto lee
   sea exactamente lo que sale. El importe de cada línea es lo que de verdad se
   reclama: la suma de sus tickets, con el tope como techo. */
/* El motivo lo decide `motivoDe(n)`, arriba, junto al campo que lo edita: dos
   funciones calculando el mismo texto acaban dando textos distintos. */
function lineasParaEnviar(n, motivo){
  return n.lines.map(function(l, i){
    var tk = tkDeLinea(n, i), cap = Number(l.cap) || 0;
    return {
      portalType: n.portalType,
      portalSubtype: l.portalSubtype || l.subtype || null,
      date: fechaLinea(n, i),          // la del ticket, no la del vuelo
      reason: motivo,
      cost: cap ? Math.min(tk, cap) : tk,
      iso: isoDe(n),
      expedient: n.expedient || ''
    };
  }).filter(function(l){ return l.cost > 0; });
}

/* Antes de abrir nada: los tres motivos por los que el portal rechazaría la
   nota en la cara del piloto. Se dicen aquí, no después del envío. */
function pegasDe(n){
  var p = [];
  if (n.needsISO && !isoDe(n)) p.push('Falta el <b>nº de ISO</b>, y este tipo de nota no se acepta sin él.');
  if (!(EX.tkCount[n.id] || 0)) p.push('No has adjuntado <b>ningún ticket</b>. Sin recibo no se aprueba.');
  if ((EX.tkCount[n.id] || 0) > 5) p.push('Llevas <b>' + EX.tkCount[n.id] + ' tickets</b> y el portal admite 5 por nota.');
  if (!lineasParaEnviar(n, 'x').length) p.push('Ninguna línea tiene importe: añade los tickets primero.');
  return p;
}

/* ── La hoja de confirmación (dos pasos) ─────────────────────────────────── */
var SEND = null;                       // { id, motivo, paso }
function sendEl(){
  var el = document.getElementById('ex-send');
  if (!el){
    el = document.createElement('div');
    el.id = 'ex-send'; el.className = 'ex-send';
    el.innerHTML = '<div class="ex-send-back" onclick="exSendClose()"></div>' +
                   '<div class="ex-send-box" id="ex-send-box"></div>';
    document.body.appendChild(el);
  }
  return el;
}
window.exSendClose = function(){
  var el = document.getElementById('ex-send');
  if (el) el.classList.remove('on');
  /* La pantalla de éxito quita el marco de la hoja (`limpio`); si no se
     limpiara, el siguiente diálogo saldría sin su cabecera ni sus bordes. */
  var bx = document.getElementById('ex-send-box');
  if (bx) bx.classList.remove('limpio', 'mal');
  SEND = null;
};

window.exEnviar = function(id){
  var n = notaDe(id); if (!n) return;
  var pegas = pegasDe(n);
  SEND = { id: id, motivo: motivoDe(n), paso: pegas.length ? 0 : 1, pegas: pegas };
  var el = sendEl(); drawSend(); el.classList.add('on');
};
window.exSendPaso = function(p){
  if (!SEND) return;
  var t = document.getElementById('ex-send-motivo');
  if (t) SEND.motivo = t.value;                 // no se pierde lo que haya escrito
  SEND.paso = p; drawSend();
};
window.exSendCheck = function(el){
  var b = document.getElementById('ex-send-go');
  if (b) b.classList.toggle('off', !el.checked);
};

function drawSend(){
  var n = notaDe(SEND && SEND.id); if (!n) return;
  var box = document.getElementById('ex-send-box'), h = '';

  /* Paso 0 — no se puede enviar todavía. No es un paso del asistente: es una
     parada, con lo que falta y el botón para arreglarlo. */
  if (SEND.paso === 0){
    h = '<div class="ex-send-h stop"><div class="ex-send-ic">⚠</div>' +
        '<div class="ex-send-t">Aún no se puede enviar</div>' +
        '<div class="ex-send-s">' + esc(tituloDe(n)) + '</div></div>' +
        '<div class="ex-send-body"><ul class="ex-pegas">' +
        SEND.pegas.map(function(p){ return '<li>' + p + '</li>'; }).join('') + '</ul></div>' +
        '<div class="ex-send-foot">' +
          '<div class="ex-btn ghost" onclick="exSendClose()">Cerrar</div>' +
          '<div class="ex-btn" onclick="exSendClose();exOpen(\'' + n.id + '\')">Arreglarlo</div>' +
        '</div>';
    box.innerHTML = h; return;
  }

  var lineas = lineasParaEnviar(n, SEND.motivo);
  var total = r2(lineas.reduce(function(a, l){ return a + l.cost; }, 0));
  var nTk = EX.tkCount[n.id] || 0;

  /* Paso 1 — revisar. Lo que se enseña es LO QUE SALE, campo por campo, con las
     mismas palabras que el portal: si algo está mal, se ve aquí. */
  if (SEND.paso === 1){
    h = '<div class="ex-send-h"><div class="ex-send-ic">🧾</div>' +
        '<div class="ex-send-t">Revisa lo que se va a enviar</div>' +
        '<div class="ex-send-s">' + esc(tituloDe(n)) + ' · ' + esc(sinDia(fdate(n.date))) + '</div></div>' +
        '<div class="ex-send-body">' +
        '<div class="ex-send-k">TIPO EN EL PORTAL</div>' +
        '<div class="ex-send-v">' + esc(n.portalType) + '</div>' +
        (isoDe(n) ? '<div class="ex-send-k">Nº DE ISO</div><div class="ex-send-v">' + esc(isoDe(n)) + '</div>' : '') +
        '<div class="ex-send-k">MOTIVO <span>se envía tal cual · lo puedes cambiar</span></div>' +
        '<textarea class="ex-send-txt" id="ex-send-motivo" maxlength="400" rows="2">' +
          esc(SEND.motivo) + '</textarea>' +
        '<div class="ex-send-k">LÍNEAS</div>' +
        '<div class="ex-send-lines">' + lineas.map(function(l){
          return '<div class="ex-send-l"><div class="d">' + esc(sinDia(fdate(l.date))) + '</div>' +
                 '<div class="s">' + esc(l.portalSubtype || '—') + '</div>' +
                 '<div class="m">' + eur(l.cost) + '</div></div>'; }).join('') + '</div>' +
        '<div class="ex-send-tot"><span>TOTAL</span><b>' + eur(total) + '</b></div>' +
        '<div class="ex-send-tk">📎 ' + nTk + ' ticket' + (nTk === 1 ? '' : 's') + ' se adjuntan a la nota</div>' +
        '</div>' +
        '<div class="ex-send-foot">' +
          '<div class="ex-btn ghost" onclick="exSendClose()">Cancelar</div>' +
          '<div class="ex-btn" onclick="exSendPaso(2)">Continuar →</div>' +
        '</div>';
    box.innerHTML = h; return;
  }

  /* Paso 2 — la confirmación de verdad. Aquí no se repite el detalle: se dice
     lo único que importa y que el paso anterior no decía, que esto sale de la
     app y va a la Compañía. El botón nace apagado a propósito. */
  h = '<div class="ex-send-h go"><div class="ex-send-ic">✈</div>' +
      '<div class="ex-send-t">¿Enviar esta nota a Vueling?</div>' +
      '<div class="ex-send-s">' + esc(tituloDe(n)) + ' · <b>' + eur(total) + '</b></div></div>' +
      '<div class="ex-send-body">' +
      '<div class="ex-send-warn">Se creará la nota en el portal de la Compañía a tu nombre, con sus ' +
        nTk + ' ticket' + (nTk === 1 ? '' : 's') + '. <b>Desde la app ya no se puede retirar</b> — ' +
        'para anularla tendrías que entrar al portal.</div>' +
      '<label class="ex-send-chk"><input type="checkbox" onchange="exSendCheck(this)">' +
        '<span>He revisado los importes y los tickets</span></label>' +
      '</div>' +
      '<div class="ex-send-foot">' +
        '<div class="ex-btn ghost" onclick="exSendPaso(1)">← Volver</div>' +
        '<div class="ex-btn solid off" id="ex-send-go" onclick="exSendGo()">Sí, enviar a Vueling</div>' +
      '</div>';
  box.innerHTML = h;
}

window.exSendGo = function(){
  var b = document.getElementById('ex-send-go');
  if (!b || b.classList.contains('off')) return;      // sin marcar la casilla no sale
  var n = notaDe(SEND && SEND.id); if (!n) return;
  var motivo = SEND.motivo, id = n.id;
  exSendClose();
  enviarAlPortal(n, motivo);
};

/* ── Enviar VARIAS de una vez ─────────────────────────────────────────────────
   Un piloto no pasa una nota: se sienta un domingo y pasa las cinco del mes.
   Las N notas van al backend en UNA llamada y allí se crean en UNA sola sesión
   de navegador — mandarlas de una en una serían cinco logins, cinco minutos y
   cinco oportunidades de que la sesión caduque a media faena.
   ★ Cada nota lleva su propio resultado de vuelta: que la tercera falle no
   puede dejar sin enviar —ni sin avisar— a la cuarta y la quinta. */
var MAX_LOTE = 10;
window.exSelModo = function(on){
  EX.selMode = !!Number(on); EX.sel = {};
  exRender();
};
window.exSelToggle = function(id){
  EX.sel = EX.sel || {};
  if (EX.sel[id]) delete EX.sel[id];
  else {
    if (Object.keys(EX.sel).length >= MAX_LOTE){
      showToast && showToast('Máximo ' + MAX_LOTE + ' notas por envío', 'warn');
      return;
    }
    EX.sel[id] = 1;
  }
  exRender();
};
function seleccionadas(){
  return Object.keys(EX.sel || {}).map(notaDe).filter(Boolean);
}

/* Barra fija abajo con el recuento. Se crea y se destruye con el modo: si se
   quedara en el DOM taparía la última tarjeta de la lista. */
function barraSel(){
  var vieja = document.getElementById('ex-selbar');
  if (vieja) vieja.remove();
  if (!EX.selMode) return;
  var sel = seleccionadas();
  var tot = r2(sel.reduce(function(a, n){ return a + reclamaDe(n); }, 0));
  var el = document.createElement('div');
  el.id = 'ex-selbar'; el.className = 'ex-selbar' + (sel.length ? ' on' : '');
  el.innerHTML = '<div class="ex-selbar-tx"><b>' + sel.length +
      (sel.length === 1 ? ' nota' : ' notas') + '</b>' +
      '<span>' + (sel.length ? 'reclamas ' + eur(tot) : 'toca las que quieras enviar') + '</span></div>' +
    '<div class="ex-btn ghost" onclick="exSelModo(0)">Cancelar</div>' +
    '<div class="ex-btn cic go' + (sel.length ? '' : ' off') + '" onclick="exEnviarLote()">✈ Enviar</div>';
  document.body.appendChild(el);
}

window.exEnviarLote = function(){
  var sel = seleccionadas();
  if (!sel.length) return;
  /* Las pegas se miran ANTES de la confirmación y por nota: si tres de las
     cinco no pueden salir, hay que decirlo aquí, no dejar que el portal las
     rechace una a una. */
  var malas = sel.filter(function(n){ return pegasDe(n).length; });
  if (malas.length){
    alert('Estas notas todavía no se pueden enviar:\n\n' +
      malas.map(function(n){
        return '• ' + tituloDe(n) + '\n   ' + pegasDe(n)[0].replace(/<[^>]+>/g, '');
      }).join('\n') +
      '\n\nQuítalas de la selección o arréglalas primero.');
    return;
  }
  SEND = { lote: sel.map(function(n){ return n.id; }), paso: 1 };
  var el = sendEl(); drawSendLote(); el.classList.add('on');
};

function drawSendLote(){
  var sel = (SEND.lote || []).map(notaDe).filter(Boolean);
  var tot = r2(sel.reduce(function(a, n){ return a + reclamaDe(n); }, 0));
  var nTk = sel.reduce(function(a, n){ return a + (EX.tkCount[n.id] || 0); }, 0);
  var box = document.getElementById('ex-send-box'), h;

  if (SEND.paso === 1){
    h = '<div class="ex-send-h"><div class="ex-send-ic">🧾</div>' +
      '<div class="ex-send-t">' + sel.length + ' notas a Vueling</div>' +
      '<div class="ex-send-s">Se crea una nota por cada una, como en el portal</div></div>' +
      '<div class="ex-send-body"><div class="ex-send-lines">' +
      sel.map(function(n){
        return '<div class="ex-send-l"><div class="d">' + esc(sinDia(fdate(n.date))) + '</div>' +
          '<div class="s">' + esc(tituloDe(n)) + '</div>' +
          '<div class="m">' + eur(reclamaDe(n)) + '</div></div>'; }).join('') +
      '</div><div class="ex-send-tot"><span>TOTAL</span><b>' + eur(tot) + '</b></div>' +
      '<div class="ex-send-tk">📎 ' + nTk + ' ticket' + (nTk === 1 ? '' : 's') + ' en total</div></div>' +
      '<div class="ex-send-foot"><div class="ex-btn ghost" onclick="exSendClose()">Cancelar</div>' +
      '<div class="ex-btn" onclick="exSendPasoLote(2)">Continuar →</div></div>';
  } else {
    h = '<div class="ex-send-h go"><div class="ex-send-ic">✈</div>' +
      '<div class="ex-send-t">¿Enviar ' + sel.length + ' notas a Vueling?</div>' +
      '<div class="ex-send-s">Total <b>' + eur(tot) + '</b></div></div>' +
      '<div class="ex-send-body">' +
      '<div class="ex-send-warn">Se crearán <b>' + sel.length + ' notas</b> en el portal de la ' +
        'Compañía a tu nombre. <b>Desde la app ya no se pueden retirar</b>.</div>' +
      '<label class="ex-send-chk"><input type="checkbox" onchange="exSendCheck(this)">' +
        '<span>He revisado las ' + sel.length + ' notas</span></label></div>' +
      '<div class="ex-send-foot"><div class="ex-btn ghost" onclick="exSendPasoLote(1)">← Volver</div>' +
      '<div class="ex-btn solid off" id="ex-send-go" onclick="exSendGoLote()">Sí, enviar las ' +
        sel.length + '</div></div>';
  }
  box.innerHTML = h;
}
window.exSendPasoLote = function(p){ if (SEND){ SEND.paso = p; drawSendLote(); } };
window.exSendGoLote = function(){
  var b = document.getElementById('ex-send-go');
  if (!b || b.classList.contains('off')) return;
  var sel = (SEND.lote || []).map(notaDe).filter(Boolean);
  exSendClose(); EX.selMode = false; EX.sel = {};
  enviarLote(sel);
};

function enviarLote(notas){
  notas.forEach(function(n){
    EX.portal[n.id] = { state: 'sending', at: new Date().toISOString() };
  });
  portalSave(); exRender();
  exProgreso('Preparando ' + notas.length + ' notas…');
  pasosDeEspera();

  conTope(cargarTickets(), ENVIO_PREP_MS, MSG_PREP)
    .then(function(){
      return Promise.all(notas.map(function(n){
        return ticketsDe(n).then(function(tk){
          return { ref: n.id, lines: lineasParaEnviar(n, motivoDe(n)), tickets: tk,
                   comment: tituloDe(n) + (n.route ? ' · ' + n.route : '') };
        });
      }));
    })
    .then(function(payload){
      return conTope(api('/api/expense/portal/submit', { method: 'POST', body: {
        notes: payload, draft: false, confirm: true } }), ENVIO_MS, MSG_TARDA);
    })
    .then(function(r){
      var b = r.body || {};
      if (b.status === 'NEEDS_LOGIN'){
        notas.forEach(function(n){
          EX.portal[n.id] = { state: 'login', at: new Date().toISOString(),
            msg: 'La sesión con tu cuenta de Vueling ha caducado. Entra otra vez y se mandan solas.' };
        });
        pedirLogin(function(){ enviarLote(notas); });
      } else if (r.status === 200 && Array.isArray(b.results)){
        var bien = 0;
        b.results.forEach(function(res){
          if (res.ok){
            bien++;
            /* El servidor ya sabe si el bot la ha tumbado: se guarda su estado
               real, no un "enviada" que mañana habría que corregir. */
            var tumbada = res.sheetStatus === 'rejected';
            EX.portal[res.ref] = { state: tumbada ? 'rejected' : 'sent',
              number: res.number, portalId: res.id, at: new Date().toISOString(),
              msg: tumbada ? (res.rejectedReason || 'La Compañía la ha rechazado.')
                           : ((res.warnings && res.warnings.length) ? res.warnings.join('\n') : '') };
            EX.sent[res.ref] = new Date().toISOString(); syncNota(res.ref);
          } else {
            EX.portal[res.ref] = { state: 'error', at: new Date().toISOString(),
              msg: res.error || 'El portal no la aceptó' };
          }
        });
        saveSent();
        var okIds = b.results.filter(function(x){ return x.ok; }).map(function(x){ return x.ref; });
        var eurOk = r2(okIds.reduce(function(a, id){
          var nn = notaDe(id); return a + (nn ? reclamaDe(nn) : 0); }, 0));
        /* Las que llegaron pero la Compañía ya ha tumbado. No son un fallo del
           envío —están en el portal— pero no se pueden celebrar: si se cuentan
           como enviadas, el piloto se queda pensando que va a cobrarlas. */
        var mal = b.results.filter(function(x){ return x.ok && x.sheetStatus === 'rejected'; });
        var vivas = bien - mal.length;
        if (mal.length === 1 && b.results.length === 1){
          exRechazo({ numero: mal[0].number, motivo: mal[0].rejectedReason,
                      id: mal[0].ref });
        } else if (bien){
          exExito({
            titulo: vivas === 0 ? 'Llegaron, pero las han rechazado'
                  : vivas === 1 ? 'Enviada a Vueling'
                                : vivas + ' notas en Vueling',
            numero: vivas === 1 ? (b.results.find(function(x){
                      return x.ok && x.sheetStatus !== 'rejected'; }) || {}).number : null,
            importe: vivas ? eurOk : 0,
            sub: [ mal.length ? mal.length + ' rechazada' + (mal.length > 1 ? 's' : '') +
                                ' al llegar — mira el motivo' : '',
                   bien < b.results.length ? (b.results.length - bien) + ' no salieron' : ''
                 ].filter(Boolean).join(' · '),
            flash: okIds
          });
        } else {
          /* Antes sólo un toast: la pantalla de «Enviando» se quedaba girando. */
          var err1 = (b.results[0] && b.results[0].error) || 'El portal no aceptó ninguna';
          loteFallo(err1);
        }
      } else {
        notas.forEach(function(n){
          EX.portal[n.id] = { state: 'error', at: new Date().toISOString(),
            msg: b.message || b.error || ('El portal respondió ' + r.status) };
        });
        loteFallo(b.message || b.error || ('El portal respondió ' + r.status));
      }
      portalSave(); exRender();
    })
    .catch(function(e){
      var msg = (e && e.message) || 'Sin conexión con el servidor';
      notas.forEach(function(n){
        EX.portal[n.id] = { state: 'error', at: new Date().toISOString(), msg: msg };
      });
      portalSave(); exRender();
      loteFallo(msg);
    });
}
function loteFallo(msg){
  exResultado('mal',
    '<div class="ex-ok-motivo">' + esc(msg) + '</div>' +
    '<div class="ex-ok-p">No han llegado a Vueling. Puedes reintentarlo desde las notas.</div>' +
    '<div class="ex-btn cic err" onclick="exSendClose()">Entendido</div>',
    'No se pudieron enviar', []);
}

/* ── Sesión caducada: se le lleva a entrar, no se le avisa y ya ───────────────
   Un toast diciendo «reconecta eCrews» deja al piloto en el mismo sitio, con la
   nota sin enviar, y encima le habla de eCrews cuando lo que él quiere es
   mandar un gasto. Se le abre la pantalla de entrar y, al volver, se reintenta
   el envío solo.

   ★ Es UNA sola sesión: la cuenta de Vueling (Microsoft) abre el roster y el
   portal de gastos. Por dentro se reutiliza el flujo que ya existe —el único
   que hay— pero al piloto no se le menciona eCrews: se le dice que entre en su
   cuenta, que es lo que va a hacer.

   El login NO se hace por nuestra cuenta desde el servidor — eso es lo que
   disparaba los number-match en cascada de los testers. Lo lanza él. */
/* ★ Entrar es entrar en TU CUENTA, no "sincronizar eCrews".
   Antes esto abría el flujo del roster: una pantalla titulada «Sincronizar
   eCrews» que además se ponía a leerte el calendario entero (30-40 s de
   navegador) cuando lo único que hacía falta era la sesión de Microsoft. El
   piloto le había dado a "Enviar", no a "Sincronizar".
   Ahora la pantalla es de aquí, dice lo que hace, y el backend se para en
   cuanto tiene la sesión (`only_session`). */
var _reintento = null, _login = { sid: null, poll: null };

function pedirLogin(reintentar){
  _reintento = reintentar || null;
  loginPaso('creds');
}

function loginCerrar(){
  if (_login.poll){ clearInterval(_login.poll); _login.poll = null; }
  _login.sid = null;
  exSendClose();
}
window.exLoginCerrar = function(){ _reintento = null; loginCerrar(); };

function loginPaso(paso, datos){
  var el = sendEl(), h = '';
  datos = datos || {};

  if (paso === 'creds'){
    h = '<div class="ex-send-h"><div class="ex-send-ic">🔑</div>' +
      '<div class="ex-send-t">Entra en tu cuenta de Vueling</div>' +
      '<div class="ex-send-s">Hace falta para dejar la nota en el portal. Es tu cuenta ' +
        'de siempre, la de Microsoft.</div></div>' +
      /* ★ Los campos van dentro de un <form> de verdad, con sus `autocomplete`:
         es la única forma de que el LLAVERO del iPhone ofrezca la contraseña
         guardada. Nosotros no la guardamos —no queremos custodiar la contraseña
         corporativa de nadie— pero el gestor del propio teléfono sí, que es
         donde debe estar, y así el piloto no la teclea cada vez. */
      '<div class="ex-send-body">' +
      '<form onsubmit="exLoginGo();return false" autocomplete="on">' +
      '<div class="ex-send-k">CORREO DE VUELING</div>' +
      '<input class="ex-send-txt" id="ex-lg-mail" name="username" type="email" autocomplete="username" ' +
        'inputmode="email" autocapitalize="none" spellcheck="false" ' +
        'placeholder="nombre.apellido@vueling.com" value="' + esc(datos.mail || lsGet('ec_last_mail', '')) + '">' +
      '<div class="ex-send-k">CONTRASEÑA</div>' +
      '<input class="ex-send-txt" id="ex-lg-pass" name="password" type="password" ' +
        'autocomplete="current-password" placeholder="la de tu correo de Vueling">' +
      /* La contraseña viaja al servidor de PilotOS para entrar por ti, y eso hay
         que decirlo con todas las letras ANTES, no en un aviso legal. */
      '<label class="ex-send-chk"><input type="checkbox" id="ex-lg-ok" onchange="exLoginCheck(this)">' +
        '<span>Autorizo a PilotOS a entrar en mi cuenta para dejar la nota. La contraseña ' +
        'no se guarda en nuestros servidores.</span></label>' +
      (datos.error ? '<div class="ex-send-warn" style="margin-top:12px">' + esc(datos.error) + '</div>' : '') +
      '</form></div>' +
      '<div class="ex-send-foot"><div class="ex-btn ghost" onclick="exLoginCerrar()">Ahora no</div>' +
      '<div class="ex-btn solid off" id="ex-lg-go" onclick="exLoginGo()">Entrar</div></div>';
  }

  else if (paso === 'mfa'){
    /* La verificación entera —número, código por SMS, aprobación sin número y
       lista de métodos— la pinta ms-mfa.js, EL MISMO modal que usa el roster.
       Antes esta vista daba por hecho el number-match ("Aprueba en Outlook") y
       un piloto con SMS no tenía dónde escribir su código.

       El aviso de la push sigue aquí, pero condicionado al método: sobre una
       pantalla de código no diría nada cierto. */
    var esPush = (datos.method === 'number' || datos.method === 'approval');
    h = '<div class="ex-send-h go"><div class="ex-send-ic">' + (esPush ? '📲' : '🔑') + '</div>' +
      '<div class="ex-send-t">Verifica tu identidad</div>' +
      '<div class="ex-send-s">Microsoft pide un segundo paso para entrar en tu cuenta.</div></div>' +
      '<div class="ex-send-body"><div id="ex-mfa-host"></div>' +
      (esPush ? '<div class="ex-send-warn">Si no te salta la notificación, <b>abre Outlook a mano</b> y ' +
        'desliza hacia abajo: la solicitud suele estar dentro. <b>No vuelvas a darle a Entrar</b> — ' +
        'eso genera un número nuevo y anula éste.</div>' : '') +
      '</div>';
  }

  else if (paso === 'esperando'){
    h = '<div class="ex-send-h go"><div class="ex-send-ic">⏳</div>' +
      '<div class="ex-send-t">Conectando con tu cuenta</div>' +
      '<div class="ex-send-s">' + esc(datos.txt || 'Un momento…') + '</div></div>' +
      '<div class="ex-send-body" style="text-align:center;padding:20px 18px">' +
      '<i class="ex-dots" style="color:#7EFBFE;transform:scale(2)"><b></b><b></b><b></b></i></div>' +
      '<div class="ex-send-foot"><div class="ex-btn ghost" onclick="exLoginCerrar()">Cancelar</div></div>';
  }

  else if (paso === 'listo'){
    h = '<div class="ex-send-h"><div class="ex-send-ic">✓</div>' +
      '<div class="ex-send-t">Cuenta conectada</div>' +
      '<div class="ex-send-s">' + (_reintento ? 'Se envía la nota…' : 'Ya puedes enviar') + '</div></div>' +
      '<div class="ex-send-body"><div class="ex-send-tk">La sesión se queda guardada: no ' +
        'tendrás que repetirlo cada vez.</div></div>' +
      '<div class="ex-send-foot"><div class="ex-btn" onclick="exLoginCerrar()">Hecho</div></div>';
  }

  document.getElementById('ex-send-box').innerHTML = h;
  el.classList.add('on');
}

window.exLoginCheck = function(el){
  var b = document.getElementById('ex-lg-go');
  if (b) b.classList.toggle('off', !el.checked);
};

window.exLoginGo = function(){
  var b = document.getElementById('ex-lg-go');
  if (!b || b.classList.contains('off')) return;
  var mail = (document.getElementById('ex-lg-mail') || {}).value || '';
  var pass = (document.getElementById('ex-lg-pass') || {}).value || '';
  mail = String(mail).trim();
  if (!mail || !pass){ loginPaso('creds', { mail: mail, error: 'Faltan el correo o la contraseña.' }); return; }
  try { lsSet && lsSet('ec_last_mail', mail); } catch(e){}

  loginPaso('esperando', { txt: 'Comprobando tus datos con Microsoft' });
  /* `target: gastos` → el backend se para en cuanto tiene la sesión y NO lee el
     calendario (serían 30-40 s de navegador que aquí no le sirven a nadie: el
     piloto le ha dado a Enviar, no a Sincronizar). Es el mismo login que el del
     roster; lo único que cambia es qué se hace al terminar. */
  api('/api/ms-auth/gastos/login', { method: 'POST', body: {
    email: mail, password: pass, consent: true,
    // La misma memoria que el roster: es el mismo Entra y el mismo aparato.
    preferMethod: (window.MsMfa && MsMfa.metodoRecordado && MsMfa.metodoRecordado()) || undefined,
    preferFamily: (window.MsMfa && MsMfa.familiaRecordada && MsMfa.familiaRecordada()) || undefined
  }}).then(function(r){
    var b2 = r.body || {};
    if (r.status !== 200){
      loginPaso('creds', { mail: mail, error: b2.error || ('No se pudo entrar (' + r.status + ')') });
      return;
    }
    _login.sid = b2.sessionId;
    loginMfa(b2);
  }).catch(function(){
    loginPaso('creds', { mail: mail, error: 'Sin conexión con el servidor.' });
  });
};

/* Monta el modal compartido de verificación. Una sola función: las cuatro
   vistas las decide el `method` que manda el servidor tras MIRAR la pantalla de
   Microsoft, no una suposición de la app. */
var _mfaMetodo = null;

function mfaBase(){ return (typeof ldBackendUrl === 'function') ? ldBackendUrl() : 'https://api.pilotos.aero'; }

function loginMfa(vista){
  if (typeof MsMfa === 'undefined'){
    loginPaso('creds', { error: 'Falta un componente de la app. Recarga la página.' });
    return;
  }
  _mfaMetodo = (vista && vista.method) || null;
  mfaMonta(vista);
}

/* El marco de fuera (el aviso de la push) depende del método, así que cuando el
   método CAMBIA —el piloto pide otro y pasa de número a código— hay que
   repintar el marco, y con él se va el host del modal. Por eso se remonta.
   Se hace solo al cambiar: repintar en cada tic borraría lo que está tecleando. */
function mfaMonta(vista){
  loginPaso('mfa', { method: _mfaMetodo });
  MsMfa.arranca({
    host: document.getElementById('ex-mfa-host'),
    target: 'gastos',
    sessionId: _login.sid,
    base: mfaBase(),
    token: exToken(),
    onEstado: function(v){
      if (v.method && v.method !== _mfaMetodo){ _mfaMetodo = v.method; mfaMonta(v); }
    },
    onListo: loginListo,
    onError: loginFallo,
    onCancelar: function(){ window.exLoginCerrar(); }
  }, vista);
}

function loginListo(){
  _login.sid = null;
  loginPaso('listo');
  var f = _reintento; _reintento = null;
  if (f) setTimeout(function(){ loginCerrar(); f(); }, 1200);
}

function loginFallo(v){
  loginPaso('creds', { error: (v && v.error) || 'No se pudo entrar.' });
}

/* `loginVigilar` vivía aquí: sondeaba /api/ecrews/login/status y pintaba
   loginPaso('numero'). Lo hace ahora ms-mfa.js, que además entiende el resto de
   métodos. Se BORRA en vez de dejarlo sin llamar: código muerto que apunta a una
   vista que ya no existe es lo que hace perder media hora al siguiente que lo
   lea buscando por qué "no se usa el número". El cierre del ciclo está en
   loginListo / loginFallo, arriba. */

/* ── LA CONFIRMACIÓN DE QUE HA SALIDO ────────────────────────────────────────
   Un toast de tres segundos en una esquina no basta para esto. Mandar una nota
   a la Compañía es de las poquísimas cosas de la app que salen del teléfono y
   no se pueden deshacer: el piloto tiene que quedarse SEGURO de que ha llegado,
   y con el número delante para reconocerla luego en el portal.

   Por eso ocupa la pantalla, trae el número, el importe, y se cierra cuando él
   quiere. Y al volver, su tarjeta se ilumina en verde un segundo — así el ojo
   sabe CUÁL de las notas de la lista es la que acaba de irse.

   El check se dibuja (el trazo se traza, no aparece de golpe): es medio segundo
   y es lo que convierte "ha pasado algo" en "ha salido bien". Con
   prefers-reduced-motion aparece ya hecho, sin animación. */
/* Red de seguridad: el servidor espera 25 s al veredicto, pero el bot puede
   tardar más. Se vuelve a preguntar a los 2 y a los 6 minutos — sólo tras un
   envío, no cada rato — para que un rechazo tardío tampoco pase inadvertido.
   `exRefrescarEstados` ya avisa con un toast de lo que haya cambiado. */
function vigilarVeredicto(){
  [120000, 360000].forEach(function(ms){
    setTimeout(function(){ try { exRefrescarEstados(true); } catch(e){} }, ms);
  });
}

/* ── UNA SOLA PANTALLA, DE PRINCIPIO A FIN ────────────────────────────────────
   Se abre al pulsar Enviar con el círculo girando, y ese MISMO círculo se
   convierte en el check verde o en la cruz roja cuando llega la respuesta. No
   se cierra y se abre otra: el aro es el mismo, y por eso se lee como "esto ha
   terminado así" en vez de como dos avisos sueltos.

   Mientras espera va contando qué está pasando —crear la nota tarda, y el
   servidor además aguarda unos segundos al veredicto del bot— porque veinte
   segundos de rueda muda se parecen demasiado a que se ha colgado. */
function exProgreso(txt){
  var el = sendEl();
  document.getElementById('ex-send-box').innerHTML =
    '<div class="ex-ok cargando" id="ex-ok-caja">' +
      '<div class="ex-ok-halo"></div>' +
      '<div class="ex-ok-mark">' +
        '<svg viewBox="0 0 52 52" aria-hidden="true">' +
          '<circle class="c" cx="26" cy="26" r="23" fill="none"/>' +
          '<path class="t check" fill="none" d="M14.5 27.5l7.5 7.5 15.5-16"/>' +
          '<path class="t cruz" fill="none" d="M18 18l16 16M34 18L18 34"/>' +
        '</svg>' +
      '</div>' +
      '<div class="ex-ok-t" id="ex-ok-t">Enviando a Vueling</div>' +
      '<div class="ex-ok-p" id="ex-ok-p">' + esc(txt || 'Entrando en el portal…') + '</div>' +
      '<div class="ex-ok-cuerpo" id="ex-ok-cuerpo"></div>' +
    '</div>';
  document.getElementById('ex-send-box').classList.add('limpio');
  el.classList.add('on');
}
function exProgresoPaso(txt){
  var p = document.getElementById('ex-ok-p');
  if (p) p.textContent = txt;
}
/* Un envío tarda entre 20 y 45 segundos: abrir el navegador en el servidor,
   entrar con tu sesión, crear la nota y esperar el veredicto del bot. Contarlo
   por encima quita la sensación de cuelgue — y además es verdad, cada frase
   corresponde a algo que está pasando de verdad en ese momento. */
var _pasos = null;
function pasosDeEspera(){
  if (_pasos) clearTimeout(_pasos);
  var guion = [
    [6000,  'Creando la nota con tus tickets…'],
    [14000, 'Ya está en el portal · esperando a que la revisen…'],
    [26000, 'La Compañía la revisa automáticamente. Un momento más…']
  ];
  guion.forEach(function(p){
    setTimeout(function(){
      var caja = document.getElementById('ex-ok-caja');
      if (caja && caja.classList.contains('cargando')) exProgresoPaso(p[1]);
    }, p[0]);
  });
}
/* Cierra el ciclo: el aro se completa y se dibuja el símbolo. Si por lo que sea
   la pantalla de progreso no estaba abierta (un envío desde otro sitio), se
   pinta entera y ya. */
function exResultado(tipo, cuerpo, titulo, flash){
  var caja = document.getElementById('ex-ok-caja');
  if (!caja){ exProgreso(''); caja = document.getElementById('ex-ok-caja'); }
  caja.classList.remove('cargando');
  caja.classList.add(tipo === 'mal' ? 'mal' : 'bien');
  if (tipo === 'mal') document.getElementById('ex-send-box').classList.add('mal');
  document.getElementById('ex-ok-t').textContent = titulo;
  document.getElementById('ex-ok-p').textContent = '';
  document.getElementById('ex-ok-cuerpo').innerHTML = cuerpo;

  EX.flash = {};
  (flash || []).forEach(function(id){ EX.flash[id] = 1; });
  vigilarVeredicto();
  exRender();
  setTimeout(function(){ EX.flash = {}; exRender(); }, 4000);
}

function exExito(d){
  exResultado('bien',
    (d.numero ? '<div class="ex-ok-n">' + esc(d.numero) + '</div>' : '') +
    (d.importe ? '<div class="ex-ok-e">' + eur(d.importe) + '</div>' : '') +
    (d.sub ? '<div class="ex-ok-s">' + esc(d.sub) + '</div>' : '') +
    '<div class="ex-ok-p">Ya está en el portal de Vueling.<br>' +
      'Si te la rechazan, te lo diré aquí con el motivo.</div>' +
    '<div class="ex-btn cic sent" onclick="exSendClose()">Hecho</div>',
    d.titulo || 'Enviada', d.flash);
}

/* ── Y si te la tumban, te enteras AQUÍ ───────────────────────────────────────
   La Compañía tiene un proceso que cruza la nota con tu roster y la rechaza
   sola, en segundos. El aviso oficial es un correo del bot que se lee tarde o
   no se lee. El servidor espera ese veredicto con el navegador ya abierto, así
   que se puede decir en la misma pantalla del envío — con el motivo, que es lo
   único accionable.
   En rojo y sin celebración: la nota está creada, pero no la van a pagar. */
function exRechazo(d){
  portalSave();
  exResultado('mal',
    (d.numero ? '<div class="ex-ok-n">' + esc(d.numero) + '</div>' : '') +
    '<div class="ex-ok-motivo">' + esc(d.motivo || 'El portal no da el motivo. Entra en él para verlo.') + '</div>' +
    '<div class="ex-ok-p">Ha llegado bien: la ha tumbado su revisión automática. ' +
      'Arregla lo que dice y vuelve a mandarla.</div>' +
    '<div class="ex-btn cic err" onclick="exSendClose()">Entendido</div>',
    'Vueling la ha rechazado', d.id ? [d.id] : []);
}

/* ── El envío ─────────────────────────────────────────────────────────────── */
function ticketsDe(n){
  /* Los tickets viven en IndexedDB como blob; el backend los quiere en base64.
     Se mandan los de TODAS las líneas de la nota, que es como los pide el
     portal (los recibos van a la hoja, no a cada línea). */
  var keys = n.lines.map(function(_, i){ return lineKey(n, i); });
  var tks = TICKETS.filter(function(t){ return keys.indexOf(t.lineKey) >= 0; }).slice(0, 5);
  return Promise.all(tks.map(function(t, i){
    if (!t.blob) return Promise.resolve(null);
    return blobToB64(t.blob).then(function(b64){
      return { name: 'ticket-' + (i + 1) + '.jpg', base64: b64, mime: t.blob.type || 'image/jpeg' };
    });
  })).then(function(l){ return l.filter(Boolean); });
}

function enviarAlPortal(n, motivo){
  EX.portal[n.id] = { state: 'sending', at: new Date().toISOString() };
  portalSave(); exRender();
  exProgreso('Preparando los tickets…');
  pasosDeEspera();

  conTope(cargarTickets().then(function(){ return ticketsDe(n); }), ENVIO_PREP_MS, MSG_PREP)
    .then(function(tickets){
      exProgresoPaso('Entrando en el portal de Vueling…');
      return conTope(api('/api/expense/portal/submit', { method: 'POST', body: {
        lines: lineasParaEnviar(n, motivo),
        tickets: tickets,
        comment: tituloDe(n) + (n.route ? ' · ' + n.route : ''),
        draft: false,          // va a la Compañía: lo acaba de confirmar el piloto
        confirm: true          // segundo cerrojo, exigido por el backend
      }}), ENVIO_MS, MSG_TARDA);
    })
    .then(function(r){
      var b = r.body || {};
      if (b.status === 'NEEDS_LOGIN'){
        EX.portal[n.id] = { state: 'login', at: new Date().toISOString(),
          msg: 'La sesión con tu cuenta de Vueling ha caducado. Entra otra vez y se manda sola.' };
        pedirLogin(function(){ enviarAlPortal(n, motivo); });
      } else if (r.status === 200 && b.status === 'OK'){
        EX.portal[n.id] = { state: 'sent', number: b.number, portalId: b.id,
                            at: new Date().toISOString(),
                            msg: (b.warnings && b.warnings.length) ? b.warnings.join('\n') : '' };
        /* Enviada es enviada: la nota pasa a "ya la pasé" sola. Si no, el piloto
           tendría que marcarla a mano justo después de mandarla. */
        EX.sent[n.id] = new Date().toISOString(); saveSent(); syncNota(n.id);
        /* El servidor ha esperado unos segundos al veredicto del bot. Si ya la
           ha tumbado, se dice AHORA y con el motivo: enterarse aquí es poder
           arreglarlo hoy; enterarse por el correo es no enterarse. */
        if (b.sheetStatus === 'rejected'){
          EX.portal[n.id].state = 'rejected';
          EX.portal[n.id].msg = b.rejectedReason || 'La Compañía la ha rechazado.';
          exRechazo({ numero: b.number, motivo: b.rejectedReason, nota: tituloDe(n), id: n.id });
        } else {
          exExito({ titulo: 'Enviada a Vueling', numero: b.number,
                    importe: reclamaDe(n), sub: tituloDe(n), flash: [n.id] });
        }
      } else {
        EX.portal[n.id] = { state: 'error', at: new Date().toISOString(),
          msg: b.message || b.error || ('El portal respondió ' + r.status) };
        /* El círculo también se cierra cuando sale mal: dejarlo girando para
           siempre es peor que decir que no ha salido. */
        exResultado('mal',
          '<div class="ex-ok-motivo">' + esc(EX.portal[n.id].msg) + '</div>' +
          '<div class="ex-ok-p">No ha llegado a Vueling. Puedes reintentarlo desde la nota.</div>' +
          '<div class="ex-btn cic err" onclick="exSendClose()">Entendido</div>',
          'No se pudo enviar', []);
      }
      portalSave(); exRender();
    })
    .catch(function(e){
      EX.portal[n.id] = { state: 'error', at: new Date().toISOString(),
        msg: (e && e.message) ? e.message : 'Sin conexión con el servidor' };
      portalSave();
      exResultado('mal',
        '<div class="ex-ok-motivo">' + esc(EX.portal[n.id].msg) + '</div>' +
        '<div class="ex-ok-p">No ha llegado a Vueling. Puedes reintentarlo desde la nota.</div>' +
        '<div class="ex-btn cic err" onclick="exSendClose()">Entendido</div>',
        'No se pudo enviar', []);
    });
}

/* ── Estado real, traído del portal ──────────────────────────────────────────
   Enviar no es el final. De las 91 notas de la cuenta con la que se probó esto,
   **21 estaban rechazadas** — 599,80 € reclamados y no cobrados — y el piloto no
   lo sabía: el aviso es un correo del bot que se lee una vez y se entierra.
   Por eso la app pregunta al portal por TODAS tus notas, no sólo por las que ha
   mandado ella, y por las rechazadas trae además el MOTIVO, que el portal sí
   da (en los comentarios de la hoja) y es lo único accionable:
     · "Automatic rejection. Does not match with Roster"
     · "Ya se aprueban 34.02€ en la NG-2026-089015"
     · "Es imprescindible que aparezca la fecha en el ticket" */
var K_SHEETS = 'pilotos_gastos_portal_hojas', K_VISTAS = 'pilotos_gastos_rech_vistas';
function sheetsLoad(){
  try { EX.sheets = JSON.parse(localStorage.getItem(K_SHEETS) || '[]') || []; } catch(e){ EX.sheets = []; }
  try { EX.vistas = JSON.parse(localStorage.getItem(K_VISTAS) || '{}') || {}; } catch(e){ EX.vistas = {}; }
}
function sheetsSave(){
  try { localStorage.setItem(K_SHEETS, JSON.stringify(EX.sheets || [])); } catch(e){}
  try { localStorage.setItem(K_VISTAS, JSON.stringify(EX.vistas || {})); } catch(e){}
}
function rechazadas(){ return (EX.sheets || []).filter(function(s){ return s.status === 'rejected'; }); }

/* El banner. En rojo si hay rechazos que el piloto aún no ha abierto; apagado
   cuando ya los ha visto — sigue ahí, pero deja de gritar. */
function bannerPortal(){
  var mal = rechazadas();
  if (!mal.length) return '';
  var nuevas = mal.filter(function(s){ return !(EX.vistas || {})[s.number]; });
  var eurTot = r2(mal.reduce(function(a, s){ return a + (Number(s.amount) || 0); }, 0));
  var eurNue = r2(nuevas.reduce(function(a, s){ return a + (Number(s.amount) || 0); }, 0));
  return '<div class="ex-rech' + (nuevas.length ? ' nuevo' : '') + '" onclick="exVerRechazos()">' +
    '<div class="ex-rech-ic">' + (nuevas.length ? '!' : '✕') + '</div>' +
    '<div class="ex-rech-tx"><b>' +
      (nuevas.length
        ? nuevas.length + (nuevas.length === 1 ? ' nota rechazada' : ' notas rechazadas') + ' · ' + eur(eurNue)
        : mal.length + (mal.length === 1 ? ' nota rechazada' : ' notas rechazadas') + ' · ' + eur(eurTot)) +
    '</b><span>' + (nuevas.length ? 'Vueling no te las va a pagar · toca para ver por qué'
                                  : 'histórico · toca para revisarlas') + '</span></div>' +
    '<div class="ex-rech-go">›</div></div>';
}

window.exVerRechazos = function(){
  var mal = rechazadas();
  if (!mal.length) return;
  var el = sheetEl();
  var h = '<div class="ex-lbl2">LO QUE VUELING NO TE HA PAGADO</div>' +
    '<div class="ex-sh-t">' + mal.length + (mal.length === 1 ? ' nota rechazada' : ' notas rechazadas') + '</div>' +
    '<div class="ex-sh-s">Suman <b>' + eur(r2(mal.reduce(function(a,s){ return a+(Number(s.amount)||0); },0))) +
    '</b> que reclamaste y no vas a cobrar</div>';
  h += mal.map(function(s){
    return '<div class="ex-rj">' +
      '<div class="ex-rj-h"><span class="n">' + esc(s.number || '—') + '</span>' +
        '<span class="m">' + eur(s.amount) + '</span></div>' +
      '<div class="ex-rj-d">' + esc(sinDia(fdate(String(s.date || '').slice(0, 10)))) + '</div>' +
      '<div class="ex-rj-r">' + esc(s.reason || 'El portal no da el motivo. Entra en él para verlo.') + '</div>' +
      '</div>'; }).join('');
  /* Se marcan como vistas al abrirlas: el aviso rojo ha cumplido su función y
     no tiene por qué seguir dando la lata cada vez que entras. */
  mal.forEach(function(s){ EX.vistas[s.number] = 1; });
  sheetsSave();
  h += '<div class="ex-note">El motivo lo escribe quien la revisa en la Compañía. ' +
       '«Does not match with Roster» lo pone un <b>proceso automático</b> que cruza la nota con ' +
       'tu roster de ese día — si crees que se equivoca, la reclamación va por el portal.</div>' +
       '<div class="ex-row"><div class="ex-btn" onclick="exClose()">Entendido</div></div>';
  document.getElementById('ex-sheetbody').innerHTML = h;
  el.classList.add('on');
  exRender();                                     // el banner ya no va en rojo
};

var _ultEstados = 0;
window.exRefrescarEstados = function(forzar){
  /* Cada consulta arranca un navegador en el servidor, así que se espacia. Pero
     el freno NO es el mismo siempre: si hay notas esperando veredicto se
     pregunta cada 5 minutos, y si no hay ninguna pendiente, cada media hora.
     Es lo que hace que un rechazo que llega media hora tarde —cuando la
     Compañía manda su correo— se vea al abrir la app y no tres días después. */
  var esperando = Object.keys(EX.portal || {}).some(function(k){
    var e = EX.portal[k];
    return e && e.number && (e.state === 'sent' || e.state === 'requested' || e.state === 'review');
  });
  var freno = esperando ? 5 * 60 * 1000 : 30 * 60 * 1000;
  if (!forzar && Date.now() - _ultEstados < freno) return Promise.resolve();
  _ultEstados = Date.now();
  return api('/api/expense/portal/status').then(function(r){
    var b = r.body || {};
    if (b.status !== 'OK' || !Array.isArray(b.sheets)) return;

    var antes = {};
    (EX.sheets || []).forEach(function(s){ antes[s.number] = s.status; });
    EX.sheets = b.sheets;

    /* Las que mandó la app: se les actualiza su chip y su motivo. */
    var porNum = {};
    b.sheets.forEach(function(s){ porNum[s.number] = s; });
    Object.keys(EX.portal || {}).forEach(function(k){
      var e = EX.portal[k]; if (!e || !e.number) return;
      var s = porNum[e.number]; if (!s) return;
      if (ENV_UI[s.status] && e.state !== s.status){
        e.state = s.status;
        if (s.status === 'rejected') e.msg = s.reason || 'La Compañía la ha rechazado.';
      }
    });
    portalSave(); sheetsSave();

    /* Un rechazo nuevo se avisa en el momento, no sólo con el banner: es la
       única novedad de aquí que le cuesta dinero al piloto. */
    var nuevos = b.sheets.filter(function(s){
      return s.status === 'rejected' && antes[s.number] && antes[s.number] !== 'rejected'; });
    if (nuevos.length && typeof showToast === 'function')
      showToast('Vueling ha rechazado ' + nuevos.length +
                (nuevos.length === 1 ? ' nota' : ' notas'), 'warn');
    exRender();
  }).catch(function(){});
};


window.exRender = exRender;
window.exInit = function(){
  loadLocal(); portalLoad(); paidLoad(); sheetsLoad(); vistasNLoad(); fechasLoad(); motivosLoad();
  ARRANCADO = false; arrancar();
  /* Al entrar en Gastos se pregunta al portal cómo van tus notas. Va detrás de
     su propio freno de media hora (cada consulta arranca un navegador en el
     servidor), y si falla no se nota: el banner se pinta con lo último que se
     supo. */
  try { exRefrescarEstados(); } catch(e){}
};

})();
