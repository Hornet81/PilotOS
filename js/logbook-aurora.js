/* ═══════════════════════════════════════════════════════════════════════════
   LOGBOOK · «AURORA» — la piel del formulario de vuelo de la compañía

   Elegido por el piloto el 17-nov-2026 entre tres líneas (Aurora · Tarjeta de
   embarque · Cabina). Es una PIEL, no un formulario nuevo: todos los campos
   (#ld_dep, #ld_atd, #ld_role…) siguen siendo los de siempre, con sus manejadores,
   y `ldSave` no se entera de nada. Lo que se añade lee esos campos y escribe en
   ellos por la misma puerta que el teclado (evento input/change):

     · la ficha en la cabecera — cuántos datos faltan, y al tocarla te lleva al
       primero que falta;
     · la tarjeta del avión con su dibujo, la matrícula y el tipo·motor;
     · el ANILLO del vuelo — rodaje, aire y rodaje a su tamaño real, con el block
       en el centro; si falta el IN, el tramo final sale en ámbar a trazos;
     · los cuatro círculos de las columnas EASA (multipiloto, PIC/SIC, IFR, noche);
     · botones segmentados en vez de desplegables para ROL, FUNCIÓN y REGLAS;
     · − y + en despegues y aterrizajes.

   «Otro tipo» lleva la misma piel desde el 17-nov-2026 (montaOtro/pintaOtro,
   más abajo): iconos dibujados, rejilla que se recoge al elegir, anillo,
   segmentados y − y + sobre los mismos campos ldo_*. Su CSS va colgado de
   `.otro-cream`; lo de la compañía, de `:not(.otro-cream)`.

   Por qué un sondeo además de los eventos: el ADS-B, la foto de la MCDU, la
   importación del roster y `ldEditFlight` escriben `.value` SIN disparar eventos.
   Sólo corre con el modal abierto y la página visible, y sólo repinta si ha
   cambiado la firma de los valores.

   Textos: `translate="no"` y L(es,en) — llevan números dentro y el traductor de
   la app casa frases enteras (la lección de roster-stats-viz.js).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function EN() { return window.pilotosLang === 'en'; }
  function L(es, en) { return EN() ? en : es; }
  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value == null ? '' : e.value).trim() : ''; }
  /* Lee SÓLO horas que se pueden leer: «--:--» de eCrews o un hueco no son 00:00. */
  function hm(t) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? (+m[1] * 60 + +m[2]) : null; }
  function dur(a, b) { if (a == null || b == null) return null; var d = b - a; if (d < 0) d += 1440; return d; }
  function fmt(m) { if (m == null || isNaN(m)) return '–:––'; m = Math.round(m); return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function modal() { return $('ld_modal'); }
  function sheet() { var m = modal(); return m && m.querySelector('.ldm-sheet'); }
  function abierto() { var m = modal(); return !!(m && m.classList.contains('open')); }
  function otro() { return !!window._ldOtroMode; }

  /* ── Dibujos ─────────────────────────────────────────────────────────── */
  /* Fotos del avión por tipo (public/img/aviones, generadas con IA el 17-nov-2026;
     el ancho va en proporción al largo real del avión). Un tipo que no está aquí
     —aviación general, otro modelo— se queda con el dibujo. */
  var FOTOS = { a319: 204, a320: 226, a320neo: 226, a321: 268, a321neo: 268 };
  function fotoDe(t) {
    t = String(t || '').toUpperCase().replace(/\s+/g, '');
    /* La familia de motor la decide `ldEsNeo` (index.html), que es quien la
       decide también en las estadísticas de combustible: la misma pregunta con
       dos regex acaba contestando distinto. Sin él —un orden de carga raro— no
       se adivina: se pinta el avión sin distinguir neo. */
    var neo = (typeof window !== 'undefined' && typeof window.ldEsNeo === 'function')
      ? window.ldEsNeo(t) === true : false;
    if (/321/.test(t)) return neo ? 'a321neo' : 'a321';
    if (/320/.test(t)) return neo ? 'a320neo' : 'a320';
    if (/319/.test(t)) return 'a319';
    return null;
  }
  var R = 74, C = 2 * Math.PI * R;

  /* ── Montaje (una vez; idempotente) ──────────────────────────────────── */
  function monta() {
    var sh = sheet(), vf = $('ld-vueling-form');
    if (!sh || !vf) return false;
    sh.classList.add('ldm-aur');

    /* Ficha en la cabecera */
    var hdr = sh.querySelector('.ldm-hdr');
    if (hdr && !$('ldaur-prog')) {
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'ldaur-prog'; b.className = 'ldaur-prog'; b.setAttribute('translate', 'no');
      b.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17" class="ldaur-trk" stroke-width="4" fill="none"/>' +
        '<circle id="ldaur-prog-arc" cx="22" cy="22" r="17" stroke-width="4" fill="none" stroke-linecap="round" transform="rotate(-90 22 22)" stroke-dasharray="0 107"/></svg>' +
        '<span class="ldaur-prog-n" id="ldaur-prog-n">0/10</span><span class="ldaur-prog-t" id="ldaur-prog-t"></span>';
      b.addEventListener('click', irAlQueFalta);
      var close = hdr.querySelector('.ldm-close');
      hdr.insertBefore(b, close || null);
    }

    /* Tarjeta del avión */
    var acSec = vf.querySelector('.ldm-acc-ac');
    if (acSec && !$('ldaur-ac')) {
      var ac = document.createElement('button');
      ac.type = 'button'; ac.id = 'ldaur-ac'; ac.className = 'ldaur-ac'; ac.setAttribute('translate', 'no');
      ac.innerHTML = '<span class="ldaur-ac-glow"></span>' +
        '<img class="ldaur-ac-img" id="ldaur-ac-img" alt="" decoding="async" hidden>' +
        '<span class="ldaur-ac-txt">' +
        '<span class="ldaur-ac-reg" id="ldaur-ac-reg"></span><span class="ldaur-ac-tipo" id="ldaur-ac-tipo"></span></span>' +
        '<span class="ldaur-ac-chip" id="ldaur-ac-chip"></span>';
      ac.addEventListener('click', function () { var r = $('ld_reg'); if (r) { r.focus(); try { r.select(); } catch (e) {} } });
      acSec.parentNode.insertBefore(ac, acSec.nextSibling);
    }

    /* Anillo + círculos EASA, encima de las horas */
    var tSec = vf.querySelector('.ldm-acc-times');
    if (tSec && !$('ldaur-ring')) {
      var w = document.createElement('div');
      w.id = 'ldaur-ring'; w.className = 'ldaur-ring'; w.setAttribute('translate', 'no');
      w.innerHTML =
        '<div class="ldaur-ring-box"><svg viewBox="0 0 200 200" role="img" id="ldaur-ring-svg" aria-label="">' +
        '<defs><linearGradient id="ldaur-gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--la-acc)"/><stop offset="1" stop-color="var(--la-acc2)"/></linearGradient></defs>' +
        '<circle cx="100" cy="100" r="' + R + '" class="ldaur-trk" stroke-width="16" fill="none"/>' +
        '<circle class="ldaur-air-glow" id="ldaur-s-glow" cx="100" cy="100" r="' + R + '" fill="none" stroke-width="28" transform="rotate(-90 100 100)"/>' +
        '<circle id="ldaur-s-out" cx="100" cy="100" r="' + R + '" fill="none" stroke-width="16" stroke-linecap="round" transform="rotate(-90 100 100)" stroke="var(--la-acc)"/>' +
        '<circle id="ldaur-s-air" cx="100" cy="100" r="' + R + '" fill="none" stroke-width="16" stroke-linecap="round" transform="rotate(-90 100 100)" stroke="url(#ldaur-gr)"/>' +
        '<circle id="ldaur-s-in" cx="100" cy="100" r="' + R + '" fill="none" stroke-width="16" stroke-linecap="round" transform="rotate(-90 100 100)"/>' +
        '<circle cx="100" cy="100" r="56" class="ldaur-trk" stroke-width="1" stroke-dasharray="1 6" fill="none"/></svg>' +
        '<div class="ldaur-ring-c"><span class="ldaur-lab">BLOCK</span><span class="ldaur-ring-b" id="ldaur-block">–:––</span>' +
        '<span class="ldaur-ring-f" id="ldaur-flt"></span></div></div>' +
        '<div class="ldaur-ring-leg" id="ldaur-taxi"></div>' +
        '<div class="ldaur-easa" id="ldaur-easa"></div>';
      tSec.parentNode.insertBefore(w, tSec.nextSibling);
    }

    /* Segmentados en vez de desplegables */
    /* CPT/FO grande y el nombre debajo: «Comandante» entero no cabe en media fila. */
    seg('ld_role', [['CPT', function () { return 'CPT'; }, L('comandante', 'captain')], ['FO', function () { return 'FO'; }, L('copiloto', 'first officer')]]);
    seg('ld_func', [['PF', function () { return 'PF'; }, 'pilot flying'], ['PM', function () { return 'PM'; }, 'monitoring']]);
    seg('ld_rules', [['IFR', function () { return 'IFR'; }, L('reglas', 'rules')], ['VFR', function () { return 'VFR'; }, L('reglas', 'rules')]]);

    /* − y + en los contadores */
    ['ld_tod', 'ld_ton', 'ld_ldgd', 'ld_ldgn'].forEach(stepper);
    return true;
  }

  function seg(id, opts, cls) {
    var s = $(id);
    if (!s || s.getAttribute('data-ldaur')) return;
    s.setAttribute('data-ldaur', '1');
    s.classList.add('ldaur-oculto');
    var box = document.createElement('div');
    box.className = 'ldaur-seg' + (cls ? ' ' + cls : ''); box.setAttribute('role', 'radiogroup'); box.setAttribute('translate', 'no');
    box.id = 'ldaur-seg-' + id;
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-v', o[0]);
      b.innerHTML = '<span class="ldaur-seg-t"></span><span class="ldaur-seg-s"></span>';
      b._t = o[1]; b._s = o[2];
      b.addEventListener('click', function () {
        if (s.value === o[0]) return;
        s.value = o[0];
        s.dispatchEvent(new Event('change', { bubbles: true }));
        pinta(true);
      });
      box.appendChild(b);
    });
    s.parentNode.insertBefore(box, s.nextSibling);
  }

  function stepper(id) {
    var inp = $(id);
    if (!inp || inp.getAttribute('data-ldaur')) return;
    inp.setAttribute('data-ldaur', '1');
    var w = document.createElement('div');
    w.className = 'ldaur-step';
    inp.parentNode.insertBefore(w, inp);
    function btn(d, txt, lab) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ldaur-step-b'; b.textContent = txt;
      b.setAttribute('aria-label', lab);
      b.addEventListener('click', function () {
        var v = Math.max(0, Math.min(99, (parseInt(inp.value, 10) || 0) + d));
        inp.value = v;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        pinta(true);
      });
      return b;
    }
    w.appendChild(btn(-1, '−', L('Menos', 'Less')));
    w.appendChild(inp);
    w.appendChild(btn(1, '+', L('Más', 'More')));
  }

  /* ── Lo que falta ────────────────────────────────────────────────────── */
  function faltan() {
    if (otro()) return faltanOtro();
    var l = [];
    function f(ok, es, en, id, tab) { if (!ok) l.push({ t: L(es, en), id: id, tab: tab }); }
    f(!!val('ld_date'), 'fecha', 'date', 'ld_date');
    f(!!val('ld_flight'), 'nº de vuelo', 'flight no.', 'ld_flight');
    f(!!val('ld_dep') && !!val('ld_arr'), 'ruta', 'route', val('ld_dep') ? 'ld_arr' : 'ld_dep');
    f(!!val('ld_reg'), 'matrícula', 'registration', 'ld_reg');
    f(!!val('ld_actype'), 'tipo de avión', 'aircraft type', 'ld_actype');
    f(hm(val('ld_atd')) != null, 'OUT', 'OUT', 'ld_atd');
    f(hm(val('ld_std')) != null, 'OFF', 'OFF', 'ld_std');
    f(hm(val('ld_sta')) != null, 'ON', 'ON', 'ld_sta');
    f(hm(val('ld_ata')) != null, 'IN', 'IN', 'ld_ata');
    f(!!val('ld_cm1') && !!val('ld_cm2'), 'tripulación', 'crew', val('ld_cm1') ? 'ld_cm2' : 'ld_cm1', 'trip');
    return l;
  }
  var TOTAL = 10;
  function total() { return otro() ? (tipoOtro() === 'sim' ? 4 : 8) : TOTAL; }

  function irAlQueFalta() {
    var l = faltan();
    if (!l.length) {
      var s = document.querySelector('#ld_modal .ldm-btn-save');
      if (s) s.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    var x = l[0];
    if (x.tab && typeof window.ldSectionTab === 'function') { try { window.ldSectionTab(x.tab); } catch (e) {} }
    var el = $(x.id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (e) {} }, 320);
  }

  /* ── Pintar ──────────────────────────────────────────────────────────── */
  var _firma = '';
  function firma() {
    return ['ld_date', 'ld_flight', 'ld_dep', 'ld_arr', 'ld_reg', 'ld_actype', 'ld_engine', 'ld_atd', 'ld_std', 'ld_sta', 'ld_ata',
      'ld_block', 'ld_flight_time', 'ld_role', 'ld_func', 'ld_rules', 'ld_night_inp', 'ld_cm1', 'ld_cm2', 'ld_tod', 'ld_ton', 'ld_ldgd', 'ld_ldgn']
      .map(val).join('|') + '|' + (window.pilotosLang || '') + '|' + (otro() ? 1 : 0);
  }
  function arcSet(el, from, len, gap) {
    if (!el) return;
    /* Un arco de largo 0 con remate redondo pinta un PUNTO: se esconde. */
    var l = len == null ? 0 : Math.max(0, len - (gap || 0));
    var op = l > 0.5 ? '' : '0';
    if (el.style.opacity !== op) el.style.opacity = op;
    if (!(l > 0.5)) { setA(el, 'stroke-dasharray', '0 ' + C); return; }
    setA(el, 'stroke-dasharray', l.toFixed(1) + ' ' + C.toFixed(1));
    setA(el, 'stroke-dashoffset', (-from).toFixed(1));
  }

  /* Escribir sólo si cambia: reescribir el mismo HTML o el mismo texto obliga
     al navegador a recalcular estilos y maquetar aunque no cambie nada, y con
     un repintado por letra se notaba al teclear. */
  function setH(el, h) { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } }
  function setT(el, t) { if (el && el.textContent !== t) el.textContent = t; }
  function setA(el, k, v) { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); }

  function pintaFicha() {
    var TOT = total(), l = faltan(), hechos = TOT - l.length;
    var arc = $('ldaur-prog-arc'), n = $('ldaur-prog-n'), t = $('ldaur-prog-t'), pb = $('ldaur-prog');
    setA(arc, 'stroke-dasharray', (hechos / TOT * 106.8).toFixed(1) + ' 107');
    setT(n, hechos + '/' + TOT);
    setT(t, l.length ? L('Falta: ', 'Missing: ') + l.slice(0, 2).map(function (x) { return x.t; }).join(' · ') + (l.length > 2 ? ' +' + (l.length - 2) : '')
      : L('Ficha completa', 'All filled in'));
    if (pb) {
      pb.classList.toggle('ok', !l.length);
      pb.setAttribute('aria-label', l.length ? L('Faltan ' + l.length + ' datos. Ir al primero', l.length + ' missing. Go to the first one') : L('Ficha completa', 'All filled in'));
    }

    return true;
  }

  function pinta(forzar) {
    if (!$('ldaur-ring') && !monta()) return;
    if (otro()) montaOtro();
    var f = otro() ? firmaOtro() : firma();
    if (!forzar && f === _firma) return;
    _firma = f;

    /* Ficha */
    if (!pintaFicha()) return;
    if (otro()) { pintaOtro(); pintaSegs(); return; }

    /* Avión */
    var reg = val('ld_reg'), tipo = val('ld_actype'), eng = $('ld_engine');
    var engTxt = eng && eng.selectedIndex >= 0 && eng.value ? (eng.options[eng.selectedIndex].text || eng.value) : '';
    var rg = $('ldaur-ac-reg'), tp = $('ldaur-ac-tipo'), ch = $('ldaur-ac-chip'), acb = $('ldaur-ac');
    setT(rg, reg || L('Sin matrícula', 'No registration'));
    setT(tp, [tipo, engTxt].filter(Boolean).join(' · ') || L('Toca para escribirla', 'Tap to type it'));
    var conocido = !!(reg && typeof window.ldAcDbGet === 'function' && window.ldAcDbGet(reg));
    if (ch) { ch.textContent = conocido ? L('✓ En tu flota', '✓ In your fleet') : (reg ? L('Matrícula nueva', 'New registration') : ''); ch.className = 'ldaur-ac-chip' + (conocido ? ' ok' : ''); ch.hidden = !reg; }
    var fk = fotoDe(tipo), im = $('ldaur-ac-img');
    if (im) {
      if (fk) {
        var u = 'img/aviones/' + fk + '.webp';
        if (im.getAttribute('src') !== u) { im.src = u; im.style.width = FOTOS[fk] + 'px'; }
        if (im.hidden) im.hidden = false;
      } else if (!im.hidden) im.hidden = true;
      if (acb) acb.classList.toggle('foto', !!fk);
    }
    if (acb) { acb.classList.toggle('falta', !reg); acb.setAttribute('aria-label', L('Matrícula ', 'Registration ') + (reg || '—')); }

    /* Anillo */
    var o = hm(val('ld_atd')), of = hm(val('ld_std')), on = hm(val('ld_sta')), i = hm(val('ld_ata'));
    var tOut = dur(o, of), tAir = dur(of, on), tIn = dur(on, i);
    var blk = hm(val('ld_block')); if (blk == null) blk = dur(o, i);
    var flt = hm(val('ld_flight_time')); if (flt == null) flt = tAir;
    /* Total del dibujo: el block si se sabe; si falta el IN, lo que hay + un hueco
       de 5 min para que el tramo que falta se vea como lo que es: un hueco. */
    var faltaIn = i == null && on != null;
    var tot = blk != null ? blk : ((tOut || 0) + (tAir || 0) + (faltaIn ? 5 : 0)) || null;
    var GAP = 6;
    if (tot) {
      var k = C / tot, p = 0;
      arcSet($('ldaur-s-out'), p, (tOut || 0) * k, GAP); p += (tOut || 0) * k;
      arcSet($('ldaur-s-air'), p, (tAir || 0) * k, GAP); arcSet($('ldaur-s-glow'), p, (tAir || 0) * k, GAP); p += (tAir || 0) * k;
      var si = $('ldaur-s-in');
      if (faltaIn) { arcSet(si, p, 5 * k, GAP); setA(si, 'class', 'falta'); }
      else { arcSet(si, p, (tIn || 0) * k, GAP); setA(si, 'class', ''); }
    } else { ['ldaur-s-out', 'ldaur-s-air', 'ldaur-s-glow', 'ldaur-s-in'].forEach(function (x) { arcSet($(x), 0, 0); }); }
    var bEl = $('ldaur-block'), fEl = $('ldaur-flt'), tx = $('ldaur-taxi'), svg = $('ldaur-ring-svg');
    if (bEl) { setT(bEl, fmt(blk)); bEl.classList.toggle('falta', blk == null); }
    setT(fEl, flt != null ? 'FLIGHT ' + fmt(flt) : (faltaIn ? L('falta la hora IN', 'IN time missing') : ''));
    if (tx) {
      setH(tx,
        '<span><i class="d-out"></i>' + L('rodaje salida', 'taxi out') + ' <b>' + fmt(tOut) + '</b></span>' +
        '<span><i class="d-air"></i>' + L('en el aire', 'airborne') + ' <b>' + fmt(tAir) + '</b></span>' +
        '<span' + (faltaIn ? ' class="falta"' : '') + '><i class="d-in"></i>' + L('rodaje llegada', 'taxi in') + ' <b>' + (faltaIn ? L('falta IN', 'no IN') : fmt(tIn)) + '</b></span>');
    }
    setA(svg, 'aria-label', 'Block ' + fmt(blk) + ', flight ' + fmt(flt));
    ['ld_atd', 'ld_std', 'ld_sta', 'ld_ata'].forEach(function (id) { var e = $(id); if (e) e.classList.toggle('ldaur-falta', hm(e.value) == null); });

    /* EASA */
    var rol = val('ld_role') === 'CPT' ? 'PIC' : 'SIC';
    var ifr = val('ld_rules') !== 'VFR';
    var night = hm(val('ld_night_inp'));
    var B = blk || 0;
    var g = [
      [L('MULTI-PILOTO', 'MULTI-PILOT'), blk, 'acc2'],
      [rol, blk, 'acc'],
      ['IFR', ifr ? blk : 0, 'acc'],
      [L('NOCHE', 'NIGHT'), night || 0, 'amb']
    ];
    var ea = $('ldaur-easa');
    setH(ea, g.map(function (x) {
      var v = x[1], fr = B && v ? Math.min(1, v / B) : 0, d = (fr * 175.9).toFixed(1);
      var vacio = !(v > 0);
      return '<div class="ldaur-g"><div class="ldaur-g-c"><svg viewBox="0 0 68 68" aria-hidden="true"><circle cx="34" cy="34" r="28" class="ldaur-trk" stroke-width="6" fill="none"/>' +
        (fr > 0 ? '<circle cx="34" cy="34" r="28" fill="none" stroke="var(--la-' + x[2] + ')" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + d + ' 176" transform="rotate(-90 34 34)"/>' : '') + '</svg>' +
        '<span class="ldaur-g-v' + (vacio ? ' vacio' : '') + '">' + (v == null ? '–:––' : fmt(v)) + '</span></div><span class="ldaur-g-l">' + esc(x[0]) + '</span></div>';
    }).join(''));

    pintaSegs();
  }

  function pintaSegs() {
    document.querySelectorAll('#ld_modal .ldaur-seg').forEach(function (box) {
      var s = $(box.id.replace('ldaur-seg-', ''));
      box.querySelectorAll('button').forEach(function (b) {
        var on = s && s.value === b.getAttribute('data-v');
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
        setT(b.querySelector('.ldaur-seg-t'), b._t());
        setT(b.querySelector('.ldaur-seg-s'), b._s);
      });
    });
  }


  /* ═════ «OTRO TIPO» (17-nov-2026) ═══════════════════════════════════════
     Misma piel sobre el formulario de ldOtroRender. Los ids ldo_* y su guardado
     no cambian. ldOtroRender rehace #ldo-detail con innerHTML cada vez que se
     elige un tipo: por eso montaOtro() es idempotente y corre en cada pinta. */
  function tipoOtro() {
    var c = document.querySelector('#ldo-act .ldo-chip.on');
    return c ? c.getAttribute('data-k') : '';
  }
  var RO = 50, CO = 2 * Math.PI * RO;
  function montaOtro() {
    var act = $('ldo-act');
    if (act) {
      /* Los iconos son los de siempre (emoji o imagen de LDO_ACTS): no se tocan. */
      if (!act.querySelector('.ldaur-o-cambia')) {
        var cb = document.createElement('button');
        cb.type = 'button'; cb.className = 'ldaur-o-cambia'; cb.setAttribute('translate', 'no');
        cb.textContent = L('Cambiar', 'Change');
        cb.addEventListener('click', function (e) { e.stopPropagation(); act.classList.add('ldaur-abre'); });
        act.appendChild(cb);
        /* Elegir un tipo vuelve a recoger la rejilla. */
        act.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.ldo-chip')) act.classList.remove('ldaur-abre'); }, true);
      }
    }
    var sh = sheet(), k = tipoOtro();
    if (sh) sh.classList.toggle('ldaur-o-tipo', !!k && k !== 'opening');

    var out = $('ldo_out');
    if (out && !$('ldaurO-ring')) {
      var grid = out.closest('.ldo-g2');
      if (grid) {
        var w = document.createElement('div');
        w.id = 'ldaurO-ring'; w.className = 'ldaur-ro'; w.setAttribute('translate', 'no');
        w.innerHTML = '<div class="ldaur-ro-box"><svg viewBox="0 0 120 120" role="img" id="ldaurO-svg" aria-label="">' +
          '<defs><linearGradient id="ldaurO-gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--la-acc)"/><stop offset="1" stop-color="var(--la-acc2)"/></linearGradient></defs>' +
          '<circle cx="60" cy="60" r="' + RO + '" class="ldaur-trk" stroke-width="11" fill="none"/>' +
          '<circle id="ldaurO-out" cx="60" cy="60" r="' + RO + '" fill="none" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)" stroke="var(--la-acc)"/>' +
          '<circle id="ldaurO-air" cx="60" cy="60" r="' + RO + '" fill="none" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)" stroke="url(#ldaurO-gr)"/>' +
          '<circle id="ldaurO-in" class="ldaur-ro-in" cx="60" cy="60" r="' + RO + '" fill="none" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)" stroke="var(--la-acc)"/></svg>' +
          '<div class="ldaur-ro-c"><span class="ldaur-ro-b" id="ldaurO-block">–:––</span><span class="ldaur-lab">BLOCK</span></div></div>' +
          '<div class="ldaur-ro-leg" id="ldaurO-leg"></div>';
        grid.parentNode.insertBefore(w, grid);
      }
    }
    seg('ldo_func', [
      ['PIC', function () { return 'PIC'; }, ''], ['Copiloto', function () { return L('Copiloto', 'Co-pilot'); }, ''],
      ['Dual', function () { return 'Dual'; }, ''], ['Instructor', function () { return 'Instructor'; }, ''],
      ['PICUS', function () { return 'PICUS'; }, ''], ['SPIC', function () { return 'SPIC'; }, '']], 'ldaur-seg-o w6');
    seg('ldo_ifr', [['VFR', function () { return 'VFR'; }, ''], ['IFR', function () { return 'IFR'; }, '']], 'ldaur-seg-o');
    seg('ldo_smp', [['SP', function () { return 'SP'; }, L('monopiloto', 'single-pilot')], ['MP', function () { return 'MP'; }, L('multipiloto', 'multi-pilot')]], 'ldaur-seg-o');
    seg('ldo_sme', [['SE', function () { return 'SE'; }, L('monomotor', 'single-engine')], ['ME', function () { return 'ME'; }, L('multimotor', 'multi-engine')]], 'ldaur-seg-o');
    ['ldo_tod', 'ldo_ton', 'ldo_ldgd', 'ldo_ldgn'].forEach(stepper);
  }
  function faltanOtro() {
    var l = [], k = tipoOtro();
    if (!k || k === 'opening') return l;
    function f(ok, es, en, id) { if (!ok) l.push({ t: L(es, en), id: id }); }
    f(!!val('ldo_date'), 'fecha', 'date', 'ldo_date');
    if (k !== 'sim') f(!!val('ldo_dep') && !!val('ldo_arr'), 'ruta', 'route', val('ldo_dep') ? 'ldo_arr' : 'ldo_dep');
    f(!!val('ldo_type'), k === 'sim' ? 'dispositivo' : 'avión', k === 'sim' ? 'device' : 'aircraft', 'ldo_type');
    if (k !== 'sim') f(!!val('ldo_reg'), 'matrícula', 'registration', 'ldo_reg');
    f(hm(val('ldo_out')) != null, 'OUT', 'OUT', 'ldo_out');
    if (k !== 'sim') { f(hm(val('ldo_off')) != null, 'OFF', 'OFF', 'ldo_off'); f(hm(val('ldo_on')) != null, 'ON', 'ON', 'ldo_on'); }
    f(hm(val('ldo_in')) != null, 'IN', 'IN', 'ldo_in');
    return l;
  }
  function firmaOtro() {
    return ['ldo_date', 'ldo_dep', 'ldo_arr', 'ldo_type', 'ldo_reg', 'ldo_out', 'ldo_off', 'ldo_on', 'ldo_in', 'ldo_block', 'ldo_ft',
      'ldo_night', 'ldo_func', 'ldo_ifr', 'ldo_smp', 'ldo_sme', 'ldo_tod', 'ldo_ton', 'ldo_ldgd', 'ldo_ldgn'].map(val).join('|') +
      '|' + tipoOtro() + '|' + (window.pilotosLang || '') + '|otro|' + (!!$('ldaurO-ring'));
  }
  function arcO(el, from, len, gap) {
    if (!el) return;
    var l = len == null ? 0 : Math.max(0, len - (gap || 0));
    var op = l > 0.5 ? '' : '0';
    if (el.style.opacity !== op) el.style.opacity = op;
    if (!(l > 0.5)) { setA(el, 'stroke-dasharray', '0 ' + CO.toFixed(1)); return; }
    setA(el, 'stroke-dasharray', l.toFixed(1) + ' ' + CO.toFixed(1));
    setA(el, 'stroke-dashoffset', (-from).toFixed(1));
  }
  function pintaOtro() {
    if (!$('ldaurO-ring')) return;
    var o = hm(val('ldo_out')), of = hm(val('ldo_off')), on = hm(val('ldo_on')), i = hm(val('ldo_in'));
    var tOut = dur(o, of), tAir = dur(of, on), tIn = dur(on, i);
    var blk = hm(val('ldo_block')); if (blk == null) blk = dur(o, i);
    var flt = hm(val('ldo_ft')); if (flt == null) flt = tAir;
    var faltaIn = i == null && on != null;
    var tot = blk != null ? blk : ((tOut || 0) + (tAir || 0) + (faltaIn ? 5 : 0)) || null;
    var GAP = 5, si = $('ldaurO-in');
    /* Sin OFF/ON (un simulador): el block entero va en un solo tramo. */
    if (tot && tAir == null && tOut == null && blk != null) {
      arcO($('ldaurO-out'), 0, 0); arcO($('ldaurO-in'), 0, 0); arcO($('ldaurO-air'), 0, CO, GAP);
    } else if (tot) {
      var k = CO / tot, p = 0;
      arcO($('ldaurO-out'), p, (tOut || 0) * k, GAP); p += (tOut || 0) * k;
      arcO($('ldaurO-air'), p, (tAir || 0) * k, GAP); p += (tAir || 0) * k;
      if (faltaIn) { arcO(si, p, 5 * k, GAP); setA(si, 'class', 'ldaur-ro-in falta'); }
      else { arcO(si, p, (tIn || 0) * k, GAP); setA(si, 'class', 'ldaur-ro-in'); }
    } else { ['ldaurO-out', 'ldaurO-air', 'ldaurO-in'].forEach(function (x) { arcO($(x), 0, 0); }); }
    var bEl = $('ldaurO-block');
    if (bEl) { setT(bEl, fmt(blk)); bEl.classList.toggle('falta', blk == null); }
    var night = hm(val('ldo_night'));
    setH($('ldaurO-leg'),
      '<span><em>' + L('Rodaje', 'Taxi') + '</em><b>' + fmt(tOut == null && tIn == null ? null : (tOut || 0) + (tIn || 0)) + '</b></span>' +
      '<span class="air"><em>' + L('En el aire', 'Airborne') + '</em><b>' + fmt(flt) + '</b></span>' +
      '<span><em>' + L('Noche', 'Night') + '</em><b>' + fmt(night == null ? 0 : night) + '</b></span>' +
      (faltaIn ? '<span class="falta"><em>' + L('Falta', 'Missing') + '</em><b>IN</b></span>' : ''));
    setA($('ldaurO-svg'), 'aria-label', 'Block ' + fmt(blk) + ', flight ' + fmt(flt));
    ['ldo_out', 'ldo_off', 'ldo_on', 'ldo_in'].forEach(function (id) { var e = $(id); if (e) e.classList.toggle('ldaur-falta', hm(e.value) == null); });
  }

  /* ── Enganches ───────────────────────────────────────────────────────── */
  var _raf = 0;
  function pronto() {
    if (_raf) return;
    _raf = requestAnimationFrame(function () { _raf = 0; pinta(false); });
  }
  var _poll = null;
  function vigila() {
    if (_poll) return;
    _poll = setInterval(function () {
      if (!abierto()) { clearInterval(_poll); _poll = null; return; }
      if (document.hidden) return;
      pinta(false);
    }, 700);
  }
  function arranca() {
    monta();
    var m = modal();
    if (!m) return;
    /* Un repintado por fotograma como mucho: teclear una hora dispara un input
       por letra y cada repintado reescribe el anillo y los círculos EASA. */
    m.addEventListener('input', pronto, true);
    m.addEventListener('change', pronto, true);
    /* El modal se abre añadiendo `.open`: se mira esa clase en vez de envolver
       ldOpenModal / ldEditFlight, que se llaman desde muchos sitios. */
    new MutationObserver(function () {
      if (abierto()) { monta(); pinta(true); vigila(); }
    }).observe(m, { attributes: true, attributeFilter: ['class'] });
    if (abierto()) { pinta(true); vigila(); }
    /* ldOtroRender rehace el formulario «Otro» sin eventos: se mira el DOM. */
    var of = $('ld-otro-form');
    if (of) new MutationObserver(function () { if (otro()) pronto(); }).observe(of, { childList: true, subtree: true });
  }
  window.ldAurPinta = function () { pinta(true); };
  window.ldAurFaltan = faltan;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca);
  else arranca();
})();
