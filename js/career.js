/* ══════════════════════════════════════════════════════════════════════════
   CAREER TRACKER — progresión de nivel según el IV Convenio Vueling (SEPLA)

   Fuente, leída de convenio_chunks (14-oct-2026):
   · Art. 4.5  — niveles de cada especialidad (de menor a mayor).
   · Art. 4.8  — «la promoción por cambio de nivel … se producirá AUTOMÁTICAMENTE
                 cuando se cumplan las TRES condiciones»: (1) permanencia en el
                 nivel, (2) ≥80 % de la media de horas de su flota y base,
                 (3) aptitud técnica habitual. Efectos desde el 29-oct-2024.
   · Art. 4.11 — nivel de entrada de los copilotos por horas FACTORIZADAS (HF) y
                 «su progresión será por tiempo O por horas factorizadas».
   · Disposición transitoria — los contratados ANTES de la firma siguen con la
                 permanencia del III Convenio (tabla pendiente: ver TRANSITORIA).
   · Art. 4.3 (prueba 6 meses) · 4.9 (PICUS con 1 año) · 2.1 (ATPL a 3.000 HF)
     · 15.17 (Loyalty Bonus a los 15 años).

   La app sólo puede comprobar la condición (1). La (2) necesita la media de
   horas de flota y base, que no publica nadie, y la (3) la decide la compañía:
   la pantalla lo DICE en vez de afirmar un ascenso que no sabe.

   Motor PURO (`CareerMotor.calcula`, el reloj por parámetro) + pantalla.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── Art. 4.8, tabla de permanencia (años · horas factorizadas) ───────────
     La tabla del texto llega aplanada («1C Indefinida 1B Indefinida 1B 6 1A 3 …»)
     y se lee por PAREJAS, una columna por especialidad. El extractor dejó la
     lectura escrita al final del trozo y coincide con ésta. `null` = indefinida. */
  var PERMANENCIA_IV = {
    cop: { '6': { anos: 2, hf: 1600 }, '5': { anos: 3, hf: 3800 }, '4': { anos: 3 }, '3': { anos: 3 },
           '2': { anos: 3 }, '1': { anos: 3 }, '1A': { anos: 3 }, '1B': null },
    cmd: { '4': { anos: 3 }, '3': { anos: 3 }, '2': { anos: 3 }, '1': { anos: 2 },
           '1A': { anos: 6 }, '1B': { anos: 6 }, '1C': null }
  };
  // Art. 4.5: de MENOR a MAYOR nivel y retribución.
  var ORDEN = { cop: ['6', '5', '4', '3', '2', '1', '1A', '1B'], cmd: ['4', '3', '2', '1', '1A', '1B', '1C'] };

  /* Disposición transitoria. Los pilotos con contrato en vigor A LA FIRMA del IV
     Convenio siguen con la permanencia del III. Falta la fecha de firma y la
     tabla del III: hasta tenerlas, a quien pueda tocarle se le avisa y no se le
     afirma nada. `limiteDuda` es la última fecha posible de firma (BOE). */
  var TRANSITORIA = { firma: null, permanenciaIII: null, limiteDuda: '2026-03-11' };

  /* ── Art. 4.11, factores de horas ─────────────────────────────────────────
     ⚠ La tabla del texto llega descolocada y admite dos lecturas. Ésta es
     «rótulo y detrás sus dos factores (comandante · copiloto)», que es la única
     que consume la fila «Vueling» y no deja números sueltos al final. Está en UNA
     constante para poder corregirla de un plumazo, y el piloto que conozca sus HF
     de entrada (las que usó la compañía) las teclea y esto deja de mandar. */
  var FACTORES = {
    vueling:   { cmd: 1,    cop: 1,    txt: ['Vueling', 'Vueling'] },
    airbus:    { cmd: 0.9,  cop: 0.9,  txt: ['Airbus FBW (otro operador)', 'Airbus FBW (other operator)'] },
    jetG:      { cmd: 0.85, cop: 0.85, txt: ['Reactor > 20 t', 'Jet > 20 t'] },
    jetP:      { cmd: 0.8,  cop: 0.8,  txt: ['Reactor < 20 t', 'Jet < 20 t'] },
    tpG:       { cmd: 0.75, cop: 0.75, txt: ['Turbohélice > 20 t', 'Turboprop > 20 t'] },
    tpP:       { cmd: 0.7,  cop: 0.7,  txt: ['Turbohélice < 20 t', 'Turboprop < 20 t'] },
    multi:     { cmd: 0.5,  cop: 0.3,  txt: ['Multimotor / monomotor > 2 t', 'Multi-engine / single > 2 t'] },
    mono:      { cmd: 0.3,  cop: 0.3,  txt: ['Monomotor < 2 t', 'Single-engine < 2 t'] },
    heli:      { cmd: 0.3,  cop: 0.2,  txt: ['Helicóptero', 'Helicopter'] }
  };
  /* Clase por tipo de avión. Orden = prioridad: lo más concreto delante. Un tipo
     que no casa con nada NO se factoriza a ojo: se cuenta aparte y se nombra. */
  var CLASES = [
    ['heli',   /\b(R22|R44|R66|EC1[23]\d|EC135|EC145|H1[2-7]\d|AS3[35]\d|AW1[0-9]\d|BELL|B206|B407|S-?76|S-?92|HELI)/i],
    ['airbus', /^(AIRBUS\s*)?A3(18|19|20|21|30|40|50|80)/i],
    ['tpG',    /(ATR\s*-?72|AT7[0-9]|Q400|DHC-?8-?4|DH8D|DASH\s*8.?400|C-?295|ATR72)/i],
    ['tpP',    /(ATR\s*-?42|AT4[0-9]|DHC-?8-?[123]|DH8[ABC]|DASH\s*8|SAAB\s*340|SF34|SB20|SAAB\s*2000|BE19|B1900|1900D|JETSTREAM|JS3[12]|J41|KING\s*AIR|BE[23]0|B350|C90|METRO|SW4|DO-?228|D228|DO-?328|D328|EMB-?120|E120|PC-?12|TBM|CARAVAN|C208|F50|FOKKER\s*50|L-?410)/i],
    ['jetP',   /(CITATION|C25[A-C]|C5[0-9][0-9]|C680|C68A|C700|PHENOM|E50P|E55P|LEARJET|LJ[2-7]\d|HAWKER|H25B|PREMIER|HONDAJET|HDJT|ECLIPSE|PC-?24|FALCON\s*(10|20|50)|FA10|FA20|FA50|SJ30)/i],
    ['jetG',   /(B7[0-8]7|B737|B738|B739|B38M|B39M|B744|B748|B752|B753|B763|B772|B77W|B788|B789|BOEING|73[6-9]|7[4-8]7|E1[79][05]|E2[0-9][0-9]|E-?JET|EMB-?1[79]|ERJ|E145|E135|CRJ|MD-?8\d|MD-?90|F100|FOKKER\s*100|AVRO|RJ\d\d|BAE\s*146|CS100|CS300|BCS[13]|A22[0-3]|C-?SERIES|SSJ|SU95|CHALLENGER|CL60|GLOBAL|GLEX|FALCON\s*(7X|8X|900|2000)|FA[7-9]X|F900|F2TH|GULFSTREAM|GLF|G[3-7]00|G650)/i],
    ['multi',  /(PA-?34|SENECA|PA-?44|SEMINOLE|PA-?31|NAVAJO|DA-?42|DA-?62|BE-?5[58]|BARON|BE76|DUCHESS|C310|C340|C402|C421|P68|TECNAM\s*P2006|P2006|PA-?46|MALIBU|M600|C210|C206|PA-?32|SARATOGA)/i],
    ['mono',   /(C1[5-8]\d|C150|C152|C172|C177|C182|CESSNA|PA-?28|PA-?18|CHEROKEE|WARRIOR|ARCHER|DA-?20|DA-?40|DIAMOND|TECNAM|P20[028]|SR2[02]|CIRRUS|ROBIN|DR-?400|TB-?[0-9]|EXTRA|CAP\s*\d|PITTS|ZLIN|SLINGSBY|AQUILA|ULM|ULTRALIGERO)/i]
  ];
  function claseDe(tipo) {
    var t = String(tipo || '').trim();
    if (!t) return null;
    for (var i = 0; i < CLASES.length; i++) if (CLASES[i][1].test(t)) return CLASES[i][0];
    return null;
  }

  /* ── fechas, siempre en UTC (la víspera en hora local ya costó un día) ──── */
  function iso(d) { return d ? d.toISOString().slice(0, 10) : null; }
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  function sumaMeses(d, n) {
    if (!d) return null;
    var whole = Math.floor(n), frac = n - whole;
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + whole, dia = d.getUTCDate();
    var ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();      // 31-ene + 1 mes = 28/29-feb
    var r = new Date(Date.UTC(y, m, Math.min(dia, ult)));
    if (frac) r = new Date(r.getTime() + frac * 30.4375 * 864e5);
    return r;
  }
  function mesesEntre(a, b) { return (b.getTime() - a.getTime()) / (30.4375 * 864e5); }
  function minEntrada(e) {
    var t = String(e.block || e.flightTime || '');
    var m = /^(\d+):(\d{2})/.exec(t);
    return m ? (+m[1]) * 60 + (+m[2]) : 0;
  }
  function esSim(e) { return /^(SIM|TRI|TRE)$/.test(e.flightType || e.instr || '') || e.activityType === 'sim'; }
  function esMando(e) {
    var f = String(e.pilotFunction || e.func || '').toUpperCase();
    if (/^(PIC|PICUS|SPIC|INSTRUCTOR)$/.test(f)) return true;
    if (f) return false;
    return /^(CPT|CMD|PIC)$/i.test(String(e.role || ''));
  }

  /* ── horas factorizadas ───────────────────────────────────────────────────
     Antes del contrato: cada vuelo por su clase y su función (mando o copiloto).
     Desde el contrato, lo de la compañía va a 1. Lo que no se puede clasificar —un
     tipo raro, o el saldo de partida, que no trae avión— NO se inventa: se cuenta
     aparte y se dice. Con `hfIngreso` (las HF que usó la compañía al contratar)
     manda el dato del piloto para todo lo anterior. */
  function horasFactorizadas(inp, now) {
    var cont = parse(inp.fechaContrato);
    var bal = inp.balance || null;
    var corte = bal && bal.hasta ? bal.hasta : null;
    var r = { previa: 0, vueling: 0, total: 0, sinClase: {}, sinClaseMin: 0, saldoMin: 0,
              saldoMezcla: false, porClase: {}, fuente: 'logbook', ult12: 0, mesesRitmo: 0 };
    var hace12 = sumaMeses(now, -12);
    (inp.entries || []).forEach(function (e) {
      if (!e || !e.date || e.type === '__ac_db__' || esSim(e)) return;
      if (corte && e.date <= corte) return;          // ya está dentro del saldo
      var min = minEntrada(e); if (!min) return;
      var d = parse(e.date); if (!d || d > now) return; // un borrador futuro no se ha volado
      var deLinea = !e.activityType || e.activityType === 'airline' || e.activityType === 'mc';
      if (cont && d >= cont && deLinea) {
        r.vueling += min;
        if (d >= hace12) r.ult12 += min;
        return;
      }
      if (inp.hfIngreso != null && cont && d < cont) return; // lo resume el dato del piloto
      var c = claseDe(e.acType || e.type || e.aircraft);
      if (!c) { var k = String(e.acType || '¿?').toUpperCase(); r.sinClase[k] = (r.sinClase[k] || 0) + min; r.sinClaseMin += min; return; }
      var f = FACTORES[c][esMando(e) ? 'cmd' : 'cop'];
      r.previa += min * f;
      r.porClase[c] = (r.porClase[c] || 0) + min;
    });
    if (bal && bal.flightTime) {
      if (inp.hfIngreso != null && cont && corte && corte < iso(cont)) { /* lo cubre el dato */ }
      else {
        r.saldoMin = +bal.flightTime || 0;
        if (cont && corte && corte >= iso(cont)) r.saldoMezcla = true;
      }
    }
    if (inp.hfIngreso != null && !isNaN(+inp.hfIngreso)) { r.previa = (+inp.hfIngreso) * 60; r.fuente = 'piloto'; }
    r.total = r.previa + r.vueling;
    // Ritmo: horas de Vueling por mes en el último año (o desde el contrato si es menos).
    if (cont) {
      var desde = cont > hace12 ? cont : hace12;
      r.mesesRitmo = Math.max(0, mesesEntre(desde, now));
    }
    r.ritmoMes = r.mesesRitmo >= 2 ? (r.ult12 / 60) / r.mesesRitmo : 0;
    ['previa', 'vueling', 'total', 'sinClaseMin', 'saldoMin', 'ult12'].forEach(function (k) { r[k] = r[k] / 60; });
    Object.keys(r.sinClase).forEach(function (k) { r.sinClase[k] /= 60; });
    Object.keys(r.porClase).forEach(function (k) { r.porClase[k] /= 60; });
    return r;
  }

  function anualFijo(T, esp, nivel) {
    var t = T && T[esp]; if (!t) return null;
    var b = (t.salBase || {})[nivel], x = (t.pagaExtra || {})[nivel], p = (t.primaCom || {})[nivel] || 0;
    if (b == null) return null;
    return Math.round((b + (x || 0) + p) * 12 * 100) / 100;
  }
  function mensualLoyalty(T, esp, nivel) {
    var t = T && T[esp]; if (!t) return null;
    var b = (t.salBase || {})[nivel]; if (b == null) return null;
    return b + ((t.pagaExtra || {})[nivel] || 0) + ((t.primaCom || {})[nivel] || 0);
  }

  /* ── el cálculo ───────────────────────────────────────────────────────────── */
  function calcula(inp, now) {
    now = now || new Date();
    now = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var out = { faltan: [], avisos: [] };
    var esp = inp.esp, nivel = inp.nivel != null ? String(inp.nivel) : '';
    var cont = parse(inp.fechaContrato);
    if (!esp) out.faltan.push('esp');
    if (!nivel) out.faltan.push('nivel');
    if (!cont) out.faltan.push('contrato');
    out.esp = esp; out.nivel = nivel; out.contrato = cont ? iso(cont) : null;
    if (cont) {
      var m = Math.floor(mesesEntre(cont, now) + 1e-6);
      out.antiguedad = { anos: Math.floor(m / 12), meses: m % 12, totalMeses: m };
    }
    out.hf = horasFactorizadas(inp, now);
    if (!esp || !nivel || ORDEN[esp].indexOf(nivel) < 0) return out;

    // ¿Le aplica la transitoria?
    var tabla = PERMANENCIA_IV[esp], trans = { aplica: false, conocida: false };
    if (cont) {
      var lim = TRANSITORIA.firma || TRANSITORIA.limiteDuda;
      if (iso(cont) < lim) {
        trans.aplica = true;
        trans.dudosa = !TRANSITORIA.firma;
        if (TRANSITORIA.permanenciaIII && TRANSITORIA.permanenciaIII[esp] && TRANSITORIA.firma) {
          tabla = TRANSITORIA.permanenciaIII[esp]; trans.conocida = true;
        }
      }
    }
    out.transitoria = trans;
    out.anual = anualFijo(inp.tablas, esp, nivel);

    // Desde cuándo está en el nivel actual.
    var fNivel = parse(inp.fechaNivel) || cont;
    out.fechaNivel = fNivel ? iso(fNivel) : null;
    out.fechaNivelFuente = inp.fechaNivel ? (inp.fechaNivelFuente || 'piloto') : 'contrato';

    var hfAhora = out.hf.total, ritmo = out.hf.ritmoMes || 0;
    var hfEn = function (d) { return hfAhora + ritmo * Math.max(0, mesesEntre(now, d)); };

    // Escalera: del nivel actual al último, cada peldaño con su fecha estimada.
    var ord = ORDEN[esp], i0 = ord.indexOf(nivel), escalera = [], desde = fNivel;
    for (var i = i0; i < ord.length; i++) {
      var n = ord[i], p = tabla[n];
      var step = { nivel: n, desde: desde ? iso(desde) : null, anual: anualFijo(inp.tablas, esp, n), actual: i === i0 };
      escalera.push(step);
      if (!p || !desde || i === ord.length - 1) { step.indefinida = !p; break; }
      var fT = sumaMeses(desde, p.anos * 12), fH = null, via = 'tiempo';
      if (p.hf) {
        var base = desde < now ? now : desde, hfBase = hfEn(base);
        if (hfBase >= p.hf) fH = base;
        else if (ritmo > 0) fH = sumaMeses(base, (p.hf - hfBase) / ritmo);
      }
      var fSale = fT;
      if (fH && fH < fT) { fSale = fH; via = 'horas'; }
      step.salida = iso(fSale); step.via = via; step.req = p;
      step.fechaTiempo = iso(fT); step.fechaHoras = fH ? iso(fH) : null;
      if (i === i0) {
        var totM = p.anos * 12;
        step.progTiempo = Math.max(0, Math.min(1, mesesEntre(desde, now) / totM));
        if (p.hf) step.progHoras = Math.max(0, Math.min(1, hfAhora / p.hf));
        step.cumplido = fSale <= now;
        if (step.cumplido) step.cumplidoPor = (fT <= now) ? 'tiempo' : 'horas';
      }
      desde = fSale < now && i === i0 ? now : fSale;
    }
    out.escalera = escalera;
    out.siguiente = escalera.length > 1 ? escalera[1] : null;
    out.actualStep = escalera[0];

    // Hitos
    var hitos = [];
    if (cont) {
      hitos.push({ id: 'prueba', fecha: iso(sumaMeses(cont, 6)), art: '4.3' });
      if (esp === 'cop') hitos.push({ id: 'picus', fecha: iso(sumaMeses(cont, 12)), art: '4.9' });
      var f15 = sumaMeses(cont, 180), niv15 = nivel;
      escalera.forEach(function (s) { if (s.desde && s.desde <= iso(f15)) niv15 = s.nivel; });
      var mens = mensualLoyalty(inp.tablas, esp, niv15);
      hitos.push({ id: 'loyalty', fecha: iso(f15), art: '15.17', nivel: niv15, importe: mens != null ? Math.round(mens * 3 * 100) / 100 : null });
    }
    if (esp === 'cop') {
      var fA = null;
      if (hfAhora >= 3000) fA = now; else if (ritmo > 0) fA = sumaMeses(now, (3000 - hfAhora) / ritmo);
      hitos.push({ id: 'atpl', fecha: fA ? iso(fA) : null, art: '2.1', hecho: hfAhora >= 3000 });
    }
    hitos.forEach(function (h) { h.pasado = h.fecha && h.fecha <= iso(now); });
    hitos.sort(function (a, b) { return String(a.fecha || '9').localeCompare(String(b.fecha || '9')); });
    out.hitos = hitos;
    out.hoy = iso(now);
    return out;
  }

  var Motor = { calcula: calcula, claseDe: claseDe, FACTORES: FACTORES, PERMANENCIA_IV: PERMANENCIA_IV,
                ORDEN: ORDEN, TRANSITORIA: TRANSITORIA, horasFactorizadas: horasFactorizadas, sumaMeses: sumaMeses };
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
  root.CareerMotor = Motor;
  if (typeof document === 'undefined') return;

  /* ══════════════════════════ PANTALLA ═════════════════════════════════════ */
  function en() { return (root.pilotosLang || 'es') === 'en'; }
  function L(es, eng) { return en() ? eng : es; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function fMes(s) { var d = parse(s); return d ? (en() ? MON : MES)[d.getUTCMonth()] + ' ' + d.getUTCFullYear() : '—'; }
  function fDia(s) { var d = parse(s); return d ? String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + d.getUTCFullYear() : '—'; }
  function eur(n) { return n == null ? '—' : Math.round(n).toLocaleString('es-ES') + ' €'; }
  function hh(n) { return Math.round(n || 0).toLocaleString('es-ES'); }
  function nomEsp(e) { return e === 'cmd' ? L('Comandante', 'Captain') : L('Copiloto', 'First officer'); }
  function faltaTxt(d) {
    var hoy = parse(new Date().toISOString().slice(0, 10)), f = parse(d); if (!f) return '';
    var m = mesesEntre(hoy, f); if (m <= 0) return L('ya', 'now');
    if (m < 1) { var dd = Math.round(m * 30.4); return L('en ' + dd + ' días', 'in ' + dd + ' days'); }
    if (m < 24) { var mm = Math.round(m); return L('en ' + mm + ' meses', 'in ' + mm + ' months'); }
    var a = (m / 12).toFixed(1).replace('.', en() ? '.' : ','); return L('en ' + a + ' años', 'in ' + a + ' years');
  }

  /* ── de dónde sale cada dato (una puerta por dato, la de la app) ─────────── */
  function lee(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } }
  function json(k, def) { try { return JSON.parse(lee(k, '')) || def; } catch (e) { return def; } }
  function datos() {
    var P = (root.PilotProfile && root.PilotProfile.data()) || {};
    var man = json('pilotos_pay_manual', {}), hist = json('pilotos_pay_niveles', {});
    var meses = Object.keys(hist).sort(), ult = meses.length ? hist[meses[meses.length - 1]] : null;
    var ultMes = meses.length ? meses[meses.length - 1] : '';
    if (ult && man.at && man.nivel && man.at >= ultMes) ult = null;   // elegido después de la última nómina
    var esp = (ult && ult.esp) || man.esp || '', nivel = (ult && ult.nivel) || man.nivel || '', fuente = ult ? 'nomina' : (man.nivel ? 'manual' : '');
    if (!esp) { try { esp = root.pcEspDelPerfil ? root.pcEspDelPerfil() : ''; } catch (e) {} }
    if (esp && !nivel) fuente = '';
    // Fecha de entrada en el nivel: la del piloto; si no, la que dicen sus nóminas
    // (sólo si constan DOS niveles: con uno no hay cambio que fechar).
    var fNivel = P.fechaNivel || '', fFuente = fNivel ? 'piloto' : '';
    if (!fNivel && ult && meses.length > 1) {
      var i = meses.length - 1;
      while (i > 0 && hist[meses[i - 1]].nivel === ult.nivel && (hist[meses[i - 1]].esp || esp) === esp) i--;
      if (i > 0) { fNivel = meses[i] + '-01'; fFuente = 'nominas'; }
    }
    var entries = root.ldEntries;
    if (!entries || !entries.length) entries = json('pilotOS_logbook_v1', []);
    var bal = null; try { bal = root.ldBalanceActive ? root.ldBalanceActive() : null; } catch (e) {}
    var hfI = P.hfIngreso !== '' && P.hfIngreso != null && !isNaN(+P.hfIngreso) ? +P.hfIngreso : null;
    return { esp: esp, nivel: nivel, nivelFuente: fuente, fechaContrato: P.fechaContrato || '',
             fechaNivel: fNivel, fechaNivelFuente: fFuente, entries: entries, balance: bal,
             hfIngreso: hfI, tablas: root.CONVENIO };
  }

  var CSS = [
    '#car-body{--c-bg:#160A33;--c-bg2:#1F0F47;--c-ln:rgba(186,140,255,.22);--c-tx:#F5F3FF;--c-dim:#C4B5FD;--c-mut:#A99BD6;',
    '--c-acc:#D38CFF;--c-ok:#4ADE80;--c-amb:#FBBF24;padding:4px 0 28px;font-family:\'Space Grotesk\',system-ui,sans-serif}',
    '#car-body .cc{background:linear-gradient(160deg,rgba(31,15,71,.64),rgba(22,10,51,.80));border:1px solid var(--c-ln);border-radius:18px;padding:16px;margin-bottom:12px;color:var(--c-tx);box-shadow:0 10px 30px rgba(40,10,90,.25)}',
    '#car-body .c-eye{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--c-dim)}',
    '#car-body .c-hero{position:relative;overflow:hidden;background:radial-gradient(120% 90% at 100% 0%,rgba(147,51,234,.78) 0%,rgba(53,16,107,.80) 45%,rgba(22,10,51,.86) 100%)}',
    '#car-body .c-hero:after{content:"";position:absolute;right:-40px;top:-40px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(211,140,255,.35),transparent 65%);pointer-events:none}',
    '#car-body .c-lvl{font-size:44px;font-weight:800;line-height:1;letter-spacing:-1px;margin:6px 0 2px}',
    '#car-body .c-lvl small{font-size:15px;font-weight:600;color:var(--c-dim);letter-spacing:0;margin-left:6px}',
    '#car-body .c-row{display:flex;gap:8px;margin-top:12px}',
    '#car-body .c-kpi{flex:1;background:rgba(10,4,26,.55);border:1px solid var(--c-ln);border-radius:12px;padding:9px 10px;min-width:0}',
    '#car-body .c-kpi b{display:block;font-size:17px;font-weight:800;font-family:\'DM Mono\',monospace;white-space:nowrap}',
    '#car-body .c-kpi span{font-size:9.5px;color:var(--c-mut);text-transform:uppercase;letter-spacing:.6px}',
    '#car-body .c-next{display:flex;align-items:center;gap:14px}',
    '#car-body .c-ring{flex:0 0 92px;height:92px;position:relative}',
    '#car-body .c-ring svg{width:92px;height:92px;transform:rotate(-90deg)}',
    '#car-body .c-ring div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:20px}',
    '#car-body .c-ring div span{font-size:9px;font-weight:600;color:var(--c-mut);letter-spacing:.5px}',
    '#car-body .c-date{font-size:26px;font-weight:800;line-height:1.05}',
    '#car-body .c-sub{font-size:12px;color:var(--c-dim);margin-top:3px;line-height:1.4}',
    '#car-body .c-up{display:inline-block;margin-top:7px;font-size:12px;font-weight:700;color:#0B2A15;background:var(--c-ok);border-radius:999px;padding:3px 10px}',
    '#car-body .c-bars{margin-top:14px;display:grid;gap:10px}',
    '#car-body .c-bar .h{display:flex;justify-content:space-between;font-size:11px;color:var(--c-dim);margin-bottom:5px}',
    '#car-body .c-bar .h b{color:var(--c-tx);font-family:\'DM Mono\',monospace}',
    '#car-body .c-bar .t{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}',
    '#car-body .c-bar .f{height:100%;border-radius:99px;background:linear-gradient(90deg,#7C3AED,#D38CFF)}',
    '#car-body .c-bar.win .f{background:linear-gradient(90deg,#16A34A,#4ADE80)}',
    '#car-body .c-or{font-size:10.5px;color:var(--c-mut);text-align:center;margin-top:2px}',
    '#car-body .c-lad{position:relative;margin-top:6px}',
    '#car-body .c-st{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px dashed rgba(186,140,255,.15)}',
    '#car-body .c-st:last-child{border-bottom:none}',
    '#car-body .c-st .n{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;background:rgba(255,255,255,.06);border:1px solid var(--c-ln);color:var(--c-dim)}',
    '#car-body .c-st.cur .n{background:linear-gradient(135deg,#7C3AED,#D38CFF);color:#fff;border-color:transparent;box-shadow:0 0 18px rgba(211,140,255,.45)}',
    '#car-body .c-st .w{min-width:0}',
    '#car-body .c-st .w b{font-size:13px;display:block}',
    '#car-body .c-st .w i{font-style:normal;font-size:11px;color:var(--c-mut)}',
    '#car-body .c-st .sb{height:5px;border-radius:99px;background:linear-gradient(90deg,#7C3AED,#D38CFF);margin-top:5px;opacity:.85}',
    '#car-body .c-st .eu{font-family:\'DM Mono\',monospace;font-size:12px;font-weight:700;text-align:right;white-space:nowrap}',
    '#car-body .c-st .eu span{display:block;font-size:10px;color:var(--c-ok);font-weight:600}',
    '#car-body .c-hit{display:flex;gap:11px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed rgba(186,140,255,.15)}',
    '#car-body .c-hit:last-child{border-bottom:none}',
    '#car-body .c-hit .i{flex:0 0 34px;height:34px;border-radius:10px;background:rgba(211,140,255,.14);display:flex;align-items:center;justify-content:center}',
    '#car-body .c-hit .i svg{width:18px;height:18px;stroke:var(--c-acc);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '#car-body .c-hit.ok .i{background:rgba(74,222,128,.14)}#car-body .c-hit.ok .i svg{stroke:var(--c-ok)}',
    '#car-body .c-hit b{font-size:13px;display:block}#car-body .c-hit span{font-size:11.5px;color:var(--c-dim);line-height:1.4;display:block}',
    '#car-body .c-hit .d{margin-left:auto;font-family:\'DM Mono\',monospace;font-size:11.5px;font-weight:700;white-space:nowrap;color:var(--c-tx)}',
    '#car-body .c-cond{display:grid;gap:8px;margin-top:4px}',
    '#car-body .c-cond div{display:flex;gap:9px;font-size:12px;line-height:1.45;color:var(--c-dim)}',
    '#car-body .c-cond em{flex:0 0 20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:800}',
    '#car-body .c-cond .y em{background:var(--c-ok);color:#05230F}#car-body .c-cond .q em{background:rgba(251,191,36,.2);color:var(--c-amb);border:1px solid rgba(251,191,36,.5)}',
    '#car-body .c-warn{background:#2A1A05;border:1px solid rgba(251,191,36,.45);color:#FDE68A;border-radius:14px;padding:11px 13px;font-size:12px;line-height:1.45;margin-bottom:12px}',
    '#car-body .c-warn b{color:#FEF3C7}',
    '#car-body .c-f{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid rgba(186,140,255,.12)}',
    '#car-body .c-f:last-child{border-bottom:none}',
    '#car-body .c-f b{font-size:13px;display:block}#car-body .c-f span{font-size:11px;color:var(--c-mut)}',
    '#car-body .c-in{background:rgba(10,4,26,.7);border:1px solid var(--c-ln);border-radius:10px;color:var(--c-tx);font:600 13px \'DM Mono\',monospace;padding:8px 9px;min-height:40px;width:150px;color-scheme:dark}',
    '#car-body .c-in:focus{outline:none;border-color:var(--c-acc)}',
    '#car-body .c-src{font-size:10.5px;color:var(--c-mut);line-height:1.5;margin-top:8px}',
    '#car-body .c-src b{color:var(--c-dim)}',
    '#car-body .c-mini{font-size:11.5px;color:var(--c-dim);line-height:1.45;margin-top:8px}',
    '#car-body .c-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:12px;background:linear-gradient(135deg,#7C3AED,#C084FC);color:#fff;font-weight:700;font-size:13px;border:none;cursor:pointer}',
    '#scr-career .page-content{padding-top:6px}',
    /* Cielo animado: rosa que pasa a turquesa (como el título de SkyView). Cuatro
       manchas de radial-gradient que sólo mueven transform/opacity, con periodos
       primos entre sí para que no se sincronicen nunca. El texto va siempre en
       tarjetas opacas (.cc), así que el contraste no depende del cielo. */
    '#scr-career{background:#1C0B45!important}',
    '#scr-career>.inner-header,#scr-career>.scroll-body{position:relative;z-index:1}',
    '#scr-career .car-sky{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:linear-gradient(180deg,#3A0B5E 0%,#1C0B45 50%,#063845 100%)}',
    '#scr-career .car-sky i{position:absolute;border-radius:50%;width:95vmax;height:95vmax;will-change:transform,opacity}',
    '#scr-career .car-sky .a1{left:-40vmax;top:-45vmax;background:radial-gradient(circle,rgba(255,56,170,1) 0%,rgba(255,56,170,0) 64%);animation:carSkyA 13s ease-in-out infinite alternate}',
    '#scr-career .car-sky .a2{right:-45vmax;top:-10vmax;background:radial-gradient(circle,rgba(20,228,205,1) 0%,rgba(20,228,205,0) 64%);animation:carSkyB 13s ease-in-out infinite alternate}',
    '#scr-career .car-sky .a3{left:-30vmax;bottom:-55vmax;background:radial-gradient(circle,rgba(150,70,255,.9) 0%,rgba(150,70,255,0) 64%);animation:carSkyC 17s ease-in-out infinite alternate}',
    '#scr-career .car-sky .a4{right:-35vmax;bottom:-50vmax;background:radial-gradient(circle,rgba(56,189,248,.85) 0%,rgba(56,189,248,0) 64%);animation:carSkyD 19s ease-in-out infinite alternate}',
    '@keyframes carSkyA{0%{opacity:.95;transform:translate3d(0,0,0) scale(1)}100%{opacity:.25;transform:translate3d(18vmax,22vmax,0) scale(1.15)}}',
    '@keyframes carSkyB{0%{opacity:.25;transform:translate3d(0,0,0) scale(1.1)}100%{opacity:.95;transform:translate3d(-20vmax,18vmax,0) scale(.95)}}',
    '@keyframes carSkyC{0%{opacity:.55;transform:translate3d(0,0,0)}100%{opacity:.95;transform:translate3d(16vmax,-14vmax,0) scale(1.1)}}',
    '@keyframes carSkyD{0%{opacity:.85;transform:translate3d(0,0,0)}100%{opacity:.35;transform:translate3d(-14vmax,-18vmax,0) scale(1.15)}}',
    '#scr-career .back-btn{color:#F5D0FE}#scr-career .ih-title{color:#FFFFFF;text-shadow:0 2px 14px rgba(255,56,170,.45)}',
    /* Día: el mismo cielo en pastel. Las tarjetas siguen oscuras (su paleta está
       calculada contra fondo oscuro) y la cabecera vuelve a texto oscuro. */
    'html.day #scr-career{background:#FCE7F3!important}',
    'html.day #scr-career .car-sky{background:linear-gradient(180deg,#FDE2F1 0%,#EDE4FF 50%,#D5F6F2 100%)}',
    'html.day #scr-career .car-sky .a1{background:radial-gradient(circle,rgba(255,105,190,.55) 0%,rgba(255,105,190,0) 62%)}',
    'html.day #scr-career .car-sky .a2{background:radial-gradient(circle,rgba(45,212,191,.55) 0%,rgba(45,212,191,0) 62%)}',
    'html.day #scr-career .car-sky .a3{background:radial-gradient(circle,rgba(167,139,250,.5) 0%,rgba(167,139,250,0) 62%)}',
    'html.day #scr-career .car-sky .a4{background:radial-gradient(circle,rgba(125,211,252,.5) 0%,rgba(125,211,252,0) 62%)}',
    'html.day #car-body .cc{background:linear-gradient(160deg,rgba(31,15,71,.90),rgba(22,10,51,.94))}',
    'html.day #car-body .c-hero{background:radial-gradient(120% 90% at 100% 0%,rgba(124,42,214,.92) 0%,rgba(53,16,107,.93) 45%,rgba(22,10,51,.95) 100%)}',
    'html.day #scr-career .back-btn{color:#86198F}html.day #scr-career .ih-title{color:#3B0764;text-shadow:none}',
    '@media (prefers-reduced-motion:reduce){#scr-career .car-sky i{animation:none}}'
  ].join('\n');
  function css() {
    if (document.getElementById('car-css')) return;
    var s = document.createElement('style'); s.id = 'car-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  var ICO = {
    prueba: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>',
    picus: '<svg viewBox="0 0 24 24"><path d="M2 16l20-6-20-6 4 6z"/><path d="M6 10h8"/></svg>',
    atpl: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h6M7 11h10"/></svg>',
    loyalty: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>'
  };

  function hitoTxt(h, r) {
    if (h.id === 'prueba') return [L('Fin del periodo de prueba', 'End of probation period'), L('6 meses desde el contrato. Desde ahí cuenta como antigüedad.', '6 months from the contract. From then on it counts as seniority.')];
    if (h.id === 'picus') return [L('Puedes pedir las horas PICUS', 'You can request PICUS hours'), L('Con 1 año de antigüedad, aunque no estés convocado a curso de comandante.', 'With 1 year of seniority, even if not called to a command course.')];
    if (h.id === 'atpl') return [L('3.000 HF · prueba ATPL pagada', '3,000 FH · ATPL test paid'), h.hecho ? L('Ya las tienes: puedes pedir la prueba ATPL en el SBTO previo.', 'You have them: you can ask for the ATPL test at the preceding SBTO.') : L('Llevas ' + hh(r.hf.total) + ' HF. En el SBTO anterior puedes pedir la prueba ATPL a cargo de la compañía.', 'You have ' + hh(r.hf.total) + ' FH. At the preceding SBTO you can ask for the ATPL test, paid by the company.')];
    if (h.id === 'loyalty') return [L('Loyalty Bonus · 15 años', 'Loyalty Bonus · 15 years'), L('Una paga de 3 mensualidades' + (h.importe ? ' (≈ ' + eur(h.importe) + ', nivel ' + h.nivel + ')' : '') + '.', 'One payment of 3 monthly salaries' + (h.importe ? ' (≈ ' + eur(h.importe) + ', level ' + h.nivel + ')' : '') + '.')];
    return ['', ''];
  }

  function aro(p, txt, sub) {
    var r = 40, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p || 0));
    return '<div class="c-ring"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="' + r + '" stroke="rgba(255,255,255,.09)" stroke-width="8" fill="none"/>' +
      '<circle cx="46" cy="46" r="' + r + '" stroke="url(#car-g)" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="' + (c * v).toFixed(1) + ' ' + c.toFixed(1) + '"/>' +
      '<defs><linearGradient id="car-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#D38CFF"/></linearGradient></defs></svg>' +
      '<div>' + esc(txt) + '<span>' + esc(sub) + '</span></div></div>';
  }

  function campos(d) {
    var nivs = d.esp && root.CareerMotor.ORDEN[d.esp] ? root.CareerMotor.ORDEN[d.esp].slice().reverse() : [];
    var src = d.nivelFuente === 'nomina' ? L('según tu última nómina', 'from your latest payslip') : d.nivelFuente === 'manual' ? L('el de Pay Check', 'the one in Pay Check') : L('sin indicar', 'not set');
    return '<div class="cc"><div class="c-eye">' + L('Tus datos', 'Your details') + '</div>' +
      '<div class="c-f"><div><b>' + L('Fecha de contrato', 'Contract date') + '</b><span>' + L('Firma del contrato con Vueling · se guarda en tu perfil', 'Signing of your Vueling contract · saved in your profile') + '</span></div>' +
        '<input class="c-in" type="date" id="car-f-contrato" value="' + esc(d.fechaContrato) + '" onchange="careerGuarda(\'fechaContrato\',this.value)"></div>' +
      '<div class="c-f"><div><b>' + L('Especialidad y nivel', 'Rank and level') + '</b><span>' + esc(src) + '</span></div>' +
        '<div style="display:flex;gap:6px"><select class="c-in" style="width:96px" onchange="careerNivel(this.value,null)">' +
          '<option value=""' + (!d.esp ? ' selected' : '') + '>—</option>' +
          '<option value="cop"' + (d.esp === 'cop' ? ' selected' : '') + '>' + L('Copiloto', 'F/O') + '</option>' +
          '<option value="cmd"' + (d.esp === 'cmd' ? ' selected' : '') + '>' + L('Coman.', 'Capt.') + '</option></select>' +
        '<select class="c-in" style="width:74px" onchange="careerNivel(null,this.value)"' + (nivs.length ? '' : ' disabled') + '>' +
          '<option value="">—</option>' + nivs.map(function (n) { return '<option value="' + n + '"' + (n === d.nivel ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
        '</select></div></div>' +
      '<div class="c-f"><div><b>' + L('Desde cuándo en este nivel', 'In this level since') + '</b><span>' +
        (d.fechaNivelFuente === 'nominas' ? L('Deducido de tus nóminas (al mes). Corrígelo si no es.', 'Taken from your payslips (to the month). Correct it if wrong.') : L('Vacío = desde el contrato', 'Empty = since the contract')) + '</span></div>' +
        '<input class="c-in" type="date" value="' + esc(d.fechaNivelFuente === 'piloto' ? d.fechaNivel : '') + '" placeholder="' + esc(d.fechaNivel) + '" onchange="careerGuarda(\'fechaNivel\',this.value)"></div>' +
      '<div class="c-f"><div><b>' + L('Horas factorizadas al entrar', 'Factored hours on joining') + '</b><span>' + L('Opcional · las que usó Vueling para tu nivel de entrada', 'Optional · the ones Vueling used for your entry level') + '</span></div>' +
        '<input class="c-in" type="number" inputmode="numeric" min="0" step="1" value="' + esc(d.hfIngreso != null ? d.hfIngreso : '') + '" placeholder="' + L('del logbook', 'from logbook') + '" onchange="careerGuarda(\'hfIngreso\',this.value)"></div>' +
      '</div>';
  }

  function render() {
    var body = document.getElementById('car-body'); if (!body) return;
    css();
    var d = datos(), r = calcula(d, new Date()), h = '';
    root.__careerUltimo = r;

    if (r.faltan.length || !r.escalera) {
      h += '<div class="cc c-hero"><div class="c-eye">' + L('Career Tracker · IV Convenio', 'Career Tracker · IV Agreement') + '</div>' +
        '<div class="c-date" style="margin-top:8px">' + L('¿Cuándo subes de nivel?', 'When do you move up a level?') + '</div>' +
        '<div class="c-sub">' + L('Con tu fecha de contrato, tu especialidad y tu nivel te calculo cuándo cumples la permanencia del Art. 4.8, cuánto cobrarás en cada nivel y tus hitos de carrera.', 'With your contract date, rank and level I work out when you meet the time-in-level of Art. 4.8, what each level pays and your career milestones.') + '</div></div>';
      h += campos(d);
      body.innerHTML = h; actualizaHome(r); return;
    }

    if (r.transitoria && r.transitoria.aplica && !r.transitoria.conocida) {
      h += '<div class="c-warn"><b>' + L('⚠ Puede aplicarte la Disposición transitoria.', '⚠ The transitional provision may apply to you.') + '</b> ' +
        L('Los pilotos con contrato en vigor a la firma del IV Convenio siguen con la permanencia del <b>III Convenio</b>. Tu contrato es del ' + fDia(r.contrato) + ': las fechas de abajo son las del IV y pueden no ser las tuyas.',
          'Pilots with a contract in force when the IV Agreement was signed keep the <b>III Agreement</b> time-in-level. Your contract is from ' + fDia(r.contrato) + ': the dates below use the IV and may not be yours.') + '</div>';
    }

    var st = r.actualStep, sig = r.siguiente, ant = r.antiguedad || { anos: 0, meses: 0 };
    h += '<div class="cc c-hero"><div class="c-eye">' + esc(nomEsp(r.esp)) + ' · ' + L('nivel actual', 'current level') + '</div>' +
      '<div class="c-lvl">' + esc(r.nivel) + '<small>' + eur(r.anual) + L(' fijo/año', ' fixed/yr') + '</small></div>' +
      '<div class="c-row">' +
        '<div class="c-kpi"><b>' + ant.anos + L('a ', 'y ') + ant.meses + 'm</b><span>' + L('en Vueling', 'at Vueling') + '</span></div>' +
        '<div class="c-kpi"><b>' + hh(r.hf.total) + '</b><span>' + L('horas fact.', 'factored h') + '</span></div>' +
        '<div class="c-kpi"><b>' + (r.hf.ritmoMes ? hh(r.hf.ritmoMes) : '—') + '</b><span>' + L('h/mes', 'h/month') + '</span></div>' +
      '</div></div>';

    if (sig) {
      var p = st.req || {}, gana = (sig.anual || 0) - (r.anual || 0);
      var prog = Math.max(st.progTiempo || 0, st.progHoras || 0);
      var tit = st.cumplido ? L('Ya cumples la permanencia', 'You already meet the time-in-level') : faltaTxt(st.salida).replace(/^en /, '').replace(/^in /, '');
      h += '<div class="cc"><div class="c-eye">' + L('Próximo nivel', 'Next level') + ' · ' + esc(r.nivel) + ' → ' + esc(sig.nivel) + '</div>' +
        '<div class="c-next" style="margin-top:10px">' + aro(prog, Math.round(prog * 100) + '%', L('hecho', 'done')) +
        '<div style="min-width:0"><div class="c-date">' + (st.cumplido ? esc(tit) : fMes(st.salida)) + '</div>' +
        '<div class="c-sub">' + (st.cumplido
            ? L('Por ' + (st.cumplidoPor === 'horas' ? 'horas factorizadas' : 'tiempo') + '. Si tu nómina sigue en nivel ' + esc(r.nivel) + ', revisa las condiciones 2 y 3 de abajo.', 'By ' + (st.cumplidoPor === 'horas' ? 'factored hours' : 'time') + '. If your payslip still says level ' + esc(r.nivel) + ', check conditions 2 and 3 below.')
            : L('Estimado · ' + faltaTxt(st.salida) + (st.via === 'horas' ? ' · por horas' : ' · por tiempo'), 'Estimated · ' + faltaTxt(st.salida) + (st.via === 'horas' ? ' · by hours' : ' · by time'))) + '</div>' +
        (gana > 0 ? '<span class="c-up">+' + eur(gana) + L(' al año', ' a year') + '</span>' : '') + '</div></div>' +
        '<div class="c-bars">' +
          '<div class="c-bar' + (st.via === 'tiempo' && p.hf ? ' win' : '') + '"><div class="h"><span>' + L('Tiempo en el nivel', 'Time in level') + '</span><b>' + fMes(st.fechaTiempo) + ' · ' + p.anos + L(' años', ' yrs') + '</b></div><div class="t"><div class="f" style="width:' + Math.round((st.progTiempo || 0) * 100) + '%"></div></div></div>' +
          (p.hf ? '<div class="c-or">' + L('— o lo que antes llegue (Art. 4.11) —', '— or whichever comes first (Art. 4.11) —') + '</div>' +
            '<div class="c-bar' + (st.via === 'horas' ? ' win' : '') + '"><div class="h"><span>' + L('Horas factorizadas', 'Factored hours') + '</span><b>' + hh(r.hf.total) + ' / ' + hh(p.hf) + (st.fechaHoras ? ' · ' + fMes(st.fechaHoras) : '') + '</b></div><div class="t"><div class="f" style="width:' + Math.round((st.progHoras || 0) * 100) + '%"></div></div></div>' : '') +
        '</div>' +
        '<div class="c-src">' + L('Desde el ', 'Since ') + fDia(r.fechaNivel) + (r.fechaNivelFuente === 'contrato' ? L(' (tu contrato)', ' (your contract)') : r.fechaNivelFuente === 'nominas' ? L(' (tus nóminas)', ' (your payslips)') : '') +
          (p.hf && !r.hf.ritmoMes ? L(' · sin vuelos recientes en el logbook no puedo proyectar las horas', ' · with no recent logbook flights I cannot project the hours') : '') + '</div></div>';
    }

    // Escalera completa
    var maxA = 0; r.escalera.forEach(function (s) { if (s.anual > maxA) maxA = s.anual; });
    h += '<div class="cc"><div class="c-eye">' + L('Tu escalera salarial', 'Your pay ladder') + '</div><div class="c-lad">' +
      r.escalera.map(function (s, i) {
        var prev = i ? r.escalera[i - 1].anual : null;
        return '<div class="c-st' + (s.actual ? ' cur' : '') + '"><div class="n">' + esc(s.nivel) + '</div>' +
          '<div class="w"><b>' + (s.actual ? L('Ahora', 'Now') : fMes(s.desde)) + '</b><i>' +
            (s.actual ? L('nivel actual', 'current level') : s.indefinida ? L('nivel máximo', 'top level') : faltaTxt(s.desde)) + '</i>' +
            '<div class="sb" style="width:' + (maxA ? Math.max(8, Math.round(s.anual / maxA * 100)) : 0) + '%"></div></div>' +
          '<div class="eu">' + eur(s.anual) + (prev != null && s.anual > prev ? '<span>+' + eur(s.anual - prev) + '</span>' : '') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="c-src">' + L('Salario base + pagas extra' + (r.esp === 'cmd' ? ' + prima de comandante' : '') + ', 12 meses, tablas 2026 (Anexo A). Sin variables ni trimestral.', 'Base salary + extra pays' + (r.esp === 'cmd' ? ' + captain premium' : '') + ', 12 months, 2026 tables (Annex A). No variables or quarterly pay.') +
        (r.esp === 'cop' ? L(' El paso a comandante va por escalafón (Art. 4.10): no se puede fechar.', ' Upgrading to captain follows the seniority list (Art. 4.10): it cannot be dated.') : '') + '</div></div>';

    // Hitos
    h += '<div class="cc"><div class="c-eye">' + L('Hitos de carrera', 'Career milestones') + '</div>' +
      r.hitos.map(function (x) {
        var t = hitoTxt(x, r);
        return '<div class="c-hit' + (x.pasado || x.hecho ? ' ok' : '') + '"><div class="i">' + ICO[x.id] + '</div><div style="min-width:0"><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + ' · Art. ' + x.art + '</span></div>' +
          '<div class="d">' + (x.fecha ? (x.pasado ? '✓ ' : '') + fMes(x.fecha) : '—') + '</div></div>';
      }).join('') + '</div>';

    // Las tres condiciones
    h += '<div class="cc"><div class="c-eye">' + L('Las 3 condiciones del Art. 4.8', 'The 3 conditions of Art. 4.8') + '</div><div class="c-cond">' +
      '<div class="y"><em>1</em><span>' + L('<b>Permanencia en el nivel.</b> Es lo que calcula esta pantalla. No cuentan los periodos de contrato suspendido (excedencia, sanción); sí las IT, maternidad/paternidad, actividad sindical o reducción de jornada.', '<b>Time in level.</b> This is what this screen works out. Suspended-contract periods (leave of absence, sanction) do not count; sick leave, parental leave, union activity or reduced hours do.') + '</span></div>' +
      '<div class="q"><em>?</em><span>' + L('<b>80 % de la media de horas</b> de los pilotos de tu flota y base durante tu permanencia. Esa media no se publica: no la puedo comprobar. Si no llegas, subes al completar esas horas.', '<b>80% of the average hours</b> flown by pilots of your fleet and base over your time in level. That average is not published, so I cannot check it. If you fall short, you move up once you complete those hours.') + '</span></div>' +
      '<div class="q"><em>?</em><span>' + L('<b>Aptitud técnica habitual</b>: tener superados cursos, chequeos y simuladores. La decide la compañía.', '<b>Usual technical competence</b>: having passed courses, checks and simulators. The company decides it.') + '</span></div>' +
      '</div><div class="c-mini">' + L('Cumplidas las tres, el cambio es <b>automático</b>.', 'Once all three are met the change is <b>automatic</b>.') + '</div></div>';

    // Horas factorizadas: de dónde salen
    var hf = r.hf, partes = [];
    if (hf.fuente === 'piloto') partes.push(L(hh(hf.previa) + ' HF al entrar (las tuyas)', hh(hf.previa) + ' FH on joining (yours)'));
    else if (hf.previa) partes.push(L(hh(hf.previa) + ' HF de experiencia previa', hh(hf.previa) + ' FH of previous experience'));
    partes.push(L(hh(hf.vueling) + ' h en Vueling ×1', hh(hf.vueling) + ' h at Vueling ×1'));
    var notas = [];
    if (hf.sinClaseMin) notas.push(L(hh(hf.sinClaseMin) + ' h de tipos que no sé clasificar (' + esc(Object.keys(hf.sinClase).slice(0, 4).join(', ')) + ') no cuentan', hh(hf.sinClaseMin) + ' h of types I cannot classify (' + esc(Object.keys(hf.sinClase).slice(0, 4).join(', ')) + ') are not counted'));
    if (hf.saldoMin) notas.push(L(hh(hf.saldoMin) + ' h de saldo de partida no cuentan: no dicen en qué avión' + (hf.saldoMezcla ? ' y mezclan horas de antes y de Vueling' : ''), hh(hf.saldoMin) + ' h of brought-forward balance are not counted: they do not say which aircraft' + (hf.saldoMezcla ? ' and mix pre-Vueling and Vueling hours' : '')));
    h += '<div class="cc"><div class="c-eye">' + L('Horas factorizadas', 'Factored hours') + ' · ' + hh(hf.total) + ' HF</div>' +
      '<div class="c-mini">' + partes.join(' + ') + '.' + (notas.length ? ' ' + notas.join('. ') + L('. Si sabes tus HF de entrada, ponlas abajo y mandan ellas.', '. If you know your entry FH, enter them below and they take over.') : '') + '</div>' +
      '<div class="c-src">' + L('Factores del Art. 4.11 según función (mando / copiloto): Airbus FBW de otro operador 0,9 · reactor >20 t 0,85 · <20 t 0,8 · turbohélice >20 t 0,75 · <20 t 0,7 · multimotor 0,5/0,3 · monomotor <2 t 0,3 · helicóptero 0,3/0,2.', 'Art. 4.11 factors by role (command / co-pilot): Airbus FBW at another operator 0.9 · jet >20 t 0.85 · <20 t 0.8 · turboprop >20 t 0.75 · <20 t 0.7 · multi-engine 0.5/0.3 · single <2 t 0.3 · helicopter 0.3/0.2.') + '</div></div>';

    h += campos(d);
    h += '<div class="c-src" style="padding:0 6px">' + L('<b>Fuente:</b> IV Convenio Vueling–SEPLA (BOE 11-03-2026): Art. 4.5 niveles · 4.8 promoción por cambio de nivel · 4.11 horas factorizadas · Disposición transitoria · Anexo A tablas 2026. Orientativo: lo que paga es lo que diga tu nómina.', '<b>Source:</b> IV Vueling–SEPLA Agreement (BOE 11-03-2026): Art. 4.5 levels · 4.8 level promotion · 4.11 factored hours · transitional provision · Annex A 2026 tables. Indicative: what counts is your payslip.') + '</div>';
    body.innerHTML = h;
    actualizaHome(r);
  }

  /* La tarjeta del Home: el próximo nivel y cuándo, o pedir los datos. */
  function actualizaHome(r) {
    var big = document.getElementById('dh-car-big'), sub = document.getElementById('dh-car-sub'), foot = document.getElementById('dh-car-foot'), bar = document.getElementById('dh-car-bar');
    if (!big) return;
    if (!r || r.faltan.length || !r.escalera) {
      big.textContent = '—'; sub.textContent = L('Pon tu fecha de contrato', 'Add your contract date');
      foot.textContent = L('Configurar ›', 'Set up ›'); if (bar) bar.style.width = '0%'; return;
    }
    var st = r.actualStep, sig = r.siguiente;
    if (!sig) { big.textContent = L('Nivel ', 'Level ') + r.nivel; sub.textContent = L('Nivel máximo', 'Top level'); foot.textContent = eur(r.anual); if (bar) bar.style.width = '100%'; return; }
    var prog = Math.max(st.progTiempo || 0, st.progHoras || 0);
    big.textContent = r.nivel + ' → ' + sig.nivel;
    sub.textContent = st.cumplido ? L('Permanencia cumplida', 'Time-in-level met') : fMes(st.salida) + ' · ' + faltaTxt(st.salida);
    foot.textContent = '+' + eur((sig.anual || 0) - (r.anual || 0)) + L('/año ›', '/yr ›');
    if (bar) bar.style.width = Math.round(prog * 100) + '%';
  }

  root.careerGuarda = function (k, v) {
    var o = {}; o[k] = String(v == null ? '' : v).trim();
    try { root.PilotProfile && root.PilotProfile.save(o); } catch (e) {}
    render();
  };
  /* El nivel y la especialidad son los de Pay Check: se escriben ahí, por su
     puerta, para que no haya dos niveles en la app. */
  root.careerNivel = function (esp, nivel) {
    var man = json('pilotos_pay_manual', {});
    if (esp != null) { man.esp = esp; man.nivel = ''; }
    if (nivel != null) man.nivel = nivel;
    var e = document.getElementById('pc_esp'), n = document.getElementById('pc_nivel');
    try {
      if (e && man.esp) { e.value = man.esp; if (root.pcOnEsp) root.pcOnEsp({ conservar: man.nivel || null, silencio: true }); }
      if (n && man.nivel) n.value = man.nivel;
      if (man.esp && root.pcManualSave && e && e.value === man.esp) root.pcManualSave();
      else localStorage.setItem('pilotos_pay_manual', JSON.stringify(man));
    } catch (x) { try { localStorage.setItem('pilotos_pay_manual', JSON.stringify(man)); } catch (y) {} }
    /* Elegido aquí a mano: se apunta el mes, para que mande sobre una nómina
       ANTERIOR (has subido de nivel y aún no ha llegado la nómina nueva), pero no
       sobre una posterior, que es un dato. */
    try { var m2 = json('pilotos_pay_manual', {}); m2.at = new Date().toISOString().slice(0, 7); localStorage.setItem('pilotos_pay_manual', JSON.stringify(m2)); } catch (z) {}
    render();
  };
  root.careerRender = render;
  // Home: se pinta al arrancar, cuando ya hay perfil y logbook.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 1500); });
  else setTimeout(render, 1500);
})(typeof window !== 'undefined' ? window : globalThis);
