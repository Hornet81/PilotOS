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
  { id:'oven',     portal:'Inoperative oven', lbl:'Horno inoperativo', col:'#FF6B1A', ic:'🔥',
    meals:true, cap:{nat:28.21,int:34.02}, win:[-1,0,1] },
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
var EX = { auto: [], manual: [], sent: {}, tkCount: {}, base: BASE_DEFAULT };
var K_SENT = 'pilotos_gastos_enviadas', K_MAN = 'pilotos_gastos_manual';
function loadLocal(){
  try { EX.sent = JSON.parse(localStorage.getItem(K_SENT) || '{}'); } catch(e){ EX.sent = {}; }
  if (Array.isArray(EX.sent)) { var o={}; EX.sent.forEach(function(i){o[i]=1;}); EX.sent=o; }
  try { EX.manual = JSON.parse(localStorage.getItem(K_MAN) || '[]'); } catch(e){ EX.manual = []; }
}
function saveSent(){ try { localStorage.setItem(K_SENT, JSON.stringify(EX.sent)); } catch(e){} }
function saveMan(){ try { localStorage.setItem(K_MAN, JSON.stringify(EX.manual)); } catch(e){} }
function todas(){ return EX.auto.concat(EX.manual); }

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
function api(path, opts){
  opts = opts || {};
  var base = (typeof ldBackendUrl === 'function') ? ldBackendUrl() : 'https://api.pilotos.aero';
  var tok = null;
  try { tok = localStorage.getItem('pilotos_token') || localStorage.getItem('cafi_token'); } catch(e){}
  return fetch(base + path, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'Content-Type':'application/json' },
      tok ? { 'Authorization':'Bearer ' + tok } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function(r){ return r.json().then(function(j){ return { status:r.status, body:j }; }); });
}
function exIsPro(){ try { return typeof isPro === 'function' ? !!isPro() : false; } catch(e){ return false; } }

/* ════════ DERIVAR LOS DERECHOS DESDE EL ROSTER ════════
   El roster vive en window.rstEntries (lo carga la pestaña ROSTER). Las horas
   son UTC; las franjas del convenio son hora LOCAL — de eso ya se encarga el
   motor. Aquí sólo se agrupa por día y se decide dónde duerme. */
function rosterRows(){
  var r = window.rstEntries || window.RST_ENTRIES || [];
  return Array.isArray(r) ? r : [];
}
function construirDias(){
  var rows = rosterRows(), byDay = {};
  rows.forEach(function(e){
    var d = e.date || (e.raw_data||{}).date; if (!d) return;
    (byDay[d] = byDay[d] || []).push(e);
  });
  var dates = Object.keys(byDay).sort();
  if (!dates.length) return [];

  function rawDay(d){
    var rs = byDay[d] || [], rd = {};
    rs.forEach(function(x){ var v = x.raw_data || x;
      if (!rd.checkin && v.checkin) rd.checkin = v.checkin;
      if (!rd.debrief && v.debrief) rd.debrief = v.debrief; });
    return {
      date: d, checkin: rd.checkin, debrief: rd.debrief,
      legs: rs.filter(function(x){ return (x.entry_type||x.type)==='flight' && x.dep && x.arr; })
        .map(function(x){ return { dep:x.dep, arr:x.arr, std:x.std, sta:x.sta,
          flightNum: x.flight_number || x.flightNum,
          positioning: !!(x.positioning || (x.raw_data||{}).isPositioning || x.isPositioning) }; })
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
      route: (d && d.legs || []).map(function(l){ return (l.positioning?'✱':'') + l.dep + '→' + l.arr; }).join('  '),
      scope: rd ? rd.scope : 'nat', needsISO: !!n.needsISO, single: !!n.single,
      maxTotal: n.maxTotal, ticketWindow: n.ticketWindow,
      lines: (n.lines||[]).map(function(l){ return {
        date:l.date, subtype:l.portalSubtype, cap:l.cap, slot:l.slot||null,
        slotLabel: l.slotLabel || (l.lateSignature ? 'Firma tarde' : 'Pernocta'),
        window: l.window||null, where: l.where||l.city||null }; }),
      covered: { catering: rd ? rd.coveredByCatering : [], voucher: rd ? rd.coveredByVoucher : [] }
    };
  });
}

/* ════════ RENDER ════════ */
function exRender(){
  var host = document.getElementById('pc-tab-gastos');
  if (!host) return;
  loadLocal();
  detectar();

  var all = todas();
  var pend = all.filter(function(n){ return !EX.sent[n.id]; });
  var done = all.filter(function(n){ return  EX.sent[n.id]; });
  var tot  = pend.reduce(function(a,n){ return a + n.maxTotal; }, 0);
  var totS = done.reduce(function(a,n){ return a + n.maxTotal; }, 0);
  var prox = pend.slice().sort(function(a,b){ return daysLeft(a.date)-daysLeft(b.date); })[0];

  var h = '';
  if (!rosterRows().length){
    h += '<div class="ex-empty">Importa tu roster para que la app detecte sola '+
         'los posicionales y las pernoctas.<br>Mientras tanto puedes crear notas a mano.</div>';
  }

  h += '<div class="ex-hero">'+
    '<div class="ex-lbl">POR RECLAMAR</div>'+
    '<div class="ex-big">'+eur(tot)+'</div>'+
    '<div class="ex-sub">'+pend.length+(pend.length===1?' nota detectada':' notas detectadas')+
      ' · '+all.reduce(function(a,n){return a+n.lines.length;},0)+' líneas</div>'+
    '<div class="ex-tiles">'+
      '<div class="ex-tile ok"><div class="n">'+eur(totS)+'</div><div class="l">YA PASADAS</div></div>'+
      (prox
        ? '<div class="ex-tile'+(daysLeft(prox.date)<=30?' warn':'')+'"><div class="n">'+
          daysLeft(prox.date)+(daysLeft(prox.date)===1?' día':' días')+'</div>'+
          '<div class="l">CADUCA LA 1ª · '+eur(prox.maxTotal)+'</div></div>'
        : '<div class="ex-tile" style="opacity:.45"><div class="n">—</div><div class="l">SIN PLAZOS</div></div>')+
    '</div></div>';

  h += '<div class="ex-sect">AÑADIR A MANO</div>'+
    '<div class="ex-new" onclick="exPickTipo()">＋ Nueva nota de gasto</div>'+
    '<div class="ex-note" style="margin:6px 4px 0">La app detecta sola los posicionales y las '+
    'pernoctas. Lo demás — una incidencia, el horno, un reconocimiento médico — lo marcas tú.</div>';

  if (pend.length){
    h += '<div class="ex-sect">PENDIENTE DE TI</div>';
    pend.sort(function(a,b){ return b.date.localeCompare(a.date); })
        .forEach(function(n){ h += card(n,false); });
  }
  if (done.length){
    h += '<div class="ex-sect">YA PASADAS AL PORTAL</div>';
    done.sort(function(a,b){ return b.date.localeCompare(a.date); })
        .forEach(function(n){ h += card(n,true); });
  }
  host.innerHTML = h;
}

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

  var titulo = n.title, sub = n.route || '';
  if (n.kind==='voucher' && n.lines.length){
    var ciu = ciudad(n.lines[0].where);
    var noches = n.lines.filter(function(l){ return !/Firma/i.test(l.subtype); }).length;
    var tarde  = n.lines.some(function(l){ return /Firma/i.test(l.subtype); });
    titulo = 'Pernocta en ' + ciu;
    sub = sinDia(fdate(n.date)) + ' → ' + sinDia(fdate(n.lines[n.lines.length-1].date)) +
          '  ·  ' + noches + (noches===1?' noche':' noches') + (tarde?' + firma tarde':'');
  }

  var lines = '<div class="ex-lines">' + n.lines.map(function(l){
    return '<div class="ex-ln"><div class="k">'+esc(l.slotLabel)+
      (l.window?' <span>'+esc(l.window)+'</span>':(l.where?' <span>'+esc(ciudad(l.where))+'</span>':''))+
      '</div><div class="v">'+eur(l.cap)+'</div></div>'; }).join('') + '</div>';

  var nTk = EX.tkCount[n.id] || 0;
  return '<div class="ex-day'+(isDone?' done':'')+'" style="--tcol:'+T.col+'">'+
    '<div class="ex-top"><div>'+
      '<div class="ex-dd">'+T.ic+'  '+fdate(n.date).toUpperCase()+'</div>'+
      '<div class="ex-title">'+esc(titulo)+' '+(isDone?'<span class="ex-chip ok">ENVIADA</span>':chip+' '+sc)+'</div>'+
      '<div class="ex-route">'+esc(sub)+'</div>'+
    '</div><div class="ex-amt">'+eur(n.maxTotal)+'<small>'+(isDone?'PASADA':'HASTA')+'</small></div></div>'+
    bar + lines +
    (!isDone && left<=20 ? '<div class="ex-note">⏳ Te quedan <b>'+left+' días</b> para presentarla.</div>' : '')+
    (!isDone && n.needsISO ? '<div class="ex-note">Requiere <b>nº de ISO</b> — lo hace la tripulación técnica o de cabina.</div>' : '')+
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
  cargarTickets().then(function(){ drawSheet(); sheetEl().classList.add('on'); });
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
    if (n.needsISO) h += cp('ISO NUMBER *', '—  pídeselo a la tripulación', 'iso');
    h += cp('COST *', (claim>0?claim:l.cap).toFixed(2).replace('.',','), '',
            claim>0 ? 'suma de tus tickets' : 'tope · aún sin tickets');

    h += '<div class="ex-tk"><div class="ex-tkhead"><div class="k">TICKETS DE ESTA LÍNEA</div>'+
      '<div class="n">'+tks.length+'</div></div><div class="ex-thumbs">'+
      tks.map(function(t){ return '<div class="ex-th">'+
        (t.url?'<img src="'+t.url+'" alt="ticket">':'<div class="ex-noimg">☁</div>')+
        '<div class="a">'+(Number(t.amount)||0).toFixed(2).replace('.',',')+'</div>'+
        '<div class="x" onclick="exDelTk(\''+t.id+'\')">✕</div>'+
        '<div class="dl" onclick="exOutTk(\''+t.id+'\')">↓</div></div>'; }).join('')+
      '<label class="ex-add">'+(exIsPro()?'✦':'+')+
        '<input type="file" accept="image/*" capture="environment" style="display:none" '+
        'onchange="exNewTk(this,\''+key+'\')"></label>'+
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

  h += '<div class="ex-note">El portal admite <b>5 recibos por nota</b> — llevas '+nTk+'.'+
       (nTk>5 ? ' <b>Te pasas: harán falta 2 notas.</b>' : '')+'</div>';
  h += exIsPro()
    ? '<div class="ex-note">☁️ Copia en la nube activa: tus tickets están también en tu cuenta.</div>'
    : '<div class="ex-plan">⚠️ Plan Free: las fotos se guardan <b>solo en este móvil</b>. '+
      'Si lo pierdes o cambias de teléfono, se pierden. Con Pro se copian a tu cuenta '+
      '(y la IA te lee el ticket y descuenta lo que no computa).</div>';

  h += '<div class="ex-row"><div class="ex-btn ghost" onclick="exClose()">Cerrar</div>'+
       (nTk ? '<div class="ex-btn" onclick="exOutAll()">↓ Sacar los '+nTk+'</div>' : '')+'</div>'+
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

/* ── tickets ── */
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
function subirTicket(rec, key){
  if (!exIsPro()) return Promise.resolve();     // en Free se queda en el móvil
  var n = notaDe(SHEET); if (!n) return Promise.resolve();
  return blobToB64(rec.blob).then(function(b64){
    return api('/api/expense/tickets', { method:'POST', body:{
      id: rec.id, note_id: n.id, line_idx: Number(String(key).split('#')[1]) || 0,
      amount: rec.amount, computable: rec.amount, shop: rec.shop,
      ticket_date: rec.ticket_date, items: rec.items, source: rec.source,
      image_base64: b64, media_type: 'image/jpeg' } });
  }).catch(function(){ /* sin red: se queda local, ya subirá */ });
}
window.exDelTk = function(id){
  if (!confirm('¿Borrar este ticket?')) return;
  tkDel(id).catch(function(){}).then(function(){
    if (exIsPro()) api('/api/expense/tickets/' + id, { method:'DELETE' }).catch(function(){});
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
    EX.tkCount = {};
    (all||[]).forEach(function(t){
      var id = String(t.lineKey).split('#')[0];
      EX.tkCount[id] = (EX.tkCount[id]||0) + 1;
    });
    exRender();
  }).catch(function(){ exRender(); });
}

/* ── marcar / crear / borrar notas ── */
window.exMark = function(id){
  EX.sent[id] = new Date().toISOString(); saveSent(); syncNota(id, 'sent'); exRender();
};
window.exUnmark = function(id){
  delete EX.sent[id]; saveSent(); syncNota(id, 'pending'); exRender();
};
function syncNota(id, status){
  var n = notaDe(id); if (!n) return;
  api('/api/expense/notes', { method:'POST', body:{ notes:[{
    id:n.id, date:n.date, kind:n.kind, portalType:n.portalType, manual:!!n.manual,
    status:status, maxTotal:n.maxTotal, data:n }] } }).catch(function(){});
}

window.exPickTipo = function(){
  var h = '<div class="ex-lbl2">NUEVA NOTA</div>'+
    '<div class="ex-sh-t">¿Qué tipo de gasto?</div><div class="ex-tsel">'+
    TIPOS.map(function(t){ return '<div class="ex-topt" style="--c:'+t.col+'" onclick="exPickSub(\''+t.id+'\')">'+
      '<div class="i">'+t.ic+'</div><div class="l">'+t.lbl+'</div></div>'; }).join('')+
    '</div><div class="ex-row"><div class="ex-btn ghost" onclick="exClose()">Cancelar</div></div>';
  document.getElementById('ex-sheetbody') || sheetEl();
  document.getElementById('ex-sheetbody').innerHTML = h;
  sheetEl().classList.add('on');
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
  EX.manual.push(n); saveMan(); syncNota(n.id, 'pending');
  exRender(); exOpen(n.id);
};
window.exDelNota = function(id){
  if (!confirm('¿Borrar esta nota?')) return;
  EX.manual = EX.manual.filter(function(n){ return n.id !== id; }); saveMan();
  delete EX.sent[id]; saveSent();
  api('/api/expense/notes/' + id, { method:'DELETE' }).catch(function(){});
  exClose(); exRender();
};

/* ── arranque ── */
window.exRender = exRender;
window.exInit = function(){ loadLocal(); contarTickets(); };

})();
