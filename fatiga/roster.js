(function () {
'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   FATIGA — adaptador del roster al motor (public/fatiga/motor.js)
   Antes vivía dentro de index.html; se mudó aquí para que todo lo de Fatiga
   esté en su carpeta. Usa del roster sólo lo que está exportado a window:
   RST, rstBaseEfectiva, rstDiasFuera, RstStats, RstCambios y NGasto, y todo
   en el momento de calcular (no al cargar), así que el orden de carga da igual.
   ══════════════════════════════════════════════════════════════════════════
   UNA sola puerta: la usan la ficha del día, SkyView y ARIA. Antes cada una
   tenía su «fatiga» y la de ARIA era un 62/100 FIJO para todo el mundo.
   - Las horas son las VIGENTES (A → E → programada, RstStats.volado), y las
     jornadas salen de RstCambios.jornadas: el orden de los tramos y la firma
     que no es de ese día ya están resueltos ahí, no se escribe una cuarta copia.
   - Cuentan los días de vuelo y de formación; libres, guardias en casa y
     vacaciones no son jornada (el piloto duerme en casa).
   - El huso es el de la BASE del piloto: el reloj del cuerpo de un piloto de
     corto radio es el de su casa.
   Devuelve null si no hay roster o falta un módulo: nunca un nivel inventado. */
var _fatCache = { firma: null, res: null };
function _fatTz(){
  var b = '';
  try { b = String(window.rstBaseEfectiva().base || '').toUpperCase(); } catch(e){}
  if (/^GC[A-Z]{2}$/.test(b)) return 'Atlantic/Canary';
  if (b.length === 4) return 'Europe/Madrid';
  try { if (window.NGasto && NGasto.tzFor) return NGasto.tzFor(b); } catch(e){}
  return 'Europe/Madrid';
}
function _fatFirma(es, tz){
  var h = 0;
  for (var i = 0; i < es.length; i++){
    var e = es[i] || {};
    var s = [e.date, e.type, e.code, e.dep, e.arr, e.std, e.sta, e.std_scheduled, e.sta_scheduled,
             e.std_estimated, e.sta_estimated, e.std_actual, e.sta_actual, e.checkin].join('|');
    for (var k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) | 0;
  }
  return es.length + ':' + h + ':' + tz;
}
function pilotosFatiga(){
  try {
    if (!window.FatigaMotor || !window.RstStats || !window.RstCambios || !window.NGasto) return null;
    var es = (window.RST && RST.entries) || [];
    if (!es.length) return null;
    // El perfil de sueño del piloto (perfil.js) entra en el cálculo, así que entra en la clave.
    var perfil = window.FatigaPerfil ? FatigaPerfil.actual() : null;
    var tz = _fatTz(), firma = _fatFirma(es, tz) + ':' + JSON.stringify(perfil);
    if (_fatCache.firma === firma) return _fatCache.res;
    var dias = RstCambios.jornadas(RstStats.volado(es));
    var base = window.rstBaseEfectiva().base, fueraMes = {};
    var jor = [];
    Object.keys(dias).forEach(function(k){
      var d = dias[k];
      if (d.inicio == null || d.fin == null || d.fin - d.inicio > 16 * 60) return;
      var clase = RstStats.claseDia(d);
      if (clase !== 'vuelo' && clase !== 'formacion') return;
      var t0 = Date.parse(k + 'T00:00:00Z'), a = d.inicio;
      var ater = d.vuelos.filter(function(v){ return v.sta != null; }).map(function(v){
        return { ms: t0 + (a + ((((v.sta - a) % 1440) + 1440) % 1440)) * 60000,
                 sal: v.std != null ? t0 + (a + ((((v.std - a) % 1440) + 1440) % 1440)) * 60000 : null,
                 pos: String(v.dep || '').charAt(0) === '*',
                 dep: String(v.dep || '').replace(/^\*/, ''), arr: String(v.arr || '') };
      });
      var ym = k.slice(0, 7);
      if (!(ym in fueraMes)){
        try { fueraMes[ym] = window.rstDiasFuera(+k.slice(0, 4), (+k.slice(5, 7)) - 1, base) || {}; }
        catch(e){ fueraMes[ym] = {}; }
      }
      jor.push({ fecha: k, inicio: t0 + a * 60000, fin: t0 + d.fin * 60000, aterrizajes: ater,
                 sectores: ater.filter(function(x){ return !x.pos; }).length, fuera: !!fueraMes[ym][k] });
    });
    var res = FatigaMotor.calcula({ jornadas: jor, offset: function(ms){ return NGasto.tzOffsetMin(ms, tz); }, perfil: perfil });
    res.tz = tz;
    _fatCache = { firma: firma, res: res };
    return res;
  } catch(e){ try { console.warn('[fatiga]', e); } catch(_){} return null; }
}
window.pilotosFatiga = pilotosFatiga;
/* La fatiga de UN día, o null si ese día no es jornada o no hay roster. */
window.pilotosFatigaDia = function(fecha){
  var r = pilotosFatiga();
  return (r && r.porFecha && r.porFecha[String(fecha || '').slice(0, 10)]) || null;
};
/* Lo que se le dice al piloto y a ARIA, desde un solo sitio. */
var FAT_NIVEL_TXT = { bajo: 'Baja', moderado: 'Moderada', alto: 'Alta' };
function pilotosFatigaHora(ms, tz){
  try {
    var o = NGasto.utcToLocal(ms, tz || _fatTz());
    return String(Math.floor(o.min / 60)).padStart(2, '0') + ':' + String(o.min % 60).padStart(2, '0');
  } catch(e){ return ''; }
}
function pilotosFatigaMotivos(r){
  var hm = function(m){ m = Math.round(m); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
  var hl = function(h){ return String(Math.floor(h / 60)).padStart(2, '0') + ':' + String(Math.round(h % 60)).padStart(2, '0'); };
  return (r && r.factores || []).map(function(f){
    switch (f.k){
      case 'firma_wocl': return 'Firma a las ' + hl(f.h) + ', antes de las 05:00';
      case 'madrugada': return 'Madrugada: firma a las ' + hl(f.h);
      case 'madrugadas_seguidas': return f.n + 'ª madrugada seguida';
      case 'tarde': return 'Último aterrizaje a las ' + hl(f.h);
      case 'wocl': return 'Vuelas entre las 02:00 y las 06:00 de tu reloj';
      case 'poco_sueno': return 'Sueño posible antes de firmar: ' + hm(f.min);
      case 'sectores': return f.n + ' sectores';
      case 'despierto': return hm(f.min) + ' despierto al último aterrizaje';
      case 'deuda': return 'Deuda de sueño de 3 días: ' + hm(f.min);
      default: return '';
    }
  }).filter(Boolean);
}
window.pilotosFatigaMotivos = pilotosFatigaMotivos;
window.pilotosFatigaHora = pilotosFatigaHora;
/* La tarjeta de la ficha del día. Vacía si ese día no es jornada: no se pinta
   un nivel para un día libre. */
var FAT_NIVEL_EN = { bajo: 'Low', moderado: 'Moderate', alto: 'High' };
function rstFatigaCardHTML(fecha, titulo, tituloEn){
  var f = window.pilotosFatigaDia ? window.pilotosFatigaDia(fecha) : null;
  if (!f) return '';
  var esc = function(t){ return String(t).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var hm = function(m){ return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); };
  var mot = pilotosFatigaMotivos(f);
  var kssTxt = String(f.kss).replace('.', ',');
  return '<div class="rst-fat n-' + f.nivel + '" data-fatiga="' + f.nivel + '">'
    + '<div class="rst-fat-h"><span class="rst-fat-t" data-i18n-en="' + esc(tituloEn || 'Forecast fatigue') + '">' + esc(titulo || 'Fatiga prevista') + '</span><span class="rst-fat-k">KSS ' + kssTxt + '</span></div>'
    + '<div class="rst-fat-n" data-i18n-en="' + FAT_NIVEL_EN[f.nivel] + '">' + esc(FAT_NIVEL_TXT[f.nivel] || f.nivel) + '</div>'
    + '<div class="rst-fat-l">Aterrizaje más crítico: ' + pilotosFatigaHora(f.peor.ms) + ' (hora de tu base)</div>'
    + '<div class="rst-fat-l">Sueño posible antes de firmar: ' + hm(f.sueno) + '</div>'
    + (mot.length ? '<ul>' + mot.map(function(m){ return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '')
    + (f.ajusteDeuda ? '<div class="rst-fat-l">Sube un nivel por la deuda de sueño acumulada.</div>' : '')
    + '<div class="rst-fat-pie">Estimación desde tu roster con un modelo de fatiga de población media. Orientativo: la decisión es del comandante (ORO.FTL.105).</div>'
    + '</div>';
}
window.rstFatigaCardHTML = rstFatigaCardHTML;
/* La pantalla de Fatiga la pinta public/fatiga/pantalla.js (instrumento, reloj, semana y
   check antes de firmar). Este nombre se conserva porque lo llama goTo(). */
window.ftRosterPinta = function(){ try { if (window.FatigaUI) window.FatigaUI.render(); } catch(e){ console.warn('[fatiga] render', e); } };
window.FAT_NIVEL_TXT = FAT_NIVEL_TXT;
})();
