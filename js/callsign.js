/* ═══════════════════════════════════════════════════════════════════════════
   CALLSIGN · el post-it del vuelo — cuadro del Home, hoja para escribirlo y
   ventana flotante

   El papel con el callsign y el número de vuelo que se cuelga en cabina, pero
   en el iPad: para que cuando te llamen por frecuencia baste con mirarlo.

   · El CUADRO del slider del Home (#dh-cs-chip) ES el post-it: callsign en
     grande y el vuelo debajo. Tocarlo abre la hoja.
   · La HOJA: dos campos de texto normales (callsign y nº de vuelo) que se
     escriben con el TECLADO DEL SISTEMA del iPad o del iPhone. Hubo un panel
     para escribir con el dedo y un teclado propio; se quitaron (16-oct-2026,
     «así es más intuitivo»): el teclado de siempre no hay que aprenderlo.
   · «Fijar en pantalla»: el post-it en una ventana flotante (Picture-in-
     Picture), que es lo único que iOS deja flotar por encima de otras apps a
     una web. Se pinta en un <canvas>, se convierte en vídeo y ese vídeo es el
     que flota. ⚠ Que funcione en la PWA de un iPad gestionado NO se ha podido
     comprobar desde el sandbox: si no se puede, se DICE, no se calla.

   DE DÓNDE SALE CADA DATO
   · El VUELO: el próximo del roster (el comercial: VY6578).
   · El CALLSIGN: NO por la ruta —un BCN–ORY tiene varios vuelos al día, cada
     uno con el suyo— sino por NÚMERO DE VUELO: el callsign va con el número y
     suele mantenerse toda la temporada. Se busca el más reciente de ese número
     en el logbook (el callsign se apunta DESPUÉS de volar, así que el de hoy
     aún no está) y en lo que el piloto ya escribió aquí otras veces.
   · Uno sacado del histórico es una SUGERENCIA: sale en GRIS, dice de qué
     vuelo y qué día sale, y hay que CONFIRMARLO. Un callsign falso dicho con
     seguridad es justo lo que no puede pasar: es lo que vas a leer cuando te
     llamen. Sin histórico, vacío.
   · Y al revés: lo que se confirma aquí antes de volar se ofrece luego al
     apuntar ese vuelo en el logbook (`pilotosCallsignPara`).

   ⚠ Todo lo que se pinta va con translate="no" y los textos salen en los dos
   idiomas desde aquí (patrón de plazos-ui.js).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var K_HOY = 'pilotos_callsign';      // { flight, date, callsign, fuente:'manual'|'historico', conf, ref:{date,flight}, at }
  var K_MAPA = 'pilotos_callsign_mapa'; // { '6578': { cs:'VY06JB', date:'2026-10-03', at } } — sólo lo CONFIRMADO
  var MAX_CS = 7, MAX_FL = 6, MAX_CHK = 6;
  var K_ESTILO = 'pilotos_callsign_estilo'; // { color, tema:'auto'|'dia'|'noche', forma }
  /* Las letras de delante (VY, VLG…) no cambian de un vuelo a otro: se aprenden
     de lo que el piloto guarda y se ponen solas en la casilla vacía. Sólo las
     LETRAS seguidas de un dígito: así «VY06JB» enseña «VY» y un callsign sin
     número no enseña nada. Pedido el 12-oct-2026.
     · Hace falta usarlas DOS veces (PREF_USOS) antes de ponerlas solas: una vez
       puede ser una errata o un vuelo raro; dos ya es costumbre.
     · Cuenta cada callsign DISTINTO una vez (`ult`): guardar el mismo dos veces
       el mismo día no es usarlo dos veces.
     · Si hay varios que llegan a dos usos, manda el ÚLTIMO usado: quien cambia
       de VY a VLG lo ve cambiar al segundo uso, no cuando VLG alcance a VY.
     · Se pueden borrar de la casilla como cualquier letra. */
  var K_PREF = 'pilotos_callsign_prefijo'; // { cs:{ VY:{n,at} }, fl:{…}, ult:{cs,fl} }
  var PREF_USOS = 2;
  function prefijoDe(v) { var m = String(v || '').match(/^([A-Z]{2,3})(?=\d)/); return m ? m[1] : ''; }
  function leePref() {
    var p = lee(K_PREF, {});
    ['cs', 'fl'].forEach(function (k) { if (typeof p[k] === 'string') { var o = {}; o[p[k]] = { n: 1, at: 0 }; p[k] = o; } else if (!p[k] || typeof p[k] !== 'object') p[k] = {}; });
    p.ult = p.ult || {};
    return p;
  }
  function aprendePrefijo(h) {
    var p = leePref(), cambia = false;
    [['cs', h.callsign], ['fl', h.flight]].forEach(function (x) {
      var k = x[0], v = String(x[1] || ''), pr = prefijoDe(v);
      if (!pr || p.ult[k] === v) return;
      var e = p[k][pr] || { n: 0, at: 0 }; e.n++; e.at = Date.now(); p[k][pr] = e; p.ult[k] = v; cambia = true;
    });
    if (cambia) guarda(K_PREF, p);
  }
  function prefijoPorDefecto(k) {
    var m = leePref()[k], mejor = '', at = -1;
    Object.keys(m).forEach(function (pr) { if (m[pr].n >= PREF_USOS && m[pr].at > at) { mejor = pr; at = m[pr].at; } });
    return mejor;
  }
  // Un campo que sólo lleva el prefijo puesto por la app no es un dato: no se guarda.
  function soloPrefijo(v) { return /^[A-Z]{1,3}$/.test(String(v || '')); }

  function en() { return window.pilotosLang === 'en'; }
  function T(es, eng) { return en() ? eng : es; }
  function lee(k, def) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
  function guarda(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hoyIso() { return new Date().toISOString().slice(0, 10); }
  function limpia(s, max) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max); }

  /* El número comercial, por la MISMA puerta que el emparejador del logbook
     (`_ldNumComercial`): un segundo criterio para «¿es el mismo vuelo?» sería
     ES_AIRPORTS / ES_IATA otra vez. El respaldo es su misma expresión. */
  function numDe(x) {
    if (typeof window._ldNumComercial === 'function') { try { return window._ldNumComercial(x); } catch (e) {} }
    var s = String((x && (x.flight || x.flightNum)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var m = s.match(/^[A-Z]{0,3}(\d{1,5})$/);
    return m ? m[1] : '';
  }

  // ── Próximo vuelo del roster ───────────────────────────────────────────
  /* La primera hora que SE PUEDE LEER, no la primera que existe: `--:--` es un
     valor de verdad que manda eCrews. */
  function hora(e, campos) {
    for (var i = 0; i < campos.length; i++) {
      var v = e && e[campos[i]];
      var m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
      if (m) return (+m[1]) * 60 + (+m[2]);
    }
    return null;
  }
  // Cuándo sale y cuándo llega un tramo, en ms UTC (las horas del roster son zulú).
  function ventana(e) {
    if (!e || e.type !== 'flight' || !e.flightNum || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) return null;
    if (/\*/.test(e.dep || '') || e.isPositioning || e.positioning) return null;   // un posicional no lo llamas tú
    var d0 = Date.UTC(+e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10));
    var sd = hora(e, ['std_scheduled', 'std', 'std_estimated', 'std_actual']);
    var sa = hora(e, ['sta_actual', 'sta_estimated', 'sta', 'sta_scheduled']);
    var dep = d0 + (sd == null ? 0 : sd) * 6e4;
    var arr = sa == null ? dep + 4 * 36e5 : d0 + sa * 6e4;
    if (arr < dep) arr += 864e5;
    return { dep: dep, arr: arr };
  }
  var TRAS_CALZOS = 30 * 6e4;   // hasta media hora después de llegar, sigue siendo «el vuelo»
  /* Los tramos que quedan: los que no han aterrizado (+30 min) y salen dentro de
     36 h, en orden de salida. El primero es «el vuelo». */
  /* El roster de memoria (RST) sólo se llena al ENTRAR en el Roster, y el Home se
     pinta antes: con RST vacío el post-it no veía el vuelo de hoy y se quedaba con
     el de ayer (16-oct-2026, «no vuelve a detectar el vuelo»). Si RST está vacío,
     se lee el roster guardado, que es lo mismo que haría rstLoad(). */
  function entradasRoster() {
    var R = window.RST;
    if (R && Array.isArray(R.entries) && R.entries.length) return R.entries;
    try {
      if (localStorage.getItem('pilotOS_roster_cleared') === '1') return [];
      var g = JSON.parse(localStorage.getItem('pilotOS_roster') || '[]');
      return Array.isArray(g) ? g : [];
    } catch (e) { return []; }
  }

  function proximosVuelos(ahora) {
    var now = ahora || Date.now(), out = [], ent = entradasRoster();
    ent.forEach(function (e) {
      var w = ventana(e); if (!w) return;
      if (w.arr + TRAS_CALZOS < now) return;      // ya ha aterrizado
      if (w.dep - now > 36 * 36e5) return;         // más allá de hoy y mañana no es «el vuelo»
      out.push({ dep: w.dep, arr: w.arr, e: e });
    });
    out.sort(function (a, b) { return a.dep - b.dep; });
    return out;
  }
  function proximoVuelo(ahora) { var l = proximosVuelos(ahora); return l.length ? l[0].e : null; }
  // ¿Ese número de vuelo es un tramo del roster de ese día que YA ha aterrizado?
  function yaVolado(flight, date) {
    var n = numDe({ flight: flight }); if (!n || !date) return false;
    var ent = entradasRoster();
    for (var i = 0; i < ent.length; i++) {
      var e = ent[i]; if (!e || e.date !== date || numDe({ flight: e.flightNum }) !== n) continue;
      var w = ventana(e); if (w && w.arr + TRAS_CALZOS < Date.now()) return true;
    }
    return false;
  }

  /* Ruta y horas del vuelo, del roster. Las horas se guardan en ZULÚ, como
     vienen; se pasan a la hora que el piloto ve al PINTAR (`pilotosHoraVista`,
     la misma puerta que el Home y el roster), para que la etiqueta z/LT no
     pueda contradecir a la hora. */
  function hhmm(m) { return m == null ? '' : String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function datosRoster(e) {
    if (!e) return { dep: '', arr: '', std: '', sta: '' };
    return { dep: String(e.dep || '').replace(/\*/g, '').toUpperCase().slice(0, 4), arr: String(e.arr || '').toUpperCase().slice(0, 4),
      std: hhmm(hora(e, ['std_scheduled', 'std', 'std_estimated', 'std_actual'])),
      sta: hhmm(hora(e, ['sta_scheduled', 'sta', 'sta_estimated', 'sta_actual'])) };
  }
  // El vuelo del roster con ese número, hoy o mañana (para cuando se teclea a mano).
  function delRoster(flight) {
    var n = numDe({ flight: flight }); if (!n) return null;
    var ent = entradasRoster(), hoy = hoyIso(), man = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    for (var i = 0; i < ent.length; i++) { var e = ent[i]; if (e && e.type === 'flight' && (e.date === hoy || e.date === man) && numDe({ flight: e.flightNum }) === n) return e; }
    return null;
  }
  /* Tu nº de chequeo: tu nombre de la lista de tripulación (Mi perfil) buscado en
     el escalafón que ya baja el logbook (`pilotOS_crew_db`). El del compañero no
     lo sabe nadie —eCrews no publica la tripulación—: lo pone el piloto. */
  function miChequeo() {
    var rol = '', nom = '';
    try { rol = window.ppGet ? String(window.ppGet('rol', '') || '').toUpperCase() : ''; } catch (e) {}
    if (rol !== 'CPT' && rol !== 'FO') return { rol: '', num: '' };
    try { nom = typeof window.pilotosNombreTrip === 'function' ? String(window.pilotosNombreTrip(rol) || '') : ''; } catch (e) {}
    nom = nom.trim().toUpperCase();
    var db = lee('pilotOS_crew_db', []), num = '';
    if (nom && Array.isArray(db)) for (var i = 0; i < db.length; i++) { if (db[i] && String(db[i].name || '').trim().toUpperCase() === nom) { num = limpia(db[i].checkNum, MAX_CHK); break; } }
    return { rol: rol, num: num };
  }

  // ── El callsign de un número de vuelo, del histórico ───────────────────
  function sugerencia(flight) {
    var n = numDe({ flight: flight });
    if (!n) return null;
    var best = null;
    var lb = lee('pilotOS_logbook_v1', []);
    if (Array.isArray(lb)) lb.forEach(function (l) {
      var cs = limpia(l && (l.callsign || l.callSign), MAX_CS);
      if (!cs || numDe(l) !== n) return;
      if (!best || String(l.date || '') > best.date) best = { cs: cs, date: String(l.date || ''), flight: String(l.flight || l.flightNum || flight), src: 'logbook' };
    });
    var m = lee(K_MAPA, {})[n];
    if (m && m.cs && (!best || String(m.date || '') > best.date)) best = { cs: m.cs, date: String(m.date || ''), flight: flight, src: 'postit' };
    return best;
  }
  /* Para el logbook: lo que el piloto CONFIRMÓ aquí para ese vuelo. Sólo eso:
     una sugerencia sin confirmar no se convierte en dato por pasar de pantalla. */
  window.pilotosCallsignPara = function (date, flight) {
    var h = lee(K_HOY, null);
    if (h && h.conf && h.callsign && numDe({ flight: h.flight }) && numDe({ flight: h.flight }) === numDe({ flight: flight }) && (!date || !h.date || h.date === date)) return h.callsign;
    return '';
  };

  // ── Estado del día ─────────────────────────────────────────────────────
  function estado() {
    var h = lee(K_HOY, null), pv = proximoVuelo();
    if (pv) {
      var fl = limpia(pv.flightNum, MAX_FL);
      /* Se rehace con el vuelo nuevo si el post-it salió del roster, o si es de
         un día anterior. Uno que el piloto ha escrito a mano para hoy no se pisa. */
      var otro = !h || numDe({ flight: h.flight }) !== numDe({ flight: fl }) || h.date !== pv.date;
      /* Uno escrito a mano tampoco manda cuando su vuelo es un tramo del roster
         que YA ha aterrizado: de un día de cuatro tramos, el piloto escribe el
         1.º y a partir de ahí la app tiene que seguir sola (16-oct-2026). */
      if (otro && (!h || h.roster !== false || !h.date || h.date < pv.date || yaVolado(h.flight, h.date))) {
        // Vuelo nuevo: se parte del roster y del histórico, nunca del post-it de ayer.
        var s = sugerencia(fl);
        var yo = miChequeo(), r = datosRoster(pv);
        /* El compañero es el MISMO todo el día (25-oct-2026: «cuando inserta el ID
           del compañero, que se ponga en los siguientes vuelos del día»). Al pasar
           al tramo siguiente se arrastra el nº del post-it anterior, pero sólo si
           era de ESTE día: de ayer no, que mañana vuela con otro. El tuyo sale
           siempre del escalafón; sin rol conocido se arrastran los dos. */
        var mismoDia = !!(h && h.date && h.date === pv.date);
        var arrCpt = mismoDia && yo.rol !== 'CPT' ? (h.cpt || '') : '';
        var arrFo  = mismoDia && yo.rol !== 'FO'  ? (h.fo  || '') : '';
        h = { flight: fl, date: pv.date, callsign: s ? s.cs : '', fuente: s ? 'historico' : '', conf: false,
              ref: s ? { date: s.date, flight: s.flight, src: s.src } : null, roster: true, at: Date.now(),
              dep: r.dep, arr: r.arr, std: r.std, sta: r.sta,
              cpt: yo.rol === 'CPT' ? yo.num : arrCpt, fo: yo.rol === 'FO' ? yo.num : arrFo };
        guarda(K_HOY, h);
      } else if (h && !otro) {
        var r2 = datosRoster(pv);
        if (h.dep == null) {
          // Un post-it de antes de que llevara ruta y horas: se completa, no se rehace.
          h.dep = r2.dep; h.arr = r2.arr; h.std = r2.std; h.sta = r2.sta; guarda(K_HOY, h);
        } else if ((r2.std && h.std !== r2.std) || (r2.sta && h.sta !== r2.sta) || (!h.dep && r2.dep)) {
          /* El MISMO vuelo con otras horas en el roster (reprogramado, o el post-it
             nació antes de importar): las horas las manda el roster. La ruta sólo
             se rellena si falta: el piloto puede haberla invertido a propósito. */
          if (r2.std) h.std = r2.std; if (r2.sta) h.sta = r2.sta;
          if (!h.dep) { h.dep = r2.dep; h.arr = r2.arr; }
          guarda(K_HOY, h);
        }
      }
    }
    return h || { flight: '', date: '', callsign: '', fuente: '', conf: false, ref: null };
  }
  function confirma(h) {
    h.conf = true; h.fuente = h.fuente || 'manual'; h.at = Date.now();
    aprendePrefijo(h);
    guarda(K_HOY, h);
    var n = numDe({ flight: h.flight });
    if (n && h.callsign) { var m = lee(K_MAPA, {}); m[n] = { cs: h.callsign, date: h.date || new Date().toISOString().slice(0, 10), at: Date.now() }; guarda(K_MAPA, m); }
    pinta();
  }

  function fechaCorta(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    var mes = en() ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] : ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return (+m[3]) + '-' + mes[+m[2] - 1];
  }

  // ── El cuadro del Home ─────────────────────────────────────────────────
  function pinta() {
    var c = document.getElementById('dh-cs-chip');
    if (!c) return;
    var h = estado();
    var val = c.querySelector('.dh-stat-val'), sub = c.querySelector('.dh-stat-sub');
    var sug = !!(h.callsign && !h.conf);
    c.classList.toggle('cs-sug', sug);
    if (val) val.textContent = h.callsign || '—';
    if (sub) sub.textContent = sug ? (h.flight + ' · ' + T('¿confirmar?', 'confirm?'))
      : (h.flight || T('toca para escribir', 'tap to write'));
    c.setAttribute('aria-label', 'Callsign ' + (h.callsign || T('sin escribir', 'not set')) + (h.flight ? ' · ' + h.flight : '') + (sug ? ' · ' + T('sugerido, sin confirmar', 'suggested, not confirmed') : ''));
    if (_pipVivo) {
      pintaPostit();
      /* Lo que flota es un CLIP grabado: no cambia solo. Si el post-it ya no es
         el que se grabó —aterrizaste y toca el tramo siguiente, el roster trae
         otras horas— se vuelve a grabar y se cambia en la ventana (16-oct-2026:
         «el tag no me ha cogido el vuelo de hoy ni las horas»). Con la hoja
         abierta no: ahí manda Guardar. */
      if (!S && !_clip.grabando && _clip.firma !== firmaPostit()) actualizaPip();
    }
  }

  window.PilotosCallsign = { sugerencia: sugerencia, proximoVuelo: proximoVuelo, pinta: pinta, abre: abre };

  // ═══ La hoja ═════════════════════════════════════════════════════════════
  var S = null;   // { h, campo:'cs'|'fl' } — campo: el que se enfoca al abrir
  function abre(ev) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var h = estado();
    S = { h: JSON.parse(JSON.stringify(h)), campo: h.callsign ? 'fl' : 'cs' };
    var pf = { cs: prefijoPorDefecto('cs'), fl: prefijoPorDefecto('fl') };
    if (!S.h.flight && pf.fl) S.h.flight = pf.fl;
    if (!S.h.callsign && pf.cs) S.h.callsign = pf.cs;   // sin conf ni fuente: sigue siendo un hueco hasta que escriba el número
    var ov = document.getElementById('cs-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'cs-ov'; ov.setAttribute('translate', 'no');
      ov.addEventListener('click', function (e) { if (e.target === ov) cierra(); });
      document.body.appendChild(ov);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('cs-ov') && document.getElementById('cs-ov').classList.contains('on')) cierra(); });
    }
    ov.classList.add('on');
    render();
    /* Se enfoca SÓLO el campo que falta (vacío o con el prefijo nada más), con
       el cursor al final, detrás de las letras: así el teclado del sistema sale
       solo y se escribe el número sin tocar nada más. Con los dos ya puestos no
       se enfoca nada: sacar el teclado tapando media hoja para no escribir
       sería un estorbo. Va dentro del toque que abre la hoja, que es lo que iOS
       exige para sacar el teclado. */
    var v = valor(S.campo);
    if (!v || soloPrefijo(v)) {
      var inp = ov.querySelector('.cs-txt[data-c="' + S.campo + '"]');
      if (inp) { try { inp.focus({ preventScroll: true }); inp.setSelectionRange(v.length, v.length); } catch (e) {} }
    }
  }
  function cierra() {
    var ov = document.getElementById('cs-ov');
    /* Con el post-it fijado, la hoja se ESCONDE y no se vacía: su vídeo es el
       que está flotando, y destruirlo cerraría la ventana (o, en el mejor caso,
       la dejaría huérfana sin forma de actualizarla). */
    if (ov) { ov.classList.remove('on'); if (!_pipVivo) ov.innerHTML = ''; }
    S = null;
    pinta();
  }
  function valor(campo) { return campo === 'cs' ? (S.h.callsign || '') : (S.h.flight || ''); }
  function ponValor(campo, v) {
    v = limpia(v, campo === 'cs' ? MAX_CS : MAX_FL);
    if (campo === 'cs') {
      if (v !== S.h.callsign) { S.h.callsign = v; S.h.fuente = 'manual'; S.h.ref = null; }
    } else if (v !== S.h.flight) {
      /* Lleva la fecha DE ESE VUELO, no la del post-it anterior: con la de antes,
         un número tecleado dejaba el post-it clavado el resto del día. Escrito a
         mano no lo pisa el roster, salvo cuando ese vuelo ya ha aterrizado
         (`yaVolado` en estado()): entonces pasa solo al tramo siguiente. */
      var er = delRoster(v);
      S.h.flight = v; S.h.roster = false; S.h.date = er ? er.date : hoyIso();
      var r = datosRoster(er);   // otro vuelo: su ruta y sus horas, o ninguna (no las del anterior)
      S.h.dep = r.dep; S.h.arr = r.arr; S.h.std = r.std; S.h.sta = r.sta;
    }
  }
  /* El campo de texto: el teclado del SISTEMA, en mayúsculas y sin
     autocorrector (un corrector que cambia «VY06JB» por una palabra es lo
     último que hace falta en cabina). `inputmode` no se toca: el callsign y el
     vuelo mezclan letras y números. */
  function campoTxt(campo) {
    return '<input class="cs-txt" data-c="' + campo + '" type="text" inputmode="text" autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done"' +
      ' maxlength="' + (campo === 'cs' ? MAX_CS : MAX_FL) + '" value="' + esc(valor(campo)) + '" aria-label="' + (campo === 'cs' ? 'Callsign' : T('Nº de vuelo', 'Flight number')) + '">';
  }
  /* Las sillas de ruedas, por TIPO (pedido 16-oct-2026: «2 sillas Romeo, 4 C
     y 1 S… muy fácil de seleccionar»). Tres fichas, una por tipo: tocar la ficha
     SUMA una, y debajo van − y + de 44 px. Sin teclado: en un vuelo con cuatro
     sillas son cuatro toques. El orden R · S · C es el de menos a más
     asistencia, que es como se dicen en la radio y en el papel. */
  var WCH_TIPOS = [
    { k: 'R', es: 'camina', en: 'walks' },
    { k: 'S', es: 'sin escaleras', en: 'no stairs' },
    { k: 'C', es: 'inmóvil', en: 'immobile' }
  ];
  function wchN(h, k) { return Math.max(0, Math.min(99, parseInt(h['wch' + k], 10) || 0)); }
  function wchHtml(h) {
    var viejo = !WCH_TIPOS.some(function (t) { return wchN(h, t.k); }) && +h.wch > 0;
    return '<div class="cs-wch"><div class="cs-wch-t">WCH' +
      (viejo ? ' <span>· ' + esc(h.wch) + T(' sin tipo', ' untyped') + '</span>' : '') + '</div><div class="cs-wch-g">' +
      WCH_TIPOS.map(function (t) {
        var n = wchN(h, t.k), nom = 'WCH' + t.k;
        return '<div class="cs-wt' + (n ? ' on' : '') + '">' +
          '<button type="button" class="cs-wn" data-a="wch+" data-w="' + t.k + '" aria-label="' + T('Añadir una ', 'Add one ') + nom + '">' +
            '<span class="cs-wl">' + t.k + '</span><span class="cs-wd">' + T(t.es, t.en) + '</span><span class="cs-wc">' + n + '</span></button>' +
          '<div class="cs-wb"><button type="button" data-a="wch-" data-w="' + t.k + '" aria-label="' + T('Quitar una ', 'Remove one ') + nom + '"' + (n ? '' : ' disabled') + '>−</button>' +
          '<button type="button" data-a="wch+" data-w="' + t.k + '" aria-label="' + T('Añadir una ', 'Add one ') + nom + '">+</button></div></div>';
      }).join('') + '</div></div>';
  }
  function rutaHtml(h) {
    return ((h.dep || h.arr) ? '<div class="cs-ruta"><span class="cs-apt">' + esc(h.dep || '—') + '</span>' +
          '<button type="button" class="cs-inv" data-a="invierte" aria-label="' + T('Invertir la ruta', 'Swap the route') + '">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/></svg></button>' +
          '<span class="cs-apt">' + esc(h.arr || '—') + '</span></div>' : '');
  }
  function deRoster(h) { return h.roster ? ' <span class="cs-de">· ' + T('del roster', 'from roster') + '</span>' : ''; }
  function render() {
    var ov = document.getElementById('cs-ov');
    if (!ov || !S) return;
    var h = S.h, sug = !!(h.callsign && !h.conf && h.fuente === 'historico');
    var refTxt = (sug && h.ref) ? T('Sugerido del ', 'Suggested from ') + esc(h.ref.flight || h.flight) + (h.ref.date ? T(' que volaste el ', ' you flew on ') + fechaCorta(h.ref.date) : '') + T('. Compruébalo antes de fijarlo.', '. Check it before you pin it.') : '';
    var pipOk = pipDisponible();
    /* La hoja tiene un ESQUELETO fijo: lo de encima del vídeo, el vídeo y lo de
       debajo. Cada repintado rehace las dos partes y deja el vídeo donde está —
       es el que flota cuando el post-it está fijado, y un innerHTML encima lo
       sacaría del documento a cada letra que se escribe. */
    var sh = ov.querySelector('.cs-sheet');
    if (!sh) {
      ov.innerHTML = '<div class="cs-sheet" role="dialog" aria-label="Callsign"><div class="cs-pa"></div>' +
        '<div class="cs-prev-w"><video class="cs-prev" muted playsinline autoplay></video></div><div class="cs-pb"></div></div>';
      sh = ov.querySelector('.cs-sheet');
      sh.addEventListener('click', onClick);
      preparaVideo(sh.querySelector('.cs-prev'));
    }
    sh.querySelector('.cs-pa').innerHTML =
        '<div class="cs-grab"></div>' +
        '<div class="cs-top"><div class="cs-tit">' + T('Callsign y vuelo', 'Callsign & flight') + '</div>' +
          '<button type="button" class="cs-x" data-a="cerrar" aria-label="' + T('Cerrar', 'Close') + '"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        /* El vuelo que ha detectado la app, con la flecha en medio para darle la
           vuelta (pedido 13-oct-2026): si el roster te ha puesto la ida y vas en
           la vuelta, un toque. Sólo cambia los AEROPUERTOS: las horas son las del
           vuelo detectado, y darles la vuelta dejaría la llegada antes de la
           salida. */
        '<div class="cs-rt">' + rutaHtml(h) + '</div>' +
        '<div class="cs-lab">CALLSIGN</div>' +
        '<div class="cs-fila' + (sug ? ' sug' : '') + '">' + campoTxt('cs') + '</div>' +
        '<div class="cs-ref-w">' + (sug ? '<div class="cs-ref">' + refTxt + '<button type="button" class="cs-ok" data-a="confirmar">✓ ' + T('Confirmar', 'Confirm') + '</button></div>' : '') + '</div>' +
        '<div class="cs-lab">' + T('Nº DE VUELO', 'FLIGHT NO.') + '<span class="cs-de-w">' + deRoster(h) + '</span></div>' +
        '<div class="cs-fila">' + campoTxt('fl') + '</div>' +
        '<div class="cs-chk">' +
          '<label><span>CPT</span><input class="cs-in" data-f="cpt" inputmode="numeric" autocomplete="off" maxlength="' + MAX_CHK + '" value="' + esc(h.cpt || '') + '" placeholder="' + T('nº chequeo', 'check no.') + '"></label>' +
          '<label><span>FO</span><input class="cs-in" data-f="fo" inputmode="numeric" autocomplete="off" maxlength="' + MAX_CHK + '" value="' + esc(h.fo || '') + '" placeholder="' + T('nº chequeo', 'check no.') + '"></label>' +
        '</div>' +
        '<div class="cs-chk">' +
          '<label><span>PAX</span><input class="cs-in" data-f="pax" inputmode="numeric" autocomplete="off" maxlength="3" value="' + esc(h.pax || '') + '" placeholder="' + T('pasajeros', 'passengers') + '"></label>' +
        '</div>' +
        wchHtml(h) +
        '';
    sh.querySelector('.cs-pb').innerHTML =
        aspecto() +
        /* Un rótulo, y nada más: «la gente no lee tanta información» (piloto,
           12-oct-2026). El hueco de debajo queda vacío y sólo habla si algo falla
           (`aviso()`), que es cuando sí hay algo que decir. */
        (pwaIos()
          ? '<a class="cs-fijar cs-safari" data-a="safari" href="' + esc(urlSafari()) + '">📌 ' + T('Fijar en pantalla', 'Pin on screen') + '</a>'
          : '<button type="button" class="cs-fijar" data-a="fijar"' + (pipOk ? '' : ' disabled') + '>📌 ' + T('Fijar en pantalla', 'Pin on screen') + '</button>') +
        '<div class="cs-pip-msg" aria-live="polite">' + (pwaIos() || pipOk ? '' : T('Este iPad no deja fijarlo: se ve en el Home.', 'This iPad cannot pin it: it shows on the Home.')) + '</div>' +
        '<button type="button" class="cs-guardar" data-a="guardar">' + T('Guardar', 'Save') + '</button>';
    ov.querySelectorAll('.cs-in').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var f = inp.dataset.f, v = f === 'pax' ? String(inp.value || '').replace(/\D/g, '').slice(0, 3) : limpia(inp.value, MAX_CHK);
        if (v !== inp.value) inp.value = v;
        if (S) { S.h[inp.dataset.f] = v; pintaPostit(); programaClip(); var a = ov.querySelector('a.cs-safari'); if (a) a.setAttribute('href', urlSafari()); }
      });
    });
    ov.querySelectorAll('.cs-txt').forEach(function (inp) {
      inp.addEventListener('input', function () { escribeCampo(inp); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    });
    var asp = ov.querySelector('.cs-asp'); if (asp) asp.addEventListener('toggle', function () { if (S) S.aspAbierto = asp.open; });
    if (!_pipVivo) programaClip();   // fijado, el vídeo no cambia hasta Guardar
    estadoBoton();
  }
  /* Color, día/noche y forma: plegado, porque es algo que se elige una vez. */
  function aspecto() {
    var D = window.PilotosPostit; if (!D) return '';
    var e = estilo(), tema = temaAhora();
    var NOM = { pilotos: 'PilotOS', amarillo: T('Amarillo', 'Yellow'), verde: T('Verde', 'Green'), azul: T('Azul', 'Blue'), rosa: T('Rosa', 'Pink'), blanco: T('Blanco', 'White') };
    var sw = D.ORDEN_COLORES.map(function (k) { var p = D.COLORES[k][tema];
      return '<button type="button" class="cs-sw' + (e.color === k ? ' on' : '') + '" data-col="' + k + '" aria-label="' + NOM[k] + '" aria-pressed="' + (e.color === k) + '" style="--swp:' + (p.papel2 ? 'linear-gradient(135deg,' + p.papel + ',' + p.papel2 + ')' : p.papel) + ';--swt:' + p.tinta + '"><b>A</b></button>'; }).join('');
    var seg = function (campo, opts) { return '<div class="cs-seg">' + opts.map(function (o) { return '<button type="button" data-' + campo + '="' + o[0] + '" class="' + (e[campo] === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>'; };
    return '<details class="cs-asp"' + (S && S.aspAbierto ? ' open' : '') + '><summary>🎨 ' + T('Color y forma', 'Colour & shape') + '</summary>' +
      '<div class="cs-sws">' + sw + '</div>' +
      seg('tema', [['auto', T('Auto', 'Auto')], ['dia', '☀ ' + T('Día', 'Day')], ['noche', '☾ ' + T('Noche', 'Night')]]) +
      seg('forma', [['postit', 'Post-it'], ['tarjeta', T('Tarjeta', 'Card')], ['etiqueta', T('Etiqueta', 'Tag')]]) +
      '</details>';
  }
  function ponEstilo(cambio) {
    var e = estilo(); Object.keys(cambio).forEach(function (k) { e[k] = cambio[k]; });
    guarda(K_ESTILO, e); if (S) S.aspAbierto = true; render();
  }
  /* Lo que se teclea se queda en MAYÚSCULAS y sólo con letras y cifras, y el
     cursor se queda donde estaba (contado sobre lo limpio). No se repinta la
     hoja: un innerHTML a cada letra cerraría el teclado del sistema. Sólo se
     tocan los trozos que dependen de lo escrito — la sugerencia, la ruta y el
     «del roster» del vuelo, que cambian al escribir otro número. */
  function escribeCampo(inp) {
    if (!S) return;
    var campo = inp.dataset.c, crudo = inp.value || '', pos = inp.selectionStart == null ? crudo.length : inp.selectionStart;
    var v = limpia(crudo, campo === 'cs' ? MAX_CS : MAX_FL), cur = Math.min(limpia(crudo.slice(0, pos), 99).length, v.length);
    if (v !== crudo) { inp.value = v; try { inp.setSelectionRange(cur, cur); } catch (e) {} }
    ponValor(campo, v);
    var ov = document.getElementById('cs-ov'); if (!ov) return;
    if (campo === 'cs') {
      S.h.conf = !!v;   // escrito por él: es suyo, no una sugerencia
      var w = ov.querySelector('.cs-ref-w'); if (w) w.innerHTML = '';
      var f = inp.closest('.cs-fila'); if (f) f.classList.remove('sug');
    } else {
      var rt = ov.querySelector('.cs-rt'); if (rt) rt.innerHTML = rutaHtml(S.h);
      var de = ov.querySelector('.cs-de-w'); if (de) de.innerHTML = deRoster(S.h);
    }
    pintaPostit(); if (!_pipVivo) programaClip();
    var a = ov.querySelector('a.cs-safari'); if (a) a.setAttribute('href', urlSafari());
  }
  function onClick(e) {
    if (e.target.closest('a[data-a="safari"]')) { if (S) guardaHoja(); return; }   // el enlace sigue su curso
    var b = e.target.closest('button');
    if (!b || !S) return;
    if (b.dataset.col) return ponEstilo({ color: b.dataset.col });
    if (b.dataset.tema) return ponEstilo({ tema: b.dataset.tema });
    if (b.dataset.forma) return ponEstilo({ forma: b.dataset.forma });
    var a = b.dataset.a;
    if (a === 'cerrar') return cierra();
    if (a === 'confirmar') { S.h.conf = true; render(); return; }
    if (a === 'wch+' || a === 'wch-') {
      var wk = b.dataset.w, n = wchN(S.h, wk) + (a === 'wch+' ? 1 : -1);
      S.h['wch' + wk] = String(Math.max(0, Math.min(99, n)));
      delete S.h.wch;   // en cuanto hay tipos, el número suelto de antes deja de mandar
      render(); pintaPostit(); return;
    }
    if (a === 'invierte') { var dp = S.h.dep; S.h.dep = S.h.arr || ''; S.h.arr = dp || ''; render(); pintaPostit(); return; }
    if (a === 'guardar') { guardaHoja(); if (_pipVivo) actualizaPip(); cierra(); return; }
    if (a === 'fijar') { guardaHoja(); fija(); return; }
  }
  function guardaHoja() {
    var h = S.h;
    if (soloPrefijo(h.callsign)) { h.callsign = ''; h.conf = false; }
    if (soloPrefijo(h.flight)) h.flight = '';
    aprendePrefijo(h);
    if (h.fuente === 'manual' && h.callsign) h.conf = true;
    if (h.conf && h.callsign) confirma(h);
    else { guarda(K_HOY, h); pinta(); }
  }

  // ═══ La ventana flotante (Picture-in-Picture) ════════════════════════════
  var _cv = null, _video = null, _pipVivo = false, _tic = null;
  /* La PWA de iOS (abierta desde el icono): ahí WebKit contesta NotSupportedError
     a la ventana flotante (bug 303885). En Safari sí funciona — medido en el
     iPhone del piloto el 12-oct-2026 con /pip/. `navigator.standalone` sólo
     existe en iOS, así que una PWA de Android no cae aquí. */
  function pwaIos() { return navigator.standalone === true; }
  /* Un enlace de verdad que pulsa el piloto, a un esquema del sistema: lo que
     funciona en la PWA de iOS (ver «Calendario: qué se puede y qué no»).
     `x-safari-https://` abre Safari desde iOS 17. Todo lo que el post-it
     necesita va en la URL: esa página no tiene sesión. */
  function urlSafari() {
    var d = datosPintar(), e = estilo(), q = [];
    var par = { cs: d.cs, fl: d.fl, c: d.cs && !d.conf ? '0' : '1', l: en() ? 'en' : 'es', dep: d.dep, arr: d.arr, sd: d.std, sa: d.sta, suf: d.suf,
      cpt: d.cpt, fo: d.fo, pax: d.pax, wr: d.wchR, ws: d.wchS, wc: d.wchC, wch: d.wchR || d.wchS || d.wchC ? '' : d.wch, col: e.color, tema: temaAhora(), forma: e.forma };   // el tema va RESUELTO: Safari no sabe en qué modo está la app
    Object.keys(par).forEach(function (k) { if (par[k] !== '' && par[k] != null) q.push(k + '=' + encodeURIComponent(par[k])); });
    var sec = tramosParaSafari();
    if (sec) q.push('sec=' + encodeURIComponent(sec));
    return 'x-safari-' + location.origin + '/pip/postit.html?' + q.join('&');
  }
  /* La página de Safari no puede leer el roster (es otra app, sin el almacén de la
     PWA): se le pasan el post-it de AHORA y los tramos que vienen, con su hora de
     llegada, y ella elige por el reloj. Sin esto, el post-it de la mañana seguía
     flotando con el 1.er tramo a media tarde. Cada tramo: vuelo · ruta · horas
     como se ven · salida y llegada en minutos UTC · callsign sugerido (sin
     confirmar: es del histórico). El de AHORA va primero, con su llegada. */
  function tramosParaSafari() {
    var h = S ? S.h : estado(), l = proximosVuelos(), out = [], nh = numDe({ flight: h.flight });
    l.forEach(function (it) {
      var e = it.e, fl = limpia(e.flightNum, MAX_FL), r = datosRoster(e), sd = vista(r.std), sa = vista(r.sta);
      var actual = nh && numDe({ flight: fl }) === nh && e.date === h.date;
      var sg = actual ? null : sugerencia(fl);
      out.push([fl, r.dep, r.arr, sd.txt, sa.txt, sd.suf || sa.suf || '', Math.round(it.dep / 6e4), Math.round(it.arr / 6e4), actual ? '=' : (sg ? sg.cs : '')].join('.'));
    });
    return out.length ? out.join('~') : '';
  }
  window.PilotosCallsign.tramos = tramosParaSafari;   // para el banco
  function pipDisponible() {
    var v = document.createElement('video');
    var std = !!(document.pictureInPictureEnabled && v.requestPictureInPicture);
    var wk = typeof v.webkitSupportsPresentationMode === 'function' && v.webkitSupportsPresentationMode('picture-in-picture');
    var cs = !!(document.createElement('canvas').captureStream);
    return (std || wk) && cs && !!mimeClip();
  }
  function estilo() { var D = window.PilotosPostit; return D ? D.estiloDe(lee(K_ESTILO, {})) : { color: 'pilotos', tema: 'auto', forma: 'postit' }; }
  function temaAhora() { var D = window.PilotosPostit; return D ? D.temaDe(estilo()) : 'dia'; }
  function vista(t) { try { if (t && typeof window.pilotosHoraVista === 'function') return window.pilotosHoraVista(t); } catch (e) {} return { txt: t || '', suf: t ? 'z' : '' }; }
  // Lo que se pinta: lo que se está escribiendo con la hoja abierta; si no, lo guardado.
  function datosPintar() {
    var h = S ? S.h : estado();   // estado(), no lo guardado a pelo: lo guardado puede ser el tramo de antes
    var sd = vista(h.std), sa = vista(h.sta);
    return { cs: h.callsign || '', fl: h.flight || '', conf: !!h.conf, dep: h.dep || '', arr: h.arr || '',
      std: sd.txt, sta: sa.txt, suf: sd.suf || sa.suf || '', cpt: h.cpt || '', fo: h.fo || '', pax: h.pax || '', wchR: wchN(h, 'R') || '', wchS: wchN(h, 'S') || '', wchC: wchN(h, 'C') || '', wch: h.wch || '' };
  }
  function pintaPostit() {
    if (!_cv) _cv = document.createElement('canvas');
    if (window.PilotosPostit) window.PilotosPostit.pinta(_cv, datosPintar(), estilo(), { sinConf: T('SIN CONFIRMAR', 'NOT CONFIRMED') });
    var tr = _video && _video.srcObject && _video.srcObject.getVideoTracks && _video.srcObject.getVideoTracks()[0];
    if (tr && tr.requestFrame) { try { tr.requestFrame(); } catch (e) {} }
  }
  /* ⚠ iOS NO deja poner en flotante un vídeo cuya fuente es un MediaStream
     (`canvas.captureStream()`): responde NotSupportedError — medido en un iPhone
     el 12-oct-2026. Sí deja uno con un FICHERO de vídeo. Así que el stream sólo
     sirve para GRABAR: se graba un clip corto del post-it con MediaRecorder, se
     convierte en un blob y ése es el `src` del vídeo que flota. Se graba ANTES
     del toque (al cambiar el contenido), porque iOS exige que la ventana se abra
     dentro del propio toque y una grabación por medio perdería el gesto. */
  var _clip = { url: null, firma: '', grabando: false, pend: false, t: null, paraPip: false };
  function firmaPostit() {
    return JSON.stringify([datosPintar(), estilo(), temaAhora(), en()]);
  }
  function mimeClip() {
    if (typeof MediaRecorder === 'undefined') return null;
    var ms = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < ms.length; i++) { try { if (MediaRecorder.isTypeSupported(ms[i])) return ms[i]; } catch (e) {} }
    return null;
  }
  function estadoBoton() {
    var b = document.querySelector('#cs-ov button.cs-fijar');   // en la PWA de iOS es un enlace a Safari: no se toca
    if (!b || !pipDisponible()) return;
    var listo = !!(_clip.url && _clip.firma === firmaPostit());
    b.disabled = !listo;
    b.textContent = '📌 ' + (listo ? T('Fijar en pantalla', 'Pin on screen') : T('Preparando el post-it…', 'Preparing the note…'));
  }
  function ponClip(v) {
    if (!v || !_clip.url || _pipVivo) return;
    if (v.src !== _clip.url) {
      try { v.srcObject = null; } catch (e) {}
      v.src = _clip.url; v.loop = true; v.muted = true;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }
    _video = v;
    estadoBoton();
  }
  function grabaClip() {
    var mime = mimeClip();
    if (!mime || !_cv || !_cv._stream) return;
    var f = firmaPostit();
    if (_clip.url && _clip.firma === f) { entregaClip(); return; }
    if (_clip.grabando) { _clip.pend = true; return; }
    _clip.grabando = true; _clip.pend = false;
    var trozos = [], rec;
    try { rec = new MediaRecorder(_cv._stream, { mimeType: mime }); } catch (e) { _clip.grabando = false; return; }
    var pinta = setInterval(pintaPostit, 100);      // sin frames nuevos el grabador no escribe nada
    rec.ondataavailable = function (e) { if (e.data && e.data.size) trozos.push(e.data); };
    rec.onstop = function () {
      clearInterval(pinta);
      _clip.grabando = false;
      if (trozos.length) {
        // el clip que está FLOTANDO no se revoca: se le quitaría el vídeo de debajo
        if (_clip.url && !(_video && _video.src === _clip.url)) { try { URL.revokeObjectURL(_clip.url); } catch (e) {} }
        _clip.url = URL.createObjectURL(new Blob(trozos, { type: mime.split(';')[0] }));
        _clip.firma = f;
      }
      if (_clip.pend || firmaPostit() !== f) return programaClip(0);
      entregaClip();
    };
    pintaPostit();
    try { rec.start(); } catch (e) { clearInterval(pinta); _clip.grabando = false; return; }
    setTimeout(function () { try { rec.stop(); } catch (e) {} }, 1200);
  }
  /* Fijado, el vídeo que flota sólo cambia al GUARDAR (o al volver a pulsar
     «Fijar»): mientras se escribe, en la ventana sigue lo último guardado y no
     medio callsign. Se cambia el `src` del MISMO elemento, que no saca la
     ventana de la pantalla — medido en Chromium; en iOS lo dirá el iPad. */
  function entregaClip() {
    var v = _video || document.querySelector('#cs-ov .cs-prev');
    if (!_pipVivo) return ponClip(v);
    if (!_clip.paraPip || !v || !_clip.url) return;
    _clip.paraPip = false;
    if (v.src === _clip.url) return;
    var viejo = v.src;
    v.src = _clip.url; v.loop = true; v.muted = true;
    var p = v.play(); if (p && p.catch) p.catch(function () {});
    if (viejo && viejo.indexOf('blob:') === 0) setTimeout(function () { try { URL.revokeObjectURL(viejo); } catch (e) {} }, 3000);
  }
  function actualizaPip() { _clip.paraPip = true; programaClip(0); }
  function programaClip(ms) { clearTimeout(_clip.t); _clip.t = setTimeout(grabaClip, ms == null ? 350 : ms); }
  function preparaVideo(v) {
    if (!v || !pipDisponible()) return;
    pintaPostit();
    try {
      if (!_cv._stream) _cv._stream = _cv.captureStream(10);
      v.muted = true; v.playsInline = true;
      try { v.autoPictureInPicture = true; } catch (e) {}
      if (pwaIos()) { v.srcObject = _cv._stream; var p0 = v.play(); if (p0 && p0.catch) p0.catch(function () {}); }   // aquí no flota: sólo vista previa
      else if (_clip.url && _clip.firma === firmaPostit()) ponClip(v);
      else {
        v.srcObject = _cv._stream;                 // vista previa en vivo mientras se graba el clip
        var p = v.play(); if (p && p.catch) p.catch(function () {});
        _video = null;
        programaClip();
      }
    } catch (e) { _video = null; }
    estadoBoton();
    clearInterval(_tic); _tic = setInterval(function () { if (_cv && S) pintaPostit(); else { clearInterval(_tic); _tic = null; } }, 1000);
  }
  function aviso(txt) {
    var m = document.querySelector('#cs-ov .cs-pip-msg');
    if (m) m.textContent = txt;
  }
  function fija() {
    if (_pipVivo) { actualizaPip(); aviso(T('✓ Actualizado en la ventana flotante.', '✓ Updated in the floating window.')); return; }
    var v = _video;
    if (!v || !_clip.url || _clip.firma !== firmaPostit()) { aviso(T('Un momento, se está preparando el post-it…', 'One moment, the note is being prepared…')); programaClip(0); return; }
    /* Sin `await` antes: iOS exige que la ventana la abra el propio toque, y una
       espera por medio pierde el gesto. */
    var pr = null;
    try {
      if (v.requestPictureInPicture) pr = v.requestPictureInPicture();
      else if (v.webkitSetPresentationMode) { v.webkitSetPresentationMode('picture-in-picture'); pr = Promise.resolve(); }
    } catch (e) { pr = Promise.reject(e); }
    Promise.resolve(pr).then(function () {
      _pipVivo = true;
      aviso(T('✓ Fijado. Ya puedes cambiar al EFB.', '✓ Pinned. You can switch to the EFB now.'));
    }).catch(function (e) {
      _pipVivo = false;
      aviso(T('El iPad no ha dejado abrir la ventana flotante', 'The iPad did not allow the floating window') + (e && e.name ? ' (' + e.name + ')' : '') + T('. El post-it sigue en el Home.', '. The note stays on the Home.'));
    });
    v.addEventListener('leavepictureinpicture', function () { _pipVivo = false; }, { once: true });
  }
  window.PilotosCallsign.fija = fija;
  window.PilotosCallsign.clipFlotante = function () { return _pipVivo && _video ? _video.src : null; };   // para el banco: lo que está flotando
  window.PilotosCallsign.lienzo = function () { pintaPostit(); return _cv; };   // para el banco: lo que se fija

  // ── Arranque ───────────────────────────────────────────────────────────
  function arranca() {
    var c = document.getElementById('dh-cs-chip');
    if (c && !c._cs) {
      c._cs = 1;
      c.addEventListener('click', abre);
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abre(e); } });
    }
    pinta();
    // Y otra vez cuando la app acaba de arrancar (el roster puede llegar de la nube).
    setTimeout(pinta, 1500); setTimeout(pinta, 5000);
  }
  window.addEventListener('load', function () { pinta(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
  window.addEventListener('pilotos-roster-updated', pinta);
  window.addEventListener('storage', function (e) { if (!e.key || /logbook|callsign/.test(e.key)) pinta(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pinta(); });
  setInterval(function () { if (!document.hidden) pinta(); }, 5 * 60 * 1000);   // el vuelo cambia al aterrizar
})();
