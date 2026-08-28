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
           base: (window.ppGet&&ppGet('base'))||BASE_DEFAULT, mes: null, sync: null };
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
function blobToB64(b){ return new Promise(function(res){
  var fr = new FileReader();
  fr.onload = function(){ res(String(fr.result).split(',')[1]); };
  fr.readAsDataURL(b); }); }

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
function construirDias(){
  var rows = rosterRows(), byDay = {};
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
  }).filter(function(d){ return d.legs.length; });
}

function detectar(){
  if (!window.NGasto) { EX.auto = []; return; }
  var days = construirDias();
  if (!days.length) { EX.auto = []; return; }
  var res = window.NGasto.detectPeriod(days);
  EX.auto = res.notes.map(function(x, i){
    var n = x.note, d = null;
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
        slotLabel: l.slotLabel || (l.lateSignature ? 'Firma tarde' : 'Pernocta'),
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

/* ════════ RENDER ════════ */
function exRender(){
  var host = document.getElementById('pc-tab-gastos');
  if (!host) return;
  loadLocal();
  arrancar();
  detectar();

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
  if (!rosterRows().length){
    /* Sin botón de "importar roster" a propósito: sacaría al piloto de Gastos
       para hacer algo que ya hace por su cuenta en su pantalla. El aviso
       explica qué falta y justo debajo tiene "Nueva nota", que sí se queda aquí. */
    h += '<div class="ex-empty">Importa tu roster (en la pantalla <b>Roster</b>) y la app '+
         'detectará sola los posicionales y las pernoctas.<br>Mientras tanto, puedes crear '+
         'notas a mano aquí abajo.</div>';
  }

  if (meses.length > 1) h += mesesStrip(meses);

  h += '<div class="ex-hero">'+
    '<div class="ex-lbl">POR RECLAMAR · '+(EX.mes==='*' ? 'TODOS LOS MESES' : mesLargo(EX.mes))+'</div>'+
    '<div class="ex-big">'+eur(tope)+'</div>'+
    '<div class="ex-sub">tope máximo · '+pend.length+(pend.length===1?' nota':' notas')+
      ' · '+pend.reduce(function(a,n){return a+n.lines.length;},0)+' líneas</div>'+
    /* El tope no es dinero cobrado: el portal paga lo que sumen los tickets.
       Decirlo aquí, y no en letra pequeña, evita el "leí 128 € y cobré 40". */
    (pend.length
      ? '<div class="ex-real">'+
          (recl > 0
            ? 'Con tus tickets reclamas <b>'+eur(recl)+'</b>'+
              (margen > 0 ? ' · te quedan '+eur(margen)+' de margen' : ' · tope alcanzado')
            : 'Aún <b>sin tickets</b>: sin ticket adjunto no se abona nada de esto')+
        '</div>'
      : '')+
    '<div class="ex-tiles">'+
      '<div class="ex-tile'+(recl>0?' cash':'')+'"><div class="n">'+eur(recl)+'</div>'+
        '<div class="l">CON TUS TICKETS</div></div>'+
      '<div class="ex-tile ok"><div class="n">'+eur(totS)+'</div><div class="l">YA PASADAS</div></div>'+
      (prox
        ? '<div class="ex-tile'+(daysLeft(prox.date)<=30?' warn':'')+'"'+
          (proxFuera ? ' onclick="exMes(\''+proxMes+'\')"' : '')+'><div class="n">'+
          daysLeft(prox.date)+(daysLeft(prox.date)===1?' día':' días')+'</div>'+
          '<div class="l">CADUCA LA 1ª · '+(proxFuera ? mesLbl(proxMes) : eur(topeDe(prox)||tkDe(prox)))+
          '</div></div>'
        : '<div class="ex-tile" style="opacity:.45"><div class="n">—</div><div class="l">SIN PLAZOS</div></div>')+
    '</div>'+ nubeEstado() +'</div>';

  h += '<div class="ex-sect">AÑADIR A MANO</div>'+
    '<div class="ex-new" onclick="exPickTipo()">＋ Nueva nota de gasto</div>'+
    '<div class="ex-note" style="margin:6px 4px 0">La app detecta sola los posicionales y las '+
    'pernoctas. Lo demás — una incidencia, el horno, un reconocimiento médico — lo marcas tú.</div>';

  if (pend.length) h += porMeses(pend, 'PENDIENTE DE TI', false);
  if (done.length) h += porMeses(done, 'YA PASADAS AL PORTAL', true);
  host.innerHTML = h;
}

/* Las notas se agrupan por MES, con su subtotal: un piloto no piensa "mis
   gastos", piensa "lo de julio". Y el plazo de 3 meses también va por mes. */
function porMeses(list, titulo, isDone){
  var g = {}, orden = [];
  list.slice().sort(function(a,b){ return b.date.localeCompare(a.date); })
      .forEach(function(n){
        var k = n.date.slice(0,7);
        if (!g[k]) { g[k] = []; orden.push(k); }
        g[k].push(n);
      });
  var h = '<div class="ex-sect">'+titulo+'</div>';
  orden.forEach(function(k){
    var sub = sumaDe(g[k], topeDe), rec = sumaDe(g[k], reclamaDe);
    var id = k + (isDone ? '-d' : '-p');
    DSG[id] = g[k];
    h += '<div class="ex-mes"><span class="m">'+mesLargo(k)+'</span>'+
         '<span class="s">'+g[k].length+(g[k].length===1?' nota · ':' notas · ')+eur(sub)+
         (rec>0 ? ' · reclamas '+eur(rec) : '')+'</span></div>'+
         '<div class="ex-dsgbar"><span class="ex-whyb" onclick="exDesglose(\''+id+'\',this)">'+
           'ver desglose del mes</span></div>'+
         '<div class="ex-dsgbox" id="dsg-'+id+'" style="display:none"></div>';
    g[k].forEach(function(n){ h += card(n, isDone); });
  });
  return h;
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
window.exDesglose = function(id, el){
  var box = document.getElementById('dsg-'+id);
  if (!box) return;
  if (box.style.display !== 'none' && box.innerHTML){
    box.style.display = 'none'; el.textContent = 'ver desglose del mes'; return;
  }
  if (!box.innerHTML) box.innerHTML = desglose(DSG[id]);
  box.style.display = ''; el.textContent = 'ocultar desglose';
};

function card(n, isDone){
  var T = tipoDe(n.kind), left = daysLeft(n.date);
  var chip = n.kind==='voucher'
    ? '<span class="ex-chip tipo">'+n.lines.length+' VOUCHERS</span>'
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
    var noches = n.lines.filter(function(l){ return !/Firma/i.test(l.subtype); }).length;
    var tarde  = n.lines.some(function(l){ return /Firma/i.test(l.subtype); });
    sub = sinDia(fdate(n.date)) + ' → ' + sinDia(fdate(n.lines[n.lines.length-1].date)) +
          '  ·  ' + noches + (noches===1?' noche':' noches') + (tarde?' + firma tarde':'');
  }

  /* Cada línea con SU día: en las pernoctas las noches son de días distintos al
     de la tarjeta, y sin la fecha delante no hay forma de saber de dónde sale
     cada importe. Detrás, lo que llevas de ticket en esa línea concreta. */
  var lines = '<div class="ex-lines">' + n.lines.map(function(l, i){
    var tk = tkDeLinea(n, i), cap = Number(l.cap)||0;
    /* Ámbar cuando el ticket pasa del tope: no es que falte, es que ese exceso
       no lo abona nadie — mejor saberlo aquí que al cobrar. */
    var cls = tk ? (cap && tk > cap ? 'over' : '') : 'no';
    return '<div class="ex-ln"><div class="k"><b>'+esc(sinDia(fdate(l.date||n.date)))+'</b> '+
      esc(l.slotLabel)+
      (l.window?' <span>'+esc(l.window)+'</span>':(l.where?' <span>'+esc(ciudad(l.where))+'</span>':''))+
      '</div><div class="v">'+eur(l.cap)+
      '<i class="'+cls+'">'+(tk ? 'ticket '+eur(tk)+(cls==='over'?' · pasa del tope':'') : 'sin ticket')+'</i>'+
      '</div></div>'; }).join('') + '</div>';

  /* "¿por qué?" plegado: el que se fía no lo abre nunca; el que duda lo abre
     una vez y ya se fía. Sólo tiene sentido donde hay franjas y jornada. */
  var why = '';
  if ((n.segments||[]).length && (n.slots||[]).length){
    why = '<div class="ex-whybar"><span class="ex-whyb" onclick="event.stopPropagation();exWhy(\''+
      n.id+'\',this)">¿por qué?</span></div>'+
      '<div class="ex-whybox" id="why-'+n.id+'" style="display:none"></div>';
  }

  var nTk = EX.tkCount[n.id] || 0;
  return '<div class="ex-day'+(isDone?' done':'')+'" style="--tcol:'+T.col+'">'+
    '<div class="ex-top"><div>'+
      '<div class="ex-dd">'+T.ic+'  '+fdate(n.date).toUpperCase()+'</div>'+
      '<div class="ex-title">'+esc(titulo)+' '+(isDone?'<span class="ex-chip ok">ENVIADA</span>':chip+' '+sc)+'</div>'+
      '<div class="ex-route">'+esc(sub)+'</div>'+
    '</div><div class="ex-right">'+
      /* El importe grande es el TOPE (por eso el "hasta"); debajo, lo que de
         verdad reclamas con los tickets que llevas puestos. */
      '<div class="ex-amt">'+eur(topeDe(n)===null ? tkDe(n) : topeDe(n))+
        '<small>'+(isDone?'PASADA':'HASTA')+'</small>'+
        (tkDe(n) ? '<em>'+eur(reclamaDe(n))+' con tickets</em>' : '')+'</div>'+
      /* Sólo las notas creadas a mano se pueden borrar: las automáticas vuelven
         a salir en el siguiente render (las manda el roster), así que un botón
         de borrar ahí sería mentira. Mismo icono y opacidad que el logbook. */
      (n.manual ? '<button class="ex-del" title="Eliminar nota" '+
        'onclick="event.stopPropagation();exDelNota(\''+n.id+'\')">🗑</button>' : '')+
    '</div></div>'+
    bar + lines + why +
    (!isDone && left<=20 ? '<div class="ex-note">⏳ Te quedan <b>'+left+' días</b> para presentarla.</div>' : '')+
    (!isDone && n.needsISO ? (isoDe(n)
        ? '<div class="ex-note">Nº de ISO <b>'+esc(isoDe(n))+'</b> · <span class="ex-lnk" onclick="event.stopPropagation();exSetIso(\''+n.id+'\')">cambiar</span></div>'
        : '<div class="ex-note">Requiere <b>nº de ISO</b> — lo hace la tripulación técnica o de cabina. <span class="ex-lnk" onclick="event.stopPropagation();exSetIso(\''+n.id+'\')">Añadirlo</span></div>') : '')+
    (!isDone && !nTk ? '<div class="ex-note">📷 Aún <b>sin tickets</b> — sin ticket adjunto no se aprueba.</div>' : '')+
    '<div class="ex-row">'+
      (isDone
        ? '<div class="ex-btn ghost" onclick="exUnmark(\''+n.id+'\')">↩ No la pasé</div>'
        : '<div class="ex-btn" onclick="exOpen(\''+n.id+'\')">'+
            (nTk ? '🧾 '+nTk+' ticket'+(nTk>1?'s':'')+' · abrir' : '📷 Añadir tickets')+'</div>'+
          '<div class="ex-btn ghost" onclick="exMark(\''+n.id+'\')">Ya la pasé</div>')+
    '</div></div>';
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
window.exClose = function(){
  var s = document.getElementById('ex-sheet'); if (s) s.classList.remove('on');
  SHEET = null; contarTickets();
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
    h += cp('DATE *', l.date.split('-').reverse().join('/'));
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
    h += cp('COST *', (claim>0?claim:l.cap).toFixed(2).replace('.',','), '',
            claim>0 ? 'suma de tus tickets' : 'tope · aún sin tickets');

    h += '<div class="ex-tk"><div class="ex-tkhead"><div class="k">TICKETS DE ESTA LÍNEA</div>'+
      '<div class="n">'+tks.length+'</div></div><div class="ex-thumbs">'+
      tks.map(function(t){ return '<div class="ex-th">'+
        (t.url?'<img src="'+t.url+'" alt="ticket">':'<div class="ex-noimg">☁</div>')+
        '<div class="a">'+(Number(t.amount)||0).toFixed(2).replace('.',',')+'</div>'+
        '<div class="x" onclick="exDelTk(\''+t.id+'\')">✕</div>'+
        '<div class="dl" onclick="exOutTk(\''+t.id+'\')">↓</div></div>'; }).join('')+
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
      '</div><div class="ex-sum">'+
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

  // La entrada compartida por los botones de Cámara y Galería (ver exPickTk).
  h += '<input type="file" accept="image/*" id="ex-file" style="display:none">';

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
  h += '<div class="ex-row"><div class="ex-btn" onclick="exClose()">✓ Guardar</div>'+
       (nTk ? '<div class="ex-btn ghost" onclick="exOutAll()">↓ Sacar los '+nTk+'</div>' : '')+'</div>'+
       '<div class="ex-row"><div class="ex-btn solid" onclick="exMark(\''+n.id+'\');exClose()">Marcar como pasada</div></div>'+
       (n.manual ? '<div class="ex-row"><div class="ex-btn ghost danger" onclick="exDelNota(\''+n.id+'\')">Borrar esta nota</div></div>' : '');

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
  shrink(file).then(function(blob){
    var id = 'tk-' + Date.now() + '-' + Math.round(Math.random()*1e6);
    // Pro: la IA lee el ticket y separa lo que computa. Free: importe a mano.
    var pre = exIsPro() ? leerConIA(blob) : Promise.resolve(null);
    return pre.then(function(ia){
      var sug = ia && ia.computable != null ? String(ia.computable).replace('.',',') : '';
      var txt = prompt('Importe del ticket (€)\n\nSolo lo que computa: productos alimenticios.\n'+
        'No cuentan el alcohol fuera de menú ni lo no alimentario.' +
        (ia ? '\n\n✦ La IA ha leído: total ' + ia.total + ' € · computable ' + ia.computable + ' €' : ''), sug);
      if (txt === null) return;
      var amount = parseFloat(String(txt).replace(',', '.'));
      if (!isFinite(amount) || amount <= 0) { alert('Importe no válido'); return; }
      var rec = { id:id, lineKey:key, blob:blob, amount:amount,
        shop: ia && ia.shop || null, ticket_date: ia && ia.date || null,
        items: ia && ia.items || null, source: ia ? 'ai' : 'manual',
        added: new Date().toISOString() };
      return tkPut(rec).then(function(){ return subirTicket(rec, key); })
        .then(cargarTickets).then(drawSheet)
        .catch(function(){ alert('No se pudo guardar el ticket en este navegador.'); });
    });
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
  if (!confirm('¿Borrar este ticket?')) return;
  var t = null; TICKETS.forEach(function(x){ if (x.id===id) t = x; });
  var nota = t ? String(t.lineKey).split('#')[0] : '';
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
function contarTickets(){
  tkAll().then(function(all){
    EX.tkCount = {}; EX.tkSum = {}; EX.tkLine = {};
    (all||[]).forEach(function(t){
      var id = String(t.lineKey).split('#')[0], eur = Number(t.amount)||0;
      EX.tkCount[id] = (EX.tkCount[id]||0) + 1;
      EX.tkSum[id]   = (EX.tkSum[id]||0) + eur;
      // Por LÍNEA (lineKey = idNota#índice): es lo que permite decir en qué
      // franja concreta te falta ticket, no solo que la nota va corta.
      EX.tkLine[t.lineKey] = (EX.tkLine[t.lineKey]||0) + eur;
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
function subirCola(){
  var claves = Object.keys(EX.pend || {});
  if (!claves.length) return Promise.resolve(0);
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
      var t = null; TICKETS.forEach(function(x){ if (x.id === id) t = x; });
      if (!t){ hechas.push(k); return; }
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
window.exCrear = function(tid, subtype, cap, slot, lbl){
  var T = tipoDe(tid);
  var el = document.getElementById('ex-mdate');
  var d = (el && el.value) || new Date().toISOString().slice(0,10);
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
window.exDelNota = function(id){
  if (!confirm('¿Borrar esta nota?')) return;
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
  contarTickets();
  exSync();
}
window.exRender = exRender;
window.exInit = function(){ loadLocal(); ARRANCADO = false; arrancar(); };

})();
