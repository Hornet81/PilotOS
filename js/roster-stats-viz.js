/* ══════════════════════════════════════════════════════════════════════════
   ESTADÍSTICAS DEL ROSTER — los gráficos de «TU AÑO» y «VUELO»
   ══════════════════════════════════════════════════════════════════════════
   Pedido el 17-oct-2026: long duty, SROF/NROF, el reparto con leave, stand-by,
   sick y training; duty vs block mes a mes, sectores y aterrizajes, layovers y
   distancia, radiación cósmica y «trip to the Moon». «Que quede espectacular».

   Este archivo SÓLO PINTA. Los números salen de `RstStats` (js/roster-stats.js)
   y de las funciones de la app que ya cuentan lo mismo para el calendario
   (`rstDiasFuera`, `ldCoordsApt`). Quien llama (index.html) junta el contexto y
   aquí se convierte en SVG. Ni una regla de negocio nueva.

   Reglas de siempre que aquí también mandan:
   · Un mes NO importado no es un cero: va en gris y se dice.
   · Todo lo estimado (radiación) lleva la palabra «estimación» a la vista.
   · Tarjetas oscuras en los dos temas (`.la-card`): ningún texto suelto sobre
     el fondo del panel, que en modo día es el cielo azul.
   · Sintaxis ES5: nada de `?.` ni flechas — iPads viejos de flota.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
'use strict';

/* IDIOMA. Las tarjetas de aquí van con translate="no" y se escriben ya en su
   idioma: casi todo lo que pintan son frases con números dentro, y el
   traductor de la app (js/i18n.js) casa nodos de texto ENTEROS — con los
   números en <b> o en un <text> de SVG no casaría nunca. El idioma no cambia
   sin recargar (i18n recarga la página), así que leerlo en cada llamada basta.
   Se resuelve TARDE: este archivo puede cargar antes que i18n.js. */
function EN(){ return root.pilotosLang === 'en'; }
function L(es, en){ return EN() ? en : es; }
var _MES3 = { es:['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'],
              en:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'] };
var _MES1 = { es:['E','F','M','A','M','J','J','A','S','O','N','D'],
              en:['J','F','M','A','M','J','J','A','S','O','N','D'] };
function M3(i){ return _MES3[EN() ? 'en' : 'es'][i]; }
function M1(i){ return _MES1[EN() ? 'en' : 'es'][i]; }
/* «3 ago» / «3 Aug»: el mes en minúscula en castellano y con mayúscula en inglés. */
function diaMes(dia, mi){ var m = M3(mi); return (+dia) + ' ' + (EN() ? m.charAt(0) + m.slice(1).toLowerCase() : m.toLowerCase()); }
function mesAno(mi, y){ var m = M3(mi); return (EN() ? m.charAt(0) + m.slice(1).toLowerCase() : m.toLowerCase()) + ' ' + y; }
var LUNA_KM = 384400, ECUADOR_KM = 40075;

/* Colores por clase fina. Los de familia son los del reparto de siempre
   (rstatsRenderAno); las tres partes del día libre se separan en LUMINOSIDAD y
   no sólo en tono, para que se distingan también sin ver bien el verde. */
var CLASE = {
  vuelo:      { c:'#22D3EE', t:'Vuelo', en:'Flight' },
  guardia:    { c:'#F59E0B', t:'Stand-by' },
  formacion:  { c:'#94A3B8', t:'Training' },
  srof:       { c:'#34D399', t:'SROF' },
  nrof:       { c:'#A7F3D0', t:'NROF' },
  off:        { c:'#047857', t:'OFF' },
  vacaciones: { c:'#A78BFA', t:'Leave' },
  baja:       { c:'#F472B6', t:'Sick' },
  franco:     { c:'#0E7490', t:'Franco', en:'Free day' },
  otros:      { c:'#475569', t:'Otros', en:'Other' }
};
function nom(k){ var c = CLASE[k]; return (EN() && c.en) ? c.en : c.t; }
var ORDEN = ['vuelo','guardia','formacion','srof','nrof','off','vacaciones','baja','franco','otros'];
var ROJO = '#EF4444';

/* ─────────────── utilidades ─────────────── */
function n0(v){ return Math.round(v || 0); }
function miles(v){ return String(n0(v)).replace(/\B(?=(\d{3})+(?!\d))/g, EN() ? ',' : '.'); }
function dec(v, d){ var p = Math.pow(10, d || 1), t = String(Math.round(v * p) / p); return EN() ? t : t.replace('.', ','); }
function hh(min){ min = n0(min); return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'); }
function horas(min){ return miles(Math.round((min || 0) / 60)) + 'h'; }
function f1(v){ return (Math.round(v * 10) / 10).toFixed(1); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function hex2rgba(c, a){
  return 'rgba(' + parseInt(c.substr(1,2),16) + ',' + parseInt(c.substr(3,2),16) + ',' + parseInt(c.substr(5,2),16) + ',' + a + ')';
}
/* Curva suave por puntos (Bézier con tangentes horizontales): no se pasa de
   los valores reales como una spline, así que un máximo dibujado ES el máximo. */
function curva(p){
  if (!p.length) return '';
  var d = 'M' + f1(p[0][0]) + ' ' + f1(p[0][1]);
  for (var i = 1; i < p.length; i++){
    var mx = f1((p[i-1][0] + p[i][0]) / 2);
    d += 'C' + mx + ' ' + f1(p[i-1][1]) + ' ' + mx + ' ' + f1(p[i][1]) + ' ' + f1(p[i][0]) + ' ' + f1(p[i][1]);
  }
  return d;
}
function spark(vals, w, h){
  var ok = vals.filter(function(v){ return v != null; });
  if (ok.length < 2) return '';
  var mx = Math.max.apply(null, ok), mn = Math.min.apply(null, ok), r = (mx - mn) || 1;
  var p = [];
  vals.forEach(function(v, i){ if (v != null) p.push([i * w / (vals.length - 1), h - 2 - (v - mn) / r * (h - 4)]); });
  return curva(p);
}
function sector(cx, cy, r0, r1, a0, a1){
  var P = function(r, a){ return f1(cx + r * Math.cos(a)) + ' ' + f1(cy + r * Math.sin(a)); };
  var big = (a1 - a0) > Math.PI ? 1 : 0;
  return 'M' + P(r1, a0) + 'A' + r1 + ' ' + r1 + ' 0 ' + big + ' 1 ' + P(r1, a1)
       + 'L' + P(r0, a1) + 'A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + P(r0, a0) + 'Z';
}
function card(lab, titulo, cuerpo, extra){
  return '<div class="la-card rsv-card' + (extra ? ' ' + extra : '') + '" translate="no">'
       + '<div class="rsv-hd"><div><div class="rs-lab" style="margin-bottom:3px">' + lab + '</div>'
       + (titulo ? '<div class="rsv-ttl">' + titulo + '</div>' : '') + '</div></div>'
       + cuerpo + '</div>';
}
function cardDer(lab, titulo, der, cuerpo, extra, attrs){
  return '<div class="la-card rsv-card' + (extra ? ' ' + extra : '') + '" translate="no"' + (attrs ? ' ' + attrs : '') + '>'
       + '<div class="rsv-hd"><div><div class="rs-lab" style="margin-bottom:3px">' + lab + '</div>'
       + '<div class="rsv-ttl">' + titulo + '</div></div><div class="rsv-hdr">' + der + '</div></div>'
       + cuerpo + '</div>';
}
function pill(txt, col){
  return '<span class="rsv-pill" style="color:' + col + ';background:' + hex2rgba(col, .12) + ';border-color:' + hex2rgba(col, .38) + '">' + txt + '</span>';
}
function leyenda(items){
  return '<div class="rsv-leg">' + items.map(function(it){
    return '<span><i style="background:' + it[0] + (it[2] ? ';box-shadow:0 0 6px ' + it[0] : '') + '"></i>' + it[1] + '</span>';
  }).join('') + '</div>';
}

/* ─────────────── estilos (una vez) ─────────────── */
function css(){
  if (typeof document === 'undefined' || document.getElementById('rsv-css')) return;
  var s = document.createElement('style'); s.id = 'rsv-css';
  s.textContent = [
    '.rsv-card{padding:17px 15px 15px}',
    '.rsv-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px;position:relative}',
    '.rsv-hdr{text-align:right;flex-shrink:0}',
    '.rsv-ttl{font-size:13.5px;font-weight:700;color:#F8FAFC;letter-spacing:-.2px;line-height:1.25}',
    '.rsv-big{font-family:"Space Mono",monospace;font-weight:700;color:#F8FAFC;line-height:1}',
    '.rsv-mut{font-size:10px;color:rgba(248,250,252,.62);font-family:"Space Mono",monospace}',
    '.rsv-svg{display:block;width:100%;height:auto;overflow:visible}',
    '.rsv-svg text{font-family:"Space Mono",monospace}',
    '.rsv-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:11px;border:1px solid;font-size:10px;font-weight:700;font-family:"Space Mono",monospace;white-space:nowrap}',
    '.rsv-leg{display:flex;flex-wrap:wrap;gap:6px 12px;font-family:"Space Mono",monospace;font-size:9.5px;color:rgba(248,250,252,.72);margin-top:8px}',
    '.rsv-leg i{width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}',
    '.rsv-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:12px;position:relative}',
    '.rsv-chip{border-radius:13px;padding:9px 10px;border:1px solid}',
    '.rsv-chip b{display:block;font-family:"Space Mono",monospace;font-size:15px;line-height:1.1}',
    '.rsv-chip span{font-size:9.5px;font-family:"Space Mono",monospace;letter-spacing:.4px}',
    '.rsv-row{display:flex;align-items:center;gap:9px;padding:7px 2px;border-top:1px solid rgba(255,255,255,.05)}',
    '.rsv-row .nm{flex:1;font-size:12px;color:#E2E8F0;min-width:0}',
    '.rsv-row .vv{font-family:"Space Mono",monospace;font-weight:700;font-size:13.5px;color:#F8FAFC;width:30px;text-align:right}',
    '.rsv-row .pc{font-family:"Space Mono",monospace;font-size:9.5px;color:rgba(248,250,252,.55);width:30px;text-align:right}',
    '.rsv-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}',
    '.rsv-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:10px}',
    '.rsv-kpi{background:linear-gradient(145deg,rgba(12,18,38,.97),rgba(8,12,26,.99));border:1px solid rgba(34,211,238,.12);border-radius:16px;padding:12px 12px 0;overflow:hidden;position:relative}',
    'html.day #scr-rstats .rsv-kpi{background:linear-gradient(145deg,rgba(8,14,32,.92),rgba(5,10,22,.95));border-color:rgba(34,211,238,.18)}',
    '.rsv-kpi .k{font-family:"Space Mono",monospace;font-size:8.5px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(248,250,252,.66)}',
    '.rsv-kpi .v{font-family:"Space Mono",monospace;font-size:19px;font-weight:700;line-height:1.25}',
    '.rsv-kpi .s{font-size:9.5px;color:rgba(248,250,252,.62);font-family:"Space Mono",monospace}',
    '.rsv-kpi svg{display:block;width:calc(100% + 24px);margin:6px -12px 0;height:34px}',
    '.rsv-heat{display:flex;flex-direction:column;gap:2.5px}',
    '.rsv-hr{display:flex;align-items:center;gap:1.5px}',
    '.rsv-hr .m{width:26px;flex-shrink:0;font-family:"Space Mono",monospace;font-size:8.5px;color:rgba(248,250,252,.55)}',
    '.rsv-hr i{flex:1;height:11px;border-radius:2.5px;min-width:0;display:block}',
    '.rsv-hr i.ld{outline:1.5px solid #EF4444;outline-offset:-1.5px;box-shadow:0 0 6px rgba(239,68,68,.8)}',
    '.rsv-hr i.na{background:rgba(255,255,255,.04)}',
    '.rsv-hr i.fu{background:transparent;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}',
    '.rsv-ro{display:flex;justify-content:space-between;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:8px 11px;margin-bottom:8px;font-family:"Space Mono",monospace;font-size:10.5px;color:#CBD5E1}',
    '.rsv-ro b{color:#F8FAFC}',
    '.rsv-tap{cursor:pointer}',
    '@keyframes rsvflow{to{stroke-dashoffset:-20}}',
    '.rsv-flow{animation:rsvflow 1.4s linear infinite}',
    '@keyframes rsvping{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.6);opacity:0}}',
    '.rsv-ping{transform-box:fill-box;transform-origin:center;animation:rsvping 2s ease-out infinite}',
    '@keyframes rsvtw{50%{opacity:.2}}',
    '.rsv-tw{animation:rsvtw 3s ease-in-out infinite}',
    '@media (prefers-reduced-motion:reduce){.rsv-flow,.rsv-ping,.rsv-tw{animation:none}}',
    '.rsv-space{background:radial-gradient(ellipse at 80% 0%,#1B1648 0%,#0A0F24 55%,#060A18 100%)!important;border-color:rgba(167,139,250,.28)!important}',
    '.rsv-link{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;margin-top:14px;border-radius:12px;border:1px solid rgba(103,232,249,.32);background:rgba(34,211,238,.08);color:#A5F3FC;font:700 12.5px/1.2 inherit;cursor:pointer}',
    '.rsv-link:active{transform:scale(.98)}',
    '.rsv-lslide{display:flex;align-items:center;gap:10px;margin-top:12px}',
    '.rsv-lslide input{flex:1;accent-color:#A78BFA;height:44px;margin:0}',
    '.rsv-lsc{cursor:pointer}',
    '.rsv-lproy{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.22);font-size:12px;line-height:1.45;color:#E9E5FF}',
    '.rsv-lproy b{color:#F5F3FF}',
    '.rsv-lslide output{font-family:"Space Mono",monospace;font-size:11px;color:#DDD6FE;min-width:118px;text-align:right}'
  ].join('\n');
  document.head.appendChild(s);
}

/* ══════════════════════ TU AÑO ══════════════════════ */

/* ctx: { y, meses:['2026-01',…], fin:diasFinos(), ld:longDuty() } */
function anoHTML(ctx){
  css();
  var F = ctx.fin, T = F.total, LD = ctx.ld, meses = ctx.meses;
  var total = 0; ORDEN.forEach(function(k){ total += T[k] || 0; });
  if (!total) return '';
  var h = '';

  /* ── 1 · los tres anillos ── */
  var trabajo = (T.vuelo||0) + (T.guardia||0) + (T.formacion||0) + (T.otros||0);
  var libres  = (T.srof||0) + (T.nrof||0) + (T.off||0);
  var pLD     = LD.diasVuelo ? LD.total / LD.diasVuelo : 0;
  var ring = function(r, p, grad, fondo){
    var C = 2 * Math.PI * r;
    return '<circle cx="80" cy="80" r="' + r + '" stroke="' + fondo + '"/>'
         + (p > 0 ? '<circle cx="80" cy="80" r="' + r + '" stroke="url(#' + grad + ')" stroke-dasharray="' + f1(Math.max(C * Math.min(p, 1), 0.1)) + ' ' + f1(C) + '"/>' : '');
  };
  h += '<div class="la-hero-card rsv-card" translate="no">'
     + '<div class="rs-hlab">' + L('Tu año en tres anillos', 'Your year in three rings') + '</div>'
     + '<div style="display:flex;gap:14px;align-items:center;position:relative">'
     + '<svg viewBox="0 0 160 160" style="width:122px;height:122px;flex-shrink:0" role="img" aria-label="' + L('Anillos: días de trabajo, días libres y long duty', 'Rings: work days, days off and long duty') + '">'
     +   '<defs><linearGradient id="rsvB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67E8F9"/><stop offset="1" stop-color="#0891B2"/></linearGradient>'
     +   '<linearGradient id="rsvG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6EE7B7"/><stop offset="1" stop-color="#059669"/></linearGradient>'
     +   '<linearGradient id="rsvR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCA5A5"/><stop offset="1" stop-color="#DC2626"/></linearGradient></defs>'
     +   '<g transform="rotate(-90 80 80)" fill="none" stroke-width="13" stroke-linecap="round">'
     +     ring(70, trabajo / total, 'rsvB', 'rgba(34,211,238,.1)')
     +     ring(53, libres / total, 'rsvG', 'rgba(16,185,129,.1)')
     +     ring(36, pLD, 'rsvR', 'rgba(239,68,68,.12)')
     +   '</g>'
     +   '<text x="80" y="80" text-anchor="middle" fill="#F8FAFC" font-size="22" font-weight="700">' + total + '</text>'
     +   '<text x="80" y="95" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="8.5" letter-spacing="1.2">' + L('DÍAS', 'DAYS') + '</text>'
     + '</svg>'
     + '<div style="flex:1;display:flex;flex-direction:column;gap:11px;min-width:0">'
     +   '<div><div class="rsv-mut" style="color:#67E8F9;letter-spacing:1px">' + L('DÍAS DE TRABAJO', 'WORK DAYS') + '</div><div class="rsv-big" style="font-size:18px">' + trabajo + ' <span class="rsv-mut">' + Math.round(trabajo * 100 / total) + '%</span></div></div>'
     +   '<div><div class="rsv-mut" style="color:#6EE7B7;letter-spacing:1px">' + L('DÍAS OFF', 'DAYS OFF') + '</div><div class="rsv-big" style="font-size:18px">' + libres + ' <span class="rsv-mut">' + Math.round(libres * 100 / total) + '%</span></div></div>'
     +   '<div><div class="rsv-mut" style="color:#FCA5A5;letter-spacing:1px">LONG DUTY</div><div class="rsv-big" style="font-size:18px">' + LD.total + ' <span class="rsv-mut">' + Math.round(pLD * 100) + '%</span></div><div class="rsv-mut" style="margin-top:2px">' + L('de ' + LD.diasVuelo + ' días de vuelo', 'of ' + LD.diasVuelo + ' flight days') + '</div></div>'
     + '</div></div>'
     + '<div class="rsv-chips" style="grid-template-columns:repeat(4,minmax(0,1fr))">'
     +   chip(T.guardia || 0, nom('guardia'), '#F59E0B') + chip(T.vacaciones || 0, nom('vacaciones'), '#A78BFA') + chip(T.formacion || 0, nom('formacion'), '#94A3B8') + chip(T.baja || 0, nom('baja'), '#F472B6')
     + '</div>'
     + '<div class="rs-foot" style="position:relative">' + L('sobre ' + total + ' días importados de ' + ctx.y + '. Días de trabajo = vuelo, stand-by, training y otros; OFF = SROF + NROF + OFF.',
                                                        'out of ' + total + ' imported days of ' + ctx.y + '. Work days = flight, stand-by, training and other; OFF = SROF + NROF + OFF.')
     +   ((T.franco || T.otros) ? ' ' + nom('franco') + ': <b>' + (T.franco || 0) + '</b> · ' + nom('otros').toLowerCase() + ': <b>' + (T.otros || 0) + '</b>.' : '') + '</div>'
     + '</div>';

  /* ── 2 · tipos de día: donut + filas con su tendencia ── */
  var C = 2 * Math.PI * 92, acc = 0, segs = '';
  ORDEN.forEach(function(k){
    var v = T[k] || 0; if (!v) return;
    var len = v / total * C, dash = Math.max(len - 3, 0.6);
    segs += '<circle cx="115" cy="115" r="92" stroke="' + CLASE[k].c + '" stroke-dasharray="' + f1(dash) + ' ' + f1(C) + '" stroke-dashoffset="' + f1(-acc) + '"/>';
    acc += len;
  });
  var filas = '';
  ORDEN.forEach(function(k){
    var v = T[k] || 0; if (!v) return;
    var serie = meses.map(function(m){ return (F.porMes[m] && F.porMes[m][k]) || 0; });
    var sp = spark(serie, 78, 20);
    filas += '<div class="rsv-row"><div class="rsv-dot" style="background:' + CLASE[k].c + ';box-shadow:0 0 9px ' + hex2rgba(CLASE[k].c, .6) + '"></div>'
           + '<div class="nm">' + nom(k) + '</div>'
           + (sp ? '<svg viewBox="0 0 78 20" style="width:78px;height:20px" aria-hidden="true"><path d="' + sp + '" fill="none" stroke="' + CLASE[k].c + '" stroke-width="1.6" stroke-linejoin="round"/></svg>' : '')
           + '<div class="vv">' + v + '</div><div class="pc">' + Math.round(v * 100 / total) + '%</div></div>';
  });
  h += card(L('Reparto del año', 'Year breakdown'), L('Tipos de día', 'Day types'),
       '<div style="display:flex;justify-content:center;margin:2px 0 6px">'
     + '<svg viewBox="0 0 230 230" style="width:172px;height:172px" role="img" aria-label="' + L('Donut con los tipos de día del año', 'Donut with the day types of the year') + '">'
     +   '<circle cx="115" cy="115" r="92" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="24"/>'
     +   '<g transform="rotate(-90 115 115)" fill="none" stroke-width="22">' + segs + '</g>'
     +   '<circle cx="115" cy="115" r="72" fill="rgba(8,12,26,.9)" stroke="rgba(34,211,238,.12)"/>'
     +   '<text x="115" y="104" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="9" letter-spacing="1.5">' + L('VUELO', 'FLIGHT') + '</text>'
     +   '<text x="115" y="134" text-anchor="middle" fill="#F8FAFC" font-size="32" font-weight="700">' + (T.vuelo || 0) + '</text>'
     +   '<text x="115" y="151" text-anchor="middle" fill="#22D3EE" font-size="10">' + Math.round((T.vuelo || 0) * 100 / total) + L('% del año', '% of the year') + '</text>'
     + '</svg></div>'
     + filas
     + '<div class="rs-foot">' + L('la línea de cada fila es su tendencia mes a mes en los meses importados.<br>sick = SICK, INC, HOSP o MED · leave = vacaciones (VAC y variantes).',
                                  'the line on each row is its month-by-month trend over the imported months.<br>sick = SICK, INC, HOSP or MED · leave = annual leave (VAC and variants).')
     /* El donut dice qué FUE cada día: una guardia en la que te sacaron es un día
        de vuelo. La tarjeta de guardias cuenta los dos. Se dice cuánto es cada
        parte, o 14 aquí y 28 arriba no se pueden cuadrar. */
     + ((ctx.g && ctx.g.dias) ? L('<br>stand-by = ' + (T.guardia || 0) + ' días de guardia sin vuelo. Los ' + ctx.g.diasConVuelo + ' en que te sacaron a volar cuentan como vuelo: ' + (T.guardia || 0) + ' + ' + ctx.g.diasConVuelo + ' = ' + ((T.guardia || 0) + ctx.g.diasConVuelo) + ' días de guardia.',
                                   '<br>stand-by = ' + (T.guardia || 0) + ' standby days without a flight. The ' + ctx.g.diasConVuelo + ' you were called out to fly count as flight: ' + (T.guardia || 0) + ' + ' + ctx.g.diasConVuelo + ' = ' + ((T.guardia || 0) + ctx.g.diasConVuelo) + ' standby days.') : '')
     + '</div>');

  /* ── 3 · OFF ganados en la puja vs asignados ── */
  var sTot = T.srof || 0, nTot = T.nrof || 0;
  if (sTot + nTot){
    var eff = Math.round(sTot * 100 / (sTot + nTot));
    var maxS = 1, maxN = 1;
    for (var i = 0; i < 12; i++){
      var pm0 = F.porMes[ctx.y + '-' + String(i + 1).padStart(2, '0')] || {};
      maxS = Math.max(maxS, pm0.srof || 0); maxN = Math.max(maxN, pm0.nrof || 0);
    }
    var esc0 = 70 / Math.max(maxS, maxN);
    var bars = '', mejor = null, peor = null;
    for (var mi = 0; mi < 12; mi++){
      var mk = ctx.y + '-' + String(mi + 1).padStart(2, '0'), pm = F.porMes[mk], x = 6 + mi * 27.5;
      var imp = meses.indexOf(mk) > -1;
      if (imp && pm){
        var s = pm.srof || 0, n = pm.nrof || 0;
        if (s) bars += '<rect x="' + x + '" y="' + f1(96 - s * esc0) + '" width="17" height="' + f1(s * esc0) + '" rx="4" fill="url(#rsvS)"/>'
                     + '<text x="' + (x + 8.5) + '" y="' + f1(91 - s * esc0) + '" text-anchor="middle" fill="#A7F3D0" font-size="8.5">' + s + '</text>';
        if (n) bars += '<rect x="' + x + '" y="100" width="17" height="' + f1(n * esc0) + '" rx="4" fill="url(#rsvN)"/>'
                     + '<text x="' + (x + 8.5) + '" y="' + f1(110 + n * esc0) + '" text-anchor="middle" fill="rgba(167,243,208,.7)" font-size="8.5">' + n + '</text>';
        if (s + n){
          var r = s / (s + n);
          if (!mejor || r > mejor.r) mejor = { r: r, m: mi, s: s, t: s + n };
          if (!peor || r < peor.r) peor = { r: r, m: mi, s: s, t: s + n };
        }
      } else if (!imp && !(ctx.hoy && mk > ctx.hoy.slice(0, 7))){
        bars += '<rect x="' + x + '" y="97" width="17" height="2" rx="1" fill="rgba(255,255,255,.12)"/>';
      }
      bars += '<text x="' + (x + 8.5) + '" y="196" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + M1(mi) + '</text>';
    }
    h += cardDer(L('Días OFF · puja', 'Days OFF · bidding'), L('Ganados vs asignados', 'Won vs assigned'),
         '<div class="rsv-big" style="font-size:22px;color:#34D399">' + eff + '%</div><div class="rsv-mut">' + L('eficiencia', 'efficiency') + '</div>',
         '<svg class="rsv-svg" viewBox="0 0 336 200" style="max-width:292px;margin:0 auto" role="img" aria-label="' + L('SROF arriba y NROF abajo por mes', 'SROF above and NROF below, by month') + '">'
       +   '<defs><linearGradient id="rsvS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6EE7B7"/><stop offset="1" stop-color="#047857"/></linearGradient>'
       +   '<linearGradient id="rsvN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#065F46"/><stop offset="1" stop-color="#A7F3D0"/></linearGradient></defs>'
       +   '<text x="0" y="10" fill="#6EE7B7" font-size="9">' + L('▲ SROF · ganados en la puja', '▲ SROF · won in the bid') + '</text>'
       +   '<text x="0" y="182" fill="rgba(167,243,208,.75)" font-size="9">' + L('▼ NROF · no ganados, asignados', '▼ NROF · not won, assigned') + '</text>'
       +   '<line x1="0" y1="98" x2="336" y2="98" stroke="rgba(148,163,184,.3)"/>'
       +   bars
       + '</svg>'
       + '<div class="rsv-chips" style="grid-template-columns:repeat(2,minmax(0,1fr))">'
       +   (mejor ? '<div class="rsv-chip" style="border-color:rgba(52,211,153,.3);background:rgba(16,185,129,.08)"><span style="color:#6EE7B7">' + L('MEJOR MES', 'BEST MONTH') + '</span><b style="color:#F8FAFC;font-size:14px">' + M3(mejor.m) + ' · ' + mejor.s + L(' de ', ' of ') + mejor.t + '</b></div>' : '')
       +   (peor ? '<div class="rsv-chip" style="border-color:rgba(148,163,184,.25);background:rgba(148,163,184,.06)"><span style="color:#CBD5E1">' + L('PEOR MES', 'WORST MONTH') + '</span><b style="color:#F8FAFC;font-size:14px">' + M3(peor.m) + ' · ' + peor.s + L(' de ', ' of ') + peor.t + '</b></div>' : '')
       + '</div>'
       + '<div class="rs-foot">' + L('eficiencia = SROF ÷ (SROF + NROF): de los OFF que pasaron por la puja, cuántos elegiste tú. El resto de OFF (' + (T.off || 0) + ') no entra.<br>una raya gris es un mes que no tienes importado.',
                                    'efficiency = SROF ÷ (SROF + NROF): of the OFF days that went through the bid, how many you chose. The other OFF days (' + (T.off || 0) + ') are left out.<br>a grey dash is a month you have not imported.') + '</div>');
  }

  /* ── 4 · long duty ── */
  h += longDutyHTML(LD);

  /* ── 5 · el año día a día ── */
  var largos = {}; LD.fechas.forEach(function(d){ largos[d] = 1; });
  var filasH = '';
  for (var m2 = 0; m2 < 12; m2++){
    var mm = ctx.y + '-' + String(m2 + 1).padStart(2, '0');
    var dim = new Date(ctx.y, m2 + 1, 0).getDate();
    var celdas = '';
    for (var d = 1; d <= 31; d++){
      if (d > dim){ celdas += '<i style="background:transparent"></i>'; continue; }
      var ds = mm + '-' + String(d).padStart(2, '0'), c = F.porDia[ds];
      if (ctx.hoy && ds > ctx.hoy){ celdas += '<i class="fu" title="' + ds + '"></i>'; continue; }
      if (!c){ celdas += '<i class="na" title="' + ds + '"></i>'; continue; }
      celdas += '<i' + (largos[ds] ? ' class="ld"' : '') + ' style="background:' + CLASE[c].c + '" title="' + ds + ' · ' + nom(c)
              + (largos[ds] ? ' · long duty ' + hh(LD.porDia[ds].min) : '') + '"></i>';
    }
    filasH += '<div class="rsv-hr"><div class="m">' + M3(m2) + '</div>' + celdas + '</div>';
  }
  var leg = ORDEN.filter(function(k){ return T[k]; }).map(function(k){ return [CLASE[k].c, nom(k)]; });
  leg.push([ROJO, 'long duty', true]);
  h += cardDer(L('Calendario', 'Calendar'), L('Tu año de un vistazo', 'Your year at a glance'), pill(total + L(' días', ' days'), '#67E8F9'),
       '<div class="rsv-heat">' + filasH + '</div>' + leyenda(leg)
     + '<div class="rs-foot">' + L('cada casilla es un día; el borde rojo, un long duty. Los huecos oscuros son días que no tienes importados.',
                                  'each square is a day; a red border, a long duty. Dark gaps are days you have not imported.')
     + (ctx.hoy ? L(' Los días que aún no han pasado van vacíos.', ' Days that have not happened yet are left empty.') : '') + '</div>');

  return h;
}
function chip(v, t, c){
  return '<div class="rsv-chip" style="border-color:' + hex2rgba(c, .3) + ';background:' + hex2rgba(c, .08) + '"><b style="color:' + c + '">' + v + '</b><span style="color:' + c + '">' + t + '</span></div>';
}

function longDutyHTML(LD){
  if (!LD.diasVuelo) return '';
  var maxH = Math.max.apply(null, LD.hist.concat([1]));
  var bw = 336 / LD.hist.length, bars = '';
  var idxCorte = LD.histCortes.indexOf(LD.umbral);
  LD.hist.forEach(function(v, i){
    var hgt = v / maxH * 120, x = i * bw + 3;
    var rojo = i >= idxCorte;
    bars += '<rect x="' + f1(x) + '" y="' + f1(150 - hgt) + '" width="' + f1(bw - 6) + '" height="' + f1(Math.max(hgt, v ? 2 : 0)) + '" rx="5" fill="url(#' + (rojo ? 'rsvHR' : 'rsvHB') + ')"/>'
          + (v ? '<text x="' + f1(x + (bw - 6) / 2) + '" y="' + f1(144 - hgt) + '" text-anchor="middle" fill="#E2E8F0" font-size="9.5" font-weight="700">' + v + '</text>' : '')
          + '<text x="' + f1(x + (bw - 6) / 2) + '" y="168" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="8">' + LD.histEtq[i] + '</text>';
  });
  var zx = idxCorte * bw;
  var svgH = '<svg class="rsv-svg" viewBox="0 0 336 174" style="max-width:300px;margin:0 auto" role="img" aria-label="' + L('Histograma de la duración de tus duties', 'Histogram of your duty lengths') + '">'
    + '<defs><linearGradient id="rsvHB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#67E8F9"/><stop offset="1" stop-color="#155E75"/></linearGradient>'
    + '<linearGradient id="rsvHR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F87171"/><stop offset="1" stop-color="#7F1D1D"/></linearGradient>'
    + '<linearGradient id="rsvZ" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#EF4444" stop-opacity=".2"/><stop offset="1" stop-color="#EF4444" stop-opacity=".02"/></linearGradient></defs>'
    + '<rect x="' + f1(zx) + '" y="16" width="' + f1(336 - zx) + '" height="136" fill="url(#rsvZ)"/>'
    + '<line x1="' + f1(zx) + '" y1="12" x2="' + f1(zx) + '" y2="154" stroke="#F87171" stroke-width="1.5" stroke-dasharray="4 3"/>'
    + '<rect x="' + f1(zx - 22) + '" y="0" width="44" height="16" rx="8" fill="#EF4444"/>'
    + '<text x="' + f1(zx) + '" y="11.5" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">' + hh(LD.umbral) + '</text>'
    + bars + '</svg>';

  /* Los tres más largos, como línea de tiempo: firma → tramos → fin. Escala
     común a los tres para que se puedan comparar a simple vista. */
  var tl = '';
  if (LD.top.length){
    var t0 = Infinity, t1 = -Infinity;
    LD.top.forEach(function(x){ if (x.inicio != null) t0 = Math.min(t0, x.inicio % 1440); t1 = Math.max(t1, (x.inicio % 1440) + x.min); });
    t0 = Math.floor(t0 / 60) * 60; t1 = Math.ceil(t1 / 60) * 60;
    var span = Math.max(t1 - t0, 60), X = function(t){ return (t - t0) / span * 336; };
    var ticks = '', paso = span > 720 ? 240 : 180;
    for (var t = t0; t <= t1; t += paso){
      var tx = X(t);
      ticks += '<text x="' + f1(Math.min(Math.max(tx, 8), 328)) + '" y="9" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + String(Math.floor(t / 60) % 24).padStart(2, '0') + '</text>'
             + '<line x1="' + f1(tx) + '" y1="13" x2="' + f1(tx) + '" y2="16" stroke="rgba(248,250,252,.3)"/>';
    }
    tl += '<div class="rs-lab" style="margin:14px 0 4px">' + L('Tus días más largos', 'Your longest days') + '</div>'
        + '<svg class="rsv-svg" viewBox="0 0 336 16" aria-hidden="true">' + ticks + '</svg>';
    LD.top.forEach(function(x){
      var base = x.inicio == null ? t0 : (x.inicio % 1440), off = base - (x.inicio || 0);
      var ruta = x.legs.length ? x.legs[0].dep + '-' + x.legs.map(function(l){ return l.arr; }).join('-') : '';
      var segs = '';
      x.legs.forEach(function(l){
        segs += '<rect x="' + f1(X(l.ini + off)) + '" y="4" width="' + f1(Math.max(X(l.fin + off) - X(l.ini + off), 2)) + '" height="8" rx="4" fill="' + (l.pos ? '#94A3B8' : '#F87171') + '"/>';
      });
      var dd = x.date.split('-');
      tl += '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11.5px;color:#E2E8F0;gap:8px">'
          + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + diaMes(dd[2], +dd[1] - 1) + ' · ' + esc(ruta) + '</span>'
          + '<b style="font-family:\'Space Mono\',monospace;color:#F87171">' + hh(x.min) + '</b></div>'
          + '<svg class="rsv-svg" viewBox="0 0 336 16" aria-hidden="true"><rect x="0" y="6" width="336" height="4" rx="2" fill="rgba(255,255,255,.06)"/>'
          + '<rect x="' + f1(X(base)) + '" y="2" width="' + f1(Math.max(X(base + x.min) - X(base), 2)) + '" height="12" rx="6" fill="rgba(239,68,68,.16)" stroke="rgba(239,68,68,.45)"/>'
          + segs + '</svg></div>';
    });
    tl += leyenda([['#F87171', L('vuelo', 'flight')], ['#94A3B8', L('posicional', 'positioning')], ['rgba(239,68,68,.3)', 'duty']]);
  }

  var porMes = Object.keys(LD.porMes).sort();
  var media = porMes.length ? LD.total / porMes.length : 0;
  var F = LD.fuentes;
  return cardDer(L('Long duty · más de ', 'Long duty · over ') + hh(LD.umbral), L('¿Cuánto duran tus duties?', 'How long are your duties?'),
       '<div class="rsv-big" style="font-size:22px;color:#F87171">' + LD.total + '</div><div class="rsv-mut">' + L('de ' + LD.diasVuelo + ' días', 'of ' + LD.diasVuelo + ' days') + '</div>',
       svgH + tl
     + '<div class="rs-foot">' + (porMes.length >= 3 ? L('Media: <b>' + dec(media) + '</b> long duty al mes. ', 'Average: <b>' + dec(media) + '</b> long duties a month. ') : '')
     +   L('Sólo días con vuelo.<br>Duty oficial de eCrews en <b>' + F.oficial + '</b> día(s)', 'Flight days only.<br>Official eCrews duty on <b>' + F.oficial + '</b> day(s)')
     +   (F['firma-debrief'] ? L(', firma → debrief en <b>', ', report → debrief on <b>') + F['firma-debrief'] + '</b>' : '')
     +   (F.calculado ? L(' y calculado (firma → último calzo + 20 min) en <b>', ' and calculated (report → last on-blocks + 20 min) on <b>') + F.calculado + '</b>' : '') + '.</div>');
}

/* ══════════════════════ VUELO ══════════════════════ */

/* ctx: { y, meses, porMes:{'2026-01':{block,duty,sect}}, ld, rt:rutas(año),
          rtCarrera:rutas(todo), desdeCarrera, op:operacionLogbook(),
          base, baseC:{lat,lon}, coords:fn, lands:[[ [lon,lat] ]], noches:{apt:n} } */
var _sel = null;
function vueloHTML(ctx){
  css();
  var meses = ctx.meses, PM = ctx.porMes, h = '';
  var tot = { block: 0, duty: 0, sect: 0 };
  meses.forEach(function(m){ var o = PM[m] || {}; tot.block += o.block || 0; tot.duty += o.duty || 0; tot.sect += o.sect || 0; });
  var prod = tot.duty ? tot.block / tot.duty : 0;

  /* ── KPIs con su serie ── */
  var kpi = function(k, v, s, col, serie){
    var sp = spark(serie, 140, 30);
    return '<div class="rsv-kpi"><div class="k">' + k + '</div><div class="v" style="color:' + col + '">' + v + '</div><div class="s">' + s + '</div>'
         + (sp ? '<svg viewBox="0 0 140 34" preserveAspectRatio="none" aria-hidden="true"><path d="' + sp + 'L140 34L0 34Z" fill="' + col + '" fill-opacity=".14"/><path d="' + sp + '" fill="none" stroke="' + col + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>' : '<div style="height:10px"></div>')
         + '</div>';
  };
  var serie = function(k){ return meses.map(function(m){ return (PM[m] || {})[k] || 0; }); };
  h += '<div class="rsv-g2" translate="no">'
     + kpi('Block', horas(tot.block), L('horas de vuelo', 'flight hours'), '#38BDF8', serie('block'))
     + kpi('Duty', horas(tot.duty), L('en días de vuelo', 'on flight days'), '#A78BFA', serie('duty'))
     + kpi(L('Sectores', 'Sectors'), tot.sect, meses.length ? dec(tot.sect / meses.length) + L(' al mes', ' a month') : '', '#22D3EE', serie('sect'))
     + kpi(L('Productividad', 'Productivity'), prod ? Math.round(prod * 100) + '%' : '—', 'block ÷ duty', '#FBBF24', meses.map(function(m){ var o = PM[m] || {}; return o.duty ? o.block / o.duty * 100 : null; }))
     + '</div>';

  /* ── duty vs block, mes a mes ── */
  if (meses.length){
    var mx = 1; meses.forEach(function(m){ mx = Math.max(mx, (PM[m] || {}).duty || 0, (PM[m] || {}).block || 0); });
    var top = Math.ceil(mx / 60 / 30) * 30 * 60;
    var W = 336, X0 = 28, Hh = 150, Y0 = 12;
    var X = function(i){ return meses.length === 1 ? (X0 + W) / 2 : X0 + i * (W - X0 - 6) / (meses.length - 1); };
    var Y = function(v){ return Y0 + Hh - v / top * Hh; };
    var pD = meses.map(function(m, i){ return [X(i), Y((PM[m] || {}).duty || 0)]; });
    var pB = meses.map(function(m, i){ return [X(i), Y((PM[m] || {}).block || 0)]; });
    var dl = curva(pD), bl = curva(pB), cierre = 'L' + f1(X(meses.length - 1)) + ' ' + (Y0 + Hh) + 'L' + f1(X(0)) + ' ' + (Y0 + Hh) + 'Z';
    var grid = '';
    for (var g = 0; g <= 4; g++){
      var gv = top * g / 4;
      grid += '<line x1="' + X0 + '" y1="' + f1(Y(gv)) + '" x2="' + W + '" y2="' + f1(Y(gv)) + '" stroke="rgba(148,163,184,.14)" stroke-dasharray="2 4"/>'
            + '<text x="0" y="' + f1(Y(gv) + 3) + '" fill="rgba(248,250,252,.45)" font-size="8.5">' + Math.round(gv / 60) + 'h</text>';
    }
    /* El mes destacado de salida es el de más productividad: es el récord y el
       que más se pregunta. Tocar cualquier otro mes cambia la lectura. */
    var best = 0, bestP = -1;
    meses.forEach(function(m, i){ var o = PM[m] || {}; var p = o.duty ? o.block / o.duty : -1; if (p > bestP){ bestP = p; best = i; } });
    var hits = '', labs = '', step = meses.length > 1 ? (X(1) - X(0)) : 60;
    meses.forEach(function(m, i){
      var o = PM[m] || {}, mi = +m.slice(5, 7) - 1;
      hits += '<rect class="rsv-tap" x="' + f1(X(i) - step / 2) + '" y="0" width="' + f1(step) + '" height="' + (Y0 + Hh + 16) + '" fill="transparent"'
            + ' data-i="' + i + '" data-x="' + f1(X(i)) + '" data-yd="' + f1(Y(o.duty || 0)) + '" data-yb="' + f1(Y(o.block || 0)) + '"'
            + ' data-t="' + M3(mi) + ' ' + m.slice(0, 4) + '|' + hh(o.duty || 0) + '|' + hh(o.block || 0) + '|' + (o.duty ? dec(o.block / o.duty * 100) + '%' : '—') + '"'
            + ' onclick="RstViz.selMes(this)"/>';
      labs += '<text x="' + f1(X(i)) + '" y="' + (Y0 + Hh + 14) + '" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="9">' + M1(mi) + '</text>';
    });
    var ob = PM[meses[best]] || {}, mb = +meses[best].slice(5, 7) - 1;
    var pp = meses.map(function(m, i){ var o = PM[m] || {}; return o.duty ? [X(i), o.block / o.duty * 100] : null; }).filter(Boolean);
    var pmn = Math.min.apply(null, pp.map(function(p){ return p[1]; }).concat([100])), pmx = Math.max.apply(null, pp.map(function(p){ return p[1]; }).concat([0]));
    pmn = Math.floor(pmn - 1); pmx = Math.ceil(pmx + 1);
    var PY = function(v){ return 8 + 46 - (v - pmn) / ((pmx - pmn) || 1) * 46; };
    var pl = curva(pp.map(function(p){ return [p[0], PY(p[1])]; }));
    var pdots = pp.map(function(p){ return '<circle cx="' + f1(p[0]) + '" cy="' + f1(PY(p[1])) + '" r="2.6" fill="#0B1220" stroke="#FBBF24" stroke-width="1.6"/>'; }).join('');
    h += cardDer(L('Mes a mes', 'Month by month'), 'Duty vs Block',
         leyenda([['#A78BFA', 'duty'], ['#38BDF8', 'block']]).replace('margin-top:8px', 'margin-top:0;justify-content:flex-end'),
         '<div class="rsv-ro" id="rsv-dbro"><b>' + M3(mb) + ' ' + meses[best].slice(0, 4) + '</b><span style="color:#C4B5FD">duty ' + hh(ob.duty || 0) + '</span><span style="color:#7DD3FC">block ' + hh(ob.block || 0) + '</span><span style="color:#FCD34D">' + (ob.duty ? dec(ob.block / ob.duty * 100) + '%' : '—') + '</span></div>'
       + '<svg class="rsv-svg" viewBox="0 0 336 180" role="img" aria-label="' + L('Áreas de duty y block por mes', 'Duty and block areas by month') + '">'
       +   '<defs><linearGradient id="rsvAD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A78BFA" stop-opacity=".5"/><stop offset="1" stop-color="#A78BFA" stop-opacity="0"/></linearGradient>'
       +   '<linearGradient id="rsvAB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38BDF8" stop-opacity=".75"/><stop offset="1" stop-color="#38BDF8" stop-opacity=".05"/></linearGradient></defs>'
       +   grid
       +   (meses.length > 1 ? '<path d="' + dl + cierre + '" fill="url(#rsvAD)"/><path d="' + bl + cierre + '" fill="url(#rsvAB)"/>'
                             + '<path d="' + dl + '" fill="none" stroke="#A78BFA" stroke-width="2.4"/><path d="' + bl + '" fill="none" stroke="#38BDF8" stroke-width="2.4"/>' : '')
       +   '<g id="rsv-dbsel"><line x1="' + f1(X(best)) + '" y1="' + Y0 + '" x2="' + f1(X(best)) + '" y2="' + (Y0 + Hh) + '" stroke="rgba(248,250,252,.5)" stroke-dasharray="3 3"/>'
       +   '<circle cx="' + f1(X(best)) + '" cy="' + f1(Y(ob.duty || 0)) + '" r="5" fill="#070D19" stroke="#A78BFA" stroke-width="2.5"/>'
       +   '<circle cx="' + f1(X(best)) + '" cy="' + f1(Y(ob.block || 0)) + '" r="5" fill="#070D19" stroke="#38BDF8" stroke-width="2.5"/></g>'
       +   labs + hits
       + '</svg>'
       + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px"><div class="rs-lab" style="margin:0">' + L('Productividad', 'Productivity') + ' · block ÷ duty</div><div class="rsv-big" style="font-size:14px;color:#FBBF24">' + (prod ? dec(prod * 100) + '%' : '—') + '</div></div>'
       + '<svg class="rsv-svg" viewBox="0 0 336 62" role="img" aria-label="' + L('Productividad mensual', 'Monthly productivity') + '">'
       +   '<defs><linearGradient id="rsvAP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBBF24" stop-opacity=".35"/><stop offset="1" stop-color="#FBBF24" stop-opacity="0"/></linearGradient></defs>'
       +   '<text x="0" y="' + f1(PY(pmx) + 3) + '" fill="rgba(251,191,36,.6)" font-size="8.5">' + pmx + '%</text>'
       +   '<text x="0" y="' + f1(PY(pmn) + 3) + '" fill="rgba(251,191,36,.6)" font-size="8.5">' + pmn + '%</text>'
       +   (pp.length > 1 ? '<path d="' + pl + 'L' + f1(pp[pp.length - 1][0]) + ' 58L' + f1(pp[0][0]) + ' 58Z" fill="url(#rsvAP)"/><path d="' + pl + '" fill="none" stroke="#FBBF24" stroke-width="2"/>' : '')
       +   pdots
       + '</svg>'
       + '<div class="rs-foot">' + L('toca un mes para leerlo. El hueco entre las dos curvas es duty sin volar: firma, escalas y debrief.<br>'
       +   'Duty de los <b>días de vuelo</b> (oficial de eCrews cuando lo hay): no incluye guardias ni días de tierra, así que no es el «Duty hours» de la tira.',
             'tap a month to read it. The gap between the two curves is duty without flying: report, turnarounds and debrief.<br>'
       +   'Duty of <b>flight days</b> (official eCrews duty when available): it leaves out standbys and ground days, so it is not the «Duty hours» of the strip.') + '</div>');
  }

  /* ── sectores, radial, y lo que dice el logbook ── */
  h += sectoresHTML(ctx);

  /* ── dónde duermes (el mapa vive en Logbook) ── */
  h += layoversHTML(ctx);

  /* ── radiación ── */
  h += radiacionHTML(ctx);

  /* ── trip to the Moon ── */
  h += lunaHTML(ctx);

  /* ── récords del año ── */
  h += recordsHTML(ctx);
  return h;
}

function selMes(el){
  try {
    var t = String(el.getAttribute('data-t') || '').split('|');
    var ro = document.getElementById('rsv-dbro');
    if (ro) ro.innerHTML = '<b>' + t[0] + '</b><span style="color:#C4B5FD">duty ' + t[1] + '</span><span style="color:#7DD3FC">block ' + t[2] + '</span><span style="color:#FCD34D">' + t[3] + '</span>';
    var g = document.getElementById('rsv-dbsel');
    if (g){
      var x = el.getAttribute('data-x'), c = g.getElementsByTagName('circle'), l = g.getElementsByTagName('line')[0];
      l.setAttribute('x1', x); l.setAttribute('x2', x);
      c[0].setAttribute('cx', x); c[0].setAttribute('cy', el.getAttribute('data-yd'));
      c[1].setAttribute('cx', x); c[1].setAttribute('cy', el.getAttribute('data-yb'));
    }
  } catch (e) {}
}

function sectoresHTML(ctx){
  var y = ctx.y, PM = ctx.porMes, op = ctx.op, maxS = 1, tot = 0;
  for (var i = 0; i < 12; i++){ var o = PM[y + '-' + String(i + 1).padStart(2, '0')]; if (o){ maxS = Math.max(maxS, o.sect || 0); tot += o.sect || 0; } }
  if (!tot) return '';
  var cx = 150, cy = 150, r0 = 46, rM = 118, wedges = '';
  for (var m = 0; m < 12; m++){
    var mk = y + '-' + String(m + 1).padStart(2, '0'), o2 = PM[mk];
    var a0 = -Math.PI / 2 + m * Math.PI / 6 + 0.05, a1 = a0 + Math.PI / 6 - 0.1, am = (a0 + a1) / 2;
    if (o2 && o2.sect){
      var r1 = r0 + (o2.sect / maxS) * (rM - r0);
      var lb = op.porMes[mk];
      if (lb && (lb.pf + lb.pm)){
        var rp = r0 + (r1 - r0) * lb.pf / (lb.pf + lb.pm);
        wedges += '<path d="' + sector(cx, cy, r0, Math.max(rp - .8, r0 + .5), a0, a1) + '" fill="url(#rsvPF)"/>'
                + '<path d="' + sector(cx, cy, Math.min(rp + .8, r1 - .5), r1, a0, a1) + '" fill="url(#rsvPM)"/>';
      } else {
        wedges += '<path d="' + sector(cx, cy, r0, r1, a0, a1) + '" fill="url(#rsvPF)"/>';
      }
      wedges += '<text x="' + f1(cx + (r1 + 9) * Math.cos(am)) + '" y="' + f1(cy + (r1 + 9) * Math.sin(am) + 3) + '" text-anchor="middle" fill="#E2E8F0" font-size="8.5" font-weight="700">' + o2.sect + '</text>';
    } else if (!o2){
      wedges += '<path d="' + sector(cx, cy, r0, r0 + 3, a0, a1) + '" fill="rgba(255,255,255,.1)"/>';
    }
    wedges += '<text x="' + f1(cx + 136 * Math.cos(am)) + '" y="' + f1(cy + 136 * Math.sin(am) + 3) + '" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + M1(m) + '</text>';
  }
  var hayLb = op.tramos > 0, pfPct = (op.pf + op.pm) ? Math.round(op.pf * 100 / (op.pf + op.pm)) : 0;
  return card(L('Operación', 'Operation'), L('Sectores, despegues y aterrizajes', 'Sectors, take-offs and landings'),
       '<div style="display:flex;justify-content:center"><svg viewBox="0 0 300 300" style="width:100%;max-width:236px;height:auto" role="img" aria-label="' + L('Sectores por mes en gráfico radial', 'Sectors by month, radial chart') + '">'
     +   '<defs><radialGradient id="rsvPF" cx="150" cy="150" r="120" gradientUnits="userSpaceOnUse"><stop offset=".38" stop-color="#0E7490"/><stop offset="1" stop-color="#67E8F9"/></radialGradient>'
     +   '<radialGradient id="rsvPM" cx="150" cy="150" r="120" gradientUnits="userSpaceOnUse"><stop offset=".4" stop-color="#5B21B6"/><stop offset="1" stop-color="#C4B5FD"/></radialGradient></defs>'
     +   '<circle cx="150" cy="150" r="118" fill="none" stroke="rgba(148,163,184,.14)" stroke-dasharray="2 5"/>'
     +   '<circle cx="150" cy="150" r="82" fill="none" stroke="rgba(148,163,184,.14)" stroke-dasharray="2 5"/>'
     +   wedges
     +   '<circle cx="150" cy="150" r="42" fill="rgba(8,12,26,.95)" stroke="rgba(34,211,238,.18)"/>'
     +   '<text x="150" y="151" text-anchor="middle" fill="#F8FAFC" font-size="22" font-weight="700">' + tot + '</text>'
     +   '<text x="150" y="165" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="8" letter-spacing="1.2">' + L('SECTORES', 'SECTORS') + '</text>'
     + '</svg></div>'
     + (hayLb
       ? '<div class="rsv-chips">'
         + chip(op.to, L('Despegues', 'Take-offs'), '#22D3EE') + chip(op.ldg, L('Aterrizajes', 'Landings'), '#22D3EE') + chip(op.ldgNoche, L('De noche', 'At night'), '#A78BFA')
         + '</div>'
         + '<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-top:12px"><div style="width:' + pfPct + '%;background:linear-gradient(90deg,#0E7490,#67E8F9)"></div><div style="flex:1;background:linear-gradient(90deg,#C4B5FD,#5B21B6)"></div></div>'
         + '<div style="display:flex;justify-content:space-between;margin-top:5px" class="rsv-mut"><span>PF ' + op.pf + ' · ' + pfPct + '%</span><span>PM ' + op.pm + ' · ' + (100 - pfPct) + '%</span></div>'
         + leyenda([['#22D3EE', L('PF (por dentro)', 'PF (inside)')], ['#A78BFA', L('PM (por fuera)', 'PM (outside)')]])
       : '<div class="rs-cover" style="margin-top:12px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2.2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>'
         + '<div><b>' + L('Despegues y aterrizajes salen del logbook', 'Take-offs and landings come from the logbook') + '</b><span>'
         + L('El roster no sabe quién vuela cada tramo. Pasa los vuelos de ' + y + ' al logbook y aquí aparecen PF, PM, despegues y aterrizajes.',
             'The roster does not know who flies each leg. Move your ' + y + ' flights to the logbook and PF, PM, take-offs and landings show up here.') + '</span></div></div>')
     + '<div class="rs-foot">' + L('sectores del roster sin posicionales; la longitud de cada gajo es el mes. Un gajo a ras es un mes que no tienes importado.',
                                  'roster sectors without positioning; the length of each wedge is the month. A flat wedge is a month you have not imported.')
     + (hayLb ? '<br>' + L('despegues, aterrizajes y PF/PM: tu logbook (' + op.tramos + ' tramos de ' + y + ').', 'take-offs, landings and PF/PM: your logbook (' + op.tramos + ' legs in ' + y + ').') : '') + '</div>');
}

/* «Dónde duermes». Pedido el 17-oct-2026: «la imagen de los vuelos y el mapa
   es muy parecido a lo que ya hay en el logbook». Lo era: el mapa del Logbook ya
   enseña todos los destinos, las diez rutas más voladas y su globo, con filtro de
   mes. Dos mapas para la misma pregunta acaban contando cosas distintas, así que
   aquí sólo va lo que el logbook NO sabe y sale del roster: dónde pasas la noche
   fuera de base. Las noches son las mismas lunas del calendario (rstDiasFuera),
   contadas donde duermes. El mapa queda a un toque. */
function layoversHTML(ctx){
  var rt = ctx.rt || {};
  if (!rt.sectores && !ctx.base) return '';
  var base = ctx.base, noches = ctx.noches || {};
  var lista = Object.keys(noches).map(function(k){ return { k: k, n: noches[k] }; }).sort(function(a, b){ return b.n - a.n || (a.k < b.k ? -1 : 1); });
  var totN = lista.reduce(function(s, x){ return s + x.n; }, 0);
  var dest = Object.keys(rt.apts || {}).filter(function(k){ return !(root.pilotosMismoApt ? root.pilotosMismoApt(k, base) : k === base); }).length;
  var conNoche = lista.length;
  var mx = lista.length ? lista[0].n : 1;
  var filas = lista.slice(0, 8).map(function(x){
    var C = ctx.coords ? ctx.coords(x.k) : null;
    var km = (C && ctx.baseC && root.RstStats) ? Math.round(RstStats.gcKm(ctx.baseC, C)) : null;
    return '<div class="rsv-row"><div style="width:38px;font-family:\'Space Mono\',monospace;font-weight:700;font-size:12.5px;color:#C4B5FD">' + esc(x.k) + '</div>'
         + '<div style="flex:1;min-width:0"><div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div style="width:' + Math.max(4, Math.round(x.n * 100 / mx)) + '%;height:6px;border-radius:3px;background:linear-gradient(90deg,#22D3EE,#A78BFA)"></div></div>'
         + (km != null ? '<div class="rsv-mut" style="margin-top:3px">' + miles(km) + L(' km de ', ' km from ') + esc(base) + '</div>' : '') + '</div>'
         + '<div class="vv" style="width:auto;white-space:nowrap">' + x.n + '<span class="rsv-mut">' + L(x.n === 1 ? ' noche' : ' noches', x.n === 1 ? ' night' : ' nights') + '</span></div></div>';
  }).join('');
  var resto = lista.length > 8 ? lista.slice(8).reduce(function(s, x){ return s + x.n; }, 0) : 0;
  var ico = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>';
  return cardDer(L('Fuera de ', 'Away from ') + esc(base || L('base', 'base')), L('Dónde duermes', 'Where you sleep'),
       '<div class="rsv-big" style="font-size:17px;color:#C4B5FD">' + totN + '</div><div class="rsv-mut">' + L(totN === 1 ? 'noche fuera' : 'noches fuera', totN === 1 ? 'night away' : 'nights away') + '</div>',
       '<div class="rsv-chips" style="margin-top:2px">'
     +   chip(String(dest), L('destinos', 'destinations'), '#67E8F9') + chip(String(conNoche), L('con noche', 'with a night'), '#C4B5FD') + chip(rt.sectores ? miles(rt.sectores) : '0', L('sectores', 'sectors'), '#7DD3FC')
     + '</div>'
     + (lista.length ? '<div class="rs-lab" style="margin:14px 0 4px">' + L('Por destino', 'By destination') + '</div>' + filas
         + (resto ? '<div class="rsv-mut" style="margin-top:6px">' + L('y ' + resto + ' noche(s) más en ' + (lista.length - 8) + ' destino(s)', 'and ' + resto + ' more night(s) at ' + (lista.length - 8) + ' destination(s)') + '</div>' : '')
       : '<div class="rs-sub" style="margin-top:12px">' + (base ? L('Ninguna noche fuera de base en lo importado.', 'No nights away from base in what you imported.') : L('Pon tu base en el perfil y aquí salen tus noches fuera.', 'Set your base in your profile and your nights away appear here.')) + '</div>')
     + '<button type="button" class="rsv-link" onclick="RstViz.irMapa()">' + ico + '<span>' + L('Ver el mapa de rutas en Logbook', 'See the route map in Logbook') + '</span></button>'
     + '<div class="rs-foot">' + L('noches fuera = las mismas lunas del calendario, contadas donde duermes. El mapa de todos tus destinos y rutas vive en Logbook → Mapa.',
                                  'nights away = the same moons as the calendar, counted where you sleep. The map of all your destinations and routes lives in Logbook → Map.') + '</div>');
}
function irMapa(){
  try {
    if (typeof root.goTo === 'function') root.goTo('logbook');
    setTimeout(function(){
      try { if (typeof root.ldSwitchTab === 'function') root.ldSwitchTab('mapa', root.document.getElementById('ld-tab-btn-mapa')); } catch (e) {}
    }, 120);
  } catch (e) {}
}
function nochesDe(noches, k){
  if (noches[k]) return noches[k];
  var f = root.pilotosMismoApt;
  if (!f) return 0;
  for (var c in noches) if (f(c, k)) return noches[c];
  return 0;
}

function radiacionHTML(ctx){
  var rt = ctx.rt;
  if (!rt.uSv) return '';
  var mSv = rt.uSv / 1000, frac = Math.min(mSv / 6, 1);
  var ticks = '';
  for (var v = 0; v <= 6; v++){
    var a = Math.PI + v / 6 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    ticks += '<line x1="' + f1(130 + 113 * c) + '" y1="' + f1(135 + 113 * s) + '" x2="' + f1(130 + 120 * c) + '" y2="' + f1(135 + 120 * s) + '" stroke="rgba(248,250,252,.4)" stroke-width="1.2"/>'
           + '<text x="' + f1(130 + 130 * c) + '" y="' + f1(138 + 130 * s) + '" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + v + '</text>';
  }
  var na = Math.PI + frac * Math.PI;
  var meses = ctx.meses, mx = 1;
  meses.forEach(function(m){ var o = rt.porMes[m]; if (o) mx = Math.max(mx, o.uSv); });
  var bw = Math.min(26, 330 / Math.max(meses.length, 1)), bars = '';
  meses.forEach(function(m, i){
    var o = rt.porMes[m] || { uSv: 0 }, hgt = o.uSv / mx * 60, x = i * bw + (336 - meses.length * bw) / 2;
    bars += '<rect x="' + f1(x + 3) + '" y="' + f1(76 - hgt) + '" width="' + f1(bw - 6) + '" height="' + f1(Math.max(hgt, 1)) + '" rx="4" fill="url(#rsvMu)"/>'
          + '<text x="' + f1(x + bw / 2) + '" y="' + f1(71 - hgt) + '" text-anchor="middle" fill="#C4B5FD" font-size="8">' + Math.round(o.uSv) + '</text>'
          + '<text x="' + f1(x + bw / 2) + '" y="90" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + M1(+m.slice(5, 7) - 1) + '</text>';
  });
  var porHora = rt.bloqueMin ? rt.uSv / (rt.bloqueMin / 60) : 0;
  var nivel = mSv < 1 ? [L('Bajo', 'Low'), '#34D399'] : (mSv < 6 ? [L('Moderado', 'Moderate'), '#FBBF24'] : [L('Alto', 'High'), '#F87171']);
  return cardDer(L('Estimación · exposición', 'Estimate · exposure'), L('Radiación cósmica', 'Cosmic radiation'), pill(nivel[0], nivel[1]),
       '<div style="display:flex;justify-content:center"><svg viewBox="-14 0 288 150" style="width:100%;max-width:244px;height:auto" role="img" aria-label="' + L('Indicador de dosis anual estimada', 'Estimated annual dose gauge') + '">'
     +   '<defs><linearGradient id="rsvRad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#34D399"/><stop offset=".45" stop-color="#FBBF24"/><stop offset="1" stop-color="#EF4444"/></linearGradient></defs>'
     +   '<path d="M30 135 A100 100 0 0 1 230 135" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="18" stroke-linecap="round"/>'
     +   '<path d="M30 135 A100 100 0 0 1 230 135" fill="none" stroke="url(#rsvRad)" stroke-opacity=".25" stroke-width="18" stroke-linecap="round"/>'
     +   '<path d="M30 135 A100 100 0 0 1 230 135" fill="none" stroke="url(#rsvRad)" stroke-width="18" stroke-linecap="round" pathLength="100" stroke-dasharray="' + f1(Math.max(frac * 100, .5)) + ' 100"/>'
     +   ticks
     +   '<circle cx="' + f1(130 + 100 * Math.cos(na)) + '" cy="' + f1(135 + 100 * Math.sin(na)) + '" r="13" fill="#F8FAFC" fill-opacity=".18"/>'
     +   '<circle cx="' + f1(130 + 100 * Math.cos(na)) + '" cy="' + f1(135 + 100 * Math.sin(na)) + '" r="7.5" fill="#F8FAFC" stroke="#070D19" stroke-width="2.5"/>'
     +   '<text x="130" y="112" text-anchor="middle" fill="#F8FAFC" font-size="34" font-weight="700">' + dec(mSv, 2) + '</text>'
     +   '<text x="130" y="132" text-anchor="middle" fill="rgba(248,250,252,.6)" font-size="10">' + L('mSv estimados · ', 'estimated mSv · ') + ctx.y + '</text>'
     + '</svg></div>'
     + '<svg class="rsv-svg" viewBox="0 0 336 94" role="img" aria-label="' + L('Dosis estimada por mes en microsievert', 'Estimated dose by month in microsievert') + '">'
     +   '<defs><linearGradient id="rsvMu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C4B5FD"/><stop offset="1" stop-color="#4C1D95"/></linearGradient></defs>'
     +   bars + '</svg>'
     + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'
     +   pill('≈ ' + Math.round(mSv / 2.4 * 100) + L('% de la dosis natural media de un año', '% of the average natural dose in a year'), '#C4B5FD')
     +   pill('≈ ' + dec(porHora, 1) + L(' µSv por hora de block', ' µSv per block hour'), '#C4B5FD')
     + '</div>'
     + '<div class="rs-foot">' + L('<b>estimación orientativa</b>: tasa por hora de block según la latitud media de cada tramo (más alta hacia el norte). No modela el ciclo solar ni tu nivel de vuelo real.<br>'
     +   'La dosis oficial es la que registra la compañía. Referencias: 1 mSv/año (público) y 6 mSv/año (categoría A, Directiva 2013/59/Euratom). Barras en µSv.',
             '<b>rough estimate</b>: a rate per block hour from the mean latitude of each leg (higher towards the north). It does not model the solar cycle or your real flight level.<br>'
     +   'The official dose is the one the airline records. References: 1 mSv/year (public) and 6 mSv/year (category A, Directive 2013/59/Euratom). Bars in µSv.') + '</div>');
}

/* La Tierra, la Luna y el avión. Pedido el 17-oct-2026: «mejora la bola del
   mundo, el avión y la luna».

   · La TIERRA es la de verdad: las costas de `COSTAS_MUNDO` (js/coastline.js,
     Natural Earth 110m, la misma tabla del globo del logbook) en proyección
     ortográfica centrada cerca de tu base, que va marcada. Los puntos de la
     cara oculta se llevan al borde del disco, así cada continente se cierra
     siguiendo el horizonte y el relleno no cruza el océano. Si el fichero no
     ha cargado, una Tierra sin costas: rara, pero no miente.
   · El SOL viene del mismo lado para las dos: la Tierra y la Luna tienen la
     sombra al mismo lado, y eso es lo que hace que la escena se lea como una.
   · El AVIÓN es un bimotor de pasillo único visto desde arriba, con su estela
     sobre el tramo ya recorrido. */
var _cst = null;
function _costas(){
  if (_cst) return _cst;
  var c = root.COSTAS_MUNDO;
  if (!c || !c.length) return null;
  try { if (typeof root.pilotosCostasUnidas === 'function') c = root.pilotosCostasUnidas(c); } catch (e) {}
  return (_cst = c);
}
function tierraSVG(cx, cy, R, base){
  var lon0 = base ? base.lon - 12 : -8, lat0 = base ? base.lat - 6 : 34;
  var rad = Math.PI / 180, l0 = lat0 * rad, sl0 = Math.sin(l0), cl0 = Math.cos(l0);
  var pr = function(lon, lat){
    var la = lat * rad, lo = (lon - lon0) * rad;
    var x = Math.cos(la) * Math.sin(lo), y = cl0 * Math.sin(la) - sl0 * Math.cos(la) * Math.cos(lo);
    var c = sl0 * Math.sin(la) + cl0 * Math.cos(la) * Math.cos(lo);
    if (c < 0){ var n = Math.sqrt(x * x + y * y) || 1; x /= n; y /= n; }
    return [cx + x * R, cy - y * R, c >= 0];
  };
  /* Natural Earth trae 13 anillos ABIERTOS por el corte del antimeridiano
     (Eurasia y América partidas en dos). Rellenados tal cual, la cuerda de
     cierre cruza el disco —una raya vertical en mitad del planeta—. Se cosen
     con la misma puerta que usa la carta SIGWX, y una sola vez. */
  var CST = _costas(), tierra = '';
  if (CST && CST.length){
    for (var k = 0; k < CST.length; k++){
      var ring = CST[k], d = '', vis = 0, step = ring.length > 60 ? 2 : 1;
      for (var j = 0; j < ring.length; j += step){
        var q = pr(ring[j][0], ring[j][1]); if (q[2]) vis++;
        d += (d ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]);
      }
      if (vis > 1) tierra += '<path d="' + d + 'Z"/>';
    }
  } else {
    tierra = '<path d="' + 'M' + (cx - 14) + ' ' + (cy - 12) + 'q8-8 16-3q6 4 13 1q3 8-6 11q-10 1-12 8q-8-5-11-17z' + '"/>';
  }
  var b = base ? pr(base.lon, base.lat) : null;
  return '<defs>'
    + '<radialGradient id="rsvOcean" cx="62%" cy="34%" r="78%"><stop offset="0" stop-color="#7DD3FC"/><stop offset=".38" stop-color="#2563EB"/><stop offset=".8" stop-color="#1E3A8A"/><stop offset="1" stop-color="#0B1640"/></radialGradient>'
    + '<linearGradient id="rsvLand" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86EFAC"/><stop offset=".55" stop-color="#22A35A"/><stop offset="1" stop-color="#166534"/></linearGradient>'
    + '<linearGradient id="rsvNoche" x1=".85" y1=".1" x2=".1" y2=".95"><stop offset=".42" stop-color="#020617" stop-opacity="0"/><stop offset=".78" stop-color="#020617" stop-opacity=".55"/><stop offset="1" stop-color="#020617" stop-opacity=".85"/></linearGradient>'
    + '<radialGradient id="rsvBrillo" cx="68%" cy="28%" r="40%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".45"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>'
    + '<radialGradient id="rsvAtm" cx="50%" cy="50%" r="50%"><stop offset=".74" stop-color="#7DD3FC" stop-opacity="0"/><stop offset=".8" stop-color="#7DD3FC" stop-opacity=".55"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></radialGradient>'
    + '<clipPath id="rsvClipT"><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '"/></clipPath>'
    + '</defs>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(R * 1.36) + '" fill="url(#rsvAtm)"/>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#rsvOcean)"/>'
    + '<g clip-path="url(#rsvClipT)">'
    +   '<g fill="url(#rsvLand)" stroke="#BBF7D0" stroke-opacity=".55" stroke-width=".35" stroke-linejoin="round">' + tierra + '</g>'
    +   '<g fill="none" stroke="#F8FAFC" stroke-linecap="round" stroke-opacity=".38">'
    +     '<path d="M' + f1(cx - R * .8) + ' ' + f1(cy - R * .25) + 'q' + f1(R * .5) + ' -' + f1(R * .22) + ' ' + f1(R * 1.05) + ' -' + f1(R * .05) + '" stroke-width="2.2"/>'
    +     '<path d="M' + f1(cx - R * .3) + ' ' + f1(cy + R * .42) + 'q' + f1(R * .45) + ' -' + f1(R * .16) + ' ' + f1(R * .95) + ' ' + f1(R * .04) + '" stroke-width="1.6"/>'
    +   '</g>'
    +   (b && b[2] ? '<circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="3.4" fill="#FBBF24" fill-opacity=".45" class="rsv-ping"/><circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="1.9" fill="#FBBF24" stroke="#0B1640" stroke-width=".7"/>' : '')
    +   '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#rsvNoche)"/>'
    +   '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#rsvBrillo)"/>'
    + '</g>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(R - .4) + '" fill="none" stroke="#BAE6FD" stroke-opacity=".5" stroke-width=".8"/>';
}
function lunaSVG(cx, cy, R){
  /* Mares y cráteres en coordenadas del disco (−1…1), colocados como se ven
     desde la Tierra: Imbrium arriba a la izquierda, Tranquillitatis al centro
     derecha, Tycho abajo con sus rayos. No es un mapa, pero se reconoce. */
  var P = function(x, y){ return f1(cx + x * R) + ' ' + f1(cy + y * R); };
  var mares = [
    [[-.55,-.42],[-.2,-.58],[.05,-.32],[-.12,-.05],[-.48,-.08],[-.66,-.22]],
    [[.12,-.38],[.38,-.46],[.52,-.2],[.36,.02],[.12,-.06]],
    [[.18,.02],[.46,.06],[.5,.32],[.24,.36],[.1,.2]],
    [[-.78,.02],[-.5,.04],[-.38,.36],[-.62,.52],[-.84,.3]],
    [[.58,-.5],[.74,-.46],[.76,-.3],[.6,-.3]]
  ];
  var m = '';
  mares.forEach(function(pp){
    var d = 'M' + P(pp[0][0], pp[0][1]);
    for (var i = 1; i <= pp.length; i++){
      var a = pp[i - 1], b2 = pp[i % pp.length];
      d += 'Q' + P(a[0] + (b2[0] - a[0]) * .5 + (b2[1] - a[1]) * .18, a[1] + (b2[1] - a[1]) * .5 - (b2[0] - a[0]) * .18) + ' ' + P(b2[0], b2[1]);
    }
    m += '<path d="' + d + 'Z"/>';
  });
  var crat = [[-.18,.62,.12],[.36,.62,.07],[-.6,-.62,.06],[.68,.14,.08],[-.02,-.72,.05],[.12,.46,.05],[-.34,.3,.045]], c = '';
  crat.forEach(function(k){
    var r = k[2] * R;
    c += '<circle cx="' + f1(cx + k[0] * R) + '" cy="' + f1(cy + k[1] * R) + '" r="' + f1(r) + '" fill="#4C4868" fill-opacity=".55"/>'
       + '<path d="M' + f1(cx + k[0] * R - r) + ' ' + f1(cy + k[1] * R) + 'A' + f1(r) + ' ' + f1(r) + ' 0 0 0 ' + f1(cx + k[0] * R + r) + ' ' + f1(cy + k[1] * R) + '" fill="none" stroke="#F5F3FF" stroke-opacity=".55" stroke-width=".7"/>';
  });
  var tx = cx - .18 * R, ty = cy + .62 * R, rayos = '';
  for (var i = 0; i < 9; i++){ var a = i * 0.698 + .3, L2 = R * (.32 + (i % 3) * .1); rayos += 'M' + f1(tx) + ' ' + f1(ty) + 'L' + f1(tx + Math.cos(a) * L2) + ' ' + f1(ty + Math.sin(a) * L2); }
  return '<defs>'
    + '<radialGradient id="rsvMoon" cx="66%" cy="30%" r="80%"><stop offset="0" stop-color="#FAF9FF"/><stop offset=".45" stop-color="#D4D0E6"/><stop offset=".85" stop-color="#8E89AB"/><stop offset="1" stop-color="#5B5778"/></radialGradient>'
    + '<radialGradient id="rsvMoonGlow" cx="50%" cy="50%" r="50%"><stop offset=".5" stop-color="#DDD6FE" stop-opacity=".28"/><stop offset="1" stop-color="#DDD6FE" stop-opacity="0"/></radialGradient>'
    + '<linearGradient id="rsvMoonNoche" x1=".85" y1=".1" x2=".1" y2=".95"><stop offset=".5" stop-color="#0B0A1E" stop-opacity="0"/><stop offset="1" stop-color="#0B0A1E" stop-opacity=".7"/></linearGradient>'
    + '<filter id="rsvMar" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".7"/></filter>'
    + '<clipPath id="rsvClipL"><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '"/></clipPath>'
    + '</defs>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(R * 1.9) + '" fill="url(#rsvMoonGlow)"/>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#rsvMoon)"/>'
    + '<g clip-path="url(#rsvClipL)">'
    +   '<g fill="#6E6A8E" fill-opacity=".42" filter="url(#rsvMar)">' + m + '</g>'
    +   '<path d="' + rayos + '" stroke="#FFFFFF" stroke-opacity=".22" stroke-width=".6"/>'
    +   c
    +   '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#rsvMoonNoche)"/>'
    + '</g>';
}
var AVION = 'M0 -13C1 -13 1.5 -11.6 1.5 -10L1.5 -3.4L11.8 2.4L11.8 4L1.5 1.4L1.4 7.6L4.8 10.2L4.8 11.6L.8 10.8L0 12.2L-.8 10.8L-4.8 11.6L-4.8 10.2L-1.4 7.6L-1.5 1.4L-11.8 4L-11.8 2.4L-1.5 -3.4L-1.5 -10C-1.5 -11.6 -1 -13 0 -13Z';
function avionSVG(x, y, ang){
  return '<g transform="translate(' + f1(x) + ' ' + f1(y) + ') rotate(' + f1(ang) + ') scale(1.05)">'
    + '<circle r="17" fill="url(#rsvHalo)"/>'
    + '<path d="' + AVION + '" fill="#020617" fill-opacity=".45" transform="translate(1.6 2)"/>'
    + '<path d="' + AVION + '" fill="url(#rsvFus)" stroke="#E0F2FE" stroke-width=".4"/>'
    + '<ellipse cx="4.6" cy="1.2" rx="1" ry="2.1" fill="#64748B"/><ellipse cx="-4.6" cy="1.2" rx="1" ry="2.1" fill="#64748B"/>'
    + '<path d="M-.9 -10.4h1.8" stroke="#0E7490" stroke-width=".9" stroke-linecap="round"/>'
    + '<circle cx="11.6" cy="3.2" r=".9" fill="#22C55E"/><circle cx="-11.6" cy="3.2" r=".9" fill="#EF4444"/>'
    + '</g>';
}

/* La trayectoria: una cuadrática del borde de la Tierra al de la Luna, y el
   avión sobre ella en la fracción del viaje en curso, con el rumbo de la tangente.
   La MISMA función la usan el HTML (posición final) y la animación. */
var LP0 = [80, 142], LP1 = [165, 4], LP2 = [266, 60];
function _lunaPos(t){
  var u = 1 - t;
  var x = u*u*LP0[0] + 2*u*t*LP1[0] + t*t*LP2[0], y = u*u*LP0[1] + 2*u*t*LP1[1] + t*t*LP2[1];
  var dx = 2*u*(LP1[0]-LP0[0]) + 2*t*(LP2[0]-LP1[0]), dy = 2*u*(LP1[1]-LP0[1]) + 2*t*(LP2[1]-LP1[1]);
  return [x, y, Math.atan2(dy, dx) * 180 / Math.PI + 90];
}
function _lunaTr(t){ var p = _lunaPos(t); return 'translate(' + f1(p[0]) + ' ' + f1(p[1]) + ') rotate(' + f1(p[2]) + ')'; }
function _dias(a, b){ return Math.round((Date.UTC(+b.slice(0,4), +b.slice(5,7)-1, +b.slice(8,10)) - Date.UTC(+a.slice(0,4), +a.slice(5,7)-1, +a.slice(8,10))) / 864e5); }

/* «El mundo y la luna no es dinámico, lo veo inútil tal y como está» (17-oct-2026).
   Como dibujo fijo no decía nada. Ahora cuenta algo al entrar: al ver la tarjeta,
   el avión SALE DE LA TIERRA y recorre el camino hasta donde llegan tus km de
   verdad, con el contador subiendo a la vez; tocarla lo repite, y el deslizador
   recorre los meses para ver dónde ibas en cada uno. Debajo, a tu ritmo de este
   año, cuándo completas el viaje en curso.
   · La animación dura 1,6 s y SE PARA. Sólo corre cuando la tarjeta se ve
     (IntersectionObserver), y con «reducir movimiento» sale quieta en su sitio.
   · El HTML ya trae la posición final: sin JS, en una captura o con el
     observador sin disparar, la escena enseña el dato y no un avión en la Tierra. */
function lunaHTML(ctx){
  var R = ctx.rtCarrera;
  if (!R || !R.km) return '';
  var viajes = R.km / LUNA_KM, entero = Math.floor(viajes), frac = viajes - entero;
  var faltan = Math.round(LUNA_KM - (R.km % LUNA_KM));
  var tray = 'M' + LP0[0] + ' ' + LP0[1] + ' Q ' + LP1[0] + ' ' + LP1[1] + ' ' + LP2[0] + ' ' + LP2[1];
  var est = '', sd = 7;
  for (var i = 0; i < 60; i++){
    sd = (sd * 9301 + 49297) % 233280; var a = sd / 233280;
    sd = (sd * 9301 + 49297) % 233280; var b = sd / 233280;
    est += '<circle cx="' + f1(a * 336) + '" cy="' + f1(b * 210) + '" r="' + (0.35 + (i % 4) * 0.3).toFixed(2) + '" fill="#F8FAFC" fill-opacity="' + (0.2 + (i % 5) * 0.14).toFixed(2) + '"' + (i % 3 ? '' : ' class="rsv-tw"') + '/>';
  }
  var lunas = '';
  for (var l = 0; l < Math.min(entero, 8); l++)
    lunas += '<svg viewBox="0 0 20 20" style="width:16px;height:16px" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="url(#rsvMoon)"/></svg>';
  var dc = ctx.desdeCarrera ? mesAno(+ctx.desdeCarrera.slice(5, 7) - 1, ctx.desdeCarrera.slice(0, 4)) : '';
  var pc = f1(Math.max(frac * 100, .5));

  /* A tu ritmo de ESTE año: km del año ÷ días desde el primer mes importado del
     año hasta hoy. Un año con un mes importado no tiene ritmo que proyectar. */
  var proy = '';
  var kmA = ctx.rt && ctx.rt.km, hoy = ctx.hoy, m0 = ctx.meses && ctx.meses[0];
  if (kmA && hoy && m0){
    var d0 = m0 + '-01', nd = _dias(d0, hoy) + 1;
    if (nd >= 45){
      var porDia = kmA / nd, dF = Math.ceil(faltan / porDia);
      if (dF > 0 && dF < 365 * 30){
        var t = new Date(Date.UTC(+hoy.slice(0,4), +hoy.slice(5,7)-1, +hoy.slice(8,10)) + dF * 864e5);
        var cuando = mesAno(t.getUTCMonth(), t.getUTCFullYear());
        proy = '<div class="rsv-lproy">' + L('A tu ritmo de este año (' + miles(porDia * 30.44) + ' km al mes) llegas a la Luna ' + (entero ? 'por ' + (entero + 1) + 'ª vez ' : '') + 'en <b>' + cuando + '</b>.',
                                              'At this year’s pace (' + miles(porDia * 30.44) + ' km a month) you reach the Moon ' + (entero ? 'for the ' + ordEN(entero + 1) + ' time ' : '') + 'in <b>' + cuando + '</b>.') + '</div>';
      }
    }
  }
  /* El deslizador: km acumulados al final de cada mes del roster. */
  var KM = (ctx.kmMes || []).filter(function(x){ return x && x.km > 0; });
  var slide = '';
  if (KM.length > 1){
    var ult = KM[KM.length - 1];
    slide = '<div class="rsv-lslide"><input type="range" min="0" max="' + (KM.length - 1) + '" value="' + (KM.length - 1) + '" step="1"'
          + ' aria-label="' + L('Mes del recorrido', 'Month of the journey') + '" oninput="RstViz.lunaMes(this)">'
          + '<output>' + mesAno(+ult.m.slice(5,7) - 1, ult.m.slice(0,4)) + '</output></div>';
  }
  return cardDer(L('Todo tu roster', 'Your whole roster'), 'Trip to the Moon', pill(L('Luna ×', 'Moon ×') + entero, '#DDD6FE'),
       '<svg class="rsv-svg rsv-lsc" viewBox="0 0 336 222" role="img" aria-label="' + L('Trayectoria de la Tierra a la Luna con tu progreso. Toca para repetir el viaje.', 'Trajectory from the Earth to the Moon with your progress. Tap to replay the journey.') + '" onclick="RstViz.lunaPlay(this)">'
     +   '<defs><linearGradient id="rsvTraj" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#C4B5FD"/></linearGradient>'
     +   '<linearGradient id="rsvFus" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#CBD5E1"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBD5E1"/></linearGradient>'
     +   '<radialGradient id="rsvHalo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7DD3FC" stop-opacity=".45"/><stop offset="1" stop-color="#7DD3FC" stop-opacity="0"/></radialGradient>'
     +   '<filter id="rsvEstela" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>'
     +   est
     +   tierraSVG(50, 170, 36, ctx.baseC)
     +   lunaSVG(288, 50, 23)
     +   '<path d="' + tray + '" fill="none" stroke="rgba(196,181,253,.28)" stroke-width="1.6" stroke-dasharray="2 6" stroke-linecap="round"/>'
     +   '<path class="rsv-ltr" d="' + tray + '" fill="none" stroke="#7DD3FC" stroke-opacity=".55" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="' + pc + ' 100" filter="url(#rsvEstela)"/>'
     +   '<path class="rsv-ltr" d="' + tray + '" fill="none" stroke="url(#rsvTraj)" stroke-width="2.4" stroke-linecap="round" pathLength="100" stroke-dasharray="' + pc + ' 100"/>'
     +   '<g class="rsv-lav" transform="' + _lunaTr(frac) + '">' + avionSVG(0, 0, 0) + '</g>'
     +   '<text x="50" y="219" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="8.5" letter-spacing="1.2">' + L('TIERRA', 'EARTH') + '</text>'
     +   '<text x="288" y="88" text-anchor="middle" fill="#C4B5FD" font-size="8.5">' + miles(LUNA_KM) + ' km</text>'
     + '</svg>'
     + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:6px"><div class="rsv-big rsv-lcnt" style="font-size:26px;background:linear-gradient(90deg,#7DD3FC,#C4B5FD);-webkit-background-clip:text;background-clip:text;color:transparent">' + dec(viajes, 2) + '</div>'
     +   '<div style="font-size:12px;color:#C4B5FD">' + L('viajes a la Luna', 'trips to the Moon') + '</div><div style="margin-left:auto;display:flex;gap:3px">' + lunas + '</div></div>'
     + slide
     + '<div class="rsv-chips">'
     +   chip(miles(R.km), L('km totales', 'total km'), '#7DD3FC') + chip(dec(R.km / ECUADOR_KM, 1), L('vueltas al ecuador', 'laps of the equator'), '#C4B5FD') + chip(miles(faltan), L('km restantes', 'km to go'), '#DDD6FE')
     + '</div>'
     + proy
     + '<div class="rs-foot">' + L('toca la escena para repetir el viaje. Todo el roster importado' + (dc ? ' (desde ' + dc + ')' : '') + ', ' + miles(R.sectores) + ' sectores sin posicionales. Distancia ortodrómica: la que vuelas es algo mayor.',
                                  'tap the scene to replay the journey. Your whole imported roster' + (dc ? ' (since ' + dc + ')' : '') + ', ' + miles(R.sectores) + ' sectors without positioning. Great-circle distance: what you actually fly is a little more.') + '</div>',
       'rsv-space', 'data-km="' + Math.round(R.km) + '" data-kmmes="' + KM.map(function(x){ return x.m + ':' + Math.round(x.km); }).join(',') + '"');
}
function ordEN(n){ var s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/* ── la animación del viaje ── */
function _lunaCard(el){ while (el && !(el.classList && el.classList.contains('rsv-space'))) el = el.parentNode; return el; }
function _lunaPinta(card, km){
  var v = km / LUNA_KM, fr = v - Math.floor(v);
  var av = card.querySelector('.rsv-lav'); if (av) av.setAttribute('transform', _lunaTr(fr));
  var tr = card.querySelectorAll('.rsv-ltr'), pc = f1(Math.max(fr * 100, .5));
  for (var i = 0; i < tr.length; i++) tr[i].setAttribute('stroke-dasharray', pc + ' 100');
  var c = card.querySelector('.rsv-lcnt'); if (c) c.textContent = dec(v, 2);
}
function _quieto(){ try { return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
function lunaPlay(el){
  var card = _lunaCard(el); if (!card) return;
  var K = +card.getAttribute('data-km') || 0; if (!K) return;
  var sl = card.querySelector('.rsv-lslide input');
  if (sl){ sl.value = sl.max; var o = card.querySelector('.rsv-lslide output'), ks = _kmMes(card); if (o && ks.length) o.textContent = mesAno(+ks[ks.length-1][0].slice(5,7) - 1, ks[ks.length-1][0].slice(0,4)); }
  if (_quieto() || !root.requestAnimationFrame){ _lunaPinta(card, K); return; }
  var tok = (card._lunaTok = (card._lunaTok || 0) + 1), t0 = null, DUR = 1600;
  var paso = function(ts){
    if (card._lunaTok !== tok) return;
    if (t0 == null) t0 = ts;
    var t = Math.min(1, (ts - t0) / DUR), e = 1 - Math.pow(1 - t, 3);
    _lunaPinta(card, K * e);
    if (t < 1) root.requestAnimationFrame(paso); else card._lunaHecho = 1;
  };
  _lunaPinta(card, 0);
  root.requestAnimationFrame(paso);
}
function _kmMes(card){
  return String(card.getAttribute('data-kmmes') || '').split(',').filter(Boolean).map(function(x){ var p = x.split(':'); return [p[0], +p[1]]; });
}
function lunaMes(inp){
  var card = _lunaCard(inp); if (!card) return;
  card._lunaTok = (card._lunaTok || 0) + 1;   // corta una animación en curso
  var ks = _kmMes(card), k = ks[+inp.value]; if (!k) return;
  _lunaPinta(card, k[1]);
  var o = card.querySelector('.rsv-lslide output');
  if (o) o.textContent = mesAno(+k[0].slice(5,7) - 1, k[0].slice(0,4));
}
/* Lo llama quien mete el HTML en la página: arranca el viaje la PRIMERA vez que
   la tarjeta se ve. Una tarjeta que nadie mira no anima nada. */
function monta(host){
  try {
    var card = host && host.querySelector && host.querySelector('.rsv-space[data-km]');
    if (!card) return;
    if (!root.IntersectionObserver){ return; }
    var io = new root.IntersectionObserver(function(es){
      es.forEach(function(e){
        if (e.isIntersecting && e.intersectionRatio >= .35 && !card._lunaHecho && !card._lunaTok){ io.disconnect(); lunaPlay(card); }
      });
    }, { threshold: [0, .35, .6] });
    io.observe(card);
  } catch (e) {}
}

function recordsHTML(ctx){
  var LD = ctx.ld, rt = ctx.rt, PM = ctx.porMes, r = [];
  if (LD.top.length){ var t = LD.top[0], d = t.date.split('-'); r.push([L('Duty más largo', 'Longest duty'), hh(t.min), diaMes(d[2], +d[1] - 1), '#F87171', 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z']); }
  if (rt.maxKm) r.push([L('Sector más largo', 'Longest sector'), miles(rt.maxKm.km) + ' km', rt.maxKm.dep + '–' + rt.maxKm.arr, '#38BDF8', 'M2 16l20-8-8 12-2-6-10 2z']);
  var mm = null; Object.keys(PM).forEach(function(m){ if (!mm || (PM[m].sect || 0) > (PM[mm].sect || 0)) mm = m; });
  if (mm && PM[mm].sect) r.push([L('Mes con más sectores', 'Busiest month'), String(PM[mm].sect), mesAno(+mm.slice(5, 7) - 1, mm.slice(0, 4)), '#22D3EE', 'M3 20h18M6 16V9M11 16V5M16 16v-6M21 16v-3']);
  var fav = null, cnt = {};
  rt.pares.forEach(function(p){ [p.a, p.b].forEach(function(k){
    if (root.pilotosMismoApt ? root.pilotosMismoApt(k, ctx.base) : k === ctx.base) return;
    cnt[k] = (cnt[k] || 0) + p.n; if (!fav || cnt[k] > cnt[fav]) fav = k; }); });
  if (fav) r.push([L('Destino favorito', 'Favourite destination'), fav, cnt[fav] + L(' sectores', ' sectors'), '#C4B5FD', 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z']);
  if (!r.length) return '';
  return card('Hall of fame · ' + ctx.y, L('Récords del año', 'Records of the year'),
       '<div class="rsv-g2" style="margin:0">' + r.map(function(x){
         return '<div style="border-radius:14px;padding:11px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(160deg,' + hex2rgba(x[3], .16) + ',rgba(8,12,26,.6) 70%)">'
              + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + x[3] + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + x[4] + '"/></svg>'
              + '<div class="rsv-mut" style="margin-top:6px">' + x[0] + '</div>'
              + '<div class="rsv-big" style="font-size:15px;color:' + x[3] + ';margin-top:3px">' + esc(x[1]) + '</div>'
              + '<div class="rsv-mut" style="margin-top:3px;opacity:.8">' + esc(x[2]) + '</div></div>';
       }).join('') + '</div>');
}

var API = { anoHTML: anoHTML, vueloHTML: vueloHTML, selMes: selMes, irMapa: irMapa, lunaPlay: lunaPlay, lunaMes: lunaMes, monta: monta, _lunaPos: _lunaPos, longDutyHTML: longDutyHTML, CLASE: CLASE };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.RstViz = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
