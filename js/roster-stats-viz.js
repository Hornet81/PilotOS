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

var MES3 = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
var MES1 = ['E','F','M','A','M','J','J','A','S','O','N','D'];
var LUNA_KM = 384400, ECUADOR_KM = 40075;

/* Colores por clase fina. Los de familia son los del reparto de siempre
   (rstatsRenderAno); las tres partes del día libre se separan en LUMINOSIDAD y
   no sólo en tono, para que se distingan también sin ver bien el verde. */
var CLASE = {
  vuelo:      { c:'#22D3EE', t:'Vuelo' },
  guardia:    { c:'#F59E0B', t:'Stand-by' },
  formacion:  { c:'#94A3B8', t:'Training' },
  srof:       { c:'#34D399', t:'SROF' },
  nrof:       { c:'#A7F3D0', t:'NROF' },
  off:        { c:'#047857', t:'OFF' },
  vacaciones: { c:'#A78BFA', t:'Leave' },
  baja:       { c:'#F472B6', t:'Sick' },
  franco:     { c:'#0E7490', t:'Franco' },
  otros:      { c:'#475569', t:'Otros' }
};
var ORDEN = ['vuelo','guardia','formacion','srof','nrof','off','vacaciones','baja','franco','otros'];
var ROJO = '#EF4444';

/* ─────────────── utilidades ─────────────── */
function n0(v){ return Math.round(v || 0); }
function miles(v){ return String(n0(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function dec(v, d){ var p = Math.pow(10, d || 1); return String(Math.round(v * p) / p).replace('.', ','); }
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
  return '<div class="la-card rsv-card' + (extra ? ' ' + extra : '') + '">'
       + '<div class="rsv-hd"><div><div class="rs-lab" style="margin-bottom:3px">' + lab + '</div>'
       + (titulo ? '<div class="rsv-ttl">' + titulo + '</div>' : '') + '</div></div>'
       + cuerpo + '</div>';
}
function cardDer(lab, titulo, der, cuerpo, extra){
  return '<div class="la-card rsv-card' + (extra ? ' ' + extra : '') + '">'
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
    '.rsv-ttl{font-size:16px;font-weight:700;color:#F8FAFC;letter-spacing:-.2px;line-height:1.25}',
    '.rsv-big{font-family:"Space Mono",monospace;font-weight:700;color:#F8FAFC;line-height:1}',
    '.rsv-mut{font-size:10px;color:rgba(248,250,252,.62);font-family:"Space Mono",monospace}',
    '.rsv-svg{display:block;width:100%;height:auto;overflow:visible}',
    '.rsv-svg text{font-family:"Space Mono",monospace}',
    '.rsv-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:11px;border:1px solid;font-size:10px;font-weight:700;font-family:"Space Mono",monospace;white-space:nowrap}',
    '.rsv-leg{display:flex;flex-wrap:wrap;gap:6px 12px;font-family:"Space Mono",monospace;font-size:9.5px;color:rgba(248,250,252,.72);margin-top:8px}',
    '.rsv-leg i{width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:5px;vertical-align:-1px}',
    '.rsv-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:12px;position:relative}',
    '.rsv-chip{border-radius:13px;padding:9px 10px;border:1px solid}',
    '.rsv-chip b{display:block;font-family:"Space Mono",monospace;font-size:18px;line-height:1.1}',
    '.rsv-chip span{font-size:9.5px;font-family:"Space Mono",monospace;letter-spacing:.4px}',
    '.rsv-row{display:flex;align-items:center;gap:9px;padding:7px 2px;border-top:1px solid rgba(255,255,255,.05)}',
    '.rsv-row .nm{flex:1;font-size:12.5px;color:#E2E8F0;min-width:0}',
    '.rsv-row .vv{font-family:"Space Mono",monospace;font-weight:700;font-size:13.5px;color:#F8FAFC;width:30px;text-align:right}',
    '.rsv-row .pc{font-family:"Space Mono",monospace;font-size:9.5px;color:rgba(248,250,252,.55);width:30px;text-align:right}',
    '.rsv-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}',
    '.rsv-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:10px}',
    '.rsv-kpi{background:linear-gradient(145deg,rgba(12,18,38,.97),rgba(8,12,26,.99));border:1px solid rgba(34,211,238,.12);border-radius:16px;padding:12px 12px 0;overflow:hidden;position:relative}',
    'html.day #scr-rstats .rsv-kpi{background:linear-gradient(145deg,rgba(8,14,32,.92),rgba(5,10,22,.95));border-color:rgba(34,211,238,.18)}',
    '.rsv-kpi .k{font-family:"Space Mono",monospace;font-size:8.5px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(248,250,252,.66)}',
    '.rsv-kpi .v{font-family:"Space Mono",monospace;font-size:23px;font-weight:700;line-height:1.25}',
    '.rsv-kpi .s{font-size:9.5px;color:rgba(248,250,252,.62);font-family:"Space Mono",monospace}',
    '.rsv-kpi svg{display:block;width:calc(100% + 24px);margin:6px -12px 0;height:34px}',
    '.rsv-heat{display:flex;flex-direction:column;gap:2.5px}',
    '.rsv-hr{display:flex;align-items:center;gap:1.5px}',
    '.rsv-hr .m{width:26px;flex-shrink:0;font-family:"Space Mono",monospace;font-size:8.5px;color:rgba(248,250,252,.55)}',
    '.rsv-hr i{flex:1;height:11px;border-radius:2.5px;min-width:0;display:block}',
    '.rsv-hr i.ld{outline:1.5px solid #EF4444;outline-offset:-1.5px;box-shadow:0 0 6px rgba(239,68,68,.8)}',
    '.rsv-hr i.na{background:rgba(255,255,255,.04)}',
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
    '.rsv-mapcard{background:radial-gradient(circle at 50% 45%,#0E2338 0%,#0B1427 60%,#0A1222 100%)!important}'
  ].join('\n');
  document.head.appendChild(s);
}

/* ══════════════════════ TU AÑO ══════════════════════ */

/* ctx: { y, meses:['2026-01',…], fin:diasFinos(), ld:longDuty() } */
function anoHTML(ctx){
  css();
  var F = ctx.fin, T = F.total, L = ctx.ld, meses = ctx.meses;
  var total = 0; ORDEN.forEach(function(k){ total += T[k] || 0; });
  if (!total) return '';
  var h = '';

  /* ── 1 · los tres anillos ── */
  var trabajo = (T.vuelo||0) + (T.guardia||0) + (T.formacion||0) + (T.otros||0);
  var libres  = (T.srof||0) + (T.nrof||0) + (T.off||0);
  var pLD     = L.diasVuelo ? L.total / L.diasVuelo : 0;
  var ring = function(r, p, grad, fondo){
    var C = 2 * Math.PI * r;
    return '<circle cx="80" cy="80" r="' + r + '" stroke="' + fondo + '"/>'
         + (p > 0 ? '<circle cx="80" cy="80" r="' + r + '" stroke="url(#' + grad + ')" stroke-dasharray="' + f1(Math.max(C * Math.min(p, 1), 0.1)) + ' ' + f1(C) + '"/>' : '');
  };
  h += '<div class="la-hero-card rsv-card">'
     + '<div class="rs-hlab">Tu año en tres anillos</div>'
     + '<div style="display:flex;gap:14px;align-items:center;position:relative">'
     + '<svg viewBox="0 0 160 160" style="width:150px;height:150px;flex-shrink:0" role="img" aria-label="Anillos: días de trabajo, días libres y long duty">'
     +   '<defs><linearGradient id="rsvB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67E8F9"/><stop offset="1" stop-color="#0891B2"/></linearGradient>'
     +   '<linearGradient id="rsvG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6EE7B7"/><stop offset="1" stop-color="#059669"/></linearGradient>'
     +   '<linearGradient id="rsvR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCA5A5"/><stop offset="1" stop-color="#DC2626"/></linearGradient></defs>'
     +   '<g transform="rotate(-90 80 80)" fill="none" stroke-width="13" stroke-linecap="round">'
     +     ring(70, trabajo / total, 'rsvB', 'rgba(34,211,238,.1)')
     +     ring(53, libres / total, 'rsvG', 'rgba(16,185,129,.1)')
     +     ring(36, pLD, 'rsvR', 'rgba(239,68,68,.12)')
     +   '</g>'
     +   '<text x="80" y="80" text-anchor="middle" fill="#F8FAFC" font-size="22" font-weight="700">' + total + '</text>'
     +   '<text x="80" y="95" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="8.5" letter-spacing="1.2">DÍAS</text>'
     + '</svg>'
     + '<div style="flex:1;display:flex;flex-direction:column;gap:11px;min-width:0">'
     +   '<div><div class="rsv-mut" style="color:#67E8F9;letter-spacing:1px">DÍAS DE TRABAJO</div><div class="rsv-big" style="font-size:22px">' + trabajo + ' <span class="rsv-mut">' + Math.round(trabajo * 100 / total) + '%</span></div></div>'
     +   '<div><div class="rsv-mut" style="color:#6EE7B7;letter-spacing:1px">DÍAS OFF</div><div class="rsv-big" style="font-size:22px">' + libres + ' <span class="rsv-mut">' + Math.round(libres * 100 / total) + '%</span></div></div>'
     +   '<div><div class="rsv-mut" style="color:#FCA5A5;letter-spacing:1px">LONG DUTY</div><div class="rsv-big" style="font-size:22px">' + L.total + ' <span class="rsv-mut">' + Math.round(pLD * 100) + '%</span></div><div class="rsv-mut" style="margin-top:2px">de ' + L.diasVuelo + ' días de vuelo</div></div>'
     + '</div></div>'
     + '<div class="rsv-chips" style="grid-template-columns:repeat(4,minmax(0,1fr))">'
     +   chip(T.guardia || 0, 'Stand-by', '#F59E0B') + chip(T.vacaciones || 0, 'Leave', '#A78BFA') + chip(T.formacion || 0, 'Training', '#94A3B8') + chip(T.baja || 0, 'Sick', '#F472B6')
     + '</div>'
     + '<div class="rs-foot" style="position:relative">sobre ' + total + ' días importados de ' + ctx.y + '. Días de trabajo = vuelo, stand-by, training y otros; OFF = SROF + NROF + OFF.'
     +   ((T.franco || T.otros) ? ' Franco: <b>' + (T.franco || 0) + '</b> · otros: <b>' + (T.otros || 0) + '</b>.' : '') + '</div>'
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
           + '<div class="nm">' + CLASE[k].t + '</div>'
           + (sp ? '<svg viewBox="0 0 78 20" style="width:78px;height:20px" aria-hidden="true"><path d="' + sp + '" fill="none" stroke="' + CLASE[k].c + '" stroke-width="1.6" stroke-linejoin="round"/></svg>' : '')
           + '<div class="vv">' + v + '</div><div class="pc">' + Math.round(v * 100 / total) + '%</div></div>';
  });
  h += card('Reparto del año', 'Tipos de día',
       '<div style="display:flex;justify-content:center;margin:2px 0 6px">'
     + '<svg viewBox="0 0 230 230" style="width:210px;height:210px" role="img" aria-label="Donut con los tipos de día del año">'
     +   '<circle cx="115" cy="115" r="92" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="24"/>'
     +   '<g transform="rotate(-90 115 115)" fill="none" stroke-width="22">' + segs + '</g>'
     +   '<circle cx="115" cy="115" r="72" fill="rgba(8,12,26,.9)" stroke="rgba(34,211,238,.12)"/>'
     +   '<text x="115" y="104" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="9" letter-spacing="1.5">VUELO</text>'
     +   '<text x="115" y="134" text-anchor="middle" fill="#F8FAFC" font-size="32" font-weight="700">' + (T.vuelo || 0) + '</text>'
     +   '<text x="115" y="151" text-anchor="middle" fill="#22D3EE" font-size="10">' + Math.round((T.vuelo || 0) * 100 / total) + '% del año</text>'
     + '</svg></div>'
     + filas
     + '<div class="rs-foot">la línea de cada fila es su tendencia mes a mes en los meses importados.<br>sick = SICK, INC, HOSP o MED · leave = vacaciones (VAC y variantes).</div>');

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
      } else if (!imp){
        bars += '<rect x="' + x + '" y="97" width="17" height="2" rx="1" fill="rgba(255,255,255,.12)"/>';
      }
      bars += '<text x="' + (x + 8.5) + '" y="196" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + MES1[mi] + '</text>';
    }
    h += cardDer('Días OFF · puja', 'Ganados vs asignados',
         '<div class="rsv-big" style="font-size:28px;color:#34D399">' + eff + '%</div><div class="rsv-mut">eficiencia</div>',
         '<svg class="rsv-svg" viewBox="0 0 336 200" role="img" aria-label="SROF arriba y NROF abajo por mes">'
       +   '<defs><linearGradient id="rsvS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6EE7B7"/><stop offset="1" stop-color="#047857"/></linearGradient>'
       +   '<linearGradient id="rsvN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#065F46"/><stop offset="1" stop-color="#A7F3D0"/></linearGradient></defs>'
       +   '<text x="0" y="10" fill="#6EE7B7" font-size="9">▲ SROF · ganados en la puja</text>'
       +   '<text x="0" y="182" fill="rgba(167,243,208,.75)" font-size="9">▼ NROF · no ganados, asignados</text>'
       +   '<line x1="0" y1="98" x2="336" y2="98" stroke="rgba(148,163,184,.3)"/>'
       +   bars
       + '</svg>'
       + '<div class="rsv-chips" style="grid-template-columns:repeat(2,minmax(0,1fr))">'
       +   (mejor ? '<div class="rsv-chip" style="border-color:rgba(52,211,153,.3);background:rgba(16,185,129,.08)"><span style="color:#6EE7B7">MEJOR MES</span><b style="color:#F8FAFC;font-size:14px">' + MES3[mejor.m] + ' · ' + mejor.s + ' de ' + mejor.t + '</b></div>' : '')
       +   (peor ? '<div class="rsv-chip" style="border-color:rgba(148,163,184,.25);background:rgba(148,163,184,.06)"><span style="color:#CBD5E1">PEOR MES</span><b style="color:#F8FAFC;font-size:14px">' + MES3[peor.m] + ' · ' + peor.s + ' de ' + peor.t + '</b></div>' : '')
       + '</div>'
       + '<div class="rs-foot">eficiencia = SROF ÷ (SROF + NROF): de los OFF que pasaron por la puja, cuántos elegiste tú. El resto de OFF (' + (T.off || 0) + ') no entra.<br>una raya gris es un mes que no tienes importado.</div>');
  }

  /* ── 4 · long duty ── */
  h += longDutyHTML(L);

  /* ── 5 · el año día a día ── */
  var largos = {}; L.fechas.forEach(function(d){ largos[d] = 1; });
  var filasH = '';
  for (var m2 = 0; m2 < 12; m2++){
    var mm = ctx.y + '-' + String(m2 + 1).padStart(2, '0');
    var dim = new Date(ctx.y, m2 + 1, 0).getDate();
    var celdas = '';
    for (var d = 1; d <= 31; d++){
      if (d > dim){ celdas += '<i style="background:transparent"></i>'; continue; }
      var ds = mm + '-' + String(d).padStart(2, '0'), c = F.porDia[ds];
      if (!c){ celdas += '<i class="na" title="' + ds + '"></i>'; continue; }
      celdas += '<i' + (largos[ds] ? ' class="ld"' : '') + ' style="background:' + CLASE[c].c + '" title="' + ds + ' · ' + CLASE[c].t
              + (largos[ds] ? ' · long duty ' + hh(L.porDia[ds].min) : '') + '"></i>';
    }
    filasH += '<div class="rsv-hr"><div class="m">' + MES3[m2] + '</div>' + celdas + '</div>';
  }
  var leg = ORDEN.filter(function(k){ return T[k]; }).map(function(k){ return [CLASE[k].c, CLASE[k].t]; });
  leg.push([ROJO, 'long duty', true]);
  h += cardDer('Calendario', 'Tu año de un vistazo', pill(total + ' días', '#67E8F9'),
       '<div class="rsv-heat">' + filasH + '</div>' + leyenda(leg)
     + '<div class="rs-foot">cada casilla es un día; el borde rojo, un long duty. Los huecos oscuros son días que no tienes importados.</div>');

  return h;
}
function chip(v, t, c){
  return '<div class="rsv-chip" style="border-color:' + hex2rgba(c, .3) + ';background:' + hex2rgba(c, .08) + '"><b style="color:' + c + '">' + v + '</b><span style="color:' + c + '">' + t + '</span></div>';
}

function longDutyHTML(L){
  if (!L.diasVuelo) return '';
  var maxH = Math.max.apply(null, L.hist.concat([1]));
  var bw = 336 / L.hist.length, bars = '';
  var idxCorte = L.histCortes.indexOf(L.umbral);
  L.hist.forEach(function(v, i){
    var hgt = v / maxH * 120, x = i * bw + 3;
    var rojo = i >= idxCorte;
    bars += '<rect x="' + f1(x) + '" y="' + f1(150 - hgt) + '" width="' + f1(bw - 6) + '" height="' + f1(Math.max(hgt, v ? 2 : 0)) + '" rx="5" fill="url(#' + (rojo ? 'rsvHR' : 'rsvHB') + ')"/>'
          + (v ? '<text x="' + f1(x + (bw - 6) / 2) + '" y="' + f1(144 - hgt) + '" text-anchor="middle" fill="#E2E8F0" font-size="9.5" font-weight="700">' + v + '</text>' : '')
          + '<text x="' + f1(x + (bw - 6) / 2) + '" y="168" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="8">' + L.histEtq[i] + '</text>';
  });
  var zx = idxCorte * bw;
  var svgH = '<svg class="rsv-svg" viewBox="0 0 336 174" role="img" aria-label="Histograma de la duración de tus duties">'
    + '<defs><linearGradient id="rsvHB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#67E8F9"/><stop offset="1" stop-color="#155E75"/></linearGradient>'
    + '<linearGradient id="rsvHR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F87171"/><stop offset="1" stop-color="#7F1D1D"/></linearGradient>'
    + '<linearGradient id="rsvZ" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#EF4444" stop-opacity=".2"/><stop offset="1" stop-color="#EF4444" stop-opacity=".02"/></linearGradient></defs>'
    + '<rect x="' + f1(zx) + '" y="16" width="' + f1(336 - zx) + '" height="136" fill="url(#rsvZ)"/>'
    + '<line x1="' + f1(zx) + '" y1="12" x2="' + f1(zx) + '" y2="154" stroke="#F87171" stroke-width="1.5" stroke-dasharray="4 3"/>'
    + '<rect x="' + f1(zx - 22) + '" y="0" width="44" height="16" rx="8" fill="#EF4444"/>'
    + '<text x="' + f1(zx) + '" y="11.5" text-anchor="middle" fill="#fff" font-size="9.5" font-weight="700">' + hh(L.umbral) + '</text>'
    + bars + '</svg>';

  /* Los tres más largos, como línea de tiempo: firma → tramos → fin. Escala
     común a los tres para que se puedan comparar a simple vista. */
  var tl = '';
  if (L.top.length){
    var t0 = Infinity, t1 = -Infinity;
    L.top.forEach(function(x){ if (x.inicio != null) t0 = Math.min(t0, x.inicio % 1440); t1 = Math.max(t1, (x.inicio % 1440) + x.min); });
    t0 = Math.floor(t0 / 60) * 60; t1 = Math.ceil(t1 / 60) * 60;
    var span = Math.max(t1 - t0, 60), X = function(t){ return (t - t0) / span * 336; };
    var ticks = '', paso = span > 720 ? 240 : 180;
    for (var t = t0; t <= t1; t += paso){
      var tx = X(t);
      ticks += '<text x="' + f1(Math.min(Math.max(tx, 8), 328)) + '" y="9" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + String(Math.floor(t / 60) % 24).padStart(2, '0') + '</text>'
             + '<line x1="' + f1(tx) + '" y1="13" x2="' + f1(tx) + '" y2="16" stroke="rgba(248,250,252,.3)"/>';
    }
    tl += '<div class="rs-lab" style="margin:14px 0 4px">Tus días más largos</div>'
        + '<svg class="rsv-svg" viewBox="0 0 336 16" aria-hidden="true">' + ticks + '</svg>';
    L.top.forEach(function(x){
      var base = x.inicio == null ? t0 : (x.inicio % 1440), off = base - (x.inicio || 0);
      var ruta = x.legs.length ? x.legs[0].dep + '-' + x.legs.map(function(l){ return l.arr; }).join('-') : '';
      var segs = '';
      x.legs.forEach(function(l){
        segs += '<rect x="' + f1(X(l.ini + off)) + '" y="4" width="' + f1(Math.max(X(l.fin + off) - X(l.ini + off), 2)) + '" height="8" rx="4" fill="' + (l.pos ? '#94A3B8' : '#F87171') + '"/>';
      });
      var dd = x.date.split('-');
      tl += '<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:11.5px;color:#E2E8F0;gap:8px">'
          + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (+dd[2]) + ' ' + MES3[+dd[1] - 1].toLowerCase() + ' · ' + esc(ruta) + '</span>'
          + '<b style="font-family:\'Space Mono\',monospace;color:#F87171">' + hh(x.min) + '</b></div>'
          + '<svg class="rsv-svg" viewBox="0 0 336 16" aria-hidden="true"><rect x="0" y="6" width="336" height="4" rx="2" fill="rgba(255,255,255,.06)"/>'
          + '<rect x="' + f1(X(base)) + '" y="2" width="' + f1(Math.max(X(base + x.min) - X(base), 2)) + '" height="12" rx="6" fill="rgba(239,68,68,.16)" stroke="rgba(239,68,68,.45)"/>'
          + segs + '</svg></div>';
    });
    tl += leyenda([['#F87171', 'vuelo'], ['#94A3B8', 'posicional'], ['rgba(239,68,68,.3)', 'duty']]);
  }

  var porMes = Object.keys(L.porMes).sort();
  var media = porMes.length ? L.total / porMes.length : 0;
  var F = L.fuentes;
  return cardDer('Long duty · más de ' + hh(L.umbral), '¿Cuánto duran tus duties?',
       '<div class="rsv-big" style="font-size:28px;color:#F87171">' + L.total + '</div><div class="rsv-mut">de ' + L.diasVuelo + ' días</div>',
       svgH + tl
     + '<div class="rs-foot">' + (porMes.length >= 3 ? 'Media: <b>' + dec(media) + '</b> long duty al mes. ' : '')
     +   'Sólo días con vuelo.<br>Duty oficial de eCrews en <b>' + F.oficial + '</b> día(s)'
     +   (F['firma-debrief'] ? ', firma → debrief en <b>' + F['firma-debrief'] + '</b>' : '')
     +   (F.calculado ? ' y calculado (firma → último calzo + 20 min) en <b>' + F.calculado + '</b>' : '') + '.</div>');
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
  h += '<div class="rsv-g2">'
     + kpi('Block', horas(tot.block), 'horas de vuelo', '#38BDF8', serie('block'))
     + kpi('Duty', horas(tot.duty), 'en días de vuelo', '#A78BFA', serie('duty'))
     + kpi('Sectores', tot.sect, meses.length ? dec(tot.sect / meses.length) + ' al mes' : '', '#22D3EE', serie('sect'))
     + kpi('Productividad', prod ? Math.round(prod * 100) + '%' : '—', 'block ÷ duty', '#FBBF24', meses.map(function(m){ var o = PM[m] || {}; return o.duty ? o.block / o.duty * 100 : null; }))
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
            + ' data-t="' + MES3[mi] + ' ' + m.slice(0, 4) + '|' + hh(o.duty || 0) + '|' + hh(o.block || 0) + '|' + (o.duty ? dec(o.block / o.duty * 100) + '%' : '—') + '"'
            + ' onclick="RstViz.selMes(this)"/>';
      labs += '<text x="' + f1(X(i)) + '" y="' + (Y0 + Hh + 14) + '" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="9">' + MES1[mi] + '</text>';
    });
    var ob = PM[meses[best]] || {}, mb = +meses[best].slice(5, 7) - 1;
    var pp = meses.map(function(m, i){ var o = PM[m] || {}; return o.duty ? [X(i), o.block / o.duty * 100] : null; }).filter(Boolean);
    var pmn = Math.min.apply(null, pp.map(function(p){ return p[1]; }).concat([100])), pmx = Math.max.apply(null, pp.map(function(p){ return p[1]; }).concat([0]));
    pmn = Math.floor(pmn - 1); pmx = Math.ceil(pmx + 1);
    var PY = function(v){ return 8 + 46 - (v - pmn) / ((pmx - pmn) || 1) * 46; };
    var pl = curva(pp.map(function(p){ return [p[0], PY(p[1])]; }));
    var pdots = pp.map(function(p){ return '<circle cx="' + f1(p[0]) + '" cy="' + f1(PY(p[1])) + '" r="2.6" fill="#0B1220" stroke="#FBBF24" stroke-width="1.6"/>'; }).join('');
    h += cardDer('Mes a mes', 'Duty vs Block',
         leyenda([['#A78BFA', 'duty'], ['#38BDF8', 'block']]).replace('margin-top:8px', 'margin-top:0;justify-content:flex-end'),
         '<div class="rsv-ro" id="rsv-dbro"><b>' + MES3[mb] + ' ' + meses[best].slice(0, 4) + '</b><span style="color:#C4B5FD">duty ' + hh(ob.duty || 0) + '</span><span style="color:#7DD3FC">block ' + hh(ob.block || 0) + '</span><span style="color:#FCD34D">' + (ob.duty ? dec(ob.block / ob.duty * 100) + '%' : '—') + '</span></div>'
       + '<svg class="rsv-svg" viewBox="0 0 336 180" role="img" aria-label="Áreas de duty y block por mes">'
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
       + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:10px"><div class="rs-lab" style="margin:0">Productividad · block ÷ duty</div><div class="rsv-big" style="font-size:14px;color:#FBBF24">' + (prod ? dec(prod * 100) + '%' : '—') + '</div></div>'
       + '<svg class="rsv-svg" viewBox="0 0 336 62" role="img" aria-label="Productividad mensual">'
       +   '<defs><linearGradient id="rsvAP" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBBF24" stop-opacity=".35"/><stop offset="1" stop-color="#FBBF24" stop-opacity="0"/></linearGradient></defs>'
       +   '<text x="0" y="' + f1(PY(pmx) + 3) + '" fill="rgba(251,191,36,.6)" font-size="8.5">' + pmx + '%</text>'
       +   '<text x="0" y="' + f1(PY(pmn) + 3) + '" fill="rgba(251,191,36,.6)" font-size="8.5">' + pmn + '%</text>'
       +   (pp.length > 1 ? '<path d="' + pl + 'L' + f1(pp[pp.length - 1][0]) + ' 58L' + f1(pp[0][0]) + ' 58Z" fill="url(#rsvAP)"/><path d="' + pl + '" fill="none" stroke="#FBBF24" stroke-width="2"/>' : '')
       +   pdots
       + '</svg>'
       + '<div class="rs-foot">toca un mes para leerlo. El hueco entre las dos curvas es duty sin volar: firma, escalas y debrief.<br>'
       +   'Duty de los <b>días de vuelo</b> (oficial de eCrews cuando lo hay): no incluye guardias ni días de tierra, así que no es el «Duty hours» de la tira.</div>');
  }

  /* ── sectores, radial, y lo que dice el logbook ── */
  h += sectoresHTML(ctx);

  /* ── layovers y distancia ── */
  h += mapaHTML(ctx);

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
    wedges += '<text x="' + f1(cx + 136 * Math.cos(am)) + '" y="' + f1(cy + 136 * Math.sin(am) + 3) + '" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + MES1[m] + '</text>';
  }
  var hayLb = op.tramos > 0, pfPct = (op.pf + op.pm) ? Math.round(op.pf * 100 / (op.pf + op.pm)) : 0;
  return card('Operación', 'Sectores, despegues y aterrizajes',
       '<div style="display:flex;justify-content:center"><svg viewBox="0 0 300 300" style="width:100%;max-width:300px;height:auto" role="img" aria-label="Sectores por mes en gráfico radial">'
     +   '<defs><radialGradient id="rsvPF" cx="150" cy="150" r="120" gradientUnits="userSpaceOnUse"><stop offset=".38" stop-color="#0E7490"/><stop offset="1" stop-color="#67E8F9"/></radialGradient>'
     +   '<radialGradient id="rsvPM" cx="150" cy="150" r="120" gradientUnits="userSpaceOnUse"><stop offset=".4" stop-color="#5B21B6"/><stop offset="1" stop-color="#C4B5FD"/></radialGradient></defs>'
     +   '<circle cx="150" cy="150" r="118" fill="none" stroke="rgba(148,163,184,.14)" stroke-dasharray="2 5"/>'
     +   '<circle cx="150" cy="150" r="82" fill="none" stroke="rgba(148,163,184,.14)" stroke-dasharray="2 5"/>'
     +   wedges
     +   '<circle cx="150" cy="150" r="42" fill="rgba(8,12,26,.95)" stroke="rgba(34,211,238,.18)"/>'
     +   '<text x="150" y="151" text-anchor="middle" fill="#F8FAFC" font-size="22" font-weight="700">' + tot + '</text>'
     +   '<text x="150" y="165" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="8" letter-spacing="1.2">SECTORES</text>'
     + '</svg></div>'
     + (hayLb
       ? '<div class="rsv-chips">'
         + chip(op.to, 'Despegues', '#22D3EE') + chip(op.ldg, 'Aterrizajes', '#22D3EE') + chip(op.ldgNoche, 'De noche', '#A78BFA')
         + '</div>'
         + '<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-top:12px"><div style="width:' + pfPct + '%;background:linear-gradient(90deg,#0E7490,#67E8F9)"></div><div style="flex:1;background:linear-gradient(90deg,#C4B5FD,#5B21B6)"></div></div>'
         + '<div style="display:flex;justify-content:space-between;margin-top:5px" class="rsv-mut"><span>PF ' + op.pf + ' · ' + pfPct + '%</span><span>PM ' + op.pm + ' · ' + (100 - pfPct) + '%</span></div>'
         + leyenda([['#22D3EE', 'PF (por dentro)'], ['#A78BFA', 'PM (por fuera)']])
       : '<div class="rs-cover" style="margin-top:12px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2.2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>'
         + '<div><b>Despegues y aterrizajes salen del logbook</b><span>El roster no sabe quién vuela cada tramo. Pasa los vuelos de ' + y + ' al logbook y aquí aparecen PF, PM, despegues y aterrizajes.</span></div></div>')
     + '<div class="rs-foot">sectores del roster sin posicionales; la longitud de cada gajo es el mes. Un gajo a ras es un mes que no tienes importado.'
     + (hayLb ? '<br>despegues, aterrizajes y PF/PM: tu logbook (' + op.tramos + ' tramos de ' + y + ').' : '') + '</div>');
}

function mapaHTML(ctx){
  var rt = ctx.rt;
  if (!rt.sectores || !ctx.baseC) return '';
  var base = ctx.base, pts = [[ctx.baseC.lon, ctx.baseC.lat]];
  Object.keys(rt.apts).forEach(function(k){ pts.push([rt.apts[k].lon, rt.apts[k].lat]); });
  var lat0 = pts.reduce(function(s, p){ return s + p[1]; }, 0) / pts.length;
  var k0 = Math.cos(lat0 * Math.PI / 180);
  var P = function(lon, lat){ return [lon * k0, -lat]; };
  var xs = pts.map(function(p){ return P(p[0], p[1])[0]; }), ys = pts.map(function(p){ return P(p[0], p[1])[1]; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var minSpan = 9;
  if (x1 - x0 < minSpan){ var cxm = (x0 + x1) / 2; x0 = cxm - minSpan / 2; x1 = cxm + minSpan / 2; }
  if (y1 - y0 < minSpan * .7){ var cym = (y0 + y1) / 2; y0 = cym - minSpan * .35; y1 = cym + minSpan * .35; }
  var padX = (x1 - x0) * .14, padY = (y1 - y0) * .16;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  var W = 336, H = 280, sc = Math.min(W / (x1 - x0), H / (y1 - y0));
  var ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  var S = function(lon, lat){ var p = P(lon, lat); return [ox + (p[0] - x0) * sc, oy + (p[1] - y0) * sc]; };

  /* Tierra: la costa 1:50m del mapa del logbook (`LDM.LANDS`). Sólo los anillos
     que tocan la ventana: el resto del Mediterráneo no hace falta pintarlo. */
  var tierra = '';
  (ctx.lands || []).forEach(function(ring){
    var dentro = false, d = '';
    for (var i = 0; i < ring.length; i++){
      var q = S(ring[i][0], ring[i][1]);
      if (q[0] > -40 && q[0] < W + 40 && q[1] > -40 && q[1] < H + 40) dentro = true;
      d += (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]);
    }
    if (dentro) tierra += '<path d="' + d + 'Z"/>';
  });

  var B = S(ctx.baseC.lon, ctx.baseC.lat), maxN = rt.pares.length ? rt.pares[0].n : 1;
  var arcos = '', flujo = '';
  rt.pares.forEach(function(p){
    var A = rt.apts[p.a], Bb = rt.apts[p.b]; if (!A || !Bb) return;
    var a = S(A.lon, A.lat), b = S(Bb.lon, Bb.lat);
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    var bend = Math.min(len * .2, 30);
    var c = [(a[0] + b[0]) / 2 + dy / len * bend, (a[1] + b[1]) / 2 - dx / len * bend];
    var d = 'M' + f1(a[0]) + ' ' + f1(a[1]) + 'Q' + f1(c[0]) + ' ' + f1(c[1]) + ' ' + f1(b[0]) + ' ' + f1(b[1]);
    var w = 0.8 + 3.2 * p.n / maxN;
    arcos += '<path d="' + d + '" fill="none" stroke="url(#rsvArc)" stroke-width="' + f1(w) + '" stroke-opacity="' + f1(.35 + .6 * p.n / maxN) + '" stroke-linecap="round"/>';
    if (p.n / maxN > .25) flujo += '<path d="' + d + '" fill="none" stroke="#F8FAFC" stroke-opacity=".55" stroke-width="1.1" stroke-dasharray="2 8" class="rsv-flow"/>';
  });

  var noches = ctx.noches || {}, mxN = 1;
  Object.keys(noches).forEach(function(k){ mxN = Math.max(mxN, noches[k]); });
  var puntos = '', etiquetas = '', cajas = [];
  var B0 = S(ctx.baseC.lon, ctx.baseC.lat);
  cajas.push([B0[0] - 16, B0[1] - 26, B0[0] + 16, B0[1] - 14]);
  var libre = function(c){
    for (var i = 0; i < cajas.length; i++){ var o = cajas[i]; if (c[0] < o[2] && c[2] > o[0] && c[1] < o[3] && c[3] > o[1]) return false; }
    return true;
  };
  Object.keys(rt.apts).forEach(function(k){
    if (root.pilotosMismoApt ? root.pilotosMismoApt(k, base) : k === base) return;
    var q = S(rt.apts[k].lon, rt.apts[k].lat), n = nochesDe(noches, k);
    var col = n ? '#A78BFA' : '#22D3EE', r = n ? 3.6 + 3 * n / mxN : 2.4;
    puntos += '<circle cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="' + f1(r + 5) + '" fill="' + col + '" fill-opacity=".16"/>'
            + '<circle cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="' + f1(r) + '" fill="' + col + '"/>';
    /* Etiquetas sin pisarse: se prueba a la derecha, a la izquierda, arriba y
       abajo, y si no cabe en ninguna se queda sólo el punto. */
    var w = String(k).length * 6.2 + 2, intentos = [[8, 3.5, 'start'], [-8, 3.5, 'end'], [0, -9, 'middle'], [0, 15, 'middle']];
    if (q[0] > W - 40) intentos = [intentos[1], intentos[0], intentos[2], intentos[3]];
    for (var ii = 0; ii < intentos.length; ii++){
      var it = intentos[ii], tx = q[0] + it[0], ty = q[1] + it[1];
      var x0c = it[2] === 'start' ? tx : (it[2] === 'end' ? tx - w : tx - w / 2);
      var caja = [x0c, ty - 8, x0c + w, ty + 2];
      if (!libre(caja)) continue;
      cajas.push(caja);
      etiquetas += '<text x="' + f1(tx) + '" y="' + f1(ty) + '" text-anchor="' + it[2] + '" fill="' + (n ? '#DDD6FE' : 'rgba(165,243,252,.75)') + '" font-size="9" font-weight="700">' + esc(k) + '</text>';
      break;
    }
  });

  var lista = Object.keys(noches).map(function(k){ return { k: k, n: noches[k] }; }).sort(function(a, b){ return b.n - a.n; });
  var totN = lista.reduce(function(s, x){ return s + x.n; }, 0);
  var filas = lista.slice(0, 5).map(function(x){
    var C = ctx.coords ? ctx.coords(x.k) : null;
    var km = C ? Math.round(RstStats.gcKm(ctx.baseC, C)) : null;
    return '<div class="rsv-row"><div style="width:38px;font-family:\'Space Mono\',monospace;font-weight:700;font-size:12.5px;color:#C4B5FD">' + esc(x.k) + '</div>'
         + '<div style="flex:1;min-width:0"><div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden"><div style="width:' + Math.round(x.n * 100 / lista[0].n) + '%;height:6px;border-radius:3px;background:linear-gradient(90deg,#22D3EE,#A78BFA)"></div></div>'
         + (km != null ? '<div class="rsv-mut" style="margin-top:3px">' + miles(km) + ' km de ' + esc(base) + '</div>' : '') + '</div>'
         + '<div class="vv" style="width:44px">' + x.n + '<span class="rsv-mut"> n</span></div></div>';
  }).join('');

  return cardDer('Red de rutas desde ' + esc(base), 'Layovers y distancia',
       '<div class="rsv-big" style="font-size:19px;color:#67E8F9">' + miles(rt.km) + '</div><div class="rsv-mut">km volados</div>',
       '<svg class="rsv-svg" viewBox="0 0 336 280" style="border-radius:14px;background:rgba(3,8,18,.55)" role="img" aria-label="Mapa de rutas y layovers del año">'
     +   '<defs><linearGradient id="rsvArc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset="1" stop-color="#A78BFA"/></linearGradient>'
     +   '<radialGradient id="rsvGlow" cx="' + f1(B[0]) + '" cy="' + f1(B[1]) + '" r="190" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22D3EE" stop-opacity=".14"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient>'
     +   '<clipPath id="rsvClip"><rect x="0" y="0" width="336" height="280" rx="14"/></clipPath></defs>'
     +   '<g clip-path="url(#rsvClip)"><rect x="0" y="0" width="336" height="280" fill="url(#rsvGlow)"/>'
     +   '<g fill="rgba(34,211,238,.07)" stroke="rgba(103,232,249,.32)" stroke-width=".6" stroke-linejoin="round">' + tierra + '</g>'
     +   arcos + flujo + puntos + etiquetas
     +   '<circle cx="' + f1(B[0]) + '" cy="' + f1(B[1]) + '" r="7" fill="#FBBF24" fill-opacity=".45" class="rsv-ping"/>'
     +   '<circle cx="' + f1(B[0]) + '" cy="' + f1(B[1]) + '" r="6" fill="#FBBF24" stroke="#070D19" stroke-width="2"/>'
     +   '<text x="' + f1(B[0]) + '" y="' + f1(B[1] - 15) + '" text-anchor="middle" fill="#FBBF24" font-size="10" font-weight="700">' + esc(base) + '</text></g>'
     + '</svg>'
     + leyenda([['#A78BFA', 'con noche fuera'], ['#22D3EE', 'ida y vuelta'], ['#FBBF24', 'tu base']])
     + (lista.length ? '<div class="rs-lab" style="margin:14px 0 4px">Top layovers · ' + totN + ' noche(s) fuera</div>' + filas
                     : '<div class="rs-sub" style="margin-top:10px">Ninguna noche fuera de base en lo importado.</div>')
     + '<div class="rs-foot">' + rt.sectores + ' sectores sin posicionales, distancia ortodrómica entre aeropuertos.'
     + (rt.sinCoords ? '<br><b>' + rt.sinCoords + '</b> sector(es) sin coordenadas: no suman km.' : '')
     + '<br>noches fuera = las mismas lunas del calendario, contadas donde duermes.</div>',
       'rsv-mapcard');
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
          + '<text x="' + f1(x + bw / 2) + '" y="90" text-anchor="middle" fill="rgba(248,250,252,.5)" font-size="9">' + MES1[+m.slice(5, 7) - 1] + '</text>';
  });
  var porHora = rt.bloqueMin ? rt.uSv / (rt.bloqueMin / 60) : 0;
  var nivel = mSv < 1 ? ['Bajo', '#34D399'] : (mSv < 6 ? ['Moderado', '#FBBF24'] : ['Alto', '#F87171']);
  return cardDer('Estimación · exposición', 'Radiación cósmica', pill(nivel[0], nivel[1]),
       '<div style="display:flex;justify-content:center"><svg viewBox="-14 0 288 150" style="width:100%;max-width:300px;height:auto" role="img" aria-label="Indicador de dosis anual estimada">'
     +   '<defs><linearGradient id="rsvRad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#34D399"/><stop offset=".45" stop-color="#FBBF24"/><stop offset="1" stop-color="#EF4444"/></linearGradient></defs>'
     +   '<path d="M30 135 A100 100 0 0 1 230 135" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="18" stroke-linecap="round"/>'
     +   '<path d="M30 135 A100 100 0 0 1 230 135" fill="none" stroke="url(#rsvRad)" stroke-opacity=".25" stroke-width="18" stroke-linecap="round"/>'
     +   '<path d="M30 135 A100 100 0 0 1 230 135" fill="none" stroke="url(#rsvRad)" stroke-width="18" stroke-linecap="round" pathLength="100" stroke-dasharray="' + f1(Math.max(frac * 100, .5)) + ' 100"/>'
     +   ticks
     +   '<circle cx="' + f1(130 + 100 * Math.cos(na)) + '" cy="' + f1(135 + 100 * Math.sin(na)) + '" r="13" fill="#F8FAFC" fill-opacity=".18"/>'
     +   '<circle cx="' + f1(130 + 100 * Math.cos(na)) + '" cy="' + f1(135 + 100 * Math.sin(na)) + '" r="7.5" fill="#F8FAFC" stroke="#070D19" stroke-width="2.5"/>'
     +   '<text x="130" y="112" text-anchor="middle" fill="#F8FAFC" font-size="34" font-weight="700">' + dec(mSv, 2) + '</text>'
     +   '<text x="130" y="132" text-anchor="middle" fill="rgba(248,250,252,.6)" font-size="10">mSv estimados · ' + ctx.y + '</text>'
     + '</svg></div>'
     + '<svg class="rsv-svg" viewBox="0 0 336 94" role="img" aria-label="Dosis estimada por mes en microsievert">'
     +   '<defs><linearGradient id="rsvMu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C4B5FD"/><stop offset="1" stop-color="#4C1D95"/></linearGradient></defs>'
     +   bars + '</svg>'
     + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">'
     +   pill('≈ ' + Math.round(mSv / 2.4 * 100) + '% de la dosis natural media de un año', '#C4B5FD')
     +   pill('≈ ' + dec(porHora, 1) + ' µSv por hora de block', '#C4B5FD')
     + '</div>'
     + '<div class="rs-foot"><b>estimación orientativa</b>: tasa por hora de block según la latitud media de cada tramo (más alta hacia el norte). No modela el ciclo solar ni tu nivel de vuelo real.<br>'
     +   'La dosis oficial es la que registra la compañía. Referencias: 1 mSv/año (público) y 6 mSv/año (categoría A, Directiva 2013/59/Euratom). Barras en µSv.</div>');
}

function lunaHTML(ctx){
  var R = ctx.rtCarrera;
  if (!R || !R.km) return '';
  var viajes = R.km / LUNA_KM, entero = Math.floor(viajes), frac = viajes - entero;
  var faltan = Math.round(LUNA_KM - (R.km % LUNA_KM));
  var q = function(t){ var u = 1 - t; return [u*u*78 + 2*u*t*160 + t*t*268, u*u*168 + 2*u*t*10 + t*t*58]; };
  var p = q(frac), dx = 2*(1-frac)*82 + 2*frac*108, dy = 2*(1-frac)*(-158) + 2*frac*48;
  var ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  var est = '', sd = 7;
  for (var i = 0; i < 46; i++){
    sd = (sd * 9301 + 49297) % 233280; var a = sd / 233280;
    sd = (sd * 9301 + 49297) % 233280; var b = sd / 233280;
    est += '<circle cx="' + f1(a * 336) + '" cy="' + f1(b * 205) + '" r="' + (0.4 + (i % 4) * 0.35).toFixed(2) + '" fill="#F8FAFC" fill-opacity="' + (0.25 + (i % 5) * 0.15).toFixed(2) + '"' + (i % 3 ? '' : ' class="rsv-tw"') + '/>';
  }
  var lunas = '';
  for (var l = 0; l < Math.min(entero, 8); l++)
    lunas += '<svg viewBox="0 0 20 20" style="width:18px;height:18px" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="url(#rsvMoon)"/></svg>';
  var dc = ctx.desdeCarrera ? MES3[+ctx.desdeCarrera.slice(5, 7) - 1].toLowerCase() + ' ' + ctx.desdeCarrera.slice(0, 4) : '';
  return cardDer('Todo tu roster', 'Trip to the Moon', pill('Luna ×' + entero, '#DDD6FE'),
       '<svg class="rsv-svg" viewBox="0 0 336 220" role="img" aria-label="Trayectoria de la Tierra a la Luna con tu progreso">'
     +   '<defs><radialGradient id="rsvEarth" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#7DD3FC"/><stop offset=".5" stop-color="#1D4ED8"/><stop offset="1" stop-color="#0B1B4A"/></radialGradient>'
     +   '<radialGradient id="rsvMoon" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#F5F3FF"/><stop offset=".6" stop-color="#A8A3C4"/><stop offset="1" stop-color="#4B4766"/></radialGradient>'
     +   '<radialGradient id="rsvAtm" cx="50%" cy="50%" r="50%"><stop offset=".7" stop-color="#38BDF8" stop-opacity=".45"/><stop offset="1" stop-color="#38BDF8" stop-opacity="0"/></radialGradient>'
     +   '<linearGradient id="rsvTraj" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#C4B5FD"/></linearGradient></defs>'
     +   est
     +   '<path d="M78 168 Q 160 10 268 58" fill="none" stroke="rgba(196,181,253,.3)" stroke-width="2" stroke-dasharray="3 6"/>'
     +   '<path d="M78 168 Q 160 10 268 58" fill="none" stroke="url(#rsvTraj)" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="' + f1(Math.max(frac * 100, .5)) + ' 100"/>'
     +   '<circle cx="50" cy="178" r="40" fill="url(#rsvAtm)"/><circle cx="50" cy="178" r="30" fill="url(#rsvEarth)"/>'
     +   '<path d="M34 168q6-6 12-2q4 4 10 2q2 6-6 8q-8 0-10 6q-6-4-6-14z" fill="#22C55E" fill-opacity=".55"/>'
     +   '<circle cx="286" cy="48" r="27" fill="#C4B5FD" fill-opacity=".12"/><circle cx="286" cy="48" r="20" fill="url(#rsvMoon)"/>'
     +   '<circle cx="280" cy="42" r="3.5" fill="#6B6690" fill-opacity=".6"/><circle cx="292" cy="54" r="5" fill="#6B6690" fill-opacity=".5"/><circle cx="291" cy="38" r="2" fill="#6B6690" fill-opacity=".6"/>'
     +   '<g transform="translate(' + f1(p[0]) + ' ' + f1(p[1]) + ') rotate(' + f1(ang) + ')"><circle r="11" fill="#38BDF8" fill-opacity=".22"/>'
     +   '<path d="M0 -8L1.6 -2L8 1.5L8 3L1.6 1.6L1.2 6L3.4 7.6L3.4 8.8L0 8L-3.4 8.8L-3.4 7.6L-1.2 6L-1.6 1.6L-8 3L-8 1.5L-1.6 -2Z" fill="#fff"/></g>'
     +   '<text x="50" y="217" text-anchor="middle" fill="rgba(248,250,252,.55)" font-size="9">TIERRA</text>'
     +   '<text x="286" y="88" text-anchor="middle" fill="#C4B5FD" font-size="9">384.400 km</text>'
     + '</svg>'
     + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><div class="rsv-big" style="font-size:36px;background:linear-gradient(90deg,#7DD3FC,#C4B5FD);-webkit-background-clip:text;background-clip:text;color:transparent">' + dec(viajes, 2) + '</div>'
     +   '<div style="font-size:13px;color:#C4B5FD">viajes a la Luna</div><div style="margin-left:auto;display:flex;gap:3px">' + lunas + '</div></div>'
     + '<div class="rsv-chips">'
     +   chip(miles(R.km), 'km totales', '#7DD3FC') + chip(dec(R.km / ECUADOR_KM, 1), 'vueltas al ecuador', '#C4B5FD') + chip(miles(faltan), 'km restantes', '#DDD6FE')
     + '</div>'
     + '<div class="rs-foot">todo el roster importado' + (dc ? ' (desde ' + dc + ')' : '') + ', ' + miles(R.sectores) + ' sectores sin posicionales. Distancia ortodrómica: la que vuelas es algo mayor.</div>',
       'rsv-space');
}

function recordsHTML(ctx){
  var L = ctx.ld, rt = ctx.rt, PM = ctx.porMes, r = [];
  if (L.top.length){ var t = L.top[0], d = t.date.split('-'); r.push(['Duty más largo', hh(t.min), (+d[2]) + ' ' + MES3[+d[1] - 1].toLowerCase(), '#F87171', 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z']); }
  if (rt.maxKm) r.push(['Sector más largo', miles(rt.maxKm.km) + ' km', rt.maxKm.dep + '–' + rt.maxKm.arr, '#38BDF8', 'M2 16l20-8-8 12-2-6-10 2z']);
  var mm = null; Object.keys(PM).forEach(function(m){ if (!mm || (PM[m].sect || 0) > (PM[mm].sect || 0)) mm = m; });
  if (mm && PM[mm].sect) r.push(['Mes con más sectores', String(PM[mm].sect), MES3[+mm.slice(5, 7) - 1].toLowerCase() + ' ' + mm.slice(0, 4), '#22D3EE', 'M3 20h18M6 16V9M11 16V5M16 16v-6M21 16v-3']);
  var fav = null, cnt = {};
  rt.pares.forEach(function(p){ [p.a, p.b].forEach(function(k){
    if (root.pilotosMismoApt ? root.pilotosMismoApt(k, ctx.base) : k === ctx.base) return;
    cnt[k] = (cnt[k] || 0) + p.n; if (!fav || cnt[k] > cnt[fav]) fav = k; }); });
  if (fav) r.push(['Destino favorito', fav, cnt[fav] + ' sectores', '#C4B5FD', 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z']);
  if (!r.length) return '';
  return card('Hall of fame · ' + ctx.y, 'Récords del año',
       '<div class="rsv-g2" style="margin:0">' + r.map(function(x){
         return '<div style="border-radius:14px;padding:11px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(160deg,' + hex2rgba(x[3], .16) + ',rgba(8,12,26,.6) 70%)">'
              + '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="' + x[3] + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + x[4] + '"/></svg>'
              + '<div class="rsv-mut" style="margin-top:6px">' + x[0] + '</div>'
              + '<div class="rsv-big" style="font-size:18px;color:' + x[3] + ';margin-top:3px">' + esc(x[1]) + '</div>'
              + '<div class="rsv-mut" style="margin-top:3px;opacity:.8">' + esc(x[2]) + '</div></div>';
       }).join('') + '</div>');
}

var API = { anoHTML: anoHTML, vueloHTML: vueloHTML, selMes: selMes, longDutyHTML: longDutyHTML, CLASE: CLASE };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
else root.RstViz = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
